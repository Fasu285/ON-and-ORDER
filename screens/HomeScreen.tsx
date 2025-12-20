
import React, { useState, useEffect, useRef } from 'react';
import { GameConfig, GameMode, User, LobbyEntry } from '../types';
import { listenToAvailableMatches, hostMatchInLobby, joinMatchByCode, leaveLobby, updateHeartbeat } from '../utils/network';
import Button from '../components/Button';

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
  const [showProfile, setShowProfile] = useState(false);
  
  // Profile State
  const [editUsername, setEditUsername] = useState(user.username);
  const [editContact, setEditContact] = useState(user.contact);
  
  // Configuration State
  const [selectedN, setSelectedN] = useState<2 | 3 | 4>(4);
  const [selectedTime, setSelectedTime] = useState<30 | 60 | 90>(30);
  const [p2Name, setP2Name] = useState('');
  
  // Online State
  const [availableMatches, setAvailableMatches] = useState<LobbyEntry[]>([]);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [isHosting, setIsHosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heartbeatRef = useRef<any>(null);

  // Lobby Match Listener
  useEffect(() => {
    if (step === 'online-lobby') {
        const unsub = listenToAvailableMatches((matches) => {
            setAvailableMatches(matches.filter(m => m.hostUsername !== user.username));
        });
        
        heartbeatRef.current = setInterval(() => {
             updateHeartbeat(user.username);
        }, 30000);

        return () => {
            clearInterval(heartbeatRef.current);
            unsub();
            leaveLobby(user.username);
        };
    }
  }, [step, user.username]);

  const handleUpdateProfile = (e: React.FormEvent) => {
      e.preventDefault();
      if (editUsername.length < 4) { alert("Username min 4 chars"); return; }
      onUpdateUser({ ...user, username: editUsername, contact: editContact });
      setShowProfile(false);
  };

  const handleModeSelect = (mode: GameMode) => {
    setSelectedMode(mode);
    if (mode === GameMode.ONLINE) {
       setStep('online-lobby');
    } else {
      setStep('settings');
    }
  };

  const handleHostMatch = async () => {
    setError(null);
    setIsHosting(true);
    try {
        const { joinCode } = await hostMatchInLobby(
            { username: user.username, userId: user.contact },
            { n: selectedN, timeLimit: selectedTime }
        );
        onStartGame({
            mode: GameMode.ONLINE,
            n: selectedN,
            timeLimit: selectedTime,
            matchCode: joinCode,
            role: 'HOST'
        });
    } catch (err: any) {
        setError(err.message);
        setIsHosting(false);
    }
  };

  const handleJoinByCode = async () => {
      if (joinCodeInput.length < 4) return;
      setError(null);
      try {
          await joinMatchByCode(joinCodeInput, user.username);
          onStartGame({
              mode: GameMode.ONLINE,
              // Fix: Explicitly cast to fix type mismatch error on literals
              n: 4 as 2 | 3 | 4, 
              timeLimit: 30 as 30 | 60 | 90,
              matchCode: joinCodeInput,
              role: 'GUEST'
          });
      } catch (err: any) {
          setError(err.message);
      }
  };

  const handleJoinFromList = async (match: LobbyEntry) => {
      setError(null);
      try {
          await joinMatchByCode(match.joinCode, user.username);
          onStartGame({
              mode: GameMode.ONLINE,
              n: match.n,
              timeLimit: match.timeLimit,
              matchCode: match.joinCode,
              role: 'GUEST'
          });
      } catch (err: any) {
          setError(err.message);
      }
  };

  const handleStartLocalMatch = () => {
    if (selectedMode === GameMode.TWO_PLAYER && !p2Name.trim()) {
      alert("Please enter Player 2's name");
      return;
    }
    onStartGame({
      mode: selectedMode,
      n: selectedN,
      timeLimit: selectedTime,
      secondPlayerName: selectedMode === GameMode.TWO_PLAYER ? p2Name.trim() : undefined
    });
  };

  if (showProfile) {
      return (
          <div className="flex flex-col h-full bg-white p-6 max-w-md mx-auto w-full justify-center overflow-y-auto">
              <h2 className="text-2xl font-black mb-6 uppercase">Profile Settings</h2>
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase">Username</label>
                    <input className="w-full p-3 border border-gray-200 rounded-xl font-bold" value={editUsername} onChange={e=>setEditUsername(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase">Contact Info</label>
                    <input className="w-full p-3 border border-gray-200 rounded-xl font-bold" value={editContact} onChange={e=>setEditContact(e.target.value)} />
                  </div>
                  <Button fullWidth type="submit">SAVE CHANGES</Button>
                  <Button fullWidth variant="ghost" type="button" onClick={()=>setShowProfile(false)}>CANCEL</Button>
              </form>
          </div>
      );
  }

  return (
    <div className="flex flex-col h-full bg-white p-6 max-w-md mx-auto w-full justify-center relative overflow-y-auto">
      <div className="absolute top-4 right-4 flex gap-3 z-10">
        <button onClick={() => setShowProfile(true)} className="text-xs font-bold text-blue-500 hover:text-blue-700 uppercase tracking-wide">Profile</button>
        <button onClick={onLogout} className="text-xs font-bold text-gray-400 hover:text-red-500 uppercase tracking-wide">Logout</button>
      </div>

      <div className="mb-12 text-center animate-slide-in flex-none">
        <h1 className="text-5xl font-black text-gray-900 tracking-tighter mb-2">
          ON<span className="text-blue-600">&</span><br/>ORDER
        </h1>
        <p className="text-gray-500 font-medium">Master the Sequence</p>
      </div>

      {step === 'menu' && (
        <div className="space-y-4 w-full animate-slide-in flex-none">
          {hasActiveGame && (
             <Button fullWidth onClick={onResumeGame} className="mb-2 shadow-lg ring-4 ring-blue-50">RESUME MATCH</Button>
          )}
          <Button fullWidth onClick={() => setStep('mode')} variant={hasActiveGame ? "secondary" : "primary"}>NEW MATCH</Button>
          <Button fullWidth variant={hasActiveGame ? "ghost" : "secondary"} onClick={onViewHistory}>MATCHES HISTORY</Button>
        </div>
      )}

      {step === 'mode' && (
        <div className="space-y-4 w-full animate-slide-in">
          <h2 className="text-xl font-bold text-center mb-6 uppercase">Select Mode</h2>
          <Button fullWidth onClick={() => handleModeSelect(GameMode.SINGLE_PLAYER)}>SINGLE PLAYER (AI)</Button>
          <Button fullWidth variant="secondary" onClick={() => handleModeSelect(GameMode.TWO_PLAYER)}>2 PLAYER (LOCAL)</Button>
          <Button fullWidth className="bg-purple-600 hover:bg-purple-700" onClick={() => handleModeSelect(GameMode.ONLINE)}>ONLINE LOBBY</Button>
          <Button fullWidth variant="ghost" onClick={() => setStep('menu')}>BACK</Button>
        </div>
      )}

      {step === 'online-lobby' && (
        <div className="space-y-4 w-full h-full flex flex-col animate-slide-in overflow-hidden">
          <h2 className="text-xl font-bold text-center mb-2 flex-none uppercase tracking-tighter">ONLINE LOBBY</h2>
          
          <div className="flex-1 overflow-y-auto bg-gray-50 rounded-2xl border border-gray-100 p-3 mb-4 space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Available Matches</span>
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              </div>

              {availableMatches.length === 0 ? (
                  <div className="text-center py-10 px-4">
                      <p className="text-gray-400 text-sm font-bold">NO MATCHES FOUND</p>
                      <p className="text-[10px] text-gray-300 uppercase mt-1">Host one to start playing!</p>
                  </div>
              ) : (
                  availableMatches.map(match => (
                      <div key={match.matchId} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex justify-between items-center animate-slide-in">
                          <div>
                              <p className="font-black text-gray-900">{match.hostUsername}</p>
                              <div className="flex gap-2 mt-1">
                                <span className="text-[8px] font-bold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded uppercase">{match.n} Digits</span>
                                <span className="text-[8px] font-bold bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded uppercase">{match.timeLimit}s</span>
                              </div>
                          </div>
                          <Button variant="primary" className="!py-1 !px-4 !text-xs !min-h-[32px]" onClick={() => handleJoinFromList(match)}>JOIN</Button>
                      </div>
                  ))
              )}
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex-none space-y-4">
             {error && <p className="text-red-500 text-[10px] font-black text-center uppercase">{error}</p>}
             <div className="flex gap-2">
               <input 
                 type="text" 
                 value={joinCodeInput}
                 onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase().slice(0, 4))}
                 placeholder="ENTER CODE"
                 className="flex-1 p-3 border border-gray-200 rounded-xl font-mono font-black text-center tracking-widest text-lg focus:ring-2 focus:ring-blue-500 outline-none"
               />
               <Button onClick={handleJoinByCode} disabled={joinCodeInput.length < 4} className="min-w-[80px]">JOIN</Button>
             </div>
             <div className="w-full flex items-center gap-2 py-1">
                <div className="flex-1 h-px bg-gray-100"></div>
                <span className="text-[8px] font-black text-gray-300 uppercase">OR</span>
                <div className="flex-1 h-px bg-gray-100"></div>
             </div>
             <Button fullWidth onClick={() => setStep('settings')} variant="secondary" className="h-14">HOST NEW MATCH</Button>
          </div>
          
          <Button fullWidth variant="ghost" onClick={() => setStep('mode')} className="flex-none">BACK</Button>
        </div>
      )}

      {step === 'settings' && (
        <div className="space-y-6 w-full animate-slide-in">
          <h2 className="text-xl font-bold text-center mb-2 uppercase">Match Settings</h2>
          
          {selectedMode === GameMode.TWO_PLAYER && (
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase mb-1">Player 2 Name</label>
              <input type="text" value={p2Name} onChange={(e) => setP2Name(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold" placeholder="Opponent's Name" />
            </div>
          )}

          <div>
            <label className="block text-xs font-black text-gray-400 uppercase mb-2">Digits (N)</label>
            <div className="grid grid-cols-3 gap-3">
               {[2, 3, 4].map(n => (
                 <button key={n} onClick={() => setSelectedN(n as any)} className={`p-3 rounded-xl font-black transition-all ${selectedN === n ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600'}`}>{n}</button>
               ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-gray-400 uppercase mb-2">Time Limit</label>
            <div className="grid grid-cols-3 gap-3">
               {[30, 60, 90].map(t => (
                 <button key={t} onClick={() => setSelectedTime(t as any)} className={`p-3 rounded-xl font-black transition-all ${selectedTime === t ? 'bg-orange-500 text-white shadow-md' : 'bg-gray-100 text-gray-600'}`}>{t}s</button>
               ))}
            </div>
          </div>

          <div className="pt-4 space-y-3">
            <Button fullWidth onClick={selectedMode === GameMode.ONLINE ? handleHostMatch : handleStartLocalMatch} variant="primary">
                {selectedMode === GameMode.ONLINE ? 'CREATE PUBLIC LOBBY' : 'START MATCH'}
            </Button>
            <Button fullWidth variant="ghost" onClick={() => setStep(selectedMode === GameMode.ONLINE ? 'online-lobby' : 'mode')}>BACK</Button>
          </div>
        </div>
      )}
      
      <div className="mt-auto text-center text-[8px] text-gray-300 py-4 font-black uppercase tracking-widest">v1.3.1</div>
    </div>
  );
};

export default HomeScreen;
