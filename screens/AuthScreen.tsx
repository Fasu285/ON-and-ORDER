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
  
  // Verification State
  const [step, setStep] = useState<'details' | 'verification'>('details');
  const [otp, setOtp] = useState('');
  const [isSending, setIsSending] = useState(false);

  const validateContact = (value: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    // International phone: Starts with +, followed by 7-15 digits
    const phoneRegex = /^\+[\d\s-]{7,15}$/;
    return emailRegex.test(value) || phoneRegex.test(value);
  };

  const handleSendCode = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !contact.trim()) {
      setError('Please fill in all fields');
      return;
    }
    
    if (username.trim().length < 4) {
      setError('Username must be at least 4 characters');
      return;
    }

    if (!validateContact(contact.trim())) {
      setError('Please enter a valid email or international phone (starting with +)');
      return;
    }

    // Simulate sending code
    setIsSending(true);
    setTimeout(() => {
        setIsSending(false);
        setStep('verification');
        alert(`(Demo) Verification code sent to ${contact}. Code is: 1234`);
    }, 1500);
  };

  const handleVerify = (e: React.FormEvent) => {
      e.preventDefault();
      if (otp !== '1234') {
          setError('Invalid verification code');
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

      {step === 'details' ? (
        <form onSubmit={handleSendCode} className="space-y-6 animate-slide-in" style={{ animationDelay: '0.1s' }}>
            <div className="bg-gray-50 p-6 rounded-xl border border-gray-100 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Player Details</h2>
            
            <div className="space-y-4">
                <div className="space-y-1">
                    <label htmlFor="username" className="block text-xs font-bold text-gray-500 uppercase tracking-wide">Username</label>
                    <input 
                    id="username"
                    type="text" 
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setError(''); }}
                    className="w-full p-3 bg-white border border-gray-300 rounded-lg font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="Enter your name"
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
                    placeholder="email@example.com or +1..."
                    autoComplete="email"
                    />
                </div>
            </div>
            </div>

            {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm font-bold text-center animate-slide-in">{error}</div>}

            <Button fullWidth type="submit" variant="primary" disabled={isSending}>
            {isSending ? 'SENDING...' : 'VERIFY & CONTINUE'}
            </Button>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="space-y-6 animate-slide-in">
             <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 shadow-sm text-center">
                <h2 className="text-lg font-bold text-blue-900 mb-2">Verify Contact</h2>
                <p className="text-sm text-blue-700 mb-4">Enter the code sent to <br/><strong>{contact}</strong></p>
                
                <input 
                    type="text" 
                    value={otp}
                    onChange={(e) => { setOtp(e.target.value); setError(''); }}
                    className="w-full p-4 bg-white border border-blue-200 rounded-lg font-mono text-2xl font-black text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0000"
                    maxLength={4}
                    autoFocus
                />
            </div>

            {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm font-bold text-center animate-slide-in">{error}</div>}

            <Button fullWidth type="submit" variant="primary">
                CONFIRM CODE
            </Button>
            <button 
                type="button" 
                onClick={() => setStep('details')}
                className="w-full text-center text-sm text-gray-400 font-bold hover:text-gray-600"
            >
                Back to Details
            </button>
        </form>
      )}
    </div>
  );
};

export default AuthScreen;