import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigationProp } from '@/navigation/types';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/api/client';
import {
  InlineTabBar,
  PrimaryButton,
  SectionCard,
  StatusBadge,
  TextField,
} from '@/components/common/AppUI';
import { CloudProfileDetailModal } from '@/components/profiles/CloudProfileDetailModal';
import { CloudProfileDiffModal } from '@/components/profiles/CloudProfileDiffModal';
import {
  EmptyState,
  ErrorState,
  LoadingScreen,
} from '@/components/common/StateScreens';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import type { CloudProfileDiffField } from '@/types/api';
import {
  formatDateTime,
  pickArray,
  pickBoolean,
  pickString,
  statusColor,
  type ApiRecord,
} from '@/utils/data';

type ProfileTab = 'cloud' | 'orca' | 'local' | 'kprofiles';
type CloudStep = 'login' | 'code' | 'token';

function normalizeProfiles(source: unknown): ApiRecord[] {
  if (Array.isArray(source)) {
    return source.filter(
      (item): item is ApiRecord => typeof item === 'object' && item !== null,
    );
  }

  if (typeof source === 'object' && source !== null) {
    const record = source as ApiRecord;
    const profiles = pickArray(record, ['profiles', 'items', 'results']);
    return profiles.filter(
      (item): item is ApiRecord => typeof item === 'object' && item !== null,
    );
  }

  return [];
}

function normalizeDiffFields(source: unknown): CloudProfileDiffField[] {
  const asRecord =
    typeof source === 'object' && source !== null ? (source as ApiRecord) : null;

  const items = asRecord
    ? pickArray(asRecord, ['fields', 'differences', 'changed_fields'])
    : [];

  return items
    .filter((item): item is ApiRecord => typeof item === 'object' && item !== null)
    .map(item => ({
      path: pickString(item, ['path', 'field', 'key'], 'unknown'),
      left_value: item.left_value ?? item.left ?? item.current,
      right_value: item.right_value ?? item.right ?? item.template,
      category: pickString(item, ['category']) || null,
      severity: pickString(item, ['severity']) || null,
    }));
}

function toRecord(value: unknown): ApiRecord | null {
  return typeof value === 'object' && value !== null ? (value as ApiRecord) : null;
}

export default function ProfilesScreen() {
  const navigation = useNavigation<RootNavigationProp<'Profiles'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Profiles' });
  }, [navigation]);

  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<ProfileTab>('cloud');
  const [cloudStep, setCloudStep] = useState<CloudStep>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [region, setRegion] = useState('global');
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [tfaKey, setTfaKey] = useState<string | undefined>();
  const [verificationType, setVerificationType] = useState('email');
  const [orcaEmail, setOrcaEmail] = useState('');
  const [orcaPassword, setOrcaPassword] = useState('');
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedCloudProfile, setSelectedCloudProfile] = useState<ApiRecord | null>(null);
  const [compareVisible, setCompareVisible] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);

  const cloudStatusQuery = useQuery({
    queryKey: ['cloudStatus'],
    queryFn: () => api.getCloudStatus(),
  });
  const cloudSyncStatusQuery = useQuery({
    queryKey: ['cloudProfileSyncStatus'],
    queryFn: () => api.getCloudProfileSyncStatus(),
    enabled: tab === 'cloud',
  });
  const orcaStatusQuery = useQuery({
    queryKey: ['orcaCloudStatus'],
    queryFn: () => api.orcaCloudStatus(),
  });
  const cloudProfilesQuery = useQuery({
    queryKey: ['cloudProfiles'],
    queryFn: () => api.getCloudProfiles(),
    enabled: tab === 'cloud',
  });
  const orcaProfilesQuery = useQuery({
    queryKey: ['orcaCloudProfiles'],
    queryFn: () => api.getOrcaCloudProfiles(),
    enabled: tab === 'orca',
  });
  const localQuery = useQuery({
    queryKey: ['localProfiles'],
    queryFn: () => api.getLocalPresets(),
    enabled: tab === 'local',
  });
  const kprofilesQuery = useQuery({
    queryKey: ['kprofiles'],
    queryFn: () => api.getKProfiles(),
    enabled: tab === 'kprofiles',
  });

  const selectedCloudSettingId =
    pickString(selectedCloudProfile, ['setting_id', 'id']) || null;

  const cloudProfileDetailQuery = useQuery({
    queryKey: ['cloudProfileDetail', selectedCloudSettingId],
    queryFn: () => {
      if (!selectedCloudSettingId) {
        throw new Error('Cloud profile setting ID is required.');
      }
      return api.getCloudProfileDetail(selectedCloudSettingId);
    },
    enabled: detailVisible && tab === 'cloud' && Boolean(selectedCloudSettingId),
    retry: false,
  });

  const cloudDiffQuery = useQuery({
    queryKey: ['cloudProfileDiff', compareSelection[0], compareSelection[1]],
    queryFn: () => api.compareCloudProfiles(compareSelection[0], compareSelection[1]),
    enabled: compareVisible && tab === 'cloud' && compareSelection.length === 2,
    retry: false,
  });

  const refreshAll = async () => {
    await Promise.all([
      cloudStatusQuery.refetch(),
      cloudSyncStatusQuery.refetch(),
      orcaStatusQuery.refetch(),
      cloudProfilesQuery.refetch(),
      orcaProfilesQuery.refetch(),
      localQuery.refetch(),
      kprofilesQuery.refetch(),
    ]);
  };

  const cloudLoginMutation = useMutation({
    mutationFn: () => api.cloudLogin(email.trim(), password, region),
    onSuccess: data => {
      if (pickBoolean(data, ['success'])) {
        showToast('Connected to Bambu Cloud.', 'success');
        void refreshAll();
        return;
      }
      if (pickBoolean(data, ['needs_verification'])) {
        setCloudStep('code');
        setTfaKey(pickString(data, ['tfa_key']) || undefined);
        setVerificationType(pickString(data, ['verification_type'], 'email'));
        showToast('Verification required.', 'info');
        return;
      }
      showToast(pickString(data, ['message'], 'Unable to log in.'), 'error');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to log in.', 'error'),
  });

  const cloudVerifyMutation = useMutation({
    mutationFn: () => api.cloudVerify(email.trim(), code.trim(), tfaKey, region),
    onSuccess: data => {
      if (pickBoolean(data, ['success'])) {
        showToast('Connected to Bambu Cloud.', 'success');
        setCloudStep('login');
        setCode('');
        void refreshAll();
        return;
      }
      showToast(pickString(data, ['message'], 'Verification failed.'), 'error');
    },
    onError: (error: Error) => showToast(error.message || 'Verification failed.', 'error'),
  });

  const cloudTokenMutation = useMutation({
    mutationFn: () => api.cloudSetToken(token.trim(), region),
    onSuccess: () => {
      showToast('Cloud access token saved.', 'success');
      setCloudStep('login');
      setToken('');
      void refreshAll();
    },
    onError: (error: Error) => showToast(error.message || 'Unable to save token.', 'error'),
  });

  const cloudLogoutMutation = useMutation({
    mutationFn: () => api.cloudLogout(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cloudStatus'] }),
        queryClient.invalidateQueries({ queryKey: ['cloudProfileSyncStatus'] }),
        queryClient.invalidateQueries({ queryKey: ['cloudProfiles'] }),
      ]);
      setCompareSelection([]);
      setCompareVisible(false);
      setDetailVisible(false);
      setSelectedCloudProfile(null);
      showToast('Bambu Cloud disconnected.', 'success');
    },
  });

  const cloudSyncMutation = useMutation({
    mutationFn: () => api.syncCloudProfiles(),
    onSuccess: async data => {
      const message = pickString(data, ['message'], 'Cloud profile sync started.');
      showToast(message, 'success');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cloudProfileSyncStatus'] }),
        queryClient.invalidateQueries({ queryKey: ['cloudProfiles'] }),
      ]);
    },
    onError: error => {
      if (error instanceof ApiError && error.status === 404) {
        showToast('Cloud profile sync endpoint is not available on this server.', 'error');
        return;
      }
      showToast(
        error instanceof Error ? error.message : 'Unable to trigger cloud sync.',
        'error',
      );
    },
  });

  const orcaLoginMutation = useMutation({
    mutationFn: () => api.orcaCloudPasswordLogin(orcaEmail.trim(), orcaPassword),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orcaCloudStatus'] });
      await queryClient.invalidateQueries({ queryKey: ['orcaCloudProfiles'] });
      showToast('Orca Cloud connected.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to connect Orca Cloud.', 'error'),
  });

  const orcaLogoutMutation = useMutation({
    mutationFn: () => api.orcaCloudLogout(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orcaCloudStatus'] });
      await queryClient.invalidateQueries({ queryKey: ['orcaCloudProfiles'] });
      showToast('Orca Cloud disconnected.', 'success');
    },
  });

  const activeQuery =
    tab === 'cloud'
      ? cloudProfilesQuery
      : tab === 'orca'
      ? orcaProfilesQuery
      : tab === 'local'
      ? localQuery
      : kprofilesQuery;

  const profiles = useMemo(() => normalizeProfiles(activeQuery.data), [activeQuery.data]);

  const cloudProfileById = useMemo(() => {
    const map = new Map<string, ApiRecord>();
    profiles.forEach(profile => {
      const settingId = pickString(profile, ['setting_id', 'id']);
      if (settingId) {
        map.set(settingId, profile);
      }
    });
    return map;
  }, [profiles]);

  const syncStatusSource = useMemo(() => {
    const syncRecord = toRecord(cloudSyncStatusQuery.data);
    if (syncRecord) return syncRecord;
    const profileRecord = toRecord(cloudProfilesQuery.data);
    return profileRecord;
  }, [cloudProfilesQuery.data, cloudSyncStatusQuery.data]);

  const syncStatusLabel =
    pickString(syncStatusSource, ['status', 'sync_state']) || 'Not available';
  const syncLastTimeRaw = pickString(syncStatusSource, [
    'last_sync_at',
    'last_synced_at',
    'last_successful_sync_at',
  ]);
  const syncLastTime = syncLastTimeRaw
    ? formatDateTime(syncLastTimeRaw)
    : 'Not available';

  const diffFields = useMemo(
    () => normalizeDiffFields(cloudDiffQuery.data),
    [cloudDiffQuery.data],
  );

  const detailProfileName = pickString(selectedCloudProfile, ['name', 'profile_name'], 'Profile');
  const compareLeftName =
    pickString(cloudProfileById.get(compareSelection[0]), ['name', 'profile_name']) ||
    compareSelection[0] ||
    'Left profile';
  const compareRightName =
    pickString(cloudProfileById.get(compareSelection[1]), ['name', 'profile_name']) ||
    compareSelection[1] ||
    'Right profile';

  const isCloudAuthenticated = pickBoolean(cloudStatusQuery.data, ['is_authenticated']);
  const canCompare = compareSelection.length === 2;

  const toggleCompareSelection = (settingId: string) => {
    setCompareSelection(current => {
      if (current.includes(settingId)) {
        return current.filter(id => id !== settingId);
      }
      if (current.length >= 2) {
        return [current[1], settingId];
      }
      return [...current, settingId];
    });
  };

  if (activeQuery.isLoading && tab !== 'cloud' && tab !== 'orca') {
    return <LoadingScreen message="Loading profiles…" />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={profiles}
        keyExtractor={(item, index) =>
          `${tab}-${pickString(item, ['setting_id', 'id', 'name'], String(index))}`
        }
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        refreshControl={
          <RefreshControl
            refreshing={
              activeQuery.isRefetching ||
              cloudStatusQuery.isRefetching ||
              cloudSyncStatusQuery.isRefetching ||
              orcaStatusQuery.isRefetching
            }
            onRefresh={() => void refreshAll()}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerArea}>
            <InlineTabBar
              value={tab}
              tabs={[
                { key: 'cloud', label: 'Cloud' },
                { key: 'orca', label: 'Orca Cloud' },
                { key: 'local', label: 'Local' },
                { key: 'kprofiles', label: 'K-Profiles' },
              ]}
              onChange={value => setTab(value as ProfileTab)}
            />

            {tab === 'cloud' ? (
              <SectionCard
                title="Bambu Cloud"
                subtitle={isCloudAuthenticated
                  ? `Signed in as ${pickString(cloudStatusQuery.data, ['email'], 'Unknown user')}`
                  : 'Sign in to sync Bambu Cloud slicer profiles.'}
                right={
                  <StatusBadge
                    label={isCloudAuthenticated ? 'connected' : 'disconnected'}
                    color={statusColor(
                      isCloudAuthenticated ? 'success' : 'offline',
                      colors,
                    )}
                  />
                }
              >
                <View
                  style={[
                    styles.syncMetaCard,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.syncMetaTitle, { color: colors.text }]}>
                    Sync status
                  </Text>
                  <View style={styles.syncMetaRow}>
                    <Text
                      style={[styles.syncMetaLabel, { color: colors.textSecondary }]}
                    >
                      Status
                    </Text>
                    <Text style={[styles.syncMetaValue, { color: colors.text }]}>
                      {syncStatusLabel}
                    </Text>
                  </View>
                  <View style={styles.syncMetaRow}>
                    <Text
                      style={[styles.syncMetaLabel, { color: colors.textSecondary }]}
                    >
                      Last sync
                    </Text>
                    <Text style={[styles.syncMetaValue, { color: colors.text }]}>
                      {syncLastTime}
                    </Text>
                  </View>
                </View>

                {isCloudAuthenticated ? (
                  <View style={styles.cloudActions}>
                    <PrimaryButton
                      label={cloudSyncMutation.isPending ? 'Syncing…' : 'Sync now'}
                      onPress={() => void cloudSyncMutation.mutateAsync()}
                      disabled={cloudSyncMutation.isPending}
                      loading={cloudSyncMutation.isPending}
                    />
                    <PrimaryButton
                      label={
                        canCompare
                          ? 'Compare selected templates'
                          : `Select ${2 - compareSelection.length} more profile(s)`
                      }
                      variant="secondary"
                      onPress={() => setCompareVisible(true)}
                      disabled={!canCompare}
                    />
                    <PrimaryButton
                      label={
                        cloudLogoutMutation.isPending
                          ? 'Disconnecting…'
                          : 'Disconnect'
                      }
                      variant="secondary"
                      onPress={() => void cloudLogoutMutation.mutateAsync()}
                    />
                  </View>
                ) : (
                  <View style={styles.loginWrap}>
                    {cloudStep === 'login' ? (
                      <>
                        <TextField
                          label="Email"
                          value={email}
                          onChangeText={setEmail}
                          keyboardType="email-address"
                          autoCapitalize="none"
                        />
                        <TextField
                          label="Password"
                          value={password}
                          onChangeText={setPassword}
                          secureTextEntry
                        />
                        <TextField
                          label="Region"
                          value={region}
                          onChangeText={setRegion}
                          placeholder="global or china"
                        />
                        <View style={styles.actions}>
                          <PrimaryButton
                            label={
                              cloudLoginMutation.isPending ? 'Signing in…' : 'Sign in'
                            }
                            onPress={() => void cloudLoginMutation.mutateAsync()}
                            disabled={
                              !email.trim() || !password || cloudLoginMutation.isPending
                            }
                            loading={cloudLoginMutation.isPending}
                          />
                          <PrimaryButton
                            label="Use token"
                            variant="secondary"
                            onPress={() => setCloudStep('token')}
                          />
                        </View>
                      </>
                    ) : null}
                    {cloudStep === 'code' ? (
                      <>
                        <Text style={[styles.helper, { color: colors.textSecondary }]}>
                          Enter the {verificationType === 'totp' ? 'TOTP' : 'verification'}{' '}
                          code for {email}.
                        </Text>
                        <TextField
                          label="Verification code"
                          value={code}
                          onChangeText={setCode}
                          keyboardType="number-pad"
                        />
                        <View style={styles.actions}>
                          <PrimaryButton
                            label="Back"
                            variant="secondary"
                            onPress={() => setCloudStep('login')}
                          />
                          <PrimaryButton
                            label={
                              cloudVerifyMutation.isPending ? 'Verifying…' : 'Verify'
                            }
                            onPress={() => void cloudVerifyMutation.mutateAsync()}
                            disabled={
                              !code.trim() || cloudVerifyMutation.isPending
                            }
                            loading={cloudVerifyMutation.isPending}
                          />
                        </View>
                      </>
                    ) : null}
                    {cloudStep === 'token' ? (
                      <>
                        <TextField
                          label="Access token"
                          value={token}
                          onChangeText={setToken}
                          multiline
                          autoCapitalize="none"
                        />
                        <TextField
                          label="Region"
                          value={region}
                          onChangeText={setRegion}
                          placeholder="global or china"
                        />
                        <View style={styles.actions}>
                          <PrimaryButton
                            label="Back"
                            variant="secondary"
                            onPress={() => setCloudStep('login')}
                          />
                          <PrimaryButton
                            label={
                              cloudTokenMutation.isPending ? 'Saving…' : 'Save token'
                            }
                            onPress={() => void cloudTokenMutation.mutateAsync()}
                            disabled={
                              !token.trim() || cloudTokenMutation.isPending
                            }
                            loading={cloudTokenMutation.isPending}
                          />
                        </View>
                      </>
                    ) : null}
                  </View>
                )}
              </SectionCard>
            ) : null}

            {tab === 'orca' ? (
              <SectionCard
                title="Orca Cloud"
                subtitle={pickBoolean(orcaStatusQuery.data, ['connected'])
                  ? `Signed in as ${pickString(orcaStatusQuery.data, ['email'], 'Unknown user')}`
                  : 'Sign in to sync Orca Cloud slicer profiles.'}
                right={
                  <StatusBadge
                    label={
                      pickBoolean(orcaStatusQuery.data, ['connected'])
                        ? 'connected'
                        : 'disconnected'
                    }
                    color={statusColor(
                      pickBoolean(orcaStatusQuery.data, ['connected'])
                        ? 'success'
                        : 'offline',
                      colors,
                    )}
                  />
                }
              >
                {pickBoolean(orcaStatusQuery.data, ['connected']) ? (
                  <PrimaryButton
                    label={orcaLogoutMutation.isPending ? 'Disconnecting…' : 'Disconnect'}
                    variant="secondary"
                    onPress={() => void orcaLogoutMutation.mutateAsync()}
                  />
                ) : (
                  <View style={styles.loginWrap}>
                    <TextField
                      label="Email"
                      value={orcaEmail}
                      onChangeText={setOrcaEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                    <TextField
                      label="Password"
                      value={orcaPassword}
                      onChangeText={setOrcaPassword}
                      secureTextEntry
                    />
                    <PrimaryButton
                      label={orcaLoginMutation.isPending ? 'Signing in…' : 'Sign in'}
                      onPress={() => void orcaLoginMutation.mutateAsync()}
                      disabled={
                        !orcaEmail.trim() || !orcaPassword || orcaLoginMutation.isPending
                      }
                      loading={orcaLoginMutation.isPending}
                    />
                  </View>
                )}
              </SectionCard>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const state = pickString(item, ['status', 'source', 'type'], tab);
          const settingId = pickString(item, ['setting_id', 'id']) || '';
          const isSelectedForCompare = compareSelection.includes(settingId);
          return (
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.cardBorder },
              ]}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardText}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>
                    {pickString(item, ['name', 'profile_name'], 'Unnamed profile')}
                  </Text>
                  <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                    {pickString(item, ['type', 'printer_model', 'material'], 'Profile')}
                  </Text>
                </View>
                <StatusBadge label={state} color={statusColor(state, colors)} />
              </View>
              <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                {pickString(
                  item,
                  ['description', 'path', 'setting_id', 'source'],
                  'No profile details available.',
                )}
              </Text>
              <Text style={[styles.cardMeta, { color: colors.textTertiary }]}>
                {formatDateTime(
                  pickString(item, ['updated_time', 'updated_at', 'created_at']),
                )}
              </Text>

              {tab === 'cloud' ? (
                <View style={styles.cardActions}>
                  <PrimaryButton
                    label="Details"
                    variant="secondary"
                    onPress={() => {
                      setSelectedCloudProfile(item);
                      setDetailVisible(true);
                    }}
                    disabled={!settingId}
                  />
                  <PrimaryButton
                    label={isSelectedForCompare ? 'Selected' : 'Select to compare'}
                    variant={isSelectedForCompare ? 'primary' : 'secondary'}
                    onPress={() => toggleCompareSelection(settingId)}
                    disabled={!settingId}
                  />
                </View>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={
          activeQuery.isLoading ? (
            <LoadingScreen message="Loading profiles…" />
          ) : activeQuery.isError ? (
            <ErrorState
              message="Unable to load profiles."
              onRetry={() => void activeQuery.refetch()}
            />
          ) : (
            <EmptyState
              icon="🗂"
              title="No profiles found"
              message="Switch sources or sign in to view available profiles."
            />
          )
        }
      />

      <CloudProfileDetailModal
        visible={detailVisible}
        profileName={detailProfileName}
        detail={cloudProfileDetailQuery.data ?? null}
        isLoading={cloudProfileDetailQuery.isLoading || cloudProfileDetailQuery.isFetching}
        errorMessage={
          cloudProfileDetailQuery.error instanceof Error
            ? cloudProfileDetailQuery.error.message
            : null
        }
        onRetry={() => void cloudProfileDetailQuery.refetch()}
        onClose={() => setDetailVisible(false)}
      />

      <CloudProfileDiffModal
        visible={compareVisible}
        leftLabel={compareLeftName}
        rightLabel={compareRightName}
        fields={diffFields}
        isLoading={cloudDiffQuery.isFetching}
        errorMessage={
          cloudDiffQuery.error instanceof Error ? cloudDiffQuery.error.message : null
        }
        onRetry={() => void cloudDiffQuery.refetch()}
        onClose={() => setCompareVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  headerArea: {
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  loginWrap: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  helper: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cloudActions: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  syncMetaCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  syncMetaTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  syncMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  syncMetaLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  syncMetaValue: {
    fontSize: fontSize.sm,
    flex: 1,
    textAlign: 'right',
  },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  cardText: {
    flex: 1,
    gap: spacing.xs,
  },
  cardTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  cardMeta: {
    fontSize: fontSize.sm,
  },
  cardActions: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
