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
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { PrimaryButton, TextField } from '@/components/common/AppUI';

const DEMO_SERVER_URL = 'https://demo.bambubuddy.com';
const DEMO_USERNAME = 'demo';
const DEMO_PASSWORD = 'demo';

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
  const { login, setServerConnected } = useAuth();
  const { showToast } = useToast();
  const storedUrl = useServerStore(state => state.serverUrl);
  const [serverUrl, setServerUrl] = useState(storedUrl ?? '');
  const [error, setError] = useState('');

  useEffect(() => {
    if (storedUrl) {
      setServerUrl(storedUrl);
    }
  }, [storedUrl]);

  async function connectToServer(
    url: string,
    options?: { tryDemoLogin?: boolean },
  ) {
    setError('');
    const normalized = normalizeUrl(url);
    await useServerStore.getState().setServerUrl(normalized);
    try {
      const status = await api.getAuthStatus();
      setServerConnected(true);
      if (options?.tryDemoLogin && status.auth_enabled) {
        const loginResult = await login(DEMO_USERNAME, DEMO_PASSWORD);
        if (loginResult.requires_2fa) {
          throw new Error(
            'Demo sign-in requires two-factor authentication and cannot be completed automatically.',
          );
        }
      }
      return status;
    } catch (mutationError) {
      await useServerStore.getState().clearServerUrl();
      throw mutationError;
    }
  }

  const connectMutation = useMutation({
    mutationFn: async () => connectToServer(serverUrl),
    onSuccess: () => {
      showToast('Connected to Bambuddy server.', 'success');
      // RootNavigator automatically handles navigation based on auth state
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message || 'Could not connect to that server.');
      showToast('Connection failed.', 'error');
    },
  });

  const demoMutation = useMutation({
    mutationFn: async () =>
      connectToServer(DEMO_SERVER_URL, { tryDemoLogin: true }),
    onSuccess: () => {
      showToast('Connected to Bambuddy demo server.', 'success');
      // RootNavigator automatically handles navigation based on auth state
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message || 'Could not start demo mode.');
      showToast('Demo connection failed.', 'error');
    },
  });

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

  function handleDemoConnect() {
    setServerUrl(DEMO_SERVER_URL);
    void demoMutation.mutateAsync();
  }

  const connecting = connectMutation.isPending || demoMutation.isPending;

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
        {isInsecureUrl(serverUrl.trim()) ? (
          <Text style={[styles.warning, { color: colors.warning }]}>
            ⚠️ This URL uses an unencrypted HTTP connection.
          </Text>
        ) : null}
        {error ? (
          <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
        ) : null}
        <PrimaryButton
          label="Scan QR Code"
          onPress={() => navigation.navigate('Scanner', { mode: 'server' })}
          variant="secondary"
          disabled={connecting}
        />
        <PrimaryButton
          label={demoMutation.isPending ? 'Starting demo…' : 'Try the Demo'}
          onPress={handleDemoConnect}
          loading={demoMutation.isPending}
          variant="secondary"
          disabled={connecting}
        />
        <PrimaryButton
          label={connectMutation.isPending ? 'Connecting…' : 'Connect'}
          onPress={handleConnect}
          loading={connectMutation.isPending}
          disabled={connecting || serverUrl.trim().length === 0}
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
});
