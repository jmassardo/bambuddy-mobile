import React, { useEffect, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { InlineTabBar, PrimaryButton, SectionCard, SettingRow, StatusBadge, TextField } from '@/components/common/AppUI';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { pickBoolean, pickNumber, pickString, statusColor, type ApiRecord } from '@/utils/data';
import { shareBlob } from '@/utils/share';

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
  { key: 'general', icon: 'settings', title: 'General', description: 'Theme, appearance, archive, update, and locale preferences.' },
  { key: 'plugs', icon: 'power', title: 'Plugs', description: 'Smart plug inventory, online state, and quick controls.' },
  { key: 'notifications', icon: 'bell', title: 'Notifications', description: 'Provider status and shortcuts into user notification settings.' },
  { key: 'queue', icon: 'list-ordered', title: 'Queue', description: 'Default print options, preheat, staggering, and slicer preferences.' },
  { key: 'filament', icon: 'package', title: 'Filament', description: 'Warnings, Spoolman, RFID handling, and forecasting defaults.' },
  { key: 'network', icon: 'globe', title: 'Network', description: 'External URLs, MQTT, FTP retry, Prometheus, and Home Assistant.' },
  { key: 'apikeys', icon: 'key', title: 'API Keys', description: 'Create and revoke API keys for scripts and integrations.' },
  { key: 'virtual-printer', icon: 'printer', title: 'Virtual Printer', description: 'Virtual printer status plus start and stop controls.' },
  { key: 'spoolbuddy', icon: 'nfc', title: 'SpoolBuddy', description: 'Devices, NFC/scales, and calibration shortcuts.' },
  { key: 'failure-detection', icon: 'shield', title: 'Failure Detection', description: 'Obico service status and model settings.' },
  { key: 'users', icon: 'users', title: 'Users', description: 'Auth, LDAP, session policy, and quick access to user management.' },
  { key: 'backup', icon: 'download', title: 'Backup', description: 'Local backups, exports, GitHub backup status, and recovery.' },
];

function summarize(section: SectionKey, queries: Record<string, unknown>) {
  const settings = (queries.settings ?? {}) as ApiRecord;
  switch (section) {
    case 'general':
      return `${pickString(settings, ['language'], 'en')} • ${pickString(settings, ['date_format'], 'system')}`;
    case 'plugs':
      return `${((queries.smartPlugs as ApiRecord[] | undefined) ?? []).length} smart plugs`;
    case 'notifications':
      return `${((queries.notificationProviders as ApiRecord[] | undefined) ?? []).length} providers`;
    case 'queue':
      return pickBoolean(settings, ['preheat_enabled']) ? 'Preheat enabled' : 'Preheat disabled';
    case 'filament':
      return `Low stock ${pickNumber(settings, ['low_stock_threshold'], 20)}%`;
    case 'network':
      return pickBoolean(settings, ['mqtt_enabled']) ? 'MQTT enabled' : 'MQTT disabled';
    case 'apikeys':
      return `${((queries.apiKeys as ApiRecord[] | undefined) ?? []).length} keys`;
    case 'virtual-printer':
      return `${((queries.virtualPrinters as ApiRecord[] | undefined) ?? []).length} virtual printers`;
    case 'spoolbuddy':
      return `${((queries.spoolbuddyDevices as ApiRecord[] | undefined) ?? []).length} devices`;
    case 'failure-detection':
      return pickBoolean(queries.obicoStatus, ['enabled']) ? 'Enabled' : 'Disabled';
    case 'users':
      return pickBoolean(queries.advancedAuthStatus, ['advanced_auth_enabled']) ? 'Advanced auth on' : 'Basic auth';
    case 'backup':
      return pickString(queries.githubBackupStatus, ['last_backup_status'], 'No recent backup');
    default:
      return '';
  }
}

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Settings' });
  }, [navigation]);

  const theme = useTheme();
  const { colors, mode, setMode } = theme;
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [section, setSection] = useState<SectionKey | null>(null);
  const [draft, setDraft] = useState<ApiRecord>({});
  const [newApiKeyName, setNewApiKeyName] = useState('');
  const [createdApiKey, setCreatedApiKey] = useState('');

  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: () => api.getSettings() });
  const smartPlugsQuery = useQuery({ queryKey: ['smartPlugs'], queryFn: () => api.getSmartPlugs() });
  const providersQuery = useQuery({ queryKey: ['notificationProviders'], queryFn: () => api.getNotificationProviders() });
  const apiKeysQuery = useQuery({ queryKey: ['apiKeys'], queryFn: () => api.getApiKeys() });
  const virtualPrintersQuery = useQuery({ queryKey: ['virtualPrinters'], queryFn: () => api.getVirtualPrinters() });
  const spoolbuddyQuery = useQuery({ queryKey: ['spoolbuddyDevices'], queryFn: () => api.getSpoolBuddyDevices() });
  const obicoQuery = useQuery({ queryKey: ['obicoStatus'], queryFn: () => api.getObicoStatus() });
  const advancedAuthQuery = useQuery({ queryKey: ['advancedAuthStatus'], queryFn: () => api.getAdvancedAuthStatus() });
  const ldapQuery = useQuery({ queryKey: ['ldapStatus'], queryFn: () => api.getLDAPStatus() });
  const githubBackupQuery = useQuery({ queryKey: ['githubBackupStatus'], queryFn: () => api.getGitHubBackupStatus() });
  const localBackupStatusQuery = useQuery({ queryKey: ['localBackupStatus'], queryFn: () => api.getLocalBackupStatus() });
  const localBackupsQuery = useQuery({ queryKey: ['localBackups'], queryFn: () => api.getLocalBackups() });

  useEffect(() => {
    if (settingsQuery.data) {
      setDraft(settingsQuery.data as ApiRecord);
    }
  }, [settingsQuery.data]);

  const refreshAll = async () => {
    await Promise.all([
      settingsQuery.refetch(),
      smartPlugsQuery.refetch(),
      providersQuery.refetch(),
      apiKeysQuery.refetch(),
      virtualPrintersQuery.refetch(),
      spoolbuddyQuery.refetch(),
      obicoQuery.refetch(),
      advancedAuthQuery.refetch(),
      ldapQuery.refetch(),
      githubBackupQuery.refetch(),
      localBackupStatusQuery.refetch(),
      localBackupsQuery.refetch(),
    ]);
  };

  const saveSettingsMutation = useMutation({
    mutationFn: () => api.updateSettings(draft),
    onSuccess: async data => {
      setDraft(data as ApiRecord);
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      showToast('Settings saved.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to save settings.', 'error'),
  });

  const togglePlugMutation = useMutation({
    mutationFn: ({ id, state }: { id: number; state: boolean }) => api.toggleSmartPlug(id, state),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['smartPlugs'] });
      showToast('Smart plug updated.', 'success');
    },
  });

  const createApiKeyMutation = useMutation({
    mutationFn: () => api.createApiKey({ name: newApiKeyName.trim() }),
    onSuccess: async data => {
      setCreatedApiKey(pickString(data, ['key'], ''));
      setNewApiKeyName('');
      await queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
      showToast('API key created.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to create API key.', 'error'),
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: (id: number) => api.deleteApiKey(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
      showToast('API key deleted.', 'success');
    },
  });

  const backupMutation = useMutation({
    mutationFn: () => api.triggerLocalBackup(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['localBackupStatus'] });
      await queryClient.invalidateQueries({ queryKey: ['localBackups'] });
      showToast('Local backup started.', 'success');
    },
  });

  const exportBackupMutation = useMutation({
    mutationFn: async () => {
      const blob = await api.exportBackup();
      await shareBlob(blob, 'bambuddy-backup.zip');
    },
    onSuccess: () => showToast('Backup ready to share.', 'success'),
    onError: (error: Error) => showToast(error.message || 'Unable to export backup.', 'error'),
  });

  const githubBackupMutation = useMutation({
    mutationFn: () => api.triggerGitHubBackup(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['githubBackupStatus'] });
      showToast('GitHub backup triggered.', 'success');
    },
  });

  const virtualPrinterControl = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'start' | 'stop' }) =>
      action === 'start' ? api.startVirtualPrinter(id) : api.stopVirtualPrinter(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['virtualPrinters'] });
    },
  });

  const calibrateSpoolbuddyMutation = useMutation({
    mutationFn: (deviceId: string) => api.calibrateSpoolBuddy(deviceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['spoolbuddyDevices'] });
      showToast('Calibration command sent.', 'success');
    },
  });

  const sectionSummaries = useMemo(
    () => ({
      settings: settingsQuery.data,
      smartPlugs: smartPlugsQuery.data,
      notificationProviders: providersQuery.data,
      apiKeys: apiKeysQuery.data,
      virtualPrinters: virtualPrintersQuery.data,
      spoolbuddyDevices: spoolbuddyQuery.data,
      obicoStatus: obicoQuery.data,
      advancedAuthStatus: advancedAuthQuery.data,
      githubBackupStatus: githubBackupQuery.data,
    }),
    [
      advancedAuthQuery.data,
      apiKeysQuery.data,
      githubBackupQuery.data,
      obicoQuery.data,
      providersQuery.data,
      settingsQuery.data,
      smartPlugsQuery.data,
      spoolbuddyQuery.data,
      virtualPrintersQuery.data,
    ],
  );

  if (settingsQuery.isLoading) {
    return <LoadingScreen message="Loading settings…" />;
  }

  if (settingsQuery.isError) {
    return <ErrorState message="Unable to load settings." onRetry={() => void refreshAll()} />;
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={settingsQuery.isRefetching || smartPlugsQuery.isRefetching || apiKeysQuery.isRefetching}
          onRefresh={() => void refreshAll()}
          tintColor={colors.accent}
        />
      }
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Mobile sections matching the web settings tabs, with focused controls for each area.</Text>
      </View>

      {section === null ? (
        SECTION_ITEMS.map(item => (
          <SectionCard
            key={item.key}
            title={item.title}
            subtitle={item.description}
            right={<StatusBadge label={summarize(item.key, sectionSummaries)} color={colors.accent} />}
          >
            <SettingRow
              icon={item.icon}
              label={`Open ${item.title}`}
              description={item.description}
              onPress={() => setSection(item.key)}
            />
          </SectionCard>
        ))
      ) : (
        <>
          <PrimaryButton label="Back to sections" variant="secondary" onPress={() => setSection(null)} />
          {section === 'general' ? (
            <>
              <SectionCard title="Appearance" subtitle="Theme and date/time preferences.">
                <InlineTabBar value={mode} tabs={[{ key: 'dark', label: 'Dark' }, { key: 'light', label: 'Light' }, { key: 'system', label: 'System' }]} onChange={value => setMode(value as 'dark' | 'light' | 'system')} />
                <TextField label="Language" value={pickString(draft, ['language'], 'en')} onChangeText={value => setDraft(current => ({ ...current, language: value }))} />
                <TextField label="Notification language" value={pickString(draft, ['notification_language'], 'en')} onChangeText={value => setDraft(current => ({ ...current, notification_language: value }))} />
                <TextField label="Date format" value={pickString(draft, ['date_format'], 'system')} onChangeText={value => setDraft(current => ({ ...current, date_format: value }))} />
                <TextField label="Time format" value={pickString(draft, ['time_format'], 'system')} onChangeText={value => setDraft(current => ({ ...current, time_format: value }))} />
              </SectionCard>
              <SectionCard title="Archive and updates" subtitle="Auto-archiving, thumbnails, photos, and update checks.">
                <SwitchRow label="Auto archive" value={pickBoolean(draft, ['auto_archive'])} onValueChange={value => setDraft(current => ({ ...current, auto_archive: value }))} colors={colors} />
                <SwitchRow label="Save thumbnails" value={pickBoolean(draft, ['save_thumbnails'])} onValueChange={value => setDraft(current => ({ ...current, save_thumbnails: value }))} colors={colors} />
                <SwitchRow label="Capture finish photo" value={pickBoolean(draft, ['capture_finish_photo'])} onValueChange={value => setDraft(current => ({ ...current, capture_finish_photo: value }))} colors={colors} />
                <SwitchRow label="Check for updates" value={pickBoolean(draft, ['check_updates'], true)} onValueChange={value => setDraft(current => ({ ...current, check_updates: value }))} colors={colors} />
                <SwitchRow label="Check printer firmware" value={pickBoolean(draft, ['check_printer_firmware'], true)} onValueChange={value => setDraft(current => ({ ...current, check_printer_firmware: value }))} colors={colors} />
                <SwitchRow label="Include beta updates" value={pickBoolean(draft, ['include_beta_updates'])} onValueChange={value => setDraft(current => ({ ...current, include_beta_updates: value }))} colors={colors} />
              </SectionCard>
              <SectionCard title="Cost tracking" subtitle="Defaults used in archive and stats calculations.">
                <TextField label="Currency" value={pickString(draft, ['currency'], 'USD')} onChangeText={value => setDraft(current => ({ ...current, currency: value }))} />
                <TextField label="Default filament cost / kg" value={pickString(draft, ['default_filament_cost'], '0')} onChangeText={value => setDraft(current => ({ ...current, default_filament_cost: Number(value) || 0 }))} keyboardType="decimal-pad" />
                <TextField label="Energy cost / kWh" value={pickString(draft, ['energy_cost_per_kwh'], '0')} onChangeText={value => setDraft(current => ({ ...current, energy_cost_per_kwh: Number(value) || 0 }))} keyboardType="decimal-pad" />
              </SectionCard>
            </>
          ) : null}

          {section === 'plugs' ? (
            <SectionCard title="Smart plugs" subtitle="Connected power devices and quick state toggles.">
              {((smartPlugsQuery.data ?? []) as ApiRecord[]).length > 0 ? (
                ((smartPlugsQuery.data ?? []) as ApiRecord[]).map(plug => {
                  const enabled = pickBoolean(plug, ['is_on', 'state', 'enabled']);
                  return (
                    <View key={pickString(plug, ['id'])} style={[styles.itemCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                      <View style={styles.itemHeader}>
                        <View style={styles.itemText}>
                          <Text style={[styles.itemTitle, { color: colors.text }]}>{pickString(plug, ['name'], 'Smart plug')}</Text>
                          <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>{pickString(plug, ['brand', 'ip_address'], 'Unknown device')}</Text>
                        </View>
                        <Switch value={enabled} onValueChange={value => void togglePlugMutation.mutateAsync({ id: pickNumber(plug, ['id']), state: value })} trackColor={{ false: colors.surfaceHover, true: colors.accent }} thumbColor={colors.text} />
                      </View>
                    </View>
                  );
                })
              ) : (
                <EmptyState icon="⏻" title="No smart plugs" message="Add or discover smart plugs from the web app to manage them here." />
              )}
            </SectionCard>
          ) : null}

          {section === 'notifications' ? (
            <SectionCard title="Notifications" subtitle="Provider status plus a shortcut to the dedicated notification preferences screen.">
              <Text style={[styles.helper, { color: colors.textSecondary }]}>Providers: {((providersQuery.data ?? []) as ApiRecord[]).length}</Text>
              {((providersQuery.data ?? []) as ApiRecord[]).slice(0, 5).map(provider => (
                <View key={pickString(provider, ['id'])} style={[styles.itemCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                  <View style={styles.itemHeader}>
                    <View style={styles.itemText}>
                      <Text style={[styles.itemTitle, { color: colors.text }]}>{pickString(provider, ['name'], 'Provider')}</Text>
                      <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>{pickString(provider, ['type', 'provider_type'], 'Unknown type')}</Text>
                    </View>
                    <StatusBadge label={pickBoolean(provider, ['enabled']) ? 'enabled' : 'disabled'} color={statusColor(pickBoolean(provider, ['enabled']) ? 'success' : 'offline', colors)} />
                  </View>
                </View>
              ))}
              <PrimaryButton label="Open notification preferences" onPress={() => navigation.navigate('Notifications')} variant="secondary" />
            </SectionCard>
          ) : null}

          {section === 'queue' ? (
            <>
              <SectionCard title="Default print options" subtitle="Applied when a new job is started.">
                {['default_bed_levelling', 'default_flow_cali', 'default_vibration_cali', 'default_layer_inspect', 'default_timelapse', 'default_nozzle_offset_cali'].map(key => (
                  <SwitchRow key={key} label={key.replace(/^default_/, '').replace(/_/g, ' ')} value={pickBoolean(draft, [key])} onValueChange={value => setDraft(current => ({ ...current, [key]: value }))} colors={colors} />
                ))}
              </SectionCard>
              <SectionCard title="Dispatch behavior" subtitle="Queue ordering, preheat, plate confirmation, and staggering.">
                <SwitchRow label="Shortest job first" value={pickBoolean(draft, ['queue_shortest_first'])} onValueChange={value => setDraft(current => ({ ...current, queue_shortest_first: value }))} colors={colors} />
                <SwitchRow label="Require plate clear confirmation" value={pickBoolean(draft, ['require_plate_clear'])} onValueChange={value => setDraft(current => ({ ...current, require_plate_clear: value }))} colors={colors} />
                <SwitchRow label="Preheat before queued prints" value={pickBoolean(draft, ['preheat_enabled'])} onValueChange={value => setDraft(current => ({ ...current, preheat_enabled: value }))} colors={colors} />
                <TextField label="Stagger group size" value={pickString(draft, ['stagger_group_size'], '1')} onChangeText={value => setDraft(current => ({ ...current, stagger_group_size: Number(value) || 1 }))} keyboardType="number-pad" />
                <TextField label="Stagger interval (minutes)" value={pickString(draft, ['stagger_interval_minutes'], '0')} onChangeText={value => setDraft(current => ({ ...current, stagger_interval_minutes: Number(value) || 0 }))} keyboardType="number-pad" />
                <TextField label="Max pipeline copies" value={pickString(draft, ['pipeline_max_copies'], '1')} onChangeText={value => setDraft(current => ({ ...current, pipeline_max_copies: Number(value) || 1 }))} keyboardType="number-pad" />
                <TextField label="Preferred slicer" value={pickString(draft, ['preferred_slicer'], 'bambu_studio')} onChangeText={value => setDraft(current => ({ ...current, preferred_slicer: value }))} />
                <SwitchRow label="Use slicer API" value={pickBoolean(draft, ['use_slicer_api'])} onValueChange={value => setDraft(current => ({ ...current, use_slicer_api: value }))} colors={colors} />
              </SectionCard>
            </>
          ) : null}

          {section === 'filament' ? (
            <>
              <SectionCard title="Filament warnings" subtitle="Stock thresholds, matching rules, and tracking defaults.">
                <SwitchRow label="Disable filament warnings" value={pickBoolean(draft, ['disable_filament_warnings'])} onValueChange={value => setDraft(current => ({ ...current, disable_filament_warnings: value }))} colors={colors} />
                <SwitchRow label="Prefer lowest filament" value={pickBoolean(draft, ['prefer_lowest_filament'])} onValueChange={value => setDraft(current => ({ ...current, prefer_lowest_filament: value }))} colors={colors} />
                <SwitchRow label="Expand print modal mapping" value={pickBoolean(draft, ['per_printer_mapping_expanded'])} onValueChange={value => setDraft(current => ({ ...current, per_printer_mapping_expanded: value }))} colors={colors} />
                <TextField label="Low stock threshold (%)" value={pickString(draft, ['low_stock_threshold'], '20')} onChangeText={value => setDraft(current => ({ ...current, low_stock_threshold: Number(value) || 20 }))} keyboardType="number-pad" />
                <TextField label="Forecast lead time (days)" value={pickString(draft, ['forecast_global_lead_time_days'], '14')} onChangeText={value => setDraft(current => ({ ...current, forecast_global_lead_time_days: Number(value) || 14 }))} keyboardType="number-pad" />
              </SectionCard>
              <SectionCard title="Spoolman & RFID" subtitle="Tracking source, connection, and unknown tag behavior.">
                <SwitchRow label="Spoolman enabled" value={pickBoolean(draft, ['spoolman_enabled'])} onValueChange={value => setDraft(current => ({ ...current, spoolman_enabled: value }))} colors={colors} />
                <SwitchRow label="Auto add unknown RFID" value={pickBoolean(draft, ['auto_add_unknown_rfid'])} onValueChange={value => setDraft(current => ({ ...current, auto_add_unknown_rfid: value }))} colors={colors} />
                <TextField label="Spoolman URL" value={pickString(draft, ['spoolman_url'])} onChangeText={value => setDraft(current => ({ ...current, spoolman_url: value }))} autoCapitalize="none" />
                <TextField label="AMS history retention (days)" value={pickString(draft, ['ams_history_retention_days'], '30')} onChangeText={value => setDraft(current => ({ ...current, ams_history_retention_days: Number(value) || 30 }))} keyboardType="number-pad" />
              </SectionCard>
            </>
          ) : null}

          {section === 'network' ? (
            <>
              <SectionCard title="Network endpoints" subtitle="External URL plus retry and automation integrations.">
                <TextField label="External URL" value={pickString(draft, ['external_url'])} onChangeText={value => setDraft(current => ({ ...current, external_url: value }))} autoCapitalize="none" />
                <SwitchRow label="FTP retry enabled" value={pickBoolean(draft, ['ftp_retry_enabled'])} onValueChange={value => setDraft(current => ({ ...current, ftp_retry_enabled: value }))} colors={colors} />
                <TextField label="FTP retry count" value={pickString(draft, ['ftp_retry_count'], '0')} onChangeText={value => setDraft(current => ({ ...current, ftp_retry_count: Number(value) || 0 }))} keyboardType="number-pad" />
                <TextField label="FTP retry delay (s)" value={pickString(draft, ['ftp_retry_delay'], '0')} onChangeText={value => setDraft(current => ({ ...current, ftp_retry_delay: Number(value) || 0 }))} keyboardType="number-pad" />
              </SectionCard>
              <SectionCard title="MQTT, Home Assistant, Prometheus" subtitle="Publish data to your automation stack.">
                <SwitchRow label="MQTT enabled" value={pickBoolean(draft, ['mqtt_enabled'])} onValueChange={value => setDraft(current => ({ ...current, mqtt_enabled: value }))} colors={colors} />
                <TextField label="MQTT broker" value={pickString(draft, ['mqtt_broker'])} onChangeText={value => setDraft(current => ({ ...current, mqtt_broker: value }))} />
                <TextField label="MQTT port" value={pickString(draft, ['mqtt_port'], '1883')} onChangeText={value => setDraft(current => ({ ...current, mqtt_port: Number(value) || 1883 }))} keyboardType="number-pad" />
                <TextField label="MQTT topic prefix" value={pickString(draft, ['mqtt_topic_prefix'])} onChangeText={value => setDraft(current => ({ ...current, mqtt_topic_prefix: value }))} />
                <SwitchRow label="Home Assistant enabled" value={pickBoolean(draft, ['ha_enabled'])} onValueChange={value => setDraft(current => ({ ...current, ha_enabled: value }))} colors={colors} />
                <TextField label="Home Assistant URL" value={pickString(draft, ['ha_url'])} onChangeText={value => setDraft(current => ({ ...current, ha_url: value }))} autoCapitalize="none" />
                <SwitchRow label="Prometheus enabled" value={pickBoolean(draft, ['prometheus_enabled'])} onValueChange={value => setDraft(current => ({ ...current, prometheus_enabled: value }))} colors={colors} />
                <TextField label="Prometheus token" value={pickString(draft, ['prometheus_token'])} onChangeText={value => setDraft(current => ({ ...current, prometheus_token: value }))} autoCapitalize="none" />
              </SectionCard>
            </>
          ) : null}

          {section === 'apikeys' ? (
            <SectionCard title="API keys" subtitle="Create personal or integration keys and revoke old ones.">
              <TextField label="New API key name" value={newApiKeyName} onChangeText={setNewApiKeyName} placeholder="Automation" />
              <PrimaryButton label={createApiKeyMutation.isPending ? 'Creating…' : 'Create API key'} onPress={() => void createApiKeyMutation.mutateAsync()} disabled={!newApiKeyName.trim() || createApiKeyMutation.isPending} loading={createApiKeyMutation.isPending} />
              {createdApiKey ? <Text style={[styles.helper, { color: colors.accentLight }]}>New key: {createdApiKey}</Text> : null}
              {((apiKeysQuery.data ?? []) as ApiRecord[]).map(key => (
                <View key={pickString(key, ['id'])} style={[styles.itemCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                  <View style={styles.itemHeader}>
                    <View style={styles.itemText}>
                      <Text style={[styles.itemTitle, { color: colors.text }]}>{pickString(key, ['name'], 'API key')}</Text>
                      <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>{pickString(key, ['created_at'], 'Created')}</Text>
                    </View>
                    <PrimaryButton label="Delete" variant="danger" onPress={() => void deleteApiKeyMutation.mutateAsync(pickNumber(key, ['id']))} />
                  </View>
                </View>
              ))}
            </SectionCard>
          ) : null}

          {section === 'virtual-printer' ? (
            <SectionCard title="Virtual printers" subtitle="Current virtual printer connections and lifecycle actions.">
              {((virtualPrintersQuery.data ?? []) as ApiRecord[]).length > 0 ? (
                ((virtualPrintersQuery.data ?? []) as ApiRecord[]).map(printer => {
                  const running = pickBoolean(printer, ['running', 'is_running', 'enabled']);
                  return (
                    <View key={pickString(printer, ['id'])} style={[styles.itemCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                      <View style={styles.itemHeader}>
                        <View style={styles.itemText}>
                          <Text style={[styles.itemTitle, { color: colors.text }]}>{pickString(printer, ['name'], 'Virtual printer')}</Text>
                          <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>{pickString(printer, ['host', 'bind_address', 'model'], 'Virtual printer')}</Text>
                        </View>
                        <StatusBadge label={running ? 'running' : 'stopped'} color={statusColor(running ? 'success' : 'offline', colors)} />
                      </View>
                      <View style={styles.actions}>
                        <PrimaryButton label="Start" variant="secondary" onPress={() => void virtualPrinterControl.mutateAsync({ id: pickNumber(printer, ['id']), action: 'start' })} />
                        <PrimaryButton label="Stop" variant="secondary" onPress={() => void virtualPrinterControl.mutateAsync({ id: pickNumber(printer, ['id']), action: 'stop' })} />
                      </View>
                    </View>
                  );
                })
              ) : (
                <EmptyState icon="🖨" title="No virtual printers" message="Create virtual printers on the server to manage them here." />
              )}
            </SectionCard>
          ) : null}

          {section === 'spoolbuddy' ? (
            <SectionCard title="SpoolBuddy devices" subtitle="Online device status, sensors, and calibration shortcuts.">
              {((spoolbuddyQuery.data ?? []) as ApiRecord[]).length > 0 ? (
                ((spoolbuddyQuery.data ?? []) as ApiRecord[]).map(device => (
                  <View key={pickString(device, ['id', 'device_id'])} style={[styles.itemCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                    <View style={styles.itemHeader}>
                      <View style={styles.itemText}>
                        <Text style={[styles.itemTitle, { color: colors.text }]}>{pickString(device, ['hostname', 'device_id'], 'SpoolBuddy')}</Text>
                        <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>Last seen: {pickString(device, ['last_seen'], 'Unknown')}</Text>
                      </View>
                      <StatusBadge label={pickBoolean(device, ['online']) ? 'online' : 'offline'} color={statusColor(pickBoolean(device, ['online']) ? 'success' : 'offline', colors)} />
                    </View>
                    <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>NFC: {pickBoolean(device, ['has_nfc']) ? 'yes' : 'no'} • Scale: {pickBoolean(device, ['has_scale']) ? 'yes' : 'no'}</Text>
                    <PrimaryButton label="Calibrate" variant="secondary" onPress={() => void calibrateSpoolbuddyMutation.mutateAsync(pickString(device, ['device_id']))} />
                  </View>
                ))
              ) : (
                <EmptyState icon="📡" title="No devices found" message="SpoolBuddy devices will appear here when they connect." />
              )}
            </SectionCard>
          ) : null}

          {section === 'failure-detection' ? (
            <SectionCard title="Failure detection" subtitle="Obico service configuration and current runtime state.">
              <SwitchRow label="Failure detection enabled" value={pickBoolean(draft, ['obico_enabled'])} onValueChange={value => setDraft(current => ({ ...current, obico_enabled: value }))} colors={colors} />
              <TextField label="ML service URL" value={pickString(draft, ['obico_ml_url'])} onChangeText={value => setDraft(current => ({ ...current, obico_ml_url: value }))} autoCapitalize="none" />
              <TextField label="Sensitivity" value={pickString(draft, ['obico_sensitivity'], 'medium')} onChangeText={value => setDraft(current => ({ ...current, obico_sensitivity: value }))} />
              <TextField label="Action" value={pickString(draft, ['obico_action'], 'notify')} onChangeText={value => setDraft(current => ({ ...current, obico_action: value }))} />
              <TextField label="Poll interval (s)" value={pickString(draft, ['obico_poll_interval'], '30')} onChangeText={value => setDraft(current => ({ ...current, obico_poll_interval: Number(value) || 30 }))} keyboardType="number-pad" />
              <Text style={[styles.helper, { color: colors.textSecondary }]}>Runtime: {pickBoolean(obicoQuery.data, ['enabled']) ? 'enabled' : 'disabled'} • Last error: {pickString(obicoQuery.data, ['last_error'], 'none')}</Text>
            </SectionCard>
          ) : null}

          {section === 'users' ? (
            <>
              <SectionCard title="Authentication" subtitle="Current auth mode, session policy, and login behavior.">
                <Text style={[styles.helper, { color: colors.textSecondary }]}>Advanced auth: {pickBoolean(advancedAuthQuery.data, ['advanced_auth_enabled']) ? 'enabled' : 'disabled'}</Text>
                <TextField label="Session max hours" value={pickString(draft, ['session_max_hours'], '24')} onChangeText={value => setDraft(current => ({ ...current, session_max_hours: Number(value) || 24 }))} keyboardType="number-pad" />
                <SwitchRow label="Local login enabled" value={pickBoolean(advancedAuthQuery.data, ['local_login_enabled'], true)} onValueChange={() => {}} colors={colors} disabled />
              </SectionCard>
              <SectionCard title="LDAP" subtitle="Directory status and editable LDAP settings fields.">
                <Text style={[styles.helper, { color: colors.textSecondary }]}>LDAP configured: {pickBoolean(ldapQuery.data, ['ldap_configured']) ? 'yes' : 'no'}</Text>
                <SwitchRow label="LDAP enabled" value={pickBoolean(draft, ['ldap_enabled'])} onValueChange={value => setDraft(current => ({ ...current, ldap_enabled: value }))} colors={colors} />
                <TextField label="Server URL" value={pickString(draft, ['ldap_server_url'])} onChangeText={value => setDraft(current => ({ ...current, ldap_server_url: value }))} autoCapitalize="none" />
                <TextField label="Bind DN" value={pickString(draft, ['ldap_bind_dn'])} onChangeText={value => setDraft(current => ({ ...current, ldap_bind_dn: value }))} autoCapitalize="none" />
                <TextField label="Search base" value={pickString(draft, ['ldap_search_base'])} onChangeText={value => setDraft(current => ({ ...current, ldap_search_base: value }))} autoCapitalize="none" />
                <TextField label="User filter" value={pickString(draft, ['ldap_user_filter'])} onChangeText={value => setDraft(current => ({ ...current, ldap_user_filter: value }))} autoCapitalize="none" />
                <SwitchRow label="Auto-provision users" value={pickBoolean(draft, ['ldap_auto_provision'])} onValueChange={value => setDraft(current => ({ ...current, ldap_auto_provision: value }))} colors={colors} />
                <PrimaryButton label="Open user management" variant="secondary" onPress={() => navigation.navigate('Users')} />
              </SectionCard>
            </>
          ) : null}

          {section === 'backup' ? (
            <>
              <SectionCard title="Local backups" subtitle="Schedule, retention, and ad-hoc backup actions.">
                <SwitchRow label="Scheduled local backup enabled" value={pickBoolean(draft, ['local_backup_enabled'])} onValueChange={value => setDraft(current => ({ ...current, local_backup_enabled: value }))} colors={colors} />
                <TextField label="Schedule" value={pickString(draft, ['local_backup_schedule'], 'daily')} onChangeText={value => setDraft(current => ({ ...current, local_backup_schedule: value }))} />
                <TextField label="Run time" value={pickString(draft, ['local_backup_time'], '02:00')} onChangeText={value => setDraft(current => ({ ...current, local_backup_time: value }))} />
                <TextField label="Retention" value={pickString(draft, ['local_backup_retention'], '7')} onChangeText={value => setDraft(current => ({ ...current, local_backup_retention: Number(value) || 7 }))} keyboardType="number-pad" />
                <TextField label="Backup path" value={pickString(draft, ['local_backup_path'])} onChangeText={value => setDraft(current => ({ ...current, local_backup_path: value }))} autoCapitalize="none" />
                <Text style={[styles.helper, { color: colors.textSecondary }]}>Last run: {pickString(localBackupStatusQuery.data, ['last_backup_at'], 'Never')}</Text>
                <View style={styles.actions}>
                  <PrimaryButton label="Run local backup" variant="secondary" onPress={() => void backupMutation.mutateAsync()} loading={backupMutation.isPending} />
                  <PrimaryButton label="Export full backup" variant="secondary" onPress={() => void exportBackupMutation.mutateAsync()} loading={exportBackupMutation.isPending} />
                </View>
                <Text style={[styles.helper, { color: colors.textSecondary }]}>Saved backups: {((localBackupsQuery.data ?? []) as ApiRecord[]).length}</Text>
              </SectionCard>
              <SectionCard title="GitHub backup" subtitle="Remote backup trigger and recent status.">
                <Text style={[styles.helper, { color: colors.textSecondary }]}>Configured: {pickBoolean(githubBackupQuery.data, ['configured']) ? 'yes' : 'no'}</Text>
                <Text style={[styles.helper, { color: colors.textSecondary }]}>Last status: {pickString(githubBackupQuery.data, ['last_backup_status'], 'Unknown')}</Text>
                <Text style={[styles.helper, { color: colors.textSecondary }]}>Last backup: {pickString(githubBackupQuery.data, ['last_backup_at'], 'Never')}</Text>
                <PrimaryButton label="Run GitHub backup" variant="secondary" onPress={() => void githubBackupMutation.mutateAsync()} loading={githubBackupMutation.isPending} />
              </SectionCard>
            </>
          ) : null}

          <PrimaryButton label={saveSettingsMutation.isPending ? 'Saving…' : 'Save settings'} onPress={() => void saveSettingsMutation.mutateAsync()} loading={saveSettingsMutation.isPending} />
          {!isAdmin ? <Text style={[styles.helper, { color: colors.warning }]}>Some sections may be read-only without admin access.</Text> : null}
        </>
      )}
    </ScrollView>
  );
}

function SwitchRow({
  label,
  value,
  onValueChange,
  colors,
  disabled,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  colors: ReturnType<typeof useTheme>['colors'];
  disabled?: boolean;
}) {
  return (
    <View style={styles.switchRow}>
      <Text style={[styles.switchLabel, { color: colors.text }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.surfaceHover, true: colors.accent }}
        thumbColor={colors.text}
        disabled={disabled}
      />
    </View>
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
  helper: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  itemCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    alignItems: 'center',
  },
  itemText: { flex: 1, gap: spacing.xs },
  itemTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  itemMeta: {
    fontSize: fontSize.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    alignItems: 'center',
  },
  switchLabel: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
});
