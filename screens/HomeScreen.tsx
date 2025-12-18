
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
  const heartbeatTimer = useRef<any>(null);

  useEffect(() => {
    if (step === 'online-lobby' && db) {
      const lobbyRef = ref(db, 'lobby');
      const unsub = onValue(lobbyRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const list = Object.values(data).filter((m: any) => 
            m.username !== user.username && (Date.now() - m.lastSeen < 15000)
          );
          setAvailableMatches(list);
        } else {
          setAvailableMatches([]);
        }
      });
      return () => unsub();
    }
  }, [step, user.username]);

  const handleHostGame = async () => {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    // 1. Initialize match node
    await initMatchNode(code, user.username, { n: selectedN, timeLimit: selectedTime, mode: GameMode.ONLINE });
    
    // 2. Start heartbeat
    updateLobby({ username: user.username, n: selectedN, timeLimit: selectedTime, status: 'IDLE', lastSeen: Date.now() }, code);
    heartbeatTimer.current = setInterval(() => {
      updateLobby({ username: user.username, n: selectedN, timeLimit: selectedTime, status: 'IDLE', lastSeen: Date.now() }, code);
    }, 5000);

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
        n: config.n,
        timeLimit: config.timeLimit,
        matchCode: match.matchCode,
        role: 'GUEST'
      });
    } else {
      alert("Match is full or no longer available.");
    }
  };

  useEffect(() => {
    return () => {
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-white p-6 max-w-md mx-auto w-full justify-center">
      <div className="text-center mb-12 animate-slide-in">
        <h1 className="text-5xl font-black text-gray-900 tracking-tighter">
          ON<span className="text-blue-600">&</span><br/>ORDER
        </h1>
        <p className="text-gray-400 font-bold text-xs uppercase tracking-widest mt-2">Multiplayer Logic Battle</p>
      </div>
      
      {step === 'menu' && (
        <div className="space-y-4 animate-slide-in">
          {hasActiveGame && (
             <Button fullWidth onClick={onResumeGame} className="border-2 border-blue-600 !bg-white !text-blue-600">RESUME MATCH</Button>
          )}
          <Button fullWidth onClick={() => setStep('mode')}>NEW MATCH</Button>
          <Button fullWidth variant="secondary" onClick={onViewHistory}>HISTORY</Button>
          <Button fullWidth variant="ghost" onClick={onLogout}>LOGOUT</Button>
        </div>
      )}

      {step === 'mode' && (
        <div className="space-y-4 animate-slide-in">
          <h2 className="text-center font-black text-gray-400 text-xs uppercase mb-2">Select Game Mode</h2>
          <Button fullWidth onClick={() => { setSelectedMode(GameMode.SINGLE_PLAYER); setStep('settings'); }}>VS CPU</Button>
          <Button fullWidth onClick={() => { setSelectedMode(GameMode.ONLINE); setStep('online-lobby'); }}>ONLINE LOBBY</Button>
          <Button fullWidth variant="ghost" onClick={() => setStep('menu')}>BACK</Button>
        </div>
      )}

      {step === 'online-lobby' && (
        <div className="space-y-4 h-[450px] flex flex-col animate-slide-in">
          <h2 className="font-bold text-blue-600 uppercase text-xs tracking-widest text-center">Live Online Matches</h2>
          <div className="flex-1 overflow-y-auto space-y-3 border rounded-xl p-3 bg-gray-50 border-gray-100">
            {availableMatches.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full opacity-40">
                <div className="animate-pulse w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mb-4"></div>
                <p className="text-center text-gray-500 text-xs font-bold uppercase">Scanning for logic masters...</p>
              </div>
            ) : (
              availableMatches.map(m => (
                <div key={m.matchCode} className="flex justify-between items-center p-4 bg-white rounded-lg border border-gray-200 shadow-sm transition-transform active:scale-95">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    <div>
                      <p className="font-black text-gray-900 leading-none mb-1">{m.username}</p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                        {m.config.n} Digits • {m.config.timeLimit}s Time
                      </p>
                    </div>
                  </div>
                  <Button variant="primary" className="!py-1 !px-4 !text-xs h-9" onClick={() => handleJoinLobbyMatch(m)}>JOIN</Button>
                </div>
              ))
            )}
          </div>
          <div className="space-y-2 pt-2">
            <Button fullWidth onClick={() => setStep('settings')}>HOST MATCH</Button>
            <Button fullWidth variant="ghost" onClick={() => setStep('mode')}>BACK</Button>
          </div>
        </div>
      )}

      {step === 'settings' && (
        <div className="space-y-6 animate-slide-in">
          <h2 className="text-center font-black text-gray-400 text-xs uppercase mb-4">Match Settings</h2>
          
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Sequence Length (N)</label>
            <div className="grid grid-cols-3 gap-2">
              {[2,3,4].map(val => (
                <button 
                  key={val} 
                  onClick={() => setSelectedN(val as any)}
                  className={`py-3 rounded-lg font-black transition-all ${selectedN === val ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Turn Time Limit</label>
            <div className="grid grid-cols-3 gap-2">
              {[30,60,90].map(val => (
                <button 
                  key={val} 
                  onClick={() => setSelectedTime(val as any)}
                  className={`py-3 rounded-lg font-black transition-all ${selectedTime === val ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-400'}`}
                >
                  {val}s
                </button>
              ))}
            </div>
          </div>

          <div className="pt-6 space-y-2">
            <Button fullWidth onClick={selectedMode === GameMode.ONLINE ? handleHostGame : () => onStartGame({ mode: selectedMode, n: selectedN, timeLimit: selectedTime })}>
              START AS {selectedMode === GameMode.ONLINE ? 'HOST' : 'PLAYER'}
            </Button>
            <Button variant="ghost" fullWidth onClick={() => setStep('mode')}>BACK</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeScreen;
