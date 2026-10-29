import React, { useRef, useState } from 'react';
import { Modal } from '../common/Modal';

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
  onSubmit: (e: React.FormEvent) => void | Promise<void>;
}

export const CreateCategoryModal: React.FC<CreateCategoryModalProps> = ({
  isOpen,
  onClose,
  formData: newCat,
  setFormData: setNewCat,
  onSubmit,
}) => {
  const nameRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Content Category" subtitle="Group social accounts by AI video production theme"
      manageFocus initialFocusRef={nameRef} dismissible={!submitting} scrollBody>
        <form onSubmit={async e => {
          e.preventDefault();
          if (submitting) return;
          setSubmitting(true);
          try { await onSubmit(e); } finally { setSubmitting(false); }
        }} className="flex min-h-0 flex-col text-xs">
          <div className="min-h-0 overflow-y-auto space-y-4">
          <div>
            <label htmlFor="new-category-name" className="block text-slate-300 font-semibold mb-1">Category Name</label>
            <input
              id="new-category-name"
              ref={nameRef}
              type="text"
              required
              placeholder="e.g. Micro Commercials"
              value={newCat.name}
              onChange={(e) => setNewCat(prev => ({ ...prev, name: e.target.value }))}
              className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-terracotta-500"
            />
          </div>

          <div>
            <label htmlFor="new-category-description" className="block text-slate-300 font-semibold mb-1">Description</label>
            <textarea
              id="new-category-description"
              rows={2}
              placeholder="Short summary of this content category"
              value={newCat.description}
              onChange={(e) => setNewCat(prev => ({ ...prev, description: e.target.value }))}
              className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-terracotta-500"
            />
          </div>

          <div>
            <label htmlFor="new-category-color" className="block text-slate-300 font-semibold mb-1">Workspace Accent Color</label>
            <div className="flex items-center gap-3">
              <input
                id="new-category-color"
                type="color"
                value={newCat.color}
                onChange={(e) => setNewCat(prev => ({ ...prev, color: e.target.value }))}
                className="w-12 h-9 bg-transparent cursor-pointer rounded-lg border border-border"
              />
              <span className="text-xs font-mono text-slate-400 uppercase">{newCat.color}</span>
            </div>
          </div>

          </div>
          <div className="flex shrink-0 items-center justify-end gap-2.5 pt-3 mt-4 border-t border-border">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-4 py-2 bg-surface hover:bg-surface-hover text-slate-300 rounded-xl font-medium border border-border transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4.5 py-2 bg-terracotta-600 hover:bg-terracotta-500 text-white rounded-xl font-bold shadow-md shadow-terracotta-600/25 transition-all cursor-pointer active:scale-95"
            >
              Create Category
            </button>
          </div>
        </form>
    </Modal>
  );
};
