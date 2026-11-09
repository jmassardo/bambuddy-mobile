import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { makerworldApi } from '@/api/makerworld';
import { slicingApi } from '@/api/slicing';
import { printersApi } from '@/api/printers';
import { useServerStore } from '@/api/server';
import type { CatalogInstance } from '@/api/makerworldCatalog';
import { useAuth } from '@/contexts/AuthContext';
import { useSliceJobTracker } from '@/contexts/SliceJobTrackerContext';
import { PrimaryButton } from '@/components/common/AppUI';
import { Sheet } from '@/components/slicing/Controls';
import { translateNative } from '@/i18n';
import type { RootStackParamList } from '@/navigation/types';
import { useCatalogStrings } from '@/screens/makerworldCatalogStrings';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { pickBoolean } from '@/utils/data';
import { hasTarget } from '@/utils/sliceConfiguration';
import {
  oneTapPipelineStorageKey,
  PIPELINE_BLOCKING_ISSUES,
  PIPELINE_TERMINAL_STATUSES,
} from '@/utils/makerworldOneTap';
import type { PipelineEligibilityReport, PipelineRun, SlicerPipeline } from '@/types/api';

type Phase =
  | { kind: 'idle' }
  | { kind: 'busy'; label: string }
  | { kind: 'tracking'; runId: number; pipelineId: number; status: PipelineRun['status']; error?: string | null; tick: number }
  | { kind: 'error'; message: string };

// Same captions (and translation keys) as the "Run with pipeline" sheet.
const ISSUE_CAPTIONS: Record<string, () => string> = {
  printer_not_set: () => translateNative('pipeline.issue.printerNotSet', { defaultValue: 'Printer not set' }),
  printer_not_found: () => translateNative('pipeline.issue.printerNotFound', { defaultValue: 'Printer not found' }),
  printer_disabled: () => translateNative('pipeline.issue.printerDisabled', { defaultValue: 'Printer disabled' }),
  printer_offline: () => translateNative('pipeline.issue.printerOffline', { defaultValue: 'Printer offline' }),
  filament_type_mismatch: () => translateNative('pipeline.issue.filamentType', { defaultValue: 'Filament type mismatch' }),
  filament_color_mismatch: () => translateNative('pipeline.issue.filamentColor', { defaultValue: 'Filament color mismatch' }),
  ams_slot_missing: () => translateNative('pipeline.issue.amsSlot', { defaultValue: 'AMS slot missing' }),
  filament_unverified: () => translateNative('pipeline.issue.filamentUnverified', { defaultValue: 'Filament unverified' }),
  no_class_matches: () => translateNative('pipeline.issue.noClassMatches', { defaultValue: 'No matching printer class' }),
  class_not_set: () => translateNative('pipeline.issue.classNotSet', { defaultValue: 'Printer class not set' }),
};

function issueLabel(kind: string) {
  return ISSUE_CAPTIONS[kind]?.() ?? kind.replace(/_/g, ' ');
}


/** Sticky bottom panel: pipeline choice + "Print" button + live status. */
export function OneTapPrintPanel({ modelId, instance }: { modelId: number; instance: CatalogInstance | null }) {
  const s = useCatalogStrings();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const { hasPermission } = useAuth();
  const { trackJob } = useSliceJobTracker();
  const queryClient = useQueryClient();
  const serverUrl = useServerStore(state => state.serverUrl);
  const busyRef = useRef(false);

  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [pipelineId, setPipelineId] = useState<number | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pendingPrint, setPendingPrint] = useState(false);

  const canUse = hasPermission('makerworld:import') && hasPermission('pipelines:read') && hasPermission('pipelines:run');
  const statusQuery = useQuery({ queryKey: ['makerworldStatus'], queryFn: () => api.getMakerworldStatus() });
  const pipelinesQuery = useQuery({
    queryKey: ['slicer-pipelines'],
    queryFn: slicingApi.pipelines,
    enabled: hasPermission('pipelines:read'),
  });
  const printersQuery = useQuery({ queryKey: ['printers'], queryFn: printersApi.getPrinters });

  const pipelines = useMemo(() => pipelinesQuery.data?.pipelines ?? [], [pipelinesQuery.data]);
  const pipeline = pipelines.find(item => item.id === pipelineId) ?? null;
  const canDownload = pickBoolean(statusQuery.data, ['can_download']);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(oneTapPipelineStorageKey(serverUrl))
      .then(value => { if (active && value && /^\d+$/.test(value)) setPipelineId(Number(value)); })
      .catch(() => {});
    return () => { active = false; };
  }, [serverUrl]);

  // A new profile/model resets the previous result line.
  useEffect(() => {
    if (!busyRef.current) setPhase(current => (current.kind === 'busy' ? current : { kind: 'idle' }));
  }, [modelId, instance?.id]);

  const targetLabel = useCallback((item: SlicerPipeline) => {
    if (!hasTarget(item)) return s.noTarget;
    if (item.target_kind === 'printer_class') return `${s.anyOf} ${item.target_model_class}`;
    return printersQuery.data?.find(printer => printer.id === item.target_printer_id)?.name ?? `#${item.target_printer_id}`;
  }, [printersQuery.data, s.anyOf, s.noTarget]);

  const askOverride = (report: PipelineEligibilityReport) => new Promise<boolean>(resolve => {
    const lines = [
      ...report.issues.map(issue => `• ${issueLabel(issue.kind)}${issue.slot_index != null ? ` (${issue.slot_index})` : ''}${issue.expected || issue.actual ? `: ${issue.expected ?? '—'} → ${issue.actual ?? '—'}` : ''}`),
      ...report.printer_reports.filter(item => !item.ok).flatMap(item =>
        item.issues.map(issue => `• ${item.printer_name}: ${issueLabel(issue.kind)}`)),
    ];
    const blocked = report.issues.some(issue => PIPELINE_BLOCKING_ISSUES.includes(issue.kind));
    Alert.alert(s.issuesTitle, lines.join('\n') || undefined, blocked
      ? [{ text: s.close, style: 'cancel', onPress: () => resolve(false) }]
      : [
        { text: s.cancel, style: 'cancel', onPress: () => resolve(false) },
        { text: s.printAnyway, style: 'destructive', onPress: () => resolve(true) },
      ]);
  });

  const run = async (selected: SlicerPipeline) => {
    if (busyRef.current) return;
    if (!instance) { setPhase({ kind: 'error', message: s.noProfiles }); return; }
    busyRef.current = true;
    try {
      setPhase({ kind: 'busy', label: s.stepImport });
      const imported = await makerworldApi.importInstance({
        model_id: modelId,
        instance_id: Number.isFinite(instance.id) ? instance.id : null,
        profile_id: Number.isFinite(instance.profileId) ? instance.profileId : null,
        folder_id: null,
      });
      void Promise.all(['makerworldRecent', 'libraryFiles', 'libraryFolders', 'libraryStats'].map(key =>
        queryClient.invalidateQueries({ queryKey: [key] })));
      const source = { sourceType: 'file' as const, sourceId: imported.library_file_id, sourceName: imported.filename };

      setPhase({ kind: 'busy', label: s.stepCheck });
      const report = await slicingApi.eligibility(selected.id, source);
      let force = false;
      if (!report.ok) {
        force = await askOverride(report);
        if (!force) { setPhase({ kind: 'idle' }); return; }
      }

      setPhase({ kind: 'busy', label: s.stepStart });
      const started = await slicingApi.run(selected.id, source, 1, force);
      if (started.slice_job_id) trackJob(started.slice_job_id, source);
      void queryClient.invalidateQueries({ queryKey: ['pipeline-runs'] });
      setPhase({ kind: 'tracking', runId: started.id, pipelineId: selected.id, status: started.status, error: started.error_message, tick: 0 });
    } catch (error) {
      setPhase({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      busyRef.current = false;
    }
  };

  // Poll the run until it reaches the printer or ends.
  useEffect(() => {
    if (phase.kind !== 'tracking') return;
    if (phase.status === 'in_progress' || (PIPELINE_TERMINAL_STATUSES as readonly string[]).includes(phase.status)) return;
    const { runId, pipelineId: runPipeline } = phase;
    const timer = setTimeout(async () => {
      let next: PipelineRun | undefined;
      try {
        next = (await slicingApi.runs({ pipeline_id: runPipeline, limit: 10 })).runs.find(item => item.id === runId);
      } catch {
        // Transient error: keep polling.
      }
      setPhase(current => current.kind === 'tracking' && current.runId === runId
        ? { ...current, status: next?.status ?? current.status, error: next?.error_message ?? current.error, tick: current.tick + 1 }
        : current);
    }, 3000);
    return () => clearTimeout(timer);
  }, [phase]);

  const choosePipeline = (item: SlicerPipeline) => {
    setPipelineId(item.id);
    AsyncStorage.setItem(oneTapPipelineStorageKey(serverUrl), String(item.id)).catch(() => {});
    setPickerVisible(false);
    if (pendingPrint) {
      setPendingPrint(false);
      void run(item);
    }
  };

  const onPrint = () => {
    if (!pipeline || !hasTarget(pipeline)) {
      setPendingPrint(true);
      setPickerVisible(true);
      return;
    }
    void run(pipeline);
  };

  let statusText: string | null = null;
  if (phase.kind === 'busy') statusText = phase.label;
  else if (phase.kind === 'error') statusText = `${s.failed}: ${phase.message}`;
  else if (phase.kind === 'tracking') {
    statusText = ({
      queued: s.stepQueued, slicing: s.stepSlicing, dispatching: s.stepDispatching,
      in_progress: s.done, completed: s.done, cancelled: s.cancelled,
      failed: `${s.failed}${phase.error ? `: ${phase.error}` : ''}`,
      partial_failure: `${s.failed}${phase.error ? `: ${phase.error}` : ''}`,
    } as Record<string, string>)[phase.status] ?? s.stepSlicing;
  }
  const failed = phase.kind === 'error' || (phase.kind === 'tracking' && ['failed', 'partial_failure'].includes(phase.status));
  const succeeded = phase.kind === 'tracking' && ['in_progress', 'completed'].includes(phase.status);
  const working = phase.kind === 'busy' || (phase.kind === 'tracking' && ['queued', 'slicing', 'dispatching'].includes(phase.status));
  const statusColor = failed ? colors.error : succeeded ? colors.success : colors.textSecondary;

  return (
    <SafeAreaView edges={['bottom']} style={[styles.bottom, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {!canUse ? (
        <Text style={[styles.note, { color: colors.warning }]}>{s.noPermission}</Text>
      ) : statusQuery.data && !canDownload ? (
        <View style={styles.gap}>
          <Text style={[styles.note, { color: colors.warning }]}>{s.cloudRequired}</Text>
          <PrimaryButton label={s.openProfiles} variant="secondary" onPress={() => navigation.navigate('Profiles')} />
        </View>
      ) : (
        <View style={styles.gap}>
          <Pressable onPress={() => setPickerVisible(true)} style={styles.row} hitSlop={8}>
            <Text style={[styles.note, styles.flex, { color: colors.textSecondary }]} numberOfLines={1}>
              {`${s.pipeline}: `}
              <Text style={{ color: colors.text, fontWeight: fontWeight.semibold }}>
                {pipeline ? `${pipeline.name} · ${targetLabel(pipeline)}` : s.noPipeline}
              </Text>
            </Text>
            <Text style={[styles.note, { color: colors.accent }]}>{pipeline ? s.change : s.choose}</Text>
          </Pressable>
          <PrimaryButton
            label={working ? s.printing : `🖨  ${s.print}`}
            onPress={onPrint}
            loading={working}
            disabled={working || !statusQuery.data || !instance}
          />
          {statusText ? (
            <Pressable onPress={() => (phase.kind === 'tracking' ? navigation.navigate('PipelineRuns') : undefined)} style={styles.row}>
              <Text style={[styles.note, styles.flex, { color: statusColor }]} numberOfLines={3}>{statusText}</Text>
              {phase.kind === 'tracking' ? <Text style={[styles.note, { color: colors.accent }]}>{s.showRuns} ›</Text> : null}
            </Pressable>
          ) : null}
        </View>
      )}

      <Sheet visible={pickerVisible} title={s.choosePipeline} onClose={() => { setPickerVisible(false); setPendingPrint(false); }}>
        <Text style={[styles.note, { color: colors.textSecondary }]}>{s.choosePipelineHint}</Text>
        {pipelinesQuery.isPending ? <ActivityIndicator color={colors.accent} /> : null}
        {pipelinesQuery.isError ? <Text style={[styles.note, { color: colors.error }]}>{pipelinesQuery.error.message}</Text> : null}
        {pipelinesQuery.isSuccess && pipelines.length === 0 ? (
          <View style={styles.gap}>
            <Text style={[styles.note, { color: colors.textSecondary }]}>{s.noPipelines}</Text>
            <PrimaryButton label={s.openPipelines} variant="secondary" onPress={() => { setPickerVisible(false); navigation.navigate('SlicerPipelines'); }} />
          </View>
        ) : null}
        {pipelines.map(item => {
          const ready = hasTarget(item);
          const selected = item.id === pipelineId;
          return (
            <Pressable
              key={item.id}
              disabled={!ready}
              onPress={() => choosePipeline(item)}
              style={[styles.card, { borderColor: selected ? colors.accent : colors.border, backgroundColor: colors.surfaceElevated, opacity: ready ? 1 : 0.5 }]}
            >
              <Text style={[styles.cardTitle, { color: colors.text }]}>{`${selected ? '✓ ' : ''}${item.name}`}</Text>
              <Text style={[styles.note, { color: colors.textSecondary }]}>{targetLabel(item)}</Text>
              {item.description ? <Text style={[styles.note, { color: colors.textTertiary }]}>{item.description}</Text> : null}
            </Pressable>
          );
        })}
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bottom: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  gap: { gap: spacing.sm },
  flex: { flex: 1 },
  note: { fontSize: fontSize.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  card: { borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.xs },
  cardTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
});
