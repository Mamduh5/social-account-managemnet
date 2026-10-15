import React from 'react';
import { Card } from './Card';

export interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  subValue?: React.ReactNode;
  icon?: React.ReactNode;
  iconBg?: string;
  iconColor?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  subValue,
  icon,
  iconBg = 'bg-indigo-500/10',
  iconColor = 'text-indigo-400',
}) => {
  return (
    <Card className="p-5 flex items-center justify-between">
      <div>
        <p className="text-xs uppercase tracking-wider text-slate-400 font-medium">{label}</p>
        <h3 className="text-2xl font-bold text-white mt-1">{value}</h3>
        {subValue && <div className="text-xs mt-1">{subValue}</div>}
      </div>
      {icon && (
        <div className={`w-12 h-12 ${iconBg} ${iconColor} rounded-xl flex items-center justify-center shrink-0`}>
          {icon}
        </div>
      )}
    </Card>
  );
};
