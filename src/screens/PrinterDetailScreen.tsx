import React from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import {
  KeyValueRow,
  PrimaryButton,
  SectionCard,
  StatusBadge,
} from '@/components/common/AppUI';
import { ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import {
  formatDuration,
  formatDateTime,
  formatPercent,
  pickBoolean,
  pickNumber,
  pickRecordArray,
  pickString,
  statusColor,
  type ApiRecord,
} from '@/utils/data';

const SPEED_MODES = [
  { label: 'Silent', value: 1 },
  { label: 'Standard', value: 2 },
  { label: 'Sport', value: 3 },
  { label: 'Ludicrous', value: 4 },
] as const;

function stringifyDebugValue(value: unknown) {
  if (value == null) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '—';
  }
}

export default function PrinterDetailScreen() {
  const navigation = useNavigation<any>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Printer' });
  }, [navigation]);
  const route = useRoute<any>();
  const { id } = (route.params ?? {}) as { id: string };
  const printerId = Number(id);
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const [showDebugModal, setShowDebugModal] = React.useState(false);

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

  const mqttLogsQuery = useQuery({
    queryKey: ['mqttLogs', printerId],
    queryFn: () => api.getMQTTLogs(printerId),
    enabled: Number.isFinite(printerId) && showDebugModal,
    retry: false,
  });

  const printHistoryQuery = useQuery({
    queryKey: ['printerArchives', printerId],
    queryFn: () => api.getArchives({ printerId, limit: 10 }),
    enabled: Number.isFinite(printerId) && showDebugModal,
  });

  const amsHistoryQuery = useQuery({
    queryKey: ['amsHistory', printerId],
    queryFn: () => api.getAmsHistory(printerId),
    enabled: Number.isFinite(printerId) && showDebugModal,
    retry: false,
  });

  const refreshAll = async () => {
    await Promise.all([printerQuery.refetch(), statusQuery.refetch()]);
  };

  const actionMutation = useMutation({
    mutationFn: async (action: 'pause' | 'resume' | 'stop' | 'light') => {
      if (action === 'pause') return api.pausePrint(printerId);
      if (action === 'resume') return api.resumePrint(printerId);
      if (action === 'stop') return api.stopPrint(printerId);
      const lightOn = pickBoolean(
        statusQuery.data,
        ['chamber_light_on', 'light_on'],
        false,
      );
      return api.setChamberLight(printerId, !lightOn);
    },
    onSuccess: async (_, action) => {
      await queryClient.invalidateQueries({
        queryKey: ['printerStatus', printerId],
      });
      showToast(`Printer ${action} command sent.`, 'success');
    },
    onError: () => showToast('Printer command failed.', 'error'),
  });

  const speedMutation = useMutation({
    mutationFn: (mode: number) => api.setPrintSpeed(printerId, mode),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['printerStatus', printerId],
      });
      showToast('Print speed updated.', 'success');
    },
    onError: () => showToast('Failed to update print speed.', 'error'),
  });

  if (printerQuery.isLoading || statusQuery.isLoading) {
    return <LoadingScreen message="Loading printer details…" />;
  }

  if (printerQuery.isError || statusQuery.isError || !printerQuery.data) {
    return (
      <ErrorState
        message="Unable to load printer details."
        onRetry={() => void refreshAll()}
      />
    );
  }

  const printer = (printerQuery.data ?? {}) as unknown as ApiRecord;
  const status = (statusQuery.data ?? {}) as ApiRecord;
  const state = pickString(
    status,
    ['state', 'status', 'print_status'],
    'Unknown',
  );
  const badgeColor = statusColor(state, colors);
  const progressRaw = pickNumber(
    status,
    ['progress', 'job.progress', 'percent_complete'],
    0,
  );
  const progress = progressRaw <= 1 ? progressRaw * 100 : progressRaw;
  const currentSpeed = pickNumber(
    status,
    ['speed_mode', 'print_speed_mode'],
    2,
  );
  const currentFile = pickString(
    status,
    ['current_file', 'job.name', 'file_name'],
    'No file selected',
  );
  const amsSlots = pickRecordArray(status, [
    'ams_slots',
    'ams.slots',
    'filament_slots',
  ]);
  const activeHmsErrors = pickRecordArray(status, ['hms_errors']);
  const mqttLogRecord = (mqttLogsQuery.data ?? {}) as ApiRecord;
  const mqttEntries = pickRecordArray(mqttLogRecord, ['entries', 'messages', 'logs']);
  const lastMqttEntry = mqttEntries[0] ?? mqttEntries[mqttEntries.length - 1] ?? null;
  const archives = ((printHistoryQuery.data ?? []) as ApiRecord[])
    .slice()
    .sort(
      (a, b) =>
        new Date(pickString(b, ['created_at', 'archived_at', 'started_at'])).getTime() -
        new Date(pickString(a, ['created_at', 'archived_at', 'started_at'])).getTime(),
    )
    .slice(0, 10);
  const amsHistory = ((amsHistoryQuery.data ?? []) as ApiRecord[]).slice(0, 10);
  const hmsHistoryEntries = mqttEntries
    .filter(entry =>
      stringifyDebugValue(entry).toLowerCase().includes('hms') ||
      stringifyDebugValue(entry).toLowerCase().includes('error'),
    )
    .slice(0, 10);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={printerQuery.isRefetching || statusQuery.isRefetching}
          onRefresh={() => void refreshAll()}
          tintColor={colors.accent}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.text }]}>
            {pickString(printer, ['name'], 'Unnamed printer')}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {pickString(printer, ['model', 'printer_model'], 'Unknown model')}
          </Text>
        </View>
        <StatusBadge label={state} color={badgeColor} />
      </View>

      <Pressable
        onPress={() => navigation.navigate('Camera', { id: String(printerId) })}
      >
        <Image
          source={{ uri: api.getCameraSnapshotUrl(printerId) }}
          style={styles.snapshot}
        />
      </Pressable>

      <SectionCard
        title="Status"
        subtitle="Live print progress and job details."
      >
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
                backgroundColor: badgeColor,
                width: `${Math.max(0, Math.min(progress, 100))}%`,
              },
            ]}
          />
        </View>
        <KeyValueRow label="Progress" value={formatPercent(progress)} />
        <KeyValueRow
          label="ETA"
          value={formatDuration(
            pickNumber(
              status,
              ['eta_seconds', 'remaining_time', 'job.remaining_seconds'],
              0,
            ),
          )}
        />
        <KeyValueRow
          label="Layer"
          value={`${pickNumber(
            status,
            ['layer_current', 'current_layer'],
            0,
          )} / ${pickNumber(status, ['layer_total', 'total_layers'], 0)}`}
        />
        <KeyValueRow label="Current file" value={currentFile} />
      </SectionCard>

      <SectionCard title="Controls" subtitle="Quick printer commands.">
        <View style={styles.buttonRow}>
          <View style={styles.buttonCell}>
            <PrimaryButton
              label={state.toLowerCase().includes('pause') ? 'Resume' : 'Pause'}
              onPress={() =>
                void actionMutation.mutateAsync(
                  state.toLowerCase().includes('pause') ? 'resume' : 'pause',
                )
              }
              variant="secondary"
              loading={actionMutation.isPending}
            />
          </View>
          <View style={styles.buttonCell}>
            <PrimaryButton
              label="Stop"
              onPress={() => void actionMutation.mutateAsync('stop')}
              variant="danger"
              loading={actionMutation.isPending}
            />
          </View>
          <View style={styles.buttonCell}>
            <PrimaryButton
              label={
                pickBoolean(status, ['chamber_light_on', 'light_on'], false)
                  ? 'Light Off'
                  : 'Light On'
              }
              onPress={() => void actionMutation.mutateAsync('light')}
              variant="secondary"
              loading={actionMutation.isPending}
            />
          </View>
        </View>
      </SectionCard>

      <SectionCard title="Temperatures">
        <KeyValueRow
          label="Nozzle"
          value={`${pickNumber(
            status,
            ['temperatures.nozzle.current', 'nozzle_temp'],
            0,
          ).toFixed(0)}° / ${pickNumber(
            status,
            ['temperatures.nozzle.target', 'target_nozzle_temp'],
            0,
          ).toFixed(0)}°`}
        />
        <KeyValueRow
          label="Bed"
          value={`${pickNumber(
            status,
            ['temperatures.bed.current', 'bed_temp'],
            0,
          ).toFixed(0)}° / ${pickNumber(
            status,
            ['temperatures.bed.target', 'target_bed_temp'],
            0,
          ).toFixed(0)}°`}
        />
        <KeyValueRow
          label="Chamber"
          value={`${pickNumber(
            status,
            ['temperatures.chamber.current', 'chamber_temp'],
            0,
          ).toFixed(0)}° / ${pickNumber(
            status,
            ['temperatures.chamber.target', 'target_chamber_temp'],
            0,
          ).toFixed(0)}°`}
        />
      </SectionCard>

      <SectionCard title="Fan Speeds">
        <KeyValueRow
          label="Part cooling"
          value={`${pickNumber(
            status,
            ['fans.part', 'part_fan_speed'],
            0,
          ).toFixed(0)}%`}
        />
        <KeyValueRow
          label="Aux fan"
          value={`${pickNumber(
            status,
            ['fans.aux', 'aux_fan_speed'],
            0,
          ).toFixed(0)}%`}
        />
        <KeyValueRow
          label="Chamber fan"
          value={`${pickNumber(
            status,
            ['fans.chamber', 'chamber_fan_speed'],
            0,
          ).toFixed(0)}%`}
        />
      </SectionCard>

      <SectionCard title="AMS" subtitle="Loaded filament slots.">
        {amsSlots.length > 0 ? (
          <View style={styles.amsGrid}>
            {amsSlots.map((slot, index) => {
              const color = pickString(
                slot,
                ['color_hex', 'color'],
                colors.surfaceHover,
              );
              return (
                <View
                  key={`${index}-${pickString(
                    slot,
                    ['tray_id', 'slot_id'],
                    String(index),
                  )}`}
                  style={[
                    styles.slotCard,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: color || colors.surfaceHover },
                    ]}
                  />
                  <Text style={[styles.slotTitle, { color: colors.text }]}>
                    Slot {index + 1}
                  </Text>
                  <Text
                    style={[styles.slotMeta, { color: colors.textSecondary }]}
                    numberOfLines={2}
                  >
                    {pickString(
                      slot,
                      ['filament_name', 'material', 'brand'],
                      'Unknown filament',
                    )}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No AMS data available for this printer.
          </Text>
        )}
      </SectionCard>

      <SectionCard title="Speed Control">
        <View style={styles.speedRow}>
          {SPEED_MODES.map(mode => {
            const active = currentSpeed === mode.value;
            return (
              <Pressable
                key={mode.value}
                onPress={() => void speedMutation.mutateAsync(mode.value)}
                style={[
                  styles.speedButton,
                  {
                    backgroundColor: active
                      ? colors.accentBg
                      : colors.surfaceElevated,
                    borderColor: active ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.speedText,
                    {
                      color: active ? colors.accentLight : colors.textSecondary,
                    },
                  ]}
                >
                  {mode.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SectionCard>

      <SectionCard title="Debug" subtitle="Connection traces, print history, and recent HMS events.">
        <View style={styles.buttonRow}>
          <View style={styles.buttonCell}>
            <PrimaryButton
              label="Open debug history"
              variant="secondary"
              onPress={() => setShowDebugModal(true)}
            />
          </View>
        </View>
      </SectionCard>

      <Modal visible={showDebugModal} transparent animationType="slide" onRequestClose={() => setShowDebugModal(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}> 
          <View style={[styles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
            <View style={styles.modalHeader}>
              <View style={styles.headerText}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Printer debug</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  {pickString(printer, ['name'], 'Printer history')}
                </Text>
              </View>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody}>
              <SectionCard title="Connection debug info" subtitle="Live MQTT and connection metadata.">
                {mqttLogsQuery.isLoading ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <>
                    <KeyValueRow
                      label="Last MQTT message"
                      value={pickString(
                        mqttLogRecord,
                        ['last_message', 'message'],
                        lastMqttEntry ? stringifyDebugValue(lastMqttEntry) : 'No MQTT messages recorded.',
                      )}
                    />
                    <KeyValueRow
                      label="Connected"
                      value={formatDateTime(
                        pickString(mqttLogRecord, ['connected_at', 'last_connected_at', 'session_started_at']),
                      )}
                    />
                    <KeyValueRow
                      label="Disconnected"
                      value={formatDateTime(
                        pickString(mqttLogRecord, ['disconnected_at', 'last_disconnected_at', 'session_ended_at']),
                      )}
                    />
                    <KeyValueRow
                      label="Debug entries"
                      value={String(mqttEntries.length)}
                    />
                  </>
                )}
              </SectionCard>

              <SectionCard title="Print history" subtitle="Most recent archives for this printer.">
                {printHistoryQuery.isLoading ? (
                  <ActivityIndicator color={colors.accent} />
                ) : archives.length > 0 ? (
                  archives.map(archive => (
                    <View
                      key={pickString(archive, ['id'])}
                      style={[styles.historyRow, { borderColor: colors.borderSubtle }]}
                    >
                      <View style={styles.historyText}>
                        <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
                          {pickString(archive, ['print_name', 'filename', 'name'], 'Archived print')}
                        </Text>
                        <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                          {formatDateTime(
                            pickString(archive, ['created_at', 'started_at', 'archived_at']),
                          )}
                        </Text>
                      </View>
                      <View style={styles.historyMeta}>
                        <StatusBadge
                          label={pickString(archive, ['status'], 'unknown')}
                          color={statusColor(pickString(archive, ['status'], 'unknown'), colors)}
                        />
                        <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                          {formatDuration(pickNumber(archive, ['duration_seconds', 'print_time_seconds'], 0))}
                        </Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    No archive history is available for this printer yet.
                  </Text>
                )}
              </SectionCard>

              <SectionCard title="HMS error history" subtitle="Current printer HMS faults plus matching debug log entries.">
                {activeHmsErrors.length > 0 ? (
                  activeHmsErrors.map((error, index) => (
                    <View
                      key={`${pickString(error, ['code'])}-${index}`}
                      style={[styles.historyRow, { borderColor: colors.borderSubtle }]}
                    >
                      <View style={styles.historyText}>
                        <Text style={[styles.rowTitle, { color: colors.text }]}>
                          {pickString(error, ['code'], 'HMS error')}
                        </Text>
                        <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                          Severity {pickString(error, ['severity'], '—')} · Attr {pickString(error, ['attr'], '—')}
                        </Text>
                      </View>
                      <StatusBadge label="active" color={colors.warning} />
                    </View>
                  ))
                ) : hmsHistoryEntries.length > 0 ? (
                  hmsHistoryEntries.map((entry, index) => (
                    <View
                      key={`hms-log-${index}`}
                      style={[styles.historyRow, { borderColor: colors.borderSubtle }]}
                    >
                      <View style={styles.historyText}>
                        <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={2}>
                          {pickString(entry, ['message', 'payload', 'topic'], 'MQTT log entry')}
                        </Text>
                        <Text style={[styles.rowMeta, { color: colors.textSecondary }]} numberOfLines={2}>
                          {formatDateTime(pickString(entry, ['timestamp', 'created_at']))}
                        </Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    No recent HMS history is available from the current status or debug logs.
                  </Text>
                )}
              </SectionCard>

              <SectionCard title="AMS telemetry" subtitle="Recent AMS history samples for troubleshooting.">
                {amsHistoryQuery.isLoading ? (
                  <ActivityIndicator color={colors.accent} />
                ) : amsHistory.length > 0 ? (
                  amsHistory.map((point, index) => (
                    <View
                      key={`${pickString(point, ['recorded_at'])}-${index}`}
                      style={[styles.historyRow, { borderColor: colors.borderSubtle }]}
                    >
                      <View style={styles.historyText}>
                        <Text style={[styles.rowTitle, { color: colors.text }]}>
                          {formatDateTime(pickString(point, ['recorded_at']))}
                        </Text>
                        <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                          Temp {pickString(point, ['temperature'], '—')}° · Humidity {pickString(point, ['humidity'], '—')}
                        </Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    No AMS history samples are available for this printer.
                  </Text>
                )}
              </SectionCard>
            </ScrollView>
            <View style={styles.modalActions}>
              <PrimaryButton label="Close" onPress={() => setShowDebugModal(false)} />
            </View>
          </View>
        </View>
      </Modal>
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
  rowTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  rowMeta: {
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: borderRadius['2xl'],
    maxHeight: '90%',
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  modalBody: {
    gap: spacing.md,
  },
  historyRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  historyText: {
    flex: 1,
    gap: spacing.xs,
  },
  historyMeta: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});
