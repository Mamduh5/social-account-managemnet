import React from 'react';

export interface CreateCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  formData: {
    name: string;
    description: string;
    color: string;
  };
  setFormData: React.Dispatch<React.SetStateAction<{
    name: string;
    description: string;
    color: string;
  }>>;
  onSubmit: (e: React.FormEvent) => void;
}

export const CreateCategoryModal: React.FC<CreateCategoryModalProps> = ({
  isOpen,
  onClose,
  formData: newCat,
  setFormData: setNewCat,
  onSubmit,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-surface-card border border-border w-full max-w-md rounded-2xl p-6 shadow-2xl">
        <h3 className="text-lg font-black text-slate-100 mb-1">Create Content Category</h3>
        <p className="text-xs text-slate-400 mb-4">Group social accounts by AI video production theme</p>

        <form onSubmit={onSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Category Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Micro Commercials"
              value={newCat.name}
              onChange={(e) => setNewCat(prev => ({ ...prev, name: e.target.value }))}
              className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-terracotta-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Description</label>
            <textarea
              rows={2}
              placeholder="Short summary of this content category"
              value={newCat.description}
              onChange={(e) => setNewCat(prev => ({ ...prev, description: e.target.value }))}
              className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-terracotta-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Workspace Accent Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={newCat.color}
                onChange={(e) => setNewCat(prev => ({ ...prev, color: e.target.value }))}
                className="w-12 h-9 bg-transparent cursor-pointer rounded-lg border border-border"
              />
              <span className="text-xs font-mono text-slate-400 uppercase">{newCat.color}</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-surface hover:bg-surface-hover text-slate-300 rounded-xl font-medium border border-border transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4.5 py-2 bg-terracotta-600 hover:bg-terracotta-500 text-white rounded-xl font-bold shadow-md shadow-terracotta-600/25 transition-all cursor-pointer active:scale-95"
            >
              Create Category
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
