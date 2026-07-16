import React from 'react';
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
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { SectionCard, StatusBadge } from '@/components/common/AppUI';
import {
  EmptyState,
  ErrorState,
  LoadingScreen,
} from '@/components/common/StateScreens';
import {
  formatDateTime,
  pickArray,
  pickBoolean,
  pickId,
  pickString,
  statusColor,
  type ApiRecord,
} from '@/utils/data';

function extractLogEntries(data: unknown): ApiRecord[] {
  if (Array.isArray(data))
    return data.filter(
      (item): item is ApiRecord => typeof item === 'object' && item !== null,
    );
  return pickArray(data, ['items', 'entries', 'results']).filter(
    (item): item is ApiRecord => typeof item === 'object' && item !== null,
  );
}

export default function NotificationsScreen() {
  const navigation = useNavigation<any>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Notifications' });
  }, [navigation]);
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const providersQuery = useQuery({
    queryKey: ['notificationProviders'],
    queryFn: () => api.getNotificationProviders(),
  });
  const logQuery = useQuery({
    queryKey: ['notificationLog'],
    queryFn: () => api.getNotificationLog({ limit: 20 }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      api.updateNotificationProvider(id, { enabled }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['notificationProviders'],
      });
      showToast('Notification provider updated.', 'success');
    },
    onError: () => showToast('Unable to update provider.', 'error'),
  });

  const refreshAll = async () => {
    await Promise.all([providersQuery.refetch(), logQuery.refetch()]);
  };

  if (providersQuery.isLoading) {
    return <LoadingScreen message="Loading notification settings…" />;
  }

  if (providersQuery.isError) {
    return (
      <ErrorState
        message="Unable to load notification settings."
        onRetry={() => void refreshAll()}
      />
    );
  }

  const providers = (providersQuery.data ?? []) as ApiRecord[];
  const logEntries = extractLogEntries(logQuery.data);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={providersQuery.isRefetching || logQuery.isRefetching}
          onRefresh={() => void refreshAll()}
          tintColor={colors.accent}
        />
      }
    >
      <SectionCard
        title="Providers"
        subtitle="Manage delivery targets for Bambuddy notifications."
      >
        {providers.length > 0 ? (
          providers.map(provider => {
            const enabled = pickBoolean(
              provider,
              ['enabled', 'is_enabled'],
              false,
            );
            const status = enabled ? 'enabled' : 'disabled';
            return (
              <View
                key={pickId(provider)}
                style={[
                  styles.providerRow,
                  { borderBottomColor: colors.borderSubtle },
                ]}
              >
                <View style={styles.providerText}>
                  <Text style={[styles.providerTitle, { color: colors.text }]}>
                    {pickString(provider, ['name', 'type'], 'Provider')}
                  </Text>
                  <Text
                    style={[
                      styles.providerMeta,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {pickString(
                      provider,
                      ['type', 'provider_type'],
                      'Unknown type',
                    )}
                  </Text>
                </View>
                <View style={styles.providerActions}>
                  <StatusBadge
                    label={status}
                    color={statusColor(status, colors)}
                  />
                  <Switch
                    value={enabled}
                    onValueChange={value =>
                      void toggleMutation.mutateAsync({
                        id: Number(pickId(provider)),
                        enabled: value,
                      })
                    }
                    trackColor={{
                      false: colors.surfaceHover,
                      true: colors.accent,
                    }}
                    thumbColor={colors.text}
                  />
                </View>
              </View>
            );
          })
        ) : (
          <EmptyState
            icon="🔔"
            title="No providers configured"
            message="Add a provider from the Bambuddy web app to receive alerts here."
          />
        )}
      </SectionCard>

      <SectionCard title="Recent Notification Log">
        {logEntries.length > 0 ? (
          logEntries.map(entry => {
            const state = pickString(entry, ['status', 'result'], 'sent');
            return (
              <View
                key={pickId(entry)}
                style={[
                  styles.logRow,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.logHeader}>
                  <Text style={[styles.providerTitle, { color: colors.text }]}>
                    {pickString(
                      entry,
                      ['provider_name', 'provider', 'type'],
                      'Notification',
                    )}
                  </Text>
                  <StatusBadge
                    label={state}
                    color={statusColor(state, colors)}
                  />
                </View>
                <Text
                  style={[styles.providerMeta, { color: colors.textSecondary }]}
                >
                  {pickString(
                    entry,
                    ['message', 'subject'],
                    'No message content',
                  )}
                </Text>
                <Text
                  style={[styles.providerMeta, { color: colors.textTertiary }]}
                >
                  {formatDateTime(pickString(entry, ['created_at', 'sent_at']))}
                </Text>
              </View>
            );
          })
        ) : (
          <Text style={[styles.providerMeta, { color: colors.textSecondary }]}>
            No notification events have been recorded yet.
          </Text>
        )}
      </SectionCard>
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
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  providerText: { flex: 1, gap: spacing.xs },
  providerTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  providerMeta: { fontSize: fontSize.sm },
  providerActions: { alignItems: 'flex-end', gap: spacing.sm },
  logRow: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
});
