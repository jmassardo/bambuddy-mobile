import { nativeMessage, translateNative, useNativeLocale, useNativeMessageState } from '@/i18n';


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
  const titleLocale = useNativeLocale();
  const navigation = useNavigation<RootNavigationProp<'ServerSetup'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: translateNative('native.992d78618ce5a620'), headerShown: false });
  }, [navigation, titleLocale]);
  const { colors } = useTheme();
  const { setServerConnected, login } = useAuth();
  const { showToast } = useToast();
  const storedUrl = useServerStore(state => state.serverUrl);
  const [serverUrl, setServerUrl] = useState(storedUrl ?? '');
  const [error, setError] = useNativeMessageState('');

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
      showToast(nativeMessage('native.9065f81fe5b7eb53'), 'success');
      // RootNavigator automatically handles navigation based on auth state
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message || nativeMessage('native.55719db16dfe438e'));
      showToast(nativeMessage('native.df9a9d2cedce22b6'), 'error');
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
            translateNative('native.f492ddb542e57130'),
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
      showToast(nativeMessage('native.9467d8471c5bbd03'), 'success');
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message || nativeMessage('native.1760122192f776c5'));
      showToast(nativeMessage('native.87328f4a81f3980a'), 'error');
    },
  });

  const busy = connectMutation.isPending || demoMutation.isPending;

  /** Shows a demo mode confirmation dialog before connecting. */
  function handleDemo() {
    Alert.alert(
      translateNative('native.92b556c76ada2257'),
      translateNative('native.4ebb1acebcd8f536'),
      [
        { get text() { return translateNative('common.cancel'); }, style: 'cancel' },
        {
          get text() { return translateNative('native.3bc5f77ba542ea87'); },
          style: 'destructive',
          onPress: () => void demoMutation.mutate(),
        },
      ],
    );
  }

  /** Initiates connection, showing a warning if the URL uses plain HTTP */
  function handleConnect() {
    const normalized = normalizeUrl(serverUrl);
    if (isInsecureUrl(normalized)) {
      Alert.alert(
        translateNative('native.5aab1d54c4e71f40'),
        translateNative('native.9d8d9534c518bca4'),
        [
          { get text() { return translateNative('common.cancel'); }, style: 'cancel' },
          {
            get text() { return translateNative('native.4d36e2e601c11a70'); },
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
          {translateNative('native.5c4db6d9e74be876')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {translateNative('native.868cbc8ebae6e3f1')}</Text>
        <TextField
          label={translateNative('native.301fd81a82ae3258')}
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
            {translateNative('native.5192dddfd9302eb9')}</Text>
        ) : null}
        {error ? (
          <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
        ) : null}
        <PrimaryButton
          label={translateNative('native.5fde9a627feaf209')}
          onPress={() => navigation.navigate('Scanner', { mode: 'server' })}
          variant="secondary"
          disabled={busy}
        />
        <PrimaryButton
          label={connectMutation.isPending ? translateNative('native.ca729717d0f94e46') : translateNative('common.connect')}
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
              {translateNative('native.28f6ee3360c9d1e8')}</Text>
            <PrimaryButton
              label={
                demoMutation.isPending ? translateNative('native.d37028b8c42b6555') : translateNative('native.b09aabd1e0e9bcd2')
              }
              onPress={handleDemo}
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
