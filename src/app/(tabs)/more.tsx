import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../theme';
import { borderRadius, fontSize, fontWeight, spacing } from '../../theme/tokens';
import { PrimaryButton, SectionCard, SettingRow } from '../../components/common/AppUI';

const GROUPS = [
  {
    title: 'Monitoring',
    items: [
      { icon: 'bar-chart', label: 'Stats', route: '/stats' },
      { icon: 'package', label: 'Inventory', route: '/inventory' },
      { icon: 'wrench', label: 'Maintenance', route: '/maintenance' },
    ],
  },
  {
    title: 'Management',
    items: [
      { icon: 'layers', label: 'Projects', route: '/projects' },
      { icon: 'copy', label: 'Profiles', route: '/profiles' },
      { icon: 'bell', label: 'Notifications', route: '/notifications' },
      { icon: 'globe', label: 'MakerWorld', route: '/makerworld' },
    ],
  },
  {
    title: 'System',
    items: [
      { icon: 'settings', label: 'Settings', route: '/settings' },
      { icon: 'users', label: 'Users & Groups', route: '/users' },
      { icon: 'cpu', label: 'System Info', route: '/system' },
      { icon: 'qr-code', label: 'Scanner', route: '/scanner' },
    ],
  },
] as const;

export default function MoreScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user, logout } = useAuth();

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => router.replace('/login'),
  });

  const version = Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? 'dev';

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={[styles.heroTitle, { color: colors.text }]}>More</Text>
        <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
          Signed in as {user?.username ?? 'Guest'}
        </Text>
      </View>

      {GROUPS.map((group) => (
        <View key={group.title} style={styles.group}>
          <Text style={[styles.groupTitle, { color: colors.textTertiary }]}>{group.title}</Text>
          <SectionCard>
            {group.items.map((item, index) => (
              <View key={item.label} style={index === group.items.length - 1 ? styles.lastRow : undefined}>
                <SettingRow icon={item.icon} label={item.label} onPress={() => router.push(item.route)} />
              </View>
            ))}
          </SectionCard>
        </View>
      ))}

      <SectionCard title="Account" subtitle="Manage your session and connected server.">
        <PrimaryButton label={logoutMutation.isPending ? 'Signing out…' : 'Sign out'} onPress={() => void logoutMutation.mutateAsync()} variant="secondary" />
      </SectionCard>

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
