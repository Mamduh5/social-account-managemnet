import React from 'react';
import { themeTokens } from '../../theme/tokens';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'warning' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  className = '',
  disabled,
  ...rest
}) => {
  const sizeClasses = {
    sm: 'px-2.5 py-1 min-h-8 text-xs rounded-lg',
    md: 'px-3.5 py-2 min-h-9 text-xs rounded-xl font-medium',
    lg: 'px-4 py-2.5 min-h-11 text-sm rounded-xl font-semibold',
  }[size];

  const variantClass = themeTokens.accents[variant] || themeTokens.accents.secondary;

  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`font-semibold flex items-center justify-center gap-1.5 transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${loading ? 'cursor-progress' : ''} ${variantClass} ${sizeClasses} ${className}`}
      {...rest}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      <span>{children}</span>
    </button>
  );
};
