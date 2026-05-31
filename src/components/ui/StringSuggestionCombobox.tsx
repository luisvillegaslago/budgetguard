'use client';

/**
 * BudgetGuard String Suggestion Combobox
 * Free-text combobox: pick an existing suggestion or type a brand-new value
 * (which simply becomes the field value — no server-side creation needed).
 * Uses fixed positioning to escape overflow containers (e.g. modals).
 */

import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslate } from '@/hooks/useTranslations';
import { cn } from '@/utils/helpers';

interface DropdownPosition {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
}

interface StringSuggestionComboboxProps {
  value: string | null;
  onChange: (value: string | null) => void;
  suggestions: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  id?: string;
  // When false, typing a value not in `suggestions` won't offer to add it.
  // Use for filter-style comboboxes that must stay within the known set.
  allowCreate?: boolean;
  // Optional display transform: the value stays the raw string, but the label
  // shown in the trigger and options can be decorated (e.g. "BTCUSDC (44)").
  getOptionLabel?: (value: string) => string;
}

export function StringSuggestionCombobox({
  value,
  onChange,
  suggestions,
  placeholder,
  searchPlaceholder,
  disabled,
  id,
  allowCreate = true,
  getOptionLabel,
}: StringSuggestionComboboxProps) {
  const { t } = useTranslate();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownPos, setDropdownPos] = useState<DropdownPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return suggestions;
    const q = search.toLowerCase().trim();
    return suggestions.filter((s) => s.toLowerCase().includes(q));
  }, [suggestions, search]);

  const trimmedSearch = search.trim();
  const showCreateOption =
    allowCreate &&
    trimmedSearch.length > 0 &&
    !suggestions.some((s) => s.toLowerCase() === trimmedSearch.toLowerCase());

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const closeDropdown = () => {
    setIsOpen(false);
    setSearch('');
  };

  const handleSelect = (suggestion: string) => {
    onChange(suggestion);
    closeDropdown();
  };

  const handleCreate = () => {
    if (!trimmedSearch) return;
    onChange(trimmedSearch);
    closeDropdown();
  };

  const handleClear = () => {
    onChange(null);
    setSearch('');
  };

  const handleToggle = () => {
    if (disabled) return;
    const willOpen = !isOpen;
    if (willOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownHeight = 240;
      const openUp = spaceBelow < dropdownHeight && rect.top > spaceBelow;

      setDropdownPos(
        openUp
          ? { bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width }
          : { top: rect.bottom + 4, left: rect.left, width: rect.width },
      );
    }
    setIsOpen(willOpen);
    if (willOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const firstMatch = filtered[0];
      if (firstMatch && !showCreateOption) {
        handleSelect(firstMatch);
      } else if (showCreateOption) {
        handleCreate();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown();
    }
  };

  const resolvedPlaceholder = placeholder ?? t('skydiving.suggestion-selector.placeholder');
  const resolvedSearchPlaceholder = searchPlaceholder ?? t('skydiving.suggestion-selector.search');

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <div
        id={id}
        className={cn(
          'w-full flex items-center justify-between px-4 py-2.5 rounded-lg border bg-background text-left text-sm',
          'transition-colors duration-200 ease-out-quart',
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-guard-primary/50 cursor-pointer',
          isOpen ? 'border-guard-primary ring-2 ring-guard-primary' : 'border-input',
        )}
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
          }
        }}
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="truncate min-w-0">
          {value ? (
            <span className="text-foreground">{getOptionLabel ? getOptionLabel(value) : value}</span>
          ) : (
            <span className="text-guard-muted">{resolvedPlaceholder}</span>
          )}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {value && !disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="p-0.5 hover:bg-muted rounded"
              aria-label={t('common.buttons.clear')}
            >
              <X className="h-3 w-3 text-guard-muted" aria-hidden="true" />
            </button>
          )}
          <ChevronsUpDown className="h-4 w-4 text-guard-muted" aria-hidden="true" />
        </span>
      </div>

      {/* Dropdown — fixed positioning to escape overflow containers */}
      {isOpen && dropdownPos && (
        <div
          className="fixed z-[100] rounded-lg border border-border bg-background shadow-md animate-fade-in"
          style={{
            top: dropdownPos.top != null ? `${dropdownPos.top}px` : undefined,
            bottom: dropdownPos.bottom != null ? `${dropdownPos.bottom}px` : undefined,
            left: `${dropdownPos.left}px`,
            width: `${dropdownPos.width}px`,
          }}
        >
          {/* Search input */}
          <div className="p-2 border-b border-border">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={resolvedSearchPlaceholder}
              className="w-full px-3 py-1.5 text-sm rounded-md border border-input bg-background text-foreground focus:ring-2 focus:ring-guard-primary focus:border-transparent"
              autoComplete="off"
            />
          </div>

          {/* Options list */}
          <div className="max-h-48 overflow-y-auto p-1">
            {filtered.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => handleSelect(suggestion)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md text-left',
                  'hover:bg-muted transition-colors',
                  value === suggestion && 'bg-guard-primary/10 text-guard-primary',
                )}
              >
                {value === suggestion ? (
                  <Check className="h-4 w-4 text-guard-primary shrink-0" aria-hidden="true" />
                ) : (
                  <span className="w-4 shrink-0" />
                )}
                <span className="truncate">{getOptionLabel ? getOptionLabel(suggestion) : suggestion}</span>
              </button>
            ))}

            {/* Create option */}
            {showCreateOption && (
              <button
                type="button"
                onClick={handleCreate}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md text-left text-guard-primary hover:bg-guard-primary/10 transition-colors"
              >
                <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {t('skydiving.suggestion-selector.add')} &ldquo;{trimmedSearch}&rdquo;
                </span>
              </button>
            )}

            {filtered.length === 0 && !showCreateOption && (
              <p className="px-3 py-2 text-sm text-guard-muted text-center">
                {t('skydiving.suggestion-selector.empty')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
