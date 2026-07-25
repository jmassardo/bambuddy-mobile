import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Layers, Scissors, Workflow, X } from 'lucide-react-native';
import { api } from '@/api/client';
import { PrimaryButton, TextField } from '@/components/common/AppUI';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import type { Printer } from '@/types/api';
import { isRecord, pickNumber, pickString, type ApiRecord } from '@/utils/data';

interface ProjectModalProps {
  visible: boolean;
  onClose: () => void;
  projectId: number;
  projectName: string;
}

interface ToggleRowProps {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

const projectApi = api as typeof api & {
  sliceProject: (id: number, data: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

function ToggleRow({ label, description, value, onValueChange }: ToggleRowProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.toggleRow, { borderBottomColor: colors.borderSubtle }]}> 
      <View style={styles.toggleCopy}>
        <Text style={[styles.toggleLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.toggleDescription, { color: colors.textSecondary }]}>{description}</Text>
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

function ModalShell({
  visible,
  onClose,
  title,
  subtitle,
  icon,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}> 
        <View style={[styles.card, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
          <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}> 
            <View style={styles.headerTitleWrap}>
              <View style={[styles.iconWrap, { backgroundColor: colors.accentBg }]}>{icon}</View>
              <View style={styles.headerTextWrap}>
                <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
              </View>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <X size={18} color={colors.textSecondary} strokeWidth={2} />
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

function PrinterPicker({
  selectedPrinterIds,
  onTogglePrinter,
  visible,
}: {
  selectedPrinterIds: number[];
  onTogglePrinter: (printerId: number) => void;
  visible: boolean;
}) {
  const { colors } = useTheme();

  const printersQuery = useQuery({
    queryKey: ['printers'],
    queryFn: async () => (await api.getPrinters()) as unknown as Printer[],
    enabled: visible,
  });

  const activePrinters = useMemo(
    () => (printersQuery.data ?? []).filter(printer => printer.is_active !== false),
    [printersQuery.data],
  );

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Printers</Text>
      <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>Select one or more active printers for this project.</Text>
      <View style={styles.selectionGrid}>
        {activePrinters.map(printer => {
          const selected = selectedPrinterIds.includes(printer.id);
          return (
            <Pressable
              key={printer.id}
              onPress={() => onTogglePrinter(printer.id)}
              style={[
                styles.selectionCard,
                {
                  backgroundColor: selected ? colors.accentBg : colors.surfaceElevated,
                  borderColor: selected ? colors.accent : colors.border,
                },
              ]}
            >
              <View style={styles.selectionHeader}>
                <Text style={[styles.selectionTitle, { color: colors.text }]} numberOfLines={1}>
                  {printer.name}
                </Text>
                {selected ? <Check size={16} color={colors.accentLight} strokeWidth={2.5} /> : null}
              </View>
              <Text style={[styles.selectionMeta, { color: colors.textSecondary }]} numberOfLines={2}>
                {[printer.model, printer.location].filter(Boolean).join(' · ') || 'Configured printer'}
              </Text>
            </Pressable>
          );
        })}
        {printersQuery.isLoading ? (
          <View style={styles.loadingInline}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null}
      </View>
      {!printersQuery.isLoading && activePrinters.length === 0 ? (
        <Text style={[styles.emptyHint, { color: colors.warning }]}>No active printers are available for batch actions.</Text>
      ) : null}
    </View>
  );
}

export function ProjectBatchPrintModal({
  visible,
  onClose,
  projectId,
  projectName,
}: ProjectModalProps) {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPrinterIds, setSelectedPrinterIds] = useState<number[]>([]);
  const [quantity, setQuantity] = useState('1');
  const [manualStart, setManualStart] = useState(false);
  const [bedLevelling, setBedLevelling] = useState(true);
  const [timelapse, setTimelapse] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelectedPrinterIds([]);
    setQuantity('1');
    setManualStart(false);
    setBedLevelling(true);
    setTimelapse(false);
  }, [visible]);

  const batchMutation = useMutation({
    mutationFn: async () => {
      if (selectedPrinterIds.length === 0) {
        throw new Error('Select at least one printer.');
      }

      return api.addToQueue({
        project_id: projectId,
        printer_id: selectedPrinterIds.length === 1 ? selectedPrinterIds[0] : undefined,
        printer_ids: selectedPrinterIds,
        quantity: Math.max(1, Number(quantity) || 1),
        manual_start: manualStart,
        bed_levelling: bedLevelling,
        timelapse,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['queue'] }),
        queryClient.invalidateQueries({ queryKey: ['project', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['projectArchives', projectId] }),
      ]);
      showToast('Project batch queued.', 'success');
      onClose();
    },
    onError: (error: Error) => {
      showToast(error.message || 'Unable to queue this project batch.', 'error');
    },
  });

  const togglePrinter = (printerId: number) => {
    setSelectedPrinterIds(current =>
      current.includes(printerId)
        ? current.filter(value => value !== printerId)
        : [...current, printerId],
    );
  };

  return (
    <ModalShell
      visible={visible}
      onClose={onClose}
      title="Batch print"
      subtitle={projectName}
      icon={<Layers size={18} color={colors.accentLight} strokeWidth={2} />}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <PrinterPicker
          visible={visible}
          selectedPrinterIds={selectedPrinterIds}
          onTogglePrinter={togglePrinter}
        />

        <View style={styles.section}>
          <TextField
            label="Quantity"
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="number-pad"
          />
          <View style={[styles.optionCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
            <ToggleRow
              label="Manual start"
              description="Create queued items without dispatching immediately."
              value={manualStart}
              onValueChange={setManualStart}
            />
            <ToggleRow
              label="Bed levelling"
              description="Run auto bed levelling for each print."
              value={bedLevelling}
              onValueChange={setBedLevelling}
            />
            <ToggleRow
              label="Timelapse"
              description="Capture a timelapse for generated queue items."
              value={timelapse}
              onValueChange={setTimelapse}
            />
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.borderSubtle }]}> 
        <PrimaryButton label="Cancel" variant="secondary" onPress={onClose} />
        <PrimaryButton
          label={batchMutation.isPending ? 'Queueing…' : 'Queue batch'}
          onPress={() => void batchMutation.mutateAsync()}
          loading={batchMutation.isPending}
          disabled={selectedPrinterIds.length === 0}
        />
      </View>
    </ModalShell>
  );
}

export function ProjectPipelineModal({
  visible,
  onClose,
  projectId,
  projectName,
}: ProjectModalProps) {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPipelineId, setSelectedPipelineId] = useState<number | null>(null);
  const [optionsJson, setOptionsJson] = useState('');

  const pipelinesQuery = useQuery({
    queryKey: ['slicerPipelines'],
    queryFn: () => api.getPipelines(),
    enabled: visible,
  });

  useEffect(() => {
    if (!visible) return;
    const firstId = pickNumber((pipelinesQuery.data ?? [])[0] as ApiRecord | undefined, ['id'], 0);
    setSelectedPipelineId(firstId > 0 ? firstId : null);
    setOptionsJson('');
  }, [pipelinesQuery.data, visible]);

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPipelineId) {
        throw new Error('Select a slicer pipeline.');
      }

      let parsedOptions: Record<string, unknown> = {};
      if (optionsJson.trim()) {
        const parsed = JSON.parse(optionsJson);
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
          throw new Error('Pipeline options must be a JSON object.');
        }
        parsedOptions = parsed as Record<string, unknown>;
      }

      return api.runPipeline(selectedPipelineId, {
        project_id: projectId,
        ...parsedOptions,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['queue'] }),
        queryClient.invalidateQueries({ queryKey: ['projectTimeline', projectId] }),
      ]);
      showToast('Pipeline started.', 'success');
      onClose();
    },
    onError: (error: Error) => {
      showToast(error.message || 'Unable to run the selected pipeline.', 'error');
    },
  });

  const pipelines = useMemo(
    () => ((pipelinesQuery.data ?? []).filter(isRecord) as ApiRecord[]),
    [pipelinesQuery.data],
  );

  return (
    <ModalShell
      visible={visible}
      onClose={onClose}
      title="Run pipeline"
      subtitle={projectName}
      icon={<Workflow size={18} color={colors.accentLight} strokeWidth={2} />}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Available pipelines</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>Choose an existing slicer pipeline, then optionally pass JSON options.</Text>
          <View style={styles.selectionGrid}>
            {pipelines.map(pipeline => {
              const pipelineId = pickNumber(pipeline, ['id']);
              const selected = selectedPipelineId === pipelineId;
              return (
                <Pressable
                  key={pipelineId}
                  onPress={() => setSelectedPipelineId(pipelineId)}
                  style={[
                    styles.selectionCard,
                    {
                      backgroundColor: selected ? colors.accentBg : colors.surfaceElevated,
                      borderColor: selected ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <View style={styles.selectionHeader}>
                    <Text style={[styles.selectionTitle, { color: colors.text }]} numberOfLines={1}>
                      {pickString(pipeline, ['name'], 'Pipeline')}
                    </Text>
                    {selected ? <Check size={16} color={colors.accentLight} strokeWidth={2.5} /> : null}
                  </View>
                  <Text style={[styles.selectionMeta, { color: colors.textSecondary }]} numberOfLines={3}>
                    {pickString(pipeline, ['description', 'notes'], 'No pipeline description is available.')}
                  </Text>
                </Pressable>
              );
            })}
            {pipelinesQuery.isLoading ? (
              <View style={styles.loadingInline}>
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : null}
          </View>
          {!pipelinesQuery.isLoading && pipelines.length === 0 ? (
            <Text style={[styles.emptyHint, { color: colors.warning }]}>No slicer pipelines are available on the server.</Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <TextField
            label="Options JSON"
            value={optionsJson}
            onChangeText={setOptionsJson}
            placeholder='{"profile":"0.4 nozzle","priority":"normal"}'
            autoCapitalize="none"
            multiline
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.borderSubtle }]}> 
        <PrimaryButton label="Cancel" variant="secondary" onPress={onClose} />
        <PrimaryButton
          label={runMutation.isPending ? 'Starting…' : 'Run pipeline'}
          onPress={() => void runMutation.mutateAsync()}
          loading={runMutation.isPending}
          disabled={!selectedPipelineId || pipelines.length === 0}
        />
      </View>
    </ModalShell>
  );
}

export function ProjectSliceModal({
  visible,
  onClose,
  projectId,
  projectName,
}: ProjectModalProps) {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState('');
  const [plate, setPlate] = useState('');
  const [enableSupports, setEnableSupports] = useState(true);
  const [extraJson, setExtraJson] = useState('');

  const presetsQuery = useQuery({
    queryKey: ['slicerPresets', 'project-slice'],
    queryFn: () => api.getSlicerPresets(),
    enabled: visible,
  });

  const profileHints = useMemo(() => {
    const data = presetsQuery.data;
    if (!data || typeof data !== 'object') return [];

    const values = new Set<string>();
    const visit = (value: unknown) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (typeof value !== 'object') return;
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        if (typeof nested === 'string' && /profile|preset|name/i.test(key)) values.add(nested);
        else visit(nested);
      }
    };

    visit(data);
    return Array.from(values).filter(Boolean).slice(0, 6);
  }, [presetsQuery.data]);

  useEffect(() => {
    if (!visible) return;
    setProfile(profileHints[0] ?? '');
    setPlate('');
    setEnableSupports(true);
    setExtraJson('');
  }, [profileHints, visible]);

  const sliceMutation = useMutation({
    mutationFn: async () => {
      let parsedExtra: Record<string, unknown> = {};
      if (extraJson.trim()) {
        const parsed = JSON.parse(extraJson);
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
          throw new Error('Additional slice options must be a JSON object.');
        }
        parsedExtra = parsed as Record<string, unknown>;
      }

      return projectApi.sliceProject(projectId, {
        project_id: projectId,
        profile: profile.trim() || undefined,
        plate: plate.trim() || undefined,
        supports: enableSupports,
        ...parsedExtra,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['projectTimeline', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['projectFiles', projectId] }),
      ]);
      showToast('Slice job started.', 'success');
      onClose();
    },
    onError: (error: Error) => {
      showToast(error.message || 'Unable to start slicing for this project.', 'error');
    },
  });

  return (
    <ModalShell
      visible={visible}
      onClose={onClose}
      title="Slice project"
      subtitle={projectName}
      icon={<Scissors size={18} color={colors.accentLight} strokeWidth={2} />}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <TextField
            label="Profile"
            value={profile}
            onChangeText={setProfile}
            placeholder="Slicer profile name"
          />
          {profileHints.length > 0 ? (
            <View style={styles.hintRow}>
              {profileHints.map(hint => (
                <Pressable
                  key={hint}
                  onPress={() => setProfile(hint)}
                  style={[styles.hintChip, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                >
                  <Text style={[styles.hintChipText, { color: colors.textSecondary }]}>{hint}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <TextField
            label="Plate"
            value={plate}
            onChangeText={setPlate}
            placeholder="Plate name or index"
          />
          <View style={[styles.optionCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
            <ToggleRow
              label="Generate supports"
              description="Include supports when slicing project files."
              value={enableSupports}
              onValueChange={setEnableSupports}
            />
          </View>
          <TextField
            label="Additional options JSON"
            value={extraJson}
            onChangeText={setExtraJson}
            placeholder='{"layer_height":"0.2","infill":15}'
            autoCapitalize="none"
            multiline
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.borderSubtle }]}> 
        <PrimaryButton label="Cancel" variant="secondary" onPress={onClose} />
        <PrimaryButton
          label={sliceMutation.isPending ? 'Starting…' : 'Slice'}
          onPress={() => void sliceMutation.mutateAsync()}
          loading={sliceMutation.isPending}
        />
      </View>
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius['2xl'],
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  sectionSubtitle: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  selectionGrid: {
    gap: spacing.sm,
  },
  selectionCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  selectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  selectionTitle: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  selectionMeta: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  loadingInline: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  emptyHint: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  optionCard: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toggleCopy: {
    flex: 1,
    gap: 2,
  },
  toggleLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  toggleDescription: {
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  hintRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  hintChip: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  hintChipText: {
    fontSize: fontSize.xs,
  },
});
