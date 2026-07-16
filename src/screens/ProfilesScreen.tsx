import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { InlineTabBar, PrimaryButton, SectionCard, StatusBadge, TextField } from '@/components/common/AppUI';
import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { formatDateTime, pickArray, pickBoolean, pickString, statusColor, type ApiRecord } from '@/utils/data';

type ProfileTab = 'cloud' | 'orca' | 'local' | 'kprofiles';
type CloudStep = 'login' | 'code' | 'token';

function normalizeProfiles(source: unknown): ApiRecord[] {
  if (Array.isArray(source)) {
    return source.filter((item): item is ApiRecord => typeof item === 'object' && item !== null);
  }
  const records = pickArray(source, ['profiles', 'items', 'results']);
  return records.filter((item): item is ApiRecord => typeof item === 'object' && item !== null);
}

export default function ProfilesScreen() {
  const navigation = useNavigation<any>();
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
  const kprofilesQuery = useQuery({
    queryKey: ['kprofiles'],
    queryFn: () => api.getKProfiles(),
    enabled: tab === 'kprofiles',
  });

  const refreshAll = async () => {
    await Promise.all([
      cloudStatusQuery.refetch(),
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

  if (activeQuery.isLoading && tab !== 'cloud' && tab !== 'orca') {
    return <LoadingScreen message="Loading profiles…" />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <FlatList
        data={profiles}
        keyExtractor={(item, index) => `${tab}-${pickString(item, ['setting_id', 'id', 'name'], String(index))}`}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        refreshControl={
          <RefreshControl
            refreshing={activeQuery.isRefetching || cloudStatusQuery.isRefetching || orcaStatusQuery.isRefetching}
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
                subtitle={pickBoolean(cloudStatusQuery.data, ['is_authenticated'])
                  ? `Signed in as ${pickString(cloudStatusQuery.data, ['email'], 'Unknown user')}`
                  : 'Sign in to sync Bambu Cloud slicer profiles.'}
                right={
                  <StatusBadge
                    label={pickBoolean(cloudStatusQuery.data, ['is_authenticated']) ? 'connected' : 'disconnected'}
                    color={statusColor(pickBoolean(cloudStatusQuery.data, ['is_authenticated']) ? 'success' : 'offline', colors)}
                  />
                }
              >
                {pickBoolean(cloudStatusQuery.data, ['is_authenticated']) ? (
                  <PrimaryButton
                    label={cloudLogoutMutation.isPending ? 'Disconnecting…' : 'Disconnect'}
                    variant="secondary"
                    onPress={() => void cloudLogoutMutation.mutateAsync()}
                  />
                ) : (
                  <View style={styles.loginWrap}>
                    {cloudStep === 'login' ? (
                      <>
                        <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
                        <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry />
                        <TextField label="Region" value={region} onChangeText={setRegion} placeholder="global or china" />
                        <View style={styles.actions}>
                          <PrimaryButton
                            label={cloudLoginMutation.isPending ? 'Signing in…' : 'Sign in'}
                            onPress={() => void cloudLoginMutation.mutateAsync()}
                            disabled={!email.trim() || !password || cloudLoginMutation.isPending}
                            loading={cloudLoginMutation.isPending}
                          />
                          <PrimaryButton label="Use token" variant="secondary" onPress={() => setCloudStep('token')} />
                        </View>
                      </>
                    ) : null}
                    {cloudStep === 'code' ? (
                      <>
                        <Text style={[styles.helper, { color: colors.textSecondary }]}>Enter the {verificationType === 'totp' ? 'TOTP' : 'verification'} code for {email}.</Text>
                        <TextField label="Verification code" value={code} onChangeText={setCode} keyboardType="number-pad" />
                        <View style={styles.actions}>
                          <PrimaryButton label="Back" variant="secondary" onPress={() => setCloudStep('login')} />
                          <PrimaryButton
                            label={cloudVerifyMutation.isPending ? 'Verifying…' : 'Verify'}
                            onPress={() => void cloudVerifyMutation.mutateAsync()}
                            disabled={!code.trim() || cloudVerifyMutation.isPending}
                            loading={cloudVerifyMutation.isPending}
                          />
                        </View>
                      </>
                    ) : null}
                    {cloudStep === 'token' ? (
                      <>
                        <TextField label="Access token" value={token} onChangeText={setToken} multiline autoCapitalize="none" />
                        <TextField label="Region" value={region} onChangeText={setRegion} placeholder="global or china" />
                        <View style={styles.actions}>
                          <PrimaryButton label="Back" variant="secondary" onPress={() => setCloudStep('login')} />
                          <PrimaryButton
                            label={cloudTokenMutation.isPending ? 'Saving…' : 'Save token'}
                            onPress={() => void cloudTokenMutation.mutateAsync()}
                            disabled={!token.trim() || cloudTokenMutation.isPending}
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
                    label={pickBoolean(orcaStatusQuery.data, ['connected']) ? 'connected' : 'disconnected'}
                    color={statusColor(pickBoolean(orcaStatusQuery.data, ['connected']) ? 'success' : 'offline', colors)}
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
                    <TextField label="Email" value={orcaEmail} onChangeText={setOrcaEmail} keyboardType="email-address" autoCapitalize="none" />
                    <TextField label="Password" value={orcaPassword} onChangeText={setOrcaPassword} secureTextEntry />
                    <PrimaryButton
                      label={orcaLoginMutation.isPending ? 'Signing in…' : 'Sign in'}
                      onPress={() => void orcaLoginMutation.mutateAsync()}
                      disabled={!orcaEmail.trim() || !orcaPassword || orcaLoginMutation.isPending}
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
          return (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
              <View style={styles.cardHeader}>
                <View style={styles.cardText}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{pickString(item, ['name', 'profile_name'], 'Unnamed profile')}</Text>
                  <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>{pickString(item, ['type', 'printer_model', 'material'], 'Profile')}</Text>
                </View>
                <StatusBadge label={state} color={statusColor(state, colors)} />
              </View>
              <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>{pickString(item, ['description', 'path', 'setting_id', 'source'], 'No profile details available.')}</Text>
              <Text style={[styles.cardMeta, { color: colors.textTertiary }]}>{formatDateTime(pickString(item, ['updated_time', 'updated_at', 'created_at']))}</Text>
            </View>
          );
        }}
        ListEmptyComponent={
          activeQuery.isLoading ? (
            <LoadingScreen message="Loading profiles…" />
          ) : activeQuery.isError ? (
            <ErrorState message="Unable to load profiles." onRetry={() => void activeQuery.refetch()} />
          ) : (
            <EmptyState icon="🗂" title="No profiles found" message="Switch sources or sign in to view available profiles." />
          )
        }
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
});
