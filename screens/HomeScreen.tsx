import React, { useState, useEffect } from 'react';
import { GameConfig, GameMode, User, LobbyUser } from '../types';
import { TEST_VECTORS } from '../components/constants';
import { runTestVectors } from '../utils/gameLogic';
import { joinLobby, leaveLobby, listenToLobby, sendInvite, listenForInvites } from '../utils/network';
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
  const [step, setStep] = useState<'menu' | 'mode' | 'settings' | 'online-menu'>('menu');
  const [selectedMode, setSelectedMode] = useState<GameMode>(GameMode.SINGLE_PLAYER);
  const [testResults, setTestResults] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  
  // Profile State
  const [editUsername, setEditUsername] = useState(user.username);
  const [editContact, setEditContact] = useState(user.contact);
  
  // Configuration State
  const [selectedN, setSelectedN] = useState<2 | 3 | 4>(4);
  const [selectedTime, setSelectedTime] = useState<30 | 60 | 90>(30);
  const [p2Name, setP2Name] = useState('');
  
  // Online State
  const [matchCodeInput, setMatchCodeInput] = useState('');
  const [lobbyPlayers, setLobbyPlayers] = useState<LobbyUser[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [inviteReceived, setInviteReceived] = useState<any>(null);

  // Load favorites
  useEffect(() => {
    const saved = localStorage.getItem('on_order_favorites');
    if (saved) setFavorites(JSON.parse(saved));
  }, []);

  // Update local edit state when user prop changes (e.g. after update)
  useEffect(() => {
      setEditUsername(user.username);
      setEditContact(user.contact);
  }, [user]);

  // Lobby & Invite Listener
  useEffect(() => {
    if (step === 'online-menu') {
        // Join Lobby
        joinLobby({
            username: user.username,
            n: selectedN,
            timeLimit: selectedTime,
            status: 'IDLE',
            lastSeen: Date.now()
        });

        const unsubLobby = listenToLobby((users) => {
            // Filter out self and inactive (>1min)
            const active = users.filter(u => 
                u.username !== user.username && 
                (Date.now() - u.lastSeen < 60000)
            );
            
            // Sort: Favorites first, then Alphabetical
            active.sort((a, b) => {
                const aFav = favorites.includes(a.username);
                const bFav = favorites.includes(b.username);
                if (aFav && !bFav) return -1;
                if (!aFav && bFav) return 1;
                return a.username.localeCompare(b.username);
            });
            
            setLobbyPlayers(active);
        });

        const unsubInvites = listenForInvites(user.username, (invite) => {
            setInviteReceived(invite);
        });

        return () => {
            leaveLobby(user.username);
            unsubLobby();
            unsubInvites();
        };
    }
  }, [step, user.username, selectedN, selectedTime, favorites]);

  const toggleFavorite = (username: string) => {
    const newFavs = favorites.includes(username) 
       ? favorites.filter(f => f !== username)
       : [...favorites, username];
    setFavorites(newFavs);
    localStorage.setItem('on_order_favorites', JSON.stringify(newFavs));
  };

  const handleUpdateProfile = (e: React.FormEvent) => {
      e.preventDefault();
      if (editUsername.length < 4) { alert("Username min 4 chars"); return; }
      
      const newUser = { ...user, username: editUsername, contact: editContact };
      onUpdateUser(newUser); // Use parent callback
      setShowProfile(false);
  };

  const handleNewMatchClick = () => {
    setStep('mode');
  };

  const handleModeSelect = (mode: GameMode) => {
    setSelectedMode(mode);
    if (mode === GameMode.ONLINE) {
       // Pre-select defaults to show in lobby
       setSelectedN(4);
       setSelectedTime(30);
       setStep('online-menu');
    } else {
      setStep('settings');
      if (mode === GameMode.TWO_PLAYER) {
        setP2Name('');
      }
    }
  };

  const handleOnlineJoin = () => {
    if (matchCodeInput.length !== 4) {
      alert("Please enter a valid 4-character code");
      return;
    }
    onStartGame({
      mode: GameMode.ONLINE,
      n: 4, 
      timeLimit: 30,
      matchCode: matchCodeInput.toUpperCase(),
      role: 'GUEST'
    });
  };

  const handleInviteConnect = (targetUser: LobbyUser) => {
      // Create code
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = '';
      for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));

      sendInvite(targetUser.username, user.username, code, { n: selectedN, timeLimit: selectedTime });
      
      // Start as host immediately
      onStartGame({
          mode: GameMode.ONLINE,
          n: selectedN as any,
          timeLimit: selectedTime as any,
          matchCode: code,
          role: 'HOST'
      });
  };

  const handleAcceptInvite = () => {
      if (!inviteReceived) return;
      onStartGame({
          mode: GameMode.ONLINE,
          n: inviteReceived.config.n,
          timeLimit: inviteReceived.config.timeLimit,
          matchCode: inviteReceived.matchCode,
          role: 'GUEST'
      });
  };

  const handleStartMatch = () => {
    if (selectedMode === GameMode.TWO_PLAYER && !p2Name.trim()) {
      alert("Please enter Player 2's name");
      return;
    }
    
    // Manual Host Creation (Fallback)
    if (selectedMode === GameMode.ONLINE) {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = '';
      for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
      onStartGame({
         mode: GameMode.ONLINE,
         n: selectedN,
         timeLimit: selectedTime,
         matchCode: code,
         role: 'HOST'
      });
      return;
    }

    onStartGame({
      mode: selectedMode,
      n: selectedN,
      timeLimit: selectedTime,
      role: undefined,
      secondPlayerName: selectedMode === GameMode.TWO_PLAYER ? p2Name.trim() : undefined
    });
  };

  const runDiagnostics = () => {
    const { passed, details } = runTestVectors(TEST_VECTORS);
    setTestResults(passed ? 'ALL SYSTEMS GO. Logic Verified.' : 'SYSTEM FAILURE. Check console.');
    console.log(details.join('\n'));
  };

  if (showProfile) {
      return (
          <div className="flex flex-col h-full bg-white p-6 max-w-md mx-auto w-full justify-center overflow-y-auto">
              <h2 className="text-2xl font-black mb-6">EDIT PROFILE</h2>
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase">Username</label>
                    <input className="w-full p-3 border rounded font-bold" value={editUsername} onChange={e=>setEditUsername(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase">Contact</label>
                    <input className="w-full p-3 border rounded font-bold" value={editContact} onChange={e=>setEditContact(e.target.value)} />
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
        <button onClick={() => setShowProfile(true)} className="text-xs font-bold text-blue-500 hover:text-blue-700 uppercase tracking-wide">
          Profile
        </button>
        <button onClick={onLogout} className="text-xs font-bold text-gray-400 hover:text-red-500 uppercase tracking-wide">
          Logout
        </button>
      </div>

      <div className="mb-12 text-center animate-slide-in flex-none">
        <h1 className="text-5xl font-black text-gray-900 tracking-tighter mb-2">
          ON<span className="text-blue-600">&</span><br/>ORDER
        </h1>
        <p className="text-gray-500 font-medium">Master the Sequence</p>
        <div className="mt-6 inline-block bg-blue-50 px-4 py-2 rounded-full border border-blue-100">
           <span className="text-gray-500 text-sm">Hello, </span>
           <span className="text-blue-700 font-bold">{user.username}</span>
        </div>
      </div>

      {step === 'menu' && (
        <div className="space-y-4 w-full animate-slide-in flex-none" style={{ animationDelay: '0.1s' }}>
          {hasActiveGame && (
             <Button fullWidth onClick={onResumeGame} className="mb-2 shadow-lg ring-4 ring-blue-50 border-blue-200 border">
               RESUME MATCH
             </Button>
          )}
          
          <Button fullWidth onClick={handleNewMatchClick} variant={hasActiveGame ? "secondary" : "primary"}>
            NEW MATCH
          </Button>
          
          <Button fullWidth variant={hasActiveGame ? "ghost" : "secondary"} onClick={onViewHistory}>
            HISTORY
          </Button>
          <Button fullWidth variant="ghost" onClick={runDiagnostics}>
            RUN DIAGNOSTICS
          </Button>
          {testResults && (
            <div className="mt-4 p-3 bg-gray-100 rounded text-xs font-mono text-center">
              {testResults}
            </div>
          )}
        </div>
      )}

      {step === 'mode' && (
        <div className="space-y-4 w-full animate-slide-in flex-none">
          <h2 className="text-xl font-bold text-center mb-6">SELECT MODE</h2>
          <Button fullWidth onClick={() => handleModeSelect(GameMode.SINGLE_PLAYER)}>
            Single player (vs Computer)
          </Button>
          <Button fullWidth variant="secondary" onClick={() => handleModeSelect(GameMode.TWO_PLAYER)}>
            2 PLAYER (Pass & Play)
          </Button>
          <Button fullWidth className="bg-purple-600 hover:bg-purple-700" onClick={() => handleModeSelect(GameMode.ONLINE)}>
            ONLINE (Lobby)
          </Button>
          <Button fullWidth variant="ghost" onClick={() => setStep('menu')}>
            BACK
          </Button>
        </div>
      )}

      {step === 'online-menu' && (
        <div className="space-y-4 w-full h-full flex flex-col animate-slide-in">
          <h2 className="text-xl font-bold text-center mb-2 flex-none">ONLINE LOBBY</h2>
          
          {inviteReceived && (
              <div className="bg-purple-100 border-l-4 border-purple-600 p-3 mb-2 animate-bounce cursor-pointer flex-none" onClick={handleAcceptInvite}>
                  <p className="font-bold text-purple-800">INVITE FROM {inviteReceived.from}</p>
                  <p className="text-xs">Tap to join match!</p>
              </div>
          )}

          {/* Lobby List */}
          <div className="flex-1 overflow-y-auto bg-gray-50 rounded-lg border border-gray-200 p-2 mb-4">
              {lobbyPlayers.length === 0 ? (
                  <div className="text-center text-gray-400 mt-10">No players online.<br/>Share your code manually below.</div>
              ) : (
                  lobbyPlayers.map(player => (
                      <div key={player.username} className="bg-white p-3 mb-2 rounded shadow-sm flex justify-between items-center">
                          <div className="flex items-center gap-2">
                             <button onClick={() => toggleFavorite(player.username)} className="text-xl focus:outline-none">
                                 {favorites.includes(player.username) ? '★' : '☆'}
                             </button>
                             <div>
                                 <div className="font-bold text-sm">{player.username}</div>
                                 <div className="text-xs text-gray-500">{player.n} Digits • {player.timeLimit}s</div>
                             </div>
                          </div>
                          <Button variant="primary" className="!py-1 !px-3 !text-xs !min-h-[30px]" onClick={() => handleInviteConnect(player)}>
                              CONNECT
                          </Button>
                      </div>
                  ))
              )}
          </div>
          
          <div className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm flex-none">
             <h3 className="text-xs font-bold text-gray-500 mb-2 uppercase">Or Join via Code</h3>
             <div className="flex gap-2">
               <input 
                 type="text" 
                 value={matchCodeInput}
                 onChange={(e) => setMatchCodeInput(e.target.value.toUpperCase().slice(0, 4))}
                 placeholder="CODE"
                 className="flex-1 p-3 border border-gray-300 rounded font-mono font-bold text-center tracking-widest uppercase"
               />
               <Button onClick={handleOnlineJoin} disabled={matchCodeInput.length !== 4} className="min-w-[80px]">
                 JOIN
               </Button>
             </div>
          </div>
          
          <div className="pt-2 flex-none">
            <Button fullWidth variant="secondary" onClick={() => setStep('settings')}>
                HOST PRIVATE MATCH
            </Button>
            <Button fullWidth variant="ghost" onClick={() => setStep('mode')} className="mt-2">
                BACK
            </Button>
          </div>
        </div>
      )}

      {step === 'settings' && (
        <div className="space-y-6 w-full animate-slide-in flex-none">
          <h2 className="text-xl font-bold text-center mb-2">GAME SETTINGS</h2>

          {hasActiveGame && (
            <div className="bg-orange-50 border-l-4 border-orange-400 p-3 rounded-r text-xs text-orange-800 mb-2">
              <span className="font-bold">Note:</span> Starting this game will overwrite your currently paused match.
            </div>
          )}
          
          {selectedMode === GameMode.TWO_PLAYER && (
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Player 2 Name</label>
              <input 
                 type="text" 
                 value={p2Name}
                 onChange={(e) => setP2Name(e.target.value)}
                 className="w-full p-3 bg-gray-50 border border-gray-200 rounded font-bold"
                 placeholder="Enter name"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Digit Count (N)</label>
            <div className="grid grid-cols-3 gap-3">
               {[2, 3, 4].map(n => (
                 <button
                   key={n}
                   onClick={() => setSelectedN(n as any)}
                   className={`p-3 rounded font-bold transition-all ${selectedN === n ? 'bg-blue-600 text-white shadow-md transform scale-105' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                 >
                   {n}
                 </button>
               ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Time Limit</label>
            <div className="grid grid-cols-3 gap-3">
               {[30, 60, 90].map(t => (
                 <button
                   key={t}
                   onClick={() => setSelectedTime(t as any)}
                   className={`p-3 rounded font-bold transition-all ${selectedTime === t ? 'bg-orange-500 text-white shadow-md transform scale-105' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                 >
                   {t}s
                 </button>
               ))}
            </div>
          </div>

          <div className="pt-4 space-y-3">
            <Button fullWidth onClick={handleStartMatch} variant="primary">
              START GAME
            </Button>
            <Button fullWidth variant="ghost" onClick={() => setStep(selectedMode === GameMode.ONLINE ? 'online-menu' : 'mode')}>
              BACK
            </Button>
          </div>
        </div>
      )}
      
      <div className="mt-auto text-center text-xs text-gray-300 py-4 flex-none">
        v1.3.1
      </div>
    </div>
  );
};

export default HomeScreen;