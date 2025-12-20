import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameConfig, GameState, GameMode, GuessResult, GamePhase, User } from '../types';
import { validateSequence, computeOnAndOrder, generateRandomSecret } from '../utils/gameLogic';
import { saveActiveSession, getActiveSession, clearActiveSession, saveMatchRecord } from '../utils/storage';
import { NetworkAdapter } from '../utils/network';
import Keypad from '../components/Keypad';
import InputDisplay from '../components/InputDisplay';
import MoveHistory from '../components/MoveHistory';
import Button from '../components/Button';

interface GameScreenProps {
  config: GameConfig;
  user: User;
  onExit: () => void;
  onRestart: (config: GameConfig) => void;
}

const GameScreen: React.FC<GameScreenProps> = ({ config, user, onExit, onRestart }) => {
  const [input, setInput] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [isReviewingHistory, setIsReviewingHistory] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const networkRef = useRef<NetworkAdapter | null>(null);

  const p1Name = user.username;
  const p2Name = config.secondPlayerName || 'Opponent';
  
  const [gameState, setGameState] = useState<GameState>(() => {
    const saved = getActiveSession();
    if (saved && saved.config.mode === config.mode && saved.phase !== GamePhase.GAME_OVER) return saved;
    
    return {
      matchId: config.matchCode || 'match-' + Date.now(),
      config,
      phase: GamePhase.SETUP_P1,
      player1Secret: '',
      player2Secret: '', 
      player1History: [],
      player2History: [],
      message: `${p1Name}, set your secret`,
      winner: null,
      timeLeft: config.timeLimit
    };
  });

  const isPlayer1Turn = gameState.phase === GamePhase.TURN_P1;
  const isPlayer2Turn = gameState.phase === GamePhase.TURN_P2;
  const isMyTurn = (config.role === 'HOST' && isPlayer1Turn) || (config.role === 'GUEST' && isPlayer2Turn) || config.mode !== GameMode.ONLINE;
  
  const currentHistory = isPlayer1Turn ? gameState.player1History : gameState.player2History;
  const timerActive = (isPlayer1Turn || isPlayer2Turn) && currentHistory.length > 0 && !isAiThinking && gameState.phase !== GamePhase.GAME_OVER;

  // Network Initialization
  useEffect(() => {
    if (config.mode === GameMode.ONLINE && config.matchCode) {
        networkRef.current = new NetworkAdapter(config.matchCode, user.contact, (msg) => {
            handleNetworkMessage(msg);
        });
        return () => networkRef.current?.cleanup();
    }
  }, [config.mode, config.matchCode, user.contact]);

  const handleNetworkMessage = (msg: any) => {
      const { type, payload } = msg;
      setGameState(prev => {
          if (type === 'SECRET_SET') {
              const newState = { ...prev };
              if (config.role === 'HOST') newState.player2Secret = payload.secret;
              else newState.player1Secret = payload.secret;
              
              if (newState.player1Secret && newState.player2Secret) {
                  newState.phase = GamePhase.TURN_P1;
                  newState.message = `${p1Name}'s Turn`;
              } else {
                  newState.message = "Waiting for your secret...";
              }
              return newState;
          }
          if (type === 'GUESS_SUBMITTED') {
              const isP1 = prev.phase === GamePhase.TURN_P1;
              const historyKey = isP1 ? 'player1History' : 'player2History';
              const result = computeOnAndOrder(isP1 ? prev.player2Secret : prev.player1Secret, payload.guess);
              const guessResult = { ...result, guess: payload.guess, timestamp: new Date().toISOString() };
              
              const newHistory = [...prev[historyKey], guessResult];
              const won = result.order === config.n;
              
              if (won) {
                  return {
                      ...prev,
                      [historyKey]: newHistory,
                      phase: GamePhase.GAME_OVER,
                      winner: isP1 ? p1Name : p2Name,
                      message: `${isP1 ? p1Name : p2Name} Wins!`
                  };
              }

              return {
                  ...prev,
                  [historyKey]: newHistory,
                  phase: isP1 ? GamePhase.TURN_P2 : GamePhase.TURN_P1,
                  message: `${isP1 ? p2Name : p1Name}'s Turn`,
                  timeLeft: config.timeLimit
              };
          }
          return prev;
      });
  };

  // Persistence & Result Trigger
  useEffect(() => {
    if (gameState.phase !== GamePhase.GAME_OVER) {
      saveActiveSession(gameState);
    }
    if (gameState.phase === GamePhase.GAME_OVER && !showResultModal && !isReviewingHistory && gameState.winner !== null) {
      setShowResultModal(true);
    }
  }, [gameState.phase, gameState.winner, showResultModal, isReviewingHistory]);

  // Timer logic
  useEffect(() => {
    if (timerActive) {
      timerRef.current = setInterval(() => {
        setGameState(prev => {
          if (prev.timeLeft !== undefined && prev.timeLeft > 0) {
            return { ...prev, timeLeft: prev.timeLeft - 1 };
          }
          return prev;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerActive]);

  const handleDigitPress = (digit: string) => {
    if (input.length < config.n && !input.includes(digit)) {
      setInput(prev => prev + digit);
    }
  };

  const submitSecret = () => {
    const valid = validateSequence(input, config.n);
    if (!valid.valid) return alert(valid.error);

    setGameState(prev => {
      const newState = { ...prev };
      if (config.mode === GameMode.ONLINE) {
          networkRef.current?.send('SECRET_SET', { secret: input });
          if (config.role === 'HOST') newState.player1Secret = input;
          else newState.player2Secret = input;

          if (newState.player1Secret && newState.player2Secret) {
              newState.phase = GamePhase.TURN_P1;
              newState.message = `${p1Name}'s Turn`;
          } else {
              newState.message = "Waiting for opponent...";
          }
      } else {
          // Local modes
          if (prev.phase === GamePhase.SETUP_P1) {
            if (config.mode === GameMode.SINGLE_PLAYER) {
                newState.player1Secret = input;
                newState.player2Secret = generateRandomSecret(config.n);
                newState.phase = GamePhase.TURN_P1;
                newState.message = `${p1Name}'s Turn`;
            } else {
                newState.player1Secret = input;
                newState.phase = GamePhase.TRANSITION;
            }
          } else {
              newState.player2Secret = input;
              newState.phase = GamePhase.TURN_P1;
          }
      }
      return newState;
    });
    setInput('');
  };

  const submitGuess = () => {
    if (config.mode === GameMode.ONLINE) {
        networkRef.current?.send('GUESS_SUBMITTED', { guess: input });
    }
    
    const isP1 = gameState.phase === GamePhase.TURN_P1;
    const targetSecret = isP1 ? gameState.player2Secret : gameState.player1Secret;
    const result = computeOnAndOrder(targetSecret, input);
    const guessResult = { ...result, guess: input, timestamp: new Date().toISOString() };

    setGameState(prev => {
      const historyKey = isP1 ? 'player1History' : 'player2History';
      const newHistory = [...prev[historyKey], guessResult];
      const won = result.order === config.n;
      
      if (won) {
        const winner = isP1 ? p1Name : p2Name;
        clearActiveSession();
        saveMatchRecord({
          id: prev.matchId,
          timestamp: new Date().toISOString(),
          mode: config.mode,
          n: config.n,
          winner: winner,
          rounds: newHistory.length,
          player1Secret: prev.player1Secret,
          player2Secret: prev.player2Secret,
          player1History: isP1 ? newHistory : prev.player1History,
          player2History: !isP1 ? newHistory : prev.player2History,
        });
        return {
          ...prev,
          [historyKey]: newHistory,
          phase: GamePhase.GAME_OVER,
          winner: winner,
          message: `${winner} Wins!`
        };
      }

      const nextPhase = config.mode === GameMode.ONLINE ? (isP1 ? GamePhase.TURN_P2 : GamePhase.TURN_P1) : 
                       (config.mode === GameMode.SINGLE_PLAYER ? GamePhase.TURN_P1 : GamePhase.TRANSITION);
      
      return {
        ...prev,
        [historyKey]: newHistory,
        phase: nextPhase,
        message: config.mode === GameMode.SINGLE_PLAYER ? 'CPU thinking...' : (nextPhase === GamePhase.TURN_P1 ? `${p1Name}'s Turn` : `${p2Name}'s Turn`),
        timeLeft: config.timeLimit
      };
    });
    setInput('');
  };

  const isSetup = gameState.phase.startsWith('SETUP');

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden relative">
      {/* Result Modal */}
      {showResultModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className={`bg-white rounded-3xl w-full max-sm p-8 text-center space-y-6 shadow-2xl border-4 ${gameState.winner === p1Name ? 'border-green-400' : 'border-red-300'}`}>
            <h1 className="text-4xl font-black uppercase tracking-tighter">
                {gameState.winner === p1Name ? 'VICTORY!' : 'DEFEAT!'}
            </h1>
            <p className="text-2xl font-black text-blue-600 truncate">{gameState.winner}</p>
            <div className="w-full bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <p className="text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest">Secret Was</p>
              <p className="text-4xl font-mono font-black">{gameState.winner === p1Name ? gameState.player2Secret : gameState.player1Secret}</p>
            </div>
            <div className="space-y-3">
              <Button fullWidth onClick={() => onRestart(config)} variant="primary">PLAY AGAIN</Button>
              <Button fullWidth onClick={onExit} variant="ghost">MAIN MENU</Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4 shadow-sm z-10 flex-none">
        <div className="flex justify-between items-center mb-1">
          <Button variant="ghost" onClick={onExit} className="!p-0 !min-h-0 text-gray-400 text-xs font-black uppercase">Exit</Button>
          <div className="text-[10px] font-black text-gray-400 tracking-widest uppercase">{config.mode} • {config.n}N</div>
        </div>
        <h2 className="text-2xl font-black text-gray-900 leading-none">{gameState.message}</h2>
      </div>

      {/* Game Content */}
      <div className="flex-1 flex flex-row overflow-hidden bg-white">
        <div className="flex-1 flex flex-col border-r border-gray-100">
          <div className="p-2 bg-blue-50/50 text-center text-[8px] font-black text-blue-400 uppercase tracking-widest">{p1Name}</div>
          <MoveHistory history={gameState.player1History} n={config.n} />
        </div>
        <div className="flex-1 flex flex-col bg-gray-50/30">
          <div className="p-2 bg-gray-100/50 text-center text-[8px] font-black text-gray-400 uppercase tracking-widest">{p2Name}</div>
          <MoveHistory history={gameState.player2History} n={config.n} />
        </div>
      </div>

      {/* Bottom Area */}
      {!showResultModal && gameState.phase !== GamePhase.TRANSITION && (
        <div className="bg-white border-t border-gray-200 p-2 pb-safe flex-none">
          <InputDisplay length={config.n} value={input} isSecret={isSetup} />
          <Keypad 
            onDigitPress={handleDigitPress} 
            onDelete={() => setInput(p => p.slice(0,-1))} 
            onClear={() => setInput('')}
            onSubmit={isSetup ? submitSecret : submitGuess}
            disabledDigits={new Set(input.split(''))}
            disabled={!isMyTurn || isAiThinking}
            showSubmit={true}
            canSubmit={input.length === config.n}
            submitLabel={isSetup ? "CONFIRM SECRET" : "SUBMIT GUESS"}
          />
        </div>
      )}
    </div>
  );
};

export default GameScreen;