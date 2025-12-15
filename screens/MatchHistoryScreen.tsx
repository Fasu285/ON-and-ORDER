import React, { useEffect, useState } from 'react';
import { MatchRecord } from '../types';
import { getMatchHistory } from '../utils/storage';
import Button from '../components/Button';

interface MatchHistoryScreenProps {
  onBack: () => void;
}

const MatchHistoryScreen: React.FC<MatchHistoryScreenProps> = ({ onBack }) => {
  const [history, setHistory] = useState<MatchRecord[]>([]);

  useEffect(() => {
    setHistory(getMatchHistory());
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b border-gray-200 p-4 shadow-sm z-10 sticky top-0">
         <div className="flex justify-between items-center">
            <h1 className="text-2xl font-black text-gray-900">MATCH HISTORY</h1>
            <Button variant="ghost" onClick={onBack} className="!p-2 min-h-0 h-10">
              CLOSE
            </Button>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {history.length === 0 ? (
          <div className="text-center text-gray-400 mt-10">
            No matches played yet.
          </div>
        ) : (
          history.map((match) => (
            <div key={match.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 animate-slide-in">
              <div className="flex justify-between items-center mb-2">
                 <span className="text-xs font-bold text-gray-400 uppercase">
                    {new Date(match.timestamp).toLocaleDateString()} • {new Date(match.timestamp).toLocaleTimeString()}
                 </span>
                 <span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded">
                    {match.mode} • {match.n} Digits
                 </span>
              </div>
              <div className="flex justify-between items-end">
                 <div>
                    <span className="block text-xs text-gray-500 uppercase font-bold">Winner</span>
                    <span className={`text-xl font-black ${match.winner === 'Me' ? 'text-green-600' : 'text-red-600'}`}>
                       {match.winner}
                    </span>
                 </div>
                 <div className="text-right">
                    <span className="block text-xs text-gray-500 uppercase font-bold">Rounds</span>
                    <span className="text-xl font-bold text-gray-800">
                       {match.rounds}
                    </span>
                 </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default MatchHistoryScreen;
