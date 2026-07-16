import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { useMutation } from '@tanstack/react-query';
import { MenuItem, SectionHeader } from '@/components/common/UIComponents';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/theme';
import { fontSize, fontWeight, spacing } from '@/theme/tokens';

const MENU_GROUPS = [
  {
    title: 'Configuration',
    items: [
      { icon: 'settings', label: 'Settings', subtitle: 'Server, integrations, backup, API keys', route: 'Settings' },
      { icon: 'users', label: 'Users', subtitle: 'Accounts, roles, LDAP, password reset', route: 'Users' },
      { icon: 'bell', label: 'Notifications', subtitle: 'Email delivery preferences', route: 'Notifications' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { icon: 'package', label: 'Inventory', subtitle: 'Spools, locations, bulk edits, forecast', route: 'Inventory' },
      { icon: 'wrench', label: 'Maintenance', subtitle: 'Per-printer tasks and service intervals', route: 'Maintenance' },
      { icon: 'layers', label: 'Projects', subtitle: 'Project plans, BOMs, print progress', route: 'Projects' },
      { icon: 'copy', label: 'Profiles', subtitle: 'Cloud, Orca, local, and K profiles', route: 'Profiles' },
      { icon: 'globe', label: 'MakerWorld', subtitle: 'Resolve, import, and browse recent models', route: 'MakerWorld' },
    ],
  },
  {
    title: 'Insights & tools',
    items: [
      { icon: 'bar-chart', label: 'Stats', subtitle: 'Print activity, filament trends, breakdowns', route: 'Stats' },
      { icon: 'cpu', label: 'System', subtitle: 'Health, resources, logs, support tools', route: 'System' },
      { icon: 'qr-code', label: 'Scanner', subtitle: 'Scan QR and NFC related data', route: 'Scanner' },
    ],
  },
] as const;

export default function MoreScreen() {
  const navigation = useNavigation<any>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'More' });
  }, [navigation]);

  const { colors } = useTheme();
  const { user, logout } = useAuth();
  const version = DeviceInfo.getVersion() || 'dev';

  const logoutMutation = useMutation({
    mutationFn: logout,
    // RootNavigator automatically switches to Login when user is cleared
  });

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.hero}>
        <Text style={[styles.heroTitle, { color: colors.text }]}>More</Text>
        <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}> 
          Signed in as {user?.username ?? 'Guest'}
        </Text>
      </View>

      {MENU_GROUPS.map(group => (
        <View key={group.title} style={styles.group}>
          <SectionHeader title={group.title} />
          <View>
            {group.items.map(item => (
              <MenuItem
                key={item.label}
                icon={item.icon}
                label={item.label}
                subtitle={item.subtitle}
                onPress={() => navigation.navigate(item.route as never)}
              />
            ))}
          </View>
        </View>
      ))}

      <View style={styles.accountCard}>
        <MenuItem
          icon="power"
          label={logoutMutation.isPending ? 'Signing out…' : 'Sign out'}
          subtitle="Disconnect this mobile session"
          onPress={() => void logoutMutation.mutateAsync()}
          destructive
        />
      </View>

      <Text style={[styles.version, { color: colors.textTertiary }]}>Bambuddy Mobile v{version}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  hero: {
    gap: spacing.xs,
  },
  heroTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
  heroSubtitle: {
    fontSize: fontSize.base,
  },
  group: {
    gap: spacing.sm,
  },
  accountCard: {
    marginTop: spacing.sm,
  },
  version: {
    textAlign: 'center',
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
  },
});
