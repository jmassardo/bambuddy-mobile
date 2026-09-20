<<<<<<< HEAD
import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery } from '@tanstack/react-query';
import DeviceInfo from 'react-native-device-info';
import { MenuItem, SectionCard, SectionHeader } from '@/components/common/AppUI';
import type { MainTabNavigationProp } from '@/navigation/types';
import { getNavigationLayout } from '@/navigation/navigationConfig';
import { api } from '@/api/client';
=======
import React, { useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { MainTabNavigationProp, RootStackParamList } from '@/navigation/types';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { MenuItem, SectionHeader } from '@/components/common/AppUI';
>>>>>>> origin/develop
import { useServerStore } from '@/api/server';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
<<<<<<< HEAD
import { fontSize, fontWeight, spacing } from '@/theme/tokens';
import { pickString } from '@/utils/data';

=======
import { fontSize, fontWeight, spacing, borderRadius } from '@/theme/tokens';
import { api } from '@/api/client';
import { getNavigationLayout } from '@/navigation/navigationConfig';
import { useCustomNavStore } from '@/store/navigationStore';

/**
 * Routes hidden from navigation until their full screen implementation lands.
 * No routes are currently hidden.
 */
const UNREGISTERED_ROUTES: Array<keyof RootStackParamList> = [];

>>>>>>> origin/develop
const URL_PROTOCOL_REGEX = /^https?:\/\//i;

export default function MoreScreen() {
  const navigation = useNavigation<MainTabNavigationProp<'More'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'More' });
  }, [navigation]);

  const { colors } = useTheme();
  const { showToast } = useToast();
  const { user, logout } = useAuth();
  const demoMode = useServerStore(state => state.demoMode);
  const version = DeviceInfo.getVersion() || 'dev';

  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const externalLinksQuery = useQuery({ queryKey: ['externalLinks'], queryFn: api.getExternalLinks });

<<<<<<< HEAD
  const layout = React.useMemo(
    () => getNavigationLayout({
      defaultSidebarOrder: pickString(settingsQuery.data, ['default_sidebar_order']),
      externalLinks: externalLinksQuery.data ?? [],
    }),
    [externalLinksQuery.data, settingsQuery.data],
  );
  const insightItemIds = React.useMemo(() => new Set(['stats', 'energy']), []);
  const insightItems = React.useMemo(
    () => layout.moreItems.filter(item => insightItemIds.has(item.id)),
    [insightItemIds, layout.moreItems],
  );
  const pageItems = React.useMemo(
    () => layout.moreItems.filter(item => !insightItemIds.has(item.id)),
    [insightItemIds, layout.moreItems],
  );
=======
  const layout = useMemo(() => {
    const settings = settingsQuery.data;
    const defaultSidebarOrder = settings?.default_sidebar_order ?? null;
    const customItems = useCustomNavStore.getState().items;
    return getNavigationLayout({
      defaultSidebarOrder,
      externalLinks: externalLinksQuery.data ?? [],
      customNavItems: customItems,
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
>>>>>>> origin/develop

  const logoutMutation = useMutation({
    mutationFn: logout,
  });

  const changeServerMutation = useMutation({
    mutationFn: async () => {
      await logout();
      await useServerStore.getState().clearServerUrl();
    },
  });

  const openExternalLink = React.useCallback(
<<<<<<< HEAD
    async (input: { url: string; name: string; openInNewTab: boolean }) => {
      const url = input.url.trim();
      if (!URL_PROTOCOL_REGEX.test(url)) {
        showToast('External links must start with http:// or https://', 'error');
=======
    async (input: {
      url: string;
      name: string;
      openInNewTab: boolean;
    }) => {
      const url = input.url.trim();
      if (!URL_PROTOCOL_REGEX.test(url)) {
        showToast(
          'External links must start with http:// or https://',
          'error',
        );
>>>>>>> origin/develop
        return;
      }

      if (input.openInNewTab) {
        try {
          await Linking.openURL(url);
        } catch {
          showToast('Unable to open the external link.', 'error');
        }
        return;
      }

<<<<<<< HEAD
      navigation.navigate('ExternalLinkBrowser', { url, title: input.name });
=======
      navigation.navigate('ExternalLinkBrowser', {
        url,
        title: input.name,
      });
>>>>>>> origin/develop
    },
    [navigation, showToast],
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.hero}>
<<<<<<< HEAD
        <Text style={[styles.heroTitle, { color: colors.text }]}>More</Text>
=======
>>>>>>> origin/develop
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

<<<<<<< HEAD
      {insightItems.length > 0 ? (
        <View style={styles.group}>
          <SectionHeader title="Insights" />
          <SectionCard>
            {insightItems.map(item =>
              item.stackRoute ? (
                <MenuItem
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  subtitle={item.subtitle}
                  onPress={() => navigation.navigate(item.stackRoute as never)}
                />
              ) : null,
            )}
          </SectionCard>
        </View>
      ) : null}

      <View style={styles.group}>
        <SectionHeader title="Pages" />
        <SectionCard>
          {pageItems.map(item =>
            item.stackRoute ? (
=======
      {pageItems.length > 0 && (
        <View style={styles.group}>
          <SectionHeader title="Pages" />
          <View>
            {pageItems.map(item => (
>>>>>>> origin/develop
              <MenuItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                subtitle={item.subtitle}
<<<<<<< HEAD
                onPress={() => navigation.navigate(item.stackRoute as never)}
              />
            ) : null,
          )}
          {pageItems.length === 0 ? (
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>
              No additional pages are currently visible.
            </Text>
          ) : null}
        </SectionCard>
      </View>
=======
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

      {externalLinksVisible && (layout.externalLinks.length > 0 || layout.customNavItems.length > 0) && (
        <View style={styles.group}>
          <SectionHeader title="Links" />
          <View>
            {layout.externalLinks.map(link => (
              <MenuItem
                key={link.id}
                icon={link.icon || 'external-link'}
                label={link.name}
                subtitle={link.url}
                onPress={() =>
                  void openExternalLink({
                    url: link.url,
                    name: link.name,
                    openInNewTab: link.open_in_new_tab,
                  })
                }
              />
            ))}
            {layout.customNavItems.map(link => (
              <MenuItem
                key={link.id}
                icon={link.icon || 'external-link'}
                label={link.name}
                subtitle={link.url}
                onPress={() =>
                  void openExternalLink({
                    url: link.url,
                    name: link.name,
                    openInNewTab: link.open_in_new_tab,
                  })
                }
              />
            ))}
          </View>
        </View>
      )}
>>>>>>> origin/develop

      <View style={styles.group}>
        <SectionHeader title="External links" />
        <SectionCard>
          {layout.externalLinks.map(link => (
            <MenuItem
              key={String(link.id)}
              icon={link.icon || 'globe'}
              label={link.name}
              subtitle={link.url}
              onPress={() => void openExternalLink({ url: link.url, name: link.name, openInNewTab: link.open_in_new_tab })}
            />
          ))}
          {layout.externalLinks.length === 0 ? (
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>
              No external links configured.
            </Text>
          ) : null}
        </SectionCard>
      </View>

      <SectionCard>
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
  helperText: {
    fontSize: fontSize.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  version: {
    textAlign: 'center',
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
  },
});
