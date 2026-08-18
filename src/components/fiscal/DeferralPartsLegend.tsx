'use client';

/**
 * Why one instalment becomes up to three movements.
 *
 * This is the teaching part of the wizard and the reason the module exists: booking a fracción
 * whole is what left 95 EUR of deductible interest invisible for two years and let a whole
 * instalment be marked 100% deductible by a stray click. Each card states the rule and the article
 * it comes from, so the split reads as law rather than as a preference of the app.
 */

import { DEFERRAL_PART_STYLE } from '@/components/fiscal/deferralPartStyles';
import { DEFERRAL_PART_OPTIONS } from '@/constants/finance';
import { useTranslate } from '@/hooks/useTranslations';
import { cn } from '@/utils/helpers';

export function DeferralPartsLegend() {
  const { t } = useTranslate();

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t('fiscal.deferrals.parts.title')}</h3>
        <p className="text-xs text-guard-muted mt-1">{t('fiscal.deferrals.parts.description')}</p>
      </div>

      {/* In ANEXO I column order, so a card and its column are always the same thing */}
      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {DEFERRAL_PART_OPTIONS.map((part) => (
          <li key={part} className={cn('rounded-lg border border-border p-3', DEFERRAL_PART_STYLE[part].surface)}>
            <p className={cn('text-sm font-semibold', DEFERRAL_PART_STYLE[part].text)}>
              {t(`fiscal.deferrals.parts.${part}.label`)}
            </p>
            <span
              className={cn(
                'inline-block mt-1.5 text-xs font-medium px-2 py-0.5 rounded-full',
                DEFERRAL_PART_STYLE[part].badge,
              )}
            >
              {t(`fiscal.deferrals.parts.${part}.deduction`)}
            </span>
            <p className="text-xs text-foreground/80 mt-2">{t(`fiscal.deferrals.parts.${part}.description`)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
