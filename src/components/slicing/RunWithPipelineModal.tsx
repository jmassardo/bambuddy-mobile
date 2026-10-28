import { translateNative, useNativeLocale, useTranslation } from '@/i18n';
import { localizedEnum } from '@/utils/statusLabel';

const issueCaptions: Record<string, string> = {
  get printer_not_set() { return translateNative('pipeline.issue.printerNotSet', { defaultValue: 'Printer not set' }); },
  get printer_not_found() { return translateNative('pipeline.issue.printerNotFound', { defaultValue: 'Printer not found' }); },
  get printer_disabled() { return translateNative('pipeline.issue.printerDisabled', { defaultValue: 'Printer disabled' }); },
  get printer_offline() { return translateNative('pipeline.issue.printerOffline', { defaultValue: 'Printer offline' }); },
  get filament_type_mismatch() { return translateNative('pipeline.issue.filamentType', { defaultValue: 'Filament type mismatch' }); },
  get filament_color_mismatch() { return translateNative('pipeline.issue.filamentColor', { defaultValue: 'Filament color mismatch' }); },
  get ams_slot_missing() { return translateNative('pipeline.issue.amsSlot', { defaultValue: 'AMS slot missing' }); },
  get filament_unverified() { return translateNative('pipeline.issue.filamentUnverified', { defaultValue: 'Filament unverified' }); },
  get no_class_matches() { return translateNative('pipeline.issue.noClassMatches', { defaultValue: 'No matching printer class' }); },
  get class_not_set() { return translateNative('pipeline.issue.classNotSet', { defaultValue: 'Printer class not set' }); },
};
import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { slicingApi, type SliceSourceProps } from '@/api/slicing';
import { settingsApi } from '@/api/settings';
import { printersApi } from '@/api/printers';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { PrimaryButton, TextField } from '@/components/common/AppUI';
import { Box, Choice, Copy, Sheet } from './Controls';
import { hasTarget } from '@/utils/sliceConfiguration';
import type { PipelineEligibilityReport } from '@/types/api';

import { useSliceJobTracker } from '@/contexts/SliceJobTrackerContext';

export function RunWithPipelineModal(
  props: SliceSourceProps & {
    visible: boolean;
    onClose: () => void;
    onRunStarted?: (id: number) => void;
  },
) {
  useNativeLocale();
  const { t } = useTranslation();
  const text = (s: string) => t(`pipeline.${s}`, { defaultValue: s });
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const client = useQueryClient();
  const { trackJob } = useSliceJobTracker();
  const [pipelineId, setPipelineId] = useState('');
  const [copies, setCopies] = useState('1');
  const [report, setReport] = useState<PipelineEligibilityReport | null>(null);
  useEffect(() => {
    if (props.visible) {
      setReport(null);
      setPipelineId('');
      setCopies('1');
    }
  }, [props.visible, props.sourceId, props.sourceType]);
  const pipelines = useQuery({
    queryKey: ['slicer-pipelines'],
    queryFn: slicingApi.pipelines,
    enabled: props.visible && hasPermission('pipelines:read'),
  });
  const printers = useQuery({
    queryKey: ['printers'],
    queryFn: printersApi.getPrinters,
    enabled: props.visible,
  });
  const settings = useQuery({
    queryKey: useServerSettingsKey(),
    queryFn: settingsApi.getSettings,
    enabled: props.visible,
  });
  const maximum = settings.data?.pipeline_max_copies ?? 50;
  const count = Number(copies);
  const valid =
    /^\d+$/.test(copies) &&
    Number.isInteger(count) &&
    count >= 1 &&
    count <= maximum;
  const pipeline = pipelines.data?.pipelines.find(
    p => p.id === Number(pipelineId),
  );
  const run = useMutation({
    mutationFn: (force: boolean) =>
      slicingApi.run(Number(pipelineId), props, count, force),
    onSuccess: result => {
      client.invalidateQueries({ queryKey: ['pipeline-runs'] });
      client.invalidateQueries({ queryKey: ['pipeline-latest-run'] });
      if (result.slice_job_id) trackJob(result.slice_job_id, props);
      showToast(text('Pipeline run started'), 'success');
      props.onRunStarted?.(result.id);
      props.onClose();
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const check = useMutation({
    mutationFn: () => slicingApi.eligibility(Number(pipelineId), props),
    onSuccess: result => {
      if (result.ok) run.mutate(false);
      else setReport(result);
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const blocked = report?.issues.some(i =>
    [
      'printer_not_set',
      'printer_not_found',
      'class_not_set',
      'no_class_matches',
    ].includes(i.kind),
  );
  return (
    <Sheet
      visible={props.visible}
      title={`${text('Run with pipeline')}: ${props.sourceName}`}
      onClose={props.onClose}
    >
      {[pipelines, settings, printers].map(
        (query, i) =>
          query.isError && (
            <Box key={i}>
              <Copy>{query.error.message}</Copy>
              <PrimaryButton
                label={text('Retry')}
                onPress={() => query.refetch()}
              />
            </Box>
          ),
      )}
      {!report ? (
        <>
          <Choice
            label={text('Pipeline')}
            value={pipelineId}
            onChange={setPipelineId}
            disabled={check.isPending || run.isPending}
            options={(pipelines.data?.pipelines ?? []).map(p => ({
              value: String(p.id),
              label: `${p.name} · ${
                !hasTarget(p)
                  ? text('No target set — configure in Settings')
                  : p.target_kind === 'printer_class'
                  ? `${text('Any')} ${p.target_model_class}`
                  : printers.data?.find(pr => pr.id === p.target_printer_id)
                      ?.name ?? `#${p.target_printer_id}`
              }`,
            }))}
          />
          <TextField
            label={`${text('Copies')} (1–${maximum})`}
            value={copies}
            onChangeText={setCopies}
            keyboardType="number-pad"
            editable={!check.isPending && !run.isPending}
          />
          {!valid && (
            <Copy>{text('Enter a whole number within the copies limit.')}</Copy>
          )}
          <PrimaryButton
            label={text('Check and run')}
            disabled={
              !pipeline ||
              !hasTarget(pipeline) ||
              !valid ||
              !hasPermission('pipelines:run') ||
              check.isPending ||
              run.isPending
            }
            loading={check.isPending || run.isPending}
            onPress={() => check.mutate()}
          />
        </>
      ) : (
        <>
          <Copy>
            {text(
              'Preflight found issues. Review printer and AMS mismatches before overriding.',
            )}
          </Copy>
          <Copy>
            {report.target_printer_name ??
              report.target_model_class ??
              text('No target')}
          </Copy>
          {report.issues.map((issue, i) => (
            <Copy key={i}>{`${localizedEnum(issue.kind, issueCaptions)} · ${text('Slot')} ${
              issue.slot_index ?? '—'
            } · ${text('Expected')}: ${issue.expected ?? '—'} · ${text(
              'Actual',
            )}: ${issue.actual ?? '—'}`}</Copy>
          ))}
          {report.printer_reports.map(printer => (
            <Box key={printer.printer_id}>
              <Copy>{`${printer.printer_name}: ${
                printer.ok ? text('Ready') : text('Issues')
              }`}</Copy>
              {printer.issues.map((issue, i) => (
                <Copy key={i}>{`${localizedEnum(issue.kind, issueCaptions)} · ${text('Slot')} ${
                  issue.slot_index ?? '—'
                } · ${issue.expected ?? '—'} → ${issue.actual ?? '—'}`}</Copy>
              ))}
            </Box>
          ))}
          <PrimaryButton
            label={text('Back')}
            variant="secondary"
            disabled={run.isPending}
            onPress={() => setReport(null)}
          />
          <PrimaryButton
            label={text('Run anyway')}
            disabled={
              blocked || run.isPending || !hasPermission('pipelines:run')
            }
            loading={run.isPending}
            onPress={() => run.mutate(true)}
          />
        </>
      )}
    </Sheet>
  );
}
import { useServerSettingsKey } from '@/hooks/useServerSettingsKey';
