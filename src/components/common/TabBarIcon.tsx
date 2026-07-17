import React from 'react';
import type { ColorValue } from 'react-native';
import * as LucideIcons from 'lucide-react-native';

type LucideIconComponent = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

const lucideIconMap = LucideIcons as unknown as Record<string, LucideIconComponent>;

const iconMap: Record<string, string> = {
  printer: 'Printer',
  archive: 'Archive',
  'list-ordered': 'ListOrdered',
  folder: 'Folder',
  menu: 'Menu',
  'check-circle': 'CheckCircle',
  'x-circle': 'CircleX',
  'alert-circle': 'AlertCircle',
  info: 'Info',
  clock: 'Clock3',
  pause: 'Pause',
  play: 'Play',
  stop: 'Square',
  loader: 'LoaderCircle',
  'chevron-right': 'ChevronRight',
  'chevron-left': 'ChevronLeft',
  'chevron-down': 'ChevronDown',
  x: 'X',
  plus: 'Plus',
  search: 'Search',
  filter: 'Filter',
  camera: 'Camera',
  settings: 'Settings',
  user: 'User',
  users: 'Users',
  bell: 'Bell',
  globe: 'Globe',
  'bar-chart': 'BarChart3',
  wrench: 'Wrench',
  package: 'Package',
  layers: 'Layers',
  link: 'Link2',
  'qr-code': 'QrCode',
  nfc: 'Radio',
  upload: 'Upload',
  download: 'Download',
  trash: 'Trash2',
  edit: 'Pencil',
  copy: 'Copy',
  share: 'Share2',
  refresh: 'RefreshCw',
  power: 'Power',
  thermometer: 'Thermometer',
  wind: 'Wind',
  lightbulb: 'Lightbulb',
  zap: 'Zap',
  cpu: 'Cpu',
  'hard-drive': 'HardDrive',
  shield: 'Shield',
  key: 'KeyRound',
  tag: 'Tag',
  star: 'Star',
  heart: 'Heart',
  file: 'File',
  'file-text': 'FileText',
  image: 'Image',
  video: 'Video',
  wifi: 'Wifi',
  'wifi-off': 'WifiOff',
};

function getIconComponent(name: string): LucideIconComponent {
  const iconName = iconMap[name] ?? 'Circle';
  return lucideIconMap[iconName] ?? lucideIconMap.Circle;
}

interface TabBarIconProps {
  name: string;
  color: ColorValue;
  size: number;
}

export function TabBarIcon({ name, color, size }: TabBarIconProps) {
  const IconComponent = getIconComponent(name);
  return <IconComponent size={size} color={String(color)} strokeWidth={2} />;
}

interface IconProps {
  name: string;
  size?: number;
  color?: ColorValue;
}

export function Icon({ name, size = 20, color }: IconProps) {
  const IconComponent = getIconComponent(name);
  return <IconComponent size={size} color={color ? String(color) : undefined} strokeWidth={2} />;
}
