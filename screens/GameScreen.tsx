import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameConfig, GameState, GameMode, GuessResult, GamePhase, User } from '../types';
import { validateSequence, computeOnAndOrder, generateRandomSecret } from '../utils/gameLogic';
import { saveActiveSession, getActiveSession, clearActiveSession, saveMatchRecord } from '../utils/storage';
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

const getAllPermutations = (n: number): string[] => {
  const results: string[] = [];
  const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

  const backtrack = (current: string) => {
    if (current.length === n) {
      results.push(current);
      return;
    }
    for (const d of digits) {
      if (!current.includes(d)) {
        backtrack(current + d);
      }
    }
  };
  backtrack("");
  return results;
};

const GameScreen: React.FC<GameScreenProps> = ({ config, user, onExit, onRestart }) => {
  const [input, setInput] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [isReviewingHistory, setIsReviewingHistory] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const p1Name = user.username;
  const p2Name = config.secondPlayerName || 'Player 2';
  
  const [gameState, setGameState] = useState<GameState>(() => {
    const saved = getActiveSession();
    if (saved && saved.config.mode === config.mode && saved.phase !== GamePhase.GAME_OVER) return saved;
    
    return {
      matchId: 'match-' + Date.now(),
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
  const currentHistory = isPlayer1Turn ? gameState.player1History : gameState.player2History;
  const timerActive = (isPlayer1Turn || isPlayer2Turn) && currentHistory.length > 0 && !isAiThinking && gameState.phase !== GamePhase.GAME_OVER;

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

  // Auto-skip turn if timer reaches 0
  useEffect(() => {
    if (gameState.timeLeft === 0 && timerActive) {
      handleTimeOut();
    }
  }, [gameState.timeLeft, timerActive]);

  const handleTimeOut = () => {
    setGameState(prev => {
      const isP1 = prev.phase === GamePhase.TURN_P1;
      const nextPhase = prev.config.mode === GameMode.SINGLE_PLAYER ? GamePhase.TURN_P1 : GamePhase.TRANSITION;
      return {
        ...prev,
        phase: nextPhase,
        message: 'Time Up!',
        timeLeft: config.timeLimit
      };
    });
    setInput('');
    if (config.mode === GameMode.SINGLE_PLAYER) {
      triggerAiTurn();
    }
  };

  const handleDigitPress = (digit: string) => {
    if (input.length < config.n && !input.includes(digit)) {
      setInput(prev => prev + digit);
    }
  };

  const submitSecret = () => {
    const valid = validateSequence(input, config.n);
    if (!valid.valid) return alert(valid.error);

    setGameState(prev => {
      if (prev.phase === GamePhase.SETUP_P1) {
        if (config.mode === GameMode.SINGLE_PLAYER) {
          return {
            ...prev,
            player1Secret: input,
            player2Secret: generateRandomSecret(config.n),
            phase: GamePhase.TURN_P1,
            message: `${p1Name}'s Turn`,
            timeLeft: config.timeLimit
          };
        } else {
          return {
            ...prev,
            player1Secret: input,
            phase: GamePhase.TRANSITION,
            message: 'Pass Device'
          };
        }
      } else if (prev.phase === GamePhase.SETUP_P2) {
        return {
          ...prev,
          player2Secret: input,
          phase: GamePhase.TURN_P1,
          message: `${p1Name}'s Turn`,
          timeLeft: config.timeLimit
        };
      }
      return prev;
    });
    setInput('');
  };

  const triggerAiTurn = useCallback(() => {
    setIsAiThinking(true);
    setGameState(prev => ({ ...prev, message: "CPU is thinking..." }));

    setTimeout(() => {
      setGameState(prev => {
        if (prev.phase === GamePhase.GAME_OVER) return prev;

        const n = prev.config.n;
        const history = prev.player2History;
        let aiGuess: string = '';

        if (history.length === 0) {
          aiGuess = n === 4 ? '0123' : (n === 3 ? '012' : '01');
        } else {
          const all = getAllPermutations(n);
          const candidates = all.filter(p => {
            return history.every(move => {
              const sim = computeOnAndOrder(p, move.guess);
              return sim.on === move.on && sim.order === move.order;
            });
          });
          aiGuess = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : generateRandomSecret(n);
        }

        setTimeout(() => {
          setGameState(inner => {
            const result = computeOnAndOrder(inner.player1Secret, aiGuess);
            const guessResult: GuessResult = { ...result, guess: aiGuess, timestamp: new Date().toISOString() };
            const newHistory = [...inner.player2History, guessResult];
            
            let nextPhase = inner.phase;
            let winner = inner.winner;
            let finalMsg = 'Your turn!';

            if (result.order === n) {
              nextPhase = GamePhase.GAME_OVER;
              winner = 'CPU';
              finalMsg = 'DEFEAT!';
              clearActiveSession();
              saveMatchRecord({
                id: inner.matchId,
                timestamp: new Date().toISOString(),
                mode: config.mode,
                n: config.n,
                winner: 'CPU',
                rounds: newHistory.length,
                player1Secret: inner.player1Secret,
                player2Secret: inner.player2Secret,
                player1History: inner.player1History,
                player2History: newHistory
              });
            }

            return {
              ...inner,
              player2History: newHistory,
              phase: nextPhase,
              winner,
              message: finalMsg,
              timeLeft: config.timeLimit
            };
          });
          setIsAiThinking(false);
        }, 800);

        return { ...prev, message: `CPU guessed ${aiGuess}...` };
      });
    }, 1000);
  }, [config.timeLimit, config.mode, config.n]);

  const submitGuess = () => {
    const isP1 = gameState.phase === GamePhase.TURN_P1;
    const targetSecret = isP1 ? gameState.player2Secret : gameState.player1Secret;
    const result = computeOnAndOrder(targetSecret, input);
    const guessResult: GuessResult = { ...result, guess: input, timestamp: new Date().toISOString() };

    setGameState(prev => {
      const historyKey = isP1 ? 'player1History' : 'player2History';
      const newHistory = [...prev[historyKey], guessResult];
      const won = result.order === config.n;
      
      if (won) {
        const currentWinner = isP1 ? p1Name : p2Name;
        clearActiveSession();
        saveMatchRecord({
          id: prev.matchId,
          timestamp: new Date().toISOString(),
          mode: config.mode,
          n: config.n,
          winner: currentWinner,
          rounds: newHistory.length,
          player1Secret: prev.player1Secret,
          player2Secret: prev.player2Secret,
          player1History: isP1 ? newHistory : prev.player1History,
          player2History: !isP1 ? newHistory : prev.player2History,
          opponentName: p2Name
        });
        return {
          ...prev,
          [historyKey]: newHistory,
          phase: GamePhase.GAME_OVER,
          winner: currentWinner,
          message: `${currentWinner} Wins!`
        };
      }

      const nextPhase = config.mode === GameMode.SINGLE_PLAYER ? GamePhase.TURN_P1 : GamePhase.TRANSITION;
      
      return {
        ...prev,
        [historyKey]: newHistory,
        phase: nextPhase,
        message: config.mode === GameMode.SINGLE_PLAYER ? 'CPU is thinking...' : 'Pass Device',
        timeLeft: config.timeLimit
      };
    });
    
    setInput('');

    if (config.mode === GameMode.SINGLE_PLAYER && result.order !== config.n) {
      triggerAiTurn();
    }
  };

  const handleTransition = () => {
    setGameState(prev => {
      if (prev.player2Secret === '') {
        return { ...prev, phase: GamePhase.SETUP_P2, message: `${p2Name}, set your secret` };
      }
      
      const p1Len = prev.player1History.length;
      const p2Len = prev.player2History.length;
      
      // Determine whose turn it is next
      const nextTurn = p1Len > p2Len ? GamePhase.TURN_P2 : GamePhase.TURN_P1;
      const playerName = nextTurn === GamePhase.TURN_P1 ? p1Name : p2Name;

      return { 
        ...prev, 
        phase: nextTurn, 
        message: `${playerName}'s Turn`, 
        timeLeft: config.timeLimit 
      };
    });
    setInput(''); 
  };

  const isSetup = gameState.phase.startsWith('SETUP');
  const isWinnerP1 = gameState.winner === p1Name;
  const is2PMode = config.mode === GameMode.TWO_PLAYER;

  const handlePlayAgain = () => {
    onRestart(config);
  };

  const getLastGuess = () => {
    const p1Len = gameState.player1History.length;
    const p2Len = gameState.player2History.length;
    if (p1Len > p2Len) return gameState.player1History[p1Len - 1];
    if (p2Len > 0) return gameState.player2History[p2Len - 1];
    return null;
  };

  const lastMove = getLastGuess();

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden relative">
      {/* Result Modal Overlay (RECAP) */}
      {showResultModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className={`bg-white rounded-3xl w-full max-sm overflow-hidden shadow-2xl border-4 flex flex-col items-center p-8 text-center space-y-6 ${(isWinnerP1 || is2PMode) ? 'animate-celebrate animate-rainbow border-green-400' : 'animate-shake border-red-300 shadow-red-500/20'}`}>
            <div className={(isWinnerP1 || is2PMode) ? 'animate-float' : ''}>
               <div className="text-6xl mb-2">{(isWinnerP1 || is2PMode) ? '🏆' : '💀'}</div>
               <h1 className={`text-4xl font-black tracking-tighter ${ (isWinnerP1 || is2PMode) ? 'text-green-600' : 'text-red-600 uppercase' }`}>
                 {(isWinnerP1 || is2PMode) ? 'WINNER!' : 'CRACKED!'}
               </h1>
            </div>
            
            <div className="space-y-1">
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">{(isWinnerP1 || is2PMode) ? 'CONGRATULATIONS' : 'DEFEATED BY'}</p>
              <p className={`text-3xl font-black truncate max-w-full ${ (isWinnerP1 || is2PMode) ? 'text-blue-600' : 'text-gray-900'}`}>
                {gameState.winner}
              </p>
            </div>

            <div className="w-full bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">The Secret Was</p>
              <div className="flex justify-center gap-2">
                {(gameState.winner === p1Name ? gameState.player2Secret : gameState.player1Secret).split('').map((char, i) => (
                  <div key={i} className="w-10 h-12 bg-white border-2 border-gray-200 rounded-lg flex items-center justify-center text-2xl font-black text-gray-800 shadow-sm">
                    {char}
                  </div>
                ))}
              </div>
            </div>

            <div className="w-full space-y-3">
              <Button fullWidth onClick={handlePlayAgain} variant="primary" className="h-14 !text-lg shadow-lg">
                PLAY AGAIN
              </Button>
              <Button fullWidth onClick={() => { setShowResultModal(false); setIsReviewingHistory(true); }} variant="secondary" className="h-12 text-sm font-black uppercase tracking-widest">
                REVIEW RECAP
              </Button>
              <Button fullWidth onClick={onExit} variant="ghost" className="h-10 text-xs font-bold text-gray-400 uppercase tracking-widest">
                Main Menu
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Transition Overlay (Popup) */}
      {gameState.phase === GamePhase.TRANSITION && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-blue-600 rounded-3xl w-full max-w-xs p-8 text-center shadow-2xl border-4 border-white/20 text-white animate-slide-in">
            <h3 className="text-3xl font-black mb-2 uppercase tracking-tight">TURN OVER</h3>
            
            {lastMove && (
               <div className="mb-8 p-4 bg-white/10 rounded-2xl border border-white/20">
                  <p className="text-[10px] font-black opacity-60 uppercase tracking-widest mb-1">Result of Guess</p>
                  <div className="flex items-center justify-center gap-6">
                     <div className="text-center">
                        <div className="text-4xl font-black">{lastMove.guess}</div>
                        <div className="text-[8px] font-bold opacity-50 uppercase">Input</div>
                     </div>
                     <div className="w-px h-10 bg-white/20"></div>
                     <div className="flex gap-4">
                        <div className="text-center">
                           <div className="text-2xl font-black">{lastMove.on}</div>
                           <div className="text-[8px] font-bold opacity-50 uppercase">ON</div>
                        </div>
                        <div className="text-center">
                           <div className="text-2xl font-black">{lastMove.order}</div>
                           <div className="text-[8px] font-bold opacity-50 uppercase">ORDER</div>
                        </div>
                     </div>
                  </div>
               </div>
            )}

            <p className="mb-8 font-bold opacity-80 uppercase tracking-widest text-sm">Pass device to your opponent</p>
            <Button variant="secondary" fullWidth onClick={handleTransition} className="h-16 text-xl shadow-lg border-2 border-orange-400">
              I AM {(gameState.player2Secret === '' || gameState.player1History.length > gameState.player2History.length) ? p2Name : p1Name}
            </Button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4 shadow-sm z-10 flex-none relative">
        <div className="flex justify-between items-center mb-1">
          <Button variant="ghost" onClick={onExit} className="!p-0 !min-h-0 text-gray-400 text-xs font-black uppercase">Exit</Button>
          <div className="flex flex-col items-end">
            <div className="text-[10px] font-black text-gray-400 tracking-widest uppercase">
              {config.mode} • {config.n}N
            </div>
            {timerActive && (
              <div className={`text-xs font-black px-2 rounded-full ${gameState.timeLeft! <= 10 ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 text-gray-600'}`}>
                {gameState.timeLeft}S
              </div>
            )}
          </div>
        </div>
        <h2 className={`text-2xl font-black text-gray-900 leading-none transition-opacity ${isAiThinking ? 'opacity-50' : 'opacity-100'}`}>
          {gameState.message}
        </h2>
      </div>

      {/* Game Content */}
      <div className={`flex-1 flex flex-row overflow-hidden relative ${(gameState.phase === GamePhase.TRANSITION || showResultModal) ? 'pointer-events-none grayscale-[0.2] blur-[1px]' : ''}`}>
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
      {gameState.phase !== GamePhase.TRANSITION && gameState.phase !== GamePhase.GAME_OVER && !isReviewingHistory && (
        <div className="bg-white border-t border-gray-200 p-2 pb-safe flex-none">
          <InputDisplay length={config.n} value={input} isSecret={isSetup} />
          <Keypad 
            onDigitPress={handleDigitPress} 
            onDelete={() => setInput(p => p.slice(0,-1))} 
            onClear={() => setInput('')}
            onSubmit={isSetup ? submitSecret : submitGuess}
            disabledDigits={new Set(input.split(''))}
            disabled={isAiThinking}
            showSubmit={true}
            canSubmit={input.length === config.n}
            submitLabel={isSetup ? "CONFIRM SECRET" : "SUBMIT GUESS"}
          />
        </div>
      )}

      {/* Review History / Game Over controls */}
      {(gameState.phase === GamePhase.GAME_OVER || isReviewingHistory) && (
        <div className="p-6 bg-white border-t border-gray-200 flex flex-col gap-3 pb-safe">
          <Button fullWidth onClick={handlePlayAgain} variant="primary" className="h-14 !text-lg shadow-md uppercase tracking-tighter">
            New Match
          </Button>
          {!showResultModal && (
             <Button fullWidth variant="ghost" onClick={() => setShowResultModal(true)} className="text-xs font-black uppercase tracking-widest">VIEW RECAP</Button>
          )}
          <Button fullWidth variant="ghost" onClick={onExit} className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Exit to Menu</Button>
        </div>
      )}
    </div>
  );
};

export default GameScreen;