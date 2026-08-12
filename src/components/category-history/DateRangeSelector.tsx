'use client';

/**
 * Date range selector pills for category history
 * Displays preset range options (3M, 6M, 1Y, All)
 */

import { TabBar, type TabBarItem } from '@/components/ui/TabBar';
import type { DateRangePreset } from '@/constants/finance';
import { DATE_RANGE_PRESET, TAB_BAR_VARIANT } from '@/constants/finance';
import { useTranslate } from '@/hooks/useTranslations';

interface DateRangeSelectorProps {
  value: DateRangePreset;
  onChange: (range: DateRangePreset) => void;
}

const RANGE_OPTIONS: DateRangePreset[] = [
  DATE_RANGE_PRESET.THREE_MONTHS,
  DATE_RANGE_PRESET.SIX_MONTHS,
  DATE_RANGE_PRESET.ONE_YEAR,
  DATE_RANGE_PRESET.ALL,
];

export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  const { t } = useTranslate();

  const tabs: TabBarItem<DateRangePreset>[] = RANGE_OPTIONS.map((range) => ({
    id: range,
    label: t(`category-history.range.${range}`),
  }));

  return (
    <TabBar
      tabs={tabs}
      activeTab={value}
      onChange={onChange}
      ariaLabel={t('category-history.title')}
      variant={TAB_BAR_VARIANT.PILLS_PRIMARY}
    />
  );
}
