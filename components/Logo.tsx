
import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
}

const Logo: React.FC<LogoProps> = ({ className = '', size = '5xl' }) => {
  // Mapa de tamanhos para classes do Tailwind
  const sizeClasses = {
      'sm': 'text-sm',
      'md': 'text-base',
      'lg': 'text-lg',
      'xl': 'text-xl',
      '2xl': 'text-2xl',
      '3xl': 'text-3xl',
      '4xl': 'text-4xl',
      '5xl': 'text-5xl',
  };

  return (
    <span 
      className={`font-extrabold tracking-tighter select-none ${sizeClasses[size]} ${className}`}
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      meumei
    </span>
  );
};

export default Logo;
