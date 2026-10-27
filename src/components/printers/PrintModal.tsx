import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  pick,
  types,
  isErrorWithCode,
  errorCodes,
} from '@react-native-documents/picker';
import { api } from '@/api/client';
import { filesApi } from '@/api/files';
import { request } from '@/api/http';
import { printLaunchApi, type PrintSource } from '@/api/printLaunch';
import { queueApi } from '@/api/queue';
import {
  PrimaryButton,
  SearchBar,
  SectionCard,
} from '@/components/common/AppUI';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import {
  Choice,
  LaunchField,
  LaunchText,
  PrintOptionsForm,
} from './PrintOptionsForm';
import { PrintSchedulePicker } from './PrintSchedulePicker';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { useTranslation } from '@/i18n';
import { spacing } from '@/theme/tokens';
import type {
  LibraryFolderTree,
  PrintLaunchRequirement,
  PrintQueueItem,
  PrintQueueItemCreate,
  PrintQueueItemUpdate,
  QueueVariant,
} from '@/types/api';
import { isRecord, pickNumber, pickString } from '@/utils/data';
import {
  calibration,
  colorKey,
  compatibleModels,
  filamentShortages,
  loadedTrays,
  rackOptions,
  savedArchiveMapping,
  scheduleTime,
  suggestedMapping,
  trayId,
} from '@/utils/printLaunch';

export interface PrintModalProps {
  visible: boolean;
  onClose: () => void;
  initialPrinterId?: number | null;
  initialFileId?: number | null;
  initialArchiveId?: number | null;
  initialMode?: 'asap' | 'queue' | 'scheduled';
  queueItem?: PrintQueueItem | null;
  requeue?: boolean;
  uploadForPrinter?: boolean;
  variantFiles?: QueueVariant[];
  onSuccess?: () => void;
}

const initialOptions: PrintQueueItemUpdate = {
  bed_levelling: 'auto',
  flow_cali: 'auto',
  nozzle_offset_cali: 'auto',
  vibration_cali: true,
  layer_inspect: false,
  timelapse: false,
  use_ams: true,
  confirm_outcome: false,
  preheat_override: 'inherit',
  preheat_chamber_target_override: null,
  manual_start: false,
  require_previous_success: false,
  auto_off_after: false,
  gcode_injection: false,
};
const mappingKey = (printer: number, plate: number | null) =>
  `${printer}:${plate ?? 'single'}`;

function VariantPlate({
  candidate,
  onChange,
  onUp,
  onDown,
  onRemove,
}: {
  candidate: QueueVariant;
  onChange: (value: QueueVariant) => void;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const plates = useQuery({
    queryKey: ['launchPlates', 'library', candidate.library_file_id],
    queryFn: () =>
      printLaunchApi.plates({ kind: 'library', id: candidate.library_file_id }),
  });
  const metadata = useQuery({
    queryKey: ['launchSource', 'library', candidate.library_file_id],
    queryFn: () =>
      printLaunchApi.metadata({
        kind: 'library',
        id: candidate.library_file_id,
      }),
  });
  const requirements = useQuery({
    queryKey: [
      'launchRequirements',
      'library',
      candidate.library_file_id,
      candidate.plate_id ?? null,
    ],
    queryFn: () =>
      printLaunchApi.requirements(
        { kind: 'library', id: candidate.library_file_id },
        candidate.plate_id,
      ),
  });
  const declaredModel =
    pickString(metadata.data, ['sliced_for_model']) ||
    (isRecord(metadata.data?.metadata)
      ? pickString(metadata.data.metadata, ['sliced_for_model'])
      : '');
  return (
    <SectionCard title={candidate.filename ?? `#${candidate.library_file_id}`}>
      <LaunchText>
        {declaredModel ||
          candidate.target_model ||
          'Model metadata is missing: choose its intended model'}
      </LaunchText>
      {!declaredModel && (
        <LaunchField
          label="Candidate model (only for slices without model metadata)"
          value={candidate.target_model ?? ''}
          onChange={target_model =>
            onChange({ ...candidate, target_model: target_model || undefined })
          }
        />
      )}
      <LaunchText>
        {(requirements.data?.filaments ?? [])
          .map(r => `${r.slot_id} ${r.type} ${r.color} ${r.used_grams}g`)
          .join(' · ')}
      </LaunchText>
      <Choice
        label="Candidate plate"
        value={candidate.plate_id ?? null}
        options={[
          { value: null, label: 'Default plate' },
          ...(plates.data?.plates ?? []).map(p => ({
            value: p.index,
            label: `${p.index}: ${p.name ?? ''}`,
          })),
        ]}
        onChange={plate_id => onChange({ ...candidate, plate_id })}
      />
      <View style={styles.row}>
        <PrimaryButton
          label={t('printing.up', { defaultValue: 'Prefer earlier' })}
          variant="secondary"
          onPress={onUp}
        />
        <PrimaryButton
          label={t('printing.down', { defaultValue: 'Prefer later' })}
          variant="secondary"
          onPress={onDown}
        />
        <PrimaryButton
          label={t('common.remove', { defaultValue: 'Remove' })}
          variant="secondary"
          onPress={onRemove}
        />
      </View>
    </SectionCard>
  );
}

export function PrintModal(props: PrintModalProps) {
  const { visible, queueItem, requeue = false, onClose, onSuccess } = props;
  const editing = !!queueItem && !requeue;
  const { t } = useTranslation();
  const tr = (label: string) =>
    t(`printing.${label.replace(/\W/g, '')}`, { defaultValue: label });
  const { colors } = useTheme();
  const { hasPermission, user } = useAuth();
  const { showToast } = useToast();
  const client = useQueryClient();
  const [source, setSource] = useState<PrintSource | null>(null);
  const [printerIds, setPrinterIds] = useState<number[]>([]);
  const [targetMode, setTargetMode] = useState<
    'printer' | 'model' | 'variants'
  >('printer');
  const [model, setModel] = useState('');
  const [location, setLocation] = useState('');
  const [mode, setMode] = useState<'asap' | 'queue' | 'scheduled'>('asap');
  const [date, setDate] = useState('');
  const [options, setOptions] = useState<PrintQueueItemUpdate>(initialOptions);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>(
    {},
  );
  const [mappings, setMappings] = useState<Record<string, number[]>>({});
  const [rackChoices, setRackChoices] = useState<
    Record<string, Record<number, number>>
  >({});
  const [overrides, setOverrides] = useState<
    Record<
      string,
      Record<number, { type: string; color: string; tray_info_idx?: string }>
    >
  >({});
  const [exact, setExact] = useState(false);
  const [forceMatches, setForceMatches] = useState<
    Record<string, Record<number, boolean>>
  >({});
  const [candidates, setCandidates] = useState<QueueVariant[]>([]);
  const [costCenterId, setCostCenterId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState<number | undefined>();
  const [browse, setBrowse] = useState(false);
  const [stagger, setStagger] = useState(false);
  const [groupSize, setGroupSize] = useState('1');
  const [interval, setInterval] = useState('5');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const stagedFile = useRef<number | null>(null);
  const submitted = useRef(new Set<string>());
  const batchId = useRef<number | null>(null);
  const initialized = useRef(false);
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
    enabled: visible,
  });
  const printers = useQuery({
    queryKey: ['printers'],
    queryFn: api.getPrinters,
    enabled: visible,
  });
  const files = useQuery({
    queryKey: ['libraryFiles', folder],
    queryFn: () => api.getLibraryFiles(folder),
    enabled: visible && !editing && !props.uploadForPrinter && browse,
  });
  const folders = useQuery({
    queryKey: ['libraryFolders'],
    queryFn: filesApi.getLibraryFolders,
    enabled: visible && !editing && !props.uploadForPrinter && browse,
  });
  const metadata = useQuery({
    queryKey: ['launchSource', source?.kind, source?.id],
    queryFn: () => printLaunchApi.metadata(source!),
    enabled: visible && !!source,
  });
  const platesQuery = useQuery({
    queryKey: ['launchPlates', source?.kind, source?.id],
    queryFn: () => printLaunchApi.plates(source!),
    enabled: visible && !!source,
  });
  const plates = useMemo(
    () => platesQuery.data?.plates ?? [],
    [platesQuery.data],
  );
  const plateIds: Array<number | null> = plates.length
    ? [
        ...(queueItem?.plate_id === null ? [null] : []),
        ...plates.map(p => p.index),
      ]
    : [queueItem?.plate_id ?? null];
  const chosenPlates = plateIds.filter(id => (quantities[String(id)] ?? 0) > 0);
  const requirements = useQueries({
    queries: chosenPlates.map(id => ({
      queryKey: ['launchRequirements', source?.kind, source?.id, id],
      queryFn: () => printLaunchApi.requirements(source!, id),
      enabled: visible && !!source,
    })),
  });
  const statuses = useQueries({
    queries: printerIds.map(id => ({
      queryKey: ['printerStatus', id],
      queryFn: () => api.getPrinterStatus(id),
      enabled: visible,
    })),
  });
  const inventories = useQueries({
    queries: printerIds.map(id => ({
      queryKey: ['printer-inventory-remain', id],
      queryFn: () => printLaunchApi.inventory(id),
      enabled: visible,
      refetchOnMount: 'always' as const,
    })),
  });
  const assignments = useQueries({
    queries: printerIds.map(id => ({
      queryKey: ['launchAssignments', id],
      queryFn: () =>
        request<
          Array<{
            ams_id: number;
            tray_id: number;
            spool?: { cost_per_kg?: number | null };
          }>
        >(`/inventory/assignments?printer_id=${id}`),
      enabled: visible,
    })),
  });
  const billing = settings.data?.billing_enabled === true;
  const centers = useQuery({
    queryKey: ['finance', 'cost-centers', 'mine'],
    queryFn: printLaunchApi.costCenters,
    enabled: visible && billing,
  });
  const allowedCenters = (centers.data ?? []).filter(
    c => c.is_active && c.can_print,
  );
  const center = allowedCenters.find(c => c.id === costCenterId);
  const available = useQuery({
    queryKey: ['available-filaments', model, location],
    queryFn: () =>
      printLaunchApi.availableFilaments(model, location || undefined),
    enabled: visible && targetMode === 'model' && !!model,
  });
  const slicedModel =
    pickString(metadata.data, ['sliced_for_model']) ||
    (isRecord(metadata.data?.metadata)
      ? pickString(metadata.data.metadata, ['sliced_for_model'])
      : '');
  const eligible = (printers.data ?? []).filter(
    p => p.is_active !== false && compatibleModels(slicedModel, p.model),
  );
  const canEdit = editing
    ? hasPermission('queue:update_all') ||
      (queueItem?.created_by_id === user?.id &&
        hasPermission('queue:update_own'))
    : hasPermission('queue:create');
  const injectionAllowed = !!settings.data?.gcode_snippets;

  useEffect(() => {
    if (!visible) {
      initialized.current = false;
      return;
    }
    const archiveId = queueItem?.archive_id ?? props.initialArchiveId;
    const fileId = queueItem?.library_file_id ?? props.initialFileId;
    setBrowse(!archiveId && !fileId && !props.variantFiles?.length);
    setSource(
      archiveId
        ? { kind: 'archive', id: archiveId }
        : fileId
        ? { kind: 'library', id: fileId }
        : null,
    );
    setPrinterIds(
      queueItem?.printer_id
        ? [queueItem.printer_id]
        : props.initialPrinterId
        ? [props.initialPrinterId]
        : [],
    );
    setTargetMode(
      (queueItem?.variants?.length ?? props.variantFiles?.length ?? 0) > 1
        ? 'variants'
        : queueItem?.target_model
        ? 'model'
        : 'printer',
    );
    setModel(queueItem?.target_model ?? '');
    setLocation(queueItem?.target_location ?? '');
    setMode(
      queueItem?.scheduled_time && !requeue
        ? 'scheduled'
        : props.initialMode ?? 'queue',
    );
    setDate(!requeue ? queueItem?.scheduled_time ?? '' : '');
    setOptions(
      queueItem
        ? {
            ...initialOptions,
            ...Object.fromEntries(
              Object.keys(initialOptions).map(k => [
                k,
                queueItem[k as keyof PrintQueueItem] ??
                  initialOptions[k as keyof PrintQueueItemUpdate],
              ]),
            ),
            nozzle_rack_choice: queueItem.nozzle_rack_choice,
            cost_center_id: queueItem.cost_center_id,
          }
        : initialOptions,
    );
    setQuantities(queueItem ? { [String(queueItem.plate_id)]: 1 } : {});
    setQuantityDrafts({});
    setMappings(
      queueItem?.printer_id && queueItem.ams_mapping
        ? {
            [mappingKey(queueItem.printer_id, queueItem.plate_id)]:
              queueItem.ams_mapping,
          }
        : {},
    );
    setRackChoices(
      queueItem?.printer_id && queueItem.nozzle_rack_choice
        ? {
            [mappingKey(queueItem.printer_id, queueItem.plate_id)]:
              queueItem.nozzle_rack_choice,
          }
        : {},
    );
    setOverrides(
      queueItem?.filament_overrides
        ? {
            [String(queueItem.plate_id)]: Object.fromEntries(
              queueItem.filament_overrides.map(f => [
                f.slot_id,
                {
                  type: f.type,
                  color: f.color,
                  tray_info_idx: f.tray_info_idx ?? undefined,
                },
              ]),
            ),
          }
        : {},
    );
    setCandidates(queueItem?.variants ?? props.variantFiles ?? []);
    setExact(false);
    setForceMatches(
      queueItem?.filament_overrides
        ? {
            [String(queueItem.plate_id)]: Object.fromEntries(
              queueItem.filament_overrides.map(f => [
                f.slot_id,
                f.force_color_match === true,
              ]),
            ),
          }
        : {},
    );
    setCostCenterId(queueItem?.cost_center_id ?? null);
    setError('');
    setProgress('');
    setWarning('');
    setStagger(false);
    setSearch('');
    setFolder(undefined);
    submitted.current.clear();
    batchId.current = null;
    initialized.current = false;
    // Opening the modal starts an isolated draft. Refetching must not overwrite edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    visible,
    queueItem?.id,
    props.initialFileId,
    props.initialArchiveId,
    props.initialPrinterId,
  ]);

  useEffect(() => {
    if (!visible || !settings.data || queueItem || initialized.current) return;
    initialized.current = true;
    const s = settings.data;
    setOptions(current => ({
      ...current,
      bed_levelling: calibration(s.default_bed_levelling),
      flow_cali: calibration(s.default_flow_cali),
      nozzle_offset_cali: calibration(s.default_nozzle_offset_cali),
      vibration_cali: s.default_vibration_cali !== false,
      timelapse: s.default_timelapse === true,
      layer_inspect: s.default_layer_inspect === true,
      confirm_outcome: s.default_confirm_outcome === true,
    }));
  }, [settings.data, visible, queueItem]);
  useEffect(() => {
    if (!visible || !source || platesQuery.isPending) return;
    setQuantities(current =>
      Object.keys(current).length
        ? current
        : { [String(plates[0]?.index ?? null)]: 1 },
    );
  }, [visible, source, platesQuery.isPending, plates]);
  useEffect(() => {
    if (costCenterId == null && allowedCenters.length)
      setCostCenterId(
        (allowedCenters.find(c => c.is_private) ?? allowedCenters[0]).id,
      );
  }, [allowedCenters, costCenterId]);

  const reqsFor = (plateId: number | null): PrintLaunchRequirement[] => {
    const raw =
      requirements[chosenPlates.indexOf(plateId)]?.data?.filaments ?? [];
    return raw.map(r => {
      return {
        ...r,
        ...overrides[String(plateId)]?.[r.slot_id],
        force_color_match: forceMatches[String(plateId)]?.[r.slot_id] ?? false,
      };
    });
  };
  const mappingFor = (printerId: number, plateId: number | null) =>
    mappings[mappingKey(printerId, plateId)] ??
    suggestedMapping(
      reqsFor(plateId),
      statuses[printerIds.indexOf(printerId)]?.data,
      exact,
    );
  const dispatchMappingFor = (printerId: number, plateId: number | null) => {
    const mapping = mappingFor(printerId, plateId);
    return reqsFor(plateId).every(r => (mapping[r.slot_id - 1] ?? -1) >= 0)
      ? mapping
      : undefined;
  };
  const estimateFor = (printerId: number | null, plateId: number | null) => {
    let total = 0,
      known = true;
    const reqs = reqsFor(plateId);
    const costs = assignments[printerIds.indexOf(printerId ?? -1)]?.data ?? [];
    const mapping =
      printerId != null ? mappingFor(printerId, plateId) : undefined;
    reqs.forEach(r => {
      const cost =
        costs.find(
          a =>
            trayId(a.ams_id, a.tray_id, a.ams_id === 255) ===
            mapping?.[r.slot_id - 1],
        )?.spool?.cost_per_kg ??
        Number(settings.data?.default_filament_cost ?? 0);
      if (!(cost > 0)) known = false;
      total += (r.used_grams / 1000) * (cost || 0);
    });
    return known && reqs.length ? total : null;
  };
  const selectedTargets = targetMode === 'printer' ? printerIds : [null];
  const estimates = selectedTargets.flatMap(p =>
    chosenPlates.map(plate => ({
      cost: estimateFor(p, plate),
      quantity: quantities[String(plate)],
    })),
  );
  const totalCost =
    estimates.every(e => e.cost != null) && estimates.length
      ? estimates.reduce((sum, e) => sum + e.cost! * e.quantity, 0)
      : null;
  const totalRuns =
    chosenPlates.reduce<number>((sum, id) => sum + quantities[String(id)], 0) *
    (targetMode === 'printer' ? printerIds.length : 1);
  const budgetBlocked =
    billing &&
    (!center ||
      (center.budget_available != null &&
        totalCost != null &&
        totalCost > center.budget_available));

  const close = async () => {
    if (busy) return;
    if (stagedFile.current != null && submitted.current.size === 0) {
      try {
        await request(`/library/files/${stagedFile.current}`, {
          method: 'DELETE',
        });
        stagedFile.current = null;
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : tr('Unable to clean up staged upload'),
        );
        return;
      }
    }
    onClose();
  };
  const upload = async () => {
    let uploadedId: number | null = null;
    try {
      const [asset] = await pick({
        type: [types.allFiles],
        presentationStyle: 'fullScreen',
      });
      if (!/\.gcode(?:\.3mf)?$/i.test(asset.name ?? ''))
        throw new Error(
          tr('Only sliced .gcode or .gcode.3mf files can be printed.'),
        );
      setUploadProgress(0);
      setBusy(true);
      const record = await filesApi.uploadLibraryFile(
        {
          uri: asset.uri,
          name: asset.name!,
          type: asset.type ?? 'application/octet-stream',
        },
        null,
        setUploadProgress,
      );
      uploadedId = Number(record.id);
      if (!Number.isFinite(uploadedId))
        throw new Error(tr('Upload did not return a file ID.'));
      const file = await printLaunchApi.metadata({
        kind: 'library',
        id: uploadedId,
      });
      const uploadedModel =
        pickString(file, ['sliced_for_model']) ||
        (isRecord(file.metadata)
          ? pickString(file.metadata, ['sliced_for_model'])
          : '');
      const target = printers.data?.find(p => p.id === props.initialPrinterId);
      if (!compatibleModels(uploadedModel, target?.model))
        throw new Error(
          tr(
            `File targets ${uploadedModel}; selected printer is ${target?.model}.`,
          ),
        );
      stagedFile.current = uploadedId;
      setSource({ kind: 'library', id: uploadedId });
      setQuantities({});
      setQuantityDrafts({});
      setMappings({});
      setPrinterIds(props.initialPrinterId ? [props.initialPrinterId] : []);
    } catch (e) {
      if (uploadedId != null) {
        try {
          await request(`/library/files/${uploadedId}`, { method: 'DELETE' });
        } catch (cleanupError) {
          stagedFile.current = uploadedId;
          setError(String(cleanupError));
        }
      }
      if (!(isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED))
        setError(e instanceof Error ? e.message : tr('Upload failed'));
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  };
  const submit = async (skipFilamentCheck = false) => {
    setError('');
    setWarning('');
    try {
      if (!canEdit)
        throw new Error(tr('You do not have permission to change these jobs.'));
      if (budgetBlocked)
        throw new Error(tr('No usable cost center or insufficient budget.'));
      if (targetMode !== 'variants' && (!source || !chosenPlates.length))
        throw new Error(tr('Choose a source and at least one plate.'));
      if (
        targetMode === 'printer' &&
        (!printerIds.length ||
          printerIds.some(id => !eligible.some(p => p.id === id)))
      )
        throw new Error(tr('Select compatible active printers.'));
      if (
        targetMode === 'model' &&
        (!model || !compatibleModels(slicedModel, model))
      )
        throw new Error(tr('Choose a compatible target model.'));
      if (targetMode === 'variants' && candidates.length < 2)
        throw new Error(tr('Choose at least two alternative slices.'));
      if (
        targetMode !== 'variants' &&
        (requirements.some(q => q.isPending || q.isError) ||
          metadata.isPending ||
          metadata.isError ||
          platesQuery.isPending ||
          platesQuery.isError)
      )
        throw new Error(
          tr(
            'Wait for source plates and filament requirements to load successfully.',
          ),
        );
      const scheduled = scheduleTime(mode, date);
      if (
        Object.values(quantities).some(
          q => !Number.isInteger(q) || q < 0 || q > 999,
        ) ||
        chosenPlates.some(
          id =>
            quantityDrafts[String(id)] !== undefined &&
            (!/^\d+$/.test(quantityDrafts[String(id)]) ||
              Number(quantityDrafts[String(id)]) < 1 ||
              Number(quantityDrafts[String(id)]) > 999),
        )
      )
        throw new Error(tr('Copies must be whole numbers from 1 to 999.'));
      if (
        options.preheat_chamber_target_override != null &&
        (!Number.isInteger(options.preheat_chamber_target_override) ||
          options.preheat_chamber_target_override < 0 ||
          options.preheat_chamber_target_override > 65)
      )
        throw new Error(
          tr('Chamber target must be an integer between 0 and 65 °C.'),
        );
      if (
        stagger &&
        (!Number.isInteger(Number(groupSize)) ||
          Number(groupSize) < 1 ||
          !(Number(interval) > 0))
      )
        throw new Error(
          tr(
            'Stagger requires a positive whole group size and a positive interval.',
          ),
        );
      if (targetMode === 'printer') {
        for (const [pi, printerId] of printerIds.entries()) {
          for (const plate of chosenPlates) {
            const reqs = reqsFor(plate);
            const review = mappingFor(printerId, plate);
            const trays = loadedTrays(statuses[pi]?.data);
            if (
              reqs.some(r => {
                if (!exact && !r.force_color_match) return false;
                const tray = trays.find(
                  item => item.id === review[r.slot_id - 1],
                );
                return (
                  !tray ||
                  colorKey(tray.color) !== colorKey(r.color) ||
                  tray.type.toUpperCase() !== r.type.toUpperCase()
                );
              })
            )
              throw new Error(
                tr(
                  'Exact color mapping is required; review missing or mismatched slots.',
                ),
              );
            const choices = rackChoices[mappingKey(printerId, plate)] ?? {};
            const groups = new Map(
              reqs
                .filter(r => r.group_id != null && r.group?.on_rack)
                .map(r => [r.group_id!, r.group!]),
            );
            const positions = new Set<number>();
            for (const [groupId, group] of groups) {
              const position = choices[groupId];
              if (position == null) continue;
              if (
                positions.has(position) ||
                !rackOptions(statuses[pi]?.data?.nozzle_rack, group).some(
                  o => o.position === position && o.eligible,
                )
              )
                throw new Error(
                  tr(
                    'Rack choices must be distinct and match the live nozzle diameter and flow type.',
                  ),
                );
              positions.add(position);
            }
          }
        }
      }
      if (
        !skipFilamentCheck &&
        !editing &&
        targetMode === 'printer' &&
        settings.data?.disable_filament_warnings !== true
      ) {
        if (
          inventories.some(q => q.isPending) ||
          statuses.some(q => q.isPending)
        )
          throw new Error(tr('Wait for live printer and stock checks.'));
        const warnings = printerIds.flatMap((id, i) =>
          filamentShortages(
            chosenPlates.map(plate => ({
              requirements: reqsFor(plate),
              mapping: dispatchMappingFor(id, plate),
              quantity: quantities[String(plate)],
            })),
            inventories[i]?.data,
            statuses[i]?.data?.ams_filament_backup === true,
          ).map(pool =>
            t('printing.shortageLine', {
              defaultValue:
                '{{printer}} · Slots {{slots}} · {{required}}g required / {{remaining}}g remaining{{pool}}',
              printer: printers.data?.find(p => p.id === id)?.name,
              slots: pool.ids.join(', '),
              required: pool.required.toFixed(1),
              remaining: pool.remaining.toFixed(1),
              pool:
                pool.ids.length > 1 ? tr(' (backup pool, same extruder)') : '',
            }),
          ),
        );
        if (warnings.length) {
          setWarning(warnings.join('\n'));
          return;
        }
      }
      setBusy(true);
      if (targetMode === 'variants') {
        if (editing)
          await queueApi.updateQueueItem(queueItem!.id, {
            ...options,
            target_location: location || null,
            scheduled_time: scheduled,
          });
        else {
          const reviewed: QueueVariant[] = [];
          for (const candidate of candidates) {
            const candidateSource: PrintSource = {
              kind: 'library',
              id: candidate.library_file_id,
            };
            const details = await client.fetchQuery({
              queryKey: ['launchSource', 'library', candidate.library_file_id],
              queryFn: () => printLaunchApi.metadata(candidateSource),
            });
            const declared =
              pickString(details, ['sliced_for_model']) ||
              (isRecord(details.metadata)
                ? pickString(details.metadata, ['sliced_for_model'])
                : '');
            if (!declared && !candidate.target_model)
              throw new Error(
                tr(
                  'Every alternative needs its sliced model or an explicit legacy target model.',
                ),
              );
            if (!compatibleModels(declared, candidate.target_model))
              throw new Error(
                tr(
                  'An alternative target model is incompatible with its slice.',
                ),
              );
            reviewed.push({
              ...candidate,
              target_model: candidate.target_model || declared,
            });
          }
          await queueApi.addToQueue({
            ...options,
            variants: reviewed,
            target_location: location || null,
            scheduled_time: scheduled,
            quantity: 1,
            cost_center_id: billing ? costCenterId : undefined,
            insert_at_top: mode === 'asap',
            manual_start: mode === 'queue' && options.manual_start === true,
            gcode_injection:
              injectionAllowed && options.gcode_injection === true,
          });
        }
      } else {
        if (
          !editing &&
          totalRuns > 1 &&
          selectedTargets.length === 1 &&
          batchId.current == null
        ) {
          const batch = await queueApi.createBatch({
            name: `${pickString(
              metadata.data,
              ['print_name', 'filename', 'name'],
              'Print',
            )} ×${totalRuns}`,
            ...(source!.kind === 'library'
              ? { library_file_id: source!.id }
              : { archive_id: source!.id }),
            plates: chosenPlates.map((plate, i) => ({
              plate_id: plate,
              plate_name: plates.find(p => p.index === plate)?.name,
              quantity_target: quantities[String(plate)],
              sort_order: i,
            })),
          });
          batchId.current = batch.id;
        }
        let insertion = 1;
        for (const [targetIndex, printerId] of selectedTargets.entries()) {
          for (const plate of chosenPlates) {
            const key = mappingKey(printerId ?? 0, plate);
            const count = editing ? 1 : quantities[String(plate)];
            if (submitted.current.has(key)) {
              insertion += count;
              continue;
            }
            const mapping =
              printerId == null
                ? undefined
                : dispatchMappingFor(printerId, plate);
            const reqs = reqsFor(plate);
            const data: PrintQueueItemCreate = {
              ...options,
              ...(source!.kind === 'library'
                ? { library_file_id: source!.id }
                : { archive_id: source!.id }),
              printer_id: printerId,
              target_model: targetMode === 'model' ? model : null,
              target_location: targetMode === 'model' ? location || null : null,
              scheduled_time: stagger
                ? new Date(
                    (scheduled ? new Date(scheduled).getTime() : Date.now()) +
                      Math.floor(targetIndex / Number(groupSize)) *
                        Number(interval) *
                        60000,
                  ).toISOString()
                : scheduled,
              manual_start: mode === 'queue' && options.manual_start === true,
              plate_id: plate,
              ams_mapping: mapping,
              nozzle_rack_choice:
                printerId != null ? rackChoices[key] ?? null : undefined,
              filament_overrides: reqs.map(r => ({
                slot_id: r.slot_id,
                type: r.type,
                color: r.color,
                force_color_match: exact || r.force_color_match,
                ...(r.tray_info_idx ? { tray_info_idx: r.tray_info_idx } : {}),
              })),
              gcode_injection:
                injectionAllowed && options.gcode_injection === true,
              preheat_chamber_target_override:
                options.preheat_override === 'off'
                  ? null
                  : options.preheat_chamber_target_override,
              skip_filament_check: skipFilamentCheck,
              quantity: count,
              batch_id: batchId.current,
              cost_center_id: billing ? costCenterId : undefined,
              estimated_cost: estimateFor(printerId, plate),
              cleanup_library_after_dispatch:
                stagedFile.current === source?.id ||
                queueItem?.cleanup_library_after_dispatch,
              insert_at_top: mode === 'asap',
              insert_position: mode === 'asap' ? insertion : undefined,
            };
            if (editing) {
              const immutable = new Set([
                'library_file_id',
                'archive_id',
                'quantity',
                'batch_id',
                'skip_filament_check',
                'cleanup_library_after_dispatch',
                'insert_at_top',
                'insert_position',
              ]);
              const update = Object.fromEntries(
                Object.entries(data).filter(([field]) => !immutable.has(field)),
              ) as PrintQueueItemUpdate;
              await queueApi.updateQueueItem(queueItem!.id, update);
            } else await queueApi.addToQueue(data);
            insertion += count;
            submitted.current.add(key);
            setProgress(
              `${submitted.current.size}/${
                selectedTargets.length * chosenPlates.length
              }`,
            );
          }
        }
      }
      await Promise.all([
        client.invalidateQueries({ queryKey: ['queue'] }),
        client.invalidateQueries({ queryKey: ['queueBatches'] }),
        client.invalidateQueries({ queryKey: ['printerStatus'] }),
      ]);
      stagedFile.current = null;
      showToast(
        tr(editing ? 'Queue item saved' : 'Print jobs queued'),
        'success',
      );
      onSuccess?.();
      onClose();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : tr('Unable to submit print jobs');
      setError(message);
      // Completed target/plate requests are remembered; retry never creates duplicates.
      if (submitted.current.size)
        await client.invalidateQueries({ queryKey: ['queue'] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={() => {
        void close();
      }}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <LaunchText>
          {editing
            ? 'Edit queued print'
            : requeue
            ? 'Configure requeue'
            : 'Configure print'}
        </LaunchText>
        <ScrollView contentContainerStyle={styles.content}>
          {error ? <LaunchText>{error}</LaunchText> : null}
          {uploadProgress != null && (
            <LaunchText>{`${tr('Uploading')} ${Math.round(
              uploadProgress,
            )}%`}</LaunchText>
          )}
          {props.uploadForPrinter &&
            !editing &&
            hasPermission('library:upload') && (
              <PrimaryButton
                label={tr('Choose local sliced file')}
                onPress={() => {
                  void upload();
                }}
                disabled={busy || source != null}
              />
            )}
          {!editing && !props.uploadForPrinter && (
            <>
              <PrimaryButton
                label={tr(
                  browse
                    ? 'Hide source browser'
                    : 'Browse library / choose another source',
                )}
                variant="secondary"
                disabled={busy || submitted.current.size > 0}
                onPress={() => setBrowse(current => !current)}
              />
              {browse && (
                <>
                  <SearchBar
                    value={search}
                    onChangeText={setSearch}
                    placeholder={tr('Search printable library files')}
                  />
                  {folder != null && (
                    <PrimaryButton
                      variant="secondary"
                      label={tr('Library root')}
                      onPress={() => setFolder(undefined)}
                    />
                  )}
                  {(() => {
                    const flatten = (
                      nodes?: LibraryFolderTree[],
                    ): LibraryFolderTree[] =>
                      (nodes ?? []).flatMap(node => [
                        node,
                        ...flatten(node.children),
                      ]);
                    return flatten(folders.data)
                      .filter(node => (node.parent_id ?? undefined) === folder)
                      .map(node => (
                        <PrimaryButton
                          key={`tree-${node.id}`}
                          variant="secondary"
                          label={`📁 ${node.name}`}
                          onPress={() => setFolder(node.id)}
                        />
                      ));
                  })()}
                  {(files.data ?? [])
                    .filter(isRecord)
                    .filter(
                      f =>
                        !search ||
                        pickString(f, ['filename', 'name'])
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                    )
                    .map(f => {
                      const id = pickNumber(f, ['id']),
                        name = pickString(f, [
                          'print_name',
                          'filename',
                          'name',
                        ]);
                      if (f.is_folder === true || f.type === 'folder')
                        return (
                          <PrimaryButton
                            key={`folder-${id}`}
                            variant="secondary"
                            label={`📁 ${name}`}
                            onPress={() => setFolder(id)}
                          />
                        );
                      if (!/\.gcode(?:\.3mf)?$|\.3mf$/i.test(name)) return null;
                      return (
                        <View key={id} style={styles.row}>
                          <PrimaryButton
                            variant={
                              source?.kind === 'library' && source.id === id
                                ? 'primary'
                                : 'secondary'
                            }
                            label={name}
                            disabled={busy || submitted.current.size > 0}
                            onPress={() => {
                              setSource({ kind: 'library', id });
                              setQuantities({});
                              setQuantityDrafts({});
                              setMappings({});
                              setRackChoices({});
                              setOverrides({});
                              setForceMatches({});
                              setBrowse(false);
                            }}
                          />
                          {targetMode === 'variants' && (
                            <PrimaryButton
                              variant="secondary"
                              label={tr('Add alternative')}
                              onPress={() => {
                                if (
                                  !candidates.some(
                                    c => c.library_file_id === id,
                                  )
                                )
                                  setCandidates([
                                    ...candidates,
                                    {
                                      library_file_id: id,
                                      filename: name,
                                      target_model:
                                        pickString(f, ['sliced_for_model']) ||
                                        undefined,
                                    },
                                  ]);
                              }}
                            />
                          )}
                        </View>
                      );
                    })}
                  {files.isError && (
                    <LaunchText>
                      {tr('Unable to load library files')}
                    </LaunchText>
                  )}
                </>
              )}
            </>
          )}
          {source && (
            <LaunchText>{`${
              source.kind === 'archive' ? tr('Archive') : tr('Library')
            }: ${pickString(
              metadata.data,
              ['print_name', 'filename', 'name'],
              `#${source.id}`,
            )} · ${slicedModel || tr('Unknown model')}`}</LaunchText>
          )}
          {!editing && (
            <Choice
              label="Assignment"
              value={targetMode}
              options={[
                { value: 'printer', label: 'Specific printers' },
                { value: 'model', label: 'Any compatible model' },
                {
                  value: 'variants',
                  label: 'Alternative slices: one cross-model job',
                },
              ]}
              onChange={v => {
                setTargetMode(v);
                if (v !== 'printer') setPrinterIds([]);
                if (v === 'variants' && candidates.length < 2) setBrowse(true);
              }}
            />
          )}
          {targetMode === 'variants' ? (
            <>
              <LaunchText>
                Only one candidate prints. Preference order below; each
                candidate retains its own plate.
              </LaunchText>
              {editing ? (
                <LaunchText>
                  Existing alternatives are preserved. Requeue this run to
                  change candidate plates and preference.
                </LaunchText>
              ) : (
                candidates.map((candidate, i) => (
                  <VariantPlate
                    key={candidate.library_file_id}
                    candidate={candidate}
                    onChange={value =>
                      setCandidates(current =>
                        current.map((c, n) => (n === i ? value : c)),
                      )
                    }
                    onUp={() =>
                      setCandidates(current => {
                        const next = [...current];
                        if (i > 0)
                          [next[i - 1], next[i]] = [next[i], next[i - 1]];
                        return next;
                      })
                    }
                    onDown={() =>
                      setCandidates(current => {
                        const next = [...current];
                        if (i < next.length - 1)
                          [next[i + 1], next[i]] = [next[i], next[i + 1]];
                        return next;
                      })
                    }
                    onRemove={() =>
                      setCandidates(current =>
                        current.filter((_, n) => n !== i),
                      )
                    }
                  />
                ))
              )}
            </>
          ) : targetMode === 'printer' ? (
            <>
              {!editing && (
                <View style={styles.row}>
                  <PrimaryButton
                    variant="secondary"
                    label={tr('Select all eligible')}
                    onPress={() => setPrinterIds(eligible.map(p => p.id))}
                  />
                  <PrimaryButton
                    variant="secondary"
                    label={tr('Clear printers')}
                    onPress={() => setPrinterIds([])}
                  />
                </View>
              )}
              {(printers.data ?? []).map(p => (
                <Choice
                  key={p.id}
                  label={`${p.name} · ${p.model ?? '?'} · ${p.location ?? ''}${
                    !p.is_active
                      ? ` · ${tr('Inactive')}`
                      : !compatibleModels(slicedModel, p.model)
                      ? ` · ${tr('Incompatible slice')}`
                      : ''
                  }`}
                  value={printerIds.includes(p.id)}
                  options={[
                    {
                      value: true,
                      label: 'Selected',
                      disabled: !eligible.some(e => e.id === p.id),
                    },
                    { value: false, label: 'Not selected' },
                  ]}
                  onChange={v =>
                    setPrinterIds(current =>
                      v
                        ? editing
                          ? [p.id]
                          : [...current.filter(id => id !== p.id), p.id]
                        : current.filter(id => id !== p.id),
                    )
                  }
                />
              ))}
              {statuses.map((status, i) => (
                <LaunchText key={printerIds[i]}>{`${
                  printers.data?.find(p => p.id === printerIds[i])?.name
                }: ${
                  status.data?.connected
                    ? status.data.state
                    : tr('Offline / unavailable; job waits')
                }${
                  status.data?.awaiting_plate_clear
                    ? ` · ${tr('Waiting for plate clear')}`
                    : ''
                }`}</LaunchText>
              ))}
            </>
          ) : (
            <Choice
              label="Compatible model"
              value={model}
              options={Array.from(
                new Set(
                  eligible.map(p => p.model).filter((m): m is string => !!m),
                ),
              ).map(m => ({ value: m, label: m }))}
              onChange={setModel}
            />
          )}
          {targetMode !== 'printer' && (
            <Choice
              label="Target location"
              value={location}
              options={[
                { value: '', label: 'Any location' },
                ...Array.from(
                  new Set(
                    eligible
                      .map(p => p.location)
                      .filter((s): s is string => !!s),
                  ),
                ).map(l => ({ value: l, label: l })),
              ]}
              onChange={setLocation}
            />
          )}
          {targetMode !== 'variants' && (
            <>
              {!editing && plates.length > 1 && (
                <View style={styles.row}>
                  <PrimaryButton
                    variant="secondary"
                    label={tr('Select all plates')}
                    onPress={() =>
                      setQuantities(
                        Object.fromEntries(
                          plateIds.map(id => [
                            String(id),
                            quantities[String(id)] || 1,
                          ]),
                        ),
                      )
                    }
                  />
                  <PrimaryButton
                    variant="secondary"
                    label={tr('Deselect all plates')}
                    onPress={() => setQuantities({})}
                  />
                </View>
              )}
              {plateIds.map(id => {
                const plate = plates.find(p => p.index === id);
                const selected = chosenPlates.includes(id);
                return (
                  <SectionCard
                    key={String(id)}
                    title={plate?.name ?? `${tr('Plate')} ${id ?? 1}`}
                  >
                    {source && id != null && (
                      <Image
                        style={styles.preview}
                        source={{
                          uri: printLaunchApi.plateThumbnail(source, id),
                        }}
                        accessibilityLabel={tr('Plate preview')}
                      />
                    )}
                    <LaunchText>{`${(plate?.objects ?? []).join(', ')} · ${tr(
                      'Build plate',
                    )}: ${
                      plate?.bed_type ??
                      pickString(metadata.data, ['bed_type'], tr('Unknown'))
                    }`}</LaunchText>
                    <Choice
                      label="Plate selection"
                      value={selected}
                      options={[
                        { value: true, label: 'Selected' },
                        { value: false, label: 'Not selected' },
                      ]}
                      onChange={v => {
                        setQuantityDrafts(current => {
                          const next = { ...current };
                          delete next[String(id)];
                          return next;
                        });
                        setQuantities(current =>
                          editing
                            ? { [String(id)]: v ? 1 : 0 }
                            : {
                                ...current,
                                [String(id)]: v ? current[String(id)] || 1 : 0,
                              },
                        );
                      }}
                    />
                    {selected && !editing && (
                      <LaunchField
                        numeric
                        label="Copies (1–999)"
                        value={
                          quantityDrafts[String(id)] ??
                          String(quantities[String(id)])
                        }
                        onChange={v => {
                          setQuantityDrafts(current => ({
                            ...current,
                            [String(id)]: v,
                          }));
                          if (Number(v) > 0)
                            setQuantities(current => ({
                              ...current,
                              [String(id)]: Number(v),
                            }));
                        }}
                      />
                    )}
                    {selected && (
                      <LaunchText>{`${tr('Filaments')}: ${reqsFor(id)
                        .map(
                          r =>
                            `${r.slot_id} ${r.type} ${r.color} ${r.used_grams}g`,
                        )
                        .join(' · ')}`}</LaunchText>
                    )}
                    {selected &&
                      reqsFor(id).map(r => (
                        <Choice
                          key={`exact-${r.slot_id}`}
                          label={`${tr('Require exact color for slot')} ${
                            r.slot_id
                          }`}
                          value={r.force_color_match === true}
                          options={[
                            { value: false, label: 'Off' },
                            { value: true, label: 'On' },
                          ]}
                          onChange={v =>
                            setForceMatches(current => ({
                              ...current,
                              [String(id)]: {
                                ...current[String(id)],
                                [r.slot_id]: v,
                              },
                            }))
                          }
                        />
                      ))}
                    {selected &&
                      targetMode === 'model' &&
                      reqsFor(id).map(r => (
                        <View key={r.slot_id}>
                          <LaunchText>{`${tr('Material override')} ${
                            r.slot_id
                          }`}</LaunchText>
                          <Choice
                            label="Available material / color"
                            value={`${r.type}:${r.color}`}
                            options={(available.data ?? []).map(f => ({
                              value: `${f.type}:${f.color}`,
                              label: `${f.type} ${f.color}`,
                            }))}
                            onChange={v => {
                              const [type, color] = v.split(':');
                              const tray_info_idx = available.data?.find(
                                f => f.type === type && f.color === color,
                              )?.tray_info_idx;
                              setOverrides(current => ({
                                ...current,
                                [String(id)]: {
                                  ...current[String(id)],
                                  [r.slot_id]: { type, color, tray_info_idx },
                                },
                              }));
                            }}
                          />
                          <PrimaryButton
                            variant="secondary"
                            label={tr('Reset material override')}
                            onPress={() => {
                              setOverrides(current => {
                                const next = { ...current[String(id)] };
                                delete next[r.slot_id];
                                return { ...current, [String(id)]: next };
                              });
                              setForceMatches(current => {
                                const next = { ...current[String(id)] };
                                delete next[r.slot_id];
                                return { ...current, [String(id)]: next };
                              });
                            }}
                          />
                        </View>
                      ))}
                    {selected &&
                      targetMode === 'printer' &&
                      printerIds.map((printerId, pi) => {
                        const key = mappingKey(printerId, id),
                          status = statuses[pi]?.data;
                        const trays = loadedTrays(status),
                          mapping = mappingFor(printerId, id);
                        const saved =
                          source?.kind === 'archive'
                            ? savedArchiveMapping(
                                metadata.data?.extra_data,
                                printerId,
                              )
                            : undefined;
                        const reqs = reqsFor(id),
                          inventory = inventories[pi]?.data;
                        const groups = new Map(
                          reqs
                            .filter(r => r.group_id != null && r.group)
                            .map(r => [r.group_id!, r.group!]),
                        );
                        return (
                          <View key={printerId}>
                            <LaunchText>{`${tr('Mapping review')}: ${
                              printers.data?.find(p => p.id === printerId)?.name
                            }`}</LaunchText>
                            {status?.fila_switch?.installed && (
                              <LaunchText>
                                FTS installed: verify inlet A (left) / B (right)
                                routing before launch.
                              </LaunchText>
                            )}
                            <View style={styles.row}>
                              <PrimaryButton
                                variant="secondary"
                                label={tr('Reread live mappings')}
                                onPress={() => {
                                  void statuses[pi].refetch();
                                  void inventories[pi].refetch();
                                }}
                              />
                              <PrimaryButton
                                variant="secondary"
                                label={tr('Use suggested mapping')}
                                onPress={() =>
                                  setMappings(current => {
                                    const next = { ...current };
                                    delete next[key];
                                    return next;
                                  })
                                }
                              />
                              {saved && (
                                <PrimaryButton
                                  variant="secondary"
                                  label={tr('Use archived slicer mapping')}
                                  onPress={() =>
                                    setMappings(current => {
                                      const next = [...mapping];
                                      reqs.forEach(r => {
                                        const savedTray = saved[r.slot_id - 1];
                                        if (savedTray != null && savedTray >= 0)
                                          next[r.slot_id - 1] = savedTray;
                                      });
                                      return { ...current, [key]: next };
                                    })
                                  }
                                />
                              )}
                            </View>
                            {reqs.map(r => {
                              const selectedTray = trays.find(
                                item => item.id === mapping[r.slot_id - 1],
                              );
                              const mismatch =
                                selectedTray &&
                                (selectedTray.type.toUpperCase() !==
                                  r.type.toUpperCase() ||
                                  colorKey(selectedTray.color) !==
                                    colorKey(r.color));
                              return (
                                <Choice<number>
                                  key={r.slot_id}
                                  label={`${tr('Slot')} ${r.slot_id} ${
                                    r.type
                                  } ${r.color}${
                                    (r.nozzle_id ?? r.extruder_id) != null
                                      ? ` · ${
                                          (r.nozzle_id ?? r.extruder_id) === 1
                                            ? tr('Left nozzle')
                                            : tr('Right nozzle')
                                        }`
                                      : ''
                                  } · ${
                                    mappings[key]
                                      ? tr('Manual')
                                      : tr('Suggested')
                                  }${
                                    mismatch
                                      ? ` · ${tr('Mismatch: review required')}`
                                      : ''
                                  }`}
                                  value={mapping[r.slot_id - 1] ?? -1}
                                  options={[
                                    {
                                      value: -1,
                                      label: 'Auto at dispatch / unmapped',
                                    },
                                    ...trays.map(item => ({
                                      value: item.id,
                                      label: `${item.label} ${item.type} ${
                                        item.color
                                      } · ${
                                        inventory?.inventory_remain_g[
                                          String(item.id)
                                        ] ?? tr('Unknown')
                                      }g`,
                                    })),
                                  ]}
                                  onChange={v =>
                                    setMappings(current => {
                                      const next = [...mapping];
                                      while (next.length < r.slot_id)
                                        next.push(-1);
                                      next[r.slot_id - 1] = v;
                                      return { ...current, [key]: next };
                                    })
                                  }
                                />
                              );
                            })}
                            {[...groups].map(([groupId, group]) =>
                              group.on_rack ? (
                                <Choice
                                  key={groupId}
                                  label={`${tr(
                                    'Rack nozzle group',
                                  )} ${groupId} · ${group.nozzle_diameter} ${
                                    group.volume_type
                                  }`}
                                  value={rackChoices[key]?.[groupId] ?? 0}
                                  options={[
                                    {
                                      value: 0,
                                      label: 'Auto assign eligible position',
                                    },
                                    ...rackOptions(
                                      status?.nozzle_rack,
                                      group,
                                    ).map(o => {
                                      const used = Object.entries(
                                        rackChoices[key] ?? {},
                                      ).some(
                                        ([g, p]) =>
                                          Number(g) !== groupId &&
                                          p === o.position,
                                      );
                                      return {
                                        value: o.position,
                                        label: `R${o.position} · ${
                                          o.description
                                        }${
                                          !o.eligible || used
                                            ? ` · ${tr(
                                                used
                                                  ? 'Assigned to another group'
                                                  : 'Not eligible: diameter / flow / empty',
                                              )}`
                                            : ''
                                        }`,
                                        disabled: !o.eligible || used,
                                      };
                                    }),
                                  ]}
                                  onChange={v =>
                                    setRackChoices(current => {
                                      const next = { ...current[key] };
                                      if (v === 0) delete next[groupId];
                                      else next[groupId] = v;
                                      return { ...current, [key]: next };
                                    })
                                  }
                                />
                              ) : (
                                <LaunchText key={groupId}>{`${tr(
                                  'Fixed hotend group',
                                )} ${groupId} · ${group.nozzle_diameter} ${
                                  group.volume_type
                                }`}</LaunchText>
                              ),
                            )}
                            <LaunchText>{`${tr('Estimated per run')}: ${
                              estimateFor(printerId, id)?.toFixed(2) ??
                              tr('Unknown')
                            } ${String(
                              settings.data?.currency ?? '',
                            )}`}</LaunchText>
                          </View>
                        );
                      })}
                  </SectionCard>
                );
              })}
              <Choice
                label="Require exact filament color"
                value={exact}
                options={[
                  { value: false, label: 'Off' },
                  { value: true, label: 'On' },
                ]}
                onChange={setExact}
              />
            </>
          )}
          <Choice
            label="Schedule"
            value={mode}
            options={[
              { value: 'asap', label: 'ASAP (priority queue)' },
              { value: 'queue', label: 'Queue' },
              { value: 'scheduled', label: 'Scheduled' },
            ]}
            onChange={setMode}
          />
          {mode === 'scheduled' && (
            <PrintSchedulePicker value={date} onChange={setDate} />
          )}
          {printerIds.length > 1 && (
            <>
              <Choice
                label="Stagger printer starts"
                value={stagger}
                options={[
                  { value: false, label: 'Off' },
                  { value: true, label: 'On' },
                ]}
                onChange={setStagger}
              />
              {stagger && (
                <>
                  <LaunchField
                    label="Printers per stagger group"
                    value={groupSize}
                    onChange={setGroupSize}
                    numeric
                  />
                  <LaunchField
                    label="Interval minutes"
                    value={interval}
                    onChange={setInterval}
                    numeric
                  />
                  {Number(groupSize) >= 1 &&
                    Number(interval) > 0 &&
                    printerIds.map((id, i) => (
                      <LaunchText key={id}>{`${
                        printers.data?.find(p => p.id === id)?.name
                      }: +${
                        Math.floor(i / Number(groupSize)) * Number(interval)
                      } ${tr(
                        'minutes from scheduled start / now',
                      )}`}</LaunchText>
                    ))}
                </>
              )}
            </>
          )}
          <PrintOptionsForm
            value={options}
            onChange={setOptions}
            dualNozzle={
              targetMode !== 'printer' ||
              printerIds.some(
                id =>
                  (printers.data?.find(p => p.id === id)?.nozzle_count ?? 1) >
                  1,
              )
            }
            injectionAllowed={injectionAllowed}
            canControl={hasPermission('printers:control')}
            showManualStart={mode === 'queue'}
          />
          {billing && (
            <Choice<number | null>
              label="Cost center"
              value={costCenterId}
              options={allowedCenters.map(c => ({
                value: c.id,
                label: `${c.name}${
                  c.is_private ? ` · ${tr('Personal default')}` : ''
                } · ${
                  c.budget_mode === 'none'
                    ? tr('Unlimited')
                    : c.budget_available ?? tr('Unknown budget')
                }`,
              }))}
              onChange={setCostCenterId}
            />
          )}
          {budgetBlocked && (
            <LaunchText>
              No usable budget: select an allowed cost center with sufficient
              funds.
            </LaunchText>
          )}
          <LaunchText>{`${tr('Total runs')}: ${
            targetMode === 'variants' ? 1 : totalRuns
          } · ${tr('Total estimated cost')}: ${
            totalCost?.toFixed(2) ?? tr('Unknown (not zero)')
          } ${String(settings.data?.currency ?? '')}`}</LaunchText>
          {progress ? (
            <LaunchText>{`${tr(
              'Submitted target / plate groups',
            )}: ${progress}`}</LaunchText>
          ) : null}
        </ScrollView>
        {busy && <ActivityIndicator />}
        <View style={styles.footer}>
          <PrimaryButton
            label={tr('Cancel')}
            variant="secondary"
            disabled={busy}
            onPress={() => {
              void close();
            }}
          />
          <PrimaryButton
            label={tr(
              editing
                ? 'Save'
                : submitted.current.size
                ? 'Retry remaining requests'
                : 'Submit print jobs',
            )}
            disabled={busy || !canEdit || budgetBlocked}
            loading={busy}
            onPress={() => {
              void submit();
            }}
          />
        </View>
      </View>
      <ConfirmModal
        visible={!!warning}
        title={tr('Filament shortage review')}
        message={warning}
        confirmLabel={tr('Print anyway')}
        cancelLabel={tr('Cancel')}
        variant="warning"
        onClose={() => setWarning('')}
        onConfirm={() => {
          void submit(true);
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.md, paddingTop: spacing.xl },
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  preview: { width: '100%', height: 150, resizeMode: 'contain' },
});
