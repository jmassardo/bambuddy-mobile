import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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

function getErrorMessage(error: unknown, fallback: string) {
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
  return amsId * 4 + trayId;
}

function flattenFilamentPresets(
  data: UnifiedPresetsResponse | undefined,
): UnifiedPreset[] {
  if (!data) return [];

  const sources: Array<'local' | 'orca_cloud' | 'cloud' | 'standard'> = [
    'local',
    'orca_cloud',
    'cloud',
    'standard',
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
  const { colors } = useTheme();
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

  useEffect(() => {
    if (!visible) {
      setConfiguring(false);
      setShowAssignSpoolModal(false);
      setShowLinkSpoolModal(false);
      setSearch('');
    }
  }, [visible]);

  useEffect(() => {
    if (!tray) return;
    setDryingTemp(String(Math.max(45, Math.min(85, tray.drying_temp ?? 55))));
    setDryingDuration(String(Math.max(1, Math.min(24, tray.drying_time ?? 6))));
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

  const statusQuery = useQuery({
    queryKey: ['printerStatus', printerId],
    queryFn: () => api.getPrinterStatus(printerId),
    enabled: visible,
    refetchInterval: visible ? 15_000 : false,
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

  const spoolTag = useMemo(
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
    mutationFn: () => {
      if (!context) throw new Error('Tray context unavailable');
      return api.loadFilament(printerId, context.amsId, context.trayId);
    },
    onSuccess: async () => {
      await invalidatePrinter();
      showToast('Filament load started.', 'success');
      onClose();
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Unable to load filament.'), 'error'),
  });

  const unloadMutation = useMutation({
    mutationFn: () => api.unloadFilament(printerId),
    onSuccess: async () => {
      await invalidatePrinter();
      showToast('Filament unload started.', 'success');
      onClose();
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Unable to unload filament.'), 'error'),
  });

  const savePresetMutation = useMutation({
    mutationFn: (preset: UnifiedPreset) => {
      if (!context) throw new Error('Tray context unavailable');
      return api.saveSlotPreset(
        printerId,
        context.amsId,
        context.trayId,
        preset.id,
        preset.name,
        preset.source,
      );
    },
    onSuccess: async () => {
      await invalidatePrinter();
      showToast('Slot profile updated.', 'success');
      setConfiguring(false);
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Unable to update slot profile.'), 'error'),
  });

  const unassignSpoolMutation = useMutation({
    mutationFn: () => {
      if (!context) throw new Error('Tray context unavailable');
      return api.unassignSpool(printerId, context.amsId, context.trayId);
    },
    onSuccess: async () => {
      await Promise.all([
        invalidatePrinter(),
        queryClient.invalidateQueries({ queryKey: ['inventoryAssignments'] }),
      ]);
      showToast('Inventory spool unassigned.', 'success');
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Unable to unassign spool.'), 'error'),
  });

  const unlinkSpoolMutation = useMutation({
    mutationFn: (spoolId: number) => api.unlinkSpool(spoolId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['linkedSpools'] });
      showToast('RFID link removed.', 'success');
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Unable to unlink spool.'), 'error'),
  });

  const color = useMemo(() => parseFilamentColor(tray?.tray_color), [tray?.tray_color]);
  const fill = useMemo(() => Math.max(0, Math.min(100, tray?.remain ?? 0)), [tray?.remain]);
  const hasFilament = Boolean(
    tray?.tray_type || tray?.tray_sub_brands || tray?.tray_info_idx || (tray?.state ?? 0) >= 10,
  );

  const currentPreset = useMemo(() => {
    if (!context) return null;
    return slotPresetsQuery.data?.[slotPresetKey(context.amsId, context.trayId)] ?? null;
  }, [context, slotPresetsQuery.data]);

  const presets = useMemo(
    () => flattenFilamentPresets(slicerPresetsQuery.data as UnifiedPresetsResponse | undefined),
    [slicerPresetsQuery.data],
  );

  const filteredPresets = useMemo(() => {
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

  const currentAms = useMemo(
    () => statusQuery.data?.ams.find(ams => ams.id === context?.amsId) ?? null,
    [context?.amsId, statusQuery.data?.ams],
  );
  const dryingSupported = Boolean(
    visible &&
      statusQuery.data?.supports_drying &&
      currentAms &&
      !context?.isExternal,
  );
  const dryingActive = Boolean((currentAms?.dry_time ?? 0) > 0);
  const dryingLoadedTray = Boolean(currentAms?.tray.some(slot => slot.state === 11));
  const currentAssignment = useMemo(
    () =>
      (assignmentsQuery.data ?? []).find(
        (assignment: SpoolAssignment) =>
          assignment.printer_id === printerId &&
          assignment.ams_id === context?.amsId &&
          assignment.tray_id === context?.trayId,
      ) ?? null,
    [assignmentsQuery.data, context?.amsId, context?.trayId, printerId],
  );
  const linkedSpool = useMemo(() => {
    if (!spoolTag) return null;
    return linkedSpoolsQuery.data?.linked?.[spoolTag.toUpperCase()] ?? null;
  }, [linkedSpoolsQuery.data?.linked, spoolTag]);

  const startDryingMutation = useMutation({
    mutationFn: () => {
      if (!context) throw new Error('Tray context unavailable');
      const temp = Math.max(45, Math.min(85, Number(dryingTemp) || 55));
      const duration = Math.max(1, Math.min(24, Number(dryingDuration) || 6));
      return api.startDrying(
        printerId,
        context.amsId,
        temp,
        duration,
        dryingFilament.trim(),
        rotateTray && !dryingLoadedTray,
      );
    },
    onSuccess: async () => {
      await invalidatePrinter();
      showToast('Drying started.', 'success');
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Unable to start drying.'), 'error'),
  });

  const stopDryingMutation = useMutation({
    mutationFn: () => {
      if (!context) throw new Error('Tray context unavailable');
      return api.stopDrying(printerId, context.amsId);
    },
    onSuccess: async () => {
      await invalidatePrinter();
      showToast('Drying stopped.', 'success');
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Unable to stop drying.'), 'error'),
  });

  if (!tray || !context) return null;

  const loadDisabled = isPrinting || !hasFilament || loadMutation.isPending;
  const unloadDisabled = isPrinting || unloadMutation.isPending;
  const slotLabel = context.isExternal
    ? context.amsLabel
    : `${context.amsLabel} • Slot ${context.label}`;
  const currentProfileLabel =
    currentPreset?.preset_name || tray.tray_sub_brands || tray.tray_type || 'Unassigned';
  const currentAssignmentLabel = currentAssignment?.spool
    ? [currentAssignment.spool.brand, currentAssignment.spool.material]
        .filter(Boolean)
        .join(' • ') || `Spool #${currentAssignment.spool.id}`
    : currentAssignment
      ? `Spool #${currentAssignment.spool_id}`
      : 'None';

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
                  {configuring ? 'Configure slot' : 'Filament tray'}
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
                  label="Search profiles"
                  value={search}
                  onChangeText={setSearch}
                  placeholder="PLA Basic, PETG, Matte…"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={[styles.configureHint, { color: colors.textSecondary }]}>
                  Current profile: {currentProfileLabel}
                </Text>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {slicerPresetsQuery.isLoading ? (
                    <View style={styles.loadingState}>
                      <ActivityIndicator color={colors.accent} />
                      <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                        Loading filament profiles…
                      </Text>
                    </View>
                  ) : null}

                  {!slicerPresetsQuery.isLoading && filteredPresets.length === 0 ? (
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                      No filament profiles matched this search.
                    </Text>
                  ) : null}

                  {filteredPresets.map(preset => {
                    const selected = currentPreset?.preset_id === preset.id;
                    return (
                      <Pressable
                        key={`${preset.source}-${preset.id}`}
                        onPress={() => savePresetMutation.mutate(preset)}
                        disabled={savePresetMutation.isPending}
                        style={[
                          styles.presetRow,
                          {
                            backgroundColor: selected
                              ? colors.accentBg
                              : colors.surfaceElevated,
                            borderColor: selected ? colors.accent : colors.border,
                          },
                          savePresetMutation.isPending && styles.disabledButton,
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
                      Filament load and unload are disabled while printing.
                    </Text>
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
                      {tray.tray_type || 'Unknown material'}
                    </Text>
                    <Text style={[styles.brandText, { color: colors.textSecondary }]}>
                      {tray.tray_sub_brands || 'No profile reported'}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailList}>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                      Assigned profile
                    </Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {currentProfileLabel}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                      Remaining
                    </Text>
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
                      <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                        {context.temperature}°C
                      </Text>
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
                      AMS drying
                    </Text>
                    <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                      {dryingActive
                        ? `${Math.ceil((currentAms?.dry_time ?? 0) / 60)}h remaining`
                        : 'Start a drying cycle for this AMS.'}
                    </Text>

                    {dryingActive ? (
                      <View style={styles.detailList}>
                        <View style={styles.detailRow}>
                          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                            Filament
                          </Text>
                          <Text style={[styles.detailValue, { color: colors.text }]}>
                            {currentAms?.dry_filament || tray.tray_sub_brands || tray.tray_type || 'Drying'}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                            Target
                          </Text>
                          <Text style={[styles.detailValue, { color: colors.text }]}>
                            {currentAms?.dry_target_temp != null
                              ? `${currentAms.dry_target_temp}°C`
                              : `${dryingTemp}°C`}
                          </Text>
                        </View>
                        <PrimaryButton
                          label={stopDryingMutation.isPending ? 'Stopping…' : 'Stop drying'}
                          variant="danger"
                          onPress={() => stopDryingMutation.mutate()}
                          disabled={stopDryingMutation.isPending}
                          loading={stopDryingMutation.isPending}
                        />
                      </View>
                    ) : (
                      <View style={styles.sectionContent}>
                        <TextField
                          label="Temperature (°C)"
                          value={dryingTemp}
                          onChangeText={setDryingTemp}
                          keyboardType="number-pad"
                        />
                        <TextField
                          label="Duration (hours)"
                          value={dryingDuration}
                          onChangeText={setDryingDuration}
                          keyboardType="number-pad"
                        />
                        <TextField
                          label="Filament"
                          value={dryingFilament}
                          onChangeText={setDryingFilament}
                          placeholder="PLA, PETG, ABS…"
                        />
                        <Pressable
                          onPress={() => {
                            if (!dryingLoadedTray) setRotateTray(current => !current);
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
                            Rotate tray during drying
                          </Text>
                          <Text
                            style={[
                              styles.toggleValue,
                              { color: rotateTray && !dryingLoadedTray ? colors.accentLight : colors.textSecondary },
                            ]}
                          >
                            {dryingLoadedTray ? 'Unavailable' : rotateTray ? 'On' : 'Off'}
                          </Text>
                        </Pressable>
                        {dryingLoadedTray ? (
                          <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                            Rotation is unavailable while any spool in this AMS is loaded into the feed path.
                          </Text>
                        ) : null}
                        <PrimaryButton
                          label={startDryingMutation.isPending ? 'Starting…' : 'Start drying'}
                          onPress={() => startDryingMutation.mutate()}
                          disabled={startDryingMutation.isPending}
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
                    Spool tracking
                  </Text>
                  <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                    Assign inventory spools and link RFID tags.
                  </Text>

                  <View style={styles.detailList}>
                    <View style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                        Inventory spool
                      </Text>
                      <Text style={[styles.detailValue, { color: colors.text }]}>
                        {currentAssignmentLabel}
                      </Text>
                    </View>
                    {spoolTag ? (
                      <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                          RFID / UUID
                        </Text>
                        <Text style={[styles.detailValue, { color: colors.text }]} numberOfLines={2}>
                          {spoolTag}
                        </Text>
                      </View>
                    ) : null}
                    {spoolmanEnabled && spoolTag ? (
                      <View style={styles.detailRow}>
                        <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                          Linked spool
                        </Text>
                        <Text style={[styles.detailValue, { color: colors.text }]}>
                          {linkedSpool ? `Spool #${linkedSpool.id}` : 'Not linked'}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.actions}>
                    <PrimaryButton
                      label="Assign inventory spool"
                      variant="secondary"
                      onPress={() => setShowAssignSpoolModal(true)}
                    />
                    {currentAssignment ? (
                      <PrimaryButton
                        label={unassignSpoolMutation.isPending ? 'Unassigning…' : 'Unassign inventory spool'}
                        variant="danger"
                        onPress={() => unassignSpoolMutation.mutate()}
                        disabled={unassignSpoolMutation.isPending}
                        loading={unassignSpoolMutation.isPending}
                      />
                    ) : null}
                    {spoolmanEnabled && spoolTag ? (
                      <>
                        <PrimaryButton
                          label="Link RFID tag"
                          variant="secondary"
                          onPress={() => setShowLinkSpoolModal(true)}
                        />
                        {linkedSpool ? (
                          <PrimaryButton
                            label={unlinkSpoolMutation.isPending ? 'Unlinking…' : 'Unlink RFID tag'}
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
                    label={loadMutation.isPending ? 'Loading…' : 'Load filament'}
                    onPress={() => loadMutation.mutate()}
                    disabled={loadDisabled}
                    loading={loadMutation.isPending}
                  />
                  <PrimaryButton
                    label={unloadMutation.isPending ? 'Unloading…' : 'Unload filament'}
                    variant="secondary"
                    onPress={() => unloadMutation.mutate()}
                    disabled={unloadDisabled}
                    loading={unloadMutation.isPending}
                  />
                  <PrimaryButton
                    label="Configure slot"
                    variant="secondary"
                    onPress={() => setConfiguring(true)}
                    disabled={savePresetMutation.isPending}
                  />
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
        trayId={context.trayId}
        slotLabel={slotLabel}
        materialHint={tray.tray_type}
        colorHint={tray.tray_color}
        onClose={() => setShowAssignSpoolModal(false)}
      />

      <LinkSpoolModal
        visible={showLinkSpoolModal}
        printerId={printerId}
        amsId={context.amsId}
        trayId={context.trayId}
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
