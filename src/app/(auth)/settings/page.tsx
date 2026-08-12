'use client';

/**
 * BudgetGuard Settings Page
 * Sections: General (language), Categories, Database (dev-only)
 */

import { Bell, Bitcoin, Building2, Database, Globe, Receipt, Settings, Tag } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { CategoryManagementPanel } from '@/components/categories/CategoryManagementPanel';
import { BillingProfileForm } from '@/components/settings/BillingProfileForm';
import { BinanceCredentialsForm } from '@/components/settings/BinanceCredentialsForm';
import { CompanyManagementPanel } from '@/components/settings/CompanyManagementPanel';
import { DbSyncPanel } from '@/components/settings/DbSyncPanel';
import { FiscalReminderSettings } from '@/components/settings/FiscalReminderSettings';
import { InvoicePrefixPanel } from '@/components/settings/InvoicePrefixPanel';
import { LanguageSelector } from '@/components/settings/LanguageSelector';
import { ThemeSelector } from '@/components/settings/ThemeSelector';
import { TabBar, type TabBarItem } from '@/components/ui/TabBar';
import { useTranslate } from '@/hooks/useTranslations';

type SettingsSection = 'general' | 'categories' | 'companies' | 'billing' | 'reminders' | 'crypto' | 'database';

interface SectionConfig {
  id: SettingsSection;
  i18nKey: string;
  icon: typeof Settings;
  devOnly?: boolean;
}

const SECTIONS: SectionConfig[] = [
  { id: 'general', i18nKey: 'settings.sections.general', icon: Globe },
  { id: 'categories', i18nKey: 'settings.sections.categories', icon: Tag },
  { id: 'companies', i18nKey: 'settings.sections.companies', icon: Building2 },
  { id: 'billing', i18nKey: 'settings.sections.billing', icon: Receipt },
  { id: 'reminders', i18nKey: 'settings.sections.reminders', icon: Bell },
  { id: 'crypto', i18nKey: 'settings.sections.crypto', icon: Bitcoin },
  { id: 'database', i18nKey: 'settings.sections.database', icon: Database, devOnly: true },
];

// Derived from SECTIONS so a dev-only section can never be reached from a URL in
// production — that would both render the panel and leave the tab bar with no
// matching entry.
const VISIBLE_SECTIONS = SECTIONS.filter((section) => !section.devOnly || process.env.NODE_ENV === 'development');
const VALID_SECTIONS = new Set<string>(VISIBLE_SECTIONS.map((section) => section.id));

function resolveInitialTab(param: string | null): SettingsSection {
  return param && VALID_SECTIONS.has(param) ? (param as SettingsSection) : 'general';
}

export default function SettingsPage() {
  const { t } = useTranslate();
  const searchParams = useSearchParams();
  const [activeSection, setActiveSectionState] = useState<SettingsSection>(() =>
    resolveInitialTab(searchParams.get('tab')),
  );

  const setActiveSection = useCallback((section: SettingsSection) => {
    setActiveSectionState(section);
    // Sync URL without full navigation
    const url = new URL(window.location.href);
    if (section === 'general') {
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('tab', section);
    }
    window.history.replaceState({}, '', url.toString());
  }, []);

  const tabs: TabBarItem<SettingsSection>[] = VISIBLE_SECTIONS.map((section) => ({
    id: section.id,
    label: t(section.i18nKey),
    icon: section.icon,
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-2 mb-8">
        <Settings className="h-5 w-5 text-guard-primary" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-foreground">{t('settings.title')}</h1>
      </div>

      {/* Section tabs */}
      <TabBar
        tabs={tabs}
        activeTab={activeSection}
        onChange={setActiveSection}
        ariaLabel={t('settings.title')}
        className="mb-8"
      />

      {/* Section Content */}
      {activeSection === 'general' && (
        <div className="space-y-6">
          <ThemeSelector />
          <LanguageSelector />
        </div>
      )}

      {activeSection === 'categories' && <CategoryManagementPanel />}

      {activeSection === 'companies' && <CompanyManagementPanel />}

      {activeSection === 'billing' && (
        <div className="space-y-6">
          <BillingProfileForm />
          <InvoicePrefixPanel />
        </div>
      )}

      {activeSection === 'reminders' && <FiscalReminderSettings />}

      {activeSection === 'crypto' && <BinanceCredentialsForm />}

      {activeSection === 'database' && <DbSyncPanel />}
    </div>
  );
}
