import { translateNative, useNativeLocale, useTranslation } from '@/i18n';

import React from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RootNavigationProp } from '@/navigation/types';
import { systemApi } from '@/api/system';
import { PrimaryButton, SectionCard } from '@/components/common/AppUI';
import { SwitchRow } from '@/components/settings/shared';
import { ApplicationLogTools } from '@/components/system/ApplicationLogTools';
import { BugReportTools } from '@/components/system/BugReportTools';
import { ServerUpdateTools } from '@/components/system/ServerUpdateTools';
import { SystemHealthPanel } from '@/components/system/SystemHealthPanel';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import { useAuth } from '@/contexts/AuthContext';

import { shareBlob } from '@/utils/share';

function DiagnosticDetails({
  value,
  prefix = '',
}: {
  value: unknown;
  prefix?: string;
}) {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  if (value === undefined || value === null)
    return (
      <Text style={{ color: colors.textSecondary }}>
        {prefix}: {t('system.unavailable', { defaultValue: 'Unavailable' })}
      </Text>
    );
  if (Array.isArray(value)) {
    return (
      <View style={styles.details}>
        {value.length ? (
          value.map((item, index) => (
            <DiagnosticDetails
              key={index}
              value={item}
              prefix={`${prefix} ${index + 1}`}
            />
          ))
        ) : (
          <Text style={{ color: colors.textSecondary }}>
            {prefix}: {t('system.empty', { defaultValue: 'None' })}
          </Text>
        )}
      </View>
    );
  }
  if (typeof value === 'object')
    return (
      <View style={styles.details}>
        {Object.keys(value).length === 0 ? (
          <Text style={{ color: colors.textSecondary }}>
            {prefix}: {t('system.unavailable', { defaultValue: 'Unavailable' })}
          </Text>
        ) : null}
        {Object.entries(value).map(([key, item]) => (
          <DiagnosticDetails
            key={key}
            value={item}
            prefix={`${prefix ? `${prefix} · ` : ''}${key.replace(/_/g, ' ')}`}
          />
        ))}
      </View>
    );
  return (
    <Text selectable style={{ color: colors.text }}>
      {prefix}: {String(value)}
    </Text>
  );
}

export default function SystemScreen() {
  useNativeLocale();
  const navigation = useNavigation<RootNavigationProp<'System'>>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const client = useQueryClient();
  React.useLayoutEffect(() => {
    navigation.setOptions({
      get title() { return translateNative('system.title', { defaultValue: 'System' }); },
    });
  }, [navigation, t]);
  const info = useQuery({
    queryKey: ['systemInfo'],
    queryFn: systemApi.getSystemInfo,
  });
  const health = useQuery({
    queryKey: ['systemHealth'],
    queryFn: systemApi.getSystemHealth,
  });
  const storage = useQuery({
    queryKey: ['storageUsage'],
    queryFn: () => systemApi.getStorageUsage({ refresh: true }),
  });
  const debug = useQuery({
    queryKey: ['debugLoggingState'],
    queryFn: systemApi.getDebugLoggingState,
  });
  const setDebug = useMutation({
    mutationFn: systemApi.setDebugLogging,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['debugLoggingState'] });
    },
  });
  const bundle = useMutation({
    mutationFn: async () => {
      await shareBlob(
        await systemApi.downloadSupportBundle(),
        'bambuddy-support.zip',
      );
    },
  });
  const refresh = () => {
    void info.refetch();
    void health.refetch();
    void storage.refetch();
    void debug.refetch();
  };
  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={
            info.isRefetching || health.isRefetching || storage.isRefetching
          }
          onRefresh={refresh}
        />
      }
    >
      <SectionCard
        title={t('system.info.title', { defaultValue: 'System information' })}
      >
        {info.isLoading ? (
          <Text style={{ color: colors.textSecondary }}>
            {t('system.loading', {
              defaultValue: 'Loading system information…',
            })}
          </Text>
        ) : null}
        {info.error ? (
          <Text style={{ color: colors.error }}>{info.error.message}</Text>
        ) : null}
        <PrimaryButton
          label={t('system.info.refresh', {
            defaultValue: 'Refresh system information',
          })}
          variant="secondary"
          onPress={() => {
            void info.refetch();
          }}
        />
        {info.data ? (
          <>
            <DiagnosticDetails
              value={info.data.app}
              prefix={t('system.info.application', {
                defaultValue: 'Application',
              })}
            />
            <DiagnosticDetails
              value={info.data.database}
              prefix={t('system.info.database', {
                defaultValue: 'Database and aggregate print statistics',
              })}
            />
            <DiagnosticDetails
              value={info.data.printers}
              prefix={t('system.info.printers', {
                defaultValue: 'Connected printers',
              })}
            />
            <DiagnosticDetails
              value={info.data.system}
              prefix={t('system.info.runtime', {
                defaultValue: 'Runtime / OS',
              })}
            />
            <DiagnosticDetails value={info.data.cpu} prefix={translateNative('native.c3fdf71ac112b4e0', { defaultValue: 'CPU' })} />
            <DiagnosticDetails
              value={info.data.memory}
              prefix={t('system.info.memory', { defaultValue: 'Memory' })}
            />
            <DiagnosticDetails
              value={info.data.storage}
              prefix={t('system.info.disk', { defaultValue: 'Disk' })}
            />
          </>
        ) : null}
      </SectionCard>
      <SectionCard
        title={t('system.storage.title', { defaultValue: 'Storage scan' })}
      >
        <PrimaryButton
          label={t('system.storage.refresh', {
            defaultValue: 'Rescan storage',
          })}
          variant="secondary"
          loading={storage.isFetching}
          onPress={() => {
            void storage.refetch();
          }}
        />
        {storage.error ? (
          <Text style={{ color: colors.error }}>{storage.error.message}</Text>
        ) : null}
        {storage.data ? (
          <>
            <Text style={{ color: colors.text }}>
              {t('system.storage.total', {
                defaultValue: 'Total: {{size}} · Scanned {{date}}',
                size: storage.data.total_formatted,
                date: storage.data.generated_at,
              })}
            </Text>
            <Text
              style={{
                color: storage.data.scan_errors
                  ? colors.error
                  : colors.textSecondary,
              }}
            >
              {t('system.storage.errors', {
                defaultValue:
                  '{{count}} scan errors. Inaccessible paths may make totals incomplete.',
                count: storage.data.scan_errors,
              })}
            </Text>
            <Text selectable style={{ color: colors.textSecondary }}>
              {storage.data.roots.join('\n')}
            </Text>
            {storage.data.categories.map(category => (
              <Text key={category.key} style={{ color: colors.text }}>
                {category.label}: {category.formatted} ·{' '}
                {category.percent_of_total}%
              </Text>
            ))}
            {storage.data.other_breakdown.map(item => (
              <Text
                key={`${item.kind}:${item.bucket}`}
                style={{ color: colors.textSecondary }}
              >
                {item.label}: {item.formatted} · {item.percent_of_total}% ·{' '}
                {item.kind} ·{' '}
                {item.deletable
                  ? t('system.storage.data', { defaultValue: 'data directory' })
                  : t('system.storage.protected', {
                      defaultValue: 'protected system files',
                    })}
              </Text>
            ))}
          </>
        ) : null}
      </SectionCard>
      <SectionCard
        title={t('system.health.title', { defaultValue: 'System log health' })}
      >
        <PrimaryButton
          label={t('system.health.rescan', {
            defaultValue: 'Rescan log health',
          })}
          variant="secondary"
          loading={health.isFetching}
          onPress={() => {
            void health.refetch();
          }}
        />
        {health.error ? (
          <Text style={{ color: colors.error }}>{health.error.message}</Text>
        ) : null}
        {health.data ? <SystemHealthPanel result={health.data} /> : null}
      </SectionCard>
      <ServerUpdateTools />
      <SectionCard
        title={t('system.support.title', { defaultValue: 'Support tools' })}
      >
        {hasPermission('settings:update') ? (
          <SwitchRow
            label={t('system.support.debug', { defaultValue: 'Debug logging' })}
            value={debug.data?.enabled ?? false}
            onValueChange={enabled => setDebug.mutate(enabled)}
          />
        ) : null}
        {debug.error || setDebug.error || bundle.error ? (
          <Text style={{ color: colors.error }}>
            {debug.error?.message ??
              setDebug.error?.message ??
              bundle.error?.message}
          </Text>
        ) : null}
        <PrimaryButton
          label={t('system.support.bundle', {
            defaultValue: 'Download / share support bundle',
          })}
          variant="secondary"
          loading={bundle.isPending}
          onPress={() => bundle.mutate()}
        />
      </SectionCard>
      <ApplicationLogTools />
      <BugReportTools />
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing['2xl'],
  },
  details: { gap: spacing.sm },
});
