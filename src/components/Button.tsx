import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  fullWidth?: boolean;
}

const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  fullWidth = false,
  className = '',
  disabled,
  ...props 
}) => {
  const baseStyle = "py-3 px-6 rounded-lg font-bold transition-all active:scale-95 focus:outline-none focus:ring-4 focus:ring-opacity-50 min-h-[44px] flex items-center justify-center";
  
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-400 disabled:bg-blue-300",
    secondary: "bg-orange-500 text-white hover:bg-orange-600 focus:ring-orange-300 disabled:bg-orange-300",
    danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-400 disabled:bg-red-300",
    ghost: "bg-transparent text-blue-600 hover:bg-blue-50 focus:ring-blue-200 disabled:text-gray-400"
  };

  return (
    <button
      className={`${baseStyle} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className} ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
