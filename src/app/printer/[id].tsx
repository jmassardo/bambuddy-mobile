import React from 'react';
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import { useTheme } from '../../theme';
import { borderRadius, fontSize, fontWeight, spacing } from '../../theme/tokens';
import { KeyValueRow, PrimaryButton, SectionCard, StatusBadge } from '../../components/common/AppUI';
import { ErrorState, LoadingScreen } from '../../components/common/StateScreens';
import {
  formatDuration,
  formatPercent,
  pickBoolean,
  pickNumber,
  pickRecordArray,
  pickString,
  statusColor,
  type ApiRecord,
} from '../../utils/data';

const SPEED_MODES = [
  { label: 'Silent', value: 1 },
  { label: 'Standard', value: 2 },
  { label: 'Sport', value: 3 },
  { label: 'Ludicrous', value: 4 },
] as const;

export default function PrinterDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const printerId = Number(id);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { showToast } = useToast();

  const printerQuery = useQuery({
    queryKey: ['printer', printerId],
    queryFn: () => api.getPrinter(printerId),
    enabled: Number.isFinite(printerId),
  });

  const statusQuery = useQuery({
    queryKey: ['printerStatus', printerId],
    queryFn: () => api.getPrinterStatus(printerId),
    enabled: Number.isFinite(printerId),
    refetchInterval: 10_000,
  });

  const refreshAll = async () => {
    await Promise.all([printerQuery.refetch(), statusQuery.refetch()]);
  };

  const actionMutation = useMutation({
    mutationFn: async (action: 'pause' | 'resume' | 'stop' | 'light') => {
      if (action === 'pause') return api.pausePrint(printerId);
      if (action === 'resume') return api.resumePrint(printerId);
      if (action === 'stop') return api.stopPrint(printerId);
      const lightOn = pickBoolean(statusQuery.data, ['chamber_light_on', 'light_on'], false);
      return api.setChamberLight(printerId, !lightOn);
    },
    onSuccess: async (_, action) => {
      await queryClient.invalidateQueries({ queryKey: ['printerStatus', printerId] });
      showToast(`Printer ${action} command sent.`, 'success');
    },
    onError: () => showToast('Printer command failed.', 'error'),
  });

  const speedMutation = useMutation({
    mutationFn: (mode: number) => api.setPrintSpeed(printerId, mode),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['printerStatus', printerId] });
      showToast('Print speed updated.', 'success');
    },
    onError: () => showToast('Failed to update print speed.', 'error'),
  });

  if (printerQuery.isLoading || statusQuery.isLoading) {
    return <LoadingScreen message="Loading printer details…" />;
  }

  if (printerQuery.isError || statusQuery.isError || !printerQuery.data) {
    return <ErrorState message="Unable to load printer details." onRetry={() => void refreshAll()} />;
  }

  const printer = printerQuery.data as ApiRecord;
  const status = (statusQuery.data ?? {}) as ApiRecord;
  const state = pickString(status, ['state', 'status', 'print_status'], 'Unknown');
  const badgeColor = statusColor(state, colors);
  const progressRaw = pickNumber(status, ['progress', 'job.progress', 'percent_complete'], 0);
  const progress = progressRaw <= 1 ? progressRaw * 100 : progressRaw;
  const currentSpeed = pickNumber(status, ['speed_mode', 'print_speed_mode'], 2);
  const currentFile = pickString(status, ['current_file', 'job.name', 'file_name'], 'No file selected');
  const amsSlots = pickRecordArray(status, ['ams_slots', 'ams.slots', 'filament_slots']);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={printerQuery.isRefetching || statusQuery.isRefetching} onRefresh={() => void refreshAll()} tintColor={colors.accent} />}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.text }]}>{pickString(printer, ['name'], 'Unnamed printer')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{pickString(printer, ['model', 'printer_model'], 'Unknown model')}</Text>
        </View>
        <StatusBadge label={state} color={badgeColor} />
      </View>

      <Pressable onPress={() => router.push(`/camera/${printerId}`)}>
        <Image source={{ uri: api.getCameraSnapshotUrl(printerId) }} style={styles.snapshot} />
      </Pressable>

      <SectionCard title="Status" subtitle="Live print progress and job details.">
        <View style={[styles.progressTrack, { backgroundColor: colors.surfaceElevated }]}>
          <View style={[styles.progressFill, { backgroundColor: badgeColor, width: `${Math.max(0, Math.min(progress, 100))}%` }]} />
        </View>
        <KeyValueRow label="Progress" value={formatPercent(progress)} />
        <KeyValueRow label="ETA" value={formatDuration(pickNumber(status, ['eta_seconds', 'remaining_time', 'job.remaining_seconds'], 0))} />
        <KeyValueRow
          label="Layer"
          value={`${pickNumber(status, ['layer_current', 'current_layer'], 0)} / ${pickNumber(status, ['layer_total', 'total_layers'], 0)}`}
        />
        <KeyValueRow label="Current file" value={currentFile} />
      </SectionCard>

      <SectionCard title="Controls" subtitle="Quick printer commands.">
        <View style={styles.buttonRow}>
          <View style={styles.buttonCell}>
            <PrimaryButton
              label={state.toLowerCase().includes('pause') ? 'Resume' : 'Pause'}
              onPress={() => void actionMutation.mutateAsync(state.toLowerCase().includes('pause') ? 'resume' : 'pause')}
              variant="secondary"
              loading={actionMutation.isPending}
            />
          </View>
          <View style={styles.buttonCell}>
            <PrimaryButton label="Stop" onPress={() => void actionMutation.mutateAsync('stop')} variant="danger" loading={actionMutation.isPending} />
          </View>
          <View style={styles.buttonCell}>
            <PrimaryButton
              label={pickBoolean(status, ['chamber_light_on', 'light_on'], false) ? 'Light Off' : 'Light On'}
              onPress={() => void actionMutation.mutateAsync('light')}
              variant="secondary"
              loading={actionMutation.isPending}
            />
          </View>
        </View>
      </SectionCard>

      <SectionCard title="Temperatures">
        <KeyValueRow label="Nozzle" value={`${pickNumber(status, ['temperatures.nozzle.current', 'nozzle_temp'], 0).toFixed(0)}° / ${pickNumber(status, ['temperatures.nozzle.target', 'target_nozzle_temp'], 0).toFixed(0)}°`} />
        <KeyValueRow label="Bed" value={`${pickNumber(status, ['temperatures.bed.current', 'bed_temp'], 0).toFixed(0)}° / ${pickNumber(status, ['temperatures.bed.target', 'target_bed_temp'], 0).toFixed(0)}°`} />
        <KeyValueRow label="Chamber" value={`${pickNumber(status, ['temperatures.chamber.current', 'chamber_temp'], 0).toFixed(0)}° / ${pickNumber(status, ['temperatures.chamber.target', 'target_chamber_temp'], 0).toFixed(0)}°`} />
      </SectionCard>

      <SectionCard title="Fan Speeds">
        <KeyValueRow label="Part cooling" value={`${pickNumber(status, ['fans.part', 'part_fan_speed'], 0).toFixed(0)}%`} />
        <KeyValueRow label="Aux fan" value={`${pickNumber(status, ['fans.aux', 'aux_fan_speed'], 0).toFixed(0)}%`} />
        <KeyValueRow label="Chamber fan" value={`${pickNumber(status, ['fans.chamber', 'chamber_fan_speed'], 0).toFixed(0)}%`} />
      </SectionCard>

      <SectionCard title="AMS" subtitle="Loaded filament slots.">
        {amsSlots.length > 0 ? (
          <View style={styles.amsGrid}>
            {amsSlots.map((slot, index) => {
              const color = pickString(slot, ['color_hex', 'color'], colors.surfaceHover);
              return (
                <View key={`${index}-${pickString(slot, ['tray_id', 'slot_id'], String(index))}`} style={[styles.slotCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                  <View style={[styles.colorSwatch, { backgroundColor: color || colors.surfaceHover }]} />
                  <Text style={[styles.slotTitle, { color: colors.text }]}>Slot {index + 1}</Text>
                  <Text style={[styles.slotMeta, { color: colors.textSecondary }]} numberOfLines={2}>
                    {pickString(slot, ['filament_name', 'material', 'brand'], 'Unknown filament')}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No AMS data available for this printer.</Text>
        )}
      </SectionCard>

      <SectionCard title="Speed Control">
        <View style={styles.speedRow}>
          {SPEED_MODES.map((mode) => {
            const active = currentSpeed === mode.value;
            return (
              <Pressable
                key={mode.value}
                onPress={() => void speedMutation.mutateAsync(mode.value)}
                style={[
                  styles.speedButton,
                  {
                    backgroundColor: active ? colors.accentBg : colors.surfaceElevated,
                    borderColor: active ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text style={[styles.speedText, { color: active ? colors.accentLight : colors.textSecondary }]}>{mode.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </SectionCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerText: { flex: 1, gap: spacing.xs },
  title: { fontSize: fontSize['2xl'], fontWeight: fontWeight.bold },
  subtitle: { fontSize: fontSize.base },
  snapshot: {
    width: '100%',
    height: 220,
    borderRadius: borderRadius.xl,
    backgroundColor: '#111827',
  },
  progressTrack: {
    height: 10,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  buttonCell: {
    flex: 1,
    minWidth: 92,
  },
  amsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  slotCard: {
    width: '47%',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  colorSwatch: {
    width: 26,
    height: 26,
    borderRadius: borderRadius.full,
  },
  slotTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  slotMeta: {
    fontSize: fontSize.sm,
  },
  emptyText: {
    fontSize: fontSize.sm,
  },
  speedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  speedButton: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  speedText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
});
