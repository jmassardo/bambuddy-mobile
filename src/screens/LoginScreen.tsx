import { nativeMessage, translateNative, useLocalizedMemo, useNativeLocale, useNativeMessageState, useTranslation } from '@/i18n';


import React, { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigationProp } from '@/navigation/types';
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useAuth, type UserResponse } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { PrimaryButton, TextField } from '@/components/common/AppUI';
import ServerSetupScreen from './ServerSetupScreen';
import { useServerStore } from '@/api/server';
import type { LoginResponse } from '@/types/api';
import { authApi } from '@/api/auth';
import { SwitchRow } from '@/components/settings/shared';
import { createOidcState, oidcCallbackBase } from '@/utils/authSecurity';
import { OIDCAuthorizationBrowser } from '@/components/common/OIDCAuthorizationBrowser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function parseOidcCallback(url: string) {
  try {
    const parsedUrl = new URL(url);
    const params = parsedUrl.searchParams;
    const isAppScheme =
      parsedUrl.protocol === 'bambuddy:' ||
      parsedUrl.protocol === 'bambuddy-mobile:';
    const serverUrl = useServerStore.getState().serverUrl;
    let isServerOrigin = false;

    if (serverUrl) {
      try {
        isServerOrigin = parsedUrl.origin === new URL(serverUrl).origin;
      } catch {
        isServerOrigin = false;
      }
    }

    if (!isAppScheme && !isServerOrigin) {
      return {
        token: null,
        get error() { return translateNative('native.e36b24108481f24d'); },
        state: params.get('state'),
      };
    }

    return {
      token: params.get('oidc_token'),
      error: params.get('oidc_error'),
      state: params.get('state'),
    };
  } catch {
    return {
      token: null,
      get error() { return translateNative('native.89c9ea76be501ae1'); },
      state: null,
    };
  }
}

export default function LoginScreen() {
  const titleLocale = useNativeLocale();
  const { t } = useTranslation();
  const navigation = useNavigation<RootNavigationProp<'Login'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: translateNative('native.62a155bdfe8d655f'), headerShown: false });
  }, [navigation, titleLocale]);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { login, loginWithToken, loading } = useAuth();
  const { showToast } = useToast();
  const serverUrl = useServerStore(state => state.serverUrl);
  const [serverReady, setServerReady] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [preAuthToken, setPreAuthToken] = useState<string | null>(null);
  const [availableMethods, setAvailableMethods] = useState<string[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);
  const [emailDelivered, setEmailDelivered] = useState(false);
  const autoStarted = React.useRef(false);
  const [authorizationUrl, setAuthorizationUrl] = useState<string | null>(null);
  const [callbackServer, setCallbackServer] = useState<string | null>(null);

  const serverHostname = useLocalizedMemo(() => {
    if (!serverUrl) return undefined;
    try {
      return new URL(serverUrl).hostname;
    } catch {
      return undefined;
    }
  }, [serverUrl]);
  const [error, setError] = useNativeMessageState('');
  const [step, setStep] = useState<'credentials' | '2fa' | 'forgot' | 'reset'>('credentials');
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const pendingOidcState = React.useRef<string | null>(null);

  useEffect(() => {
    autoStarted.current = false;
    pendingOidcState.current = null;
    setAuthorizationUrl(null);
    setCallbackServer(null);
    setPreAuthToken(null);
    setAvailableMethods([]);
    setSelectedMethod(null);
    setCode('');
    setEmailDelivered(false);
    setStep('credentials');
    setError('');
  }, [serverUrl, setError]);

  const oidcProvidersQuery = useQuery({
    queryKey: ['oidcProviders', serverUrl],
    queryFn: () => api.getOIDCProviders(),
    enabled: Boolean(serverUrl) && !loading,
  });
  const policyQuery = useQuery({
    queryKey: ['advancedAuthStatus', serverUrl],
    queryFn: authApi.getAdvancedAuthStatus,
    enabled: Boolean(serverUrl) && !loading,
  });
  const ldapStatusQuery = useQuery({
    queryKey: ['ldapStatus', serverUrl],
    queryFn: authApi.getLDAPStatus,
    enabled: Boolean(serverUrl) && !loading,
  });
  const localLoginEnabled = policyQuery.data?.local_login_enabled === true;
  const ldapLoginEnabled = ldapStatusQuery.data?.ldap_enabled === true;
  const credentialsEnabled = localLoginEnabled || ldapLoginEnabled;
  const credentialsPolicyPending = Boolean(serverUrl) && !credentialsEnabled && (policyQuery.isPending || ldapStatusQuery.isPending);
  const emailMutation = useMutation({
    mutationFn: async () => {
      if (!preAuthToken) throw new Error(translateNative('native.974f3faf99939c0e'));
      return authApi.sendEmailOTP(preAuthToken);
    },
    onSuccess: response => { if (response.pre_auth_token) setPreAuthToken(response.pre_auth_token); setEmailDelivered(true); setError(''); showToast(nativeMessage('native.a95023ecfddfa1a7'), 'success'); },
    onError: (e: Error) => setError(e.message),
  });

  const finalizeLogin = async (response: LoginResponse) => {
    const loginResponse = response as LoginResponse & {
      available_methods?: string[];
      two_fa_methods?: string[];
    };

    if (loginResponse.requires_2fa && loginResponse.pre_auth_token) {
      const methods = loginResponse.available_methods ?? loginResponse.two_fa_methods ?? [];
      setPreAuthToken(loginResponse.pre_auth_token);
      setAvailableMethods(methods);
      setSelectedMethod(methods.includes('totp') ? 'totp' : methods[0] ?? null);
      setStep('2fa');
      setCode('');
      setEmailDelivered(false);
      showToast(nativeMessage('native.870eebb01f7654c7'), 'info');
      return;
    }

    if (loginResponse.access_token && loginResponse.user) {
      await loginWithToken(loginResponse.access_token, loginResponse.user as unknown as UserResponse, remember);
      showToast(nativeMessage('native.644f5f4a64728210'), 'success');
      return;
    }

    throw new Error(translateNative('native.a773f83633c5b27d'));
  };

  const oidcExchangeMutation = useMutation({
    mutationFn: (oidcToken: string) => api.exchangeOIDCToken(oidcToken),
    onSuccess: async response => {
      await finalizeLogin(response);
    },
    onError: (exchangeError: Error) => {
      setError(exchangeError.message || nativeMessage('native.597e1bc3968499f1'));
      showToast(exchangeError.message || nativeMessage('native.597e1bc3968499f1'), 'error');
    },
  });

  const oidcExchangeRef = React.useRef(oidcExchangeMutation.mutateAsync);
  oidcExchangeRef.current = oidcExchangeMutation.mutateAsync;

  useEffect(() => {
    const handleUrl = async ({ url }: { url: string }) => {
      const { token, error: oidcError, state } = parseOidcCallback(url);
      if (!token && !oidcError) {
        return;
      }

      const expectedState = pendingOidcState.current;
      if (!expectedState || !state || state !== expectedState) {
        setAuthorizationUrl(null);
        pendingOidcState.current = null;
        setAuthorizationUrl(null);
        console.warn('Rejected OIDC callback with missing or mismatched state.');
        setError(nativeMessage('native.f4e1f0f1250143f7'));
        showToast(nativeMessage('native.597e1bc3968499f1'), 'error');
        return;
      }

      pendingOidcState.current = null;
      if (oidcError) {
        setError(nativeMessage('native.86eb9787f80f365c', () => ({ value0: String(oidcError.replace(/_/g, ' ')) })));
        showToast(nativeMessage('native.597e1bc3968499f1'), 'error');
        return;
      }
      if (token) {
        setError('');
        await oidcExchangeRef.current(token).catch(() => {});
      }
    };

    const subscription = Linking.addEventListener('url', handleUrl);
    void (async () => {
      const url = await Linking.getInitialURL();
      if (url) {
        await handleUrl({ url });
      }
    })();
    return () => subscription.remove();
  }, [showToast, setError]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      setError('');
      if (preAuthToken) {
        const response = await api.verify2FA({
          pre_auth_token: preAuthToken,
          code,
          method: selectedMethod ?? undefined,
        });
        await loginWithToken(response.access_token, response.user as unknown as UserResponse, remember);
        return response;
      }
      return login(username.trim(), password, remember);
    },
    onSuccess: result => {
      if ('requires_2fa' in result && result.requires_2fa) {
        const methods = result.available_methods ?? [];
        setPreAuthToken(result.pre_auth_token ?? null);
        setAvailableMethods(methods);
        setSelectedMethod(methods.includes('totp') ? 'totp' : methods[0] ?? null);
        setCode('');
        setEmailDelivered(false);
        setStep('2fa');
        showToast(nativeMessage('native.870eebb01f7654c7'), 'info');
        return;
      }
      showToast(nativeMessage('native.644f5f4a64728210'), 'success');
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message || nativeMessage('native.833aba5d6ce7de4d'));
    },
  });

  const forgotMutation = useMutation({
    mutationFn: async () => {
      setError('');
      await api.forgotPassword({ email: forgotEmail.trim() });
    },
    onSuccess: () => {
      showToast(nativeMessage('native.1ad99375097ad21d'), 'success');
      setStep('reset');
    },
    onError: (e: Error) => {
      setError(e.message || nativeMessage('native.b471f98264033a7c'));
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      setError('');
      if (newPassword !== confirmPassword) {
        throw new Error(translateNative('native.4bf243cf9137809e'));
      }
      await api.forgotPasswordConfirm(resetToken.trim(), newPassword);
    },
    onSuccess: () => {
      showToast(nativeMessage('native.29cb7a0bcd54895b'), 'success');
      setStep('credentials');
      setResetToken('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (e: Error) => {
      setError(e.message || nativeMessage('native.f55811d824e4d957'));
    },
  });

  const oidcStartMutation = useMutation({
    mutationFn: async (providerId: number) => {
      const state = createOidcState();
      pendingOidcState.current = state;
      const response = await api.getOIDCAuthorizeUrl(providerId, state);
      if (!serverUrl) throw new Error(translateNative('native.519f204cd211c4cb'));
      return { ...response, callbackServer: oidcCallbackBase(response.auth_url, serverUrl) };
    },
    onSuccess: async data => {
      setError('');
      setCallbackServer(data.callbackServer);
      setAuthorizationUrl(data.auth_url);
    },
    onError: (mutationError: Error) => {
      pendingOidcState.current = null;
      setError(mutationError.message || nativeMessage('native.99c00110ba289e73'));
      showToast(mutationError.message || nativeMessage('native.99c00110ba289e73'), 'error');
    },
  });

  const startOidc = oidcStartMutation.mutate;
  useEffect(() => {
    const id = policyQuery.data?.autologin_provider_id;
    if (serverReady && !loading && id && step === 'credentials' && !autoStarted.current &&
        oidcProvidersQuery.data?.some(p => p.id === id)) {
      autoStarted.current = true;
      startOidc(id);
    }
  }, [serverReady, loading, policyQuery.data, oidcProvidersQuery.data, startOidc, step]);

  const oidcProviders = oidcProvidersQuery.data ?? [];
  const oidcBusy = oidcStartMutation.isPending || oidcExchangeMutation.isPending;
  const selectVerificationMethod = (method: string) => {
    setSelectedMethod(method);
    setCode('');
    setError('');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      {authorizationUrl && callbackServer ? <OIDCAuthorizationBrowser
        authorizationUrl={authorizationUrl}
        serverUrl={callbackServer}
        onToken={token => {
          setAuthorizationUrl(null);
          pendingOidcState.current = null;
          oidcExchangeMutation.mutate(token);
        }}
        onError={message => { setAuthorizationUrl(null); pendingOidcState.current = null; setError(message); }}
        onCancel={() => { setAuthorizationUrl(null); pendingOidcState.current = null; setError(nativeMessage('native.4a766b4e99a17bfb')); }}
      /> : null}
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]} keyboardShouldPersistTaps="handled">
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <Image
            source={require('../../assets/images/bambuddy-logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            {step === '2fa' ? translateNative('native.55178b88e5e360a1') : step === 'forgot' ? translateNative('native.b47b4b42ad4c4632') : step === 'reset' ? translateNative('native.539cd2a37d713bd6') : translateNative('native.62a155bdfe8d655f')}
          </Text>
          {step !== '2fa' ? <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {step === 'forgot'
              ? translateNative('native.957d9b50dbb848d3')
              : step === 'reset'
                ? translateNative('native.5ccf879c7e8219d2')
                : oidcBusy
                  ? translateNative('native.595d910db8026f25')
                  : translateNative('native.c657b68c31e11c85')}
          </Text> : null}

          {step === 'credentials' ? <ServerSetupScreen embedded disabled={submitMutation.isPending || oidcBusy} onReadyChange={setServerReady} /> : (
            <TextField label={translateNative('native.301fd81a82ae3258')} value={serverUrl ?? ''} editable={false} />
          )}
          {loading ? <Text style={[styles.methodHint, { color: colors.textSecondary }]}>{translateNative('native.d041a71daf02b592')}</Text> : null}

          {step === 'credentials' && credentialsEnabled && (
            <>
              <TextField
                label={translateNative('native.f503af8b2bf430e6')}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoComplete="username"
                textContentType="username"
              />
              <TextField
                label={translateNative('native.08c9c68cc706272f')}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                userName={serverHostname}
              />
              {localLoginEnabled ? <Pressable
                accessibilityRole="button"
                style={styles.linkTarget}
                onPress={() => {
                  setError('');
                  setStep('forgot');
                }}
              >
                <Text style={[styles.link, { color: colors.accent }]}>{translateNative('native.b47b4b42ad4c4632')}</Text>
              </Pressable> : null}
            </>
          )}

          {step === '2fa' && (
            <>
              <TextField
                label={selectedMethod === 'email' ? translateNative('native.dcea23edb648a9a8') : selectedMethod === 'backup' ? translateNative('native.ff24fc18f7c9ee3a') : translateNative('native.746c42b71473bb1b')}
                value={code}
                onChangeText={setCode}
                keyboardType={selectedMethod === 'backup' ? 'default' : 'number-pad'}
                autoCorrect={false}
                autoCapitalize="none"
                placeholder={
                  selectedMethod === 'backup' ? translateNative('native.ac5fe0934034cd48') : selectedMethod === 'email'
                    ? translateNative('native.a75fb04b4a9cfde4')
                    : translateNative('native.e8765941bc8ea846')
                }
              />
              <Text style={[styles.methodHint, { color: colors.textSecondary }]}>
                {selectedMethod === 'backup' ? translateNative('native.ab1eeb760ef8e8e0') : selectedMethod === 'email'
                  ? translateNative('native.98c251e2007b3112')
                  : translateNative('native.f1b547673323a2d1')}
              </Text>
              {selectedMethod === 'email' ? <PrimaryButton
                label={emailMutation.isPending ? t('auth.sending', { defaultValue: 'Sending…' }) : emailDelivered ? t('auth.resendEmailCode', { defaultValue: 'Resend email code' }) : t('auth.sendEmailCode', { defaultValue: 'Send email code' })}
                onPress={() => emailMutation.mutate()} disabled={emailMutation.isPending}
              /> : null}
            </>
          )}

          {step === 'forgot' && (
            <>
              <TextField
                label={translateNative('native.6d96e259f012a733')}
                value={forgotEmail}
                onChangeText={setForgotEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <Pressable
                accessibilityRole="button"
                style={styles.linkTarget}
                onPress={() => {
                  setError('');
                  setStep('credentials');
                }}
              >
                <Text style={[styles.link, { color: colors.accent }]}>{translateNative('native.00c52488a6d2c291')}</Text>
              </Pressable>
            </>
          )}

          {step === 'reset' && (
            <>
              <TextField
                label={translateNative('native.6b5d0655a8286c57')}
                value={resetToken}
                onChangeText={setResetToken}
                autoCapitalize="none"
              />
              <TextField
                label={translateNative('native.17ade512aa8e8ded')}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />
              <TextField
                label={translateNative('native.f200fa588492348e')}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
              <Pressable
                accessibilityRole="button"
                style={styles.linkTarget}
                onPress={() => {
                  setError('');
                  setStep('credentials');
                }}
              >
                <Text style={[styles.link, { color: colors.accent }]}>{translateNative('native.00c52488a6d2c291')}</Text>
              </Pressable>
            </>
          )}

          {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}

          {step === 'credentials' && (credentialsEnabled || oidcProviders.length > 0) ? <SwitchRow label={t('auth.rememberMe', { defaultValue: 'Remember me' })} value={remember} onValueChange={setRemember} disabled={submitMutation.isPending || oidcBusy} /> : null}
          {step === 'credentials' && credentialsPolicyPending ? <Text style={{ color: colors.textSecondary }}>{t('auth.loadingPolicy', { defaultValue: 'Loading login policy…' })}</Text> : null}
          {step === 'credentials' && policyQuery.data?.local_login_enabled === false && ldapStatusQuery.data?.ldap_enabled === false ? <Text style={{ color: colors.textSecondary }}>{t('auth.localLoginDisabled', { defaultValue: 'Local sign-in is disabled. Choose a single sign-on provider below.' })}</Text> : null}
          {step === 'credentials' && !localLoginEnabled && ldapLoginEnabled ? <Text style={{ color: colors.textSecondary }}>{t('auth.directoryLoginHint', { defaultValue: 'Sign in with your directory account.' })}</Text> : null}
          {step === 'credentials' && policyQuery.isError ? <PrimaryButton label={t('auth.retryPolicy', { defaultValue: 'Retry login policy' })} variant="secondary" onPress={() => void policyQuery.refetch()} /> : null}
          {step === 'credentials' && ldapStatusQuery.isError ? <PrimaryButton label={t('auth.retryDirectoryStatus', { defaultValue: 'Retry directory sign-in status' })} variant="secondary" onPress={() => void ldapStatusQuery.refetch()} /> : null}
          {step === 'credentials' && oidcProvidersQuery.isError ? <>
            <Text accessibilityRole="alert" style={{ color: colors.error }}>{oidcProvidersQuery.error.message}</Text>
            <PrimaryButton label={t('common.retry')} variant="secondary" onPress={() => void oidcProvidersQuery.refetch()} />
          </> : null}
          {step === 'credentials' && credentialsEnabled && (
            <PrimaryButton
              label={submitMutation.isPending ? translateNative('native.1aeddc7b0b18d572') : translateNative('native.62a155bdfe8d655f')}
              onPress={() => submitMutation.mutate()}
              loading={submitMutation.isPending}
              disabled={!serverReady || loading || username.trim().length === 0 || password.length === 0 || oidcBusy}
            />
          )}

          {step === '2fa' && (
            <>
            <PrimaryButton
              label={submitMutation.isPending ? translateNative('native.5c1bf88a5cba056e') : translateNative('native.55178b88e5e360a1')}
              onPress={() => submitMutation.mutate()}
              loading={submitMutation.isPending}
              disabled={
                code.trim().length === 0 ||
                emailMutation.isPending ||
                (availableMethods.length > 1 && selectedMethod == null)
              }
            />
            {availableMethods.includes('backup') && selectedMethod !== 'backup' ? (
              <PrimaryButton
                label={t('auth.useBackupCode')}
                variant="secondary"
                disabled={submitMutation.isPending || emailMutation.isPending}
                onPress={() => selectVerificationMethod('backup')}
              />
            ) : null}
            {availableMethods.filter(method => method !== 'backup' && method !== selectedMethod).map(method => (
              <PrimaryButton
                key={method}
                label={method === 'totp' ? t('auth.useAuthenticatorApp') : method === 'email' ? t('auth.useEmailCode') : method.toUpperCase()}
                variant="secondary"
                disabled={submitMutation.isPending || emailMutation.isPending}
                onPress={() => selectVerificationMethod(method)}
              />
            ))}
            <PrimaryButton label={t('auth.backToSignIn', { defaultValue: 'Back to sign in' })} variant="secondary" disabled={submitMutation.isPending || emailMutation.isPending}
              onPress={() => { setPreAuthToken(null); setCode(''); setPassword(''); setSelectedMethod(null); setAvailableMethods([]); setEmailDelivered(false); setError(''); setStep('credentials'); }} />
            </>
          )}

          {step === 'forgot' && (
            <PrimaryButton
              label={forgotMutation.isPending ? translateNative('native.503088c268f2c987') : translateNative('native.4ef306e469bd08dc')}
              onPress={() => forgotMutation.mutate()}
              loading={forgotMutation.isPending}
              disabled={forgotEmail.trim().length === 0}
            />
          )}

          {step === 'reset' && (
            <PrimaryButton
              label={resetMutation.isPending ? translateNative('native.cc1642fca0298ffc') : translateNative('native.539cd2a37d713bd6')}
              onPress={() => resetMutation.mutate()}
              loading={resetMutation.isPending}
              disabled={!resetToken.trim() || !newPassword || !confirmPassword}
            />
          )}

          {step === 'credentials' && oidcProviders.length > 0 ? (
            <View style={[styles.oidcSection, { borderTopColor: colors.borderSubtle }]}> 
              <Text style={[styles.oidcTitle, { color: colors.textSecondary }]}>{translateNative('native.463822ad64bcc7bb')}</Text>
              {oidcProviders.map(provider => (
                <PrimaryButton
                  key={provider.id}
                  label={oidcBusy ? translateNative('native.f45864aaf71ade00') : translateNative('native.245449ff754e7ef0', { value0: String(provider.name) })}
                  variant="secondary"
                  onPress={() => {
                    oidcStartMutation.mutate(provider.id);
                  }}
                  disabled={!serverReady || loading || oidcBusy}
                />
              ))}
              <Text style={[styles.oidcHint, { color: colors.textTertiary }]}>{t('auth.oidcBrowserHint', { defaultValue: 'Sign in inside the secure authorization window. Cancel to choose another sign-in method.' })}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius['2xl'],
    padding: spacing.xl,
    gap: spacing.lg,
  },
  logoImage: {
    width: 80,
    height: 80,
    alignSelf: 'center',
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.base,
    textAlign: 'center',
    lineHeight: 22,
  },
  error: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
  },
  link: {
    fontSize: fontSize.sm,
    textAlign: 'right',
  },
  linkTarget: { minHeight: 44, justifyContent: 'center' },
  methodHint: {
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
  oidcSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  oidcTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  oidcHint: {
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
});
