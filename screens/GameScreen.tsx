
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameConfig, GameState, GameMode, GuessResult, GamePhase, User } from '../types';
import { validateSequence, computeOnAndOrder, generateRandomSecret } from '../utils/gameLogic';
import { saveMatchRecord, saveActiveSession, clearActiveSession, getActiveSession } from '../utils/storage';
import { db } from '../utils/firebase';
import * as firebaseDatabase from 'firebase/database';
import { syncGameStateNode } from '../utils/network';
import Keypad from '../components/Keypad';
import InputDisplay from '../components/InputDisplay';
import MoveHistory from '../components/MoveHistory';
import Button from '../components/Button';

const { ref, onValue } = firebaseDatabase;

interface GameScreenProps {
  config: GameConfig;
  user: User;
  onExit: () => void;
}

const GameScreen: React.FC<GameScreenProps> = ({ config, user, onExit }) => {
  const [input, setInput] = useState('');
  const isSinglePlayer = config.mode === GameMode.SINGLE_PLAYER;
  const isOnline = config.mode === GameMode.ONLINE;
  const isHost = config.role === 'HOST';
  const isPlayer1 = !isOnline || isHost; 

  const [gameState, setGameState] = useState<GameState>(() => {
    const saved = getActiveSession();
    if (saved && saved.matchId && saved.config.mode === config.mode) {
      if (!isOnline || saved.config.matchCode === config.matchCode) return saved;
    }
    
    return {
      matchId: 'match-' + Date.now(),
      config,
      phase: isOnline ? GamePhase.WAITING_FOR_OPPONENT : GamePhase.SETUP_P1,
      player1Secret: '',
      player2Secret: '', 
      player1History: [],
      player2History: [],
      message: isOnline ? 'Initializing connection...' : `${user.username}, set your secret`,
      winner: null,
      opponentName: isSinglePlayer ? 'CPU' : (config.secondPlayerName || undefined)
    };
  });

  const [isAiThinking, setIsAiThinking] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(config.timeLimit || 30);

  // --- Real-time Firebase Syncing ---
  useEffect(() => {
    if (isOnline && db && config.matchCode) {
      const matchRef = ref(db, `matches/${config.matchCode}`);
      const unsub = onValue(matchRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        const remoteState = data.state;
        const metadata = data.metadata;

        setGameState(prev => {
          // Detect Guest Join
          let nextOpponent = prev.opponentName;
          if (isHost && metadata.guest && !prev.opponentName) {
            nextOpponent = metadata.guest;
          } else if (!isHost && metadata.host && !prev.opponentName) {
            nextOpponent = metadata.host;
          }

          // Compute message based on phase and turn
          let msg = remoteState.message || prev.message;
          if (remoteState.phase === GamePhase.WAITING_FOR_OPPONENT) {
            msg = isHost ? (nextOpponent ? `${nextOpponent} joined! Start when ready.` : 'Waiting for opponent...') : 'Connecting to Host...';
          }

          return {
            ...prev,
            ...remoteState,
            opponentName: nextOpponent,
            message: msg
          };
        });
      });
      return () => unsub();
    }
  }, [isOnline, config.matchCode, isHost]);

  // Push local state changes to Firebase
  const syncToFirebase = (updates: Partial<GameState>) => {
    if (isOnline && config.matchCode) {
      syncGameStateNode(config.matchCode, updates);
    }
  };

  // --- Persistence & Logic ---
  useEffect(() => {
    saveActiveSession(gameState);
  }, [gameState]);

  const isMyTurn = () => {
    if (gameState.phase === GamePhase.GAME_OVER) return false;
    if (isOnline) {
      if (isPlayer1 && gameState.phase === GamePhase.TURN_P1) return true;
      if (!isPlayer1 && gameState.phase === GamePhase.TURN_P2) return true;
      if (isPlayer1 && gameState.phase === GamePhase.SETUP_P1 && !gameState.player1Secret) return true;
      if (!isPlayer1 && gameState.phase === GamePhase.SETUP_P2 && !gameState.player2Secret) return true;
    }
    return !isOnline && !isAiThinking;
  };

  const handleDigitPress = (digit: string) => {
    if (!isMyTurn()) return;
    if (input.length < config.n && !input.includes(digit)) {
      setInput(prev => prev + digit);
    }
  };

  const submitSecret = () => {
    const valid = validateSequence(input, config.n);
    if (!valid.valid) return alert(valid.error);

    const secretUpdates: any = isPlayer1 ? { player1Secret: input } : { player2Secret: input };
    
    setGameState(prev => {
      let nextPhase = prev.phase;
      // In online mode, we transition to setup p2 or p1 based on who is set
      if (isOnline) {
        if (isHost) {
          if (prev.player2Secret) nextPhase = GamePhase.TURN_P1;
        } else {
          if (prev.player1Secret) nextPhase = GamePhase.TURN_P1;
        }
      } else {
        if (isSinglePlayer) {
          nextPhase = GamePhase.TURN_P1;
          secretUpdates.player2Secret = generateRandomSecret(config.n, input);
        } else {
          nextPhase = isPlayer1 ? GamePhase.TRANSITION : GamePhase.TURN_P1;
        }
      }

      const newState = { ...prev, ...secretUpdates, phase: nextPhase, message: 'Ready!' };
      syncToFirebase(newState);
      return newState;
    });
    setInput('');
  };

  const submitGuess = () => {
    const valid = validateSequence(input, config.n);
    if (!valid.valid) return alert(valid.error);

    const targetSecret = isPlayer1 ? gameState.player2Secret : gameState.player1Secret;
    const result = computeOnAndOrder(targetSecret, input);
    const guessResult: GuessResult = { ...result, guess: input, timestamp: new Date().toISOString() };

    setGameState(prev => {
      const historyKey = isPlayer1 ? 'player1History' : 'player2History';
      const newHistory = [...prev[historyKey], guessResult];
      
      let nextPhase = isPlayer1 ? GamePhase.TURN_P2 : GamePhase.TURN_P1;
      let winner = prev.winner;

      if (result.on === config.n && result.order === config.n) {
        nextPhase = GamePhase.GAME_OVER;
        winner = isPlayer1 ? 'player1' : 'player2';
      }

      const updates = { [historyKey]: newHistory, phase: nextPhase, winner };
      syncToFirebase(updates);
      return { ...prev, ...updates };
    });
    
    setInput('');
    if (isSinglePlayer && gameState.phase !== GamePhase.GAME_OVER) triggerAiTurn();
  };

  const triggerAiTurn = () => {
    setIsAiThinking(true);
    setTimeout(() => {
      setGameState(prev => {
        const aiGuess = generateRandomSecret(config.n);
        const result = computeOnAndOrder(prev.player1Secret, aiGuess);
        const guessResult: GuessResult = { ...result, guess: aiGuess, timestamp: new Date().toISOString() };
        const newHistory = [...prev.player2History, guessResult];
        let nextPhase = GamePhase.TURN_P1;
        let winner = prev.winner;
        if (result.on === config.n && result.order === config.n) {
          nextPhase = GamePhase.GAME_OVER;
          winner = 'player2';
        }
        return { ...prev, player2History: newHistory, phase: nextPhase, winner };
      });
      setIsAiThinking(false);
    }, 1500);
  };

  const startOnlineMatch = () => {
    if (isHost && gameState.opponentName) {
      const updates = { phase: GamePhase.SETUP_P1, message: 'Set your secret!' };
      syncToFirebase(updates);
      setGameState(prev => ({ ...prev, ...updates }));
    }
  };

  // --- Render Helpers ---
  const myHistory = isPlayer1 ? gameState.player1History : gameState.player2History;
  const oppHistory = isPlayer1 ? gameState.player2History : gameState.player1History;

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      <div className="bg-white border-b border-gray-200 p-4 shadow-sm z-20 flex-none">
        <div className="flex justify-between items-center mb-1">
          <Button variant="ghost" onClick={onExit} className="!p-0 !min-h-0 text-gray-400 text-xs font-black">EXIT</Button>
          <div className="text-[10px] font-black text-gray-400 tracking-widest uppercase">
            {isOnline ? `CODE: ${config.matchCode}` : 'OFFLINE MODE'}
          </div>
        </div>
        <h2 className="text-2xl font-black text-gray-900 leading-none truncate">
          {gameState.phase === GamePhase.GAME_OVER ? 'MATCH END' : gameState.message}
        </h2>
        {isOnline && !gameState.opponentName && gameState.phase === GamePhase.WAITING_FOR_OPPONENT && (
          <p className="text-[10px] font-bold text-blue-600 animate-pulse mt-1">WAITING FOR GUEST TO JOIN...</p>
        )}
      </div>

      <div className="flex-1 flex flex-row overflow-hidden relative">
        {gameState.phase === GamePhase.WAITING_FOR_OPPONENT && (
           <div className="absolute inset-0 bg-white z-30 flex flex-col items-center justify-center p-8 text-center animate-slide-in">
             <div className="text-6xl font-black text-gray-900 mb-4">{config.matchCode}</div>
             <p className="text-gray-400 font-bold text-xs uppercase mb-8">Match Room Code</p>
             
             <div className="w-full max-w-xs space-y-3 mb-8">
               <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 flex items-center justify-between">
                 <span className="font-bold text-blue-800">{user.username}</span>
                 <span className="text-[10px] font-black text-blue-400 uppercase">HOST</span>
               </div>
               <div className={`p-4 rounded-xl border flex items-center justify-between ${gameState.opponentName ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-100 border-dashed'}`}>
                 <span className={`font-bold ${gameState.opponentName ? 'text-green-800' : 'text-gray-300 italic'}`}>
                   {gameState.opponentName || 'Waiting...'}
                 </span>
                 <span className="text-[10px] font-black text-gray-400 uppercase">GUEST</span>
               </div>
             </div>

             {isHost && (
               <Button fullWidth onClick={startOnlineMatch} disabled={!gameState.opponentName}>
                 START MATCH
               </Button>
             )}
           </div>
        )}

        <div className="flex-1 flex flex-col border-r border-gray-100">
          <div className="p-2 bg-blue-50/50 text-center text-[8px] font-black text-blue-400 uppercase tracking-widest">{user.username}</div>
          <MoveHistory history={myHistory} n={config.n} />
        </div>
        <div className="flex-1 flex flex-col bg-gray-50/30">
          <div className="p-2 bg-gray-100/50 text-center text-[8px] font-black text-gray-400 uppercase tracking-widest">{gameState.opponentName || 'OPPONENT'}</div>
          <MoveHistory history={oppHistory} n={config.n} />
        </div>
      </div>

      <div className="bg-white border-t border-gray-200 p-2 pb-safe flex-none z-10">
        <InputDisplay length={config.n} value={input} isSecret={gameState.phase.includes('SETUP')} />
        <Keypad 
          onDigitPress={handleDigitPress}
          onDelete={() => setInput(p => p.slice(0, -1))}
          onClear={() => setInput('')}
          onSubmit={gameState.phase.includes('SETUP') ? submitSecret : submitGuess}
          disabledDigits={new Set(input.split(''))}
          disabled={!isMyTurn() || gameState.phase === GamePhase.WAITING_FOR_OPPONENT}
          showSubmit={true}
          canSubmit={input.length === config.n}
          submitLabel={gameState.phase.includes('SETUP') ? 'SET SECRET' : 'GUESS'}
        />
      </div>

      {gameState.phase === GamePhase.GAME_OVER && (
        <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-6 animate-slide-in">
          <div className="bg-white rounded-2xl p-8 w-full max-w-sm text-center">
            <h3 className="text-4xl font-black text-gray-900 mb-2">
              {gameState.winner === (isPlayer1 ? 'player1' : 'player2') ? 'VICTORY' : 'DEFEAT'}
            </h3>
            <p className="text-gray-500 font-bold uppercase text-xs mb-8 tracking-widest">
              {gameState.winner === 'player1' ? (isHost ? user.username : gameState.opponentName) : (isHost ? gameState.opponentName : user.username)} found the secret!
            </p>
            <Button fullWidth onClick={onExit}>EXIT TO MENU</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameScreen;
