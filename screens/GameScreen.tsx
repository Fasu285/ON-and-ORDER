import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameConfig, GameState, GameMode, GuessResult, GamePhase, User } from '../types';
import { validateSequence, computeOnAndOrder, generateRandomSecret } from '../utils/gameLogic';
import { saveMatchRecord, saveActiveSession, clearActiveSession, getActiveSession } from '../utils/storage';
import { db } from '../utils/firebase';
import * as firebaseDatabase from 'firebase/database';
import { syncGameStateNode, clearLobby } from '../utils/network';
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
      message: isOnline ? 'Connecting to Room...' : `${user.username}, set your secret`,
      winner: null,
      opponentName: isSinglePlayer ? 'CPU' : (config.secondPlayerName || undefined)
    };
  });

  // --- Persistent State Listener (THE FIX) ---
  useEffect(() => {
    if (isOnline && db && config.matchCode) {
      const matchRef = ref(db, `matches/${config.matchCode}`);
      const unsub = onValue(matchRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        setGameState(prev => {
          const remoteMetadata = data.metadata;
          const remoteState = data.state;
          
          let nextOpponent = prev.opponentName;
          if (isHost && remoteMetadata.guest) nextOpponent = remoteMetadata.guest;
          if (!isHost && remoteMetadata.host) nextOpponent = remoteMetadata.host;

          // If guest joined while host was waiting, clear public lobby entry
          if (isHost && prev.phase === GamePhase.WAITING_FOR_OPPONENT && remoteMetadata.guest) {
             clearLobby(user.username);
          }

          return {
            ...prev,
            ...remoteState,
            opponentName: nextOpponent,
            message: remoteState.phase === GamePhase.WAITING_FOR_OPPONENT 
              ? (nextOpponent ? `${nextOpponent} Joined! Ready.` : 'Waiting for guest...')
              : prev.message
          };
        });
      });
      return () => unsub();
    }
  }, [isOnline, config.matchCode, isHost, user.username]);

  // Push local changes to shared state
  const syncToCloud = (updates: any) => {
    if (isOnline && config.matchCode) {
      syncGameStateNode(config.matchCode, updates);
    }
  };

  const handleDigitPress = (digit: string) => {
    if (input.length < config.n && !input.includes(digit)) setInput(prev => prev + digit);
  };

  const submitSecret = () => {
    const valid = validateSequence(input, config.n);
    if (!valid.valid) return alert(valid.error);

    const secretUpdates: any = isPlayer1 ? { player1Secret: input } : { player2Secret: input };
    
    setGameState(prev => {
      let nextPhase = prev.phase;
      if (isOnline) {
         // In online mode, we transition to setup p2 or p1 based on who is set
         // This is handled via the remote sync
      } else {
        if (isSinglePlayer) {
          nextPhase = GamePhase.TURN_P1;
          secretUpdates.player2Secret = generateRandomSecret(config.n, input);
        } else {
          nextPhase = isPlayer1 ? GamePhase.TRANSITION : GamePhase.TURN_P1;
        }
      }

      const newState = { ...prev, ...secretUpdates, phase: nextPhase, message: 'Ready!' };
      syncToCloud(secretUpdates);
      return newState;
    });
    setInput('');
  };

  const submitGuess = () => {
    const targetSecret = isPlayer1 ? gameState.player2Secret : gameState.player1Secret;
    const result = computeOnAndOrder(targetSecret, input);
    const guessResult: GuessResult = { ...result, guess: input, timestamp: new Date().toISOString() };

    setGameState(prev => {
      const historyKey = isPlayer1 ? 'player1History' : 'player2History';
      const newHistory = [...prev[historyKey], guessResult];
      const updates = { [historyKey]: newHistory };
      syncToCloud(updates);
      return { ...prev, ...updates };
    });
    setInput('');
  };

  const handleStartGame = () => {
    if (isHost && gameState.opponentName) {
      const updates = { phase: GamePhase.SETUP_P1 };
      syncToCloud(updates);
      setGameState(prev => ({ ...prev, ...updates }));
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      <div className="bg-white border-b border-gray-200 p-4 shadow-sm z-10 flex-none">
        <div className="flex justify-between items-center mb-1">
          <Button variant="ghost" onClick={onExit} className="!p-0 !min-h-0 text-gray-400 text-xs font-black">EXIT</Button>
          <div className="text-[10px] font-black text-gray-400 tracking-widest uppercase">
            {isOnline ? `CODE: ${config.matchCode}` : 'OFFLINE'}
          </div>
        </div>
        <h2 className="text-2xl font-black text-gray-900 leading-none">{gameState.message}</h2>
      </div>

      <div className="flex-1 flex flex-row overflow-hidden">
        {gameState.phase === GamePhase.WAITING_FOR_OPPONENT ? (
           <div className="w-full flex flex-col items-center justify-center p-8 text-center animate-slide-in">
             <div className="text-6xl font-black text-blue-600 mb-4">{config.matchCode}</div>
             <p className="text-gray-400 font-bold text-xs uppercase mb-8">Match Code</p>
             <div className="space-y-4 w-full max-w-xs">
                <div className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm flex items-center gap-3">
                   <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                   <span className="font-bold">{user.username}</span>
                </div>
                <div className={`p-4 rounded-xl border flex items-center gap-3 ${gameState.opponentName ? 'bg-white border-gray-100' : 'bg-gray-50 border-dashed border-gray-300'}`}>
                   <div className={`w-2 h-2 rounded-full ${gameState.opponentName ? 'bg-orange-500' : 'bg-gray-300'}`}></div>
                   <span className={`font-bold ${gameState.opponentName ? 'text-gray-800' : 'text-gray-300 italic'}`}>{gameState.opponentName || 'Waiting...'}</span>
                </div>
             </div>
             {isHost && (
               <Button fullWidth onClick={handleStartGame} disabled={!gameState.opponentName} className="mt-8 h-14">START MATCH</Button>
             )}
           </div>
        ) : (
          <>
            <div className="flex-1 flex flex-col border-r border-gray-100">
              <div className="p-2 bg-blue-50/50 text-center text-[8px] font-black text-blue-400 uppercase tracking-widest">{user.username}</div>
              <MoveHistory history={isPlayer1 ? gameState.player1History : gameState.player2History} n={config.n} />
            </div>
            <div className="flex-1 flex flex-col bg-gray-50/30">
              <div className="p-2 bg-gray-100/50 text-center text-[8px] font-black text-gray-400 uppercase tracking-widest">{gameState.opponentName || 'OPPONENT'}</div>
              <MoveHistory history={isPlayer1 ? gameState.player2History : gameState.player1History} n={config.n} />
            </div>
          </>
        )}
      </div>

      {gameState.phase !== GamePhase.WAITING_FOR_OPPONENT && (
        <div className="bg-white border-t border-gray-200 p-2 pb-safe flex-none">
          <InputDisplay length={config.n} value={input} isSecret={gameState.phase.includes('SETUP')} />
          <Keypad 
            onDigitPress={handleDigitPress} 
            onDelete={() => setInput(p => p.slice(0,-1))} 
            onClear={() => setInput('')}
            onSubmit={gameState.phase.includes('SETUP') ? submitSecret : submitGuess}
            disabledDigits={new Set(input.split(''))}
            showSubmit={true}
            canSubmit={input.length === config.n}
            submitLabel={gameState.phase.includes('SETUP') ? "SET SECRET" : "SUBMIT GUESS"}
          />
        </div>
      )}
    </div>
  );
};

export default GameScreen;