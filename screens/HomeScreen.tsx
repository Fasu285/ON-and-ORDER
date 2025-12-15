import React, { useState } from 'react';
import { GameConfig, GameMode, User } from '../types';
import { TEST_VECTORS } from '../constants';
import { runTestVectors } from '../utils/gameLogic';
import Button from '../components/Button';

interface HomeScreenProps {
  user: User;
  onStartGame: (config: GameConfig) => void;
  onResumeGame?: () => void;
  hasActiveGame?: boolean;
  onLogout: () => void;
  onViewHistory: () => void;
}

const HomeScreen: React.FC<HomeScreenProps> = ({ user, onStartGame, onResumeGame, hasActiveGame, onLogout, onViewHistory }) => {
  const [step, setStep] = useState<'menu' | 'mode' | 'settings' | 'online-menu'>('menu');
  const [selectedMode, setSelectedMode] = useState<GameMode>(GameMode.SINGLE_PLAYER);
  const [testResults, setTestResults] = useState<string | null>(null);
  
  // Configuration State
  const [selectedN, setSelectedN] = useState<2 | 3 | 4>(4);
  const [selectedTime, setSelectedTime] = useState<30 | 60 | 90>(30);
  const [p2Name, setP2Name] = useState('');
  
  // Online State
  const [matchCodeInput, setMatchCodeInput] = useState('');
  const [onlineRole, setOnlineRole] = useState<'HOST' | 'GUEST'>('HOST');

  const handleNewMatchClick = () => {
    // We allow proceeding to setup without clearing immediately. 
    // Session is only cleared when "START GAME" is actually clicked.
    setStep('mode');
  };

  const handleModeSelect = (mode: GameMode) => {
    setSelectedMode(mode);
    if (mode === GameMode.ONLINE) {
      setStep('online-menu');
    } else {
      setStep('settings');
      // Reset P2 name if switching to 2P
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
    setOnlineRole('GUEST');
    // Guest joins with defaults, but will receive actual config from Host
    onStartGame({
      mode: GameMode.ONLINE,
      n: 4, 
      timeLimit: 30,
      matchCode: matchCodeInput.toUpperCase(),
      role: 'GUEST'
    });
  };

  const handleOnlineHost = () => {
    setOnlineRole('HOST');
    setStep('settings');
  };

  const handleStartMatch = () => {
    if (selectedMode === GameMode.TWO_PLAYER && !p2Name.trim()) {
      alert("Please enter Player 2's name");
      return;
    }

    let code = undefined;
    if (selectedMode === GameMode.ONLINE && onlineRole === 'HOST') {
      // Generate random 4 char code
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      code = '';
      for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    onStartGame({
      mode: selectedMode,
      n: selectedN,
      timeLimit: selectedTime,
      matchCode: code,
      role: selectedMode === GameMode.ONLINE ? onlineRole : undefined,
      secondPlayerName: selectedMode === GameMode.TWO_PLAYER ? p2Name.trim() : undefined
    });
  };

  const runDiagnostics = () => {
    const { passed, details } = runTestVectors(TEST_VECTORS);
    setTestResults(passed ? 'ALL SYSTEMS GO. Logic Verified.' : 'SYSTEM FAILURE. Check console.');
    console.log(details.join('\n'));
  };

  return (
    <div className="flex flex-col h-full bg-white p-6 max-w-md mx-auto w-full justify-center relative">
      <div className="absolute top-4 right-4">
        <button onClick={onLogout} className="text-xs font-bold text-gray-400 hover:text-red-500 uppercase tracking-wide">
          Logout
        </button>
      </div>

      <div className="mb-12 text-center animate-slide-in">
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
        <div className="space-y-4 w-full animate-slide-in" style={{ animationDelay: '0.1s' }}>
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
        <div className="space-y-4 w-full animate-slide-in">
          <h2 className="text-xl font-bold text-center mb-6">SELECT MODE</h2>
          <Button fullWidth onClick={() => handleModeSelect(GameMode.SINGLE_PLAYER)}>
            Single player (vs Computer)
          </Button>
          <Button fullWidth variant="secondary" onClick={() => handleModeSelect(GameMode.TWO_PLAYER)}>
            2 PLAYER (Pass & Play)
          </Button>
          <Button fullWidth className="bg-purple-600 hover:bg-purple-700" onClick={() => handleModeSelect(GameMode.ONLINE)}>
            ONLINE (2 Devices)
          </Button>
          <Button fullWidth variant="ghost" onClick={() => setStep('menu')}>
            BACK
          </Button>
        </div>
      )}

      {step === 'online-menu' && (
        <div className="space-y-4 w-full animate-slide-in">
          <h2 className="text-xl font-bold text-center mb-6">ONLINE MATCH</h2>
          
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 mb-4">
             <h3 className="text-sm font-bold text-gray-500 mb-2 uppercase">Join Existing</h3>
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

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-gray-200"></div>
            <span className="flex-shrink-0 mx-4 text-gray-400 text-xs font-bold uppercase">OR</span>
            <div className="flex-grow border-t border-gray-200"></div>
          </div>

          <Button fullWidth onClick={handleOnlineHost}>
            CREATE NEW MATCH
          </Button>
          
          <Button fullWidth variant="ghost" onClick={() => setStep('mode')}>
            BACK
          </Button>
        </div>
      )}

      {step === 'settings' && (
        <div className="space-y-6 w-full animate-slide-in">
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
      
      <div className="mt-auto text-center text-xs text-gray-300 py-4">
        v1.3.0
      </div>
    </div>
  );
};

export default HomeScreen;