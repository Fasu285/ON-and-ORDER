import React, { useState, useEffect, useRef } from 'react';
import { GameConfig, GameMode, User, LobbyUser } from '../types';
import { db } from '../utils/firebase';
import * as firebaseDatabase from 'firebase/database';
import { updateLobby, clearLobby, joinMatch, initMatchNode } from '../utils/network';
import Button from '../components/Button';

const { ref, onValue } = firebaseDatabase;

interface HomeScreenProps {
  user: User;
  onStartGame: (config: GameConfig) => void;
  onResumeGame?: () => void;
  hasActiveGame?: boolean;
  onLogout: () => void;
  onUpdateUser: (user: User) => void;
  onViewHistory: () => void;
}

const HomeScreen: React.FC<HomeScreenProps> = ({ user, onStartGame, onResumeGame, hasActiveGame, onLogout, onUpdateUser, onViewHistory }) => {
  const [step, setStep] = useState<'menu' | 'mode' | 'settings' | 'online-lobby'>('menu');
  const [selectedMode, setSelectedMode] = useState<GameMode>(GameMode.SINGLE_PLAYER);
  const [availableMatches, setAvailableMatches] = useState<any[]>([]);
  
  const [selectedN, setSelectedN] = useState<2 | 3 | 4>(4);
  const [selectedTime, setSelectedTime] = useState<30 | 60 | 90>(30);
  const heartbeatRef = useRef<any>(null);

  useEffect(() => {
    if (step === 'online-lobby' && db) {
      const lobbyRef = ref(db, 'lobby');
      const unsub = onValue(lobbyRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const list = Object.values(data).filter((m: any) => 
            m.username !== user.username && (Date.now() - m.lastSeen < 20000)
          );
          setAvailableMatches(list);
        } else {
          setAvailableMatches([]);
        }
      });
      return () => unsub();
    }
  }, [step, user.username]);

  const handleHostGame = () => {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    // 1. Advertise in Lobby
    updateLobby({ username: user.username, n: selectedN, timeLimit: selectedTime, status: 'IDLE', lastSeen: Date.now() }, code);
    
    // 2. Initialize Match State
    initMatchNode(code, user.username, { n: selectedN, timeLimit: selectedTime });
    
    // 3. Heartbeat
    heartbeatRef.current = setInterval(() => {
      updateLobby({ username: user.username, n: selectedN, timeLimit: selectedTime, status: 'IDLE', lastSeen: Date.now() }, code);
    }, 10000);

    onStartGame({
      mode: GameMode.ONLINE,
      n: selectedN,
      timeLimit: selectedTime,
      matchCode: code,
      role: 'HOST'
    });
  };

  const handleJoinLobbyMatch = async (match: any) => {
    const config = await joinMatch(match.matchCode, user.username);
    if (config) {
      onStartGame({
        mode: GameMode.ONLINE,
        n: match.config.n,
        timeLimit: match.config.timeLimit,
        matchCode: match.matchCode,
        role: 'GUEST'
      });
    } else {
      alert("Match is no longer available.");
    }
  };

  useEffect(() => {
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-white p-6 max-w-md mx-auto w-full justify-center">
      <h1 className="text-4xl font-black text-center mb-12 tracking-tighter">ON<span className="text-blue-600">&</span>ORDER</h1>
      
      {step === 'menu' && (
        <div className="space-y-4 animate-slide-in">
          <Button fullWidth onClick={() => setStep('mode')}>NEW MATCH</Button>
          <Button fullWidth variant="secondary" onClick={onViewHistory}>HISTORY</Button>
          <Button fullWidth variant="ghost" onClick={onLogout}>LOGOUT</Button>
        </div>
      )}

      {step === 'mode' && (
        <div className="space-y-4 animate-slide-in">
          <Button fullWidth onClick={() => { setSelectedMode(GameMode.SINGLE_PLAYER); setStep('settings'); }}>VS CPU</Button>
          <Button fullWidth onClick={() => { setSelectedMode(GameMode.ONLINE); setStep('online-lobby'); }}>ONLINE LOBBY</Button>
          <Button fullWidth variant="ghost" onClick={() => setStep('menu')}>BACK</Button>
        </div>
      )}

      {step === 'online-lobby' && (
        <div className="space-y-4 h-[400px] flex flex-col animate-slide-in">
          <h2 className="font-bold text-gray-500 uppercase text-xs tracking-widest text-center">Active Hosts</h2>
          <div className="flex-1 overflow-y-auto space-y-2 border rounded-lg p-2 bg-gray-50 border-gray-100">
            {availableMatches.length === 0 ? (
              <p className="text-center text-gray-400 py-10 text-xs italic">Scanning for hosts...</p>
            ) : (
              availableMatches.map(m => (
                <div key={m.matchCode} className="flex justify-between items-center p-3 bg-white rounded border border-gray-100 shadow-sm transition-transform active:scale-95">
                  <div>
                    <p className="font-bold text-sm text-gray-800">{m.username}</p>
                    <p className="text-[10px] text-gray-400 uppercase font-black">{m.config.n} Digits • {m.config.timeLimit}s</p>
                  </div>
                  <Button variant="primary" className="!py-1 !px-4 !text-xs h-8" onClick={() => handleJoinLobbyMatch(m)}>JOIN</Button>
                </div>
              ))
            )}
          </div>
          <Button fullWidth onClick={() => setStep('settings')}>HOST PRIVATE</Button>
          <Button fullWidth variant="ghost" onClick={() => setStep('mode')}>BACK</Button>
        </div>
      )}

      {step === 'settings' && (
        <div className="space-y-6 animate-slide-in">
          <div className="grid grid-cols-3 gap-2">
             {[2,3,4].map(val => (
               <button key={val} onClick={() => setSelectedN(val as any)} className={`py-3 rounded-lg font-black ${selectedN === val ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>{val}N</button>
             ))}
          </div>
          <Button fullWidth onClick={selectedMode === GameMode.ONLINE ? handleHostGame : () => onStartGame({ mode: selectedMode, n: selectedN, timeLimit: selectedTime })}>
            START AS {selectedMode === GameMode.ONLINE ? 'HOST' : 'PLAYER'}
          </Button>
          <Button variant="ghost" fullWidth onClick={() => setStep('mode')}>BACK</Button>
        </div>
      )}
    </div>
  );
};

export default HomeScreen;