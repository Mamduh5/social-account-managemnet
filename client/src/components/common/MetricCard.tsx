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
  iconBg = 'bg-terracotta-500/15',
  iconColor = 'text-terracotta-500',
}) => {
  return (
    <Card className="p-5 flex items-center justify-between">
      <div>
        <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">{label}</p>
        <h3 className="text-2xl font-black text-slate-100 mt-1.5 tracking-tight">{value}</h3>
        {subValue && <div className="text-xs mt-1.5">{subValue}</div>}
      </div>
      {icon && (
        <div className={`w-12 h-12 ${iconBg} ${iconColor} rounded-2xl flex items-center justify-center shrink-0 shadow-xs`}>
          {icon}
        </div>
      )}
    </Card>
  );
};
