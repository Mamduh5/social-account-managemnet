import React from 'react';
import { Category } from '../../types';
import { Card } from '../common/Card';

export interface CategoryCardProps {
  category: Category;
  accountCount: number;
}

export const CategoryCard: React.FC<CategoryCardProps> = ({ category, accountCount }) => {
  return (
    <Card className="p-4.5 hover:border-slate-600 transition-all">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <span 
            className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs" 
            style={{ backgroundColor: category.color || '#D95D39' }} 
          />
          <h4 className="font-bold text-slate-100 text-sm truncate">{category.name}</h4>
        </div>
        <span className="text-[11px] bg-surface text-slate-300 font-medium px-2 py-0.5 rounded-md border border-border shrink-0">
          {accountCount} accounts
        </span>
      </div>
      <p className="text-xs text-slate-400 mt-2.5 line-clamp-2 leading-relaxed">{category.description}</p>
    </Card>
  );
};
