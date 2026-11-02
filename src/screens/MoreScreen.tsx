import React, { useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { RootStackParamList } from '@/navigation/types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { MenuItem, SectionHeader } from '@/components/common/AppUI';
import { useServerStore } from '@/api/server';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { fontSize, fontWeight, spacing, borderRadius } from '@/theme/tokens';
import { api } from '@/api/client';
import { BUILT_IN_NAV_ITEMS, canAccessNavigationItem, getNavigationLayout } from '@/navigation/navigationConfig';
import { useCustomNavStore } from '@/store/navigationStore';
import { uiPreferencesApi } from '@/api/uiPreferences';
import { AnnouncementsEntry } from '@/components/common/AnnouncementBanner';
import { nativeMessage, useTranslation } from '@/i18n';

type GlobalRoutes = {
  Announcements: { id?: string } | undefined;
  CameraWall: undefined;
  CameraIntegrations: undefined;
  SlicerPipelines: undefined;
  PipelineRuns: undefined;
  Finance: undefined;
};
const EXTRA_PAGES = [
  { route: 'CameraWall', key: 'camera-wall', title: 'Camera wall', icon: 'camera' },
  { route: 'CameraIntegrations', key: 'camera-integrations', title: 'Camera integrations', icon: 'camera' },
  { route: 'SlicerPipelines', key: 'slicer-pipelines', title: 'Slicer pipelines', icon: 'layers' },
  { route: 'PipelineRuns', key: 'pipeline-runs', title: 'Pipeline runs', icon: 'list-ordered' },
  { route: 'Finance', key: 'finance', title: 'Finance', icon: 'bar-chart' },
] as const;

/**
 * Routes hidden from navigation until their full screen implementation lands.
 * No routes are currently hidden.
 */
const UNREGISTERED_ROUTES: Array<keyof RootStackParamList> = [];

const URL_PROTOCOL_REGEX = /^https?:\/\//i;

export default function MoreScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList & GlobalRoutes>>();
  const { t } = useTranslation();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: t('nav.more') });
  }, [navigation, t]);

  const { colors } = useTheme();
  const { showToast } = useToast();
  const { user, logout, hasPermission } = useAuth();
  const demoMode = useServerStore(state => state.demoMode);
  const serverUrl = useServerStore(state => state.serverUrl);
  const customItems = useCustomNavStore(state => state.items);
  const version = DeviceInfo.getVersion() || 'dev';
  const canReadExternalLinks = hasPermission('external_links:read');

  const navigationQuery = useQuery({ queryKey: ['navigationOrder', serverUrl], queryFn: uiPreferencesApi.getNavigationOrder });
  const flagsQuery = useQuery({ queryKey: ['uiFlags', serverUrl], queryFn: uiPreferencesApi.getFlags, enabled: Boolean(user) });
  const externalLinksQuery = useQuery({ queryKey: ['externalLinks'], queryFn: api.getExternalLinks, enabled: canReadExternalLinks });

  const layout = useMemo(() => {
    const defaultSidebarOrder = navigationQuery.data?.default_sidebar_order ?? null;
    return getNavigationLayout({
      defaultSidebarOrder,
      externalLinks: canReadExternalLinks ? externalLinksQuery.data ?? [] : [],
      customNavItems: customItems,
    });
  }, [navigationQuery.data, externalLinksQuery.data, customItems, canReadExternalLinks]);

  const canOpenRoute = React.useCallback((route: string) => {
    const item = BUILT_IN_NAV_ITEMS.find(candidate => candidate.stackRoute === route);
    if (item) return canAccessNavigationItem(item, {
      hasPermission,
      authenticatedUser: Boolean(user),
      billingEnabled: flagsQuery.data?.billing_enabled === true,
    });
    if (route === 'Users') return hasPermission('users:read');
    if (route === 'CameraWall' || route === 'CameraIntegrations') return hasPermission('camera:view');
    if (route === 'SlicerPipelines' || route === 'PipelineRuns') return hasPermission('pipelines:read');
    if (route === 'Finance') return Boolean(user) && flagsQuery.data?.billing_enabled === true &&
      (hasPermission('cost_centers:read_own') || hasPermission('cost_centers:read_all') ||
        hasPermission('cost_centers:create') || hasPermission('cost_centers:modify'));
    return true;
  }, [hasPermission, user, flagsQuery.data?.billing_enabled]);

  const moreItems = useMemo(() => {
    return layout.moreItems.filter(
      item => item.stackRoute && !UNREGISTERED_ROUTES.includes(item.stackRoute) && canOpenRoute(item.stackRoute),
    );
  }, [layout.moreItems, canOpenRoute]);
  const extraPages = EXTRA_PAGES.filter(item =>
    !BUILT_IN_NAV_ITEMS.some(builtIn => String(builtIn.stackRoute) === item.route) && canOpenRoute(item.route));

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

  const openExternalLink = React.useCallback(
    async (input: {
      url: string;
      name: string;
      openInNewTab: boolean;
    }) => {
      const url = input.url.trim();
      if (!URL_PROTOCOL_REGEX.test(url)) {
        showToast(
          nativeMessage('more.externalProtocol', { defaultValue: 'External links must start with http:// or https://' }),
          'error',
        );
        return;
      }

      if (input.openInNewTab) {
        try {
          await Linking.openURL(url);
        } catch {
          showToast(nativeMessage('more.externalError', { defaultValue: 'Unable to open the external link.' }), 'error');
        }
        return;
      }

      navigation.navigate('ExternalLinkBrowser', {
        url,
        title: input.name,
      });
    },
    [navigation, showToast, t],
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.hero}>
        <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
          {t('more.signedIn', { defaultValue: 'Signed in as {{username}}', username: user?.username ?? t('more.guest', { defaultValue: 'Guest' }) })}
        </Text>
        {demoMode ? (
          <View
            style={[styles.demoBadge, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
          >
            <Text style={[styles.demoBadgeText, { color: colors.text }]}>
              {t('more.demo', { defaultValue: 'Demo mode — you are exploring a shared sample server. Use Exit demo below to connect your own.' })}
            </Text>
          </View>
        ) : null}
      </View>

      <AnnouncementsEntry onPress={() => navigation.navigate('Announcements')} />

      {(pageItems.length > 0 || extraPages.length > 0) && (
        <View style={styles.group}>
          <SectionHeader title={t('more.pages', { defaultValue: 'Pages' })} />
          <View>
            {pageItems.map(item => (
              <MenuItem
                key={item.id}
                icon={item.icon}
                label={t(`nav.${item.id}`, { defaultValue: item.label })}
                subtitle={item.subtitle}
                onPress={() => navigation.navigate(item.stackRoute as keyof RootStackParamList as never)}
              />
            ))}
            {extraPages.map(item => <MenuItem key={item.key} icon={item.icon}
              label={t(`nav.${item.key}`, { defaultValue: item.title })}
              onPress={() => navigation.navigate(item.route)} />)}
          </View>
        </View>
      )}

      {insightItems.length > 0 && (
        <View style={styles.group}>
          <SectionHeader title={t('more.insights', { defaultValue: 'Insights & tools' })} />
          <View>
            {insightItems.map(item => (
              <MenuItem
                key={item.id}
                icon={item.icon}
                label={t(`nav.${item.id}`, { defaultValue: item.label })}
                subtitle={item.subtitle}
                onPress={() => navigation.navigate(item.stackRoute as keyof RootStackParamList as never)}
              />
            ))}
          </View>
        </View>
      )}

      {externalLinksVisible && (layout.externalLinks.length > 0 || layout.customNavItems.length > 0) && (
        <View style={styles.group}>
          <SectionHeader title={t('more.links', { defaultValue: 'Links' })} />
          <View>
            {layout.externalLinks.map(link => (
              <MenuItem
                key={link.id}
                icon={link.icon || 'external-link'}
                label={link.name}
                subtitle={link.url}
                translateText={false}
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
                translateText={false}
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

      <View style={styles.accountCard}>
        <MenuItem
          icon="server"
          disabled={changeServerMutation.isPending || logoutMutation.isPending}
          loading={changeServerMutation.isPending}
          label={
            changeServerMutation.isPending
              ? t('more.disconnecting', { defaultValue: 'Disconnecting...' })
              : demoMode
                ? t('more.exitDemo', { defaultValue: 'Exit demo' })
                : t('more.changeServer', { defaultValue: 'Change server' })
          }
          subtitle={
            demoMode
              ? t('more.leaveDemo', { defaultValue: 'Leave the demo and connect to your own BambuBuddy server' })
              : t('more.disconnectHelp', { defaultValue: 'Disconnect and connect to a different BambuBuddy server' })
          }
          onPress={() => { if (!changeServerMutation.isPending && !logoutMutation.isPending) void changeServerMutation.mutateAsync(); }}
        />
        <MenuItem
          icon="power"
          disabled={changeServerMutation.isPending || logoutMutation.isPending}
          loading={logoutMutation.isPending}
          label={logoutMutation.isPending ? t('more.signingOut', { defaultValue: 'Signing out...' }) : t('more.signOut', { defaultValue: 'Sign out' })}
          subtitle={t('more.signOutHelp', { defaultValue: 'Disconnect this mobile session' })}
          onPress={() => { if (!changeServerMutation.isPending && !logoutMutation.isPending) void logoutMutation.mutateAsync(); }}
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
