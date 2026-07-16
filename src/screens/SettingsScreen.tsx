import React from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { fontSize, spacing } from '@/theme/tokens';
import {
  PrimaryButton,
  SectionCard,
  SettingRow,
} from '@/components/common/AppUI';
import { ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { pickArray, pickString } from '@/utils/data';

const MODES = ['dark', 'light', 'system'] as const;

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Settings' });
  }, [navigation]);
  const { colors, mode, setMode } = useTheme();
  const { showToast } = useToast();

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
  });
  const apiKeysQuery = useQuery({
    queryKey: ['apiKeys'],
    queryFn: () => api.getApiKeys(),
  });
  const smartPlugsQuery = useQuery({
    queryKey: ['smartPlugs'],
    queryFn: () => api.getSmartPlugs(),
  });
  const updatesQuery = useQuery({
    queryKey: ['updateInfo'],
    queryFn: () => api.getUpdateInfo(),
  });
  const backupsQuery = useQuery({
    queryKey: ['localBackups'],
    queryFn: () => api.getLocalBackups(),
  });

  const backupMutation = useMutation({
    mutationFn: () => api.createLocalBackup(),
    onSuccess: async () => {
      await backupsQuery.refetch();
      showToast('Local backup created.', 'success');
    },
    onError: () => showToast('Could not create backup.', 'error'),
  });

  const refreshAll = async () => {
    await Promise.all([
      settingsQuery.refetch(),
      apiKeysQuery.refetch(),
      smartPlugsQuery.refetch(),
      updatesQuery.refetch(),
      backupsQuery.refetch(),
    ]);
  };

  if (settingsQuery.isLoading) {
    return <LoadingScreen message="Loading settings…" />;
  }

  if (settingsQuery.isError) {
    return (
      <ErrorState
        message="Unable to load settings."
        onRetry={() => void refreshAll()}
      />
    );
  }

  const settings = settingsQuery.data;
  const nextMode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
  const version = DeviceInfo.getVersion() || 'dev';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={settingsQuery.isRefetching}
          onRefresh={() => void refreshAll()}
          tintColor={colors.accent}
        />
      }
    >
      <SectionCard title="General">
        <SettingRow
          icon="settings"
          label="Theme"
          description="Switch app appearance."
          value={mode}
          onPress={() => setMode(nextMode)}
        />
        <SettingRow
          icon="globe"
          label="Language"
          description="Current locale used in the app."
          value={pickString(settings, ['language', 'locale'], 'English')}
        />
      </SectionCard>

      <SectionCard title="Workflow">
        <SettingRow
          icon="printer"
          label="Default print options"
          description="Preset behavior when starting a new print."
          value={pickString(
            settings,
            ['default_print_profile', 'defaults.print_profile'],
            'Standard',
          )}
        />
      </SectionCard>

      <SectionCard title="Integrations">
        <SettingRow
          icon="power"
          label="Smart Plugs"
          description="Connected power devices."
          value={`${(smartPlugsQuery.data ?? []).length} configured`}
        />
        <SettingRow
          icon="key"
          label="API Keys"
          description="Personal and service access tokens."
          value={`${(apiKeysQuery.data ?? []).length} active`}
        />
      </SectionCard>

      <SectionCard title="About">
        <SettingRow
          icon="info"
          label="Version"
          value={version}
          description="Installed mobile app version."
        />
        <SettingRow
          icon="refresh"
          label="Check for Updates"
          description="Latest backend version discovered."
          value={pickString(
            updatesQuery.data,
            ['latest_version', 'version'],
            'Unknown',
          )}
        />
      </SectionCard>

      <SectionCard
        title="Danger Zone"
        subtitle="Keep backups current before making major server changes."
      >
        <Text style={[styles.backupInfo, { color: colors.textSecondary }]}>
          Local backups available:{' '}
          {pickArray(backupsQuery.data, ['files', 'items']).length ||
            (backupsQuery.data ?? []).length}
        </Text>
        <View style={styles.buttonGroup}>
          <PrimaryButton
            label={
              backupMutation.isPending ? 'Creating backup…' : 'Create Backup'
            }
            onPress={() => void backupMutation.mutateAsync()}
            variant="secondary"
            loading={backupMutation.isPending}
          />
          <PrimaryButton
            label="Refresh Backup List"
            onPress={() => void backupsQuery.refetch()}
            variant="secondary"
          />
        </View>
      </SectionCard>
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
  backupInfo: {
    fontSize: fontSize.sm,
  },
  buttonGroup: {
    gap: spacing.md,
  },
});
