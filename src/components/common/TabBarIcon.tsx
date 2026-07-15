// Simple icon component using Unicode/Emoji as fallback
// In a production app, you'd use @expo/vector-icons or lucide-react-native
import { Text, StyleSheet, type ColorValue } from 'react-native';

const iconMap: Record<string, string> = {
  // Tab icons
  'printer': '🖨️',
  'archive': '📦',
  'list-ordered': '📋',
  'folder': '📁',
  'menu': '☰',
  // Status
  'check-circle': '✅',
  'x-circle': '❌',
  'alert-circle': '⚠️',
  'info': 'ℹ️',
  'clock': '🕐',
  'pause': '⏸',
  'play': '▶️',
  'stop': '⏹',
  'loader': '⏳',
  // Navigation
  'chevron-right': '›',
  'chevron-left': '‹',
  'chevron-down': '⌄',
  'x': '✕',
  'plus': '+',
  'search': '🔍',
  'filter': '⚙',
  // Features
  'camera': '📷',
  'settings': '⚙️',
  'user': '👤',
  'users': '👥',
  'bell': '🔔',
  'globe': '🌍',
  'bar-chart': '📊',
  'wrench': '🔧',
  'package': '📦',
  'layers': '🗂',
  'link': '🔗',
  'qr-code': '📱',
  'nfc': '📡',
  'upload': '⬆️',
  'download': '⬇️',
  'trash': '🗑',
  'edit': '✏️',
  'copy': '📋',
  'share': '🔗',
  'refresh': '🔄',
  'power': '⏻',
  'thermometer': '🌡',
  'wind': '💨',
  'lightbulb': '💡',
  'zap': '⚡',
  'cpu': '💻',
  'hard-drive': '💾',
  'shield': '🛡',
  'key': '🔑',
  'tag': '🏷',
  'star': '⭐',
  'heart': '❤️',
  'file': '📄',
  'file-text': '📝',
  'image': '🖼',
  'video': '🎬',
  'wifi': '📶',
  'wifi-off': '📵',
};

interface TabBarIconProps {
  name: string;
  color: ColorValue;
  size: number;
}

export function TabBarIcon({ name, color, size }: TabBarIconProps) {
  const icon = iconMap[name] || '•';
  return (
    <Text style={[styles.icon, { fontSize: size - 4, color }]}>
      {icon}
    </Text>
  );
}

interface IconProps {
  name: string;
  size?: number;
  color?: ColorValue;
}

export function Icon({ name, size = 20, color }: IconProps) {
  const icon = iconMap[name] || '•';
  return (
    <Text style={[styles.icon, { fontSize: size - 2, color }]}>
      {icon}
    </Text>
  );
}

const styles = StyleSheet.create({
  icon: {
    textAlign: 'center',
  },
});
