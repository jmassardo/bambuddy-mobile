import React, { useEffect, useMemo, useState } from 'react';
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
import { LoadingScreen } from '@/components/common/StateScreens';
import { useServerStore } from '@/api/server';
import type { LoginResponse } from '@/types/api';
import { authApi } from '@/api/auth';
import { SwitchRow } from '@/components/settings/shared';
import { createOidcState, oidcCallbackBase } from '@/utils/authSecurity';
import { OIDCAuthorizationBrowser } from '@/components/common/OIDCAuthorizationBrowser';
import { useTranslation } from '@/i18n';

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
        error: 'unexpected_callback_origin',
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
      error: 'invalid_callback_url',
      state: null,
    };
  }
}

export default function LoginScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<RootNavigationProp<'Login'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Login', headerShown: false });
  }, [navigation]);
  const { colors } = useTheme();
  const { login, loginWithToken, user, loading, requiresSetup } = useAuth();
  const { showToast } = useToast();
  const serverUrl = useServerStore(state => state.serverUrl);
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

  const serverHostname = useMemo(() => {
    if (!serverUrl) return undefined;
    try {
      return new URL(serverUrl).hostname;
    } catch {
      return undefined;
    }
  }, [serverUrl]);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'credentials' | '2fa' | 'forgot' | 'reset'>('credentials');
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const pendingOidcState = React.useRef<string | null>(null);

  useEffect(() => {
    if (!serverUrl) {
      navigation.reset({ index: 0, routes: [{ name: 'ServerSetup' }] });
    }
  }, [navigation, serverUrl]);

  useEffect(() => {
    if (requiresSetup) {
      navigation.reset({ index: 0, routes: [{ name: 'Setup' }] });
      return;
    }
    if (user) {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main', params: { screen: 'Dashboard' } }],
      });
    }
  }, [requiresSetup, navigation, user]);

  const oidcProvidersQuery = useQuery({
    queryKey: ['oidcProviders'],
    queryFn: () => api.getOIDCProviders(),
  });
  const policyQuery = useQuery({
    queryKey: ['advancedAuthStatus'],
    queryFn: authApi.getAdvancedAuthStatus,
  });
  const emailMutation = useMutation({
    mutationFn: async () => {
      if (!preAuthToken) throw new Error('Sign in again to request a verification code.');
      return authApi.sendEmailOTP(preAuthToken);
    },
    onSuccess: response => { if (response.pre_auth_token) setPreAuthToken(response.pre_auth_token); setEmailDelivered(true); setError(''); showToast('Verification code sent.', 'success'); },
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
      setSelectedMethod(methods.length === 1 ? methods[0] : null);
      setStep('2fa');
      setCode('');
      setEmailDelivered(false);
      showToast('Enter your 2FA code to continue.', 'info');
      return;
    }

    if (loginResponse.access_token && loginResponse.user) {
      await loginWithToken(loginResponse.access_token, loginResponse.user as unknown as UserResponse, remember);
      showToast('Signed in successfully.', 'success');
      return;
    }

    throw new Error('OIDC login did not return a valid Bambuddy session.');
  };

  const oidcExchangeMutation = useMutation({
    mutationFn: (oidcToken: string) => api.exchangeOIDCToken(oidcToken),
    onSuccess: async response => {
      await finalizeLogin(response);
    },
    onError: (exchangeError: Error) => {
      setError(exchangeError.message || 'OIDC login failed.');
      showToast(exchangeError.message || 'OIDC login failed.', 'error');
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
        setError('OIDC login failed. Please try again.');
        showToast('OIDC login failed.', 'error');
        return;
      }

      pendingOidcState.current = null;
      if (oidcError) {
        setError(`OIDC login failed: ${oidcError.replace(/_/g, ' ')}`);
        showToast('OIDC login failed.', 'error');
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
  }, [showToast]);

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
        setSelectedMethod(methods.length === 1 ? methods[0] : null);
        setCode('');
        setEmailDelivered(false);
        setStep('2fa');
        showToast('Enter your 2FA code to continue.', 'info');
        return;
      }
      showToast('Signed in successfully.', 'success');
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message || 'Login failed.');
    },
  });

  const forgotMutation = useMutation({
    mutationFn: async () => {
      setError('');
      await api.forgotPassword({ email: forgotEmail.trim() });
    },
    onSuccess: () => {
      showToast('If that email exists, a reset link has been sent.', 'success');
      setStep('reset');
    },
    onError: (e: Error) => {
      setError(e.message || 'Failed to send reset email.');
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      setError('');
      if (newPassword !== confirmPassword) {
        throw new Error('Passwords do not match.');
      }
      await api.forgotPasswordConfirm(resetToken.trim(), newPassword);
    },
    onSuccess: () => {
      showToast('Password reset successfully. Please log in.', 'success');
      setStep('credentials');
      setResetToken('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (e: Error) => {
      setError(e.message || 'Failed to reset password.');
    },
  });

  const oidcStartMutation = useMutation({
    mutationFn: async (providerId: number) => {
      const state = createOidcState();
      pendingOidcState.current = state;
      const response = await api.getOIDCAuthorizeUrl(providerId, state);
      if (!serverUrl) throw new Error('Configure a server before signing in.');
      return { ...response, callbackServer: oidcCallbackBase(response.auth_url, serverUrl) };
    },
    onSuccess: async data => {
      setError('');
      setCallbackServer(data.callbackServer);
      setAuthorizationUrl(data.auth_url);
    },
    onError: (mutationError: Error) => {
      pendingOidcState.current = null;
      setError(mutationError.message || 'Unable to start SSO login.');
      showToast(mutationError.message || 'Unable to start SSO login.', 'error');
    },
  });

  const startOidc = oidcStartMutation.mutate;
  useEffect(() => {
    const id = policyQuery.data?.autologin_provider_id;
    if (!loading && id && step === 'credentials' && !autoStarted.current &&
        oidcProvidersQuery.data?.some(p => p.id === id)) {
      autoStarted.current = true;
      startOidc(id);
    }
  }, [loading, policyQuery.data, oidcProvidersQuery.data, startOidc, step]);

  if (loading) {
    return <LoadingScreen message="Checking authentication…" />;
  }

  const oidcProviders = oidcProvidersQuery.data ?? [];
  const oidcBusy = oidcStartMutation.isPending || oidcExchangeMutation.isPending;

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
        onCancel={() => { setAuthorizationUrl(null); pendingOidcState.current = null; setError('Single sign-on cancelled. Choose a provider or another available sign-in method.'); }}
      /> : null}
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
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
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {step === 'forgot'
              ? 'Enter your email to receive a password reset link.'
              : step === 'reset'
                ? 'Enter the reset code from your email and a new password.'
                : oidcBusy
                  ? 'Completing secure sign-in…'
                  : 'Sign in to manage your printers, queue, and library.'}
          </Text>

          {step === 'credentials' && policyQuery.data?.local_login_enabled === true && (
            <>
              <TextField
                label="Username"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoComplete="username"
                textContentType="username"
              />
              <TextField
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                userName={serverHostname}
              />
              <Pressable
                onPress={() => {
                  setError('');
                  setStep('forgot');
                }}
              >
                <Text style={[styles.link, { color: colors.accent }]}>Forgot password?</Text>
              </Pressable>
            </>
          )}

          {step === '2fa' && (
            <>
              {availableMethods.length > 1 ? (
                <View style={styles.methodSection}>
                  <Text style={[styles.methodTitle, { color: colors.textSecondary }]}>
                    Verification method
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.methodRow}
                  >
                    {availableMethods.map(method => {
                      const active = selectedMethod === method;
                      const label =
                        method === 'email'
                          ? 'Email code'
                          : method === 'totp'
                            ? 'Authenticator app'
                            : method.toUpperCase();
                      return (
                        <Pressable
                          key={method}
                          disabled={submitMutation.isPending || emailMutation.isPending}
                          onPress={() => {
                            setSelectedMethod(method);
                            setCode('');
                            setError('');
                          }}
                          style={[
                            styles.methodChip,
                            {
                              backgroundColor: active ? colors.accentBg : colors.surfaceElevated,
                              borderColor: active ? colors.accent : colors.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.methodChipText,
                              { color: active ? colors.accentLight : colors.textSecondary },
                            ]}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}

              <TextField
                label={selectedMethod === 'email' ? 'Email Code' : selectedMethod === 'backup' ? 'Backup Code' : '2FA Code'}
                value={code}
                onChangeText={setCode}
                keyboardType={selectedMethod === 'backup' ? 'default' : 'number-pad'}
                autoCorrect={false}
                autoCapitalize="none"
                placeholder={
                  selectedMethod === 'backup' ? 'Enter a complete backup code' : selectedMethod === 'email'
                    ? 'Enter the email verification code'
                    : 'Enter the authenticator app code'
                }
              />
              <Text style={[styles.methodHint, { color: colors.textSecondary }]}>
                {selectedMethod === 'backup' ? 'Use one unused backup code, including all letters and digits.' : selectedMethod === 'email'
                  ? 'Use the code sent to your email address.'
                  : 'Use the current code from your authenticator app.'}
              </Text>
              {selectedMethod === 'email' ? <PrimaryButton
                label={emailMutation.isPending ? t('auth.sending', { defaultValue: 'Sending…' }) : emailDelivered ? t('auth.resendEmailCode', { defaultValue: 'Resend email code' }) : t('auth.sendEmailCode', { defaultValue: 'Send email code' })}
                onPress={() => emailMutation.mutate()} disabled={emailMutation.isPending}
              /> : null}
              <PrimaryButton label={t('auth.backToSignIn', { defaultValue: 'Back to sign in' })} variant="secondary" disabled={submitMutation.isPending || emailMutation.isPending}
                onPress={() => { setPreAuthToken(null); setCode(''); setPassword(''); setSelectedMethod(null); setAvailableMethods([]); setEmailDelivered(false); setError(''); setStep('credentials'); }} />
            </>
          )}

          {step === 'forgot' && (
            <>
              <TextField
                label="Email"
                value={forgotEmail}
                onChangeText={setForgotEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <Pressable
                onPress={() => {
                  setError('');
                  setStep('credentials');
                }}
              >
                <Text style={[styles.link, { color: colors.accent }]}>Back to login</Text>
              </Pressable>
            </>
          )}

          {step === 'reset' && (
            <>
              <TextField
                label="Reset Code"
                value={resetToken}
                onChangeText={setResetToken}
                autoCapitalize="none"
              />
              <TextField
                label="New Password"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />
              <TextField
                label="Confirm Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
              <Pressable
                onPress={() => {
                  setError('');
                  setStep('credentials');
                }}
              >
                <Text style={[styles.link, { color: colors.accent }]}>Back to login</Text>
              </Pressable>
            </>
          )}

          {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}

          {step === 'credentials' || step === '2fa' ? <SwitchRow label={t('auth.rememberMe', { defaultValue: 'Remember me' })} description={t('auth.rememberMeHint', { defaultValue: 'Off: keep the session only until the app process closes. On: save securely in Keychain/Keystore.' })} value={remember} onValueChange={setRemember} disabled={submitMutation.isPending || oidcBusy} /> : null}
          {step === 'credentials' && policyQuery.isLoading ? <Text style={{ color: colors.textSecondary }}>{t('auth.loadingPolicy', { defaultValue: 'Loading login policy…' })}</Text> : null}
          {step === 'credentials' && policyQuery.data?.local_login_enabled === false ? <Text style={{ color: colors.textSecondary }}>{t('auth.localLoginDisabled', { defaultValue: 'Local sign-in is disabled. Choose a single sign-on provider below.' })}</Text> : null}
          {step === 'credentials' && policyQuery.isError ? <PrimaryButton label={t('auth.retryPolicy', { defaultValue: 'Retry login policy' })} variant="secondary" onPress={() => void policyQuery.refetch()} /> : null}
          {step === 'credentials' && policyQuery.data?.local_login_enabled === true && (
            <PrimaryButton
              label={submitMutation.isPending ? 'Signing in…' : 'Login'}
              onPress={() => submitMutation.mutate()}
              loading={submitMutation.isPending}
              disabled={username.trim().length === 0 || password.length === 0 || oidcBusy}
            />
          )}

          {step === '2fa' && (
            <PrimaryButton
              label={submitMutation.isPending ? 'Verifying…' : 'Verify Code'}
              onPress={() => submitMutation.mutate()}
              loading={submitMutation.isPending}
              disabled={
                code.trim().length === 0 ||
                emailMutation.isPending ||
                (availableMethods.length > 1 && selectedMethod == null)
              }
            />
          )}

          {step === 'forgot' && (
            <PrimaryButton
              label={forgotMutation.isPending ? 'Sending…' : 'Send Reset Link'}
              onPress={() => forgotMutation.mutate()}
              loading={forgotMutation.isPending}
              disabled={forgotEmail.trim().length === 0}
            />
          )}

          {step === 'reset' && (
            <PrimaryButton
              label={resetMutation.isPending ? 'Resetting…' : 'Reset Password'}
              onPress={() => resetMutation.mutate()}
              loading={resetMutation.isPending}
              disabled={!resetToken.trim() || !newPassword || !confirmPassword}
            />
          )}

          {step === 'credentials' && oidcProviders.length > 0 ? (
            <View style={[styles.oidcSection, { borderTopColor: colors.borderSubtle }]}> 
              <Text style={[styles.oidcTitle, { color: colors.textSecondary }]}>Single sign-on</Text>
              {oidcProviders.map(provider => (
                <PrimaryButton
                  key={provider.id}
                  label={oidcBusy ? 'Redirecting…' : `Sign in with ${provider.name}`}
                  variant="secondary"
                  onPress={() => {
                    oidcStartMutation.mutate(provider.id);
                  }}
                  disabled={oidcBusy}
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
    width: 120,
    height: 120,
    alignSelf: 'center',
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
  methodSection: {
    gap: spacing.sm,
  },
  methodTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  methodRow: {
    gap: spacing.sm,
  },
  methodChip: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  methodChipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
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
