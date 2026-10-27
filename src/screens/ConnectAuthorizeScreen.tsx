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
import { useTranslation } from '@/i18n';

export function connectCallback(url: string, values: Record<string, string>): string {
  const callback = new URL(validateConnectedCallback(url));
  Object.entries(values).forEach(([key, value]) => callback.searchParams.set(key, value));
  return callback.toString();
}

export default function ConnectAuthorizeScreen({ route }: { route: { params?: ConnectAuthorizeParams } }) {
  const { t } = useTranslation();
  const { authEnabled, user } = useAuth();
  const { colors } = useTheme();
  const [message, setMessage] = useState('');
  const [finished, setFinished] = useState(false);
  const params: ConnectAuthorizeParams = route.params ?? { client_id: '', redirect_uri: '', code_challenge: '', code_challenge_method: 'S256' };
  React.useEffect(() => { setFinished(false); setMessage(''); }, [params.client_id, params.redirect_uri, params.code_challenge, params.state]);
  const valid = Boolean(params.client_id && params.redirect_uri && /^[A-Za-z0-9_-]{43}$/.test(params.code_challenge) && params.code_challenge_method === 'S256');
  const info = useQuery({
    queryKey: ['connectConsent', user?.id, params.client_id, params.redirect_uri],
    queryFn: () => authManagementApi.authorizeInfo(params.client_id, params.redirect_uri),
    enabled: valid && authEnabled && Boolean(user), retry: false,
  });
  const approve = useMutation({
    mutationFn: async (request: ConnectAuthorizeParams) => {
      if (!info.data || !valid || finished) throw new Error('No validated authorization request.');
      const response = await authManagementApi.authorize(request);
      setFinished(true);
      await Linking.openURL(connectCallback(response.redirect_uri, { code: response.code, state: request.state ?? '' }));
    },
    onSuccess: () => setMessage('Authorization approved. Return to the connected app.'),
    onError: (e: Error) => setMessage(e.message),
  });
  const deny = async () => {
    if (!info.data || finished) return;
    try {
      await Linking.openURL(connectCallback(params.redirect_uri, { error: 'access_denied', state: params.state ?? '' }));
      setFinished(true);
      setMessage('Authorization denied.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to return to the connected app.'); }
  };
  return <ScrollView contentContainerStyle={styles.content} style={{ backgroundColor: colors.background }}>
    <SectionCard title={t('auth.connectApp', { defaultValue: 'Connect an app' })}>
      {!authEnabled || !user ? <Text style={{ color: colors.error }}>Sign in to an authentication-enabled server before approving this request.</Text> :
        !valid ? <Text style={{ color: colors.error }}>Invalid authorization request. Return to the app and try again.</Text> :
          info.isLoading ? <Text style={{ color: colors.textSecondary }}>Checking app registration…</Text> :
            info.isError ? <>
              <Text accessibilityRole="alert" style={{ color: colors.error }}>Request rejected: {info.error.message}</Text>
              <PrimaryButton label="Retry request validation" onPress={() => void info.refetch()} />
            </> : info.data ? <>
              <Text style={{ color: colors.text }}>{t('auth.authorizeApp', { defaultValue: 'Authorize {{app}}?', app: info.data.app_name })}</Text>
              <Text style={{ color: colors.textSecondary }}>{t('auth.signedInAs', { defaultValue: 'Signed in as {{username}}', username: info.data.username })}</Text>
              <Text style={{ color: colors.textSecondary }}>{t('auth.consentScope', { defaultValue: 'This app receives your identity, email, administrator status, groups, and permissions. It does not receive a BambuBuddy API token or permission to operate printers.' })}</Text>
              <Text selectable style={{ color: colors.textSecondary }}>Registered callback: {params.redirect_uri}</Text>
              {info.data.already_granted ? <Text style={{ color: colors.textSecondary }}>You have previously authorized this app.</Text> : null}
              <PrimaryButton label={t('auth.allowApp', { defaultValue: 'Allow {{app}}', app: info.data.app_name })} disabled={approve.isPending || finished} onPress={() => approve.mutate({ ...params })} />
              <PrimaryButton label={t('auth.deny', { defaultValue: 'Deny' })} variant="secondary" disabled={approve.isPending || finished} onPress={() => void deny()} />
            </> : null}
      {message ? <Text accessibilityRole="alert" style={{ color: colors.text }}>{message}</Text> : null}
    </SectionCard>
  </ScrollView>;
}
const styles = StyleSheet.create({ content: { padding: spacing.lg, gap: spacing.md } });
