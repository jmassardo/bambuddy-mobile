import { useNativeLocale, useTranslation } from '@/i18n';
import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { systemApi } from '@/api/system';
import {
  PrimaryButton,
  SectionCard,
  TextField,
} from '@/components/common/AppUI';
import { OptionChipsField, SwitchRow } from '@/components/settings/shared';
import { confirmBackupAction } from '@/components/settings/backupWorkflow';
import { useTheme } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { spacing } from '@/theme/tokens';

export function ApplicationLogTools() {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const client = useQueryClient();
  const scroll = useRef<ScrollView>(null);
  const [level, setLevel] = useState('ALL');
  const [search, setSearch] = useState('');
  const [live, setLive] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState('200');
  const logs = useQuery({
    queryKey: ['applicationLogs', level, search, limit],
    queryFn: () =>
      systemApi.getSupportLogs({
        limit: Math.min(1000, Math.max(1, Number(limit) || 200)),
        level: level === 'ALL' ? undefined : level,
        search: search || undefined,
      }),
    refetchInterval: live ? 3000 : false,
  });
  const clear = useMutation({
    mutationFn: systemApi.clearSupportLogs,
    onSuccess: async () => {
      setExpanded(new Set());
      await client.invalidateQueries({ queryKey: ['applicationLogs'] });
    },
  });
  return (
    <SectionCard
      title={t('system.logs.title', { defaultValue: 'Application logs' })}
    >
      <TextField
        label={t('system.logs.search', {
          defaultValue: 'Search messages or logger',
        })}
        value={search}
        onChangeText={setSearch}
      />
      <PrimaryButton
        label={t('system.logs.clearSearch', { defaultValue: 'Clear search' })}
        variant="secondary"
        onPress={() => setSearch('')}
      />
      <OptionChipsField
        label={t('system.logs.level', { defaultValue: 'Log level' })}
        value={level}
        options={['ALL', 'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'].map(
          key => ({ key, label: key }),
        )}
        onChange={setLevel}
      />
      <TextField
        label={t('system.logs.limit', {
          defaultValue: 'Recent records (1–1000, server maximum)',
        })}
        value={limit}
        keyboardType="number-pad"
        onChangeText={setLimit}
      />
      <SwitchRow
        label={t('system.logs.live', { defaultValue: 'Live refresh' })}
        value={live}
        onValueChange={setLive}
      />
      <SwitchRow
        label={t('system.logs.autoScroll', {
          defaultValue: 'Auto-scroll to newest record',
        })}
        value={autoScroll}
        onValueChange={setAutoScroll}
      />
      <PrimaryButton
        label={t('system.logs.refresh', { defaultValue: 'Refresh logs' })}
        variant="secondary"
        onPress={() => {
          void logs.refetch();
        }}
        loading={logs.isFetching}
      />
      {hasPermission('settings:update') ? (
        <PrimaryButton
          label={t('system.logs.clear', {
            defaultValue: 'Clear server log buffer',
          })}
          variant="danger"
          loading={clear.isPending}
          onPress={() =>
            confirmBackupAction(
              t('system.logs.clearConfirm', {
                defaultValue: 'Clear application logs?',
              }),
              t('system.logs.clearWarning', {
                defaultValue:
                  'This permanently clears the server log file for every user.',
              }),
              () => clear.mutate(),
              t,
            )
          }
        />
      ) : null}
      {logs.error || clear.error ? (
        <Text style={{ color: colors.error }}>
          {logs.error?.message ?? clear.error?.message}
        </Text>
      ) : null}
      <Text style={{ color: colors.textSecondary }}>
        {t('system.logs.count', {
          defaultValue:
            '{{shown}} matching records returned · {{total}} total file records',
          shown: logs.data?.filtered_count ?? 0,
          total: logs.data?.total_in_file ?? 0,
        })}
      </Text>
      <ScrollView
        ref={scroll}
        nestedScrollEnabled
        style={styles.logWindow}
        onContentSizeChange={() => {
          if (autoScroll) scroll.current?.scrollToEnd({ animated: false });
        }}
      >
        {!logs.isLoading && logs.data?.entries.length === 0 ? (
          <Text style={{ color: colors.textSecondary }}>
            {t('system.logs.empty', {
              defaultValue: 'No matching log records.',
            })}
          </Text>
        ) : null}
        {logs.data?.entries
          .slice()
          .reverse()
          .map((entry, index) => {
            const key = `${entry.timestamp}:${entry.logger_name}:${index}`;
            const multiline = entry.message.includes('\n');
            return (
              <View key={key} style={styles.entry}>
                <Text selectable style={{ color: colors.textSecondary }}>
                  {entry.timestamp} [{entry.level}] {entry.logger_name}
                </Text>
                <Text selectable style={{ color: colors.text }}>
                  {expanded.has(key)
                    ? entry.message
                    : entry.message.split('\n')[0]}
                </Text>
                {multiline ? (
                  <PrimaryButton
                    label={
                      expanded.has(key)
                        ? t('system.logs.collapse', {
                            defaultValue: 'Collapse record',
                          })
                        : t('system.logs.expand', {
                            defaultValue: 'Expand multiline record',
                          })
                    }
                    variant="secondary"
                    onPress={() =>
                      setExpanded(current => {
                        const next = new Set(current);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      })
                    }
                  />
                ) : null}
              </View>
            );
          })}
      </ScrollView>
    </SectionCard>
  );
}
const styles = StyleSheet.create({
  logWindow: { maxHeight: 450 },
  entry: { gap: spacing.xs, marginBottom: spacing.md },
});
