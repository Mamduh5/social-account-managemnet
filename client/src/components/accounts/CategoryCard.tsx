import React from 'react';
import { Category } from '../../types';
import { Card } from '../common/Card';

export interface CategoryCardProps {
  category: Category;
  accountCount: number;
}

export const CategoryCard: React.FC<CategoryCardProps> = ({ category, accountCount }) => {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: category.color }} />
          <h4 className="font-bold text-white text-sm">{category.name}</h4>
        </div>
        <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
          {accountCount} accounts
        </span>
      </div>
      <p className="text-xs text-slate-400 mt-2 line-clamp-2">{category.description}</p>
    </Card>
  );
};
