import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameConfig, GameState, GameMode, GuessResult, GamePhase, User } from '../types';
import { validateSequence, computeOnAndOrder, generateRandomSecret } from '../utils/gameLogic';
import { saveMatchRecord, saveActiveSession, clearActiveSession, getActiveSession } from '../utils/storage';
import { NetworkAdapter } from '../utils/network';
import Keypad from '../components/Keypad';
import InputDisplay from '../components/InputDisplay';
import MoveHistory from '../components/MoveHistory';
import Button from '../components/Button';

interface GameScreenProps {
  config: GameConfig;
  user: User;
  onExit: () => void;
}

const GameScreen: React.FC<GameScreenProps> = ({ config, user, onExit }) => {
  // --- State ---
  const [input, setInput] = useState('');
  
  const isSinglePlayer = config.mode === GameMode.SINGLE_PLAYER;
  const isOnline = config.mode === GameMode.ONLINE;
  const isHost = config.role === 'HOST';

  // For Online, Host is always Player 1, Guest is Player 2
  const isPlayer1 = !isOnline || isHost; 

  const [gameState, setGameState] = useState<GameState>(() => {
    // Try to load active session if it matches the requested config logic
    const saved = getActiveSession();
    if (saved && saved.matchId && saved.config.mode === config.mode) {
      if (!isOnline || saved.config.matchCode === config.matchCode) {
        return saved;
      }
    }
    
    return {
      matchId: 'match-' + Date.now(),
      config,
      phase: isOnline ? GamePhase.WAITING_FOR_OPPONENT : GamePhase.SETUP_P1,
      player1Secret: '',
      player2Secret: '', 
      player1History: [],
      player2History: [],
      message: isOnline 
        ? (isHost ? `Waiting for opponent... Code: ${config.matchCode}` : 'Connecting to Host...') 
        : `${user.username}, set your secret`,
      winner: null,
      opponentName: isSinglePlayer ? 'CPU' : (config.secondPlayerName || undefined)
    };
  });

  const [isAiThinking, setIsAiThinking] = useState(false);
  
  // Timer State - Use Saved time if available, else Configured Time Limit
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    return gameState.timeLeft ?? gameState.config.timeLimit ?? 30;
  });
  
  // Refs
  const prevPhase = useRef(gameState.phase);
  const prevP1Moves = useRef(gameState.player1History.length);
  const prevP2Moves = useRef(gameState.player2History.length);
  const networkRef = useRef<NetworkAdapter | null>(null);
  const connectionInterval = useRef<any>(null);
  
  // --- Persistence Effect ---
  useEffect(() => {
    saveActiveSession(gameState);
  }, [gameState]);

  // --- Network Setup ---
  useEffect(() => {
    if (isOnline && config.matchCode) {
      const net = new NetworkAdapter(config.matchCode, user.username, (msg: any) => {
         handleNetworkMessage(msg);
      });
      networkRef.current = net;

      // Robust Connection / Handshake Logic
      // Clear any existing interval just in case
      if (connectionInterval.current) clearInterval(connectionInterval.current);

      connectionInterval.current = setInterval(() => {
          // If we are waiting for opponent (Host or Guest)
          if (gameState.phase === GamePhase.WAITING_FOR_OPPONENT) {
             // Guest: Spam PLAYER_JOINED until accepted (Game Started)
             if (!isHost) {
                 net.send('PLAYER_JOINED', { username: user.username });
             }
             // Both: Request Sync to catch up state
             net.send('SYNC_REQUEST', { from: user.username });
          } else {
             // Once game started, stop spamming handshake
             if (connectionInterval.current) {
                 clearInterval(connectionInterval.current);
                 connectionInterval.current = null;
             }
          }
      }, 2000); // Retry every 2 seconds

      return () => {
        if (connectionInterval.current) clearInterval(connectionInterval.current);
        net.cleanup();
      };
    }
  }, [isOnline, config.matchCode, isHost, user.username, gameState.phase]); 

  // --- Timer Logic ---
  const isMyTurn = () => {
    if (gameState.phase === GamePhase.GAME_OVER) return false;
    if (isAiThinking) return false;
    
    if (isOnline) {
      if (isPlayer1 && gameState.phase === GamePhase.TURN_P1) return true;
      if (!isPlayer1 && gameState.phase === GamePhase.TURN_P2) return true;
    } else if (isSinglePlayer) {
      if (gameState.phase === GamePhase.TURN_P1) return true;
    } else {
      // Local 2P
      if (gameState.phase === GamePhase.TURN_P1 || gameState.phase === GamePhase.TURN_P2) return true;
    }
    return false;
  };

  // Reset timer when turn changes
  useEffect(() => {
    const phaseChanged = gameState.phase !== prevPhase.current;
    const movesChanged = gameState.player1History.length !== prevP1Moves.current || 
                         gameState.player2History.length !== prevP2Moves.current;

    if (phaseChanged || movesChanged) {
      setTimeLeft(gameState.config.timeLimit || 30);
    }
    
    prevPhase.current = gameState.phase;
    prevP1Moves.current = gameState.player1History.length;
    prevP2Moves.current = gameState.player2History.length;
  }, [gameState.phase, gameState.player1History.length, gameState.player2History.length, gameState.config.timeLimit]);

  // Countdown
  useEffect(() => {
    const warmupComplete = gameState.player1History.length > 0 && gameState.player2History.length > 0;

    if (!isMyTurn() || !warmupComplete) return;
    
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState.phase, isOnline, isPlayer1, isSinglePlayer, isAiThinking, gameState.player1History.length, gameState.player2History.length]);

  const handleTimeout = () => {
    const myHistory = isPlayer1 ? gameState.player1History : gameState.player2History;
    
    let fallbackGuess = '';
    if (myHistory.length > 0) {
      fallbackGuess = myHistory[myHistory.length - 1].guess;
    } else {
      fallbackGuess = generateRandomSecret(gameState.config.n);
    }
    submitGuess(fallbackGuess);
  };

  const handleNetworkMessage = (msg: any) => {
    if (msg.payload && msg.payload.username === user.username) return; 

    switch (msg.type) {
      case 'SYNC_REQUEST':
        // Only Host needs to respond to Sync Requests generally, but p2p can echo
        if (isHost || gameState.phase !== GamePhase.WAITING_FOR_OPPONENT) {
            networkRef.current?.send('SYNC_RESPONSE', {
                phase: gameState.phase,
                p1Secret: gameState.player1Secret,
                p2Secret: gameState.player2Secret,
                p1History: gameState.player1History,
                p2History: gameState.player2History,
                configN: gameState.config.n,
                configTime: gameState.config.timeLimit,
                opponentName: isHost ? gameState.opponentName : user.username, // Send known opponent name
                hostName: isHost ? user.username : undefined
            });
        }
        break;

      case 'SYNC_RESPONSE':
        setGameState(prev => {
            const remote = msg.payload;
            // If we are Guest and stuck in waiting, and host says game started, jump to it
            if (!isHost && prev.phase === GamePhase.WAITING_FOR_OPPONENT) {
                if (remote.phase !== GamePhase.WAITING_FOR_OPPONENT) {
                    return {
                        ...prev,
                        phase: GamePhase.SETUP_P2, // Default entry for guest
                        config: { 
                            ...prev.config, 
                            n: remote.configN || prev.config.n,
                            timeLimit: remote.configTime || prev.config.timeLimit 
                        },
                        opponentName: remote.hostName || prev.opponentName,
                        message: "Connected! Set your secret."
                    };
                }
            }
            
            // Standard Sync Logic
            const newP1History = remote.p1History?.length > prev.player1History.length ? remote.p1History : prev.player1History;
            const newP2History = remote.p2History?.length > prev.player2History.length ? remote.p2History : prev.player2History;
            
            const newP1Secret = prev.player1Secret || remote.p1Secret;
            const newP2Secret = prev.player2Secret || remote.p2Secret;
            
            let newPhase = prev.phase;
            
            // Allow syncing out of waiting room
            if (prev.phase === GamePhase.WAITING_FOR_OPPONENT && remote.phase !== GamePhase.WAITING_FOR_OPPONENT) {
                 newPhase = isHost ? GamePhase.SETUP_P1 : GamePhase.SETUP_P2;
            } else {
                 // Gameplay sync
                 if (newP1Secret && newP2Secret && prev.phase !== GamePhase.GAME_OVER) {
                    if (newP1History.length === newP2History.length) newPhase = GamePhase.TURN_P1;
                    else newPhase = GamePhase.TURN_P2;
                }
            }
            
            // Determine Message
            let msgText = prev.message;
            if (newPhase === GamePhase.TURN_P1) msgText = isPlayer1 ? "Your Turn!" : "Opponent's Turn";
            if (newPhase === GamePhase.TURN_P2) msgText = !isPlayer1 ? "Your Turn!" : "Opponent's Turn";

            return {
                ...prev,
                player1Secret: newP1Secret,
                player2Secret: newP2Secret,
                player1History: newP1History || [],
                player2History: newP2History || [],
                phase: newPhase,
                config: { 
                    ...prev.config, 
                    n: remote.configN || prev.config.n,
                    timeLimit: remote.configTime || prev.config.timeLimit 
                },
                opponentName: remote.opponentName || (remote.hostName && !isHost ? remote.hostName : prev.opponentName),
                message: msgText
            };
        });
        break;

      case 'PLAYER_JOINED':
        if (isHost && gameState.phase === GamePhase.WAITING_FOR_OPPONENT) {
          // Just update the UI to show opponent is here, DO NOT auto start
          setGameState(prev => ({
            ...prev,
            opponentName: msg.payload.username,
            message: `${msg.payload.username} Joined! Ready to start.`
          }));
        }
        break;
      
      case 'GAME_START_CONFIG':
        if (!isHost && gameState.phase === GamePhase.WAITING_FOR_OPPONENT) {
          setGameState(prev => ({
            ...prev,
            config: { 
                ...prev.config, 
                n: msg.payload.n,
                timeLimit: msg.payload.timeLimit 
            },
            phase: GamePhase.SETUP_P2, 
            message: 'Game Started! Set your secret.',
            opponentName: msg.payload.hostName
          }));
        }
        break;

      case 'SECRET_SET':
        setGameState(prev => {
          const isOpponentP1 = !isPlayer1;
          const newSecret = msg.payload.secret; 
          
          let nextPhase = prev.phase;
          let msgText = prev.message;
          const p1Secret = isPlayer1 ? prev.player1Secret : (isOpponentP1 ? newSecret : prev.player1Secret);
          const p2Secret = !isPlayer1 ? prev.player2Secret : (!isOpponentP1 ? newSecret : prev.player2Secret);

          if (p1Secret && p2Secret) {
            nextPhase = GamePhase.TURN_P1;
            msgText = isPlayer1 ? 'Your Turn!' : 'Opponent\'s Turn';
          } else {
             msgText = isPlayer1 ? 'Waiting for opponent...' : 'Waiting for host...';
          }

          return {
            ...prev,
            player1Secret: p1Secret,
            player2Secret: p2Secret,
            phase: nextPhase,
            message: msgText
          };
        });
        break;

      case 'GUESS_MADE':
        setGameState(prev => {
          const guess = msg.payload.guess;
          const isOpponentP1 = msg.payload.isPlayer1;
          
          const targetSecret = isPlayer1 ? prev.player1Secret : prev.player2Secret; 
          const result = computeOnAndOrder(targetSecret, guess);
          
          const guessResult: GuessResult = {
             guess,
             on: result.on,
             order: result.order,
             timestamp: new Date().toISOString()
          };

          const newHistory = isOpponentP1 
             ? [...prev.player1History, guessResult]
             : [...prev.player2History, guessResult];

          let nextPhase = isOpponentP1 ? GamePhase.TURN_P2 : GamePhase.TURN_P1;
          let winner: string | null = null;
          let msgText = isPlayer1 ? 'Your Turn!' : 'Opponent\'s Turn';

          if (result.on === n && result.order === n) {
             nextPhase = GamePhase.GAME_OVER;
             winner = isPlayer1 ? 'player1' : 'player2';
             msgText = 'You Lost!';
             saveHistory(winner, prev);
             clearActiveSession();
          } else {
             if (isPlayer1) msgText = "Your Turn!"; 
             else msgText = "Opponent's Turn";
          }

          return {
            ...prev,
            player1History: isOpponentP1 ? newHistory : prev.player1History,
            player2History: !isPlayer1 ? newHistory : prev.player2History,
            phase: nextPhase,
            winner: winner,
            message: msgText
          };
        });
        break;
    }
  };

  // --- Host Start Game Action ---
  const handleHostStartGame = () => {
    if (isHost && isOnline) {
        networkRef.current?.send('GAME_START_CONFIG', { 
            n: config.n, 
            timeLimit: config.timeLimit,
            hostName: user.username 
        });
        setGameState(prev => ({
            ...prev,
            phase: GamePhase.SETUP_P1,
            message: "Set your secret code"
        }));
    }
  };

  const saveHistory = (winner: string | null, finalState: GameState) => {
    let winnerStr = "Draw";
    const oppName = finalState.opponentName || "Opponent";

    if (winner === 'player1') winnerStr = isPlayer1 ? "Me" : oppName;
    if (winner === 'player2') winnerStr = !isPlayer1 ? "Me" : oppName; 
    
    if (isSinglePlayer) {
      if (winner === 'player1') winnerStr = "Me";
      else winnerStr = "CPU";
    }

    if (!isOnline && !isSinglePlayer) {
        // Local 2P
        const p2Name = finalState.config.secondPlayerName || "Player 2";
        if (winner === 'player1') winnerStr = user.username;
        else winnerStr = p2Name;
    }

    saveMatchRecord({
      id: finalState.matchId,
      timestamp: new Date().toISOString(),
      mode: config.mode,
      n: config.n,
      winner: winnerStr,
      rounds: Math.max(finalState.player1History.length, finalState.player2History.length)
    });
  };

  // --- Helpers ---
  const n = gameState.config.n || config.n;
  const digitsUsed = new Set(input.split(''));

  const isSetup = gameState.phase === GamePhase.SETUP_P1 || gameState.phase === GamePhase.SETUP_P2;
  
  const canInteract = () => {
    if (gameState.phase === GamePhase.GAME_OVER) return false;
    if (isOnline) {
       if (gameState.phase === GamePhase.WAITING_FOR_OPPONENT) return false;
       if (isPlayer1 && gameState.phase === GamePhase.SETUP_P1) return true;
       if (!isPlayer1 && gameState.phase === GamePhase.SETUP_P2) return true;
       if (isPlayer1 && gameState.phase === GamePhase.TURN_P1) return true;
       if (!isPlayer1 && gameState.phase === GamePhase.TURN_P2) return true;
       return false;
    } else {
       if (isAiThinking) return false;
       return true;
    }
  };

  // --- Handlers ---

  const handleDigitPress = (digit: string) => {
    if (!canInteract()) return;

    if (input.length < n && !digitsUsed.has(digit)) {
      const newInput = input + digit;
      setInput(newInput);
    }
  };

  const handleDelete = () => {
    setInput(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setInput('');
  };

  const submitSecret = (secret: string) => {
    const valid = validateSequence(secret, n);
    if (!valid.valid) {
      alert(valid.error); 
      setInput('');
      return;
    }

    if (isOnline) {
      networkRef.current?.send('SECRET_SET', { secret, isPlayer1 });
      setGameState(prev => ({
        ...prev,
        player1Secret: isPlayer1 ? secret : prev.player1Secret,
        player2Secret: !isPlayer1 ? secret : prev.player2Secret,
        message: 'Waiting for opponent to set secret...',
      }));
    } else {
      setGameState(prev => {
        let nextPhase = prev.phase;
        let msg = prev.message;
        let p2Secret = prev.player2Secret;

        // Determine P2 Name for local transition messages
        const p2Name = prev.config.secondPlayerName || "Player 2";

        if (prev.phase === GamePhase.SETUP_P1) {
          if (isSinglePlayer) {
            nextPhase = GamePhase.TURN_P1;
            msg = 'Game Started! Guess the opponent\'s secret.';
            p2Secret = generateRandomSecret(n, secret);
          } else {
            nextPhase = GamePhase.TRANSITION;
            msg = `Pass device to ${p2Name}`;
          }
          return {
            ...prev,
            player1Secret: secret,
            player2Secret: p2Secret,
            phase: nextPhase,
            message: msg
          };
        } else if (prev.phase === GamePhase.SETUP_P2) {
          return {
            ...prev,
            player2Secret: secret,
            phase: GamePhase.TRANSITION,
            message: `Pass device to ${user.username} to start`
          };
        }
        return prev;
      });
    }
    setInput('');
  };

  const handleTransition = () => {
    setGameState(prev => {
      const p2Name = prev.config.secondPlayerName || "Player 2";

      if (prev.player2Secret === '') {
        return { ...prev, phase: GamePhase.SETUP_P2, message: `${p2Name}: Set your secret code` };
      }
      
      if (prev.phase === GamePhase.TRANSITION && prev.player1History.length === 0 && prev.player2History.length === 0) {
         return { ...prev, phase: GamePhase.TURN_P1, message: `${user.username}: Your Turn` };
      }

      const p1Moves = prev.player1History.length;
      const p2Moves = prev.player2History.length;

      if (p1Moves === p2Moves) {
        return { ...prev, phase: GamePhase.TURN_P1, message: `${user.username}: Your Turn` };
      } else {
        return { ...prev, phase: GamePhase.TURN_P2, message: `${p2Name}: Your Turn` };
      }
    });
    setInput(''); 
  };

  const submitGuess = useCallback((overrideGuess?: string) => {
    const guessToSubmit = overrideGuess || input;

    // Validation
    const validation = validateSequence(guessToSubmit, n);
    if (!validation.valid) {
      if (!overrideGuess) alert(validation.error);
      return;
    }

    if (isOnline) {
       networkRef.current?.send('GUESS_MADE', { guess: guessToSubmit, isPlayer1 });
       setGameState(prev => {
          // Optimistic update
          const targetSecret = isPlayer1 ? prev.player2Secret : prev.player1Secret;
          const result = computeOnAndOrder(targetSecret, guessToSubmit);
          
          const guessResult: GuessResult = {
             guess: guessToSubmit,
             on: result.on,
             order: result.order,
             timestamp: new Date().toISOString()
          };
          const newHistory = isPlayer1 
             ? [...prev.player1History, guessResult]
             : [...prev.player2History, guessResult];
          
          let nextPhase = isPlayer1 ? GamePhase.TURN_P2 : GamePhase.TURN_P1;
          let winner: string | null = null;
          let msgText = "Opponent's Turn";

          if (result.on === n && result.order === n) {
             nextPhase = GamePhase.GAME_OVER;
             winner = isPlayer1 ? 'player1' : 'player2';
             msgText = 'You Won!';
             saveHistory(winner, prev);
             clearActiveSession();
          }

          return {
             ...prev,
             player1History: isPlayer1 ? newHistory : prev.player1History,
             player2History: !isPlayer1 ? newHistory : prev.player2History,
             phase: nextPhase,
             winner: winner,
             message: msgText
          };
       });

    } else {
      setGameState(prev => {
        const isP1 = prev.phase === GamePhase.TURN_P1;
        const targetSecret = isP1 ? prev.player2Secret : prev.player1Secret;
        const result = computeOnAndOrder(targetSecret, guessToSubmit);
        
        const guessResult: GuessResult = {
          guess: guessToSubmit,
          on: result.on,
          order: result.order,
          timestamp: new Date().toISOString()
        };

        const newHistory = isP1 
          ? [...prev.player1History, guessResult]
          : [...prev.player2History, guessResult];

        const p2Name = prev.config.secondPlayerName || "Player 2";

        if (result.on === n && result.order === n) {
          const w = isP1 ? 'player1' : 'player2';
          saveHistory(w, prev);
          clearActiveSession();
          return {
            ...prev,
            player1History: isP1 ? newHistory : prev.player1History,
            player2History: !isP1 ? newHistory : prev.player2History,
            phase: GamePhase.GAME_OVER,
            winner: w,
            message: isP1 
              ? (isSinglePlayer ? 'VICTORY! You cracked the code.' : `${user.username} WINS!`) 
              : `${p2Name} WINS!`
          };
        }

        if (isSinglePlayer) {
          return {
            ...prev,
            player1History: newHistory,
            message: 'Opponent is thinking...'
          };
        } else {
          return {
            ...prev,
            player1History: isP1 ? newHistory : prev.player1History,
            player2History: !isP1 ? newHistory : prev.player2History,
            phase: GamePhase.TRANSITION,
            message: isP1 ? `End of ${user.username}'s Turn` : `End of ${p2Name}'s Turn`
          };
        }
      });
    }

    setInput('');

    if (isSinglePlayer) {
       triggerAiTurn();
    }
  }, [gameState, input, n, isPlayer1, isOnline, isSinglePlayer, user.username]);

  const triggerAiTurn = () => {
    setIsAiThinking(true);
    const delay = 1000 + Math.random() * 1000;
    
    setTimeout(() => {
      setGameState(prev => {
        if (prev.phase === GamePhase.GAME_OVER) return prev;

        const aiGuess = generateRandomSecret(n);
        const result = computeOnAndOrder(prev.player1Secret, aiGuess);
        
        const guessResult: GuessResult = {
          guess: aiGuess,
          on: result.on,
          order: result.order,
          timestamp: new Date().toISOString()
        };

        const newP2History = [...prev.player2History, guessResult];
        
        let nextPhase: GamePhase = prev.phase;
        let winner = prev.winner;
        let msg = 'Your turn!';

        if (result.on === n && result.order === n) {
          nextPhase = GamePhase.GAME_OVER;
          winner = 'player2';
          msg = 'DEFEAT! AI cracked your code.';
          saveHistory('player2', prev);
          clearActiveSession();
        }

        return {
          ...prev,
          player2History: newP2History,
          phase: nextPhase,
          winner: winner,
          message: msg
        };
      });
      setIsAiThinking(false);
    }, delay);
  };

  const handleManualRefresh = () => {
    if (networkRef.current) {
        setGameState(prev => ({ ...prev, message: "Refreshing..." }));
        networkRef.current.send('SYNC_REQUEST', { from: user.username });
        if (!isHost) {
             networkRef.current.send('PLAYER_JOINED', { username: user.username });
        }
    }
  };

  const handleExit = () => {
    clearActiveSession();
    onExit();
  };

  const handlePause = () => {
    const pausedState = { ...gameState, timeLeft };
    saveActiveSession(pausedState);
    onExit();
  };
  
  const handlePlayAgain = () => {
     clearActiveSession();
     setInput('');
     
     if (isOnline) {
       setGameState(prev => ({
          ...prev,
          phase: GamePhase.WAITING_FOR_OPPONENT,
          player1Secret: '',
          player2Secret: '',
          player1History: [],
          player2History: [],
          message: isHost ? `Waiting for opponent... Code: ${config.matchCode}` : 'Connecting to Host...',
          winner: null,
          timeLeft: config.timeLimit,
          opponentName: undefined
       }));
     } else {
       setGameState(prev => ({
          ...prev,
          phase: GamePhase.SETUP_P1,
          player1Secret: '',
          player2Secret: '',
          player1History: [],
          player2History: [],
          message: isSinglePlayer ? `${user.username}, set your secret` : `${user.username}, set your secret`,
          winner: null,
          timeLeft: config.timeLimit
       }));
     }
  };

  // --- Views ---
  
  let currentUser = 1;
  if (isOnline) {
    currentUser = isPlayer1 ? 1 : 2;
  } else {
    if ((gameState.phase === GamePhase.TURN_P2 || gameState.phase === GamePhase.SETUP_P2) && !isSinglePlayer) {
      currentUser = 2;
    }
  }

  const myHistory = currentUser === 1 ? gameState.player1History : gameState.player2History;
  const opponentHistory = currentUser === 1 ? gameState.player2History : gameState.player1History;

  let headerTitle = "GAMEPLAY";
  if (isSetup || gameState.phase === GamePhase.WAITING_FOR_OPPONENT) headerTitle = "SETUP";
  if (gameState.phase === GamePhase.GAME_OVER) headerTitle = "GAME OVER";

  const showMatchCode = isOnline && isHost && (gameState.phase === GamePhase.WAITING_FOR_OPPONENT);
  const showLobby = isOnline && gameState.phase === GamePhase.WAITING_FOR_OPPONENT;

  // Dynamic Names
  let leftLabel = user.username.toUpperCase();
  let rightLabel = "OPPONENT";

  if (isSinglePlayer) {
    rightLabel = "CPU";
  } else if (isOnline) {
    rightLabel = (gameState.opponentName || "OPPONENT").toUpperCase();
  } else {
    // Local 2P
    const p2Name = (config.secondPlayerName || "PLAYER 2").toUpperCase();
    if (currentUser === 1) {
      leftLabel = user.username.toUpperCase();
      rightLabel = p2Name;
    } else {
      leftLabel = p2Name;
      rightLabel = user.username.toUpperCase();
    }
  }

  const isGameOver = gameState.phase === GamePhase.GAME_OVER;
  
  const handleMainAction = () => {
    if (isGameOver || isOnline) {
      handleExit();
    } else {
      handlePause();
    }
  };

  const mainActionLabel = (isGameOver || isOnline) ? "EXIT" : "PAUSE";

  return (
    <div className="flex flex-col h-full bg-gray-50 relative">
      {/* Header - Fixed Height */}
      <div className="bg-white border-b border-gray-200 shadow-sm z-10 relative flex-none">
        <div className="p-3">
           <div className="flex justify-between items-center mb-1">
             <button onClick={handleMainAction} className="text-gray-400 hover:text-gray-900 font-bold text-xs uppercase">
                {mainActionLabel}
             </button>
             <div className="flex items-center gap-2">
                {isOnline && (
                  <button onClick={handleManualRefresh} className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-500 font-bold px-2 py-1 rounded transition-colors uppercase">
                    ↻ REFRESH
                  </button>
                )}
                <div className="text-[10px] font-bold text-gray-400 tracking-widest">
                  {isOnline ? `CODE: ${config.matchCode}` : (isSinglePlayer ? 'VS CPU' : 'LOCAL 2P')}
                </div>
             </div>
           </div>
           
           <div className="flex justify-between items-end">
              <div>
                <h1 className={`text-2xl font-black tracking-tight leading-none ${gameState.phase === GamePhase.GAME_OVER ? 'text-blue-600' : 'text-gray-900'}`}>
                  {headerTitle}
                </h1>
                <p className="text-xs font-medium text-blue-600 min-h-[16px] animate-pulse truncate max-w-[200px]">
                  {gameState.message}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                 {isMyTurn() && (
                   <div className={`text-lg font-black font-mono ${timeLeft <= 10 ? 'text-red-600 animate-pulse' : 'text-gray-900'}`}>
                     00:{timeLeft.toString().padStart(2, '0')}
                   </div>
                 )}
                 <div className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px] font-bold text-gray-500">
                   Turn {(myHistory.length) + 1}
                 </div>
              </div>
           </div>
        </div>
      </div>

      {/* Main Content Area - Split Columns - Flexible Height with min-h-0 for scrolling */}
      <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
        {showLobby ? (
          <div className="w-full flex flex-col items-center justify-center p-6 text-center animate-slide-in">
             {isHost && (
                <>
                    <h2 className="text-gray-500 font-bold mb-4 uppercase tracking-widest text-sm">Room Code</h2>
                    <div className="text-5xl font-black font-mono tracking-widest bg-gray-100 p-4 rounded-xl border-2 border-dashed border-gray-300 mb-8 select-all">
                        {config.matchCode}
                    </div>
                </>
             )}
             
             <h3 className="text-gray-500 font-bold mb-4 uppercase tracking-widest text-xs">Players</h3>
             <div className="w-full max-w-xs space-y-2 mb-8">
                 <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex items-center gap-3">
                     <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                     <span className="font-bold text-blue-900">{isHost ? user.username : (gameState.opponentName || 'Host')}</span>
                     <span className="text-xs ml-auto uppercase text-blue-400 font-bold">HOST</span>
                 </div>
                 <div className={`p-3 rounded-lg border flex items-center gap-3 ${gameState.opponentName || !isHost ? 'bg-orange-50 border-orange-100' : 'bg-gray-50 border-gray-100 border-dashed'}`}>
                     <div className={`w-2 h-2 rounded-full ${gameState.opponentName || !isHost ? 'bg-orange-500' : 'bg-gray-300'}`}></div>
                     <span className={`font-bold ${gameState.opponentName || !isHost ? 'text-orange-900' : 'text-gray-400 italic'}`}>
                        {isHost ? (gameState.opponentName || 'Waiting for guest...') : user.username}
                     </span>
                     {(gameState.opponentName || !isHost) && <span className="text-xs ml-auto uppercase text-orange-400 font-bold">GUEST</span>}
                 </div>
             </div>

             {isHost ? (
                 <Button 
                   onClick={handleHostStartGame} 
                   disabled={!gameState.opponentName}
                   className="w-full max-w-xs h-14"
                 >
                     START GAME
                 </Button>
             ) : (
                 <div className="flex flex-col items-center gap-3">
                     <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                     <p className="text-xs text-gray-400">Waiting for host to start game...</p>
                 </div>
             )}
          </div>
        ) : (
          <>
            {/* Left Column: Current Player */}
            <div className="flex-1 flex flex-col border-r border-gray-200 bg-blue-50/20 min-w-0">
               <div className="text-center py-1 bg-blue-100/50 text-blue-800 text-[10px] font-black uppercase tracking-wider border-b border-blue-100 truncate px-1">
                 {leftLabel}
               </div>
               <MoveHistory history={myHistory} n={n} />
            </div>

            {/* Right Column: Opponent */}
            <div className="flex-1 flex flex-col bg-orange-50/20 min-w-0">
               <div className="text-center py-1 bg-orange-100/50 text-orange-800 text-[10px] font-black uppercase tracking-wider border-b border-orange-100 truncate px-1">
                 {rightLabel}
               </div>
               <MoveHistory history={opponentHistory} n={n} />
            </div>
          </>
        )}
      </div>

      {/* Footer / Input Area - Fixed Height (flex-none) */}
      { !showLobby && (
      <div className="bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] flex-none z-20 pb-safe">
        <div className="p-2">
          {gameState.phase === GamePhase.GAME_OVER && (
            <div className="mb-2 text-center">
               <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Secrets</div>
               <div className="flex justify-center gap-6">
                  <div>
                    <span className="block text-[10px] text-gray-500">{leftLabel}</span>
                    <span className="text-lg font-mono font-bold text-blue-600">{currentUser === 1 ? gameState.player1Secret : gameState.player2Secret}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-gray-500">{rightLabel}</span>
                    <span className="text-lg font-mono font-bold text-orange-600">{currentUser === 1 ? gameState.player2Secret : gameState.player1Secret}</span>
                  </div>
               </div>
            </div>
          )}

          {/* Input Display */}
          {gameState.phase !== GamePhase.GAME_OVER && (
            <div className="scale-90 origin-bottom -mb-2">
              <InputDisplay 
                length={n} 
                value={input} 
                isSecret={false} 
                status="default"
              />
            </div>
          )}
          
          {/* Keypad */}
          {gameState.phase !== GamePhase.GAME_OVER && (
             <div>
               <Keypad 
                 onDigitPress={handleDigitPress}
                 onDelete={handleDelete}
                 onClear={handleClear}
                 onSubmit={isSetup ? () => submitSecret(input) : () => submitGuess()}
                 disabledDigits={digitsUsed}
                 disabled={!canInteract()}
                 showSubmit={true}
                 canSubmit={input.length === n}
                 submitLabel={isSetup ? "SET SECRET" : "SUBMIT GUESS"}
               />
             </div>
          )}

          {gameState.phase === GamePhase.GAME_OVER && (
             <Button fullWidth onClick={handleExit} className="mt-2 h-12">
               EXIT TO MENU
             </Button>
          )}
        </div>
      </div>
      )}

      {/* TRANSITION MODAL OVERLAY (Only Local 2P) */}
      {gameState.phase === GamePhase.TRANSITION && !isOnline && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 animate-slide-in">
           <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center">
              <h2 className="text-2xl font-black text-blue-600 mb-4">NEXT TURN</h2>
               <p className="text-gray-600 font-medium mb-8 text-lg">{gameState.message}</p>
               <Button fullWidth onClick={handleTransition}>
                 I AM READY
               </Button>
           </div>
        </div>
      )}

      {/* GAME OVER MODAL (WINNER POPUP) */}
      {gameState.phase === GamePhase.GAME_OVER && (
         <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6 animate-slide-in">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center relative overflow-hidden">
               {/* Confetti or Status Decor */}
               {(isOnline || isSinglePlayer) && gameState.winner && (
                   <div className={`absolute top-0 left-0 w-full h-2 ${
                       (isPlayer1 && gameState.winner === 'player1') || (!isPlayer1 && gameState.winner === 'player2') 
                       ? 'bg-green-500' : 'bg-red-500'
                   }`}></div>
               )}

               <h2 className="text-3xl font-black mb-2 mt-4 uppercase tracking-tighter">
                   {isSinglePlayer ? (
                       gameState.winner === 'player1' ? <span className="text-green-600 animate-bounce block">VICTORY!</span> : <span className="text-red-600 block">DEFEAT</span>
                   ) : isOnline ? (
                       (isPlayer1 && gameState.winner === 'player1') || (!isPlayer1 && gameState.winner === 'player2')
                       ? <span className="text-green-600 animate-bounce block">YOU WON!</span> 
                       : <span className="text-red-600 block">YOU LOST!</span>
                   ) : (
                       // Local 2P
                       <span className="text-blue-600 animate-bounce block">
                           {gameState.winner === 'player1' ? user.username : (config.secondPlayerName || "PLAYER 2")} WINS!
                       </span>
                   )}
               </h2>

               <p className="text-gray-500 font-medium mb-8">
                   {isSinglePlayer && gameState.winner === 'player1' && "You cracked the code!"}
                   {isSinglePlayer && gameState.winner === 'player2' && "The AI outsmarted you."}
                   {!isSinglePlayer && "Great match!"}
               </p>

               <div className="space-y-3">
                   <Button fullWidth onClick={handlePlayAgain} variant="primary" className="shadow-lg">
                       PLAY AGAIN
                   </Button>
                   <Button fullWidth onClick={handleExit} variant="ghost">
                       EXIT TO MENU
                   </Button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default GameScreen;