import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/theme';
import { fontSize, fontWeight, spacing } from '@/theme/tokens';
import {
  PrimaryButton,
  SectionCard,
  SettingRow,
} from '@/components/common/AppUI';

const GROUPS = [
  {
    title: 'Monitoring',
    items: [
      { icon: 'bar-chart', label: 'Stats', route: 'Stats' },
      { icon: 'package', label: 'Inventory', route: 'Inventory' },
      { icon: 'wrench', label: 'Maintenance', route: 'Maintenance' },
    ],
  },
  {
    title: 'Management',
    items: [
      { icon: 'layers', label: 'Projects', route: 'Projects' },
      { icon: 'copy', label: 'Profiles', route: 'Profiles' },
      { icon: 'bell', label: 'Notifications', route: 'Notifications' },
      { icon: 'globe', label: 'MakerWorld', route: 'MakerWorld' },
    ],
  },
  {
    title: 'System',
    items: [
      { icon: 'settings', label: 'Settings', route: 'Settings' },
      { icon: 'users', label: 'Users & Groups', route: 'Users' },
      { icon: 'cpu', label: 'System Info', route: 'System' },
      { icon: 'qr-code', label: 'Scanner', route: 'Scanner' },
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

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () =>
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] }),
  });

  const version = DeviceInfo.getVersion() || 'dev';

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

      {GROUPS.map(group => (
        <View key={group.title} style={styles.group}>
          <Text style={[styles.groupTitle, { color: colors.textTertiary }]}>
            {group.title}
          </Text>
          <SectionCard>
            {group.items.map((item, index) => (
              <View
                key={item.label}
                style={
                  index === group.items.length - 1 ? styles.lastRow : undefined
                }
              >
                <SettingRow
                  icon={item.icon}
                  label={item.label}
                  onPress={() => navigation.navigate(item.route as never)}
                />
              </View>
            ))}
          </SectionCard>
        </View>
      ))}

      <SectionCard
        title="Account"
        subtitle="Manage your session and connected server."
      >
        <PrimaryButton
          label={logoutMutation.isPending ? 'Signing out…' : 'Sign out'}
          onPress={() => void logoutMutation.mutateAsync()}
          variant="secondary"
        />
      </SectionCard>

      <Text style={[styles.version, { color: colors.textTertiary }]}>
        Bambuddy Mobile v{version}
      </Text>
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
  groupTitle: {
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginLeft: spacing.xs,
  },
  lastRow: {
    marginBottom: -spacing.md,
  },
  version: {
    textAlign: 'center',
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
  },
});
