'use client';

/**
 * ANEXO I of an AEAT deferral resolution, editable row by row.
 *
 * The table is the heart of the import: a fracción is paid as one charge but is three legally
 * different things, so each part gets its own column, its own colour and its own deduction status
 * spelled out in the header. What the user reads here is what will be booked.
 *
 * Every cell is editable because the reading has to be correctable against the printed page — and
 * because {@link CreateDeferralSchema} refuses a letter that does not add up, so a misread digit
 * has to be fixable here or the import is stuck. Nothing is filled in for the user: the "total del
 * plazo" is edited like the rest and then checked, which is how a wrong digit surfaces instead of
 * being absorbed.
 *
 * The footer adds the rows up. It never writes those sums into the header's declared totals — the
 * two are compared, and a disagreement is a finding for the human, not something to paper over.
 */

import { AlertTriangle } from 'lucide-react';
import { useMemo } from 'react';
import {
  type DeferralFraccionDraft,
  deferralTotalsOfDrafts,
  type EditableFraccionField,
} from '@/components/fiscal/deferralDraft';
import { DEFERRAL_PART_STYLE } from '@/components/fiscal/deferralPartStyles';
import type { DeferralPart } from '@/constants/finance';
import { DEFERRAL_PART } from '@/constants/finance';
import { useTranslate } from '@/hooks/useTranslations';
import type { DeferralTotals } from '@/types/finance';
import { cn } from '@/utils/helpers';
import { formatCurrency } from '@/utils/money';

interface DeferralFraccionesTableProps {
  drafts: DeferralFraccionDraft[];
  /** The TOTAL GENERAL row of the letter, to flag a column that does not reconcile */
  declaredTotals: DeferralTotals;
  onFieldChange: (index: number, field: EditableFraccionField, value: string) => void;
}

/** One of the three part columns: which draft field it edits and which total it adds up to. */
interface PartColumn {
  part: DeferralPart;
  field: Extract<EditableFraccionField, 'principal' | 'surcharge' | 'interest'>;
  totalField: Exclude<keyof DeferralTotals, 'totalCents'>;
}

/** In the order ANEXO I prints its columns. */
const PART_COLUMNS: readonly PartColumn[] = [
  { part: DEFERRAL_PART.PRINCIPAL, field: 'principal', totalField: 'principalCents' },
  { part: DEFERRAL_PART.SURCHARGE, field: 'surcharge', totalField: 'surchargeCents' },
  { part: DEFERRAL_PART.INTEREST, field: 'interest', totalField: 'interestCents' },
];

const CELL_INPUT = cn(
  'w-28 px-2 py-1.5 rounded-md border border-input bg-background text-foreground text-sm text-right tabular-nums',
  'transition-colors duration-200 ease-out-quart',
);

const HEADER_CELL = 'px-3 py-2 text-xs font-semibold text-guard-muted uppercase tracking-wider align-bottom';

export function DeferralFraccionesTable({ drafts, declaredTotals, onFieldChange }: DeferralFraccionesTableProps) {
  const { t } = useTranslate();

  const computed = useMemo(() => deferralTotalsOfDrafts(drafts), [drafts]);

  /** A column total that disagrees with the letter is shown as such, never quietly corrected. */
  const isMismatched = (declared: number, actual: number) => declared !== actual;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] text-sm border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className={cn(HEADER_CELL, 'text-left')}>
              {t('fiscal.deferrals.columns.fraccion')}
            </th>
            {PART_COLUMNS.map(({ part, field }) => (
              <th key={part} scope="col" className={cn(HEADER_CELL, 'text-right')}>
                <span className={cn('block', DEFERRAL_PART_STYLE[part].text)}>
                  {t(`fiscal.deferrals.columns.${field}`)}
                </span>
                {/* The deduction status in words: colour never carries the meaning on its own */}
                <span
                  className={cn(
                    'mt-1 inline-block normal-case tracking-normal font-medium px-1.5 py-0.5 rounded',
                    DEFERRAL_PART_STYLE[part].badge,
                  )}
                >
                  {t(`fiscal.deferrals.parts.${part}.deduction`)}
                </span>
              </th>
            ))}
            <th scope="col" className={cn(HEADER_CELL, 'text-right')}>
              {t('fiscal.deferrals.columns.total')}
            </th>
            <th scope="col" className={cn(HEADER_CELL, 'text-left')}>
              {t('fiscal.deferrals.columns.due-date')}
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-border/50">
          {drafts.map((draft, index) => {
            const rowLabel = t('fiscal.deferrals.verification.fraccion-label', { number: draft.fraccionNumber });
            return (
              <tr key={draft.fraccionNumber}>
                <th scope="row" className="px-3 py-2 text-left font-medium text-foreground whitespace-nowrap">
                  {draft.fraccionNumber}
                </th>
                {PART_COLUMNS.map(({ part, field }) => (
                  <td key={part} className={cn('px-3 py-2 text-right', DEFERRAL_PART_STYLE[part].surface)}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={draft[field]}
                      aria-label={`${t(`fiscal.deferrals.columns.${field}`)} — ${rowLabel}`}
                      onChange={(e) => onFieldChange(index, field, e.target.value)}
                      className={CELL_INPUT}
                    />
                  </td>
                ))}
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={draft.total}
                    aria-label={`${t('fiscal.deferrals.columns.total')} — ${rowLabel}`}
                    onChange={(e) => onFieldChange(index, 'total', e.target.value)}
                    className={cn(CELL_INPUT, 'font-medium')}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="date"
                    value={draft.dueDate}
                    aria-label={`${t('fiscal.deferrals.columns.due-date')} — ${rowLabel}`}
                    onChange={(e) => onFieldChange(index, 'dueDate', e.target.value)}
                    className={cn(CELL_INPUT, 'w-40 text-left')}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>

        <tfoot>
          <tr className="border-t-2 border-border">
            <th scope="row" className="px-3 py-2.5 text-left text-xs font-semibold text-guard-muted uppercase">
              {t('fiscal.deferrals.confirm.totals-row')}
            </th>
            {PART_COLUMNS.map(({ part, totalField }) => {
              const mismatched = isMismatched(declaredTotals[totalField], computed[totalField]);
              return (
                <td
                  key={part}
                  className={cn(
                    'px-3 py-2.5 text-right tabular-nums font-semibold',
                    DEFERRAL_PART_STYLE[part].surface,
                    mismatched ? 'text-guard-warning' : DEFERRAL_PART_STYLE[part].text,
                  )}
                >
                  <span className="inline-flex items-center justify-end gap-1">
                    {mismatched && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                    {formatCurrency(computed[totalField])}
                  </span>
                </td>
              );
            })}
            <td
              className={cn(
                'px-3 py-2.5 text-right tabular-nums font-semibold',
                isMismatched(declaredTotals.totalCents, computed.totalCents) ? 'text-guard-warning' : 'text-foreground',
              )}
            >
              {formatCurrency(computed.totalCents)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
