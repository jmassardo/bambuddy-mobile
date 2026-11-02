import { nativeLabelTuple, nativeMessage, translateNative, useNativeLocale, useTranslation } from '@/i18n';


import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button, Card, SectionHeader } from '@/components/common/AppUI';
import { LoadingScreen, ErrorState } from '@/components/common/StateScreens';
import { BedCooledThreshold } from '@/components/notifications/BedCooledThreshold';
import { NotificationLog } from '@/components/notifications/NotificationLog';
import { NotificationProviders } from '@/components/notifications/NotificationProviders';
import { NotificationTemplates } from '@/components/notifications/NotificationTemplates';
import { NotificationToggle } from '@/components/notifications/ProviderEditorFields';
import { useAuth } from '@/contexts/AuthContext';
import { usePushNotification } from '@/contexts/PushNotificationContext';
import { useToast } from '@/contexts/ToastContext';

import type { RootNavigationProp } from '@/navigation/types';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import { pickBoolean } from '@/utils/data';

const PREFERENCES = [
  nativeLabelTuple(['notify_print_start', 'Print started']),
  nativeLabelTuple(['notify_print_complete', 'Print completed']),
  nativeLabelTuple(['notify_print_failed', 'Print failed']),
  nativeLabelTuple(['notify_print_stopped', 'Print stopped']),
] as const;
type PreferenceState = Record<typeof PREFERENCES[number][0], boolean>;
const DEFAULT_PREFERENCES: PreferenceState = {
  notify_print_start: false, notify_print_complete: false, notify_print_failed: true, notify_print_stopped: true,
};

export default function NotificationsScreen() {
  const titleLocale = useNativeLocale();
  const navigation = useNavigation<RootNavigationProp<'Notifications'>>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const { showToast } = useToast();
  const client = useQueryClient();
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [dirty, setDirty] = useState(false);
  React.useLayoutEffect(() => { navigation.setOptions({ title: translateNative('notifications.title', { defaultValue: 'Notifications' }) }); }, [navigation, t, titleLocale]);
  const auth = useQuery({ queryKey: ['advancedAuthStatus'], queryFn: () => api.getAdvancedAuthStatus() });
  const settings = useQuery({ queryKey: useServerSettingsKey(), queryFn: () => api.getSettings() });
  const personal = useQuery({ queryKey: ['userEmailPreferences'], queryFn: () => api.getUserEmailPreferences() });
  useEffect(() => {
    if (personal.data && !dirty) {
      setPreferences(Object.fromEntries(PREFERENCES.map(([key]) => [key, pickBoolean(personal.data, [key])])) as PreferenceState);
    }
  }, [personal.data, dirty]);
  const save = useMutation({
    mutationFn: () => api.updateUserEmailPreferences(preferences),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['userEmailPreferences'] });
      setDirty(false);
      showToast(nativeMessage('notifications.preferencesSaved', () => ({ defaultValue: 'Email notification preferences saved.' })), 'success');
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const refresh = async () => {
    await Promise.all([
      auth.refetch(), settings.refetch(), personal.refetch(),
      ...['notificationProviders', 'notificationLog', 'notificationLogStats', 'notificationTemplates'].map(key =>
        client.invalidateQueries({ queryKey: [key] })),
    ]);
  };
  const available = pickBoolean(auth.data, ['advanced_auth_enabled']) && pickBoolean(settings.data, ['user_notifications_enabled']);
  return (
    <ScrollView automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" style={[styles.screen, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={auth.isRefetching || settings.isRefetching || personal.isRefetching}
        onRefresh={() => { void refresh(); }} tintColor={colors.accent} />}>
      {hasPermission('notifications:read') ? <NotificationProviders /> : null}
      {hasPermission('settings:update') ? <Card><BedCooledThreshold /></Card> : null}
      {hasPermission('notifications:read') ? <NotificationLog /> : null}
      {hasPermission('notification_templates:read') ? <NotificationTemplates /> : null}
      <PushNotificationToggleCard />
      <Card>
        <SectionHeader title={t('notifications.emailPreferences', { defaultValue: 'Personal email notification preferences' })} />
        {auth.isLoading || settings.isLoading || personal.isLoading ? <LoadingScreen inline /> : auth.error || settings.error || personal.error ? <ErrorState
          message={t('notifications.loadError', { defaultValue: 'Unable to load notification settings.' })} onRetry={() => { void refresh(); }} /> : !available ? (
          <View style={styles.group}>
            <Text style={{ color: colors.textSecondary }}>{t('notifications.emailUnavailable', {
              defaultValue: 'Enable advanced authentication and user email notifications in Settings to manage per-user email alerts.',
            })}</Text>
            <Button title={t('notifications.openSettings', { defaultValue: 'Open Settings' })} onPress={() => navigation.navigate('Settings')} />
          </View>
        ) : (
          <View style={styles.group}>
            <Text style={{ color: colors.textSecondary }}>{user?.email
              ? t('notifications.emailDestination', { defaultValue: 'Notifications will be sent to {{email}}.', email: user.email })
              : t('notifications.noEmail', { defaultValue: 'Add an email address to your account to receive notification emails.' })}</Text>
            {PREFERENCES.map(([key, title]) => (
              <View key={key} style={styles.row}>
                <Text style={[styles.label, { color: colors.text }]}>{t(`notifications.personal.${key}`, { defaultValue: title })}</Text>
                <Switch accessibilityLabel={t(`notifications.personal.${key}`, { defaultValue: title })}
                  value={preferences[key]} disabled={!user?.email} onValueChange={value => {
                    setPreferences(current => ({ ...current, [key]: value })); setDirty(true);
                  }} />
              </View>
            ))}
            <Text style={{ color: colors.textSecondary }}>{t('notifications.emailSummary', {
              defaultValue: '{{count}} of 4 email alerts enabled.', count: Object.values(preferences).filter(Boolean).length,
            })}</Text>
            <Button title={t('notifications.savePreferences', { defaultValue: 'Save preferences' })}
              disabled={!dirty || !user?.email || save.isPending} loading={save.isPending} onPress={() => save.mutate()} />
          </View>
        )}
      </Card>
    </ScrollView>
  );
}

function PushNotificationToggleCard() {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { state, enablePushNotifications, disablePushNotifications, requestPermission } = usePushNotification();
  const [pending, setPending] = useState(false);
  const toggle = async (value: boolean) => {
    setPending(true);
    try {
      if (!value) await disablePushNotifications();
      else if (await requestPermission()) await enablePushNotifications();
    } catch (error) {
      showToast(error instanceof Error ? error.message : nativeMessage('notifications.pushError', () => ({ defaultValue: 'Unable to change push notifications.' })), 'error');
    } finally { setPending(false); }
  };
  return (
    <Card>
      <SectionHeader title={t('notifications.push', { defaultValue: 'Push notifications' })} />
      <View style={styles.group}>
        {state.error ? <Text style={{ color: colors.error }}>{state.error}</Text> : null}
        {pending || state.loading ? <Text style={{ color: colors.textSecondary }}>{t('common.loading', { defaultValue: 'Loading…' })}</Text>
          : <NotificationToggle label={t('notifications.enablePush', { defaultValue: 'Enable device push notifications' })}
            value={state.enabled || state.status === 'enabled'} onChange={value => { void toggle(value); }} />}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { padding: spacing.lg, paddingBottom: spacing['3xl'], gap: spacing.lg },
  group: { gap: spacing.md }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, label: { flex: 1 },
});
import { useServerSettingsKey } from '@/hooks/useServerSettingsKey';
