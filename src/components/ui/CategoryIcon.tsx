/**
 * BudgetGuard Category Icon
 * Shared icon mapping for category display across components
 */

import {
  AlertCircle,
  Banknote,
  Bed,
  Beer,
  Briefcase,
  Building2,
  Calendar,
  Car,
  ChefHat,
  Cloud,
  Cpu,
  Dog,
  Dumbbell,
  Ellipsis,
  Flag,
  Flame,
  Fuel,
  Home,
  Landmark,
  type LucideIcon,
  MountainSnow,
  Package,
  Plane,
  PlusCircle,
  Receipt,
  Shield,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  SprayCan,
  SquareParking,
  Ticket,
  TrainFront,
  Trophy,
  Utensils,
  Warehouse,
  Wifi,
  Wine,
  Zap,
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
  wifi: Wifi,
  flame: Flame,
  zap: Zap,
  warehouse: Warehouse,
  'building-2': Building2,
  package: Package,
  wine: Wine,
  shirt: Shirt,
  'spray-can': SprayCan,
  trophy: Trophy,
  flag: Flag,
  shield: Shield,
  landmark: Landmark,
  cpu: Cpu,
  fuel: Fuel,
  'square-parking': SquareParking,
  'train-front': TrainFront,
  bed: Bed,
  'chef-hat': ChefHat,
  ticket: Ticket,
  'mountain-snow': MountainSnow,
  ellipsis: Ellipsis,
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
