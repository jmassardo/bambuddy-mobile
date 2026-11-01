import { NativeTranslation, nativeMessage, translateNative, useLocalizedMemo, useNativeLocale, useTranslation } from '@/i18n';


import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronLeft,
  Droplets,
  Palette,
  Thermometer,
  X,
} from 'lucide-react-native';
import { PrimaryButton, TextField } from '@/components/common/AppUI';
import { AssignSpoolModal } from '@/components/printers/AssignSpoolModal';
import { LinkSpoolModal } from '@/components/printers/LinkSpoolModal';
import { ConfigureDeviceSlot } from '@/components/printers/ConfigureDeviceSlot';
import { printerControlsApi as device } from '@/api/printerControls';
import { deviceSlotTrayId, dryingCapabilities, dryingReasonText, physicalTrayId, requireInteger, unloadTrayId } from './deviceControlUtils';
import { useAuth } from '@/contexts/AuthContext';

import { api, ApiError } from '@/api/client';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import type {
  AMSTray,
  SpoolAssignment,
  UnifiedPreset,
  UnifiedPresetsResponse,
} from '@/types/api';

export interface TrayDetailContext {
  amsId: number;
  trayId: number;
  slotIndex: number;
  isExternal: boolean;
  label: string;
  amsLabel: string;
  temperature?: number | null;
}

interface TrayDetailModalProps {
  visible: boolean;
  printerId: number;
  tray: AMSTray | null;
  context: TrayDetailContext | null;
  isPrinting: boolean;
  onClose: () => void;
}

function getErrorMessage<T extends string | import('@/i18n').NativeMessage>(error: unknown, fallback: T) {
  return error instanceof ApiError ? error.message : fallback;
}

function parseFilamentColor(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.replace('#', '').trim();
  if (!normalized || /^0+$/.test(normalized)) return null;
  return `#${normalized.slice(0, 6)}`;
}

function slotPresetKey(amsId: number, trayId: number) {
  if (amsId >= 128 && amsId <= 135) return amsId;
  return amsId * 4 + deviceSlotTrayId(amsId, trayId);
}

function flattenFilamentPresets(
  data: UnifiedPresetsResponse | undefined,
): UnifiedPreset[] {
  if (!data) return [];

  const sources: Array<'local' | 'orca_cloud' | 'cloud' | 'standard'> = [
    'local',
    'orca_cloud',
    'cloud',
  ];

  return sources.flatMap(source =>
    data[source].filament.map((preset: UnifiedPreset) => ({
      ...preset,
      source: preset.source ?? source,
    })),
  );
}

export function TrayDetailModal({
  visible,
  printerId,
  tray,
  context,
  isPrinting,
  onClose,
}: TrayDetailModalProps) {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [configuring, setConfiguring] = useState(false);
  const [showAssignSpoolModal, setShowAssignSpoolModal] = useState(false);
  const [showLinkSpoolModal, setShowLinkSpoolModal] = useState(false);
  const [search, setSearch] = useState('');
  const [dryingTemp, setDryingTemp] = useState('55');
  const [dryingDuration, setDryingDuration] = useState('6');
  const [dryingFilament, setDryingFilament] = useState('');
  const [rotateTray, setRotateTray] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<UnifiedPreset | null>(null);
  const [rfidBaseline, setRfidBaseline] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) {
      setConfiguring(false);
      setShowAssignSpoolModal(false);
      setShowLinkSpoolModal(false);
      setSearch('');
      setSelectedPreset(null);
      setRfidBaseline(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!tray) return;
    setDryingTemp(tray.drying_temp == null ? '' : String(tray.drying_temp));
    setDryingDuration(tray.drying_time == null ? '' : String(tray.drying_time));
    setDryingFilament(tray.tray_sub_brands || tray.tray_type || '');
    setRotateTray(false);
  }, [tray]);

  const invalidatePrinter = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['printerStatus', printerId] }),
      queryClient.invalidateQueries({ queryKey: ['slotPresets', printerId] }),
    ]);
  }, [printerId, queryClient]);

  const slotPresetsQuery = useQuery({
    queryKey: ['slotPresets', printerId],
    queryFn: () => api.getSlotPresets(printerId),
    enabled: visible,
    staleTime: 120_000,
  });

  const slicerPresetsQuery = useQuery({
    queryKey: ['slicerPresets', 'tray-detail'],
    queryFn: () => api.getSlicerPresets(),
    enabled: visible && configuring,
    staleTime: 120_000,
  });
  const builtinPresetsQuery = useQuery({
    queryKey: ['builtinFilaments'], queryFn: () => device.builtinFilaments(),
    enabled: visible && configuring, staleTime: Infinity,
  });

  const statusQuery = useQuery({
    queryKey: ['printerStatus', printerId],
    queryFn: () => api.getPrinterStatus(printerId),
    enabled: visible,
    refetchInterval: visible ? 3000 : false,
  });

  const assignmentsQuery = useQuery({
    queryKey: ['inventoryAssignments', printerId],
    queryFn: () => api.getAssignments(printerId),
    enabled: visible,
    staleTime: 15_000,
  });

  const spoolmanStatusQuery = useQuery({
    queryKey: ['spoolmanStatus'],
    queryFn: () => api.getSpoolmanStatus(),
    enabled: visible,
    staleTime: 30_000,
  });

  const spoolTag = useLocalizedMemo(
    () => (tray?.tray_uuid || tray?.tag_uid || '').trim() || null,
    [tray?.tag_uid, tray?.tray_uuid],
  );
  const spoolmanEnabled = Boolean(
    spoolmanStatusQuery.data?.enabled && spoolmanStatusQuery.data?.connected,
  );

  const linkedSpoolsQuery = useQuery({
    queryKey: ['linkedSpools'],
    queryFn: () => api.getLinkedSpools(),
    enabled: visible && spoolmanEnabled && !!spoolTag,
    staleTime: 15_000,
  });

  const loadMutation = useMutation({
    mutationFn: (extruder?: number) => {
      if (!context) throw new Error(translateNative('native.9e7eeab5008cf3b9'));
      return device.load(printerId, physicalTrayId(context.amsId, context.trayId), extruder);
    },
    onSuccess: async () => {
      await invalidatePrinter();
      showToast(nativeMessage('native.c6dd82fbd6e54a42'), 'success');
      onClose();
    },
    onError: error =>
      showToast(getErrorMessage(error, nativeMessage('native.829a9674aee7addf')), 'error'),
  });

  const unloadMutation = useMutation({
    mutationFn: () => device.unload(printerId, context ? unloadTrayId(context.amsId, context.trayId) : undefined),
    onSuccess: async () => {
      await invalidatePrinter();
      showToast(nativeMessage('native.972d19d6ac4e4bed'), 'success');
      onClose();
    },
    onError: error =>
      showToast(getErrorMessage(error, nativeMessage('native.9287d7cc8c0f025b')), 'error'),
  });

  const refreshMutation = useMutation({
    mutationFn: () => {
      if (!context) throw new Error(translateNative('native.9e7eeab5008cf3b9'));
      setRfidBaseline(statusQuery.data?.last_ams_update ?? 0);
      return api.refreshAmsSlot(printerId, context.amsId, context.trayId);
    },
    onError: error => {
      setRfidBaseline(null);
      showToast(getErrorMessage(error, nativeMessage('device.rfidFailed', () => ({ defaultValue: 'Device RFID reread failed.' }))), 'error');
    },
  });
  useEffect(() => {
    if (rfidBaseline == null || refreshMutation.isPending) return;
    if ((statusQuery.data?.last_ams_update ?? 0) > rfidBaseline && statusQuery.data?.ams_status_main !== 2) {
      setRfidBaseline(null);
      showToast(nativeMessage('device.rfidCompleted', () => ({ defaultValue: 'AMS status refreshed after RFID reread.' })), 'success');
    }
  }, [rfidBaseline, refreshMutation.isPending, showToast, statusQuery.data?.last_ams_update, statusQuery.data?.ams_status_main, t]);
  useEffect(() => {
    if (rfidBaseline == null) return;
    const timer = setTimeout(() => {
      setRfidBaseline(null);
      showToast(nativeMessage('device.rfidTimeout', () => ({ defaultValue: 'RFID command sent, but no completion was reported. Check the tray and retry.' })), 'error');
    }, 60000);
    return () => clearTimeout(timer);
  }, [rfidBaseline, showToast, t]);

  const unassignSpoolMutation = useMutation({
    mutationFn: () => {
      if (!context) throw new Error(translateNative('native.9e7eeab5008cf3b9'));
      return api.unassignSpool(printerId, context.amsId, deviceSlotTrayId(context.amsId, context.trayId));
    },
    onSuccess: async () => {
      await Promise.all([
        invalidatePrinter(),
        queryClient.invalidateQueries({ queryKey: ['inventoryAssignments'] }),
      ]);
      showToast(nativeMessage('native.f8a5f62810c9582a'), 'success');
    },
    onError: error =>
      showToast(getErrorMessage(error, nativeMessage('native.4e6a92e509672538')), 'error'),
  });

  const unlinkSpoolMutation = useMutation({
    mutationFn: (spoolId: number) => api.unlinkSpool(spoolId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['linkedSpools'] });
      showToast(nativeMessage('native.5d414fdd0a28404e'), 'success');
    },
    onError: error =>
      showToast(getErrorMessage(error, nativeMessage('native.b307e4fa223b56a6')), 'error'),
  });

  const color = useLocalizedMemo(() => parseFilamentColor(tray?.tray_color), [tray?.tray_color]);
  const fill = useLocalizedMemo(() => {
    if (!tray) return 0;
    const hasFillLevel = tray.remain >= 0;
    // Inventory spool fill (label_weight - weight_used)
    const assignment = context
      ? assignmentsQuery.data?.find(
          a => a.printer_id === printerId && a.ams_id === context.amsId && a.tray_id === deviceSlotTrayId(context.amsId, context.trayId),
        )
      : undefined;
    const sp = assignment?.spool;
    const inventoryFill =
      sp && sp.label_weight > 0 && sp.weight_used != null
        ? Math.round(Math.max(0, sp.label_weight - sp.weight_used) / sp.label_weight * 100)
        : null;
    const resolvedInventoryFill =
      inventoryFill === 0 && hasFillLevel && tray.remain > 0 ? null : inventoryFill;
    const effective = resolvedInventoryFill ?? (hasFillLevel ? tray.remain : null);
    return Math.max(0, Math.min(100, effective ?? 0));
  }, [tray, context, printerId, assignmentsQuery.data]);
  const hasFilament = Boolean(
    tray?.tray_type || tray?.tray_sub_brands || tray?.tray_info_idx || (tray?.state ?? 0) >= 10,
  );

  const currentPreset = useLocalizedMemo(() => {
    if (!context) return null;
    return slotPresetsQuery.data?.[slotPresetKey(context.amsId, context.trayId)] ?? null;
  }, [context, slotPresetsQuery.data]);

  const presets = useLocalizedMemo(
    () => [...flattenFilamentPresets(slicerPresetsQuery.data as UnifiedPresetsResponse | undefined),
      ...(builtinPresetsQuery.data ?? []).map(preset => ({
        id: `builtin_${preset.filament_id}`, name: preset.name, source: 'standard' as const,
        filament_type: preset.type,
      }))],
    [slicerPresetsQuery.data, builtinPresetsQuery.data],
  );

  const filteredPresets = useLocalizedMemo(() => {
    const searchValue = search.trim().toLowerCase();
    const material = tray?.tray_type?.toLowerCase() ?? '';

    return [...presets]
      .filter(preset => {
        if (!searchValue) return true;
        return (
          preset.name.toLowerCase().includes(searchValue) ||
          preset.id.toLowerCase().includes(searchValue) ||
          (preset.filament_type ?? '').toLowerCase().includes(searchValue)
        );
      })
      .sort((a, b) => {
        const aMatchesMaterial = Boolean(
          material && (a.filament_type ?? '').toLowerCase() === material,
        );
        const bMatchesMaterial = Boolean(
          material && (b.filament_type ?? '').toLowerCase() === material,
        );
        if (aMatchesMaterial !== bMatchesMaterial) {
          return aMatchesMaterial ? -1 : 1;
        }
        if (a.name === currentPreset?.preset_name) return -1;
        if (b.name === currentPreset?.preset_name) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [currentPreset?.preset_name, presets, search, tray?.tray_type]);

  const currentAms = useLocalizedMemo(
    () => (statusQuery.data?.ams ?? []).find(ams => ams.id === context?.amsId) ?? null,
    [context?.amsId, statusQuery.data?.ams],
  );
  const dryingSupported = Boolean(
    visible &&
      (statusQuery.data?.supports_drying || statusQuery.data?.drying_screen_only) &&
      currentAms &&
      ['n3f', 'n3s'].includes(currentAms.module_type) &&
      !context?.isExternal,
  );
  const dryingActive = Boolean((currentAms?.dry_time ?? 0) > 0);
  const dryingLoadedTray = Boolean(currentAms?.tray.some(slot => slot.state === 11));
  const dryingCaps = currentAms ? dryingCapabilities(statusQuery.data, currentAms) : null;
  const currentAssignment = useLocalizedMemo(
    () =>
      (assignmentsQuery.data ?? []).find(
        (assignment: SpoolAssignment) =>
          assignment.printer_id === printerId &&
          assignment.ams_id === context?.amsId &&
          assignment.tray_id === deviceSlotTrayId(context?.amsId ?? -1, context?.trayId ?? -1),
      ) ?? null,
    [assignmentsQuery.data, context?.amsId, context?.trayId, printerId],
  );
  const linkedSpool = useLocalizedMemo(() => {
    if (!spoolTag) return null;
    return linkedSpoolsQuery.data?.linked?.[spoolTag.toUpperCase()] ?? null;
  }, [linkedSpoolsQuery.data?.linked, spoolTag]);

  const startDryingMutation = useMutation({
    mutationFn: () => {
      if (!context) throw new Error(translateNative('native.9e7eeab5008cf3b9'));
      const temp = requireInteger(dryingTemp, 45, dryingCaps?.maxTemperature ?? 45);
      const duration = requireInteger(dryingDuration, 1, 24);
      return api.startDrying(
        printerId,
        context.amsId,
        temp,
        duration,
        dryingFilament.trim(),
        rotateTray && !dryingLoadedTray && dryingCaps?.canRotate === true,
      );
    },
    onSuccess: async () => {
      await invalidatePrinter();
      showToast(nativeMessage('native.b297e9684a57dfa9'), 'success');
    },
    onError: error =>
      showToast(getErrorMessage(error, nativeMessage('native.520b27b07ee69257')), 'error'),
  });

  const stopDryingMutation = useMutation({
    mutationFn: () => {
      if (!context) throw new Error(translateNative('native.9e7eeab5008cf3b9'));
      return api.stopDrying(printerId, context.amsId);
    },
    onSuccess: async () => {
      await invalidatePrinter();
      showToast(nativeMessage('native.384c285ec2af8fe7'), 'success');
    },
    onError: error =>
      showToast(getErrorMessage(error, nativeMessage('native.995b9681e38b91a0')), 'error'),
  });

  if (!tray || !context) return null;

  const canControl = hasPermission('printers:control') && statusQuery.data?.connected === true;
  const loadDisabled = !canControl || isPrinting || !hasFilament || loadMutation.isPending;
  const unloadDisabled = !canControl || isPrinting || unloadMutation.isPending;
  const requestLoad = () => {
    if (statusQuery.data?.fila_switch?.installed && statusQuery.data?.temperatures?.nozzle_2 != null && !context.isExternal) {
      Alert.alert(t('device.feedDirection', { defaultValue: 'Choose feed direction' }), t('device.chooseHotend', { defaultValue: 'Which hotend should this AMS feed?' }), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('device.right', { defaultValue: 'Right' }), onPress: () => loadMutation.mutate(0) },
        { text: t('device.left', { defaultValue: 'Left' }), onPress: () => loadMutation.mutate(1) },
      ]);
    } else loadMutation.mutate(undefined);
  };
  const slotLabel = context.isExternal
    ? context.amsLabel
    : translateNative('native.38470295859a5c31', { value0: String(context.amsLabel), value1: String(context.label) });
  const currentProfileLabel =
    currentPreset?.preset_name || tray.tray_sub_brands || tray.tray_type || translateNative('native.424849cf8f869437');
  const currentAssignmentLabel = currentAssignment?.spool
    ? [currentAssignment.spool.brand, currentAssignment.spool.material]
        .filter(Boolean)
        .join(' • ') || translateNative('native.695cc238a31cecd5', { value0: String(currentAssignment.spool.id) })
    : currentAssignment
      ? translateNative('native.695cc238a31cecd5', { value0: String(currentAssignment.spool_id) })
      : translateNative('common.none');

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <View
            style={[
              styles.sheet,
              { backgroundColor: colors.modalBg, borderColor: colors.border },
            ]}
          >
            <View style={styles.header}>
              <View style={styles.headerActions}>
                {configuring ? (
                  <Pressable
                    onPress={() => setConfiguring(false)}
                    style={[
                      styles.iconButton,
                      { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                    ]}
                  >
                    <ChevronLeft size={18} color={colors.text} strokeWidth={2} />
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.headerText}>
                <Text style={[styles.title, { color: colors.text }]}>
                  {configuring ? translateNative('native.a8e46bea962c509f') : translateNative('native.a77a5444537d7a73')}
                </Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  {slotLabel}
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                style={[
                  styles.iconButton,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
              >
                <X size={18} color={colors.text} strokeWidth={2} />
              </Pressable>
            </View>

            {configuring ? (
              <View style={styles.configureContent}>
                <TextField
                  label={translateNative('native.32feee26fde123e3')}
                  value={search}
                  onChangeText={setSearch}
                  placeholder={translateNative('native.61e99f04478fc750')}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={[styles.configureHint, { color: colors.textSecondary }]}><NativeTranslation id="native.dc612a3227ee838d" values={{ value0: (currentProfileLabel) }} /></Text>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {selectedPreset ? <ConfigureDeviceSlot key={`${selectedPreset.source}-${selectedPreset.id}`} printerId={printerId}
                    amsId={context.amsId} trayId={deviceSlotTrayId(context.amsId, context.trayId)} tray={tray} preset={selectedPreset}
                    onSaved={() => { setConfiguring(false); setSelectedPreset(null); }} /> : null}
                  {slicerPresetsQuery.isLoading ? (
                    <View style={styles.loadingState}>
                      <ActivityIndicator color={colors.accent} />
                      <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                        {translateNative('native.8dc3ebec85e8215e')}</Text>
                    </View>
                  ) : null}
                  {slicerPresetsQuery.error || builtinPresetsQuery.error ? <Text style={{ color: colors.error }}>{slicerPresetsQuery.error?.message || builtinPresetsQuery.error?.message}</Text> : null}

                  {!slicerPresetsQuery.isLoading && filteredPresets.length === 0 ? (
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                      {translateNative('native.139e400e3a60a504')}</Text>
                  ) : null}

                  {filteredPresets.map(preset => {
                    const selected = currentPreset?.preset_id === preset.id;
                    return (
                      <Pressable
                        key={`${preset.source}-${preset.id}`}
                        onPress={() => setSelectedPreset(preset)}
                        style={[
                          styles.presetRow,
                          {
                            backgroundColor: selected
                              ? colors.accentBg
                              : colors.surfaceElevated,
                            borderColor: selected ? colors.accent : colors.border,
                          },
                        ]}
                      >
                        <View style={styles.presetText}>
                          <Text style={[styles.presetName, { color: colors.text }]}>
                            {preset.name}
                          </Text>
                          <Text style={[styles.presetMeta, { color: colors.textSecondary }]}>
                            {(preset.filament_type || 'Filament').toUpperCase()} • {preset.source.replace('_', ' ')}
                          </Text>
                        </View>
                        {selected ? (
                          <Check size={18} color={colors.accentLight} strokeWidth={2.5} />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {isPrinting ? (
                  <View
                    style={[
                      styles.banner,
                      { backgroundColor: colors.warning + '18', borderColor: colors.warning + '55' },
                    ]}
                  >
                    <Text style={[styles.bannerText, { color: colors.warning }]}>
                      {translateNative('native.3e68eebdd549d59c')}</Text>
                  </View>
                ) : null}

                <View style={styles.summaryRow}>
                  <View
                    style={[
                      styles.colorSwatch,
                      {
                        backgroundColor: color ?? colors.surfaceElevated,
                        borderColor: color ?? colors.border,
                      },
                    ]}
                  >
                    <Palette
                      size={26}
                      color={color ? colors.textInverse : colors.textSecondary}
                      strokeWidth={2}
                    />
                  </View>
                  <View style={styles.summaryText}>
                    <Text style={[styles.materialText, { color: colors.text }]}>
                      {tray.tray_type || translateNative('native.18c9ba4fd6f8c90f')}
                    </Text>
                    <Text style={[styles.brandText, { color: colors.textSecondary }]}>
                      {tray.tray_sub_brands || translateNative('native.0e3fdead4b232424')}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailList}>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                      {translateNative('native.e269efae4b724d3d')}</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {currentProfileLabel}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                      {translateNative('native.b738cd2bb44abf9a')}</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {hasFilament ? `${fill}%` : '—'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.progressTrack,
                      { backgroundColor: colors.surfaceElevated },
                    ]}
                  >
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${fill}%`,
                          backgroundColor:
                            fill >= 60
                              ? colors.success
                              : fill >= 25
                                ? colors.warning
                                : colors.error,
                        },
                      ]}
                    />
                  </View>

                  {context.temperature != null ? (
                    <View style={styles.infoRow}>
                      <Thermometer
                        size={16}
                        color={colors.textSecondary}
                        strokeWidth={2}
                      />
                      <Text style={[styles.infoText, { color: colors.textSecondary }]}><NativeTranslation id="native.dd28ea7a8411dee2" values={{ value0: (context.temperature) }} /></Text>
                    </View>
                  ) : null}

                  {tray.tray_color ? (
                    <View style={styles.infoRow}>
                      <Droplets size={16} color={colors.textSecondary} strokeWidth={2} />
                      <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                        {color ?? tray.tray_color}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {dryingSupported ? (
                  <View
                    style={[
                      styles.sectionCard,
                      { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>
                      {translateNative('native.4b132e126d972fe5')}</Text>
                    <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                      {dryingCaps?.screenOnly ? t('device.screenOnly', { defaultValue: 'Control from printer screen only' }) : dryingCaps?.stalled ? t('device.stalled', { defaultValue: 'Not running / countdown stalled' }) : dryingActive
                        ? translateNative('native.e8af2b5b440b6c08', { value0: String(Math.ceil((currentAms?.dry_time ?? 0) / 60)) })
                        : translateNative('native.1d6be860fb3afde8')}
                    </Text>

                    {dryingCaps?.blockedReasons.length ? <Text style={{ color: colors.warning }}>
                      {t('device.dryingBlocked', { defaultValue: 'Blocked: {{reasons}}', reasons: dryingCaps.blockedReasons.map(code => dryingReasonText(code)).join(', ') })}
                    </Text> : null}

                    {dryingActive ? (
                      <View style={styles.detailList}>
                        <View style={styles.detailRow}>
                          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                            {translateNative('native.12e2b8020ce55e27')}</Text>
                          <Text style={[styles.detailValue, { color: colors.text }]}>
                            {currentAms?.dry_filament || tray.tray_sub_brands || tray.tray_type || translateNative('native.6a5ab5109c2f60c8')}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                            {translateNative('native.a3664a9cdff6be26')}</Text>
                          <Text style={[styles.detailValue, { color: colors.text }]}>
                            {currentAms?.dry_target_temp != null
                              ? translateNative('native.dd28ea7a8411dee2', { value0: String(currentAms.dry_target_temp) })
                              : '—'}
                          </Text>
                        </View>
                        <PrimaryButton
                          label={stopDryingMutation.isPending ? translateNative('native.3e0aadec66177a68') : translateNative('native.9b406852b73ee5f6')}
                          variant="danger"
                          onPress={() => Alert.alert(t('device.stopDrying', { defaultValue: 'Stop drying' }),
                            t('device.confirmStopDrying', { defaultValue: 'Stop this AMS drying cycle?' }), [
                              { text: t('common.cancel'), style: 'cancel' },
                              { text: t('common.confirm', { defaultValue: 'Confirm' }), onPress: () => stopDryingMutation.mutate() },
                            ])}
                          disabled={!canControl || dryingCaps?.screenOnly || stopDryingMutation.isPending}
                          loading={stopDryingMutation.isPending}
                        />
                      </View>
                    ) : (
                      <View style={styles.sectionContent}>
                        <TextField
                          label={translateNative('native.6f5e9ef21fd1a694')}
                          value={dryingTemp}
                          onChangeText={setDryingTemp}
                          keyboardType="number-pad"
                        />
                        <TextField
                          label={translateNative('native.08f2a95ebd520563')}
                          value={dryingDuration}
                          onChangeText={setDryingDuration}
                          keyboardType="number-pad"
                        />
                        <TextField
                          label={translateNative('native.12e2b8020ce55e27')}
                          value={dryingFilament}
                          onChangeText={setDryingFilament}
                          placeholder={translateNative('native.f50c8cc334067989')}
                        />
                        <Pressable
                          onPress={() => {
                            if (!dryingLoadedTray && dryingCaps?.canRotate) setRotateTray(current => !current);
                          }}
                          style={[
                            styles.toggleRow,
                            {
                              backgroundColor: rotateTray && !dryingLoadedTray
                                ? colors.accentBg
                                : colors.surface,
                              borderColor: rotateTray && !dryingLoadedTray
                                ? colors.accent
                                : colors.border,
                            },
                            dryingLoadedTray && styles.disabledButton,
                          ]}
                        >
                          <Text style={[styles.toggleLabel, { color: colors.text }]}>
                            {translateNative('native.870b9bfd757d2ae2')}</Text>
                          <Text
                            style={[
                              styles.toggleValue,
                              { color: rotateTray && !dryingLoadedTray ? colors.accentLight : colors.textSecondary },
                            ]}
                          >
                            {dryingLoadedTray || !dryingCaps?.canRotate ? translateNative('native.690339bc141891b7') : rotateTray ? translateNative('native.c7e4e8a8db2bbe79', { defaultValue: 'On' }) : translateNative('native.eaa897b0631e7896', { defaultValue: 'Off' })}
                          </Text>
                        </Pressable>
                        {dryingLoadedTray ? (
                          <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                            {translateNative('native.3dcb3420af6061af')}</Text>
                        ) : null}
                        <PrimaryButton
                          label={startDryingMutation.isPending ? translateNative('native.68955362b86b9268') : translateNative('native.5478f4e85b0bc7a0')}
                          onPress={() => startDryingMutation.mutate()}
                          disabled={!canControl || dryingCaps?.screenOnly || !dryingCaps?.supported || !!dryingCaps?.blockedReasons.length || (isPrinting && statusQuery.data?.supports_drying_while_printing !== true) || startDryingMutation.isPending}
                          loading={startDryingMutation.isPending}
                        />
                      </View>
                    )}
                  </View>
                ) : null}

                <View
                  style={[
                    styles.sectionCard,
                    { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>
                    {translateNative('native.87f93ef29c0e1db4')}</Text>
                  <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                    {translateNative('native.05be6c5fe30cf6a6')}</Text>

                  <View style={styles.detailList}>
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                        {translateNative('native.5cef9c986e531a28')}</Text>
                      <Text style={[styles.detailValue, { color: colors.text }]}>
                        {currentAssignmentLabel}
                      </Text>
                    </View>
                    {spoolTag ? (
                      <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                          {translateNative('native.5d887e90658a7ad7')}</Text>
                        <Text style={[styles.detailValue, { color: colors.text }]} numberOfLines={2}>
                          {spoolTag}
                        </Text>
                      </View>
                    ) : null}
                    {spoolmanEnabled && spoolTag ? (
                      <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                          {translateNative('native.284afb57018e2bd3')}</Text>
                        <Text style={[styles.detailValue, { color: colors.text }]}>
                          {linkedSpool ? translateNative('native.695cc238a31cecd5', { value0: String(linkedSpool.id) }) : translateNative('native.07ac1bd70b95897e')}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.actions}>
                    <PrimaryButton
                      label={translateNative('native.4dacb7267b4ae873')}
                      variant="secondary"
                      onPress={() => setShowAssignSpoolModal(true)}
                    />
                    {currentAssignment ? (
                      <PrimaryButton
                        label={unassignSpoolMutation.isPending ? translateNative('native.38573dd4274479a3') : translateNative('native.2bedb6d3a4e59b54')}
                        variant="danger"
                        onPress={() => unassignSpoolMutation.mutate()}
                        disabled={unassignSpoolMutation.isPending}
                        loading={unassignSpoolMutation.isPending}
                      />
                    ) : null}
                    {spoolmanEnabled && spoolTag ? (
                      <>
                        <PrimaryButton
                          label={translateNative('native.875e1a1f66f7ced5')}
                          variant="secondary"
                          onPress={() => setShowLinkSpoolModal(true)}
                        />
                        {linkedSpool ? (
                          <PrimaryButton
                            label={unlinkSpoolMutation.isPending ? translateNative('native.f5d85e083c699e37') : translateNative('native.ac2860b6cf830304')}
                            variant="danger"
                            onPress={() => unlinkSpoolMutation.mutate(linkedSpool.id)}
                            disabled={unlinkSpoolMutation.isPending}
                            loading={unlinkSpoolMutation.isPending}
                          />
                        ) : null}
                      </>
                    ) : null}
                  </View>
                </View>

                <View style={styles.actions}>
                  <PrimaryButton
                    label={loadMutation.isPending ? translateNative('native.d5ece98cbd4e8bf8') : translateNative('native.e36afa21bd1adb3c')}
                    onPress={requestLoad}
                    disabled={loadDisabled}
                    loading={loadMutation.isPending}
                  />
                  <PrimaryButton
                    label={unloadMutation.isPending ? translateNative('native.1e2d151fe8756c44') : translateNative('native.f07d5a5a29df41c0')}
                    variant="secondary"
                    onPress={() => Alert.alert(t('device.unload', { defaultValue: 'Unload filament?' }),
                      context.amsId >= 128 && context.amsId <= 135
                        ? t('device.htUnloadFallback', { defaultValue: 'AMS HT cannot be addressed individually. This will unload the printer’s currently active feed path.' })
                        : t('device.unloadSelected', { defaultValue: 'Unload the hotend fed from this selected slot?' }), [
                        { text: t('common.cancel'), style: 'cancel' }, { text: t('common.confirm', { defaultValue: 'Confirm' }), onPress: () => unloadMutation.mutate() },
                      ])}
                    disabled={unloadDisabled}
                    loading={unloadMutation.isPending}
                  />
                  <PrimaryButton
                    label={translateNative('native.a8e46bea962c509f')}
                    variant="secondary"
                    onPress={() => setConfiguring(true)}
                    disabled={!canControl || !hasPermission('printers:update')}
                  />
                  {!context.isExternal ? <PrimaryButton label={rfidBaseline != null ? t('device.readingRFID', { defaultValue: 'Waiting for device RFID reread…' }) : t('device.rereadRFID', { defaultValue: 'Reread spool RFID on printer' })}
                    variant="secondary" disabled={!hasPermission('printers:ams_rfid') || !statusQuery.data?.connected || isPrinting || rfidBaseline != null} loading={refreshMutation.isPending}
                    onPress={() => refreshMutation.mutate()} /> : null}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <AssignSpoolModal
        visible={showAssignSpoolModal}
        printerId={printerId}
        amsId={context.amsId}
        trayId={deviceSlotTrayId(context.amsId, context.trayId)}
        slotLabel={slotLabel}
        materialHint={tray.tray_type}
        colorHint={tray.tray_color}
        profileHint={currentPreset?.preset_name ?? tray.tray_sub_brands}
        onClose={() => setShowAssignSpoolModal(false)}
      />

      <LinkSpoolModal
        visible={showLinkSpoolModal}
        printerId={printerId}
        amsId={context.amsId}
        trayId={deviceSlotTrayId(context.amsId, context.trayId)}
        slotLabel={slotLabel}
        spoolTag={spoolTag}
        materialHint={tray.tray_type}
        colorHint={tray.tray_color}
        onClose={() => setShowLinkSpoolModal(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: spacing.lg,
    gap: spacing.lg,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerActions: {
    width: 40,
    alignItems: 'flex-start',
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  bannerText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  colorSwatch: {
    width: 88,
    height: 88,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryText: {
    flex: 1,
    gap: spacing.xs,
  },
  materialText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  brandText: {
    fontSize: fontSize.sm,
  },
  detailList: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  sectionSubtitle: {
    fontSize: fontSize.sm,
  },
  sectionContent: {
    gap: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  detailLabel: {
    fontSize: fontSize.sm,
  },
  detailValue: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textAlign: 'right',
  },
  progressTrack: {
    height: 8,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  infoText: {
    fontSize: fontSize.sm,
  },
  toggleRow: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  toggleLabel: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  toggleValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  helperText: {
    fontSize: fontSize.xs,
  },
  actions: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  configureContent: {
    gap: spacing.sm,
    minHeight: 300,
  },
  configureHint: {
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
  },
  loadingState: {
    paddingVertical: spacing['2xl'],
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    fontSize: fontSize.sm,
  },
  emptyText: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  presetRow: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  presetText: {
    flex: 1,
    gap: spacing.xs,
  },
  presetName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  presetMeta: {
    fontSize: fontSize.xs,
    textTransform: 'capitalize',
  },
  disabledButton: {
    opacity: 0.5,
  },
});
