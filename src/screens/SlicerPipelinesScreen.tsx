import { useNativeLocale, useTranslation } from '@/i18n';
import React, { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { slicingApi } from '@/api/slicing';
import { printersApi } from '@/api/printers';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { PrimaryButton, TextField } from '@/components/common/AppUI';
import { Box, Choice, Copy, styles } from '@/components/slicing/Controls';
import { hasTarget, refValue, staleRefs } from '@/utils/sliceConfiguration';
import type {
  Printer,
  SlicerPipeline,
  SlicerPipelineUpdateRequest,
  UnifiedPresetsResponse,
} from '@/types/api';

export function SlicerPipelinesScreen() {
  useNativeLocale();
  const { t } = useTranslation();
  const text = (s: string) => t(`pipelineManagement.${s}`, { defaultValue: s });
  const { hasPermission } = useAuth();
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState('');
  const pipelines = useQuery({
    queryKey: ['slicer-pipelines'],
    queryFn: slicingApi.pipelines,
    enabled: hasPermission('pipelines:read'),
  });
  const presets = useQuery({
    queryKey: ['slicerPresets'],
    queryFn: () => slicingApi.presets(),
    enabled: hasPermission('pipelines:read'),
  });
  const printers = useQuery({
    queryKey: ['printers'],
    queryFn: printersApi.getPrinters,
  });
  const classes = [
    ...new Set(
      (printers.data ?? []).map(p => p.model).filter((m): m is string => !!m),
    ),
  ];
  if (!hasPermission('pipelines:read'))
    return <Copy>{text('Permission denied')}</Copy>;
  return (
    <ScrollView
      contentContainerStyle={styles.box}
      keyboardShouldPersistTaps="handled"
    >
      <TextField
        label={text('Search pipelines')}
        value={search}
        onChangeText={setSearch}
      />
      <Choice
        label={text('Target filter')}
        value={target}
        onChange={setTarget}
        options={[
          { value: '', label: text('All targets') },
          { value: 'none', label: text('No target') },
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
        label={text('Refresh')}
        onPress={() => {
          pipelines.refetch();
          presets.refetch();
          printers.refetch();
        }}
      />
      {[pipelines, presets, printers].map(
        (q, i) => q.isError && <Copy key={i}>{q.error.message}</Copy>,
      )}
      {pipelines.isLoading && <Copy>{text('Loading pipelines…')}</Copy>}
      {(pipelines.data?.pipelines ?? [])
        .filter(p =>
          `${p.name} ${p.description ?? ''}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
        .filter(
          p =>
            !target ||
            (target === 'none'
              ? !hasTarget(p)
              : target.startsWith('p:')
              ? p.target_kind === 'specific_printer' &&
                p.target_printer_id === Number(target.slice(2))
              : p.target_kind === 'printer_class' &&
                p.target_model_class === target.slice(2)),
        )
        .map(p => (
          <PipelineRow
            key={`${p.id}:${p.updated_at}`}
            pipeline={p}
            presets={presets.data}
            printers={printers.data ?? []}
            writable={hasPermission('pipelines:write')}
          />
        ))}
      {pipelines.data?.pipelines.length === 0 && (
        <Copy>
          {text(
            'No saved pipelines. Save a preset bundle from the Slice dialog.',
          )}
        </Copy>
      )}
    </ScrollView>
  );
}
function PipelineRow({
  pipeline,
  presets,
  printers,
  writable,
}: {
  pipeline: SlicerPipeline;
  presets?: UnifiedPresetsResponse;
  printers: Printer[];
  writable: boolean;
}) {
  useNativeLocale();
  const { t } = useTranslation();
  const text = (s: string) => t(`pipelineManagement.${s}`, { defaultValue: s });
  const client = useQueryClient();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(pipeline.name);
  const [description, setDescription] = useState(pipeline.description ?? '');
  const [kind, setKind] = useState(pipeline.target_kind);
  const [printer, setPrinter] = useState(
    String(pipeline.target_printer_id ?? ''),
  );
  const [model, setModel] = useState(pipeline.target_model_class ?? '');
  const [fanout, setFanout] = useState(pipeline.fanout_strategy);
  const last = useQuery({
    queryKey: ['pipeline-latest-run', pipeline.id],
    queryFn: () => slicingApi.latestRun(pipeline.id),
    refetchInterval: 10000,
  });
  const refresh = () => {
    client.invalidateQueries({ queryKey: ['slicer-pipelines'] });
  };
  const save = useMutation({
    mutationFn: (body: SlicerPipelineUpdateRequest) =>
      slicingApi.update(pipeline.id, body),
    onSuccess: () => {
      refresh();
      setEditing(false);
      showToast(text('Pipeline saved'), 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const remove = useMutation({
    mutationFn: () => slicingApi.remove(pipeline.id),
    onSuccess: refresh,
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const classes = [
    ...new Set([
      ...printers.map(p => p.model).filter((m): m is string => !!m),
      ...(model ? [model] : []),
    ]),
  ];
  const missing = presets ? staleRefs(pipeline, presets) : [];
  const resolve = (
    ref: SlicerPipeline['printer_preset'],
    slot: 'printer' | 'process' | 'filament',
  ) =>
    presets?.[ref.source][slot].find(p => p.id === ref.id)?.name ??
    `${ref.source}:${ref.id}`;
  const run = last.data?.runs[0];
  return (
    <Box>
      <Copy>{pipeline.name}</Copy>
      {!!pipeline.description && <Copy>{pipeline.description}</Copy>}
      <Copy>{`${text('Printer')}: ${resolve(
        pipeline.printer_preset,
        'printer',
      )} [${pipeline.printer_preset.source}]`}</Copy>
      <Copy>{`${text('Process')}: ${resolve(
        pipeline.process_preset,
        'process',
      )} [${pipeline.process_preset.source}]`}</Copy>
      {pipeline.filament_presets.map((ref, i) => (
        <Copy key={i}>{`${text('Slot')} ${i + 1}: ${resolve(
          ref,
          'filament',
        )} [${ref.source}]`}</Copy>
      ))}
      <Copy>{`${text('Bed')}: ${
        pipeline.bed_type ?? text('Preset default')
      }`}</Copy>
      <Copy>{`${text('Target')}: ${
        pipeline.target_kind === 'printer_class'
          ? `${text('Any')} ${pipeline.target_model_class ?? '—'}`
          : printers.find(p => p.id === pipeline.target_printer_id)?.name ??
            pipeline.target_printer_id ??
            '—'
      } · ${pipeline.fanout_strategy}`}</Copy>
      {!hasTarget(pipeline) && (
        <Copy>
          {text(
            'No target — this pipeline cannot run until a target is configured.',
          )}
        </Copy>
      )}
      {pipeline.target_printer_id &&
        !printers.some(p => p.id === pipeline.target_printer_id) && (
          <Copy>{text('Target printer no longer exists.')}</Copy>
        )}
      {pipeline.target_kind === 'printer_class' &&
        pipeline.target_model_class &&
        !printers.some(p => p.model === pipeline.target_model_class) && (
          <Copy>{text('No installed printer matches this class.')}</Copy>
        )}
      {!!missing.length && (
        <Copy>{`${text('Stale preset references')}: ${missing
          .map(refValue)
          .join(', ')}`}</Copy>
      )}
      {last.isError && <Copy>{last.error.message}</Copy>}
      <Copy>
        {run
          ? `${text('Last run')}: #${run.id} ${run.status} · ${
              run.copies_completed
            }/${run.copies} · ${run.created_at}${
              run.error_message ? ` · ${run.error_message}` : ''
            }`
          : text('No runs yet')}
      </Copy>
      {writable &&
        (editing ? (
          <>
            <TextField
              label={text('Name')}
              value={name}
              onChangeText={setName}
            />
            <TextField
              label={text('Description')}
              value={description}
              onChangeText={setDescription}
              multiline
            />
            <Choice
              label={text('Target kind')}
              value={kind}
              onChange={v => setKind(v as typeof kind)}
              options={[
                { value: 'specific_printer', label: text('Specific printer') },
                { value: 'printer_class', label: text('Printer model class') },
              ]}
            />
            {kind === 'specific_printer' ? (
              <Choice
                label={text('Target printer')}
                value={printer}
                onChange={setPrinter}
                options={[
                  { value: '', label: text('No target') },
                  ...printers.map(p => ({
                    value: String(p.id),
                    label: p.name,
                  })),
                ]}
              />
            ) : (
              <Choice
                label={text('Model class')}
                value={model}
                onChange={setModel}
                options={[
                  { value: '', label: text('No class') },
                  ...classes.map(c => ({ value: c, label: c })),
                ]}
              />
            )}
            <Choice
              label={text('Fanout strategy')}
              value={fanout}
              onChange={v => setFanout(v as typeof fanout)}
              options={['max_parallel', 'fill_one_first', 'round_robin'].map(
                v => ({ value: v, label: text(v) }),
              )}
            />
            <PrimaryButton
              label={text('Save')}
              disabled={!name.trim() || save.isPending}
              loading={save.isPending}
              onPress={() =>
                save.mutate({
                  name: name.trim(),
                  description: description.trim() || null,
                  target_kind: kind,
                  target_printer_id:
                    kind === 'specific_printer' && printer
                      ? Number(printer)
                      : 0,
                  target_model_class: kind === 'printer_class' ? model : '',
                  fanout_strategy: fanout,
                })
              }
            />
            <PrimaryButton
              label={text('Cancel')}
              variant="secondary"
              disabled={save.isPending}
              onPress={() => {
                setName(pipeline.name);
                setDescription(pipeline.description ?? '');
                setKind(pipeline.target_kind);
                setPrinter(String(pipeline.target_printer_id ?? ''));
                setModel(pipeline.target_model_class ?? '');
                setFanout(pipeline.fanout_strategy);
                setEditing(false);
              }}
            />
          </>
        ) : (
          <PrimaryButton
            label={text('Edit')}
            onPress={() => setEditing(true)}
          />
        ))}
      {writable && (
        <PrimaryButton
          label={text('Delete pipeline')}
          variant="secondary"
          disabled={remove.isPending}
          onPress={() =>
            Alert.alert(text('Delete pipeline?'), pipeline.name, [
              { text: text('Cancel'), style: 'cancel' },
              {
                text: text('Delete'),
                style: 'destructive',
                onPress: () => remove.mutate(),
              },
            ])
          }
        />
      )}
    </Box>
  );
}
