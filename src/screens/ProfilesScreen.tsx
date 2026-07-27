import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigationProp } from '@/navigation/types';
import {
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Chip, InlineTabBar, PrimaryButton, SectionCard, StatusBadge, TextField } from '@/components/common/AppUI';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import type { KProfile, KProfileCreate } from '@/types/api';
import { formatDateTime, pickArray, pickBoolean, pickString, statusColor, type ApiRecord } from '@/utils/data';

type ProfileTab = 'cloud' | 'orca' | 'local' | 'kprofiles';
type CloudStep = 'login' | 'code' | 'token';

type KProfileForm = {
  name: string;
  filamentId: string;
  nozzleId: string;
  nozzleDiameter: string;
  kValue: string;
  nCoef: string;
  slotId: string;
  extruderId: string;
  amsId: string;
  trayId: string;
  settingId: string;
};

const NOZZLE_OPTIONS = ['0.2', '0.4', '0.6', '0.8'] as const;

const EMPTY_KPROFILE_FORM: KProfileForm = {
  name: '',
  filamentId: '',
  nozzleId: '',
  nozzleDiameter: '0.4',
  kValue: '',
  nCoef: '',
  slotId: '',
  extruderId: '',
  amsId: '',
  trayId: '',
  settingId: '',
};

function normalizeProfiles(source: unknown): ApiRecord[] {
  if (Array.isArray(source)) {
    return source.filter(
      (item): item is ApiRecord => typeof item === 'object' && item !== null,
    );
  }
  const records = pickArray(source, ['profiles', 'items', 'results']);
  return records.filter(
    (item): item is ApiRecord => typeof item === 'object' && item !== null,
  );
}

function toOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getProfileFormValues(profile: KProfile): KProfileForm {
  return {
    name: profile.name ?? '',
    filamentId: profile.filament_id ?? '',
    nozzleId: profile.nozzle_id ?? '',
    nozzleDiameter: profile.nozzle_diameter ?? '0.4',
    kValue: profile.k_value ?? '',
    nCoef: profile.n_coef ?? '',
    slotId: String(profile.slot_id ?? ''),
    extruderId: String(profile.extruder_id ?? ''),
    amsId: String(profile.ams_id ?? ''),
    trayId: String(profile.tray_id ?? ''),
    settingId: profile.setting_id ?? '',
  };
}

function buildKProfilePayload(form: KProfileForm): { payload?: KProfileCreate; error?: string } {
  const name = form.name.trim();
  const filamentId = form.filamentId.trim();
  const nozzleId = form.nozzleId.trim();
  const nozzleDiameter = form.nozzleDiameter.trim();
  const kValue = form.kValue.trim();
  const nCoef = form.nCoef.trim();
  const settingId = form.settingId.trim();

  if (!name) return { error: 'Profile name is required.' };
  if (!filamentId) return { error: 'Filament type/ID is required.' };
  if (!nozzleId) return { error: 'Nozzle ID is required.' };
  if (!nozzleDiameter) return { error: 'Nozzle diameter is required.' };
  if (!kValue) return { error: 'K-factor value is required.' };

  const numericK = Number(kValue);
  if (!Number.isFinite(numericK) || numericK < 0) {
    return { error: 'K-factor must be a non-negative number.' };
  }

  if (nCoef) {
    const numericN = Number(nCoef);
    if (!Number.isFinite(numericN) || numericN < 0) {
      return { error: 'N-coefficient must be a non-negative number.' };
    }
  }

  const payload: KProfileCreate = {
    name,
    filament_id: filamentId,
    nozzle_id: nozzleId,
    nozzle_diameter: nozzleDiameter,
    k_value: kValue,
  };

  const nCoefNumber = toOptionalNumber(nCoef);
  const slotIdNumber = toOptionalNumber(form.slotId);
  const extruderIdNumber = toOptionalNumber(form.extruderId);
  const amsIdNumber = toOptionalNumber(form.amsId);
  const trayIdNumber = toOptionalNumber(form.trayId);

  if (nCoefNumber !== undefined) payload.n_coef = String(nCoefNumber);
  if (slotIdNumber !== undefined) payload.slot_id = slotIdNumber;
  if (extruderIdNumber !== undefined) payload.extruder_id = extruderIdNumber;
  if (amsIdNumber !== undefined) payload.ams_id = amsIdNumber;
  if (trayIdNumber !== undefined) payload.tray_id = trayIdNumber;
  if (settingId) payload.setting_id = settingId;

  return { payload };
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
  const [selectedKPrinterId, setSelectedKPrinterId] = useState<number | null>(null);
  const [selectedNozzleDiameter, setSelectedNozzleDiameter] = useState<string>('0.4');
  const [kProfileModalVisible, setKProfileModalVisible] = useState(false);
  const [kProfileModalError, setKProfileModalError] = useState('');
  const [kProfileForm, setKProfileForm] = useState<KProfileForm>(EMPTY_KPROFILE_FORM);
  const [editingKProfile, setEditingKProfile] = useState<KProfile | null>(null);
  const [pendingDeleteKProfile, setPendingDeleteKProfile] = useState<KProfile | null>(null);

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
  const localQuery = useQuery({
    queryKey: ['localProfiles'],
    queryFn: () => api.getLocalPresets(),
    enabled: tab === 'local',
  });
  const printersQuery = useQuery({
    queryKey: ['printers'],
    queryFn: () => api.getPrinters(),
    enabled: tab === 'kprofiles',
  });

  const printers = useMemo(
    () =>
      (printersQuery.data ?? []).filter(
        printer =>
          typeof printer.id === 'number' && typeof printer.name === 'string',
      ),
    [printersQuery.data],
  );

  React.useEffect(() => {
    if (printers.length === 0) {
      if (selectedKPrinterId !== null) setSelectedKPrinterId(null);
      return;
    }

    if (
      selectedKPrinterId === null
      || !printers.some(printer => printer.id === selectedKPrinterId)
    ) {
      setSelectedKPrinterId(printers[0].id);
    }
  }, [printers, selectedKPrinterId]);

  const kprofilesQuery = useQuery({
    queryKey: ['kprofiles', selectedKPrinterId, selectedNozzleDiameter],
    queryFn: () => api.getKProfiles(selectedKPrinterId ?? undefined, selectedNozzleDiameter),
    enabled: tab === 'kprofiles' && selectedKPrinterId !== null,
  });

  const invalidateKProfiles = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['kprofiles'] });
  }, [queryClient]);

  const refreshAll = async () => {
    await Promise.all([
      cloudStatusQuery.refetch(),
      orcaStatusQuery.refetch(),
      cloudProfilesQuery.refetch(),
      orcaProfilesQuery.refetch(),
      localQuery.refetch(),
      printersQuery.refetch(),
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
    onError: (error: Error) =>
      showToast(error.message || 'Unable to log in.', 'error'),
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
    onError: (error: Error) =>
      showToast(error.message || 'Verification failed.', 'error'),
  });

  const cloudTokenMutation = useMutation({
    mutationFn: () => api.cloudSetToken(token.trim(), region),
    onSuccess: () => {
      showToast('Cloud access token saved.', 'success');
      setCloudStep('login');
      setToken('');
      void refreshAll();
    },
    onError: (error: Error) =>
      showToast(error.message || 'Unable to save token.', 'error'),
  });

  const cloudLogoutMutation = useMutation({
    mutationFn: () => api.cloudLogout(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cloudStatus'] });
      await queryClient.invalidateQueries({ queryKey: ['cloudProfiles'] });
      showToast('Bambu Cloud disconnected.', 'success');
    },
  });

  const orcaLoginMutation = useMutation({
    mutationFn: () => api.orcaCloudPasswordLogin(orcaEmail.trim(), orcaPassword),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orcaCloudStatus'] });
      await queryClient.invalidateQueries({ queryKey: ['orcaCloudProfiles'] });
      showToast('Orca Cloud connected.', 'success');
    },
    onError: (error: Error) =>
      showToast(error.message || 'Unable to connect Orca Cloud.', 'error'),
  });

  const orcaLogoutMutation = useMutation({
    mutationFn: () => api.orcaCloudLogout(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orcaCloudStatus'] });
      await queryClient.invalidateQueries({ queryKey: ['orcaCloudProfiles'] });
      showToast('Orca Cloud disconnected.', 'success');
    },
  });

  const createKProfileMutation = useMutation({
    mutationFn: (payload: KProfileCreate) => api.createKProfile(payload),
    onSuccess: async () => {
      await invalidateKProfiles();
      setKProfileModalVisible(false);
      setEditingKProfile(null);
      setKProfileModalError('');
      setKProfileForm({
        ...EMPTY_KPROFILE_FORM,
        nozzleDiameter: selectedNozzleDiameter,
      });
      showToast('K-profile created.', 'success');
    },
    onError: (error: Error) =>
      showToast(error.message || 'Unable to create K-profile.', 'error'),
  });

  const updateKProfileMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: KProfileCreate }) =>
      api.updateKProfile(id, payload),
    onSuccess: async () => {
      await invalidateKProfiles();
      setKProfileModalVisible(false);
      setEditingKProfile(null);
      setKProfileModalError('');
      showToast('K-profile updated.', 'success');
    },
    onError: (error: Error) =>
      showToast(error.message || 'Unable to update K-profile.', 'error'),
  });

  const deleteKProfileMutation = useMutation({
    mutationFn: (id: number) => api.deleteKProfile(id),
    onSuccess: async () => {
      await invalidateKProfiles();
      setPendingDeleteKProfile(null);
      showToast('K-profile deleted.', 'success');
    },
    onError: (error: Error) =>
      showToast(error.message || 'Unable to delete K-profile.', 'error'),
  });

  const activeQuery =
    tab === 'cloud'
      ? cloudProfilesQuery
      : tab === 'orca'
      ? orcaProfilesQuery
      : tab === 'local'
      ? localQuery
      : kprofilesQuery;

  const genericProfiles = useMemo(
    () => normalizeProfiles(activeQuery.data),
    [activeQuery.data],
  );
  const kProfiles = useMemo(() => kprofilesQuery.data?.profiles ?? [], [kprofilesQuery.data]);
  const selectedPrinterName =
    printers.find(printer => printer.id === selectedKPrinterId)?.name ?? 'printer';

  const openCreateKProfileModal = React.useCallback(() => {
    setEditingKProfile(null);
    setKProfileModalError('');
    setKProfileForm({
      ...EMPTY_KPROFILE_FORM,
      nozzleDiameter: selectedNozzleDiameter,
      extruderId: '0',
      amsId: '255',
      trayId: '254',
    });
    setKProfileModalVisible(true);
  }, [selectedNozzleDiameter]);

  const openEditKProfileModal = React.useCallback((profile: KProfile) => {
    setEditingKProfile(profile);
    setKProfileModalError('');
    setKProfileForm(getProfileFormValues(profile));
    setKProfileModalVisible(true);
  }, []);

  const saveKProfile = React.useCallback(() => {
    const { payload, error } = buildKProfilePayload(kProfileForm);
    if (error || !payload) {
      setKProfileModalError(error ?? 'Unable to save K-profile.');
      return;
    }

    if (editingKProfile) {
      const id = Number(editingKProfile.slot_id);
      if (!Number.isFinite(id)) {
        setKProfileModalError('Selected profile has an invalid slot ID.');
        return;
      }
      void updateKProfileMutation.mutateAsync({ id, payload });
      return;
    }

    void createKProfileMutation.mutateAsync(payload);
  }, [createKProfileMutation, editingKProfile, kProfileForm, updateKProfileMutation]);

  const renderKProfileCard = React.useCallback(
    (profile: KProfile) => {
      const profileName = profile.name || 'Unnamed profile';
      const filament = profile.filament_id || 'Unknown filament';
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
                {profileName}
              </Text>
              <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                Filament: {filament}
              </Text>
            </View>
            <StatusBadge label={`K ${profile.k_value || '—'}`} color={colors.accent} />
          </View>
          <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
            Nozzle {profile.nozzle_diameter || '—'} ({profile.nozzle_id || 'unknown'})
          </Text>
          <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
            N-coef {profile.n_coef || '—'} • Extruder {profile.extruder_id}
          </Text>
          <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
            Slot {profile.slot_id} • AMS {profile.ams_id} • Tray {profile.tray_id}
          </Text>
          <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
            Setting ID: {profile.setting_id || '—'}
          </Text>
          <View style={styles.actions}>
            <PrimaryButton
              label="Edit"
              variant="secondary"
              onPress={() => openEditKProfileModal(profile)}
            />
            <PrimaryButton
              label="Delete"
              variant="danger"
              onPress={() => setPendingDeleteKProfile(profile)}
            />
          </View>
        </View>
      );
    },
    [colors, openEditKProfileModal],
  );

  if (
    activeQuery.isLoading
    && tab !== 'cloud'
    && tab !== 'orca'
    && tab !== 'kprofiles'
  ) {
    return <LoadingScreen message="Loading profiles…" />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList<unknown>
        data={tab === 'kprofiles' ? kProfiles : genericProfiles}
        keyExtractor={(item, index) =>
          tab === 'kprofiles'
            ? `kprofile-${(item as KProfile).slot_id}-${(item as KProfile).setting_id || index}`
            : `${tab}-${pickString(item, ['setting_id', 'id', 'name'], String(index))}`
        }
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        refreshControl={
          <RefreshControl
            refreshing={
              activeQuery.isRefetching
              || cloudStatusQuery.isRefetching
              || orcaStatusQuery.isRefetching
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
                subtitle={
                  pickBoolean(cloudStatusQuery.data, ['is_authenticated'])
                    ? `Signed in as ${pickString(cloudStatusQuery.data, ['email'], 'Unknown user')}`
                    : 'Sign in to sync Bambu Cloud slicer profiles.'
                }
                right={
                  <StatusBadge
                    label={
                      pickBoolean(cloudStatusQuery.data, ['is_authenticated'])
                        ? 'connected'
                        : 'disconnected'
                    }
                    color={statusColor(
                      pickBoolean(cloudStatusQuery.data, ['is_authenticated'])
                        ? 'success'
                        : 'offline',
                      colors,
                    )}
                  />
                }
              >
                {pickBoolean(cloudStatusQuery.data, ['is_authenticated']) ? (
                  <PrimaryButton
                    label={
                      cloudLogoutMutation.isPending
                        ? 'Disconnecting…'
                        : 'Disconnect'
                    }
                    variant="secondary"
                    onPress={() => void cloudLogoutMutation.mutateAsync()}
                  />
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
                              cloudLoginMutation.isPending
                                ? 'Signing in…'
                                : 'Sign in'
                            }
                            onPress={() => void cloudLoginMutation.mutateAsync()}
                            disabled={
                              !email.trim()
                              || !password
                              || cloudLoginMutation.isPending
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
                        <Text
                          style={[styles.helper, { color: colors.textSecondary }]}
                        >
                          Enter the {verificationType === 'totp' ? 'TOTP' : 'verification'} code
                          {' '}for {email}.
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
                              cloudVerifyMutation.isPending
                                ? 'Verifying…'
                                : 'Verify'
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
                subtitle={
                  pickBoolean(orcaStatusQuery.data, ['connected'])
                    ? `Signed in as ${pickString(orcaStatusQuery.data, ['email'], 'Unknown user')}`
                    : 'Sign in to sync Orca Cloud slicer profiles.'
                }
                right={
                  <StatusBadge
                    label={pickBoolean(orcaStatusQuery.data, ['connected']) ? 'connected' : 'disconnected'}
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
                    label={
                      orcaLogoutMutation.isPending ? 'Disconnecting…' : 'Disconnect'
                    }
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
                        !orcaEmail.trim()
                        || !orcaPassword
                        || orcaLoginMutation.isPending
                      }
                      loading={orcaLoginMutation.isPending}
                    />
                  </View>
                )}
              </SectionCard>
            ) : null}

            {tab === 'kprofiles' ? (
              <SectionCard
                title="K-profile management"
                subtitle={
                  selectedKPrinterId === null
                    ? 'Select a printer to manage pressure advance profiles.'
                    : `Managing profiles for ${selectedPrinterName}.`
                }
              >
                {printersQuery.isLoading ? (
                  <Text style={[styles.helper, { color: colors.textSecondary }]}>
                    Loading printers…
                  </Text>
                ) : printers.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterRow}
                  >
                    {printers.map(printer => (
                      <Chip
                        key={printer.id}
                        label={printer.name}
                        selected={selectedKPrinterId === printer.id}
                        onPress={() => setSelectedKPrinterId(printer.id)}
                      />
                    ))}
                  </ScrollView>
                ) : (
                  <Text style={[styles.helper, { color: colors.textSecondary }]}>
                    No printers are configured yet.
                  </Text>
                )}

                <View style={styles.nozzleWrap}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                    Nozzle size
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterRow}
                  >
                    {NOZZLE_OPTIONS.map(nozzle => (
                      <Chip
                        key={nozzle}
                        label={`${nozzle} mm`}
                        selected={selectedNozzleDiameter === nozzle}
                        onPress={() => setSelectedNozzleDiameter(nozzle)}
                      />
                    ))}
                  </ScrollView>
                </View>

                <PrimaryButton
                  label="Create K-profile"
                  onPress={openCreateKProfileModal}
                  disabled={selectedKPrinterId === null}
                />
              </SectionCard>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          if (tab === 'kprofiles') {
            return renderKProfileCard(item as KProfile);
          }

          const record = item as unknown as ApiRecord;
          const state = pickString(record, ['status', 'source', 'type'], tab);
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
                    {pickString(record, ['name', 'profile_name'], 'Unnamed profile')}
                  </Text>
                  <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                    {pickString(record, ['type', 'printer_model', 'material'], 'Profile')}
                  </Text>
                </View>
                <StatusBadge label={state} color={statusColor(state, colors)} />
              </View>
              <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                {pickString(
                  record,
                  ['description', 'path', 'setting_id', 'source'],
                  'No profile details available.',
                )}
              </Text>
              <Text style={[styles.cardMeta, { color: colors.textTertiary }]}>
                {formatDateTime(
                  pickString(record, ['updated_time', 'updated_at', 'created_at']),
                )}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={
          tab === 'kprofiles' ? (
            selectedKPrinterId === null ? (
              <EmptyState
                icon="🖨️"
                title="No printer selected"
                message="Add or select a printer to view K-profiles."
              />
            ) : kprofilesQuery.isLoading ? (
              <LoadingScreen message="Loading K-profiles…" />
            ) : kprofilesQuery.isError ? (
              <ErrorState
                message="Unable to load K-profiles."
                onRetry={() => void kprofilesQuery.refetch()}
              />
            ) : (
              <EmptyState
                icon="⚙️"
                title="No K-profiles found"
                message={`No pressure advance profiles were found for ${selectedPrinterName} (${selectedNozzleDiameter} mm nozzle).`}
              />
            )
          ) : activeQuery.isLoading ? (
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

      <Modal
        visible={kProfileModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setKProfileModalVisible(false);
          setKProfileModalError('');
        }}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.modalBg, borderColor: colors.border },
            ]}
          >
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {editingKProfile ? 'Edit K-profile' : 'Create K-profile'}
              </Text>
              <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                Pressure advance profile for {selectedPrinterName} ({selectedNozzleDiameter} mm).
              </Text>
              <TextField
                label="Profile name"
                value={kProfileForm.name}
                onChangeText={value => setKProfileForm(current => ({ ...current, name: value }))}
              />
              <TextField
                label="Filament type / ID"
                value={kProfileForm.filamentId}
                onChangeText={value =>
                  setKProfileForm(current => ({ ...current, filamentId: value }))
                }
              />
              <View style={styles.splitRow}>
                <View style={styles.splitField}>
                  <TextField
                    label="Nozzle ID"
                    value={kProfileForm.nozzleId}
                    onChangeText={value =>
                      setKProfileForm(current => ({ ...current, nozzleId: value }))
                    }
                    placeholder="HH00-0.4"
                  />
                </View>
                <View style={styles.splitField}>
                  <TextField
                    label="Nozzle diameter"
                    value={kProfileForm.nozzleDiameter}
                    onChangeText={value =>
                      setKProfileForm(current => ({ ...current, nozzleDiameter: value }))
                    }
                    placeholder="0.4"
                  />
                </View>
              </View>
              <View style={styles.splitRow}>
                <View style={styles.splitField}>
                  <TextField
                    label="K-factor"
                    value={kProfileForm.kValue}
                    onChangeText={value =>
                      setKProfileForm(current => ({ ...current, kValue: value }))
                    }
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.splitField}>
                  <TextField
                    label="N-coefficient"
                    value={kProfileForm.nCoef}
                    onChangeText={value =>
                      setKProfileForm(current => ({ ...current, nCoef: value }))
                    }
                    keyboardType="decimal-pad"
                    placeholder="Optional"
                  />
                </View>
              </View>
              <View style={styles.splitRow}>
                <View style={styles.splitField}>
                  <TextField
                    label="Extruder ID"
                    value={kProfileForm.extruderId}
                    onChangeText={value =>
                      setKProfileForm(current => ({ ...current, extruderId: value }))
                    }
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.splitField}>
                  <TextField
                    label="Slot ID"
                    value={kProfileForm.slotId}
                    onChangeText={value =>
                      setKProfileForm(current => ({ ...current, slotId: value }))
                    }
                    keyboardType="number-pad"
                  />
                </View>
              </View>
              <View style={styles.splitRow}>
                <View style={styles.splitField}>
                  <TextField
                    label="AMS ID"
                    value={kProfileForm.amsId}
                    onChangeText={value =>
                      setKProfileForm(current => ({ ...current, amsId: value }))
                    }
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.splitField}>
                  <TextField
                    label="Tray ID"
                    value={kProfileForm.trayId}
                    onChangeText={value =>
                      setKProfileForm(current => ({ ...current, trayId: value }))
                    }
                    keyboardType="number-pad"
                  />
                </View>
              </View>
              <TextField
                label="Setting ID"
                value={kProfileForm.settingId}
                onChangeText={value =>
                  setKProfileForm(current => ({ ...current, settingId: value }))
                }
                placeholder="Optional"
              />
              {kProfileModalError ? (
                <Text style={[styles.errorText, { color: colors.error }]}>
                  {kProfileModalError}
                </Text>
              ) : null}
              <View style={styles.actions}>
                <PrimaryButton
                  label="Cancel"
                  variant="secondary"
                  onPress={() => {
                    setKProfileModalVisible(false);
                    setKProfileModalError('');
                  }}
                />
                <PrimaryButton
                  label={
                    createKProfileMutation.isPending || updateKProfileMutation.isPending
                      ? 'Saving…'
                      : 'Save'
                  }
                  onPress={saveKProfile}
                  disabled={
                    createKProfileMutation.isPending || updateKProfileMutation.isPending
                  }
                  loading={
                    createKProfileMutation.isPending || updateKProfileMutation.isPending
                  }
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={pendingDeleteKProfile !== null}
        onClose={() => setPendingDeleteKProfile(null)}
        onConfirm={() => {
          if (!pendingDeleteKProfile) return;
          const id = Number(pendingDeleteKProfile.slot_id);
          if (!Number.isFinite(id)) {
            showToast('Invalid profile slot ID.', 'error');
            return;
          }
          void deleteKProfileMutation.mutateAsync(id);
        }}
        title="Delete K-profile"
        message={
          pendingDeleteKProfile
            ? `Delete pressure advance profile "${pendingDeleteKProfile.name || 'Unnamed profile'}"?`
            : 'Delete this pressure advance profile?'
        }
        confirmLabel="Delete"
        loading={deleteKProfileMutation.isPending}
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
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
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
  filterRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  nozzleWrap: {
    gap: spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    borderWidth: 1,
    maxHeight: '92%',
  },
  modalContent: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing['2xl'],
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  modalSubtitle: {
    fontSize: fontSize.sm,
  },
  splitRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  splitField: {
    flex: 1,
  },
  errorText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
});
