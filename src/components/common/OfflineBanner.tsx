import { StyleSheet, Text, View } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { useTheme } from '../../theme';
import { spacing, fontSize } from '../../theme/tokens';

interface OfflineBannerProps {
  isOffline: boolean;
}

export function OfflineBanner({ isOffline }: OfflineBannerProps) {
  const { colors } = useTheme();

  if (!isOffline) return null;

  return (
    <View style={[styles.banner, { backgroundColor: `${colors.warning}20`, borderBottomColor: colors.warning + '40' }]}>
      <WifiOff size={16} color={colors.warning} style={styles.icon} strokeWidth={2.5} />
      <Text style={[styles.message, { color: colors.warning }]}>No network connection. Showing cached data.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  icon: {
    marginRight: spacing.sm,
  },
  message: {
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
});
