import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { PrimaryButton, SectionCard, SettingRow, StatusBadge } from '@/components/common/AppUI';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/theme';
import { fontSize, fontWeight, spacing } from '@/theme/tokens';
import type { AdvancedAuthStatus, SmartPlug } from '@/types/api';
import { pickBoolean, pickNumber, pickString, type ApiRecord } from '@/utils/data';
import {
  BackupSection,
  DevicesSection,
  GeneralSection,
  KeysSection,
  NetworkSection,
  NotificationsSection,
  PlugsSection,
  QueueSection,
  UsersSection,
} from './settings';
import type { AppNavigationProp } from '@/navigation/types';

type SectionKey =
  | 'general'
  | 'plugs'
  | 'notifications'
  | 'queue'
  | 'filament'
  | 'network'
  | 'apikeys'
  | 'virtual-printer'
  | 'spoolbuddy'
  | 'failure-detection'
  | 'users'
  | 'backup';

const SECTION_ITEMS: Array<{ key: SectionKey; icon: string; title: string; description: string }> = [
  { key: 'general', icon: 'settings', title: 'General', description: 'Locale, archive defaults, print defaults, pricing, and update settings.' },
  { key: 'plugs', icon: 'power', title: 'Plugs', description: 'Smart plug inventory, online state, power controls, and device management.' },
  { key: 'notifications', icon: 'bell', title: 'Notifications', description: 'Provider status and shortcuts into user notification settings.' },
  { key: 'queue', icon: 'list-ordered', title: 'Queue', description: 'Default print options, preheat, staggering, and slicer preferences.' },
  { key: 'filament', icon: 'package', title: 'Filament', description: 'Warnings, Spoolman, RFID handling, and forecasting defaults.' },
  { key: 'network', icon: 'globe', title: 'Network', description: 'External URLs, MQTT, FTP retry, Prometheus, and Home Assistant.' },
  { key: 'apikeys', icon: 'key', title: 'API Keys', description: 'Create and revoke API keys for scripts and integrations.' },
  { key: 'virtual-printer', icon: 'printer', title: 'Virtual Printer', description: 'Virtual printer status plus start and stop controls.' },
  { key: 'spoolbuddy', icon: 'nfc', title: 'SpoolBuddy', description: 'Devices, NFC/scales, and calibration shortcuts.' },
  { key: 'failure-detection', icon: 'shield', title: 'Failure Detection', description: 'Obico service status and model settings.' },
  { key: 'users', icon: 'users', title: 'Users & Security', description: 'Auth, SMTP, LDAP, OIDC, and 2FA management.' },
  { key: 'backup', icon: 'download', title: 'Backup', description: 'Local backups, exports, GitHub backup status, and recovery.' },
];

function summarize(section: SectionKey, queries: Record<string, unknown>) {
  const settings = (queries.settings ?? {}) as ApiRecord;
  switch (section) {
    case 'general':
      return `${pickString(settings, ['language'], 'en')} • ${pickString(settings, ['date_format'], 'system')}`;
    case 'plugs':
      return `${((queries.smartPlugs as SmartPlug[] | undefined) ?? []).length} smart plugs`;
    case 'notifications':
      return `${((queries.notificationProviders as ApiRecord[] | undefined) ?? []).length} providers`;
    case 'queue':
      return pickBoolean(settings, ['preheat_enabled']) ? 'Preheat enabled' : 'Preheat disabled';
    case 'filament':
      return `Low stock ${pickNumber(settings, ['low_stock_threshold'], 20)}%`;
    case 'network':
      return pickBoolean(settings, ['mqtt_enabled']) ? 'MQTT enabled' : 'MQTT disabled';
    case 'apikeys':
      return `${((queries.apiKeys as ApiRecord[] | undefined) ?? []).length} keys • ${((queries.cameraTokens as ApiRecord[] | undefined) ?? []).length} camera tokens`;
    case 'virtual-printer':
      return `${((queries.virtualPrinters as ApiRecord[] | undefined) ?? []).length} virtual printers`;
    case 'spoolbuddy':
      return `${((queries.spoolbuddyDevices as ApiRecord[] | undefined) ?? []).length} devices`;
    case 'failure-detection':
      return pickBoolean(queries.obicoStatus, ['enabled']) ? 'Enabled' : 'Disabled';
    case 'users':
      return pickBoolean(queries.advancedAuthStatus, ['advanced_auth_enabled']) ? 'Security enabled' : 'Basic auth';
    case 'backup':
      return pickString(queries.githubBackupStatus, ['last_backup_status'], 'No recent backup');
    default:
      return '';
  }
}

export default function SettingsScreen() {
  const navigation = useNavigation<AppNavigationProp>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Settings' });
  }, [navigation]);

  const { colors } = useTheme();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [section, setSection] = useState<SectionKey | null>(null);

  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const smartPlugsQuery = useQuery({ queryKey: ['smartPlugs'], queryFn: api.getSmartPlugs });
  const providersQuery = useQuery({ queryKey: ['notificationProviders'], queryFn: api.getNotificationProviders });
  const apiKeysQuery = useQuery({ queryKey: ['apiKeys'], queryFn: api.getApiKeys });
  const cameraTokensQuery = useQuery({
    queryKey: ['cameraTokens'],
    queryFn: () => (isAdmin ? api.listAllLongLivedCameraTokens() : api.listMyLongLivedCameraTokens()),
  });
  const virtualPrinterListQuery = useQuery({ queryKey: ['virtualPrinterList'], queryFn: api.getVirtualPrinterList });
  const spoolbuddyQuery = useQuery({ queryKey: ['spoolbuddyDevices'], queryFn: api.getSpoolBuddyDevices });
  const obicoQuery = useQuery({ queryKey: ['obicoStatus'], queryFn: api.getObicoStatus });
  const advancedAuthQuery = useQuery<AdvancedAuthStatus>({ queryKey: ['advancedAuthStatus'], queryFn: api.getAdvancedAuthStatus });
  const githubBackupQuery = useQuery({ queryKey: ['githubBackupStatus'], queryFn: api.getGitHubBackupStatus });

  const sectionSummaries = useMemo(
    () => ({
      settings: settingsQuery.data,
      smartPlugs: smartPlugsQuery.data,
      notificationProviders: providersQuery.data,
      apiKeys: apiKeysQuery.data,
      cameraTokens: cameraTokensQuery.data,
      virtualPrinters: Array.isArray(virtualPrinterListQuery.data?.printers) ? virtualPrinterListQuery.data.printers : [],
      spoolbuddyDevices: spoolbuddyQuery.data,
      obicoStatus: obicoQuery.data,
      advancedAuthStatus: advancedAuthQuery.data,
      githubBackupStatus: githubBackupQuery.data,
    }),
    [
      advancedAuthQuery.data,
      apiKeysQuery.data,
      cameraTokensQuery.data,
      githubBackupQuery.data,
      obicoQuery.data,
      providersQuery.data,
      settingsQuery.data,
      smartPlugsQuery.data,
      spoolbuddyQuery.data,
      virtualPrinterListQuery.data,
    ],
  );

  if (settingsQuery.isLoading) {
    return <LoadingScreen message="Loading settings…" />;
  }

  if (settingsQuery.isError) {
    return <ErrorState message="Unable to load settings." onRetry={() => void queryClient.refetchQueries({ type: 'active' })} />;
  }

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.refetchQueries({ type: 'active' });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} tintColor={colors.accent} />}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Configure your BamBuddy instance.</Text>
      </View>

      {section === null ? (
        SECTION_ITEMS.map(item => (
          <SectionCard key={item.key} title={item.title} subtitle={item.description} right={<StatusBadge label={summarize(item.key, sectionSummaries)} color={colors.accent} />}>
            <SettingRow icon={item.icon} label={`Open ${item.title}`} onPress={() => setSection(item.key)} />
          </SectionCard>
        ))
      ) : (
        <>
          <PrimaryButton label="Back to sections" variant="secondary" onPress={() => setSection(null)} />
          {section === 'general' ? <GeneralSection /> : null}
          {section === 'plugs' ? <PlugsSection /> : null}
          {section === 'notifications' ? <NotificationsSection /> : null}
          {section === 'queue' || section === 'filament' ? <QueueSection section={section} /> : null}
          {section === 'network' ? <NetworkSection /> : null}
          {section === 'apikeys' ? <KeysSection /> : null}
          {section === 'virtual-printer' || section === 'spoolbuddy' || section === 'failure-detection' ? <DevicesSection section={section} /> : null}
          {section === 'users' ? <UsersSection /> : null}
          {section === 'backup' ? <BackupSection /> : null}
          {!isAdmin ? <Text style={[styles.warning, { color: colors.warning }]}>Some sections may be read-only without admin access.</Text> : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  header: { gap: spacing.xs },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    fontSize: fontSize.base,
    lineHeight: 22,
  },
  warning: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});
