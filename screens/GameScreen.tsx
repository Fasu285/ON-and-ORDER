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

  const isOnline = config.mode === GameMode.ONLINE;
  const isHost = config.role === 'HOST';

  // Initial state setup with stored session recovery
  const [gameState, setGameState] = useState<GameState>(() => {
    const saved = getActiveSession();
    if (saved && saved.config.mode === config.mode && saved.phase !== GamePhase.GAME_OVER) return saved;
    
    // Guest must start in SETUP_P2 to allow secret input via isMyTurn logic
    const initialPhase = isOnline && !isHost ? GamePhase.SETUP_P2 : GamePhase.SETUP_P1;

    return {
      matchId: config.matchCode || 'match-' + Date.now(),
      config,
      phase: initialPhase,
      player1Secret: '',
      player2Secret: '', 
      player1History: [],
      player2History: [],
      message: `${user.username}, set your secret`,
      winner: null,
      opponentName: config.secondPlayerName || (config.mode === GameMode.SINGLE_PLAYER ? 'CPU' : 'Opponent'),
      timeLeft: config.timeLimit
    };
  });

  const p1Name = isOnline 
    ? (isHost ? user.username : (gameState.opponentName || 'Host'))
    : user.username;

  const p2Name = isOnline
    ? (isHost ? (gameState.opponentName || 'Guest') : user.username)
    : (gameState.opponentName || 'Opponent');

  const isSetup = gameState.phase === GamePhase.SETUP_P1 || gameState.phase === GamePhase.SETUP_P2;
  const isPlayer1Turn = gameState.phase === GamePhase.TURN_P1;
  const isPlayer2Turn = gameState.phase === GamePhase.TURN_P2;

  // Determine if it is the current local user's turn to interact
  const isMyTurn = 
    (gameState.phase === GamePhase.SETUP_P1 && (!isOnline || isHost)) ||
    (gameState.phase === GamePhase.SETUP_P2 && (config.mode === GameMode.TWO_PLAYER || (isOnline && !isHost))) ||
    (isPlayer1Turn && (!isOnline || isHost)) ||
    (isPlayer2Turn && (config.mode === GameMode.TWO_PLAYER || (isOnline && !isHost)));
  
  const currentHistory = isPlayer1Turn ? gameState.player1History : gameState.player2History;
  // Timer only runs during active guessing turns after first move or if specific game logic requires it
  const timerActive = (isPlayer1Turn || isPlayer2Turn) && currentHistory.length > 0 && !isAiThinking && gameState.phase !== GamePhase.GAME_OVER;

  // AI Logic for Single Player
  useEffect(() => {
    if (config.mode === GameMode.SINGLE_PLAYER && gameState.phase === GamePhase.TURN_P2 && !gameState.winner) {
      setIsAiThinking(true);
      const thinkTime = 1500 + Math.random() * 2000;
      
      const timeout = setTimeout(() => {
        const aiGuess = generateRandomSecret(config.n);
        processGuess(aiGuess);
        setIsAiThinking(false);
      }, thinkTime);

      return () => clearTimeout(timeout);
    }
  }, [gameState.phase, config.mode, config.n, gameState.winner]);

  // Network Initialization & Identity Exchange
  useEffect(() => {
    if (isOnline && config.matchCode) {
        networkRef.current = new NetworkAdapter(config.matchCode, user.contact, (msg) => {
            handleNetworkMessage(msg);
        });
        networkRef.current.send('IDENTITY_EXCHANGE', { username: user.username });
        return () => networkRef.current?.cleanup();
    }
  }, [isOnline, config.matchCode, user.contact, user.username]);

  const handleNetworkMessage = (msg: any) => {
      const { type, payload } = msg;
      setGameState(prev => {
          if (type === 'IDENTITY_EXCHANGE') {
              return { ...prev, opponentName: payload.username };
          }
          if (type === 'SECRET_SET') {
              const newState = { ...prev };
              if (isHost) newState.player2Secret = payload.secret;
              else newState.player1Secret = payload.secret;
              
              if (newState.player1Secret && newState.player2Secret) {
                  newState.phase = GamePhase.TURN_P1;
                  newState.message = `${p1Name}'s Turn`;
              } else {
                  // Keep message appropriate based on whether local player is ready
                  const localReady = isHost ? !!newState.player1Secret : !!newState.player2Secret;
                  newState.message = localReady ? "Waiting for opponent's secret..." : `${user.username}, set your secret`;
              }
              return newState;
          }
          if (type === 'GUESS_SUBMITTED') {
              const isP1Turn = prev.phase === GamePhase.TURN_P1;
              const historyKey = isP1Turn ? 'player1History' : 'player2History';
              const targetSecret = isP1Turn ? prev.player2Secret : prev.player1Secret;
              
              const result = computeOnAndOrder(targetSecret, payload.guess);
              const guessResult = { ...result, guess: payload.guess, timestamp: new Date().toISOString() };
              
              const newHistory = [...prev[historyKey], guessResult];
              const won = result.order === config.n;
              
              if (won) {
                  const winnerName = isP1Turn ? p1Name : p2Name;
                  return {
                      ...prev,
                      [historyKey]: newHistory,
                      phase: GamePhase.GAME_OVER,
                      winner: winnerName,
                      message: `${winnerName} Wins!`
                  };
              }

              const nextPhase = isP1Turn ? GamePhase.TURN_P2 : GamePhase.TURN_P1;
              const nextName = nextPhase === GamePhase.TURN_P1 ? p1Name : p2Name;

              return {
                  ...prev,
                  [historyKey]: newHistory,
                  phase: nextPhase,
                  message: `${nextName}'s Turn`,
                  timeLeft: config.timeLimit
              };
          }
          return prev;
      });
  };

  useEffect(() => {
    if (gameState.phase !== GamePhase.GAME_OVER) {
      saveActiveSession(gameState);
    }
    if (gameState.phase === GamePhase.GAME_OVER && !showResultModal && !isReviewingHistory && gameState.winner !== null) {
      setShowResultModal(true);
    }
  }, [gameState.phase, gameState.winner, showResultModal, isReviewingHistory]);

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
      if (isOnline) {
          networkRef.current?.send('SECRET_SET', { secret: input });
          if (isHost) newState.player1Secret = input;
          else newState.player2Secret = input;

          if (newState.player1Secret && newState.player2Secret) {
              newState.phase = GamePhase.TURN_P1;
              newState.message = `${p1Name}'s Turn`;
          } else {
              newState.message = "Waiting for opponent...";
          }
      } else {
          if (prev.phase === GamePhase.SETUP_P1) {
            newState.player1Secret = input;
            if (config.mode === GameMode.SINGLE_PLAYER) {
                newState.player2Secret = generateRandomSecret(config.n);
                newState.phase = GamePhase.TURN_P1;
                newState.message = `${p1Name}'s Turn`;
            } else {
                newState.phase = GamePhase.TRANSITION;
                newState.message = `Pass to ${p2Name}`;
            }
          } else if (prev.phase === GamePhase.SETUP_P2) {
              newState.player2Secret = input;
              newState.phase = GamePhase.TURN_P1;
              newState.message = `${p1Name}'s Turn`;
          }
      }
      return newState;
    });
    setInput('');
  };

  const processGuess = (guess: string) => {
    setGameState(prev => {
      const isP1 = prev.phase === GamePhase.TURN_P1;
      const targetSecret = isP1 ? prev.player2Secret : prev.player1Secret;
      const result = computeOnAndOrder(targetSecret, guess);
      const guessResult = { ...result, guess, timestamp: new Date().toISOString() };

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

      const nextPhase = isP1 ? GamePhase.TURN_P2 : GamePhase.TURN_P1;
      const nextPlayerName = nextPhase === GamePhase.TURN_P1 ? p1Name : p2Name;
      
      return {
        ...prev,
        [historyKey]: newHistory,
        phase: nextPhase,
        message: `${nextPlayerName}'s Turn`,
        timeLeft: config.timeLimit
      };
    });
  };

  const submitGuess = () => {
    const valid = validateSequence(input, config.n);
    if (!valid.valid) return alert(valid.error);

    if (isOnline) {
        networkRef.current?.send('GUESS_SUBMITTED', { guess: input });
    }
    
    processGuess(input);
    setInput('');
  };

  const startP2Setup = () => {
    setGameState(prev => ({
      ...prev,
      phase: GamePhase.SETUP_P2,
      message: `${p2Name}, set your secret`
    }));
  };

  const isUserWinner = gameState.winner === user.username;

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden relative">
      {/* Result Modal */}
      {showResultModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className={`bg-white rounded-3xl w-full max-w-sm p-8 text-center space-y-6 shadow-2xl border-4 ${isUserWinner ? 'border-green-400 animate-celebrate' : 'border-red-300 animate-shake'}`}>
            <h1 className={`text-5xl font-black uppercase tracking-tighter ${isUserWinner ? 'text-green-600' : 'text-red-600'}`}>
                {isUserWinner ? 'VICTORY' : 'DEFEAT'}
            </h1>
            <div className="space-y-1">
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Match Result</p>
                <p className="text-2xl font-black text-gray-900 truncate">{gameState.winner}</p>
            </div>
            
            <div className="w-full bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <p className="text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest">Opponent Secret Was</p>
              <p className="text-4xl font-mono font-black text-blue-600 tracking-widest">
                {isOnline ? (isHost ? gameState.player2Secret : gameState.player1Secret) : (config.mode === GameMode.SINGLE_PLAYER ? gameState.player2Secret : (gameState.phase === GamePhase.GAME_OVER ? (gameState.winner === p1Name ? gameState.player2Secret : gameState.player1Secret) : '?'))}
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <Button fullWidth onClick={() => onRestart(config)} variant="primary" className="h-14">PLAY AGAIN</Button>
              <Button fullWidth onClick={() => { setShowResultModal(false); setIsReviewingHistory(true); }} variant="secondary">MATCH RECAP</Button>
              <Button fullWidth onClick={onExit} variant="ghost">MAIN MENU</Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4 shadow-sm z-10 flex-none">
        <div className="flex justify-between items-center mb-1">
          <Button variant="ghost" onClick={onExit} className="!p-0 !min-h-0 text-gray-400 text-xs font-black uppercase tracking-widest hover:text-gray-900">Exit Match</Button>
          <div className="text-[10px] font-black text-gray-400 tracking-widest uppercase bg-gray-50 px-2 py-1 rounded">{config.mode} • {config.n} DIGITS</div>
        </div>
        <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-gray-900 leading-none truncate">{gameState.message}</h2>
            {timerActive && gameState.timeLeft !== undefined && (
                <div className={`ml-auto text-xl font-black tabular-nums ${gameState.timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-orange-500'}`}>
                    :{gameState.timeLeft.toString().padStart(2, '0')}
                </div>
            )}
        </div>
      </div>

      {/* Game Content */}
      <div className="flex-1 flex flex-row overflow-hidden bg-white">
        <div className="flex-1 flex flex-col border-r border-gray-100">
          <div className={`p-2 text-center text-[10px] font-black uppercase tracking-widest border-b ${isPlayer1Turn ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-400'}`}>
            {p1Name}
          </div>
          <MoveHistory history={gameState.player1History} n={config.n} />
        </div>
        <div className="flex-1 flex flex-col bg-gray-50/30">
          <div className={`p-2 text-center text-[10px] font-black uppercase tracking-widest border-b ${isPlayer2Turn ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
            {p2Name}
          </div>
          <MoveHistory history={gameState.player2History} n={config.n} />
        </div>
      </div>

      {/* Transition Screen for Local 2P */}
      {gameState.phase === GamePhase.TRANSITION && (
        <div className="absolute inset-x-0 bottom-0 top-[88px] bg-white/95 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-8 text-center space-y-6 animate-fade-in">
          <div className="text-7xl animate-bounce">📱</div>
          <h3 className="text-3xl font-black uppercase tracking-tighter">Pass the Device</h3>
          <p className="text-gray-500 font-medium max-w-xs">It is now <span className="text-blue-600 font-black">{p2Name}</span>'s turn to set a secret sequence.</p>
          <Button fullWidth onClick={startP2Setup} className="max-w-xs h-14">I AM {p2Name.toUpperCase()}</Button>
        </div>
      )}

      {/* Bottom Control Area */}
      {gameState.phase === GamePhase.GAME_OVER && isReviewingHistory ? (
         <div className="p-4 bg-white border-t border-gray-200 pb-safe flex gap-3 animate-slide-in">
            <Button fullWidth onClick={() => onRestart(config)} variant="primary">NEW MATCH</Button>
            <Button fullWidth onClick={onExit} variant="ghost">EXIT</Button>
         </div>
      ) : !showResultModal && gameState.phase !== GamePhase.TRANSITION && (
        <div className="bg-white border-t border-gray-200 p-2 pb-safe flex-none">
          {isAiThinking ? (
            <div className="h-[280px] flex flex-col items-center justify-center space-y-4 animate-fade-in">
              <div className="flex space-x-2">
                <div className="w-4 h-4 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                <div className="w-4 h-4 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-4 h-4 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
              </div>
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest">CPU is thinking...</p>
            </div>
          ) : (
            <>
              <InputDisplay length={config.n} value={input} isSecret={isSetup} />
              <Keypad 
                onDigitPress={handleDigitPress} 
                onDelete={() => setInput(p => p.slice(0,-1))} 
                onClear={() => setInput('')}
                onSubmit={isSetup ? submitSecret : submitGuess}
                disabledDigits={new Set(input.split(''))}
                disabled={!isMyTurn}
                showSubmit={true}
                canSubmit={input.length === config.n}
                submitLabel={isSetup ? "CONFIRM SECRET" : "SUBMIT GUESS"}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default GameScreen;