import React, { useState } from 'react';
import Button from '../components/Button';
import { User } from '../types';

interface AuthScreenProps {
  onLogin: (user: User) => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [contact, setContact] = useState('');
  const [error, setError] = useState('');

  const validateContact = (value: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    // International phone: Starts with +, followed by 7-15 digits (allowing spaces/dashes)
    const phoneRegex = /^\+[\d\s-]{7,15}$/;
    return emailRegex.test(value) || phoneRegex.test(value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !contact.trim()) {
      setError('Please fill in all fields');
      return;
    }
    
    // Username validation: At least 4 characters
    if (username.trim().length < 4) {
      setError('Username must be at least 4 characters');
      return;
    }

    // Contact validation: Email or International Phone
    if (!validateContact(contact.trim())) {
      setError('Please enter a valid email or international phone (starting with +)');
      return;
    }
    
    onLogin({ username: username.trim(), contact: contact.trim() });
  };

  return (
    <div className="flex flex-col h-full bg-white p-6 max-w-md mx-auto w-full justify-center">
      <div className="mb-12 text-center animate-slide-in">
        <h1 className="text-5xl font-black text-gray-900 tracking-tighter mb-2">
          ON<span className="text-blue-600">&</span><br/>ORDER
        </h1>
        <p className="text-gray-500 font-medium">Master the Sequence</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 animate-slide-in" style={{ animationDelay: '0.1s' }}>
        <div className="bg-gray-50 p-6 rounded-xl border border-gray-100 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Player Login</h2>
          
          <div className="space-y-4">
            <div className="space-y-1">
                <label htmlFor="username" className="block text-xs font-bold text-gray-500 uppercase tracking-wide">Username</label>
                <input 
                  id="username"
                  type="text" 
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError(''); }}
                  className="w-full p-3 bg-white border border-gray-300 rounded-lg font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Enter your name (min 4 chars)"
                  autoComplete="username"
                />
            </div>

            <div className="space-y-1">
                <label htmlFor="contact" className="block text-xs font-bold text-gray-500 uppercase tracking-wide">Email or Phone</label>
                <input 
                  id="contact"
                  type="text" 
                  value={contact}
                  onChange={(e) => { setContact(e.target.value); setError(''); }}
                  className="w-full p-3 bg-white border border-gray-300 rounded-lg font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="email@example.com or +123456789"
                  autoComplete="email"
                />
            </div>
          </div>
        </div>

        {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm font-bold text-center animate-slide-in">{error}</div>}

        <Button fullWidth type="submit" variant="primary">
          START PLAYING
        </Button>
      </form>
    </div>
  );
};

export default AuthScreen;