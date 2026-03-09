'use client';

/**
 * BudgetGuard Settings Page
 * Sections: General (language), Categories, Database (dev-only)
 */

import { Building2, Database, Globe, Settings, Tag } from 'lucide-react';
import { useState } from 'react';
import { CategoryManagementPanel } from '@/components/categories/CategoryManagementPanel';
import { CompanyManagementPanel } from '@/components/settings/CompanyManagementPanel';
import { DbSyncPanel } from '@/components/settings/DbSyncPanel';
import { LanguageSelector } from '@/components/settings/LanguageSelector';
import { useTranslate } from '@/hooks/useTranslations';
import { cn } from '@/utils/helpers';

type SettingsSection = 'general' | 'categories' | 'companies' | 'database';

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
  { id: 'database', i18nKey: 'settings.sections.database', icon: Database, devOnly: true },
];

export default function SettingsPage() {
  const { t } = useTranslate();
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');

  const visibleSections = SECTIONS.filter((section) => !section.devOnly || process.env.NODE_ENV === 'development');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-2 mb-8">
        <Settings className="h-5 w-5 text-guard-primary" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-foreground">{t('settings.title')}</h1>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 mb-8 border-b border-border">
        {visibleSections.map((section) => {
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
                activeSection === section.id
                  ? 'border-guard-primary text-guard-primary'
                  : 'border-transparent text-guard-muted hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {t(section.i18nKey)}
            </button>
          );
        })}
      </div>

      {/* Section Content */}
      {activeSection === 'general' && <LanguageSelector />}

      {activeSection === 'categories' && <CategoryManagementPanel />}

      {activeSection === 'companies' && <CompanyManagementPanel />}

      {activeSection === 'database' && <DbSyncPanel />}
    </div>
  );
}
