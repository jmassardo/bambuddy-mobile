import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Icon } from './TabBarIcon';
import { useTheme } from '../../theme';
import { fontSize, spacing } from '../../theme/tokens';

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = 'Loading...' }: LoadingScreenProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
  '📍': 'globe',
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

export function EmptyState({ icon = '📭', title, message }: EmptyStateProps) {
  const { colors } = useTheme();
  const iconName = EMPTY_STATE_ICON_MAP[icon] ?? icon;

  return (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIconWrap, { backgroundColor: colors.surfaceElevated }]}>
        <Icon name={iconName} size={28} color={colors.textTertiary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      {message && (
        <Text style={[styles.emptyMessage, { color: colors.textSecondary }]}>{message}</Text>
      )}
    </View>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIconWrap, { backgroundColor: `${colors.error}18` }]}>
        <Icon name="alert-circle" size={28} color={colors.error} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.error }]}>Error</Text>
      <Text style={[styles.emptyMessage, { color: colors.textSecondary }]}>{message}</Text>
      {onRetry && (
        <Text
          style={[styles.retryButton, { color: colors.accent }]}
          onPress={onRetry}
        >
          Tap to retry
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
    fontSize: fontSize.base,
    fontWeight: '600',
  },
});
