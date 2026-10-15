import React from 'react';
import { Card } from './Card';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <Card className={`p-10 text-center flex flex-col items-center justify-center ${className}`}>
      {icon && (
        <div className="w-12 h-12 bg-slate-800/80 text-slate-400 rounded-xl flex items-center justify-center mb-3">
          {icon}
        </div>
      )}
      <h4 className="text-sm font-bold text-white">{title}</h4>
      {description && <p className="text-xs text-slate-400 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
};
