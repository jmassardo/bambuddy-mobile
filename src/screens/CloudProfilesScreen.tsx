import React, { useCallback, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigationProp } from '@/navigation/types';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronUp,
  TriangleAlert,
  X,
} from 'lucide-react-native';
import { api, ApiError } from '@/api/client';
import {
  InlineTabBar,
  PrimaryButton,
  SectionCard,
  StatusBadge,
} from '@/components/common/AppUI';
import {
  EmptyState,
  ErrorState,
  LoadingScreen,
} from '@/components/common/StateScreens';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { CloudProfileDetailModal } from '@/components/profiles/CloudProfileDetailModal';
import { CloudProfileDiffModal } from '@/components/profiles/CloudProfileDiffModal';
import type { CloudProfileDiffField, CloudPerProfileSyncState } from '@/types/api';
import {
  formatDateTime,
  pickArray,
  pickBoolean,
  pickString,
  statusColor,
  type ApiRecord,
} from '@/utils/data';

type CloudProfilesTab = 'cloud' | 'orca';

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

export default function CloudProfilesScreen() {
  const navigation = useNavigation<RootNavigationProp<'Profiles'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Cloud Profiles' });
  }, [navigation]);

  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<CloudProfilesTab>('cloud');
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedCloudProfile, setSelectedCloudProfile] = useState<ApiRecord | null>(null);
  const [compareVisible, setCompareVisible] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [expandedProfileId, setExpandedProfileId] = useState<string | null>(null);

  const cloudStatusQuery = useQuery({
    queryKey: ['cloudStatus'],
    queryFn: () => api.getCloudStatus(),
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

  const cloudPerProfileSyncQuery = useQuery({
    queryKey: ['cloudPerProfileSync', 'cloud'],
    queryFn: () => api.getPerProfileSyncStates(),
    enabled: tab === 'cloud',
  });

  const orcaPerProfileSyncQuery = useQuery({
    queryKey: ['cloudPerProfileSync', 'orca'],
    queryFn: async () => {
      const profiles = orcaProfilesQuery.data as ApiRecord[] | undefined;
      if (!profiles || profiles.length === 0) {
        return { profiles: [] };
      }
      return {
        profiles: profiles.map((p) => {
          const settingId = pickString(p, ['setting_id', 'id'], '');
          return {
            setting_id: settingId,
            name: pickString(p, ['name', 'profile_name'], ''),
            enabled: true,
            last_sync_at: pickString(p, ['updated_time', 'updated_at']),
            sync_state: 'ok',
          } as CloudPerProfileSyncState;
        }),
      };
    },
    enabled: tab === 'orca',
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

  const refreshAll = useCallback(async () => {
    await Promise.all([
      cloudStatusQuery.refetch(),
      orcaStatusQuery.refetch(),
      cloudProfilesQuery.refetch(),
      orcaProfilesQuery.refetch(),
      cloudPerProfileSyncQuery.refetch(),
      orcaPerProfileSyncQuery.refetch(),
    ]);
  }, [cloudStatusQuery, orcaStatusQuery, cloudProfilesQuery, orcaProfilesQuery, cloudPerProfileSyncQuery, orcaPerProfileSyncQuery]);

  const cloudLogoutMutation = useMutation({
    mutationFn: () => api.cloudLogout(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cloudStatus'] }),
        queryClient.invalidateQueries({ queryKey: ['cloudProfileSyncStatus'] }),
        queryClient.invalidateQueries({ queryKey: ['cloudProfiles'] }),
        queryClient.invalidateQueries({ queryKey: ['cloudPerProfileSync'] }),
      ]);
      setCompareSelection([]);
      setCompareVisible(false);
      setDetailVisible(false);
      setSelectedCloudProfile(null);
      showToast('Bambu Cloud disconnected.', 'success');
    },
  });

  const orcaLogoutMutation = useMutation({
    mutationFn: () => api.orcaCloudLogout(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orcaCloudStatus'] });
      await queryClient.invalidateQueries({ queryKey: ['orcaCloudProfiles'] });
      showToast('Orca Cloud disconnected.', 'success');
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
        queryClient.invalidateQueries({ queryKey: ['cloudPerProfileSync'] }),
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

  const toggleProfileSyncMutation = useMutation({
    mutationFn: ({ settingId, enabled }: { settingId: string; enabled: boolean }) =>
      api.updateCloudProfileSync(settingId, enabled),
    onSuccess: async (_, variables) => {
      showToast(
        variables.enabled ? 'Sync enabled for profile.' : 'Sync disabled for profile.',
        'success',
      );
      await queryClient.invalidateQueries({ queryKey: ['cloudPerProfileSync', tab] });
    },
    onError: error => {
      showToast(error.message || 'Unable to update sync setting.', 'error');
    },
  });

  const syncSingleProfileMutation = useMutation({
    mutationFn: (settingId: string) => api.syncSingleCloudProfile(settingId),
    onSuccess: async () => {
      showToast('Profile sync started.', 'success');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cloudProfiles'] }),
        queryClient.invalidateQueries({ queryKey: ['cloudPerProfileSync', tab] }),
      ]);
    },
    onError: error => {
      showToast(error.message || 'Unable to sync profile.', 'error');
    },
  });

  const clearProfileErrorMutation = useMutation({
    mutationFn: (settingId: string) => api.clearCloudProfileSyncError(settingId),
    onSuccess: async () => {
      showToast('Error cleared.', 'success');
      await queryClient.invalidateQueries({ queryKey: ['cloudPerProfileSync', tab] });
    },
    onError: error => {
      showToast(error.message || 'Unable to clear error.', 'error');
    },
  });

  const activeProfiles = useMemo(() => {
    if (tab === 'cloud') return normalizeProfiles(cloudProfilesQuery.data);
    return normalizeProfiles(orcaProfilesQuery.data);
  }, [tab, cloudProfilesQuery.data, orcaProfilesQuery.data]);

  const syncStatesMap = useMemo(() => {
    const map = new Map<string, CloudPerProfileSyncState>();
    const syncData = tab === 'cloud'
      ? cloudPerProfileSyncQuery.data
      : orcaPerProfileSyncQuery.data;

    const profiles = (syncData as { profiles?: CloudPerProfileSyncState[] } | undefined)?.profiles;
    if (profiles) {
      profiles.forEach(state => {
        map.set(state.setting_id, state);
      });
    }

    activeProfiles.forEach(profile => {
      const settingId = pickString(profile, ['setting_id', 'id']);
      if (settingId && !map.has(settingId)) {
        map.set(settingId, {
          setting_id: settingId,
          name: pickString(profile, ['name', 'profile_name']),
          enabled: true,
          sync_state: 'ok',
        });
      }
    });

    return map;
  }, [activeProfiles, cloudPerProfileSyncQuery.data, orcaPerProfileSyncQuery.data, tab]);

  const syncStates = useMemo(() => {
    return Array.from(syncStatesMap.values()).sort((a, b) => {
      if (a.enabled === b.enabled) return 0;
      return a.enabled ? -1 : 1;
    });
  }, [syncStatesMap]);

  const enabledCount = useMemo(
    () => syncStates.filter(s => s.enabled).length,
    [syncStates],
  );

  const hasErrors = useMemo(
    () => syncStates.some(s => s.error),
    [syncStates],
  );

  const cloudProfileById = useMemo(() => {
    const map = new Map<string, ApiRecord>();
    activeProfiles.forEach(profile => {
      const settingId = pickString(profile, ['setting_id', 'id']);
      if (settingId) {
        map.set(settingId, profile);
      }
    });
    return map;
  }, [activeProfiles]);

  const cloudStatusRecord = toRecord(cloudStatusQuery.data);
  const cloudIsAuthenticated = pickBoolean(cloudStatusRecord ?? {}, ['is_authenticated']);
  const orcaConnected = pickBoolean(orcaStatusQuery.data, ['connected']);

  const detailProfileName = pickString(selectedCloudProfile, ['name', 'profile_name'], 'Profile');
  const compareLeftName =
    pickString(cloudProfileById.get(compareSelection[0]), ['name', 'profile_name']) ||
    compareSelection[0] ||
    'Left profile';
  const compareRightName =
    pickString(cloudProfileById.get(compareSelection[1]), ['name', 'profile_name']) ||
    compareSelection[1] ||
    'Right profile';

  const diffFields = useMemo(
    () => normalizeDiffFields(cloudDiffQuery.data),
    [cloudDiffQuery.data],
  );

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

  const toggleProfileSync = (settingId: string, enabled: boolean) => {
    toggleProfileSyncMutation.mutate({ settingId, enabled });
  };

  const handleSyncSingleProfile = (settingId: string) => {
    syncSingleProfileMutation.mutate(settingId);
  };

  const handleClearError = (settingId: string) => {
    clearProfileErrorMutation.mutate(settingId);
  };

  const handleToggleExpand = (settingId: string) => {
    setExpandedProfileId(prev => (prev === settingId ? null : settingId));
  };

  const getSyncStateColor = (state: string | null | undefined): string => {
    if (!state) return colors.textTertiary;
    const normalized = state.toLowerCase();
    if (normalized === 'ok' || normalized === 'idle') return colors.success;
    if (normalized === 'failed' || normalized === 'error') return colors.error;
    if (normalized === 'syncing') return colors.accent;
    return colors.textSecondary;
  };

  if (cloudProfilesQuery.isLoading || orcaProfilesQuery.isLoading) {
    return <LoadingScreen message="Loading cloud profiles…" />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={syncStates}
        keyExtractor={item => `sync-${item.setting_id}`}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={
              cloudStatusQuery.isRefetching ||
              orcaStatusQuery.isRefetching ||
              cloudPerProfileSyncQuery.isRefetching ||
              orcaPerProfileSyncQuery.isRefetching ||
              cloudSyncMutation.isPending ||
              toggleProfileSyncMutation.isPending ||
              syncSingleProfileMutation.isPending
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
                { key: 'cloud', label: 'Bambu Cloud' },
                { key: 'orca', label: 'Orca Cloud' },
              ]}
              onChange={value => setTab(value as CloudProfilesTab)}
            />

            {tab === 'cloud' && (
              <SectionCard
                title="Bambu Cloud"
                subtitle={cloudIsAuthenticated
                  ? `Signed in as ${pickString(cloudStatusRecord, ['email'], 'Unknown user')}`
                  : 'Sign in to sync Bambu Cloud slicer profiles.'}
                right={
                  <StatusBadge
                    label={cloudIsAuthenticated ? 'connected' : 'disconnected'}
                    color={statusColor(
                      cloudIsAuthenticated ? 'success' : 'offline',
                      colors,
                    )}
                  />
                }
              >
                {cloudIsAuthenticated ? (
                  <View style={styles.cloudActions}>
                    <PrimaryButton
                      label={cloudSyncMutation.isPending ? 'Syncing…' : 'Sync all profiles'}
                      onPress={() => void cloudSyncMutation.mutateAsync()}
                      disabled={cloudSyncMutation.isPending}
                      loading={cloudSyncMutation.isPending}
                    />
                    <PrimaryButton
                      label={
                        cloudLogoutMutation.isPending
                          ? 'Disconnecting…'
                          : 'Disconnect'
                      }
                      variant="secondary"
                      onPress={() => {
                        Alert.alert(
                          'Disconnect Bambu Cloud',
                          'Are you sure you want to disconnect from Bambu Cloud?',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Disconnect',
                              style: 'destructive',
                              onPress: () => void cloudLogoutMutation.mutateAsync(),
                            },
                          ],
                        );
                      }}
                    />
                  </View>
                ) : (
                  <View style={styles.loginPrompt}>
                    <Text style={[styles.loginPromptText, { color: colors.textSecondary }]}>
                      Connect to Bambu Cloud to enable profile synchronization.
                    </Text>
                  </View>
                )}
              </SectionCard>
            )}

            {tab === 'orca' && (
              <SectionCard
                title="Orca Cloud"
                subtitle={orcaConnected
                  ? `Signed in as ${pickString(orcaStatusQuery.data, ['email'], 'Unknown user')}`
                  : 'Sign in to sync Orca Cloud slicer profiles.'}
                right={
                  <StatusBadge
                    label={orcaConnected ? 'connected' : 'disconnected'}
                    color={statusColor(orcaConnected ? 'success' : 'offline', colors)}
                  />
                }
              >
                {orcaConnected ? (
                  <View style={styles.cloudActions}>
                    <PrimaryButton
                      label={
                        orcaLogoutMutation.isPending
                          ? 'Disconnecting…'
                          : 'Disconnect'
                      }
                      variant="secondary"
                      onPress={() => {
                        Alert.alert(
                          'Disconnect Orca Cloud',
                          'Are you sure you want to disconnect from Orca Cloud?',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Disconnect',
                              style: 'destructive',
                              onPress: () => void orcaLogoutMutation.mutateAsync(),
                            },
                          ],
                        );
                      }}
                    />
                  </View>
                ) : (
                  <View style={styles.loginPrompt}>
                    <Text style={[styles.loginPromptText, { color: colors.textSecondary }]}>
                      Connect to Orca Cloud to enable profile synchronization.
                    </Text>
                  </View>
                )}
              </SectionCard>
            )}

            {activeProfiles.length > 0 && (
              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryNumber, { color: colors.accent }]}>
                      {enabledCount}
                    </Text>
                    <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                      Syncing
                    </Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryNumber, { color: colors.text }]}>
                      {syncStates.length}
                    </Text>
                    <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                      Total
                    </Text>
                  </View>
                  {hasErrors && (
                    <View style={styles.summaryItem}>
                      <Text style={[styles.summaryNumber, { color: colors.error }]}>
                        {syncStates.filter(s => s.error).length}
                      </Text>
                      <Text style={[styles.summaryLabel, { color: colors.error }]}>
                        Errors
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        renderItem={({ item }) => {
          const settingId = item.setting_id;
          const profile = cloudProfileById.get(settingId);
          const profileName = item.name || profile ? pickString(profile, ['name', 'profile_name'], 'Unnamed profile') : 'Unknown profile';
          const profileType = profile ? pickString(profile, ['type', 'printer_model', 'material'], 'Profile') : 'Profile';
          const profileVersion = profile ? pickString(profile, ['version']) : null;
          const lastSyncTime = item.last_sync_at
            ? formatDateTime(item.last_sync_at)
            : 'Never synced';
          const profileError = item.error;
          const isSyncing = !!item.syncing;
          const syncStateColor = getSyncStateColor(item.sync_state);
          const isSelectedForCompare = compareSelection.includes(settingId);
          const isExpanded = expandedProfileId === settingId;

          return (
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.cardBorder },
              ]}
            >
              <View style={styles.cardHeader}>
                <Pressable
                  onPress={() => handleToggleExpand(settingId)}
                  style={styles.cardHeaderLeft}
                >
                  <View style={styles.cardText}>
                    <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                      {profileName}
                    </Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                      {profileType}{profileVersion ? ` v${profileVersion}` : ''}
                    </Text>
                  </View>
                  {isExpanded ? (
                    <ChevronUp size={18} color={colors.textSecondary} />
                  ) : (
                    <ChevronDown size={18} color={colors.textSecondary} />
                  )}
                </Pressable>
              </View>

              <View style={styles.cardMetaRow}>
                <View style={styles.syncStatusRow}>
                  <View
                    style={[
                      styles.syncDot,
                      { backgroundColor: isSyncing ? colors.accent : syncStateColor },
                    ]}
                  />
                  <Text style={[styles.syncStatusLabel, { color: syncStateColor }]}>
                    {isSyncing ? 'Syncing…' : (item.sync_state || 'Idle')}
                  </Text>
                </View>
                <Text style={[styles.cardMeta, { color: colors.textTertiary }]}>
                  Last sync: {lastSyncTime}
                </Text>
              </View>

              <View style={styles.cardActions}>
                <View style={styles.syncToggle}>
                  <Pressable
                    onPress={() => toggleProfileSync(settingId, !item.enabled)}
                    disabled={toggleProfileSyncMutation.isPending}
                    style={[
                      styles.toggleButton,
                      {
                        backgroundColor: item.enabled ? colors.accent : colors.surfaceElevated,
                        borderColor: item.enabled ? colors.accent : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.toggleButtonText,
                        { color: item.enabled ? colors.textInverse : colors.textSecondary },
                      ]}
                    >
                      Sync {item.enabled ? 'On' : 'Off'}
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.actionButtons}>
                  {profileError ? (
                    <View style={styles.errorRow}>
                      <TriangleAlert size={14} color={colors.error} />
                      <Text style={[styles.errorText, { color: colors.error }]} numberOfLines={2}>
                        {profileError}
                      </Text>
                      <Pressable
                        onPress={() => handleClearError(settingId)}
                        style={styles.clearErrorButton}
                        disabled={clearProfileErrorMutation.isPending}
                      >
                        <X size={14} color={colors.error} />
                      </Pressable>
                    </View>
                  ) : null}
                  <View style={styles.primaryActions}>
                    <PrimaryButton
                      label={syncSingleProfileMutation.isPending ? 'Syncing…' : 'Sync now'}
                      variant="secondary"
                      onPress={() => handleSyncSingleProfile(settingId)}
                      disabled={syncSingleProfileMutation.isPending || !item.enabled}
                    />
                    {tab === 'cloud' && profile && (
                      <View style={styles.profileActionsRow}>
                        <PrimaryButton
                          label="Details"
                          variant="secondary"
                          onPress={() => {
                            setSelectedCloudProfile(profile);
                            setDetailVisible(true);
                          }}
                          disabled={!settingId}
                        />
                        <PrimaryButton
                          label={isSelectedForCompare ? 'Selected' : 'Select'}
                          variant={isSelectedForCompare ? 'primary' : 'secondary'}
                          onPress={() => toggleCompareSelection(settingId)}
                          disabled={!settingId}
                        />
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          cloudProfilesQuery.isLoading || orcaProfilesQuery.isLoading ? (
            <LoadingScreen message="Loading profiles…" />
          ) : cloudProfilesQuery.isError || orcaProfilesQuery.isError ? (
            <ErrorState
              message="Unable to load cloud profiles."
              onRetry={() => void refreshAll()}
            />
          ) : (
            <EmptyState
              icon="☁️"
              title="No cloud profiles"
              message={
                tab === 'cloud'
                  ? 'Sign in to Bambu Cloud to see your profiles.'
                  : 'Sign in to Orca Cloud to see your profiles.'
              }
            />
          )
        }
      />

      {tab === 'cloud' && (
        <>
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
            onClose={() => {
              setCompareVisible(false);
              setCompareSelection([]);
            }}
          />
        </>
      )}
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
  summaryCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryNumber: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  summaryLabel: {
    fontSize: fontSize.xs,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  loginPrompt: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  loginPromptText: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  cloudActions: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  card: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardText: {
    flex: 1,
    gap: 2,
    marginRight: spacing.sm,
  },
  cardTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  cardMeta: {
    fontSize: fontSize.sm,
  },
  cardMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  syncStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  syncDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  syncStatusLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  cardActions: {
    gap: spacing.sm,
  },
  syncToggle: {
    alignItems: 'center',
  },
  toggleButton: {
    borderRadius: borderRadius.full,
    borderWidth: 2,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xs,
  },
  toggleButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  actionButtons: {
    gap: spacing.sm,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    borderRadius: borderRadius.lg,
    backgroundColor: '#ff000026',
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: '#ff00004d',
  },
  errorText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  clearErrorButton: {
    padding: spacing.xs,
  },
  primaryActions: {
    gap: spacing.xs,
  },
  profileActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
