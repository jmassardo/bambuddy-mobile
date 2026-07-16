import React, { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useServerStore } from '@/api/server';
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
  const navigation = useNavigation<any>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Server', headerShown: false });
  }, [navigation]);
  const { colors } = useTheme();
  const { setServerConnected } = useAuth();
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
    onSuccess: status => {
      showToast('Connected to Bambuddy server.', 'success');
      if (status.requires_setup) {
        navigation.reset({ index: 0, routes: [{ name: 'Setup' }] });
        return;
      }
      if (status.auth_enabled) {
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        return;
      }
      navigation.reset({ index: 0, routes: [{ name: 'Dashboard' }] });
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message || 'Could not connect to that server.');
      showToast('Connection failed.', 'error');
    },
  });

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
        <Text style={[styles.logo, { color: colors.accentLight }]}>
          Bambuddy
        </Text>
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
        {error ? (
          <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
        ) : null}
        <PrimaryButton
          label="Scan QR Code"
          onPress={() => navigation.navigate('Scanner', { mode: 'server' })}
          variant="secondary"
        />
        <PrimaryButton
          label={connectMutation.isPending ? 'Connecting…' : 'Connect'}
          onPress={() => void connectMutation.mutateAsync()}
          loading={connectMutation.isPending}
          disabled={serverUrl.trim().length === 0}
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
});
