import React, { useEffect, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button, Card, SectionHeader } from '@/components/common/UIComponents';
import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { pickBoolean } from '@/utils/data';

const PREFERENCE_ROWS = [
  {
    key: 'notify_print_start',
    title: 'Print started',
    description: 'Get an email when a print begins.',
  },
  {
    key: 'notify_print_complete',
    title: 'Print completed',
    description: 'Get an email when a print finishes successfully.',
  },
  {
    key: 'notify_print_failed',
    title: 'Print failed',
    description: 'Get an email when a print fails or errors.',
  },
  {
    key: 'notify_print_stopped',
    title: 'Print stopped',
    description: 'Get an email when a print is stopped manually.',
  },
] as const;

type PreferenceKey = (typeof PREFERENCE_ROWS)[number]['key'];
type PreferenceState = Record<PreferenceKey, boolean>;

const DEFAULT_PREFERENCES: PreferenceState = {
  notify_print_start: false,
  notify_print_complete: false,
  notify_print_failed: true,
  notify_print_stopped: true,
};

export default function NotificationsScreen() {
  const navigation = useNavigation<any>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Notifications' });
  }, [navigation]);

  const { colors } = useTheme();
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [preferences, setPreferences] = useState<PreferenceState>(DEFAULT_PREFERENCES);
  const [dirty, setDirty] = useState(false);

  const advancedAuthQuery = useQuery({
    queryKey: ['advancedAuthStatus'],
    queryFn: () => api.getAdvancedAuthStatus(),
  });
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
  });
  const preferencesQuery = useQuery({
    queryKey: ['userEmailPreferences'],
    queryFn: () => api.getUserEmailPreferences(),
  });

  useEffect(() => {
    if (!preferencesQuery.data) return;
    setPreferences({
      notify_print_start: pickBoolean(preferencesQuery.data, ['notify_print_start']),
      notify_print_complete: pickBoolean(preferencesQuery.data, ['notify_print_complete']),
      notify_print_failed: pickBoolean(preferencesQuery.data, ['notify_print_failed']),
      notify_print_stopped: pickBoolean(preferencesQuery.data, ['notify_print_stopped']),
    });
    setDirty(false);
  }, [preferencesQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => api.updateUserEmailPreferences(preferences),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['userEmailPreferences'] });
      setDirty(false);
      showToast('Email notification preferences saved.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Could not save preferences.', 'error'),
  });

  const refreshAll = async () => {
    await Promise.all([
      advancedAuthQuery.refetch(),
      settingsQuery.refetch(),
      preferencesQuery.refetch(),
    ]);
  };

  const notificationsEnabled = useMemo(
    () => pickBoolean(settingsQuery.data, ['user_notifications_enabled'], false),
    [settingsQuery.data],
  );
  const advancedAuthEnabled = useMemo(
    () => pickBoolean(advancedAuthQuery.data, ['advanced_auth_enabled'], false),
    [advancedAuthQuery.data],
  );

  if (advancedAuthQuery.isLoading || settingsQuery.isLoading || preferencesQuery.isLoading) {
    return <LoadingScreen message="Loading notification preferences…" />;
  }

  if (advancedAuthQuery.isError || settingsQuery.isError || preferencesQuery.isError) {
    return (
      <ErrorState
        message="Unable to load notification preferences."
        onRetry={() => void refreshAll()}
      />
    );
  }

  if (!advancedAuthEnabled || !notificationsEnabled) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}> 
        <EmptyState
          icon="🔔"
          title="Email notifications are unavailable"
          message="Enable advanced authentication and user email notifications in Settings to use this screen."
        />
        <View style={styles.emptyActions}>
          <Button title="Open Settings" onPress={() => navigation.navigate('Settings')} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={
            advancedAuthQuery.isRefetching ||
            settingsQuery.isRefetching ||
            preferencesQuery.isRefetching
          }
          onRefresh={() => void refreshAll()}
          tintColor={colors.accent}
        />
      }
    >
      <Card style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
        <SectionHeader title="Recipient" />
        <View style={styles.infoRow}>
          <View style={[styles.infoIcon, { backgroundColor: colors.accentBg }]}> 
            <Text style={[styles.infoEmoji, { color: colors.accent }]}>✉️</Text>
          </View>
          <View style={styles.infoText}>
            <Text style={[styles.infoTitle, { color: colors.text }]}>Email destination</Text>
            <Text style={[styles.infoDescription, { color: colors.textSecondary }]}> 
              {user?.email
                ? `Notifications will be sent to ${user.email}.`
                : 'Add an email address to your account to receive notification emails.'}
            </Text>
          </View>
        </View>
      </Card>

      <Card style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
        <SectionHeader title="Print job notifications" />
        {PREFERENCE_ROWS.map((row, index) => (
          <View
            key={row.key}
            style={[
              styles.preferenceRow,
              index < PREFERENCE_ROWS.length - 1 && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.borderSubtle,
              },
            ]}
          >
            <View style={styles.preferenceText}>
              <Text style={[styles.preferenceTitle, { color: colors.text }]}>{row.title}</Text>
              <Text style={[styles.preferenceDescription, { color: colors.textSecondary }]}>
                {row.description}
              </Text>
            </View>
            <Switch
              value={preferences[row.key]}
              onValueChange={(value) => {
                setPreferences(current => ({ ...current, [row.key]: value }));
                setDirty(true);
              }}
              trackColor={{ false: colors.surfaceHover, true: colors.accent }}
              thumbColor={colors.text}
              disabled={!user?.email}
            />
          </View>
        ))}
      </Card>

      <Card style={{ backgroundColor: colors.card, borderColor: colors.cardBorder }}>
        <SectionHeader title="Summary" />
        <Text style={[styles.summaryText, { color: colors.textSecondary }]}> 
          {Object.values(preferences).filter(Boolean).length} of {PREFERENCE_ROWS.length} email alerts enabled.
        </Text>
      </Card>

      <View style={styles.saveButtonWrap}>
        <Button
          title={saveMutation.isPending ? 'Saving…' : 'Save preferences'}
          onPress={() => void saveMutation.mutateAsync()}
          disabled={!dirty || !user?.email || saveMutation.isPending}
          loading={saveMutation.isPending}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  emptyActions: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  infoRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  infoIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoEmoji: {
    fontSize: 20,
  },
  infoText: {
    flex: 1,
    gap: spacing.xs,
  },
  infoTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  infoDescription: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  preferenceText: {
    flex: 1,
    gap: spacing.xs,
  },
  preferenceTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  preferenceDescription: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  summaryText: {
    marginTop: spacing.md,
    fontSize: fontSize.sm,
  },
  saveButtonWrap: {
    marginTop: spacing.sm,
  },
});
