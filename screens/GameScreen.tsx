import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameConfig, GameState, GameMode, GuessResult, GamePhase, User } from '../types';
import { validateSequence, computeOnAndOrder, generateRandomSecret } from '../utils/gameLogic';
import { saveActiveSession, getActiveSession, clearActiveSession } from '../utils/storage';
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
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
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
      message: `${user.username}, set your secret`,
      winner: null,
      timeLeft: config.timeLimit
    };
  });

  const isPlayer1Turn = gameState.phase === GamePhase.TURN_P1;
  const isPlayer2Turn = gameState.phase === GamePhase.TURN_P2;
  const currentHistory = isPlayer1Turn ? gameState.player1History : gameState.player2History;
  const timerActive = (isPlayer1Turn || isPlayer2Turn) && currentHistory.length > 0 && !isAiThinking && gameState.phase !== GamePhase.GAME_OVER;

  // Persistence
  useEffect(() => {
    if (gameState.phase !== GamePhase.GAME_OVER) {
      saveActiveSession(gameState);
    }
    if (gameState.phase === GamePhase.GAME_OVER && !showResultModal && !isReviewingHistory && gameState.winner !== null) {
      setShowResultModal(true);
    }
  }, [gameState, showResultModal, isReviewingHistory]);

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
        message: 'Time Up! Pass Device',
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
            player2Secret: generateRandomSecret(config.n, input),
            phase: GamePhase.TURN_P1,
            message: 'Your Turn',
            timeLeft: config.timeLimit
          };
        } else {
          return {
            ...prev,
            player1Secret: input,
            phase: GamePhase.TRANSITION,
            message: 'Pass the device'
          };
        }
      } else if (prev.phase === GamePhase.SETUP_P2) {
        return {
          ...prev,
          player2Secret: input,
          phase: GamePhase.TURN_P1,
          message: 'Player 1 Turn',
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
  }, [config.timeLimit]);

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
        clearActiveSession();
        return {
          ...prev,
          [historyKey]: newHistory,
          phase: GamePhase.GAME_OVER,
          winner: isP1 ? user.username : (config.secondPlayerName || 'Opponent'),
          message: `${isP1 ? user.username : (config.secondPlayerName || 'Opponent')} Wins!`
        };
      }

      const nextPhase = config.mode === GameMode.SINGLE_PLAYER ? GamePhase.TURN_P1 : GamePhase.TRANSITION;
      
      return {
        ...prev,
        [historyKey]: newHistory,
        phase: nextPhase,
        message: config.mode === GameMode.SINGLE_PLAYER ? 'Opponent is thinking...' : 'Pass Device',
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
      // 1. Initial Setup Transition
      if (prev.player2Secret === '') {
        return { ...prev, phase: GamePhase.SETUP_P2, message: 'P2: Set Secret' };
      }
      
      // 2. Mid-game turn swapping logic
      // We decide whose turn it is based on history lengths
      // If history is equal, it's P1's turn to guess (or resume P1's turn)
      // If P1 has more guesses, it's P2's turn.
      const p1Len = prev.player1History.length;
      const p2Len = prev.player2History.length;
      
      const nextTurn = p1Len > p2Len ? GamePhase.TURN_P2 : GamePhase.TURN_P1;
      const playerName = nextTurn === GamePhase.TURN_P1 ? 'Player 1' : (config.secondPlayerName || 'Player 2');

      return { 
        ...prev, 
        phase: nextTurn, 
        message: `${playerName} Turn`, 
        timeLeft: config.timeLimit 
      };
    });
    setInput(''); 
  };

  const isSetup = gameState.phase.startsWith('SETUP');
  const isWinner = gameState.winner === user.username;

  const handlePlayAgain = () => {
    onRestart(config);
  };

  // Helper to find the last guess and result for transition screen
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
      {/* Result Modal Overlay */}
      {showResultModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className={`bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border-4 flex flex-col items-center p-8 text-center space-y-6 ${isWinner ? 'animate-celebrate animate-rainbow' : 'animate-shake border-gray-300 shadow-red-500/20'}`}>
            <div className={isWinner ? 'animate-float' : ''}>
               <div className="text-6xl mb-2">{isWinner ? '🏆' : '💀'}</div>
               <h1 className={`text-4xl font-black tracking-tighter ${isWinner ? 'text-gray-900' : 'text-red-600 uppercase'}`}>
                 {isWinner ? 'BOOM!' : 'CRACKED!'}
               </h1>
            </div>
            
            <div className="space-y-1">
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">{isWinner ? 'Victory for' : 'Defeat by'}</p>
              <p className={`text-3xl font-black truncate max-w-full ${isWinner ? 'text-blue-600' : 'text-gray-900'}`}>
                {gameState.winner}
              </p>
            </div>

            <div className="w-full bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">The Secret Was</p>
              <div className="flex justify-center gap-2">
                {(isWinner ? gameState.player2Secret : gameState.player1Secret).split('').map((char, i) => (
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
                Review History
              </Button>
              <Button fullWidth onClick={onExit} variant="ghost" className="h-10 text-xs font-bold text-gray-400 uppercase tracking-widest">
                Main Menu
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4 shadow-sm z-10 flex-none relative">
        <div className="flex justify-between items-center mb-1">
          <Button variant="ghost" onClick={onExit} className="!p-0 !min-h-0 text-gray-400 text-xs font-black uppercase">Menu</Button>
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
      <div className="flex-1 flex flex-row overflow-hidden relative">
        {gameState.phase === GamePhase.TRANSITION ? (
          <div className="w-full flex flex-col items-center justify-center p-8 text-center bg-blue-600 text-white">
            <h3 className="text-3xl font-black mb-2 uppercase tracking-tight">TURN COMPLETE</h3>
            
            {lastMove && (
               <div className="mb-8 p-4 bg-white/10 rounded-2xl border border-white/20 backdrop-blur-sm">
                  <p className="text-[10px] font-black opacity-60 uppercase tracking-widest mb-1">Last Guess Result</p>
                  <div className="flex items-center justify-center gap-6">
                     <div className="text-center">
                        <div className="text-4xl font-black">{lastMove.guess}</div>
                        <div className="text-[8px] font-bold opacity-50 uppercase">Sequence</div>
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

            <p className="mb-8 font-bold opacity-80 uppercase tracking-widest text-sm">Pass the device to your opponent</p>
            <Button variant="secondary" fullWidth onClick={handleTransition} className="h-16 text-xl">
              I AM {gameState.player1History.length > gameState.player2History.length ? (config.secondPlayerName || 'PLAYER 2') : 'PLAYER 1'}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 flex flex-col border-r border-gray-100">
              <div className="p-2 bg-blue-50/50 text-center text-[8px] font-black text-blue-400 uppercase tracking-widest">P1 Guesses</div>
              <MoveHistory history={gameState.player1History} n={config.n} />
            </div>
            <div className="flex-1 flex flex-col bg-gray-50/30">
              <div className="p-2 bg-gray-100/50 text-center text-[8px] font-black text-gray-400 uppercase tracking-widest">CPU/P2 Guesses</div>
              <MoveHistory history={gameState.player2History} n={config.n} />
            </div>
          </>
        )}
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
            submitLabel={isSetup ? "SET SECRET" : "SUBMIT GUESS"}
          />
        </div>
      )}

      {/* Review History / Game Over state */}
      {(gameState.phase === GamePhase.GAME_OVER || isReviewingHistory) && (
        <div className="p-6 bg-white border-t border-gray-200 flex flex-col gap-3 pb-safe">
          <Button fullWidth onClick={handlePlayAgain} variant="primary" className="h-14 !text-lg shadow-md uppercase tracking-tighter">
            Play Again
          </Button>
          {(gameState.phase === GamePhase.GAME_OVER || isReviewingHistory) && !showResultModal && (
             <Button fullWidth variant="ghost" onClick={() => setShowResultModal(true)} className="text-xs font-black uppercase tracking-widest">View Result Card</Button>
          )}
          <Button fullWidth variant="ghost" onClick={onExit} className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Exit to Menu</Button>
        </div>
      )}
    </div>
  );
};

export default GameScreen;