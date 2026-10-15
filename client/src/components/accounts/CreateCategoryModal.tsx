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
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-card border border-border w-full max-w-md rounded-xl p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-1">Create Content Category</h3>
        <p className="text-xs text-slate-400 mb-4">Group social accounts by AI video production theme</p>

        <form onSubmit={onSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1">Category Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Micro Commercials"
              value={newCat.name}
              onChange={(e) => setNewCat(prev => ({ ...prev, name: e.target.value }))}
              className="w-full bg-surface border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Description</label>
            <textarea
              rows={2}
              placeholder="Short summary of this content category"
              value={newCat.description}
              onChange={(e) => setNewCat(prev => ({ ...prev, description: e.target.value }))}
              className="w-full bg-surface border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Workspace Accent Color</label>
            <input
              type="color"
              value={newCat.color}
              onChange={(e) => setNewCat(prev => ({ ...prev, color: e.target.value }))}
              className="w-16 h-8 bg-transparent cursor-pointer rounded"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 bg-surface hover:bg-slate-800 text-slate-300 rounded-lg font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold"
            >
              Create Category
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
