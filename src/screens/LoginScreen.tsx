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
import { api, setAuthToken } from '@/api/client';
import { useAuth, type UserResponse } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { PrimaryButton, TextField } from '@/components/common/AppUI';
import { LoadingScreen } from '@/components/common/StateScreens';
import { useServerStore } from '@/api/server';
import type { LoginResponse, OIDCProvider } from '@/types/api';

function parseOidcCallback(url: string) {
  try {
    const parsedUrl = new URL(url);
    const params = parsedUrl.searchParams;
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
      showToast('Enter your 2FA code to continue.', 'info');
      return;
    }

    if (loginResponse.access_token && loginResponse.user) {
      await setAuthToken(loginResponse.access_token);
      loginWithToken(loginResponse.access_token, loginResponse.user as unknown as UserResponse);
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

  useEffect(() => {
    const handleUrl = async ({ url }: { url: string }) => {
      const { token, error: oidcError, state } = parseOidcCallback(url);
      if (!token && !oidcError) {
        return;
      }

      const expectedState = pendingOidcState.current;
      if (!expectedState || !state || state !== expectedState) {
        pendingOidcState.current = null;
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
        await oidcExchangeMutation.mutateAsync(token);
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
  }, [oidcExchangeMutation, showToast]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      setError('');
      if (preAuthToken) {
        const response = await api.verify2FA({
          pre_auth_token: preAuthToken,
          code,
          method: selectedMethod ?? undefined,
        });
        await setAuthToken(response.access_token);
        loginWithToken(response.access_token, response.user as unknown as UserResponse);
        return response;
      }
      return login(username.trim(), password);
    },
    onSuccess: result => {
      if ('requires_2fa' in result && result.requires_2fa) {
        const methods = result.available_methods ?? [];
        setPreAuthToken(result.pre_auth_token ?? null);
        setAvailableMethods(methods);
        setSelectedMethod(methods.length === 1 ? methods[0] : null);
        setCode('');
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
      const state = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
      pendingOidcState.current = state;
      return api.getOIDCAuthorizeUrl(providerId, state);
    },
    onSuccess: async data => {
      setError('');
      try {
        await Linking.openURL(data.auth_url);
      } catch (error) {
        pendingOidcState.current = null;
        const message =
          error instanceof Error ? error.message : 'Unable to start SSO login.';
        setError(message);
        showToast(message, 'error');
      }
    },
    onError: (mutationError: Error) => {
      pendingOidcState.current = null;
      setError(mutationError.message || 'Unable to start SSO login.');
      showToast(mutationError.message || 'Unable to start SSO login.', 'error');
    },
  });

  if (loading) {
    return <LoadingScreen message="Checking authentication…" />;
  }

  const oidcProviders = (oidcProvidersQuery.data ?? []) as OIDCProvider[];
  const oidcBusy = oidcStartMutation.isPending || oidcExchangeMutation.isPending;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
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

          {step === 'credentials' && (
            <>
              <TextField
                label="Username"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />
              <TextField
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
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
                          onPress={() => {
                            setSelectedMethod(method);
                            setCode('');
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
                label={selectedMethod === 'email' ? 'Email Code' : '2FA Code'}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                autoCapitalize="none"
                placeholder={
                  selectedMethod === 'email'
                    ? 'Enter the email verification code'
                    : 'Enter the authenticator app code'
                }
              />
              <Text style={[styles.methodHint, { color: colors.textSecondary }]}>
                {selectedMethod === 'email'
                  ? 'Use the code sent to your email address.'
                  : 'Use the current code from your authenticator app.'}
              </Text>
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

          {step === 'credentials' && (
            <PrimaryButton
              label={submitMutation.isPending ? 'Signing in…' : 'Login'}
              onPress={() => void submitMutation.mutateAsync()}
              loading={submitMutation.isPending}
              disabled={username.trim().length === 0 || password.length === 0 || oidcBusy}
            />
          )}

          {step === '2fa' && (
            <PrimaryButton
              label={submitMutation.isPending ? 'Verifying…' : 'Verify Code'}
              onPress={() => void submitMutation.mutateAsync()}
              loading={submitMutation.isPending}
              disabled={
                code.trim().length === 0 ||
                (availableMethods.length > 1 && selectedMethod == null)
              }
            />
          )}

          {step === 'forgot' && (
            <PrimaryButton
              label={forgotMutation.isPending ? 'Sending…' : 'Send Reset Link'}
              onPress={() => void forgotMutation.mutateAsync()}
              loading={forgotMutation.isPending}
              disabled={forgotEmail.trim().length === 0}
            />
          )}

          {step === 'reset' && (
            <PrimaryButton
              label={resetMutation.isPending ? 'Resetting…' : 'Reset Password'}
              onPress={() => void resetMutation.mutateAsync()}
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
                    void oidcStartMutation.mutateAsync(provider.id);
                  }}
                  disabled={oidcBusy}
                />
              ))}
              <Text style={[styles.oidcHint, { color: colors.textTertiary }]}>The app expects an OIDC callback to the bambuddy:// deep link.</Text>
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
