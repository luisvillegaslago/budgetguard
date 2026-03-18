'use client';

import { useEffect, useRef } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface ModalBackdropProps {
  children: React.ReactNode;
  onClose: () => void;
  labelledBy: string;
  /** Whether Escape key should close the modal. Defaults to true. */
  escapeClose?: boolean;
}

/**
 * Reusable modal backdrop with focus trap, Escape key handler, and animations.
 * Does NOT close on backdrop click (user must use X button or Escape).
 */
export function ModalBackdrop({ children, onClose, labelledBy, escapeClose = true }: ModalBackdropProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef, escapeClose ? onClose : undefined);

  // Prevent background scroll while modal is open (iOS-compatible)
  useEffect(() => {
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      window.scrollTo(0, scrollY);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 bg-guard-dark/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-backdrop-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onClick={(e) => {
        // Only close if clicking the backdrop itself, not children
        if (e.target === e.currentTarget && escapeClose) {
          // Do not close on backdrop click — user must use X button or Escape
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && escapeClose) onClose();
      }}
    >
      <div ref={dialogRef}>{children}</div>
    </div>
  );
}
