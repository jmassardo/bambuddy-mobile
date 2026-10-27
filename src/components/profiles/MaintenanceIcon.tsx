import React from 'react';
import {
  Box,
  Cable,
  Calendar,
  CircleDot,
  Cog,
  Droplet,
  Fan,
  Filter,
  Flame,
  Layers,
  RefreshCw,
  Ruler,
  Settings,
  Sparkles,
  Square,
  Target,
  Thermometer,
  Timer,
  Wind,
  Wrench,
  Zap,
} from 'lucide-react-native';

export const maintenanceIcons = {
  Droplet,
  Flame,
  Ruler,
  Sparkles,
  Square,
  Cable,
  Wrench,
  Calendar,
  Timer,
  Cog,
  Fan,
  Zap,
  Wind,
  Thermometer,
  Layers,
  Box,
  Target,
  RefreshCw,
  Settings,
  Filter,
  CircleDot,
};
export function MaintenanceIcon({
  name,
  color,
}: {
  name: string | null;
  color: string;
}) {
  const Icon =
    name && name in maintenanceIcons
      ? maintenanceIcons[name as keyof typeof maintenanceIcons]
      : Wrench;
  return <Icon size={20} color={color} />;
}
