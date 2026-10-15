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
        <div className="w-12 h-12 bg-surface-hover text-slate-400 rounded-2xl flex items-center justify-center mb-3.5 shadow-xs">
          {icon}
        </div>
      )}
      <h4 className="text-sm font-bold text-slate-100">{title}</h4>
      {description && <p className="text-xs text-slate-400 mt-1 max-w-sm leading-relaxed">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
};
