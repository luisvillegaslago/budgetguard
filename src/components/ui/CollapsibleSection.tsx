'use client';

import { ChevronDown } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { cn } from '@/utils/helpers';

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function CollapsibleSection({ title, children, defaultOpen = true, className }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={cn('card', className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full text-left"
      >
        <h3 className="text-lg font-bold text-foreground">{title}</h3>
        <ChevronDown
          className={cn('h-5 w-5 text-guard-muted transition-transform duration-200', !isOpen && '-rotate-90')}
          aria-hidden="true"
        />
      </button>
      {isOpen && <div className="mt-4">{children}</div>}
    </div>
  );
}
