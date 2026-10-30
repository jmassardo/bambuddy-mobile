import { translateNative, useNativeLocale, useTranslation } from '@/i18n';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  AlertCircle,
  Archive,
  BarChart3,
  Bell,
  Clock3,
  FileText,
  Folder,
  Globe,
  Layers,
  Link2,
  ListOrdered,
  MapPin,
  Package,
  Power,
  Printer,
  Radio,
  Shield,
  Trash2,
  Users,
  WifiOff,
  Wrench,
} from 'lucide-react-native';
import { useTheme } from '../../theme';
import { fontSize, spacing } from '../../theme/tokens';
import { PrimaryButton } from './AppUI';

interface LoadingScreenProps {
  message?: string;
  inline?: boolean;
}

export function LoadingScreen({ message = translateNative('common.loading'), inline = false }: LoadingScreenProps) {
  useNativeLocale();
  const { colors } = useTheme();
  useTranslation();

  return (
    <View style={[inline ? styles.inlineContainer : styles.container, !inline && { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
    </View>
  );
}

interface EmptyStateProps {
  icon?: string;
  title: string;
  message?: string;
}

const EMPTY_STATE_ICON_MAP: Record<string, string> = {
  '📭': 'archive',
  '📦': 'package',
  '🖨️': 'printer',
  '🖨': 'printer',
  '📋': 'list-ordered',
  '🕘': 'clock',
  '🕒': 'clock',
  '🗓': 'clock',
  '🗓️': 'clock',
  '📁': 'folder',
  '🗑️': 'trash',
  '🗂': 'layers',
  '📉': 'bar-chart',
  '🧵': 'package',
  '📍': 'map-pin',
  '👥': 'users',
  '📜': 'file-text',
  '📝': 'file-text',
  '🧾': 'file-text',
  '📡': 'nfc',
  '🌐': 'globe',
  '🔔': 'bell',
  '🔗': 'link',
  '⏻': 'power',
  '🧰': 'wrench',
  '🧱': 'layers',
  '📨': 'bell',
  '🛡': 'shield',
};

const EMPTY_STATE_ICONS: Record<
  string,
  React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
> = {
  archive: Archive,
  package: Package,
  printer: Printer,
  'list-ordered': ListOrdered,
  clock: Clock3,
  folder: Folder,
  trash: Trash2,
  layers: Layers,
  'bar-chart': BarChart3,
  globe: Globe,
  'map-pin': MapPin,
  users: Users,
  'file-text': FileText,
  nfc: Radio,
  bell: Bell,
  link: Link2,
  power: Power,
  wrench: Wrench,
  shield: Shield,
};

export function EmptyState({ icon = '📭', title, message }: EmptyStateProps) {
  useNativeLocale();
  const { colors } = useTheme();
  useTranslation();
  const iconName = EMPTY_STATE_ICON_MAP[icon] ?? icon;
  const IconComponent = EMPTY_STATE_ICONS[iconName] ?? Archive;

  return (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIconWrap, { backgroundColor: colors.surfaceElevated }]}>
        <IconComponent size={28} color={colors.textTertiary} strokeWidth={2} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      {message && (
        <Text style={[styles.emptyMessage, { color: colors.textSecondary }]}>{message}</Text>
      )}
    </View>
  );
}

interface OfflineStateProps {
  message?: string;
  onRetry?: () => void;
}

export function OfflineState({ message = translateNative('native.c1644b8beb53389c'), onRetry }: OfflineStateProps) {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIconWrap, { backgroundColor: `${colors.warning}18` }]}>
        <WifiOff size={28} color={colors.warning} strokeWidth={2} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.warning }]}>{t('common.offline', { defaultValue: 'No network' })}</Text>
      <Text style={[styles.emptyMessage, { color: colors.textSecondary }]}>{message}</Text>
      {onRetry && (
        <View style={styles.retryButton}>
          <PrimaryButton label={t('common.retry')} variant="secondary" onPress={onRetry} />
        </View>
      )}
    </View>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIconWrap, { backgroundColor: `${colors.error}18` }]}>
        <AlertCircle size={28} color={colors.error} strokeWidth={2} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.error }]}>{t('common.error')}</Text>
      <Text style={[styles.emptyMessage, { color: colors.textSecondary }]} accessibilityRole="alert">{message}</Text>
      {onRetry && (
        <View style={styles.retryButton}>
          <PrimaryButton label={t('common.retry')} variant="secondary" onPress={onRetry} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inlineContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: {
    marginTop: spacing.lg,
    fontSize: fontSize.base,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing['3xl'],
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyMessage: {
    fontSize: fontSize.base,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryButton: {
    marginTop: spacing.lg,
  },
});
