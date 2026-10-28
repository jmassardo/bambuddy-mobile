import { useNativeLocale, useTranslation } from '@/i18n';
import React, { useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { printerFleetApi } from '@/api/printerFleet';
import { PrimaryButton, SearchBar } from '@/components/common/AppUI';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';

import type { FleetMQTTLogs } from '@/types/api';

export function filterMQTTLogs(
  logs: FleetMQTTLogs['logs'],
  search: string,
  direction: 'all' | 'in' | 'out',
) {
  const term = search.toLowerCase();
  return logs.filter(
    log =>
      (direction === 'all' || log.direction === direction) &&
      `${log.topic} ${JSON.stringify(log.payload)}`
        .toLowerCase()
        .includes(term),
  );
}

export function MQTTConsole({ printerId }: { printerId: number }) {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canControl = hasPermission('printers:control');
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState<'all' | 'in' | 'out'>('all');
  const [tail, setTail] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const scroll = useRef<ScrollView>(null);
  const logs = useQuery({
    queryKey: ['mqttConsole', printerId],
    queryFn: () => printerFleetApi.logs(printerId),
    enabled: hasPermission('printers:read'),
    refetchInterval: tail ? 2000 : false,
  });
  const operation = useMutation({
    mutationFn: (action: 'enable' | 'disable' | 'clear') => {
      if (action === 'enable') return api.enableMQTTLogging(printerId);
      if (action === 'disable') return api.disableMQTTLogging(printerId);
      return api.clearMQTTLogs(printerId);
    },
    onSuccess: () => {
      void logs.refetch();
    },
  });
  return (
    <View style={styles.content}>
      <Text style={{ color: colors.text }}>
        {logs.data?.logging_enabled
          ? t('fleet.loggingOn', { defaultValue: 'MQTT logging enabled' })
          : t('fleet.loggingOff', { defaultValue: 'MQTT logging disabled' })}
      </Text>
      <PrimaryButton
        disabled={!canControl || operation.isPending || !logs.data}
        label={
          logs.data?.logging_enabled
            ? t('fleet.disableLogging', { defaultValue: 'Disable logging' })
            : t('fleet.enableLogging', { defaultValue: 'Enable logging' })
        }
        onPress={() =>
          operation.mutate(logs.data?.logging_enabled ? 'disable' : 'enable')
        }
      />
      <PrimaryButton
        disabled={!canControl || operation.isPending}
        variant="danger"
        label={t('fleet.clearLogs', { defaultValue: 'Clear logs' })}
        onPress={() =>
          Alert.alert(
            t('fleet.clearLogs', { defaultValue: 'Clear logs' }),
            t('fleet.clearLogsConfirm', {
              defaultValue: 'Permanently clear captured messages?',
            }),
            [
              {
                text: t('common.cancel', { defaultValue: 'Cancel' }),
                style: 'cancel',
              },
              {
                text: t('common.confirm', { defaultValue: 'Confirm' }),
                onPress: () => operation.mutate('clear'),
              },
            ],
          )
        }
      />
      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder={t('fleet.searchMessages', {
          defaultValue: 'Search topics and payloads',
        })}
      />
      <View style={styles.row}>
        {(['all', 'in', 'out'] as const).map(value => (
          <PrimaryButton
            key={value}
            label={t(`fleet.direction.${value}`, {
              defaultValue:
                value === 'all'
                  ? 'All'
                  : value === 'in'
                  ? 'Inbound'
                  : 'Outbound',
            })}
            variant={direction === value ? 'primary' : 'secondary'}
            onPress={() => setDirection(value)}
          />
        ))}
      </View>
      <PrimaryButton
        variant="secondary"
        label={
          tail
            ? t('fleet.pauseTail', { defaultValue: 'Pause live tail' })
            : t('fleet.liveTail', { defaultValue: 'Resume live tail' })
        }
        onPress={() => setTail(!tail)}
      />
      <PrimaryButton
        variant="secondary"
        loading={logs.isFetching}
        label={t('common.refresh', { defaultValue: 'Refresh' })}
        onPress={() => {
          void logs.refetch();
        }}
      />
      {logs.error || operation.error ? (
        <Text accessibilityRole="alert" style={{ color: colors.error }}>
          {(operation.error || logs.error)?.message}
        </Text>
      ) : null}
      <ScrollView
        ref={scroll}
        style={styles.messages}
        onContentSizeChange={() => {
          if (tail) scroll.current?.scrollToEnd();
        }}
      >
        {filterMQTTLogs(logs.data?.logs ?? [], search, direction).map(
          (log, index) => {
            const key = `${log.timestamp}:${index}`;
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityState={{ expanded: expanded.has(key) }}
                onPress={() =>
                  setExpanded(current => {
                    const next = new Set(current);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  })
                }
                style={styles.message}
              >
                <Text
                  style={{ color: colors.text }}
                >{`${log.timestamp} ${log.direction} ${log.topic}`}</Text>
                {expanded.has(key) ? (
                  <Text selectable style={{ color: colors.textSecondary }}>
                    {JSON.stringify(log.payload, null, 2)}
                  </Text>
                ) : null}
              </Pressable>
            );
          },
        )}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  content: { gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  messages: { maxHeight: 360 },
  message: { paddingVertical: spacing.sm },
});
