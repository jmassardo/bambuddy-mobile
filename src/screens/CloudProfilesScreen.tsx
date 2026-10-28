import { NativeTranslation, nativeMessage, translateNative, useLocalizedMemo, useNativeLocale } from '@/i18n';


import React, { useCallback, useState } from 'react';
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
  const titleLocale = useNativeLocale();
  const navigation = useNavigation<RootNavigationProp<'Profiles'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: translateNative('native.95ea1511baa9417b') });
  }, [navigation, titleLocale]);

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
        throw new Error(translateNative('native.1198078e8866d6bf'));
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
      showToast(nativeMessage('native.502f213e8add42fb'), 'success');
    },
  });

  const orcaLogoutMutation = useMutation({
    mutationFn: () => api.orcaCloudLogout(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orcaCloudStatus'] });
      await queryClient.invalidateQueries({ queryKey: ['orcaCloudProfiles'] });
      showToast(nativeMessage('native.c0008c470c9683b9'), 'success');
    },
  });

  const cloudSyncMutation = useMutation({
    mutationFn: () => api.syncCloudProfiles(),
    onSuccess: async data => {
      const message = pickString(data, ['message'], nativeMessage('native.3cd0f76541dbec4e'));
      showToast(message, 'success');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cloudProfileSyncStatus'] }),
        queryClient.invalidateQueries({ queryKey: ['cloudProfiles'] }),
        queryClient.invalidateQueries({ queryKey: ['cloudPerProfileSync'] }),
      ]);
    },
    onError: error => {
      if (error instanceof ApiError && error.status === 404) {
        showToast(nativeMessage('native.31f56b889cad7f45'), 'error');
        return;
      }
      showToast(
        error instanceof Error ? error.message : nativeMessage('native.62f6d6151446c8c9'),
        'error',
      );
    },
  });

  const toggleProfileSyncMutation = useMutation({
    mutationFn: ({ settingId, enabled }: { settingId: string; enabled: boolean }) =>
      api.updateCloudProfileSync(settingId, enabled),
    onSuccess: async (_, variables) => {
      showToast(
        variables.enabled ? nativeMessage('native.4dc72b404df27b5a') : nativeMessage('native.55ed37bc0cec26f9'),
        'success',
      );
      await queryClient.invalidateQueries({ queryKey: ['cloudPerProfileSync', tab] });
    },
    onError: error => {
      showToast(error.message || nativeMessage('native.18131f8f50ab6234'), 'error');
    },
  });

  const syncSingleProfileMutation = useMutation({
    mutationFn: (settingId: string) => api.syncSingleCloudProfile(settingId),
    onSuccess: async () => {
      showToast(nativeMessage('native.2cb737360995f7d6'), 'success');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cloudProfiles'] }),
        queryClient.invalidateQueries({ queryKey: ['cloudPerProfileSync', tab] }),
      ]);
    },
    onError: error => {
      showToast(error.message || nativeMessage('native.9d0b4a07729ea96d'), 'error');
    },
  });

  const clearProfileErrorMutation = useMutation({
    mutationFn: (settingId: string) => api.clearCloudProfileSyncError(settingId),
    onSuccess: async () => {
      showToast(nativeMessage('native.c3cef319a2fde8de'), 'success');
      await queryClient.invalidateQueries({ queryKey: ['cloudPerProfileSync', tab] });
    },
    onError: error => {
      showToast(error.message || nativeMessage('native.ada9835f4c6e29ba'), 'error');
    },
  });

  const activeProfiles = useLocalizedMemo(() => {
    if (tab === 'cloud') return normalizeProfiles(cloudProfilesQuery.data);
    return normalizeProfiles(orcaProfilesQuery.data);
  }, [tab, cloudProfilesQuery.data, orcaProfilesQuery.data]);

  const syncStatesMap = useLocalizedMemo(() => {
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

  const syncStates = useLocalizedMemo(() => {
    return Array.from(syncStatesMap.values()).sort((a, b) => {
      if (a.enabled === b.enabled) return 0;
      return a.enabled ? -1 : 1;
    });
  }, [syncStatesMap]);

  const enabledCount = useLocalizedMemo(
    () => syncStates.filter(s => s.enabled).length,
    [syncStates],
  );

  const hasErrors = useLocalizedMemo(
    () => syncStates.some(s => s.error),
    [syncStates],
  );

  const cloudProfileById = useLocalizedMemo(() => {
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
    translateNative('native.58ba2b81b28beb0a');
  const compareRightName =
    pickString(cloudProfileById.get(compareSelection[1]), ['name', 'profile_name']) ||
    compareSelection[1] ||
    translateNative('native.165a35e48a6591cb');

  const diffFields = useLocalizedMemo(
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
    return <LoadingScreen message={translateNative('native.3ce10bec7a9a3c57')} />;
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
                { key: 'cloud', get label() { return translateNative('native.7760833bbaf204fa'); } },
                { key: 'orca', get label() { return translateNative('native.017b63d4ec99a09a'); } },
              ]}
              onChange={value => setTab(value as CloudProfilesTab)}
            />

            {tab === 'cloud' && (
              <SectionCard
                title={translateNative('native.7760833bbaf204fa')}
                subtitle={cloudIsAuthenticated
                  ? translateNative('native.8f1354b37545d7f2', { value0: String(pickString(cloudStatusRecord, ['email'], translateNative('native.4cb2955dec6a0e41'))) })
                  : translateNative('native.e38154c70f65dd79')}
                right={
                  <StatusBadge
                    label={cloudIsAuthenticated ? translateNative('native.364df109cc5bb4ea') : translateNative('native.a8e228a68d46096f')}
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
                      label={cloudSyncMutation.isPending ? translateNative('native.64f720b4dcbe9443') : translateNative('native.1aaabdf4a1836861')}
                      onPress={() => void cloudSyncMutation.mutateAsync()}
                      disabled={cloudSyncMutation.isPending}
                      loading={cloudSyncMutation.isPending}
                    />
                    <PrimaryButton
                      label={
                        cloudLogoutMutation.isPending
                          ? translateNative('native.642cd71842fea4f9')
                          : translateNative('native.5aff88e68a7bc9d9')
                      }
                      variant="secondary"
                      onPress={() => {
                        Alert.alert(
                          translateNative('native.b2564be4f6e51616'),
                          translateNative('native.cd8736531ffbe74a'),
                          [
                            { get text() { return translateNative('common.cancel'); }, style: 'cancel' },
                            {
                              get text() { return translateNative('native.5aff88e68a7bc9d9'); },
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
                      {translateNative('native.8cbbdba04feeebce')}</Text>
                  </View>
                )}
              </SectionCard>
            )}

            {tab === 'orca' && (
              <SectionCard
                title={translateNative('native.017b63d4ec99a09a')}
                subtitle={orcaConnected
                  ? translateNative('native.8f1354b37545d7f2', { value0: String(pickString(orcaStatusQuery.data, ['email'], translateNative('native.4cb2955dec6a0e41'))) })
                  : translateNative('native.41a9750d9d31900d')}
                right={
                  <StatusBadge
                    label={orcaConnected ? translateNative('native.364df109cc5bb4ea') : translateNative('native.a8e228a68d46096f')}
                    color={statusColor(orcaConnected ? 'success' : 'offline', colors)}
                  />
                }
              >
                {orcaConnected ? (
                  <View style={styles.cloudActions}>
                    <PrimaryButton
                      label={
                        orcaLogoutMutation.isPending
                          ? translateNative('native.642cd71842fea4f9')
                          : translateNative('native.5aff88e68a7bc9d9')
                      }
                      variant="secondary"
                      onPress={() => {
                        Alert.alert(
                          translateNative('native.dfc3dade868b6a0d'),
                          translateNative('native.e814ceacc09d5fe5'),
                          [
                            { get text() { return translateNative('common.cancel'); }, style: 'cancel' },
                            {
                              get text() { return translateNative('native.5aff88e68a7bc9d9'); },
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
                      {translateNative('native.f36fe659773b445c')}</Text>
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
                      {translateNative('native.da36b50fec084ccf')}</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryNumber, { color: colors.text }]}>
                      {syncStates.length}
                    </Text>
                    <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                      {translateNative('common.total')}</Text>
                  </View>
                  {hasErrors && (
                    <View style={styles.summaryItem}>
                      <Text style={[styles.summaryNumber, { color: colors.error }]}>
                        {syncStates.filter(s => s.error).length}
                      </Text>
                      <Text style={[styles.summaryLabel, { color: colors.error }]}>
                        {translateNative('native.f74c8a0c80a9e929')}</Text>
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
          const profileName = item.name || profile ? pickString(profile, ['name', 'profile_name'], translateNative('native.8f051c1c891a20a3')) : translateNative('native.4e6e392cec8f574d');
          const profileType = profile ? pickString(profile, ['type', 'printer_model', 'material'], 'Profile') : 'Profile';
          const profileVersion = profile ? pickString(profile, ['version']) : null;
          const lastSyncTime = item.last_sync_at
            ? formatDateTime(item.last_sync_at)
            : translateNative('native.5a27865bd7fe73f4');
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
                      {profileType}{profileVersion ? translateNative('native.a162d55c64026ec9', { value0: String(profileVersion) }) : ''}
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
                    {isSyncing ? translateNative('native.64f720b4dcbe9443') : (item.sync_state || translateNative('native.a3b81f922d798281'))}
                  </Text>
                </View>
                <Text style={[styles.cardMeta, { color: colors.textTertiary }]}><NativeTranslation id="native.18878ffbdbc8deb6" values={{ value0: (lastSyncTime) }} /></Text>
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
                      {translateNative('native.006811695c6af86e')}{item.enabled ? translateNative('native.c7e4e8a8db2bbe79', { defaultValue: 'On' }) : translateNative('native.eaa897b0631e7896', { defaultValue: 'Off' })}
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
                      label={syncSingleProfileMutation.isPending ? translateNative('native.64f720b4dcbe9443') : translateNative('native.2b412e4ff6dabb29')}
                      variant="secondary"
                      onPress={() => handleSyncSingleProfile(settingId)}
                      disabled={syncSingleProfileMutation.isPending || !item.enabled}
                    />
                    {tab === 'cloud' && profile && (
                      <View style={styles.profileActionsRow}>
                        <PrimaryButton
                          label={translateNative('native.56f78a777dee08f1')}
                          variant="secondary"
                          onPress={() => {
                            setSelectedCloudProfile(profile);
                            setDetailVisible(true);
                          }}
                          disabled={!settingId}
                        />
                        <PrimaryButton
                          label={isSelectedForCompare ? translateNative('native.236fb1d1635f5eae') : translateNative('native.1943596f57b918ad')}
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
            <LoadingScreen message={translateNative('native.a729fe3fdb50f09e')} />
          ) : cloudProfilesQuery.isError || orcaProfilesQuery.isError ? (
            <ErrorState
              message={translateNative('native.4f4a0fecdb433230')}
              onRetry={() => void refreshAll()}
            />
          ) : (
            <EmptyState
              icon="☁️"
              title={translateNative('native.b0ab95d042e56c0a')}
              message={
                tab === 'cloud'
                  ? translateNative('native.e844394fa26e99a0')
                  : translateNative('native.a71def2858b4ff31')
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
