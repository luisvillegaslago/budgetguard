'use client';

/**
 * Embedded AEAT (Renta Web) walkthrough — replaces the finbooks PDF.
 *
 * For each casilla (1804-F, 1804-N, 0304, 0033) shows the precomputed
 * amount and the numbered steps to file it in the Spanish tax portal.
 * Each section is collapsible; the first one is open by default.
 */

import { ChevronDown, Info } from 'lucide-react';
import { useState } from 'react';
import { useCryptoModelo100Summary } from '@/hooks/useCryptoFiscal';
import { useTranslate } from '@/hooks/useTranslations';
import { cn } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface Props {
  year: number;
}

interface CasillaConfig {
  /** Translation key prefix relative to crypto.aeat. */
  keyPrefix: 'casilla-1804-f' | 'casilla-1804-n' | 'casilla-0304' | 'casilla-0033';
  /** Number of steps in the i18n bundle (so we can render the array deterministically). */
  stepCount: number;
  /** Function pulling the amount(s) from the API summary. Returns null when the section
   *  has multiple amounts that the steps will reference instead of a single headline figure. */
  amountCents: (summary: ModeloSummary) => number | { transmission: number; acquisition: number } | null;
}

type ModeloSummary = NonNullable<ReturnType<typeof useCryptoModelo100Summary>['data']>['summary'];

const CASILLAS: CasillaConfig[] = [
  {
    keyPrefix: 'casilla-1804-f',
    stepCount: 5,
    amountCents: (s) => ({
      transmission: s.casilla1804F.transmissionValueCents,
      acquisition: s.casilla1804F.acquisitionValueCents,
    }),
  },
  {
    keyPrefix: 'casilla-1804-n',
    stepCount: 4,
    amountCents: (s) => ({
      transmission: s.casilla1804N.transmissionValueCents,
      acquisition: s.casilla1804N.acquisitionValueCents,
    }),
  },
  {
    keyPrefix: 'casilla-0304',
    stepCount: 4,
    amountCents: (s) => s.casilla0304Cents,
  },
  {
    keyPrefix: 'casilla-0033',
    stepCount: 4,
    amountCents: (s) => s.casilla0033Cents,
  },
];

export function CryptoAeatGuide({ year }: Props) {
  const { t } = useTranslate();
  const summary = useCryptoModelo100Summary(year);
  const [openSection, setOpenSection] = useState<string | null>(CASILLAS[0]?.keyPrefix ?? null);

  if (summary.isLoading) {
    return <div className="bg-card rounded-xl border border-border p-6 h-32 animate-pulse" />;
  }

  const data = summary.data?.summary;
  if (!data) return null;

  return (
    <div className="bg-card rounded-xl border border-border p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('crypto.aeat.title')}</h2>
        <p className="text-sm text-guard-muted mt-1">{t('crypto.aeat.subtitle')}</p>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-guard-warning/30 bg-guard-warning/10 p-3 text-xs">
        <Info className="h-4 w-4 text-guard-warning mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-guard-warning">{t('crypto.aeat.disclaimer')}</p>
      </div>

      <div className="space-y-2">
        {CASILLAS.map((c) => {
          const isOpen = openSection === c.keyPrefix;
          const amount = c.amountCents(data);
          return (
            <CasillaAccordion
              key={c.keyPrefix}
              keyPrefix={c.keyPrefix}
              stepCount={c.stepCount}
              amount={amount}
              isOpen={isOpen}
              onToggle={() => setOpenSection(isOpen ? null : c.keyPrefix)}
            />
          );
        })}
      </div>
    </div>
  );
}

interface AccordionProps {
  keyPrefix: CasillaConfig['keyPrefix'];
  stepCount: number;
  amount: number | { transmission: number; acquisition: number } | null;
  isOpen: boolean;
  onToggle: () => void;
}

function CasillaAccordion({ keyPrefix, stepCount, amount, isOpen, onToggle }: AccordionProps) {
  const { t } = useTranslate();
  const titleKey = `crypto.aeat.${keyPrefix}.title`;
  const introKey = `crypto.aeat.${keyPrefix}.intro`;
  const noteKey = `crypto.aeat.${keyPrefix}.note`;

  // i18n step keys are 0-indexed: crypto.aeat.casilla-XXXX.steps.0, .1, ...
  const steps = Array.from({ length: stepCount }, (_, i) => t(`crypto.aeat.${keyPrefix}.steps.${i}`));

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">{t(titleKey)}</h3>
          {amount !== null && typeof amount === 'number' && (
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted shrink-0">{formatCurrency(amount)}</span>
          )}
          {amount !== null && typeof amount === 'object' && (
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted shrink-0">
              {formatCurrency(amount.transmission)} / {formatCurrency(amount.acquisition)}
            </span>
          )}
        </div>
        <ChevronDown
          className={cn('h-4 w-4 text-guard-muted transition-transform shrink-0', !isOpen && '-rotate-90')}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div className="px-4 pb-4 pt-1 border-t border-border space-y-3 text-sm">
          <p className="text-guard-muted">{t(introKey)}</p>

          {amount !== null && typeof amount === 'object' && (
            <div className="rounded-md bg-muted/40 p-3 space-y-1 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-guard-muted">{t('crypto.fiscal.fields.transmission-value')}</span>
                <span className="text-foreground">{formatCurrency(amount.transmission)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-guard-muted">{t('crypto.fiscal.fields.acquisition-value')}</span>
                <span className="text-foreground">{formatCurrency(amount.acquisition)}</span>
              </div>
            </div>
          )}

          {amount !== null && typeof amount === 'number' && (
            <div className="rounded-md bg-muted/40 p-3 flex justify-between text-xs font-mono">
              <span className="text-guard-muted">{t('crypto.aeat.amount-to-enter')}</span>
              <span className="text-foreground">{formatCurrency(amount)}</span>
            </div>
          )}

          <ol className="list-decimal pl-5 space-y-1.5 text-foreground">
            {steps.map((step) => (
              <li key={`${keyPrefix}-${step.slice(0, 32)}`}>{step}</li>
            ))}
          </ol>

          <p className="text-xs text-guard-muted italic">{t(noteKey)}</p>
        </div>
      )}
    </div>
  );
}
