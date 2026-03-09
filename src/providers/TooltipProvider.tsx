'use client';

/**
 * Radix Tooltip Provider
 * Wraps the app to enable instant tooltips with zero delay.
 */

import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <RadixTooltip.Provider delayDuration={0}>{children}</RadixTooltip.Provider>;
}
