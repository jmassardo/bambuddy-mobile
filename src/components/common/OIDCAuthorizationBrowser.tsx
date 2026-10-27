import React from 'react';
import { Modal, View, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { PrimaryButton } from '@/components/common/AppUI';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import { useTranslation } from '@/i18n';

export function oidcBrowserCallback(url: string, serverUrl: string): { token?: string; error?: string } | null {
  try {
    const parsed = new URL(url);
    const server = new URL(serverUrl);
    const base = server.pathname.replace(/\/$/, '');
    if (parsed.origin !== server.origin) return null;
    if (parsed.pathname === `${base}/login`) {
      const fragment = new URLSearchParams(parsed.hash.slice(1));
      const token = fragment.get('oidc_token');
      if (token) return { token };
    }
    if ([`${base}/`, `${base}/login`, base].includes(parsed.pathname)) {
      const error = parsed.searchParams.get('oidc_error');
      if (error) return { error };
    }
    return null;
  } catch { return null; }
}

export function isOidcProviderCallback(url: string, serverUrl: string, expectedState: string): boolean {
  try {
    const parsed = new URL(url);
    const server = new URL(serverUrl);
    return parsed.origin === server.origin &&
      parsed.pathname === `${server.pathname.replace(/\/$/, '')}/api/v1/auth/oidc/callback` &&
      Boolean(expectedState) && parsed.searchParams.get('state') === expectedState &&
      Boolean(parsed.searchParams.get('code') || parsed.searchParams.get('error'));
  } catch { return false; }
}

export function OIDCAuthorizationBrowser({ authorizationUrl, serverUrl, onToken, onError, onCancel }: {
  authorizationUrl: string;
  serverUrl: string;
  onToken: (token: string) => void;
  onError: (message: string) => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const consumed = React.useRef(false);
  const callbackSeen = React.useRef(false);
  const expectedState = new URL(authorizationUrl).searchParams.get('state') ?? '';
  const navigate = (url: string): boolean => {
    if (isOidcProviderCallback(url, serverUrl, expectedState)) callbackSeen.current = true;
    const callback = oidcBrowserCallback(url, serverUrl);
    if (callback) {
      if (!consumed.current) {
        consumed.current = true;
        if (callback.token && callbackSeen.current) onToken(callback.token);
        else if (callback.token) onError('Rejected single sign-on callback without the expected provider state. Please retry.');
        else onError(callback.error?.replace(/_/g, ' ') || 'Single sign-on failed.');
      }
      return false;
    }
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' ||
        (parsed.protocol === 'http:' && parsed.origin === new URL(serverUrl).origin);
    } catch { return url === 'about:blank'; }
  };
  return <Modal visible animationType="slide" onRequestClose={onCancel} presentationStyle="pageSheet">
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={{ color: colors.text }}>{t('auth.secureSSO', { defaultValue: 'Secure single sign-on' })}</Text>
        <PrimaryButton label={t('auth.cancelSSO', { defaultValue: 'Cancel single sign-on' })} variant="secondary" onPress={onCancel} />
      </View>
      <WebView
        source={{ uri: authorizationUrl }}
        originWhitelist={['https://*', 'http://*']}
        onShouldStartLoadWithRequest={request => request.isTopFrame === false ? request.url.startsWith('https://') : navigate(request.url)}
        onNavigationStateChange={state => { navigate(state.url); }}
        onError={() => onError('Unable to load the identity provider. Check the connection or try another sign-in method.')}
        mixedContentMode="never"
        javaScriptEnabled
        javaScriptCanOpenWindowsAutomatically={false}
        setSupportMultipleWindows={false}
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
        incognito
        startInLoadingState
      />
    </View>
  </Modal>;
}
const styles = StyleSheet.create({ container: { flex: 1 }, header: { gap: spacing.sm, padding: spacing.lg } });
