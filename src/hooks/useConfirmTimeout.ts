import { useCallback, useEffect, useRef, useState } from 'react';

const CONFIRM_TIMEOUT_MS = 5000;

/**
 * Hook for two-click delete confirmations with auto-dismiss timeout.
 * Attach buttonRef to the delete button so clicking outside dismisses the confirm state.
 */
export function useConfirmTimeout(onConfirm: () => void) {
  const [showConfirm, setShowConfirm] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleConfirm = useCallback(() => {
    if (showConfirm) {
      clearTimer();
      onConfirm();
      setShowConfirm(false);
    } else {
      setShowConfirm(true);
      clearTimer();
      timeoutRef.current = setTimeout(() => {
        setShowConfirm(false);
      }, CONFIRM_TIMEOUT_MS);
    }
  }, [showConfirm, onConfirm, clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    setShowConfirm(false);
  }, [clearTimer]);

  // Dismiss on click outside the button
  useEffect(() => {
    if (!showConfirm) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        reset();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showConfirm, reset]);

  useEffect(() => {
    return clearTimer;
  }, [clearTimer]);

  return { showConfirm, handleConfirm, reset, buttonRef };
}
