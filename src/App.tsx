import React, { useState, useEffect } from 'react';
import HomeScreen from '../screens/HomeScreen';
import GameScreen from '../screens/GameScreen';
import AuthScreen from '../screens/AuthScreen';
import MatchHistoryScreen from '../screens/MatchHistoryScreen';
import { GameConfig, User } from '../types';
import { getActiveSession, clearActiveSession } from '../utils/storage';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentScreen, setCurrentScreen] = useState<'auth' | 'home' | 'game' | 'history'>('auth');
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [hasActiveGame, setHasActiveGame] = useState(false);

  // Check for active session whenever we are on home screen or mount
  useEffect(() => {
    const session = getActiveSession();
    setHasActiveGame(!!session);
  }, [currentScreen]);

  useEffect(() => {
    // Check local storage for existing session
    const savedUser = localStorage.getItem('on_order_user');
    let loadedUser: User | null = null;
    
    if (savedUser) {
      try {
        loadedUser = JSON.parse(savedUser);
        setUser(loadedUser);
        setCurrentScreen('home');
      } catch (e) {
        console.error('Failed to parse user', e);
        localStorage.removeItem('on_order_user');
      }
    }

    // Check for active game session to restore ONLY on initial load
    // This allows continuing after exit/reopen app
    const activeSession = getActiveSession();
    if (activeSession && loadedUser) {
       setGameConfig(activeSession.config);
       setCurrentScreen('game');
    }

    document.body.addEventListener('touchmove', function(e) {
        if (e.target === document.body) {
             e.preventDefault();
        }
    }, { passive: false });
  }, []);

  const handleLogin = (newUser: User) => {
    setUser(newUser);
    localStorage.setItem('on_order_user', JSON.stringify(newUser));
    setCurrentScreen('home');
  };

  const handleUpdateUser = (updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('on_order_user', JSON.stringify(updatedUser));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('on_order_user');
    setCurrentScreen('auth');
  };

  const handleStartGame = (config: GameConfig) => {
    clearActiveSession(); // Clear any previous session
    setGameConfig(config);
    setCurrentScreen('game');
  };

  const handleResumeGame = () => {
    const session = getActiveSession();
    if (session) {
       setGameConfig(session.config);
       setCurrentScreen('game');
    }
  };

  const handleExitGame = () => {
    setGameConfig(null);
    setCurrentScreen('home');
  };

  const handleViewHistory = () => {
    setCurrentScreen('history');
  };

  const handleBackToHome = () => {
    setCurrentScreen('home');
  };

  return (
    <div className="h-full w-full max-w-md mx-auto shadow-2xl bg-white overflow-hidden relative">
      {currentScreen === 'auth' && <AuthScreen onLogin={handleLogin} />}
      {currentScreen === 'home' && user && (
        <HomeScreen 
          user={user} 
          onStartGame={handleStartGame} 
          onResumeGame={handleResumeGame}
          hasActiveGame={hasActiveGame}
          onLogout={handleLogout} 
          onUpdateUser={handleUpdateUser}
          onViewHistory={handleViewHistory}
        />
      )}
      {currentScreen === 'game' && gameConfig && user && (
        <GameScreen config={gameConfig} user={user} onExit={handleExitGame} />
      )}
      {currentScreen === 'history' && (
        <MatchHistoryScreen onBack={handleBackToHome} />
      )}
    </div>
  );
};

export default App;