import { nativeMessage, translateNative, useLocalizedMemo, useNativeLocale, useTranslation } from '@/i18n';

import React, { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PrimaryButton, TextField } from '@/components/common/AppUI';
import {
  Box,
  Choice,
  Copy,
  Sheet,
  Toggle,
} from '@/components/slicing/Controls';
import {
  ProcessSettingsEditor,
  serializeIntentional,
} from '@/components/slicing/ProcessSettingsEditor';
import {
  slicingApi,
  type SliceSourceProps,
  type SourceFilament,
} from '@/api/slicing';
import { buildMediaUrl } from '@/api/http';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useSliceJobTracker } from '@/contexts/SliceJobTrackerContext';
import {
  BED_TYPES,
  buildSliceRequest,
  parseRef,
  refValue,
} from '@/utils/sliceConfiguration';
import {
  findPreset,
  findPresetByName,
  pickDefault,
  pickFilamentForSlot,
  pickProcessDefault,
  SLICE_MODAL_TIER_ORDER,
} from '@/utils/slicePresetPicker';
import {
  buildCompatibilityIndex,
  EMPTY_COMPATIBILITY_INDEX,
  presetCompatibility,
} from '@/utils/slicerPrinterMatch';
import type { PresetRef } from '@/types/api';
import type { SettingValue } from '@/types/slicerSettings';

export type SliceModalProps = SliceSourceProps & {
  visible: boolean;
  onClose: () => void;
  defaultAutoArrange?: boolean;
};
export function SliceModal(props: SliceModalProps) {
  useNativeLocale();
  return props.visible ? (
    <SliceForm key={`${props.sourceType}:${props.sourceId}`} {...props} />
  ) : null;
}
function SliceForm(props: SliceModalProps) {
  useNativeLocale();
  const { visible, onClose, defaultAutoArrange = false } = props;
  const { t } = useTranslation();
  const label = (text: string) => t(`slice.${text}`, { defaultValue: text });
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const { trackJob } = useSliceJobTracker();
  const client = useQueryClient();
  const [printer, setPrinter] = useState<PresetRef | null>(null);
  const [process, setProcess] = useState<PresetRef | null>(null);
  const [filaments, setFilaments] = useState<(PresetRef | null)[]>([]);
  const [colours, setColours] = useState<(string | null)[]>([]);
  const [plate, setPlate] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const [bed, setBed] = useState<string | null>(null);
  const [embedded, setEmbedded] = useState(false);
  const [orient, setOrient] = useState(false);
  const [arrange, setArrange] = useState(defaultAutoArrange);
  const [showOther, setShowOther] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, SettingValue>>({});
  const [sourceKeys, setSourceKeys] = useState<string[]>([]);
  const [valid, setValid] = useState(true);
  const [saveName, setSaveName] = useState<string | null>(null);
  const explicitSlots = useRef(new Set<number>());
  const presets = useQuery({
    queryKey: ['slicerPresets'],
    queryFn: () => slicingApi.presets(),
    enabled: visible,
  });
  const plates = useQuery({
    queryKey: ['slicePlates', props.sourceType, props.sourceId],
    queryFn: () => slicingApi.plates(props),
    enabled: visible,
  });
  const models = useQuery({
    queryKey: ['slicerPrinterModels'],
    queryFn: slicingApi.models,
    enabled: visible,
  });
  const index = useLocalizedMemo(
    () =>
      models.data
        ? buildCompatibilityIndex(models.data)
        : EMPTY_COMPATIBILITY_INDEX,
    [models.data],
  );
  const multi = !!plates.data?.is_multi_plate && plates.data.plates.length > 1;
  const requestId = useLocalizedMemo(
    () =>
      `${props.sourceType}-${props.sourceId}-${
        plate ?? 1
      }-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    [props.sourceType, props.sourceId, plate],
  );
  const requirements = useQuery({
    queryKey: [
      'sliceFilamentReqs',
      props.sourceType,
      props.sourceId,
      plate ?? 1,
    ],
    queryFn: ({ signal }) =>
      slicingApi.requirements(props, plate ?? 1, requestId, signal),
    enabled: visible && plates.isSuccess && (!multi || plate !== null),
  });
  const preview = useQuery({
    queryKey: ['slicePreview', requestId],
    queryFn: () => slicingApi.previewProgress(requestId),
    enabled: visible && requirements.isFetching,
    refetchInterval: 1000,
    retry: false,
  });
  const pipelines = useQuery({
    queryKey: ['slicer-pipelines'],
    queryFn: slicingApi.pipelines,
    enabled: visible && hasPermission('pipelines:read'),
  });
  const slots = useLocalizedMemo<SourceFilament[]>(() => {
    const result = requirements.data?.filaments;
    const base = result?.length
      ? result
      : [{ slot_id: 1, type: '', color: '' }];
    return all ? base.map(s => ({ ...s, used_in_plate: true })) : base;
  }, [requirements.data, all]);
  const selectedPrinter = presets.data
    ? findPreset(presets.data, printer, 'printer')
    : null;
  const presetValues = useQuery({
    queryKey: ['slicerPresetValues', process],
    queryFn: () => slicingApi.presetValues(process!),
    enabled: visible && !!process,
  });
  const canEmbed = !!(
    plates.data?.embedded_printer &&
    plates.data?.embedded_process &&
    selectedPrinter &&
    selectedPrinter.name.replace(/^#\s*/, '').trim().toLowerCase() ===
      plates.data.embedded_printer.replace(/^#\s*/, '').trim().toLowerCase()
  );
  useEffect(() => {
    if (!visible || !presets.data || !plates.isSuccess) return;
    const nextPrinter =
      printer ??
      findPresetByName(
        presets.data,
        'printer',
        plates.data?.embedded_printer ?? '',
      ) ??
      pickDefault(presets.data, 'printer');
    if (!printer) setPrinter(nextPrinter);
    if (!process)
      setProcess(
        pickProcessDefault(
          presets.data,
          findPreset(presets.data, nextPrinter, 'printer')?.name ?? '',
          index,
          plates.data?.embedded_process,
        ),
      );
  }, [
    visible,
    presets.data,
    plates.isSuccess,
    plates.data,
    printer,
    process,
    index,
  ]);
  useEffect(() => {
    if (!visible || !presets.data || !requirements.isSuccess) return;
    setFilaments(previous =>
      slots.map((slot, i) =>
        explicitSlots.current.has(i) && previous[i]
          ? previous[i]
          : pickFilamentForSlot(
              presets.data!,
              slot,
              selectedPrinter?.name ?? '',
              index,
            ),
      ),
    );
  }, [
    visible,
    presets.data,
    requirements.isSuccess,
    slots,
    selectedPrinter?.name,
    index,
  ]);
  useEffect(() => {
    if (!canEmbed) setEmbedded(false);
  }, [canEmbed]);
  const options = (slot: 'printer' | 'process' | 'filament') =>
    presets.data
      ? SLICE_MODAL_TIER_ORDER.flatMap(tier => presets.data![tier][slot])
          .filter(
            p =>
              slot === 'printer' ||
              showOther ||
              presetCompatibility(
                p,
                slot,
                selectedPrinter?.name ?? '',
                index,
              ) !== 'mismatch',
          )
          .map(p => ({ value: refValue(p), label: `[${p.source}] ${p.name}` }))
      : [];
  const body = () =>
    buildSliceRequest({
      printer,
      process,
      filaments,
      slots,
      colours,
      plate: all ? 0 : multi ? plate : null,
      bed,
      embedded,
      canEmbed,
      orient,
      arrange,
      sourceKeys,
      hasDesignOverrides: !!plates.data?.design_overrides?.length,
      overrides: serializeIntentional(
        overrides,
        presetValues.data?.values ?? {},
        plates.data?.design_overrides ?? [],
        sourceKeys,
      ),
    });
  const slice = useMutation({
    mutationFn: () => slicingApi.slice(props, body()),
    onSuccess: job => {
      trackJob(job.job_id, props);
      onClose();
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const save = useMutation({
    mutationFn: () => {
      const config = body();
      return slicingApi.create({
        name: saveName!.trim(),
        printer_preset: config.printer_preset!,
        process_preset: config.process_preset!,
        filament_presets: config.filament_presets!,
        bed_type: bed,
      });
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['slicer-pipelines'] });
      setSaveName(null);
      showToast(nativeMessage("native.ef8bc3a85815fbce"), 'success');
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const refresh = useMutation({
    mutationFn: () => slicingApi.presets(true),
    onSuccess: data => {
      client.setQueryData(['slicerPresets'], data);
      client.invalidateQueries({ queryKey: ['slicerPresetValues'] });
    },
  });
  const ready =
    requirements.isSuccess &&
    !!printer &&
    !!process &&
    filaments.length === slots.length &&
    filaments.every(Boolean) &&
    valid;
  return (
    <Sheet
      visible={visible}
      title={`${label('Slice file')}: ${props.sourceName}`}
      onClose={onClose}
    >
      {[presets, plates, requirements].map((q, i) =>
        q.isError ? (
          <Box key={i}>
            <Copy>{q.error.message}</Copy>
            <PrimaryButton label={label('Retry')} onPress={() => q.refetch()} />
          </Box>
        ) : null,
      )}
      {presets.data && (
        <Copy>{translateNative('native.6f17b31f20db67bc', { value0: String(presets.data.cloud_status), value1: String(presets.data.orca_cloud_status) })}</Copy>
      )}
      <PrimaryButton
        label={label('Refresh presets')}
        loading={refresh.isPending}
        onPress={() => refresh.mutate()}
      />
      {refresh.isError && <Copy>{refresh.error.message}</Copy>}
      {multi && (
        <>
          <Choice
            label={label('Plate')}
            value={String(plate ?? '')}
            onChange={v => {
              setPlate(Number(v));
              setColours([]);
              setFilaments([]);
              explicitSlots.current.clear();
            }}
            options={plates.data!.plates.map(p => ({
              value: String(p.index),
              label: `${p.index}: ${p.name ?? p.objects.join(', ')}`,
            }))}
          />
          {plates.data!.plates.map(p => (
            <Box key={p.index}>
              {p.thumbnail_url && (
                <Image
                  accessibilityLabel={p.name ?? label('Plate preview')}
                  source={{
                    uri: buildMediaUrl(
                      p.thumbnail_url.replace(/^\/api\/v1/, ''),
                    ),
                  }}
                  style={localStyles.thumbnail}
                />
              )}
              <PrimaryButton
                label={`${label('Select plate')} ${p.index}: ${
                  p.name ?? p.objects.join(', ')
                }${p.index === plate ? ' ✓' : ''}`}
                variant="secondary"
                onPress={() => {
                  setPlate(p.index);
                  setColours([]);
                  setFilaments([]);
                  explicitSlots.current.clear();
                }}
              />
            </Box>
          ))}
          <Toggle
            label={label('Slice all plates')}
            value={all}
            disabled={plate === null}
            onChange={setAll}
          />
        </>
      )}
      <Choice
        label={label('Printer preset')}
        value={refValue(printer)}
        options={options('printer')}
        onChange={v => {
          setPrinter(parseRef(v));
          setProcess(null);
        }}
      />
      <Toggle
        label={label('Use file built-in settings')}
        value={embedded}
        disabled={!canEmbed}
        onChange={setEmbedded}
      />
      {!canEmbed && (
        <Copy>
          {label(
            'Built-in settings require the source printer and process and a matching target printer.',
          )}
        </Copy>
      )}
      <Choice
        label={label('Process preset')}
        value={refValue(process)}
        options={options('process')}
        disabled={embedded}
        onChange={v => setProcess(parseRef(v))}
      />
      <Toggle
        label={label('Show other / incompatible presets')}
        value={showOther}
        onChange={setShowOther}
      />
      {requirements.isFetching && (
        <Copy>
          {preview.data
            ? `${preview.data.stage} ${preview.data.total_percent}%`
            : label(
                'Analyzing source filaments… This first preview may take a few minutes.',
              )}
        </Copy>
      )}
      {requirements.isSuccess &&
        slots.map((slot, i) => (
          <Box key={slot.slot_id}>
            <Copy>{`${label('Slot')} ${slot.slot_id} · ${slot.type} ${
              slot.color
            }${
              slot.used_in_plate === false
                ? ` · ${label('unused on this plate')}`
                : ''
            }`}</Copy>
            <Choice
              label={`${label('Filament preset')} ${slot.slot_id}`}
              value={refValue(filaments[i])}
              options={options('filament')}
              disabled={embedded || slot.used_in_plate === false}
              onChange={v => {
                explicitSlots.current.add(i);
                setFilaments(previous =>
                  slots.map((_, n) =>
                    n === i ? parseRef(v) : previous[n] ?? null,
                  ),
                );
              }}
            />
            <TextField
              label={label('Colour (#RRGGBB or #RRGGBBAA)')}
              value={colours[i] ?? slot.color ?? ''}
              editable={!embedded && slot.used_in_plate !== false}
              onChangeText={v =>
                setColours(previous =>
                  slots.map((_, n) => (n === i ? v : previous[n] ?? null)),
                )
              }
              autoCapitalize="none"
            />
            <PrimaryButton
              label={label('Reset colour')}
              disabled={embedded}
              variant="secondary"
              onPress={() =>
                setColours(previous =>
                  previous.map((v, n) => (n === i ? null : v)),
                )
              }
            />
          </Box>
        ))}
      <Choice
        label={label('Bed type')}
        value={bed ?? ''}
        disabled={embedded}
        onChange={v => setBed(v || null)}
        options={[
          { value: '', label: label('Preset default') },
          ...BED_TYPES.map(v => ({ value: v, label: v })),
        ]}
      />
      <Toggle
        label={label('Auto orient')}
        value={orient}
        onChange={setOrient}
      />
      <Toggle
        label={label('Auto arrange')}
        value={arrange}
        onChange={setArrange}
      />
      {pipelines.data && (
        <Choice
          label={label('Apply pipeline')}
          value=""
          disabled={!requirements.isSuccess || slice.isPending}
          options={pipelines.data.pipelines.map(p => ({
            value: String(p.id),
            label: p.name,
          }))}
          onChange={v => {
            const pipeline = pipelines.data!.pipelines.find(
              p => p.id === Number(v),
            )!;
            setPrinter(pipeline.printer_preset);
            setProcess(pipeline.process_preset);
            setBed(pipeline.bed_type);
            setFilaments(previous =>
              slots.map(
                (_, i) => pipeline.filament_presets[i] ?? previous[i] ?? null,
              ),
            );
            slots.forEach((_, i) => {
              if (pipeline.filament_presets[i]) explicitSlots.current.add(i);
            });
          }}
        />
      )}
      {hasPermission('pipelines:write') &&
        (saveName === null ? (
          <PrimaryButton
            label={label('Save current selections as pipeline')}
            disabled={!ready || embedded}
            onPress={() => setSaveName('')}
          />
        ) : (
          <Box>
            <TextField
              label={label('Pipeline name')}
              value={saveName}
              onChangeText={setSaveName}
            />
            <PrimaryButton
              label={label('Save pipeline')}
              disabled={!saveName.trim() || save.isPending}
              onPress={() => save.mutate()}
            />
            <PrimaryButton
              label={label('Cancel')}
              variant="secondary"
              onPress={() => setSaveName(null)}
            />
          </Box>
        ))}
      <ProcessSettingsEditor
        values={overrides}
        onChange={setOverrides}
        presetValues={presetValues.data?.values}
        resolved={presetValues.data?.resolved ?? false}
        reason={presetValues.data?.reason ?? presetValues.error?.message}
        source={plates.data?.design_overrides}
        sourceKeys={
          embedded
            ? (plates.data?.design_overrides ?? []).map(s => s.key)
            : sourceKeys
        }
        onSourceKeys={setSourceKeys}
        disabled={embedded}
        onValidityChange={setValid}
        filamentChoices={filaments.map((f, i) => ({
          value: String(i + 1),
          label: `${i + 1}: ${
            presets.data
              ? findPreset(presets.data, f, 'filament')?.name ??
                label('Unselected')
              : ''
          }`,
        }))}
      />
      <PrimaryButton
        label={all ? label('Slice all plates') : label('Slice')}
        disabled={!ready || slice.isPending}
        loading={slice.isPending}
        onPress={() => slice.mutate()}
      />
    </Sheet>
  );
}
const localStyles = StyleSheet.create({
  thumbnail: { width: '100%', height: 180, resizeMode: 'contain' },
});
