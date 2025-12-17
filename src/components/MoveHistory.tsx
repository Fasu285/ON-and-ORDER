import React, { useEffect, useRef } from 'react';
import { GuessResult } from '../types';

interface MoveHistoryProps {
  history: GuessResult[];
  n: number;
}

const MoveHistory: React.FC<MoveHistoryProps> = ({ history, n }) => {
  const topRef = useRef<HTMLDivElement>(null);

  // Scroll to top when new move added (since we display newest at top per spec)
  useEffect(() => {
    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history]);

  // Spec: "most recent moves at top"
  const reversedHistory = [...history].reverse();

  if (history.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-center text-gray-300 italic text-xs">
        No moves yet
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-gray-50/50 w-full" role="log" aria-label="Move history">
      <div ref={topRef} />
      {reversedHistory.map((move, index) => (
        <div 
          key={`${move.timestamp}-${index}`} 
          className="bg-white px-2 py-2 rounded border border-gray-100 shadow-sm animate-slide-in flex justify-between items-center"
        >
          {/* Guess Sequence */}
          <div className="font-mono font-bold text-gray-800 text-lg tracking-widest leading-none">
            {move.guess}
          </div>
          
          {/* Result Badges */}
          <div className="flex gap-1.5 text-[10px] font-black leading-none">
             <div className={`flex flex-col items-center justify-center ${move.on === n ? 'text-green-600' : 'text-blue-600'}`}>
                <span className="opacity-50 text-[8px] mb-0.5">ON</span>
                <span className="text-sm">{move.on}</span>
             </div>
             <div className="w-px bg-gray-100 h-6"></div>
             <div className={`flex flex-col items-center justify-center ${move.order === n ? 'text-green-600' : 'text-orange-500'}`}>
                <span className="opacity-50 text-[8px] mb-0.5">ORD</span>
                <span className="text-sm">{move.order}</span>
             </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default MoveHistory;