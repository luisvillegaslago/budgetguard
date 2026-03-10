/**
 * Navigation configuration
 * Defines sidebar items grouped by section
 */

import type { LucideIcon } from 'lucide-react';
import { Calculator, Cloud, FileText, LayoutDashboard, List, Plane, Repeat, Settings } from 'lucide-react';

export interface NavItem {
  path: string;
  icon: LucideIcon;
  i18nKey: string;
}

export interface NavGroup {
  i18nKey: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    i18nKey: 'navigation.groups.finance',
    items: [
      { path: '/dashboard', icon: LayoutDashboard, i18nKey: 'navigation.items.dashboard' },
      { path: '/movements', icon: List, i18nKey: 'navigation.items.movements' },
      { path: '/recurring-expenses', icon: Repeat, i18nKey: 'navigation.items.recurring' },
    ],
  },
  {
    i18nKey: 'navigation.groups.activities',
    items: [
      { path: '/trips', icon: Plane, i18nKey: 'navigation.items.trips' },
      { path: '/skydiving', icon: Cloud, i18nKey: 'navigation.items.skydiving' },
    ],
  },
  {
    i18nKey: 'navigation.groups.professional',
    items: [
      { path: '/invoices', icon: FileText, i18nKey: 'navigation.items.invoices' },
      { path: '/fiscal', icon: Calculator, i18nKey: 'navigation.items.fiscal' },
    ],
  },
];

export const SETTINGS_NAV: NavItem = {
  path: '/settings',
  icon: Settings,
  i18nKey: 'navigation.items.settings',
};
