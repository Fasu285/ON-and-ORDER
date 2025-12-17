import React from 'react';

interface InputDisplayProps {
  length: number;
  value: string;
  isSecret?: boolean;
  status?: 'default' | 'success' | 'error';
}

const InputDisplay: React.FC<InputDisplayProps> = ({ 
  length, 
  value, 
  isSecret = false, 
  status = 'default' 
}) => {
  const slots = Array.from({ length });
  
  // Colors based on status
  const borderColor = 
    status === 'error' ? 'border-red-500' : 
    status === 'success' ? 'border-green-500' : 
    'border-gray-300';

  return (
    <div className="flex justify-center gap-2 mb-4" role="group" aria-label="Input sequence">
      {slots.map((_, i) => {
        const char = value[i];
        return (
          <div
            key={i}
            className={`
              w-12 h-14 sm:w-16 sm:h-20 border-b-4 ${borderColor} bg-white 
              flex items-center justify-center text-3xl font-bold rounded-t-lg shadow-sm
              transition-all duration-200
              ${char ? 'scale-100 opacity-100' : 'scale-95 opacity-70'}
            `}
            aria-label={`Digit ${i + 1}: ${char || 'empty'}`}
          >
            {char ? (isSecret ? '•' : char) : '_'}
          </div>
        );
      })}
    </div>
  );
};

export default InputDisplay;
