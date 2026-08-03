import { useCallback, useEffect } from 'react';

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface FocusTrapOptions {
  /**
   * Handle the key before any other trap sees it, and stop it there.
   *
   * Needed by a dialog opened on top of another one: both traps listen on
   * `document`, so without capturing, Escape reaches the outer dialog and closes
   * it, and Tab is moved by the outer trap over ITS own focusable list — which
   * includes everything behind the backdrop.
   */
  capture?: boolean;
}

/**
 * Hook to trap focus within a dialog element and handle Escape key.
 * @param ref - Ref to the dialog container element
 * @param onEscape - Optional callback when Escape is pressed
 * @param options - See {@link FocusTrapOptions}
 */
export function useFocusTrap(
  ref: React.RefObject<HTMLElement | null>,
  onEscape?: () => void,
  options: FocusTrapOptions = {},
) {
  const { capture = false } = options;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) {
        if (capture) e.stopImmediatePropagation();
        onEscape();
        return;
      }

      if (e.key === 'Tab' && ref.current) {
        const focusable = ref.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        // Owning the key outright: an outer trap would otherwise move focus too,
        // landing it on an element behind this dialog
        if (capture) e.stopImmediatePropagation();

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    },
    [ref, onEscape, capture],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, capture);
    return () => document.removeEventListener('keydown', handleKeyDown, capture);
  }, [handleKeyDown, capture]);
}
