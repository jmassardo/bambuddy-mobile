import React, { useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { MainTabNavigationProp, RootStackParamList } from '@/navigation/types';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { MenuItem, SectionHeader } from '@/components/common/UIComponents';
import { useServerStore } from '@/api/server';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/theme';
import { fontSize, fontWeight, spacing, borderRadius } from '@/theme/tokens';
import { api } from '@/api/client';
import { getNavigationLayout } from '@/navigation/navigationConfig';

/**
 * Routes that are declared in RootStackParamList but do NOT yet have a registered
 * Stack.Screen component. Each downstream issue removes its entry when it lands:
 *   - #67 removes 'Energy'
 *   - #68 removes 'VirtualPrinters'
 *   - #69 removes 'SpoolBuddy'
 *   - #71 removes 'ExternalLinkBrowser'
 */
const UNREGISTERED_ROUTES: Array<keyof RootStackParamList> = [
  'Energy',
  'VirtualPrinters',
  'SpoolBuddy',
  'ExternalLinkBrowser',
];

export default function MoreScreen() {
  const navigation = useNavigation<MainTabNavigationProp<'More'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'More' });
  }, [navigation]);

  const { colors } = useTheme();
  const { user, logout } = useAuth();
  const demoMode = useServerStore(state => state.demoMode);
  const version = DeviceInfo.getVersion() || 'dev';

  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const externalLinksQuery = useQuery({ queryKey: ['externalLinks'], queryFn: api.getExternalLinks });

  const layout = useMemo(() => {
    const settings = settingsQuery.data;
    const defaultSidebarOrder = settings?.default_sidebar_order ?? null;
    return getNavigationLayout({
      defaultSidebarOrder,
      externalLinks: externalLinksQuery.data ?? [],
    });
  }, [settingsQuery.data, externalLinksQuery.data]);

  const moreItems = useMemo(() => {
    return layout.moreItems.filter(
      item => item.stackRoute && !UNREGISTERED_ROUTES.includes(item.stackRoute),
    );
  }, [layout.moreItems]);

  const insightItemIds = new Set(['stats', 'energy']);
  const insightItems = moreItems.filter(item => insightItemIds.has(item.id));
  const pageItems = moreItems.filter(item => !insightItemIds.has(item.id));

  const externalLinksVisible = !UNREGISTERED_ROUTES.includes('ExternalLinkBrowser');

  const logoutMutation = useMutation({
    mutationFn: logout,
  });

  const changeServerMutation = useMutation({
    mutationFn: async () => {
      await logout();
      await useServerStore.getState().clearServerUrl();
    },
  });

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.hero}>
        <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
          Signed in as {user?.username ?? 'Guest'}
        </Text>
        {demoMode ? (
          <View
            style={[styles.demoBadge, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
          >
            <Text style={[styles.demoBadgeText, { color: colors.text }]}>
              Demo mode - you are exploring a shared sample server. Use Exit
              demo below to connect your own.
            </Text>
          </View>
        ) : null}
      </View>

      {pageItems.length > 0 && (
        <View style={styles.group}>
          <SectionHeader title="Pages" />
          <View>
            {pageItems.map(item => (
              <MenuItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                subtitle={item.subtitle}
                onPress={() => navigation.navigate(item.stackRoute as keyof RootStackParamList as never)}
              />
            ))}
          </View>
        </View>
      )}

      {insightItems.length > 0 && (
        <View style={styles.group}>
          <SectionHeader title="Insights & tools" />
          <View>
            {insightItems.map(item => (
              <MenuItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                subtitle={item.subtitle}
                onPress={() => navigation.navigate(item.stackRoute as keyof RootStackParamList as never)}
              />
            ))}
          </View>
        </View>
      )}

      {externalLinksVisible && layout.externalLinks.length > 0 && (
        <View style={styles.group}>
          <SectionHeader title="Links" />
          <View>
            {layout.externalLinks.map(link => (
              <MenuItem
                key={link.id}
                icon={link.icon || 'external-link'}
                label={link.name}
                subtitle={link.url}
                onPress={() => (navigation as any).navigate('ExternalLinkBrowser', { url: link.url, title: link.name })}
              />
            ))}
          </View>
        </View>
      )}

      <View style={styles.accountCard}>
        <MenuItem
          icon="server"
          label={
            changeServerMutation.isPending
              ? 'Disconnecting...'
              : demoMode
                ? 'Exit demo'
                : 'Change server'
          }
          subtitle={
            demoMode
              ? 'Leave the demo and connect to your own Bambuddy server'
              : 'Disconnect and connect to a different Bambuddy server'
          }
          onPress={() => void changeServerMutation.mutateAsync()}
        />
        <MenuItem
          icon="power"
          label={logoutMutation.isPending ? 'Signing out...' : 'Sign out'}
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
  demoBadge: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
  },
  demoBadgeText: {
    fontSize: fontSize.sm,
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
