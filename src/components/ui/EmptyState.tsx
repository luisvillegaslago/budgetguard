import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

/**
 * Reusable empty state component with hero icon, title, optional subtitle and CTA.
 */
export function EmptyState({ icon: Icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="text-center py-8 text-guard-muted">
      <Icon className="h-12 w-12 mx-auto mb-3 opacity-30" aria-hidden="true" />
      <p>{title}</p>
      {subtitle && <p className="text-sm mt-1">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
