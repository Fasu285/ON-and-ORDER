import React, { useEffect, useState } from 'react';
import { MatchRecord, GameMode, GuessResult } from '../types';
import { getMatchHistory } from '../utils/storage';
import Button from '../components/Button';
import MoveHistory from '../components/MoveHistory';

interface MatchHistoryScreenProps {
  onBack: () => void;
}

const MatchHistoryScreen: React.FC<MatchHistoryScreenProps> = ({ onBack }) => {
  const [history, setHistory] = useState<MatchRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<MatchRecord | null>(null);
  const [viewingDetail, setViewingDetail] = useState(false);

  useEffect(() => {
    setHistory(getMatchHistory());
  }, []);

  const handleRecordClick = (record: MatchRecord) => {
    setSelectedRecord(record);
    setViewingDetail(true);
  };

  const closeDetail = () => {
    setViewingDetail(false);
    setSelectedRecord(null);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 relative">
      {/* Detail Overlay (Recap Modal) */}
      {viewingDetail && selectedRecord && (
        <div className="absolute inset-0 z-50 flex flex-col bg-white animate-fade-in overflow-hidden">
          <div className="bg-white border-b border-gray-200 p-4 shadow-sm flex justify-between items-center flex-none">
             <div>
                <h2 className="text-xl font-black text-gray-900 leading-none">MATCHES HISTORY</h2>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                   {selectedRecord.mode} • {selectedRecord.n}N • {new Date(selectedRecord.timestamp).toLocaleDateString()}
                </p>
             </div>
             <Button variant="ghost" onClick={closeDetail} className="!p-2 min-h-0 h-10">CLOSE</Button>
          </div>
          
          <div className="flex-1 flex flex-col overflow-hidden">
             {/* Result Summary */}
             <div className="p-4 bg-gray-50 border-b border-gray-100 flex-none text-center">
                <div className="text-4xl mb-1">🏆</div>
                <div className="text-xs font-black text-gray-400 uppercase tracking-widest">Winner</div>
                <div className="text-2xl font-black text-blue-600 mb-4">{selectedRecord.winner}</div>
                
                <div className="grid grid-cols-2 gap-4">
                   <div className="bg-white p-3 rounded-xl border border-gray-200">
                      <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">P1 Secret</p>
                      <div className="text-lg font-black tracking-widest">{selectedRecord.player1Secret}</div>
                   </div>
                   <div className="bg-white p-3 rounded-xl border border-gray-200">
                      <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">P2/CPU Secret</p>
                      <div className="text-lg font-black tracking-widest">{selectedRecord.player2Secret}</div>
                   </div>
                </div>
             </div>

             {/* Histories */}
             <div className="flex-1 flex flex-row overflow-hidden">
                <div className="flex-1 flex flex-col border-r border-gray-100">
                   <div className="p-2 bg-blue-50/50 text-center text-[8px] font-black text-blue-400 uppercase tracking-widest">P1 Guesses</div>
                   <MoveHistory history={selectedRecord.player1History || []} n={selectedRecord.n} />
                </div>
                <div className="flex-1 flex flex-col bg-gray-50/30">
                   <div className="p-2 bg-gray-100/50 text-center text-[8px] font-black text-gray-400 uppercase tracking-widest">P2/CPU Guesses</div>
                   <MoveHistory history={selectedRecord.player2History || []} n={selectedRecord.n} />
                </div>
             </div>
          </div>

          <div className="p-4 border-t border-gray-200 flex-none bg-white pb-safe">
             <Button fullWidth onClick={closeDetail}>BACK TO LIST</Button>
          </div>
        </div>
      )}

      <div className="bg-white border-b border-gray-200 p-4 shadow-sm z-10 sticky top-0">
         <div className="flex justify-between items-center">
            <h1 className="text-2xl font-black text-gray-900 tracking-tighter">MATCHES HISTORY</h1>
            <Button variant="ghost" onClick={onBack} className="!p-2 min-h-0 h-10">
              CLOSE
            </Button>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {history.length === 0 ? (
          <div className="text-center text-gray-400 mt-10">
            No matches recorded yet.
          </div>
        ) : (
          history.map((match) => (
            <div 
              key={match.id} 
              onClick={() => handleRecordClick(match)}
              className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 animate-slide-in active:bg-gray-50 cursor-pointer transition-colors"
            >
              <div className="flex justify-between items-center mb-2">
                 <span className="text-xs font-bold text-gray-400 uppercase">
                    {new Date(match.timestamp).toLocaleDateString()} • {new Date(match.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                 </span>
                 <span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded text-gray-600">
                    {match.mode} • {match.n} Digits
                 </span>
              </div>
              <div className="flex justify-between items-end">
                 <div>
                    <span className="block text-[10px] text-gray-500 uppercase font-black tracking-widest mb-0.5">Winner</span>
                    <span className={`text-xl font-black ${match.winner === 'CPU' || (match.winner === 'Opponent') ? 'text-red-600' : 'text-green-600'}`}>
                       {match.winner}
                    </span>
                 </div>
                 <div className="text-right">
                    <span className="block text-[10px] text-gray-500 uppercase font-black tracking-widest mb-0.5">Rounds</span>
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