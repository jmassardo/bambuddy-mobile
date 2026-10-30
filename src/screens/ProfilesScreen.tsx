import { nativeMessage, translateNative, useLocalizedMemo, useNativeLocale, useNativeMessageState, useTranslation } from '@/i18n';


import { localizedStatus } from '@/utils/statusLabel';

import React, { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigationProp } from '@/navigation/types';
import {
  FlatList,
  Alert,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { errorCodes, isErrorWithCode, pick, types } from '@react-native-documents/picker';
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
import { PresetEditor } from '@/components/profiles/PresetEditor';
import { PresetFilters } from '@/components/profiles/PresetFilters';
import { OrcaDeviceAuthorization } from '@/components/profiles/OrcaDeviceAuthorization';
import { KProfileManager } from '@/components/profiles/KProfileManager';
import { profileManagementApi } from '@/api/profileManagement';
import { EMPTY_PRESET_FILTERS, filterPresets, presetRows } from '@/utils/profilePresets';

import { useAuth } from '@/contexts/AuthContext';
import {
  EmptyState,
  ErrorState,
  LoadingScreen,
} from '@/components/common/StateScreens';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import type { CloudProfileDetail, CloudProfileDiffField } from '@/types/api';
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
  return presetRows(source);
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

function formatProfileValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

export function formatKProfileDetail(item: ApiRecord): {
  subtitle: string;
  detail: string;
} {
  const kValue = formatProfileValue(item.k_value);
  const nCoef = formatProfileValue(item.n_coef);
  const nozzleDiameter = formatProfileValue(item.nozzle_diameter);
  const filamentId = formatProfileValue(item.filament_id);
  const amsId = formatProfileValue(item.ams_id);
  const trayId = formatProfileValue(item.tray_id);

  const subtitle = [
    nozzleDiameter ? `${nozzleDiameter} mm nozzle` : '',
    filamentId ? `Filament ${filamentId}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const calibration = [kValue ? `K ${kValue}` : '', nCoef ? `N ${nCoef}` : '']
    .filter(Boolean)
    .join(' · ');
  const placement = [amsId ? `AMS ${amsId}` : '', trayId ? `Tray ${trayId}` : '']
    .filter(Boolean)
    .join(' · ');

  return {
    subtitle: subtitle || translateNative('native.c02793c478af5ffe'),
    detail: [calibration, placement].filter(Boolean).join('\n'),
  };
}

export default function ProfilesScreen() {
  const titleLocale = useNativeLocale();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const navigation = useNavigation<RootNavigationProp<'Profiles'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: translateNative('nav.profiles') });
  }, [navigation, titleLocale]);

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
  const [filters, setFilters] = useState({ ...EMPTY_PRESET_FILTERS });
  const [editor, setEditor] = useState<{ profile: ApiRecord | null; duplicate: boolean } | null>(null);
  const [importFeedback, setImportFeedback] = useNativeMessageState('');
  const [importing, setImporting] = useState(false);
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
    queryFn: profileManagementApi.localList,
    enabled: tab === 'local',
  });
  const kprofilesQuery = useQuery({
    queryKey: ['kprofiles'],
    queryFn: () => api.getKProfiles(),
    enabled: false,
  });

  const selectedCloudSettingId =
    pickString(selectedCloudProfile, ['setting_id', 'id']) || null;

  const cloudProfileDetailQuery = useQuery({
    queryKey: ['cloudProfileDetail', tab, selectedCloudSettingId],
    queryFn: async (): Promise<CloudProfileDetail> => {
      if (!selectedCloudSettingId) {
        throw new Error(translateNative('native.1198078e8866d6bf'));
      }
      if (tab === 'orca' || tab === 'local') {
        const detail = tab === 'orca' ? await profileManagementApi.orcaDetail(selectedCloudSettingId) : await profileManagementApi.localDetail(Number(selectedCloudSettingId));
        return { ...detail, public: false, type: detail.type ?? detail.preset_type ?? '', update_time: typeof detail.updated_at === 'string' ? detail.updated_at : undefined };
      }
      return api.getCloudProfileDetail(selectedCloudSettingId);
    },
    enabled: detailVisible && Boolean(selectedCloudSettingId),
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
    ]);
  };

  const cloudLoginMutation = useMutation({
    mutationFn: () => api.cloudLogin(email.trim(), password, region),
    onSuccess: data => {
      if (pickBoolean(data, ['success'])) {
        showToast(nativeMessage('native.3b542c56b013acab'), 'success');
        void refreshAll();
        return;
      }
      if (pickBoolean(data, ['needs_verification'])) {
        setCloudStep('code');
        setTfaKey(pickString(data, ['tfa_key']) || undefined);
        setVerificationType(pickString(data, ['verification_type'], 'email'));
        showToast(nativeMessage('native.552ee7c59de72d81'), 'info');
        return;
      }
      showToast(pickString(data, ['message'], nativeMessage('native.d285dcb0d0a54ef6')), 'error');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.d285dcb0d0a54ef6'), 'error'),
  });

  const cloudVerifyMutation = useMutation({
    mutationFn: () => api.cloudVerify(email.trim(), code.trim(), tfaKey, region),
    onSuccess: data => {
      if (pickBoolean(data, ['success'])) {
        showToast(nativeMessage('native.3b542c56b013acab'), 'success');
        setCloudStep('login');
        setCode('');
        void refreshAll();
        return;
      }
      showToast(pickString(data, ['message'], nativeMessage('native.c70d003a4ff315cc')), 'error');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.c70d003a4ff315cc'), 'error'),
  });

  const cloudTokenMutation = useMutation({
    mutationFn: () => api.cloudSetToken(token.trim(), region),
    onSuccess: () => {
      showToast(nativeMessage('native.e5a51db520712234'), 'success');
      setCloudStep('login');
      setToken('');
      void refreshAll();
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.1054d2b1a09039b8'), 'error'),
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
      showToast(nativeMessage('native.502f213e8add42fb'), 'success');
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

  const orcaLogoutMutation = useMutation({
    mutationFn: () => api.orcaCloudLogout(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orcaCloudStatus'] });
      await queryClient.invalidateQueries({ queryKey: ['orcaCloudProfiles'] });
      showToast(nativeMessage('native.c0008c470c9683b9'), 'success');
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

  const allProfiles = useLocalizedMemo(() => normalizeProfiles(activeQuery.data), [activeQuery.data]);
  const profiles = useLocalizedMemo(() => tab === 'kprofiles' ? [] : filterPresets(allProfiles, filters), [allProfiles, filters, tab]);
  const importPresets = async () => {
    try {
      const files = await pick({ type: [types.allFiles], allowMultiSelection: true });
      setImporting(true);
      const results: string[] = [];
      for (const file of files) {
        try {
          const result = await profileManagementApi.localImport({ uri: file.uri, name: file.name ?? 'preset.json', type: file.type ?? 'application/octet-stream' });
          results.push(t('profiles.importResult', { defaultValue: '{{name}}: {{imported}} imported, {{skipped}} skipped. {{errors}}', name: file.name ?? 'preset', imported: result.imported, skipped: result.skipped, errors: result.errors.join('; ') }));
        } catch (error) { results.push(`${file.name}: ${String(error)}`); }
      }
      setImportFeedback(results.join('\n'));
      await localQuery.refetch();
    } catch (error) {
      if (!(isErrorWithCode(error) && error.code === errorCodes.OPERATION_CANCELED)) showToast(String(error), 'error');
    } finally { setImporting(false); }
  };
  const localDelete = useMutation({
    mutationFn: (id: number) => profileManagementApi.localRemove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['localProfiles'] }),
    onError: (error: Error) => showToast(error.message, 'error'),
  });

  const cloudProfileById = useLocalizedMemo(() => {
    const map = new Map<string, ApiRecord>();
    profiles.forEach(profile => {
      const settingId = pickString(profile, ['setting_id', 'id']);
      if (settingId) {
        map.set(settingId, profile);
      }
    });
    return map;
  }, [profiles]);

  const syncStatusSource = useLocalizedMemo(() => {
    const syncRecord = toRecord(cloudSyncStatusQuery.data);
    if (syncRecord) return syncRecord;
    const profileRecord = toRecord(cloudProfilesQuery.data);
    return profileRecord;
  }, [cloudProfilesQuery.data, cloudSyncStatusQuery.data]);

  const syncStatusLabel =
    pickString(syncStatusSource, ['status', 'sync_state']) || translateNative('native.a4250a6e9aca2324');
  const syncLastTimeRaw = pickString(syncStatusSource, [
    'last_sync_at',
    'last_synced_at',
    'last_successful_sync_at',
  ]);
  const syncLastTime = syncLastTimeRaw
    ? formatDateTime(syncLastTimeRaw)
    : translateNative('native.a4250a6e9aca2324');

  const diffFields = useLocalizedMemo(
    () => normalizeDiffFields(cloudDiffQuery.data),
    [cloudDiffQuery.data],
  );

  const detailProfileName = pickString(selectedCloudProfile, ['name', 'profile_name'], 'Profile');
  const compareLeftName =
    pickString(cloudProfileById.get(compareSelection[0]), ['name', 'profile_name']) ||
    compareSelection[0] ||
    translateNative('native.58ba2b81b28beb0a');
  const compareRightName =
    pickString(cloudProfileById.get(compareSelection[1]), ['name', 'profile_name']) ||
    compareSelection[1] ||
    translateNative('native.165a35e48a6591cb');

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
    return <LoadingScreen message={translateNative('native.a729fe3fdb50f09e')} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={profiles}
        keyExtractor={(item, index) =>
          `${tab}-${pickString(item, ['setting_id', 'id', 'name'], String(index))}`
        }
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={ProfilesItemSeparator}
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
                { key: 'cloud', get label() { return translateNative('native.94c587703daa4f41'); } },
                { key: 'orca', get label() { return translateNative('native.017b63d4ec99a09a'); } },
                { key: 'local', get label() { return translateNative('native.3df9c3407ef31a85'); } },
                { key: 'kprofiles', get label() { return translateNative('native.508118e1774263e5'); } },
              ]}
              onChange={value => { setTab(value as ProfileTab); setFilters({ ...EMPTY_PRESET_FILTERS }); setDetailVisible(false); }}
            />

            {tab === 'cloud' ? (
              <SectionCard
                title={translateNative('native.7760833bbaf204fa')}
                subtitle={isCloudAuthenticated
                  ? translateNative('native.8f1354b37545d7f2', { value0: String(pickString(cloudStatusQuery.data, ['email'], translateNative('native.4cb2955dec6a0e41'))) })
                  : translateNative('native.e38154c70f65dd79')}
                right={
                  <StatusBadge
                    label={isCloudAuthenticated ? translateNative('native.364df109cc5bb4ea') : translateNative('native.a8e228a68d46096f')}
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
                    {translateNative('native.98f4e4b9429218d4')}</Text>
                  <View style={styles.syncMetaRow}>
                    <Text
                      style={[styles.syncMetaLabel, { color: colors.textSecondary }]}
                    >
                      {translateNative('common.status')}</Text>
                    <Text style={[styles.syncMetaValue, { color: colors.text }]}>
                      {syncStatusLabel}
                    </Text>
                  </View>
                  <View style={styles.syncMetaRow}>
                    <Text
                      style={[styles.syncMetaLabel, { color: colors.textSecondary }]}
                    >
                      {translateNative('native.290d57f0cebfc0db')}</Text>
                    <Text style={[styles.syncMetaValue, { color: colors.text }]}>
                      {syncLastTime}
                    </Text>
                  </View>
                </View>

                {isCloudAuthenticated ? (
                  <View style={styles.cloudActions}>
                    <PrimaryButton
                      label={cloudSyncMutation.isPending ? translateNative('native.64f720b4dcbe9443') : translateNative('native.2b412e4ff6dabb29')}
                      onPress={() => void cloudSyncMutation.mutateAsync()}
                      disabled={cloudSyncMutation.isPending}
                      loading={cloudSyncMutation.isPending}
                    />
                    <PrimaryButton
                      label={
                        canCompare
                          ? translateNative('native.f78d49a8d981c8db')
                          : translateNative('native.cbc39f9433cbfddc', { value0: String(2 - compareSelection.length) })
                      }
                      variant="secondary"
                      onPress={() => setCompareVisible(true)}
                      disabled={!canCompare}
                    />
                    <PrimaryButton
                      label={
                        cloudLogoutMutation.isPending
                          ? translateNative('native.642cd71842fea4f9')
                          : translateNative('native.5aff88e68a7bc9d9')
                      }
                      variant="secondary"
                      disabled={cloudLogoutMutation.isPending}
                      loading={cloudLogoutMutation.isPending}
                      onPress={() => Alert.alert(
                        translateNative('native.b2564be4f6e51616'),
                        translateNative('native.cd8736531ffbe74a'),
                        [
                          { text: translateNative('common.cancel'), style: 'cancel' },
                          { text: translateNative('native.5aff88e68a7bc9d9'), style: 'destructive', onPress: () => cloudLogoutMutation.mutate() },
                        ],
                      )}
                    />
                  </View>
                ) : (
                  <View style={styles.loginWrap}>
                    {cloudStep === 'login' ? (
                      <>
                        <TextField
                          label={translateNative('native.6d96e259f012a733')}
                          value={email}
                          onChangeText={setEmail}
                          keyboardType="email-address"
                          autoCapitalize="none"
                        />
                        <TextField
                          label={translateNative('native.08c9c68cc706272f')}
                          value={password}
                          onChangeText={setPassword}
                          secureTextEntry
                        />
                        <TextField
                          label={translateNative('native.ed40cebd04984be5')}
                          value={region}
                          onChangeText={setRegion}
                          placeholder={translateNative('native.e6c072d59ece3995')}
                        />
                        <View style={styles.actions}>
                          <PrimaryButton
                            label={
                              cloudLoginMutation.isPending ? translateNative('native.1aeddc7b0b18d572') : translateNative('native.fceb50d391c98374')
                            }
                            onPress={() => void cloudLoginMutation.mutateAsync()}
                            disabled={
                              !email.trim() || !password || cloudLoginMutation.isPending
                            }
                            loading={cloudLoginMutation.isPending}
                          />
                          <PrimaryButton
                            label={translateNative('native.a4c20040cd4cfafc')}
                            variant="secondary"
                            onPress={() => setCloudStep('token')}
                          />
                        </View>
                      </>
                    ) : null}
                    {cloudStep === 'code' ? (
                      <>
                        <Text style={[styles.helper, { color: colors.textSecondary }]}>
                          {translateNative('native.99abb1648c7472fa')}{verificationType === 'totp' ? 'TOTP' : translateNative('native.47bb3fdbc789fbfd')}{' '}
                          {translateNative('native.defc56dd58e9aec5')}{email}.
                        </Text>
                        <TextField
                          label={translateNative('native.c137dc7718a985e1')}
                          value={code}
                          onChangeText={setCode}
                          keyboardType="number-pad"
                        />
                        <View style={styles.actions}>
                          <PrimaryButton
                            label={translateNative('common.back')}
                            variant="secondary"
                            onPress={() => setCloudStep('login')}
                          />
                          <PrimaryButton
                            label={
                              cloudVerifyMutation.isPending ? translateNative('native.5c1bf88a5cba056e') : translateNative('native.1724c049a83f5617')
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
                          label={translateNative('native.1c837b1be55522e5')}
                          value={token}
                          onChangeText={setToken}
                          multiline
                          autoCapitalize="none"
                        />
                        <TextField
                          label={translateNative('native.ed40cebd04984be5')}
                          value={region}
                          onChangeText={setRegion}
                          placeholder={translateNative('native.e6c072d59ece3995')}
                        />
                        <View style={styles.actions}>
                          <PrimaryButton
                            label={translateNative('common.back')}
                            variant="secondary"
                            onPress={() => setCloudStep('login')}
                          />
                          <PrimaryButton
                            label={
                              cloudTokenMutation.isPending ? translateNative('native.018c2002806e2312') : translateNative('native.9c9cded69a56b169')
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
                title={translateNative('native.017b63d4ec99a09a')}
                subtitle={pickBoolean(orcaStatusQuery.data, ['connected'])
                  ? translateNative('native.8f1354b37545d7f2', { value0: String(pickString(orcaStatusQuery.data, ['email'], translateNative('native.4cb2955dec6a0e41'))) })
                  : translateNative('native.41a9750d9d31900d')}
                right={
                  <StatusBadge
                    label={
                      pickBoolean(orcaStatusQuery.data, ['connected'])
                        ? translateNative('native.364df109cc5bb4ea')
                        : translateNative('native.a8e228a68d46096f')
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
                    label={orcaLogoutMutation.isPending ? translateNative('native.642cd71842fea4f9') : translateNative('native.5aff88e68a7bc9d9')}
                    variant="secondary"
                    disabled={orcaLogoutMutation.isPending}
                    loading={orcaLogoutMutation.isPending}
                    onPress={() => Alert.alert(
                      translateNative('native.dfc3dade868b6a0d'),
                      translateNative('native.e814ceacc09d5fe5'),
                      [
                        { text: translateNative('common.cancel'), style: 'cancel' },
                        { text: translateNative('native.5aff88e68a7bc9d9'), style: 'destructive', onPress: () => orcaLogoutMutation.mutate() },
                      ],
                    )}
                  />
                ) : <OrcaDeviceAuthorization />}
              </SectionCard>
            ) : null}
            {tab === 'kprofiles' ? <KProfileManager /> : <PresetFilters rows={allProfiles} value={filters} onChange={setFilters} />}
            {tab === 'cloud' && isCloudAuthenticated && hasPermission('cloud:auth') ? <PrimaryButton label={t('profiles.create', { defaultValue: 'Create preset / manage templates' })} onPress={() => setEditor({ profile: null, duplicate: false })} /> : null}
            {tab === 'local' && hasPermission('settings:update') ? <PrimaryButton label={t('profiles.importPresets', { defaultValue: 'Import JSON, ZIP, Orca or Bambu bundles' })} loading={importing} disabled={importing} onPress={() => void importPresets()} /> : null}
            {tab === 'local' && importFeedback ? <Text selectable style={{ color: colors.text }}>{importFeedback}</Text> : null}
          </View>
        }
        renderItem={({ item }) => {
          const state = pickString(item, ['status', 'source', 'type'], tab);
          const settingId = pickString(item, ['setting_id', 'id']) || '';
          const isSelectedForCompare = compareSelection.includes(settingId);
          const kProfileDetail =
            tab === 'kprofiles' ? formatKProfileDetail(item) : null;
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
                    {pickString(item, ['name', 'profile_name'], translateNative('native.8f051c1c891a20a3'))}
                  </Text>
                  <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                    {kProfileDetail?.subtitle ??
                      pickString(
                        item,
                        ['type', 'printer_model', 'material'],
                        'Profile',
                      )}
                  </Text>
                </View>
                <StatusBadge label={localizedStatus(state)} color={statusColor(state, colors)} />
              </View>
              <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                {kProfileDetail?.detail ??
                  pickString(
                    item,
                    ['description', 'path', 'setting_id', 'source'],
                    translateNative('native.dba9e36696cc35fe'),
                  )}
              </Text>
              <Text style={[styles.cardMeta, { color: colors.textTertiary }]}>
                {formatDateTime(
                  pickString(item, ['updated_time', 'updated_at', 'created_at']),
                )}
              </Text>

              {tab !== 'kprofiles' ? (
                <View style={styles.cardActions}>
                  <PrimaryButton
                    label={translateNative('native.56f78a777dee08f1')}
                    variant="secondary"
                    onPress={() => {
                      setSelectedCloudProfile(item);
                      setDetailVisible(true);
                    }}
                    disabled={!settingId}
                  />
                  {tab === 'cloud' && hasPermission('cloud:auth') ? <>
                    <PrimaryButton label={t('profiles.duplicate', { defaultValue: 'Duplicate' })} variant="secondary" onPress={() => setEditor({ profile: item, duplicate: true })} />
                    {item.is_custom === true ? <PrimaryButton label={t('profiles.edit', { defaultValue: 'Edit / advanced / templates' })} variant="secondary" onPress={() => setEditor({ profile: item, duplicate: false })} /> : null}
                  </> : null}
                  {tab === 'local' && hasPermission('settings:update') ? <PrimaryButton label={t('common.delete')} variant="danger" disabled={localDelete.isPending} onPress={() => Alert.alert(t('profiles.deleteLocal', { defaultValue: 'Delete local preset?' }), String(item.name), [{ text: t('common.cancel'), style: 'cancel' }, { text: t('common.delete'), style: 'destructive', onPress: () => localDelete.mutate(Number(item.id)) }])} /> : null}
                  {tab === 'cloud' ? <PrimaryButton
                    label={isSelectedForCompare ? translateNative('native.236fb1d1635f5eae') : translateNative('native.27e93c95cc59825f')}
                    variant={isSelectedForCompare ? 'primary' : 'secondary'}
                    onPress={() => toggleCompareSelection(settingId)}
                    disabled={!settingId}
                  /> : null}
                </View>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={
          tab === 'kprofiles' ? null : activeQuery.isLoading ? (
            <LoadingScreen inline message={translateNative('native.a729fe3fdb50f09e')} />
          ) : activeQuery.isError ? (
            <ErrorState
              message={translateNative('native.690b0af931257a24')}
              onRetry={() => void activeQuery.refetch()}
            />
          ) : (
            <EmptyState
              icon="🗂"
              title={translateNative('native.b25ea5fb3353381d')}
              message={translateNative('native.6886a378290db0e7')}
            />
          )
        }
      />

      <PresetEditor visible={editor !== null} profile={editor?.profile ?? null} duplicate={editor?.duplicate} profiles={allProfiles} onClose={() => setEditor(null)} />
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

function ProfilesItemSeparator() {
  useNativeLocale();
  return <View style={{ height: spacing.md }} />;
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
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
