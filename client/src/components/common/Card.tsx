import React from 'react';
import { themeTokens } from '../../theme/tokens';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'card' | 'surface';
  borderStyle?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'card',
  borderStyle,
  className = '',
  ...rest
}) => {
  const bg = variant === 'card' ? themeTokens.surfaces.card : themeTokens.surfaces.surface;
  const border = borderStyle || themeTokens.surfaces.border;

  return (
    <div
      className={`${bg} border ${border} rounded-xl ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
};
