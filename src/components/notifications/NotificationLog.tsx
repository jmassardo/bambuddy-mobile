import { useNativeLocale, useTranslation } from '@/i18n';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '@/api/settings';
import { Button, Card, SectionHeader } from '@/components/common/AppUI';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useAuth } from '@/contexts/AuthContext';

import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import type { NotificationLogEntry } from '@/types/api';
import { NotificationChoices, NotificationToggle } from './ProviderEditorFields';

export function NotificationLog() {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const client = useQueryClient();
  const [days, setDays] = useState(7);
  const [failedOnly, setFailedOnly] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const logs = useInfiniteQuery({
    queryKey: ['notificationLog', days, failedOnly], initialPageParam: 0,
    queryFn: ({ pageParam }) => settingsApi.getNotificationLog({
      days, success: failedOnly ? false : undefined, limit: 100, offset: pageParam,
    }),
    getNextPageParam: (page, pages) => page.length === 100 ? pages.reduce((sum, items) => sum + items.length, 0) : undefined,
  });
  const stats = useQuery({
    queryKey: ['notificationLogStats', days], queryFn: () => settingsApi.getNotificationLogStats(days),
  });
  const clear = useMutation({
    mutationFn: () => settingsApi.clearNotificationLogs(30),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['notificationLog'] }),
        client.invalidateQueries({ queryKey: ['notificationLogStats'] }),
      ]);
      setClearing(false);
    },
  });
  const entries = (logs.data?.pages.flat() ?? []) as unknown as NotificationLogEntry[];
  return (
    <Card>
      <SectionHeader title={t('notifications.log', { defaultValue: 'Notification delivery log' })} />
      <View style={styles.group}>
        <NotificationChoices label={t('notifications.historyDays', { defaultValue: 'History (days)' })}
          value={String(days)} choices={['1', '7', '14', '30', '90']} onChange={value => { setDays(Number(value)); setExpanded(null); }} />
        <NotificationToggle label={t('notifications.failedOnly', { defaultValue: 'Failed deliveries only' })}
          value={failedOnly} onChange={value => { setFailedOnly(value); setExpanded(null); }} />
        <View style={styles.actions}>
          <Button title={t('common.refresh', { defaultValue: 'Refresh' })} size="sm" variant="secondary"
            disabled={logs.isRefetching} onPress={() => { void logs.refetch(); void stats.refetch(); }} />
          {hasPermission('notifications:delete') ? <Button title={t('notifications.clearOld', { defaultValue: 'Clear logs older than 30 days' })}
            variant="danger" size="sm" onPress={() => setClearing(true)} /> : null}
        </View>
        {stats.data ? <Text style={{ color: colors.textSecondary }}>{t('notifications.logStats', {
          defaultValue: '{{total}} deliveries · {{sent}} sent · {{failed}} failed',
          total: Number(stats.data.total ?? 0), sent: Number(stats.data.success_count ?? 0), failed: Number(stats.data.failure_count ?? 0),
        })}</Text> : null}
        {logs.isLoading ? <Text style={{ color: colors.textSecondary }}>{t('common.loading', { defaultValue: 'Loading…' })}</Text> : null}
        {logs.error || clear.error ? <Text style={{ color: colors.error }}>{(logs.error ?? clear.error)?.message}</Text> : null}
        {!logs.isLoading && !logs.error && entries.length === 0 ? <Text style={{ color: colors.textSecondary }}>{t('notifications.noLogs', { defaultValue: 'No deliveries match these filters.' })}</Text> : null}
        {entries.map(entry => (
          <View key={entry.id} style={[styles.entry, { borderColor: colors.border }]}>
            <Text style={{ color: entry.success ? colors.success : colors.error }}>
              {entry.event_type} · {entry.success ? t('notifications.sent', { defaultValue: 'Sent' }) : t('notifications.failed', { defaultValue: 'Failed' })}
            </Text>
            <Text style={{ color: colors.textSecondary }}>{entry.created_at} · {entry.provider_name ?? entry.provider_type}</Text>
            <Text style={{ color: colors.text }} numberOfLines={expanded === entry.id ? undefined : 2}>{entry.title}</Text>
            <Button title={expanded === entry.id ? t('common.collapse', { defaultValue: 'Collapse' }) : t('notifications.inspect', { defaultValue: 'Inspect delivery' })}
              variant="secondary" size="sm" onPress={() => setExpanded(current => current === entry.id ? null : entry.id)} />
            {expanded === entry.id ? (
              <View style={styles.group}>
                <Text selectable style={{ color: colors.text }}>{entry.message}</Text>
                {entry.error_message ? <Text selectable style={{ color: colors.error }}>{entry.error_message}</Text> : null}
                <Text selectable style={{ color: colors.textSecondary }}>{t('notifications.deliveryMetadata', {
                  defaultValue: 'Delivery #{{id}} · Provider #{{provider}} ({{type}}) · Printer {{printer}} (#{{printerId}}) · {{time}}',
                  id: entry.id, provider: entry.provider_id, type: entry.provider_type ?? '',
                  printer: entry.printer_name ?? '—', printerId: entry.printer_id ?? '—', time: entry.created_at,
                })}</Text>
              </View>
            ) : null}
          </View>
        ))}
        {logs.hasNextPage ? <Button title={t('common.loadMore', { defaultValue: 'Load more' })}
          disabled={logs.isFetchingNextPage} loading={logs.isFetchingNextPage} onPress={() => { void logs.fetchNextPage(); }} /> : null}
      </View>
      <ConfirmModal visible={clearing} onClose={() => setClearing(false)} onConfirm={() => clear.mutate()}
        title={t('notifications.clearLog', { defaultValue: 'Clear old notification logs' })}
        message={t('notifications.clearLogConfirm', { defaultValue: 'Permanently delete delivery logs older than 30 days? Recent history will be retained.' })}
        confirmLabel={t('common.delete', { defaultValue: 'Delete' })} loading={clear.isPending} />
    </Card>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  entry: { borderWidth: 1, padding: spacing.md, gap: spacing.sm },
});
