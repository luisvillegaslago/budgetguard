/**
 * BudgetGuard Category Icon
 * Shared icon mapping for category display across components
 */

import {
  AlertCircle,
  Banknote,
  Beer,
  Briefcase,
  Calendar,
  Car,
  Cloud,
  Dog,
  Dumbbell,
  Home,
  type LucideIcon,
  Plane,
  PlusCircle,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Utensils,
} from 'lucide-react';

export const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  home: Home,
  dog: Dog,
  briefcase: Briefcase,
  dumbbell: Dumbbell,
  cloud: Cloud,
  'shopping-cart': ShoppingCart,
  car: Car,
  utensils: Utensils,
  'shopping-bag': ShoppingBag,
  beer: Beer,
  'alert-circle': AlertCircle,
  plane: Plane,
  calendar: Calendar,
  banknote: Banknote,
  receipt: Receipt,
  'plus-circle': PlusCircle,
};

interface CategoryIconProps {
  icon: string | null | undefined;
  color: string;
  className?: string;
}

/**
 * Renders a category icon with its associated color.
 * Falls back to AlertCircle if the icon name is not found.
 */
export function CategoryIcon({ icon, color, className = 'h-4 w-4' }: CategoryIconProps) {
  const IconComponent = icon ? CATEGORY_ICON_MAP[icon] : AlertCircle;
  if (!IconComponent) return <AlertCircle className={className} style={{ color }} aria-hidden="true" />;

  return <IconComponent className={className} style={{ color }} aria-hidden="true" />;
}
