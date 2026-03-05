import { useCallback, useEffect, useRef, useState } from 'react';

const CONFIRM_TIMEOUT_MS = 5000;

/**
 * Hook for two-click delete confirmations with auto-dismiss timeout.
 * Returns showConfirm state, a handleConfirm function, and a reset function.
 */
export function useConfirmTimeout(onConfirm: () => void) {
  const [showConfirm, setShowConfirm] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    return clearTimer;
  }, [clearTimer]);

  return { showConfirm, handleConfirm, reset };
}
