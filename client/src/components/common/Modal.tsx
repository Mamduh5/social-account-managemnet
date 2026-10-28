import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { themeTokens } from '../../theme/tokens';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
  /** Let the caller provide a scrollable body with a persistent action footer. */
  scrollBody?: boolean;
  /** Opt in without changing the keyboard behavior of existing modal callers. */
  manageFocus?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  dismissible?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'max-w-md',
  scrollBody = false,
  manageFocus = false,
  initialFocusRef,
  dismissible = true,
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onClose, dismissible, initialFocusRef });
  callbacks.current = { onClose, dismissible, initialFocusRef };
  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background: { element: HTMLElement; inert: boolean }[] = [];
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]') || [])
      .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && !element.closest('[inert]') && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
    if (manageFocus && dialog) {
      // Disable each sibling branch up to body, without hiding/inerting our dialog.
      let branch: HTMLElement = dialog;
      while (branch.parentElement) {
        for (const sibling of branch.parentElement.children) {
          if (sibling !== branch && sibling instanceof HTMLElement) {
            background.push({ element: sibling, inert: sibling.inert });
            sibling.inert = true;
          }
        }
        if (branch.parentElement === document.body) break;
        branch = branch.parentElement;
      }
      (callbacks.current.initialFocusRef?.current || focusable()[0] || dialog).focus();
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (callbacks.current.dismissible) callbacks.current.onClose();
        if (manageFocus) { e.preventDefault(); e.stopPropagation(); }
      }
      if (manageFocus && e.key === 'Tab' && dialog) {
        const elements = focusable(), first = elements[0], last = elements[elements.length - 1];
        if (!first) { e.preventDefault(); dialog.focus(); }
        else if (!dialog.contains(document.activeElement) || (e.shiftKey ? document.activeElement === first || document.activeElement === dialog : document.activeElement === last || document.activeElement === dialog)) {
          e.preventDefault(); (e.shiftKey ? last : first).focus();
        }
      }
    };
    const containFocus = (e: FocusEvent) => {
      if (manageFocus && dialog && !dialog.contains(e.target as Node)) (focusable()[0] || dialog).focus();
    };
    window.addEventListener('keydown', handleKeyDown, manageFocus);
    if (manageFocus) document.addEventListener('focusin', containFocus);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, manageFocus);
      document.removeEventListener('focusin', containFocus);
      for (const { element, inert } of background) element.inert = inert;
      if (manageFocus && previousFocus?.isConnected && !previousFocus.matches(':disabled') && !previousFocus.closest('[inert]')) previousFocus.focus();
    };
  }, [isOpen, manageFocus]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      ref={dialogRef}
      tabIndex={manageFocus ? -1 : undefined}
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={() => { if (dismissible) onClose(); }}
    >
      <div
        className={`${themeTokens.surfaces.card} border ${themeTokens.surfaces.border} rounded-2xl w-full ${maxWidth} p-6 shadow-2xl relative ${scrollBody ? 'flex flex-col min-h-0 max-h-[calc(100vh-2rem)] supports-[height:100dvh]:max-h-[calc(100dvh-2rem)] overflow-hidden' : 'my-8'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between pb-3.5 border-b border-border/80 ${scrollBody ? 'shrink-0 gap-3' : ''}`}>
          <div>
            <h3 id={titleId} className="text-lg font-bold text-slate-100">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!dismissible}
            aria-label="Close modal"
            className="p-1.5 rounded-xl text-slate-400 hover:text-white light:hover:text-slate-100 hover:bg-surface-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className={`mt-4 ${scrollBody ? 'flex min-h-0 flex-col' : ''}`}>{children}</div>
      </div>
    </div>
  );
};
