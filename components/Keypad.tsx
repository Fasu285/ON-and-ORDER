import React from 'react';

interface KeypadProps {
  onDigitPress: (digit: string) => void;
  onDelete: () => void;
  onClear: () => void;
  onSubmit?: () => void;
  disabledDigits: Set<string>; // Digits that are already used in the current sequence
  disabled?: boolean; // Whole keypad disabled
  showSubmit?: boolean;
  canSubmit?: boolean;
  submitLabel?: string;
}

const Keypad: React.FC<KeypadProps> = ({ 
  onDigitPress, 
  onDelete, 
  onClear, 
  onSubmit,
  disabledDigits, 
  disabled = false,
  showSubmit = false,
  canSubmit = false,
  submitLabel = "SUBMIT GUESS"
}) => {
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  return (
    <div className="grid grid-cols-3 gap-1.5 p-2 bg-gray-100 rounded-t-xl shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] w-full max-w-md mx-auto" aria-label="Game keypad">
      {digits.map((digit) => (
        <button
          key={digit}
          onClick={() => onDigitPress(digit)}
          disabled={disabled || disabledDigits.has(digit)}
          className={`
            h-12 text-xl font-semibold rounded shadow-sm transition-colors touch-manipulation
            ${disabledDigits.has(digit) 
              ? 'bg-gray-300 text-gray-400 cursor-not-allowed' 
              : 'bg-white text-gray-900 active:bg-blue-50 hover:bg-gray-50'
            }
          `}
          aria-label={digit}
          aria-disabled={disabled || disabledDigits.has(digit)}
        >
          {digit}
        </button>
      ))}
      
      {/* Function Keys Row */}
      <button
        onClick={onClear}
        disabled={disabled}
        className="h-12 bg-red-100 text-red-700 font-bold rounded shadow-sm active:bg-red-200 uppercase text-xs tracking-wider touch-manipulation"
        aria-label="Clear all"
      >
        Clear
      </button>
      
      <button
        onClick={onDelete}
        disabled={disabled}
        className="h-12 bg-gray-200 text-gray-700 font-bold rounded shadow-sm active:bg-gray-300 touch-manipulation"
        aria-label="Backspace"
      >
        ⌫
      </button>

      {showSubmit ? (
        <button
          onClick={onSubmit}
          disabled={!canSubmit || disabled}
          className={`h-12 font-bold rounded shadow-sm text-white text-sm transition-colors col-span-3 mt-1 touch-manipulation
            ${!canSubmit || disabled ? 'bg-green-300' : 'bg-green-600 active:bg-green-700'}
          `}
          aria-label={submitLabel}
        >
          {submitLabel}
        </button>
      ) : (
         /* Placeholder to keep grid structure if no submit button needed immediately in this layout */
         <div className="hidden" />
      )}
    </div>
  );
};

export default Keypad;