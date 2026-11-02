import { useNativeLocale, useTranslation } from '@/i18n';
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { archiveWorkflows } from '@/api/archiveWorkflows';

import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import { ArchiveDialog } from './ArchiveWorkflowUI';
import { ErrorState } from '@/components/common/StateScreens';
import type { Archive } from '@/types/api';

export function CompareArchivesModal({
  visible,
  archives,
  onClose,
}: {
  visible: boolean;
  archives: Archive[];
  onClose: () => void;
}) {
  useNativeLocale();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const query = useQuery({
    queryKey: ['archiveComparison', archives.map(archive => archive.id)],
    queryFn: () =>
      archiveWorkflows.compare(archives.map(archive => archive.id)),
    enabled: visible && archives.length >= 2 && archives.length <= 5,
  });
  if (!visible) return null;
  return (
    <ArchiveDialog
      title={t('archives.compare', { defaultValue: 'Compare archives' })}
      onClose={onClose}
    >
      {query.isLoading ? (
        <Text style={{ color: colors.text }}>{t('common.loading')}</Text>
      ) : null}
      {query.error ? (
        <ErrorState
          message={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      <ScrollView horizontal>
        <View>
          <View style={styles.row}>
            <Text style={[styles.cell, { color: colors.text }]}>
              {t('archives.setting', { defaultValue: 'Setting / unit' })}
            </Text>
            {archives.map(archive => (
              <View key={archive.id} style={styles.cell}>
                <Image
                  source={{ uri: api.getArchiveThumbnail(archive.id) }}
                  style={styles.thumbnail}
                  resizeMode="contain"
                />
                <Text style={{ color: colors.text }}>
                  {archive.print_name || archive.filename}
                </Text>
              </View>
            ))}
          </View>
          {query.data?.comparison.map(field => (
            <View
              key={field.field}
              style={[
                styles.row,
                {
                  backgroundColor: field.has_difference
                    ? colors.surfaceElevated
                    : colors.background,
                },
              ]}
            >
              <Text
                style={[
                  styles.cell,
                  {
                    color: field.has_difference
                      ? colors.warning
                      : colors.textSecondary,
                  },
                ]}
              >
                {field.has_difference ? '≠ ' : ''}
                {field.label}
                {field.unit ? ` (${field.unit})` : ''}
              </Text>
              {field.values.map((value, index) => (
                <Text key={index} style={[styles.cell, { color: colors.text }]}>
                  {value == null ? '—' : String(value)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      {query.data ? (
        <>
          <Text style={{ color: colors.text }}>
            {t('archives.differences', {
              defaultValue: '{{count}} settings differ',
              count: query.data.differences.length,
            })}
          </Text>
          <Text style={{ color: colors.text }}>
            {query.data.success_correlation.message ??
              t('archives.correlation', {
                defaultValue: 'Success / failure correlations',
              })}
          </Text>
          {query.data.success_correlation.has_both_outcomes ? (
            <Text style={{ color: colors.textSecondary }}>
              {t('archives.outcomeCounts', {
                defaultValue: '{{success}} successful / {{failed}} failed',
                success: query.data.success_correlation.successful_count,
                failed: query.data.success_correlation.failed_count,
              })}
            </Text>
          ) : null}
          {query.data.success_correlation.insights?.map((insight, index) => (
            <Text key={index} style={{ color: colors.text }}>
              {insight.label}: {insight.insight}
              {insight.success_avg == null
                ? ''
                : ` · ✓ ${insight.success_avg.toFixed(2)}`}
              {insight.failed_avg == null
                ? ''
                : ` · ✕ ${insight.failed_avg.toFixed(2)}`}
              {insight.success_values
                ? ` · ✓ ${insight.success_values.join(', ')}`
                : ''}
              {insight.failed_values
                ? ` · ✕ ${insight.failed_values.join(', ')}`
                : ''}
            </Text>
          ))}
        </>
      ) : null}
    </ArchiveDialog>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  cell: { width: 180, padding: spacing.sm },
  thumbnail: { width: 140, height: 90 },
});
