import React, { useState, useEffect, useCallback } from 'react';
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

const GameScreen: React.FC<GameScreenProps> = ({ config, user, onExit }) => {
  const [input, setInput] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  
  const [gameState, setGameState] = useState<GameState>(() => {
    const saved = getActiveSession();
    if (saved && saved.config.mode === config.mode) return saved;
    
    return {
      matchId: 'match-' + Date.now(),
      config,
      phase: GamePhase.SETUP_P1,
      player1Secret: '',
      player2Secret: '', 
      player1History: [],
      player2History: [],
      message: `${user.username}, set your secret`,
      winner: null
    };
  });

  useEffect(() => {
    saveActiveSession(gameState);
    if (gameState.phase === GamePhase.GAME_OVER && !showWinnerModal && gameState.winner !== null) {
      setShowWinnerModal(true);
    }
  }, [gameState, showWinnerModal]);

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
            message: 'Your Turn'
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
          message: 'Player 1 Turn'
        };
      }
      return prev;
    });
    setInput('');
  };

  const triggerAiTurn = useCallback(() => {
    setIsAiThinking(true);
    setGameState(prev => ({ ...prev, message: "CPU is analyzing history..." }));

    setTimeout(() => {
      setGameState(prev => {
        if (prev.phase === GamePhase.GAME_OVER) return prev;

        const n = prev.config.n;
        const history = prev.player2History;
        let candidates: string[] = [];
        let aiGuess: string = '';

        if (history.length === 0) {
          if (n === 4) aiGuess = '0123';
          else if (n === 3) aiGuess = '012';
          else aiGuess = '01';
          candidates = [aiGuess];
        } else {
          const all = getAllPermutations(n);
          candidates = all.filter(p => {
            return history.every(move => {
              const sim = computeOnAndOrder(p, move.guess);
              return sim.on === move.on && sim.order === move.order;
            });
          });

          if (candidates.length > 0) {
            aiGuess = candidates[Math.floor(Math.random() * candidates.length)];
          } else {
            aiGuess = generateRandomSecret(n);
          }
        }

        const displayMsg = `CPU narrowed down to ${candidates.length} options...`;
        
        setTimeout(() => {
          setGameState(inner => {
            const result = computeOnAndOrder(inner.player1Secret, aiGuess);
            const guessResult: GuessResult = { 
              ...result, 
              guess: aiGuess, 
              timestamp: new Date().toISOString() 
            };
            const newHistory = [...inner.player2History, guessResult];
            
            let nextPhase = inner.phase;
            let winner = inner.winner;
            let finalMsg = 'Your turn!';

            if (result.order === n) {
              nextPhase = GamePhase.GAME_OVER;
              winner = 'CPU';
              finalMsg = 'DEFEAT! Computer cracked your code.';
              clearActiveSession();
            }

            return {
              ...inner,
              player2History: newHistory,
              phase: nextPhase,
              winner,
              message: finalMsg
            };
          });
          setIsAiThinking(false);
        }, 800);

        return { ...prev, message: displayMsg };
      });
    }, 1000);
  }, []);

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
          winner: isP1 ? user.username : 'Opponent',
          message: `${isP1 ? user.username : 'Opponent'} Wins!`
        };
      }

      const nextPhase = config.mode === GameMode.SINGLE_PLAYER ? GamePhase.TURN_P1 : (isP1 ? GamePhase.TURN_P2 : GamePhase.TURN_P1);
      
      return {
        ...prev,
        [historyKey]: newHistory,
        phase: nextPhase,
        message: config.mode === GameMode.SINGLE_PLAYER ? 'Opponent is thinking...' : `${nextPhase === GamePhase.TURN_P1 ? 'P1' : 'P2'} Turn`
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
        return { ...prev, phase: GamePhase.SETUP_P2, message: 'P2: Set Secret' };
      }
      return { ...prev, phase: GamePhase.TURN_P1, message: 'Player 1 Turn' };
    });
    setInput(''); 
  };

  const isSetup = gameState.phase.startsWith('SETUP');

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden relative">
      {/* Winner Modal Overlay */}
      {showWinnerModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border-4 animate-celebrate animate-rainbow flex flex-col items-center p-8 text-center space-y-6">
            <div className="animate-float">
               <div className="text-6xl mb-2">🏆</div>
               <h1 className="text-4xl font-black text-gray-900 tracking-tighter">BOOM!</h1>
            </div>
            
            <div className="space-y-1">
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Victory for</p>
              <p className="text-3xl font-black text-blue-600 truncate max-w-full">
                {gameState.winner}
              </p>
            </div>

            <div className="w-full bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Secret Code Revealed</p>
              <div className="flex justify-center gap-2">
                {(gameState.winner === user.username ? gameState.player2Secret : gameState.player1Secret).split('').map((char, i) => (
                  <div key={i} className="w-10 h-12 bg-white border-2 border-blue-100 rounded-lg flex items-center justify-center text-2xl font-black text-gray-800 shadow-sm">
                    {char}
                  </div>
                ))}
              </div>
            </div>

            <div className="w-full space-y-3">
              <Button fullWidth onClick={onExit} variant="primary" className="h-14 !text-lg shadow-lg">
                PLAY AGAIN
              </Button>
              <Button fullWidth onClick={() => setShowWinnerModal(false)} variant="ghost" className="h-10 text-xs font-black uppercase tracking-widest">
                Review History
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border-b border-gray-200 p-4 shadow-sm z-10 flex-none">
        <div className="flex justify-between items-center mb-1">
          <Button variant="ghost" onClick={onExit} className="!p-0 !min-h-0 text-gray-400 text-xs font-black">EXIT</Button>
          <div className="text-[10px] font-black text-gray-400 tracking-widest uppercase">
            {config.mode} • {config.n}N
          </div>
        </div>
        <h2 className={`text-2xl font-black text-gray-900 leading-none transition-opacity ${isAiThinking ? 'opacity-50' : 'opacity-100'}`}>
          {gameState.message}
        </h2>
      </div>

      <div className="flex-1 flex flex-row overflow-hidden relative">
        {gameState.phase === GamePhase.TRANSITION ? (
          <div className="w-full flex flex-col items-center justify-center p-8 text-center bg-blue-600 text-white">
            <h3 className="text-3xl font-black mb-4">PLAYER 2</h3>
            <p className="mb-8 font-bold opacity-80 uppercase tracking-widest">Hand over device now</p>
            <Button variant="secondary" fullWidth onClick={handleTransition}>
              I AM PLAYER 2
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

      {gameState.phase !== GamePhase.TRANSITION && gameState.phase !== GamePhase.GAME_OVER && (
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

      {gameState.phase === GamePhase.GAME_OVER && (
        <div className="p-6 bg-white border-t border-gray-200 flex gap-2">
          <Button fullWidth onClick={onExit}>NEW MATCH</Button>
          {!showWinnerModal && (
             <Button fullWidth variant="secondary" onClick={() => setShowWinnerModal(true)}>VIEW RECAP</Button>
          )}
        </div>
      )}
    </div>
  );
};

export default GameScreen;