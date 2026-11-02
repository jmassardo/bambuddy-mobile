import { nativeMessage, translateNative, useNativeLocale, useTranslation } from '@/i18n';
import { localizedStatus } from '@/utils/statusLabel';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { slicingApi } from '@/api/slicing';
import { printersApi } from '@/api/printers';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { PrimaryButton } from '@/components/common/AppUI';
import { Box, Choice, Copy } from '@/components/slicing/Controls';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import { formatPreferredDateTime } from '@/utils/preferences';
import type { PipelineRun } from '@/types/api';

export const terminalRun = (status: PipelineRun['status']) =>
  ['completed', 'failed', 'partial_failure', 'cancelled'].includes(status);
export const retryableRun = (run: PipelineRun) =>
  ['failed', 'partial_failure'].includes(run.status) &&
  run.copies_failed + run.copies_cancelled > 0 &&
  !!run.pipeline_id &&
  !!(run.source_library_file_id || run.source_archive_id);
const pageSize = 20;
export function PipelineRunsScreen() {
  const { colors } = useTheme();
  useNativeLocale();
  const { t } = useTranslation();
  const text = (s: string) => t(`pipelineRuns.${s}`, { defaultValue: s });
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const client = useQueryClient();
  const [pipeline, setPipeline] = useState('');
  const [status, setStatus] = useState('');
  const [target, setTarget] = useState('');
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const pipelines = useQuery({
    queryKey: ['slicer-pipelines'],
    queryFn: slicingApi.pipelines,
    enabled: hasPermission('pipelines:read'),
  });
  const printers = useQuery({
    queryKey: ['printers'],
    queryFn: printersApi.getPrinters,
  });
  const runs = useQuery({
    queryKey: ['pipeline-runs', pipeline, status, target, offset],
    queryFn: () =>
      slicingApi.runs({
        limit: pageSize,
        offset,
        pipeline_id: pipeline ? Number(pipeline) : undefined,
        status: status || undefined,
        target_printer_id: target.startsWith('p:')
          ? Number(target.slice(2))
          : undefined,
        target_model_class: target.startsWith('c:')
          ? target.slice(2)
          : undefined,
      }),
    enabled: hasPermission('pipelines:read'),
    refetchInterval: 5000,
  });
  const invalidate = () => {
    client.invalidateQueries({ queryKey: ['pipeline-runs'] });
    client.invalidateQueries({ queryKey: ['pipeline-latest-run'] });
  };
  const action = useMutation({
    mutationFn: ({
      run,
      kind,
    }: {
      run: PipelineRun;
      kind: 'cancel' | 'retry';
    }) =>
      kind === 'cancel' ? slicingApi.cancel(run.id) : slicingApi.retry(run.id),
    onSuccess: result => {
      invalidate();
      showToast(nativeMessage('pipelineRuns.updatedToast', { defaultValue: 'Run updated #{{id}}', id: result.id }), 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const clear = useMutation({
    mutationFn: slicingApi.clear,
    onSuccess: result => {
      setOffset(0);
      invalidate();
      showToast(
        nativeMessage('pipelineRuns.clearedToast', { defaultValue: '{{count}} terminal runs cleared', count: result.deleted }),
        'success',
      );
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const classes = [
    ...new Set([
      ...(printers.data ?? [])
        .map(p => p.model)
        .filter((v): v is string => !!v),
      ...(pipelines.data?.pipelines ?? [])
        .map(p => p.target_model_class)
        .filter((v): v is string => !!v),
      ...(runs.data?.runs ?? [])
        .map(r => r.target_model_class)
        .filter((v): v is string => !!v),
    ]),
  ];
  const change = (setter: (value: string) => void) => (v: string) => {
    setter(v);
    setOffset(0);
  };
  if (!hasPermission('pipelines:read'))
    return <Copy>{text('Permission denied')}</Copy>;
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={screenStyles.content}>
      <Choice
        label={text('Pipeline')}
        value={pipeline}
        onChange={change(setPipeline)}
        options={[
          { value: '', label: text('All pipelines') },
          ...(pipelines.data?.pipelines ?? []).map(p => ({
            value: String(p.id),
            label: p.name,
          })),
        ]}
      />
      <Choice
        label={text('Status')}
        value={status}
        onChange={change(setStatus)}
        options={[
          { value: '', label: text('All statuses') },
          ...[
            'queued',
            'slicing',
            'dispatching',
            'in_progress',
            'completed',
            'failed',
            'partial_failure',
            'cancelled',
          ].map(v => ({ value: v, label: localizedStatus(v) })),
        ]}
      />
      <Choice
        label={text('Target')}
        value={target}
        onChange={change(setTarget)}
        options={[
          { value: '', label: text('All targets') },
          ...(printers.data ?? []).map(p => ({
            value: `p:${p.id}`,
            label: p.name,
          })),
          ...classes.map(c => ({
            value: `c:${c}`,
            label: `${text('Any')} ${c}`,
          })),
        ]}
      />
      <PrimaryButton
        label={text('Clear filters')}
        variant="secondary"
        onPress={() => {
          setPipeline('');
          setStatus('');
          setTarget('');
          setOffset(0);
        }}
      />
      <PrimaryButton
        label={text('Refresh')}
        loading={runs.isFetching}
        onPress={() => runs.refetch()}
      />
      {hasPermission('pipelines:write') && (
        <PrimaryButton
          label={text('Clear terminal run logs')}
          variant="danger"
          disabled={clear.isPending}
          onPress={() =>
            Alert.alert(
              text('Clear terminal run logs?'),
              text(
                'Completed, failed, partially failed and cancelled history will be deleted. Active runs are preserved.',
              ),
              [
                { text: text('Cancel'), style: 'cancel' },
                {
                  text: text('Clear logs'),
                  style: 'destructive',
                  onPress: () => clear.mutate(),
                },
              ],
            )
          }
        />
      )}
      {[runs, pipelines, printers].map(
        (q, i) => q.isError && <Copy key={i}>{q.error.message}</Copy>,
      )}
      {runs.isLoading ? <Copy>{t('common.loading')}</Copy> : !runs.isError ? <Copy>{`${runs.data?.total ?? 0} ${text('runs')} · ${text('Page')} ${
        Math.floor(offset / pageSize) + 1
      }`}</Copy> : null}
      {runs.isSuccess && !runs.data?.runs.length ? <Copy>{translateNative('native.e09a7c1298e1a8c8')}</Copy> : null}
      {runs.data?.runs.map(run => (
        <Box key={run.id}>
          <PrimaryButton
            label={`#${run.id} ${
              run.pipeline_name ?? text('Deleted pipeline')
            } · ${localizedStatus(run.status)}`}
            expanded={expanded.has(run.id)}
            variant="secondary"
            onPress={() =>
              setExpanded(previous => {
                const next = new Set(previous);
                if (next.has(run.id)) next.delete(run.id);
                else next.add(run.id);
                return next;
              })
            }
          />
          <Copy>{`${run.copies_completed}/${run.copies} ${text(
            'completed',
          )} · ${run.copies_in_progress} ${text('in progress')} · ${
            run.copies_failed
          } ${text('failed')} · ${run.copies_cancelled} ${text(
            'cancelled',
          )}`}</Copy>
          {run.error_message && <Copy>{run.error_message}</Copy>}
          {hasPermission('pipelines:run') && !terminalRun(run.status) && (
            <PrimaryButton
              label={text('Cancel run')}
              variant="danger"
              disabled={action.isPending}
              onPress={() =>
                Alert.alert(
                  text('Cancel run?'),
                  text(
                    'Pending copies will be cancelled. Copies already printing are not stopped.',
                  ),
                  [
                    { text: text('Back'), style: 'cancel' },
                    {
                      text: text('Cancel run'),
                      style: 'destructive',
                      onPress: () => action.mutate({ run, kind: 'cancel' }),
                    },
                  ],
                )
              }
            />
          )}
          {hasPermission('pipelines:run') && retryableRun(run) && (
            <PrimaryButton
              label={text('Retry failed copies only')}
              disabled={action.isPending}
              onPress={() => action.mutate({ run, kind: 'retry' })}
            />
          )}
          {expanded.has(run.id) && (
            <>
              <Copy>{`${text('Source')}: ${run.source_filename ?? '—'} · ${
                run.source_library_file_id
                  ? translateNative('native.f461f1aa1081250b', { value0: String(run.source_library_file_id) })
                  : translateNative('native.fa09b00863447464', { value0: String(run.source_archive_id) })
              }`}</Copy>
              <Copy>{`${text('Target')}: ${run.target_kind ?? '—'} · ${
                run.target_model_class ?? run.target_printer_id ?? '—'
              } · ${run.fanout_strategy ?? '—'}`}</Copy>
              <Copy>{`${text('Created')}: ${formatPreferredDateTime(run.created_at)} · ${text(
                'Started',
              )}: ${run.started_at ? formatPreferredDateTime(run.started_at) : '—'} · ${text('Finished')}: ${
                run.completed_at ? formatPreferredDateTime(run.completed_at) : '—'
              }`}</Copy>
              {run.parent_run_id && (
                <Copy>{`${text('Retry of run')} #${run.parent_run_id}`}</Copy>
              )}
              {run.eligibility_overridden && (
                <Copy>{text('Eligibility warnings were overridden')}</Copy>
              )}
              <Copy>{`${text('Slice job')}: ${run.slice_job_id ?? '—'} · ${text(
                'Result file',
              )}: ${run.sliced_library_file_id ?? '—'}`}</Copy>
              {run.jobs.map(job => (
                <Box key={job.id}>
                  <Copy>{`${text('Copy')} ${job.copy_index} · ${localizedStatus(
                    job.status,
                  )} · ${
                    job.assigned_printer_name ??
                    job.assigned_printer_id ??
                    text('Unassigned')
                  }`}</Copy>
                  <Copy>{`${text('Queue entry')}: ${
                    job.queue_entry_id ?? '—'
                  } · ${text('Dispatched')}: ${
                    job.dispatched_at ? formatPreferredDateTime(job.dispatched_at) : '—'
                  } · ${text('Finished')}: ${job.completed_at ? formatPreferredDateTime(job.completed_at) : '—'}`}</Copy>
                  {!!job.error_message && <Copy>{job.error_message}</Copy>}
                </Box>
              ))}
            </>
          )}
        </Box>
      ))}
      <PrimaryButton
        label={text('Previous page')}
        variant="secondary"
        disabled={offset === 0}
        onPress={() => setOffset(v => Math.max(0, v - pageSize))}
      />
      <PrimaryButton
        label={text('Next page')}
        variant="secondary"
        disabled={!runs.data || offset + pageSize >= runs.data.total}
        onPress={() => setOffset(v => v + pageSize)}
      />
    </ScrollView>
  );
}
const screenStyles = StyleSheet.create({ content: { padding: spacing.lg, gap: spacing.md } });
