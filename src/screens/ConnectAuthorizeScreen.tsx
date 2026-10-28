import { NativeTranslation, nativeMessage, translateNative, useNativeLocale, useNativeMessageState, useTranslation } from '@/i18n';

import React, { useState } from 'react';
import { Linking, ScrollView, Text, StyleSheet } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { authManagementApi } from '@/api/authManagement';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/theme';
import { PrimaryButton, SectionCard } from '@/components/common/AppUI';
import type { ConnectAuthorizeParams } from '@/types/api';
import { spacing } from '@/theme/tokens';
import { validateConnectedCallback } from '@/components/settings/ConnectedAppsManager';

export function connectCallback(url: string, values: Record<string, string>): string {
  const callback = new URL(validateConnectedCallback(url));
  Object.entries(values).forEach(([key, value]) => callback.searchParams.set(key, value));
  return callback.toString();
}

export default function ConnectAuthorizeScreen({ route }: { route: { params?: ConnectAuthorizeParams } }) {
  useNativeLocale();
  const { t } = useTranslation();
  const { authEnabled, user } = useAuth();
  const { colors } = useTheme();
  const [message, setMessage] = useNativeMessageState('');
  const [finished, setFinished] = useState(false);
  const params: ConnectAuthorizeParams = route.params ?? { client_id: '', redirect_uri: '', code_challenge: '', code_challenge_method: 'S256' };
  React.useEffect(() => { setFinished(false); setMessage(''); }, [params.client_id, params.redirect_uri, params.code_challenge, params.state, setMessage]);
  const valid = Boolean(params.client_id && params.redirect_uri && /^[A-Za-z0-9_-]{43}$/.test(params.code_challenge) && params.code_challenge_method === 'S256');
  const info = useQuery({
    queryKey: ['connectConsent', user?.id, params.client_id, params.redirect_uri],
    queryFn: () => authManagementApi.authorizeInfo(params.client_id, params.redirect_uri),
    enabled: valid && authEnabled && Boolean(user), retry: false,
  });
  const approve = useMutation({
    mutationFn: async (request: ConnectAuthorizeParams) => {
      if (!info.data || !valid || finished) throw new Error(translateNative('native.2572e923838fec8a'));
      const response = await authManagementApi.authorize(request);
      setFinished(true);
      await Linking.openURL(connectCallback(response.redirect_uri, { code: response.code, state: request.state ?? '' }));
    },
    onSuccess: () => setMessage(nativeMessage('native.5c8213a4e1e64a98')),
    onError: (e: Error) => setMessage(e.message),
  });
  const deny = async () => {
    if (!info.data || finished) return;
    try {
      await Linking.openURL(connectCallback(params.redirect_uri, { get error() { return translateNative('native.e28199da54ac630b'); }, state: params.state ?? '' }));
      setFinished(true);
      setMessage(nativeMessage('native.078cc26bb9ceab9a'));
    } catch (e) { setMessage(e instanceof Error ? e.message : nativeMessage('native.8e9397d78acabe85')); }
  };
  return <ScrollView contentContainerStyle={styles.content} style={{ backgroundColor: colors.background }}>
    <SectionCard title={t('auth.connectApp', { defaultValue: 'Connect an app' })}>
      {!authEnabled || !user ? <Text style={{ color: colors.error }}>{translateNative('native.0651297537e5c4a9')}</Text> :
        !valid ? <Text style={{ color: colors.error }}>{translateNative('native.a95eb33209b5e671')}</Text> :
          info.isLoading ? <Text style={{ color: colors.textSecondary }}>{translateNative('native.070e181c6c221496')}</Text> :
            info.isError ? <>
              <Text accessibilityRole="alert" style={{ color: colors.error }}><NativeTranslation id="native.df1d17d877ac4c24" values={{ value0: (info.error.message) }} /></Text>
              <PrimaryButton label={translateNative('native.8dcfe6dd4701f242')} onPress={() => void info.refetch()} />
            </> : info.data ? <>
              <Text style={{ color: colors.text }}>{t('auth.authorizeApp', { defaultValue: 'Authorize {{app}}?', app: info.data.app_name })}</Text>
              <Text style={{ color: colors.textSecondary }}>{t('auth.signedInAs', { defaultValue: 'Signed in as {{username}}', username: info.data.username })}</Text>
              <Text style={{ color: colors.textSecondary }}>{t('auth.consentScope', { defaultValue: 'This app receives your identity, email, administrator status, groups, and permissions. It does not receive a BambuBuddy API token or permission to operate printers.' })}</Text>
              <Text selectable style={{ color: colors.textSecondary }}><NativeTranslation id="native.dc5f0860220454d5" values={{ value0: (params.redirect_uri) }} /></Text>
              {info.data.already_granted ? <Text style={{ color: colors.textSecondary }}>{translateNative('native.76d138aa665e59cf')}</Text> : null}
              <PrimaryButton label={t('auth.allowApp', { defaultValue: 'Allow {{app}}', app: info.data.app_name })} disabled={approve.isPending || finished} onPress={() => approve.mutate({ ...params })} />
              <PrimaryButton label={t('auth.deny', { defaultValue: 'Deny' })} variant="secondary" disabled={approve.isPending || finished} onPress={() => void deny()} />
            </> : null}
      {message ? <Text accessibilityRole="alert" style={{ color: colors.text }}>{message}</Text> : null}
    </SectionCard>
  </ScrollView>;
}
const styles = StyleSheet.create({ content: { padding: spacing.lg, gap: spacing.md } });
