import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronRight,
  FileBox,
  FolderOpen,
  Palette,
  Play,
  Printer as PrinterIcon,
  Settings2,
  X,
} from 'lucide-react-native';
import { api } from '@/api/client';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import type { AMSUnit, Printer, PrinterStatus } from '@/types/api';
import {
  formatDuration,
  formatWeight,
  isRecord,
  pickBoolean,
  pickId,
  pickNumber,
  pickString,
  type ApiRecord,
} from '@/utils/data';
import { formatFileSize } from '@/utils/data';

interface PrintModalProps {
  visible: boolean;
  onClose: () => void;
  initialPrinterId?: number | null;
  initialFileId?: number | null;
}

interface FolderNode {
  id: number | null;
  name: string;
}

interface PlateInfo {
  index: number;
  name: string | null;
  print_time_seconds: number | null;
  filament_used_grams: number | null;
  objects: string[];
}

interface LibraryFilePlatesResponse {
  is_multi_plate: boolean;
  plates: PlateInfo[];
}

interface FilamentRequirement {
  slot_id: number;
  type: string;
  color: string;
  used_grams: number;
  used_meters: number;
}

interface FilamentRequirementsResponse {
  filaments: FilamentRequirement[];
}

interface LoadedTray {
  globalTrayId: number;
  label: string;
  type: string;
  color: string | null;
}

interface PrintOptionsState {
  bed_levelling: boolean;
  flow_cali: boolean;
  timelapse: boolean;
  layer_inspect: boolean;
}

const DEFAULT_OPTIONS: PrintOptionsState = {
  bed_levelling: true,
  flow_cali: true,
  timelapse: false,
  layer_inspect: false,
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function normalizeHexColor(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.replace('#', '').trim();
  if (!normalized || /^0+$/.test(normalized)) return null;
  return `#${normalized.slice(0, 6)}`;
}

function entryName(item: ApiRecord) {
  return pickString(item, ['print_name', 'filename', 'name'], 'Untitled');
}

function isFolderEntry(item: ApiRecord) {
  return pickBoolean(item, ['is_folder'], pickString(item, ['type', 'kind']) === 'folder');
}

function isPrintableFile(item: ApiRecord) {
  const name = entryName(item).toLowerCase();
  const type = pickString(item, ['file_type', 'type']).toLowerCase();
  return !isFolderEntry(item) && (/(\.3mf|\.gcode|\.gcode\.3mf)$/i.test(name) || ['3mf', 'gcode'].includes(type));
}

function getGlobalTrayId(amsId: number, trayId: number) {
  return amsId >= 255 ? trayId : amsId * 4 + trayId;
}

function getAmsLabel(ams: AMSUnit) {
  const index = ams.id >= 128 ? ams.id - 128 : ams.id;
  return `AMS ${String.fromCharCode(65 + (index % 26))}`;
}

function getLoadedTrays(status?: PrinterStatus): LoadedTray[] {
  if (!status) return [];

  const fromAms = (status.ams ?? []).flatMap((ams) =>
    (ams.tray ?? [])
      .filter((tray) => !!tray.tray_type)
      .map((tray) => ({
        globalTrayId: getGlobalTrayId(ams.id, tray.id),
        label: `${getAmsLabel(ams)} · Slot ${tray.id + 1}`,
        type: tray.tray_type ?? 'Unknown',
        color: normalizeHexColor(tray.tray_color),
      })),
  );

  const external = (status.vt_tray ?? [])
    .filter((tray) => !!tray.tray_type)
    .map((tray) => ({
      globalTrayId: getGlobalTrayId(255, tray.id),
      label: 'External spool',
      type: tray.tray_type ?? 'Unknown',
      color: normalizeHexColor(tray.tray_color),
    }));

  return [...fromAms, ...external];
}

function buildSuggestedMappings(
  requirements: FilamentRequirement[],
  loadedTrays: LoadedTray[],
) {
  const used = new Set<number>();
  const mappings: Record<number, number> = {};

  requirements.forEach((requirement, index) => {
    const slotId = requirement.slot_id || index + 1;
    const available = loadedTrays.filter((tray) => !used.has(tray.globalTrayId));
    const exact = available.find(
      (tray) =>
        tray.type.toUpperCase() === requirement.type.toUpperCase() &&
        normalizeHexColor(tray.color) === normalizeHexColor(requirement.color),
    );
    const typeOnly = available.find(
      (tray) => tray.type.toUpperCase() === requirement.type.toUpperCase(),
    );
    const fallback = available[0];
    const chosen = exact ?? typeOnly ?? fallback;

    if (chosen) {
      mappings[slotId] = chosen.globalTrayId;
      used.add(chosen.globalTrayId);
    }
  });

  return mappings;
}

function buildAmsMapping(
  requirements: FilamentRequirement[],
  selectedMappings: Record<number, number>,
) {
  if (requirements.length === 0) return undefined;
  const highestSlot = Math.max(...requirements.map((item, index) => item.slot_id || index + 1));
  const mapping = Array.from({ length: highestSlot }, () => -1);

  requirements.forEach((requirement, index) => {
    const slotId = requirement.slot_id || index + 1;
    mapping[slotId - 1] = selectedMappings[slotId] ?? -1;
  });

  return mapping;
}

function OptionRow({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const { colors } = useTheme();

  return (
    <View style={[styles.optionRow, { borderBottomColor: colors.borderSubtle }]}> 
      <View style={styles.optionTextWrap}>
        <Text style={[styles.optionLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.surfaceHover, true: colors.accent }}
        thumbColor={colors.text}
      />
    </View>
  );
}

export function PrintModal({
  visible,
  onClose,
  initialPrinterId = null,
  initialFileId = null,
}: PrintModalProps) {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [folderStack, setFolderStack] = useState<FolderNode[]>([{ id: null, name: 'Library' }]);
  const [search, setSearch] = useState('');
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | null>(initialPrinterId);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(initialFileId);
  const [selectedPlateId, setSelectedPlateId] = useState<number | null>(null);
  const [manualMappings, setManualMappings] = useState<Record<number, number>>({});
  const [options, setOptions] = useState<PrintOptionsState>(DEFAULT_OPTIONS);

  const currentFolder = folderStack[folderStack.length - 1];

  useEffect(() => {
    if (!visible) return;
    setFolderStack([{ id: null, name: 'Library' }]);
    setSearch('');
    setSelectedPrinterId(initialPrinterId);
    setSelectedFileId(initialFileId);
    setSelectedPlateId(null);
    setManualMappings({});
  }, [initialFileId, initialPrinterId, visible]);

  const printersQuery = useQuery({
    queryKey: ['printers'],
    queryFn: async () => (await api.getPrinters()) as unknown as Printer[],
    enabled: visible,
  });

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
    enabled: visible,
  });

  const filesQuery = useQuery({
    queryKey: ['libraryFiles', currentFolder.id ?? 'root'],
    queryFn: () => api.getLibraryFiles(currentFolder.id ?? undefined),
    enabled: visible,
  });

  const selectedFileQuery = useQuery({
    queryKey: ['libraryFile', selectedFileId],
    queryFn: () => api.getLibraryFile(selectedFileId!),
    enabled: visible && selectedFileId != null,
  });

  const platesQuery = useQuery({
    queryKey: ['libraryFilePlates', selectedFileId],
    queryFn: async () =>
      (await api.getLibraryFilePlates(selectedFileId!)) as unknown as LibraryFilePlatesResponse,
    enabled: visible && selectedFileId != null,
  });

  const requirementsQuery = useQuery({
    queryKey: ['libraryFileFilaments', selectedFileId, selectedPlateId],
    queryFn: async () =>
      (await api.getLibraryFileFilamentRequirements(
        selectedFileId!,
        selectedPlateId ?? undefined,
      )) as unknown as FilamentRequirementsResponse,
    enabled: visible && selectedFileId != null,
  });

  const printerStatusQuery = useQuery({
    queryKey: ['printerStatus', selectedPrinterId],
    queryFn: async () =>
      (await api.getPrinterStatus(selectedPrinterId!)) as unknown as PrinterStatus,
    enabled: visible && selectedPrinterId != null,
  });

  useEffect(() => {
    if (!visible || !settingsQuery.data) return;
    setOptions({
      bed_levelling: pickBoolean(settingsQuery.data, ['default_bed_levelling'], true),
      flow_cali: pickBoolean(settingsQuery.data, ['default_flow_cali'], true),
      timelapse: pickBoolean(settingsQuery.data, ['default_timelapse'], false),
      layer_inspect: pickBoolean(settingsQuery.data, ['default_layer_inspect'], false),
    });
  }, [settingsQuery.data, visible]);

  useEffect(() => {
    if (!visible) return;
    if (selectedPrinterId != null) return;
    const activePrinters = (printersQuery.data ?? []).filter((printer) => printer.is_active !== false);
    if (activePrinters.length === 1) {
      setSelectedPrinterId(activePrinters[0].id);
    }
  }, [printersQuery.data, selectedPrinterId, visible]);

  useEffect(() => {
    setManualMappings({});
  }, [selectedFileId, selectedPrinterId, selectedPlateId]);

  useEffect(() => {
    const plates = platesQuery.data?.plates ?? [];
    if (!visible || plates.length === 0) return;
    if (selectedPlateId != null && plates.some((plate) => plate.index === selectedPlateId)) {
      return;
    }
    setSelectedPlateId(plates[0].index);
  }, [platesQuery.data, selectedPlateId, visible]);

  const entries = useMemo(() => {
    return (filesQuery.data ?? []).filter(isRecord);
  }, [filesQuery.data]);

  const filteredEntries = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter((item) => {
      if (!isFolderEntry(item) && !isPrintableFile(item)) return false;
      if (!term) return true;
      return [entryName(item), pickString(item, ['filename', 'name'])]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [entries, search]);

  const selectedFileRecord = useMemo(() => {
    const inList = entries.find((item) => Number(pickId(item)) === selectedFileId);
    if (inList) return inList;
    return selectedFileQuery.data && isRecord(selectedFileQuery.data)
      ? selectedFileQuery.data
      : null;
  }, [entries, selectedFileId, selectedFileQuery.data]);

  const plates = platesQuery.data?.plates ?? [];
  const requirements = useMemo(
    () => requirementsQuery.data?.filaments ?? [],
    [requirementsQuery.data?.filaments],
  );
  const loadedTrays = useMemo(
    () => getLoadedTrays(printerStatusQuery.data),
    [printerStatusQuery.data],
  );
  const suggestedMappings = useMemo(
    () => buildSuggestedMappings(requirements, loadedTrays),
    [loadedTrays, requirements],
  );

  const effectiveMappings = useMemo(() => {
    const next: Record<number, number> = { ...suggestedMappings, ...manualMappings };
    return next;
  }, [manualMappings, suggestedMappings]);

  const startPrintMutation = useMutation({
    mutationFn: () => {
      if (selectedPrinterId == null || selectedFileId == null) {
        throw new Error('Select a printer and file before starting a print.');
      }

      return api.startPrint(selectedPrinterId, selectedFileId, {
        plate_id: selectedPlateId ?? undefined,
        ams_mapping: buildAmsMapping(requirements, effectiveMappings),
        ...options,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['queue'] }),
        selectedPrinterId != null
          ? queryClient.invalidateQueries({ queryKey: ['printerStatus', selectedPrinterId] })
          : Promise.resolve(),
      ]);
      showToast('Print started.', 'success');
      onClose();
    },
    onError: (error) => {
      showToast(getErrorMessage(error, 'Unable to start the print.'), 'error');
    },
  });

  const breadcrumbLabel = folderStack.map((item) => item.name).join(' / ');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}> 
        <View style={[styles.card, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
          <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}> 
            <View style={styles.headerTextWrap}>
              <Text style={[styles.title, { color: colors.text }]}>Start print</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Choose a printer, file, mapping, and options.</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <X size={18} color={colors.textSecondary} strokeWidth={2} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.sectionHeader}>
              <PrinterIcon size={16} color={colors.accentLight} strokeWidth={2} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Printer selection</Text>
            </View>
            <View style={styles.cardList}>
              {(printersQuery.data ?? []).map((printer) => {
                const selected = selectedPrinterId === printer.id;
                return (
                  <Pressable
                    key={printer.id}
                    onPress={() => setSelectedPrinterId(printer.id)}
                    style={[
                      styles.selectionCard,
                      {
                        backgroundColor: selected ? colors.accentBg : colors.surfaceElevated,
                        borderColor: selected ? colors.accent : colors.border,
                      },
                    ]}
                  >
                    <View style={styles.selectionCardHeader}>
                      <Text style={[styles.selectionTitle, { color: colors.text }]}>{printer.name}</Text>
                      {selected ? <Check size={16} color={colors.accentLight} strokeWidth={2.5} /> : null}
                    </View>
                    <Text style={[styles.selectionMeta, { color: colors.textSecondary }]}>
                      {[printer.model, printer.location].filter(Boolean).join(' · ') || 'Configured printer'}
                    </Text>
                  </Pressable>
                );
              })}
              {printersQuery.isLoading ? (
                <ActivityIndicator color={colors.accent} />
              ) : null}
            </View>

            <View style={styles.sectionHeader}>
              <FolderOpen size={16} color={colors.accentLight} strokeWidth={2} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>File selection</Text>
            </View>
            <View style={[styles.sectionCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
              <Text style={[styles.breadcrumb, { color: colors.textSecondary }]}>{breadcrumbLabel}</Text>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search printable files"
                placeholderTextColor={colors.inputPlaceholder}
                style={[
                  styles.searchInput,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: colors.inputBorder,
                    color: colors.inputText,
                  },
                ]}
              />

              <View style={styles.browserList}>
                {folderStack.length > 1 ? (
                  <Pressable
                    onPress={() => setFolderStack((current) => current.slice(0, -1))}
                    style={[styles.browserRow, { borderBottomColor: colors.borderSubtle }]}
                  >
                    <Text style={[styles.browserName, { color: colors.text }]}>..</Text>
                    <ChevronRight size={14} color={colors.textSecondary} strokeWidth={2} />
                  </Pressable>
                ) : null}

                {filteredEntries.map((item) => {
                  const id = Number(pickId(item));
                  const folder = isFolderEntry(item);
                  const selected = !folder && selectedFileId === id;
                  return (
                    <Pressable
                      key={`${folder ? 'folder' : 'file'}-${id}`}
                      onPress={() => {
                        if (folder) {
                          setFolderStack((current) => [
                            ...current,
                            { id, name: pickString(item, ['name', 'filename'], 'Folder') },
                          ]);
                          return;
                        }
                        setSelectedFileId(id);
                      }}
                      style={[
                        styles.browserRow,
                        {
                          borderBottomColor: colors.borderSubtle,
                          backgroundColor: selected ? colors.accentBg : 'transparent',
                        },
                      ]}
                    >
                      <View style={styles.browserTextWrap}>
                        <Text style={[styles.browserName, { color: colors.text }]} numberOfLines={1}>
                          {entryName(item)}
                        </Text>
                        <Text style={[styles.browserMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                          {folder
                            ? 'Folder'
                            : `${formatFileSize(pickNumber(item, ['file_size', 'size', 'size_bytes']))} · ${pickString(item, ['sliced_for_model'], 'Printable file')}`}
                        </Text>
                      </View>
                      {folder ? (
                        <ChevronRight size={14} color={colors.textSecondary} strokeWidth={2} />
                      ) : selected ? (
                        <Check size={16} color={colors.accentLight} strokeWidth={2.5} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {selectedFileRecord ? (
              <View style={[styles.selectedFileCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                <View style={styles.sectionHeader}>
                  <FileBox size={16} color={colors.accentLight} strokeWidth={2} />
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Selected file</Text>
                </View>
                <Text style={[styles.selectionTitle, { color: colors.text }]}>{entryName(selectedFileRecord)}</Text>
                <Text style={[styles.selectionMeta, { color: colors.textSecondary }]}>
                  {formatFileSize(pickNumber(selectedFileRecord, ['file_size', 'size', 'size_bytes']))}
                  {' · '}
                  {pickString(selectedFileRecord, ['sliced_for_model'], 'Any compatible printer')}
                </Text>
                <Text style={[styles.selectionMeta, { color: colors.textSecondary }]}>
                  {formatDuration(pickNumber(selectedFileRecord, ['print_time_seconds'], 0))}
                  {' · '}
                  {formatWeight(pickNumber(selectedFileRecord, ['filament_used_grams'], 0))}
                </Text>
              </View>
            ) : null}

            {plates.length > 1 ? (
              <>
                <View style={styles.sectionHeader}>
                  <FileBox size={16} color={colors.accentLight} strokeWidth={2} />
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Plate selection</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {plates.map((plate) => {
                    const active = selectedPlateId === plate.index;
                    return (
                      <Pressable
                        key={plate.index}
                        onPress={() => setSelectedPlateId(plate.index)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: active ? colors.accentBg : colors.surfaceElevated,
                            borderColor: active ? colors.accent : colors.border,
                          },
                        ]}
                      >
                        <Text style={[styles.chipTitle, { color: active ? colors.accentLight : colors.text }]}>
                          {plate.name || `Plate ${plate.index}`}
                        </Text>
                        <Text style={[styles.chipMeta, { color: colors.textSecondary }]}>
                          {formatDuration(plate.print_time_seconds ?? 0)} · {formatWeight(plate.filament_used_grams ?? 0)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            ) : null}

            {requirements.length > 0 ? (
              <>
                <View style={styles.sectionHeader}>
                  <Palette size={16} color={colors.accentLight} strokeWidth={2} />
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Filament mapping</Text>
                </View>
                <View style={styles.mappingList}>
                  {requirements.map((requirement, index) => {
                    const slotId = requirement.slot_id || index + 1;
                    const selectedTrayId = effectiveMappings[slotId];
                    return (
                      <View
                        key={`${slotId}-${requirement.type}-${index}`}
                        style={[
                          styles.mappingCard,
                          {
                            backgroundColor: colors.surfaceElevated,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <View style={styles.mappingHeader}>
                          <View
                            style={[
                              styles.colorSwatch,
                              {
                                backgroundColor:
                                  normalizeHexColor(requirement.color) ?? colors.surfaceHover,
                                borderColor: colors.border,
                              },
                            ]}
                          />
                          <View style={styles.mappingTextWrap}>
                            <Text style={[styles.mappingTitle, { color: colors.text }]}>Slot {slotId} · {requirement.type}</Text>
                            <Text style={[styles.mappingMeta, { color: colors.textSecondary }]}>
                              {formatWeight(requirement.used_grams)}
                            </Text>
                          </View>
                        </View>

                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                          {loadedTrays.map((tray) => {
                            const active = selectedTrayId === tray.globalTrayId;
                            return (
                              <Pressable
                                key={`${slotId}-${tray.globalTrayId}`}
                                onPress={() =>
                                  setManualMappings((current) => ({
                                    ...current,
                                    [slotId]: tray.globalTrayId,
                                  }))
                                }
                                style={[
                                  styles.slotChip,
                                  {
                                    backgroundColor: active ? colors.accentBg : colors.surface,
                                    borderColor: active ? colors.accent : colors.border,
                                  },
                                ]}
                              >
                                <View
                                  style={[
                                    styles.smallSwatch,
                                    {
                                      backgroundColor: tray.color ?? colors.surfaceHover,
                                      borderColor: colors.border,
                                    },
                                  ]}
                                />
                                <Text style={[styles.slotChipText, { color: active ? colors.accentLight : colors.text }]}> 
                                  {tray.label}
                                </Text>
                                <Text style={[styles.slotChipMeta, { color: colors.textSecondary }]}>{tray.type}</Text>
                              </Pressable>
                            );
                          })}
                        </ScrollView>

                        {loadedTrays.length === 0 ? (
                          <Text style={[styles.emptyHint, { color: colors.warning }]}>Load filament into the printer to review AMS slot mappings.</Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </>
            ) : null}

            <View style={styles.sectionHeader}>
              <Settings2 size={16} color={colors.accentLight} strokeWidth={2} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Print options</Text>
            </View>
            <View style={[styles.sectionCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
              <OptionRow
                label="Bed levelling"
                description="Run an auto bed level before the print starts."
                value={options.bed_levelling}
                onValueChange={(value) => setOptions((current) => ({ ...current, bed_levelling: value }))}
              />
              <OptionRow
                label="Flow calibration"
                description="Calibrate flow before printing this file."
                value={options.flow_cali}
                onValueChange={(value) => setOptions((current) => ({ ...current, flow_cali: value }))}
              />
              <OptionRow
                label="Timelapse"
                description="Capture a timelapse for this print."
                value={options.timelapse}
                onValueChange={(value) => setOptions((current) => ({ ...current, timelapse: value }))}
              />
              <OptionRow
                label="Layer inspect"
                description="Inspect the first layers before the full print continues."
                value={options.layer_inspect}
                onValueChange={(value) => setOptions((current) => ({ ...current, layer_inspect: value }))}
              />
            </View>
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.borderSubtle }]}> 
            <Pressable
              onPress={onClose}
              style={[
                styles.secondaryButton,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => startPrintMutation.mutate()}
              disabled={
                startPrintMutation.isPending ||
                selectedPrinterId == null ||
                selectedFileId == null
              }
              style={[
                styles.primaryButton,
                {
                  backgroundColor:
                    startPrintMutation.isPending ||
                    selectedPrinterId == null ||
                    selectedFileId == null
                      ? colors.surfaceHover
                      : colors.accent,
                  borderColor:
                    startPrintMutation.isPending ||
                    selectedPrinterId == null ||
                    selectedFileId == null
                      ? colors.border
                      : colors.accent,
                },
              ]}
            >
              {startPrintMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Play size={16} color={colors.textInverse} strokeWidth={2} />
              )}
              <Text style={[styles.primaryButtonText, { color: colors.textInverse }]}>Start print</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  headerTextWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    fontSize: fontSize.sm,
  },
  closeButton: {
    padding: spacing.xs,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  cardList: {
    gap: spacing.sm,
  },
  selectionCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  selectionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  selectionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  selectionMeta: {
    fontSize: fontSize.sm,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  breadcrumb: {
    fontSize: fontSize.sm,
  },
  searchInput: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.sm,
  },
  browserList: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  browserRow: {
    minHeight: 52,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  browserTextWrap: {
    flex: 1,
    gap: 2,
  },
  browserName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  browserMeta: {
    fontSize: fontSize.xs,
  },
  selectedFileCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  chipRow: {
    gap: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  chipTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  chipMeta: {
    fontSize: fontSize.xs,
  },
  mappingList: {
    gap: spacing.sm,
  },
  mappingCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  mappingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  mappingTextWrap: {
    flex: 1,
    gap: 2,
  },
  mappingTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  mappingMeta: {
    fontSize: fontSize.xs,
  },
  colorSwatch: {
    width: 18,
    height: 18,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  slotChip: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    minWidth: 120,
    gap: 2,
  },
  smallSwatch: {
    width: 10,
    height: 10,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  slotChipText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  slotChipMeta: {
    fontSize: fontSize.xs,
  },
  emptyHint: {
    fontSize: fontSize.xs,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  optionTextWrap: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  optionDescription: {
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  primaryButton: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  primaryButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
});
