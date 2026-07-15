import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { api, setAuthToken } from '../../api/client';
import { useAuth, type UserResponse } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useTheme } from '../../theme';
import { borderRadius, fontSize, fontWeight, spacing } from '../../theme/tokens';
import { PrimaryButton, TextField } from '../../components/common/AppUI';
import { LoadingScreen } from '../../components/common/StateScreens';
import { useServerStore } from '../../api/server';

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { login, loginWithToken, user, loading, requiresSetup } = useAuth();
  const { showToast } = useToast();
  const serverUrl = useServerStore((state) => state.serverUrl);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [preAuthToken, setPreAuthToken] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!serverUrl) router.replace('/server');
  }, [router, serverUrl]);

  useEffect(() => {
    if (requiresSetup) {
      router.replace('/setup');
      return;
    }
    if (user) {
      router.replace('/(tabs)');
    }
  }, [requiresSetup, router, user]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      setError('');
      if (preAuthToken) {
        const response = await api.verify2FA({ pre_auth_token: preAuthToken, code });
        await setAuthToken(response.access_token);
        loginWithToken(response.access_token, response.user as UserResponse);
        return response;
      }
      return login(username.trim(), password);
    },
    onSuccess: (result) => {
      if ('requires_2fa' in result && result.requires_2fa) {
        setPreAuthToken(result.pre_auth_token ?? null);
        showToast('Enter your 2FA code to continue.', 'info');
        return;
      }
      showToast('Signed in successfully.', 'success');
      router.replace('/(tabs)');
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message || 'Login failed.');
    },
  });

  if (loading) {
    return <LoadingScreen message="Checking authentication…" />;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
        <Text style={[styles.logo, { color: colors.accentLight }]}>Bambuddy</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Sign in to manage your printers, queue, and library.</Text>

        {!preAuthToken ? (
          <>
            <TextField label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" />
            <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry />
          </>
        ) : (
          <TextField label="2FA Code" value={code} onChangeText={setCode} keyboardType="number-pad" autoCapitalize="none" />
        )}

        {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}

        <PrimaryButton
          label={submitMutation.isPending ? 'Signing in…' : preAuthToken ? 'Verify Code' : 'Login'}
          onPress={() => void submitMutation.mutateAsync()}
          loading={submitMutation.isPending}
          disabled={preAuthToken ? code.trim().length === 0 : username.trim().length === 0 || password.length === 0}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius['2xl'],
    padding: spacing.xl,
    gap: spacing.lg,
  },
  logo: {
    fontSize: fontSize['3xl'],
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
});
