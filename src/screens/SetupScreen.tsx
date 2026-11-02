import { nativeMessage, translateNative, useNativeLocale, useNativeMessageState, useTranslation } from '@/i18n';


import React, { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigationProp } from '@/navigation/types';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '@/api/auth';
import { useAuth } from '@/contexts/AuthContext';
import { SwitchRow } from '@/components/settings/shared';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { PrimaryButton, TextField } from '@/components/common/AppUI';

export default function SetupScreen() {
  const titleLocale = useNativeLocale();
  const { t } = useTranslation();
  const navigation = useNavigation<RootNavigationProp<'Setup'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: translateNative('native.6c92cbd87d3884af') });
  }, [navigation, titleLocale]);
  const { colors } = useTheme();
  const { requiresSetup, authEnabled, refreshAuth } = useAuth();
  const { showToast } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useNativeMessageState('');
  const [enableAuth, setEnableAuth] = useState(true);

  useEffect(() => {
    if (!requiresSetup) {
      navigation.reset({ index: 0, routes: authEnabled ? [{ name: 'Login' }] : [{ name: 'Main', params: { screen: 'Dashboard' } }] });
    }
  }, [requiresSetup, authEnabled, navigation]);

  const setupMutation = useMutation({
    mutationFn: async () => {
      setError('');
      if (enableAuth && password !== confirm) {
        throw new Error(translateNative('native.4bf243cf9137809e'));
      }
      const response = await authApi.setupAuth({
        auth_enabled: enableAuth,
        ...(enableAuth ? { admin_username: username.trim(), admin_password: password } : {}),
      });
      await refreshAuth();
      return response;
    },
    onSuccess: () => {
      showToast(nativeMessage('native.5c6f1b85bd5918c3'), 'success');
      navigation.reset({
        index: 0,
        routes: enableAuth ? [{ name: 'Login' }] : [{ name: 'Main', params: { screen: 'Dashboard' } }],
      });
    },
    onError: (mutationError: Error) =>
      setError(mutationError.message || nativeMessage('native.86ff382cd4ff4257')),
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
          {translateNative('native.236e1edae791445d')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('auth.setupHint', { defaultValue: 'Enable authentication to protect this server, or continue without it on a trusted network.' })}
        </Text>
        <SwitchRow label={t('auth.enableAuthentication', { defaultValue: 'Enable authentication' })} value={enableAuth} onValueChange={setEnableAuth} disabled={setupMutation.isPending} />
        {enableAuth ? <>
        <TextField
          label={translateNative('native.637a9d111395d155')}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
        <TextField
          label={translateNative('native.08c9c68cc706272f')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TextField
          label={translateNative('native.40d2f662e19a7553')}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
        />
        </> : null}
        {error ? (
          <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
        ) : null}
        <PrimaryButton
          label={setupMutation.isPending ? translateNative('native.e42a301a43de2313') : translateNative('native.fa6af23f0eac1db6')}
          onPress={() => setupMutation.mutate()}
          loading={setupMutation.isPending}
          disabled={
            enableAuth && (username.trim().length === 0 ||
            password.length === 0 ||
            confirm.length === 0)
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
