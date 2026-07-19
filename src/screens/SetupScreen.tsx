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
import { api, setAuthToken } from '@/api/client';
import { useAuth, type UserResponse } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { PrimaryButton, TextField } from '@/components/common/AppUI';
import type { AppNavigationProp } from '@/navigation/types';

export default function SetupScreen() {
  const navigation = useNavigation<AppNavigationProp>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Setup' });
  }, [navigation]);
  const { colors } = useTheme();
  const { requiresSetup, loginWithToken } = useAuth();
  const { showToast } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!requiresSetup) {
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
  }, [requiresSetup, navigation]);

  const setupMutation = useMutation({
    mutationFn: async () => {
      setError('');
      if (password !== confirm) {
        throw new Error('Passwords do not match.');
      }
      const response = await api.setupAuth({
        username: username.trim(),
        password,
      });
      await setAuthToken(response.access_token);
      const currentUser = (await api.getCurrentUser()) as UserResponse;
      loginWithToken(response.access_token, currentUser);
      return response;
    },
    onSuccess: () => {
      showToast('Setup complete. Welcome to Bambuddy!', 'success');
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    },
    onError: (mutationError: Error) =>
      setError(mutationError.message || 'Setup failed.'),
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
        <Text style={[styles.title, { color: colors.text }]}>
          Welcome to Bambuddy
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Create the first administrator account to finish setup.
        </Text>
        <TextField
          label="Admin username"
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
        <TextField
          label="Confirm password"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
        />
        {error ? (
          <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
        ) : null}
        <PrimaryButton
          label={setupMutation.isPending ? 'Setting up…' : 'Complete setup'}
          onPress={() => void setupMutation.mutateAsync()}
          loading={setupMutation.isPending}
          disabled={
            username.trim().length === 0 ||
            password.length === 0 ||
            confirm.length === 0
          }
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
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    fontSize: fontSize.base,
    lineHeight: 22,
  },
  error: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
});
