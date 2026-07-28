import React, { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigationProp } from '@/navigation/types';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api/client';
import { isInsecureUrl, useServerStore } from '@/api/server';
import { demoConfig, isDemoConfigured } from '@/config/demo';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { PrimaryButton, TextField } from '@/components/common/AppUI';

function normalizeUrl(input: string) {
  const trimmed = input.trim();
  const url = new URL(trimmed);
  return url.toString().replace(/\/$/, '');
}

export default function ServerConfigScreen() {
  const navigation = useNavigation<RootNavigationProp<'ServerSetup'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Server', headerShown: false });
  }, [navigation]);
  const { colors } = useTheme();
  const { setServerConnected, login } = useAuth();
  const { showToast } = useToast();
  const storedUrl = useServerStore(state => state.serverUrl);
  const [serverUrl, setServerUrl] = useState(storedUrl ?? '');
  const [error, setError] = useState('');

  useEffect(() => {
    if (storedUrl) {
      setServerUrl(storedUrl);
    }
  }, [storedUrl]);

  const connectMutation = useMutation({
    mutationFn: async () => {
      setError('');
      const normalized = normalizeUrl(serverUrl);
      await useServerStore.getState().setServerUrl(normalized);
      try {
        const status = await api.getAuthStatus();
        setServerConnected(true);
        return status;
      } catch (mutationError) {
        await useServerStore.getState().clearServerUrl();
        throw mutationError;
      }
    },
    onSuccess: () => {
      showToast('Connected to Bambuddy server.', 'success');
      // RootNavigator automatically handles navigation based on auth state
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message || 'Could not connect to that server.');
      showToast('Connection failed.', 'error');
    },
  });

  /** Connects to the hosted demo instance and signs in automatically. */
  const demoMutation = useMutation({
    mutationFn: async () => {
      setError('');
      await useServerStore.getState().setServerUrl(demoConfig.url);
      try {
        await api.getAuthStatus();
        const result = await login(demoConfig.username, demoConfig.password);
        if (result.requires_2fa) {
          throw new Error(
            'The demo account requires two-factor authentication.',
          );
        }
        await useServerStore.getState().setDemoMode(true);
        setServerConnected(true);
      } catch (mutationError) {
        await useServerStore.getState().clearServerUrl();
        throw mutationError;
      }
    },
    onSuccess: () => {
      showToast('Signed in to the Bambuddy demo.', 'success');
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message || 'Could not start the demo.');
      showToast('Demo unavailable.', 'error');
    },
  });

  const busy = connectMutation.isPending || demoMutation.isPending;

  /** Initiates connection, showing a warning if the URL uses plain HTTP */
  function handleConnect() {
    const normalized = normalizeUrl(serverUrl);
    if (isInsecureUrl(normalized)) {
      Alert.alert(
        'Insecure Connection',
        'This server uses HTTP, which is not encrypted. Your data may be visible to others on the network.\n\nOnly use this on trusted networks (e.g. your home LAN or VPN).',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Connect Anyway',
            style: 'destructive',
            onPress: () => void connectMutation.mutateAsync(),
          },
        ],
      );
    } else {
      void connectMutation.mutateAsync();
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
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
        <Text style={[styles.title, { color: colors.text }]}>
          Connect to your server
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          This mobile app connects to your self-hosted Bambuddy instance so you
          can monitor prints and manage your queue from anywhere.
        </Text>
        <TextField
          label="Server URL"
          value={serverUrl}
          onChangeText={setServerUrl}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://bambuddy.example.com"
        />
        {/* ATS posture: NSAllowsLocalNetworking permits cleartext HTTP only to
           local/private-network addresses. Public servers must use HTTPS. */}
        {isInsecureUrl(serverUrl.trim()) ? (
          <Text style={[styles.warning, { color: colors.warning }]}>
            ⚠️ Plain HTTP is only supported for servers on your local network.
            Public servers require HTTPS.
          </Text>
        ) : null}
        {error ? (
          <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
        ) : null}
        <PrimaryButton
          label="Scan QR Code"
          onPress={() => navigation.navigate('Scanner', { mode: 'server' })}
          variant="secondary"
          disabled={busy}
        />
        <PrimaryButton
          label={connectMutation.isPending ? 'Connecting…' : 'Connect'}
          onPress={handleConnect}
          loading={connectMutation.isPending}
          disabled={serverUrl.trim().length === 0 || demoMutation.isPending}
        />
        {isDemoConfigured() ? (
          <View style={styles.demoSection}>
            <View
              style={[styles.divider, { backgroundColor: colors.cardBorder }]}
            />
            <Text style={[styles.demoHint, { color: colors.textSecondary }]}>
              Don't have a server yet?
            </Text>
            <PrimaryButton
              label={
                demoMutation.isPending ? 'Starting demo…' : 'Try the demo'
              }
              onPress={() => demoMutation.mutate()}
              variant="secondary"
              loading={demoMutation.isPending}
              disabled={connectMutation.isPending}
            />
          </View>
        ) : null}
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
  logoImage: {
    width: 120,
    height: 120,
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
  warning: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
  },
  demoSection: {
    gap: spacing.md,
  },
  divider: {
    height: 1,
  },
  demoHint: {
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
});
