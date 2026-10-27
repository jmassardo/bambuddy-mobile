import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton, ProgressBar, SectionCard, StatCard } from '@/components/common/AppUI';
import { useTranslation } from '@/i18n';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import { formatCurrency, formatDuration, formatWeight, pickArray, pickNumber, pickRecord, pickString, type ApiRecord } from '@/utils/data';

export function ProjectHierarchySummary({ project, onOpen }: { project: ApiRecord; onOpen: (id: number) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const rollup = pickRecord(project, ['rollup_stats']);
  const children = pickArray(project, ['children']).filter((child): child is ApiRecord => child !== null && typeof child === 'object');
  if (!rollup && project.parent_id == null && !children.length) return null;
  return (
    <SectionCard title={t('projects.hierarchy', { defaultValue: 'Project hierarchy' })}>
      {project.parent_id != null ? <PrimaryButton variant="secondary"
        label={t('projects.openParent', { defaultValue: 'Parent: {{name}}', name: pickString(project, ['parent_name']) })}
        onPress={() => onOpen(Number(project.parent_id))} /> : null}
      {rollup ? <>
        <Text style={{ color: colors.text }}>{t('projects.rollup', { defaultValue: 'Combined totals — this project and {{count}} descendants', count: pickNumber(project, ['descendant_count']) })}</Text>
        <View style={styles.grid}>
          <StatCard label={t('projects.printJobs', { defaultValue: 'Print jobs' })} value={String(pickNumber(rollup, ['total_archives']))} />
          <StatCard label={t('projects.completed', { defaultValue: 'Completed' })} value={String(pickNumber(rollup, ['completed_prints']))} />
          <StatCard label={t('projects.failed', { defaultValue: 'Failed' })} value={String(pickNumber(rollup, ['failed_prints']))} />
          <StatCard label={t('projects.queued', { defaultValue: 'Queued' })} value={String(pickNumber(rollup, ['queued_prints']))} />
          <StatCard label={t('projects.inProgress', { defaultValue: 'In progress' })} value={String(pickNumber(rollup, ['in_progress_prints']))} />
          <StatCard label={t('projects.printTime', { defaultValue: 'Print time' })} value={formatDuration(pickNumber(rollup, ['total_print_time_hours']) * 3600)} />
          <StatCard label={t('projects.filament', { defaultValue: 'Filament' })} value={formatWeight(pickNumber(rollup, ['total_filament_grams']))} />
          <StatCard label={t('projects.totalCost', { defaultValue: 'Total cost' })} value={formatCurrency(pickNumber(rollup, ['estimated_cost']) + pickNumber(rollup, ['total_energy_cost']) + pickNumber(rollup, ['bom_cost']))} />
        </View>
        {rollup.progress_percent != null ? <>
          <Text style={{ color: colors.textSecondary }}>{t('projects.rollupProgress', { defaultValue: 'Combined progress: {{percent}}%', percent: Math.round(pickNumber(rollup, ['progress_percent'])) })}</Text>
          <ProgressBar progress={pickNumber(rollup, ['progress_percent'])} color={colors.accent} trackColor={colors.surfaceElevated} />
        </> : null}
      </> : null}
      {children.map(child => <View key={pickNumber(child, ['id'])} style={styles.child}>
        <PrimaryButton variant="secondary" label={pickString(child, ['name'])} onPress={() => onOpen(pickNumber(child, ['id']))} />
        <Text style={{ color: colors.textSecondary }}>{t('projects.childTotals', {
          defaultValue: '{{status}} · {{count}} descendants · {{jobs}} jobs · {{completed}} completed · {{time}} · {{filament}} · {{cost}}',
          status: pickString(child, ['status']), count: pickNumber(child, ['descendant_count']),
          jobs: pickNumber(child, ['total_archives']), completed: pickNumber(child, ['completed_prints']),
          time: formatDuration(pickNumber(child, ['total_print_time_hours']) * 3600),
          filament: formatWeight(pickNumber(child, ['total_filament_grams'])), cost: formatCurrency(pickNumber(child, ['total_cost'])),
        })}</Text>
        {child.progress_percent != null ? <Text style={{ color: colors.textSecondary }}>{t('projects.childProgress', { defaultValue: 'Subtree progress: {{percent}}%', percent: Math.round(pickNumber(child, ['progress_percent'])) })}</Text> : null}
      </View>)}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  child: { gap: spacing.xs },
});
