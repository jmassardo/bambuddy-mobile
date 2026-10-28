import { NativeTranslation, translateNative, useLocalizedMemo, useNativeLocale, useTranslation } from '@/i18n';
import { localizedStatus } from '@/utils/statusLabel';

import React from 'react';
import { PrinterDeviceControls } from '@/components/printers/PrinterDeviceControls';
import { PrinterSourceActions } from '@/components/printers/PrinterSourceActions';
import { PrinterPowerIntegration } from '@/components/settings/SmartPlugPowerControls';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RootNavigationProp, RootRouteProp } from '@/navigation/types';
import {
  ActivityIndicator,
  Alert,
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
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Edit2,
  Home,
  MoveVertical,
} from 'lucide-react-native';
import { api, ApiError } from '@/api/client';
import { EditPrinterModal } from '@/components/printers/EditPrinterModal';
import { MQTTConsole } from '@/components/printers/MQTTConsole';

import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import {
  borderRadius,
  fontSize,
  fontWeight,
  spacing,
  type ThemeColors,
} from '@/theme/tokens';
import {
  InlineTabBar,
  KeyValueRow,
  PrimaryButton,
  SectionCard,
  StatusBadge,
} from '@/components/common/AppUI';
import { MultiSeriesLineChart } from '@/components/common/Charts';
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
  { get label() { return translateNative('native.0814d36734bfb834'); }, value: 1 },
  { get label() { return translateNative('native.7239d2283cbaffae'); }, value: 2 },
  { get label() { return translateNative('native.5167a009d34d3ac8'); }, value: 3 },
  { get label() { return translateNative('native.666a52cda10a4d17'); }, value: 4 },
] as const;

const JOG_STEP_SIZES = [0.1, 1, 10, 100] as const;

const JOG_SPEED_OPTIONS = [
  { get label() { return translateNative('native.2e1411b2438a0dd8'); }, value: 'slow' },
  { get label() { return translateNative('native.729aa07c7938c10d'); }, value: 'normal' },
  { get label() { return translateNative('native.7a424fba39712956'); }, value: 'fast' },
] as const;

type JogSpeed = (typeof JOG_SPEED_OPTIONS)[number]['value'];
type HeaterRangeKey = '1h' | '6h' | '24h' | '7d';
type SupportedHeaterKind = 'nozzle' | 'bed' | 'chamber';

const HEATER_RANGE_OPTIONS: Array<{ key: HeaterRangeKey; label: string; hours: number }> = [
  { key: '1h', label: '1h', hours: 1 },
  { key: '6h', label: '6h', hours: 6 },
  { key: '24h', label: '24h', hours: 24 },
  { key: '7d', label: '7d', hours: 168 },
];

const HEATER_KINDS: SupportedHeaterKind[] = ['nozzle', 'bed', 'chamber'];

function isSupportedHeaterKind(kind: string): kind is SupportedHeaterKind {
  return HEATER_KINDS.includes(kind as SupportedHeaterKind);
}

function formatHeaterPointLabel(recordedAt: string, range: HeaterRangeKey) {
  const date = new Date(recordedAt);
  if (Number.isNaN(date.getTime())) return '—';
  if (range === '7d') {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

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

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function JogButton({
  icon,
  label,
  onPress,
  disabled,
  highlighted,
  colors,
}: {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  highlighted?: boolean;
  colors: ThemeColors;
}) {
  useNativeLocale();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={[
        styles.jogButton,
        {
          backgroundColor: highlighted ? colors.accentBg : colors.surfaceElevated,
          borderColor: highlighted ? colors.accent : colors.border,
        },
        (disabled || !onPress) && styles.disabledButton,
      ]}
    >
      {icon}
      <Text
        style={[
          styles.jogButtonLabel,
          { color: highlighted ? colors.accentLight : colors.textSecondary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function PrinterDetailScreen() {
  useNativeLocale();
  const navigation = useNavigation<RootNavigationProp<'PrinterDetail'>>();
  const route = useRoute<RootRouteProp<'PrinterDetail'>>();
  const { id } = (route.params ?? {}) as { id: string };
  const printerId = Number(id);
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const hasEditPermission = hasPermission('printers:update');
  const [showDebugModal, setShowDebugModal] = React.useState(false);
  const [showEditModal, setShowEditModal] = React.useState(false);
  const [jogStepSize, setJogStepSize] = React.useState<(typeof JOG_STEP_SIZES)[number]>(
    1,
  );
  const [jogSpeed, setJogSpeed] = React.useState<JogSpeed>('normal');
  const [heaterRange, setHeaterRange] = React.useState<HeaterRangeKey>('24h');

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

  const selectedHeaterRange =
    HEATER_RANGE_OPTIONS.find(option => option.key === heaterRange) ?? HEATER_RANGE_OPTIONS[2];

  const heaterHistoryQuery = useQuery({
    queryKey: ['heaterHistory', printerId, selectedHeaterRange.hours],
    queryFn: () =>
      api.getPrinterSensorHistory(printerId, selectedHeaterRange.hours, HEATER_KINDS),
    enabled: Number.isFinite(printerId),
    refetchInterval: 60_000,
  });

  const printerName = pickString(
    (printerQuery.data ?? {}) as ApiRecord,
    ['name'],
    'Printer',
  );

  React.useEffect(() => {
    navigation.setOptions({ title: printerName });
  }, [navigation, printerName]);

  const refreshAll = async () => {
    await Promise.all([
      printerQuery.refetch(),
      statusQuery.refetch(),
      heaterHistoryQuery.refetch(),
    ]);
  };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _profileData = useLocalizedMemo(
    () => printerQuery.data ?? {},
    [printerQuery.data],
  );

  const showEdit = () => {
    setShowEditModal(true);
  };

  const invalidatePrinterStatus = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['printerStatus', printerId] });
  }, [printerId, queryClient]);

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
      showToast(translateNative('native.bf4d8ef589e7fea8', { value0: String(action) }), 'success');
    },
    onError: () => showToast(translateNative('native.057caadfef404064'), 'error'),
  });

  const confirmPrintAction = (action: 'pause' | 'resume' | 'stop') => Alert.alert(
    t('fleet.confirmAction', { defaultValue: '{{action}} print?', action }),
    t('fleet.confirmDetailAction', { defaultValue: '{{printer}} — {{job}}. Stopping cannot be resumed.', printer: printerQuery.data?.name ?? String(printerId), job: statusQuery.data?.subtask_name ?? statusQuery.data?.current_print ?? t('fleet.activeJob', { defaultValue: 'Active print' }) }),
    [
      { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
      { text: t('common.confirm', { defaultValue: 'Confirm' }), style: action === 'stop' ? 'destructive' : 'default', onPress: () => actionMutation.mutate(action) },
    ],
  );

  const speedMutation = useMutation({
    mutationFn: (mode: number) => api.setPrintSpeed(printerId, mode),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['printerStatus', printerId],
      });
      showToast(translateNative('native.d6bfbabf9cc21bd9'), 'success');
    },
    onError: () => showToast(translateNative('native.314b832477b6a5e3'), 'error'),
  });

  const xyJogMutation = useMutation({
    mutationFn: ({ x, y }: { x: number; y: number }) => api.xyJog(printerId, x, y),
    onSuccess: () => {
      void invalidatePrinterStatus();
    },
    onError: error =>
      showToast(getErrorMessage(error, translateNative('native.9c4bffb9f78a482f')), 'error'),
  });

  const zJogMutation = useMutation({
    mutationFn: (distance: number) => api.bedJog(printerId, distance),
    onSuccess: () => {
      void invalidatePrinterStatus();
    },
    onError: error =>
      showToast(getErrorMessage(error, translateNative('native.50e4c820a549ac54')), 'error'),
  });

  const homeMutation = useMutation({
    mutationFn: ({ axes }: { axes: 'all' | 'xy' | 'z'; label: string }) =>
      api.homeAxes(printerId, axes),
    onSuccess: async (_, { label }) => {
      await invalidatePrinterStatus();
      showToast(translateNative('native.1abaf60be83f775b', { value0: String(label) }), 'success');
    },
    onError: error =>
      showToast(getErrorMessage(error, translateNative('native.9bd8aedeaed7801b')), 'error'),
  });

  const heaterHistory = useLocalizedMemo(() => {
    const heaterHistorySeries = heaterHistoryQuery.data?.series ?? [];
    const pointsByKind: Record<
      SupportedHeaterKind,
      Map<string, { value: number | null; target: number | null }>
    > = {
      nozzle: new Map(),
      bed: new Map(),
      chamber: new Map(),
    };
    const timestampSet = new Set<string>();

    heaterHistorySeries.forEach(seriesItem => {
      if (!isSupportedHeaterKind(seriesItem.sensor_kind)) return;
      const byTimestamp = pointsByKind[seriesItem.sensor_kind];
      seriesItem.data.forEach(point => {
        timestampSet.add(point.recorded_at);
        byTimestamp.set(point.recorded_at, {
          value: point.value,
          target: point.target,
        });
      });
    });

    const timestamps = Array.from(timestampSet).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime(),
    );

    const points = timestamps.map(timestamp => {
      const nozzlePoint = pointsByKind.nozzle.get(timestamp);
      const bedPoint = pointsByKind.bed.get(timestamp);
      const chamberPoint = pointsByKind.chamber.get(timestamp);
      return {
        label: formatHeaterPointLabel(timestamp, heaterRange),
        values: {
          nozzle_actual: nozzlePoint?.value,
          nozzle_target: nozzlePoint?.target,
          bed_actual: bedPoint?.value,
          bed_target: bedPoint?.target,
          chamber_actual: chamberPoint?.value,
          chamber_target: chamberPoint?.target,
        },
      };
    });

    const chamberHasData = points.some(
      point =>
        typeof point.values.chamber_actual === 'number' ||
        typeof point.values.chamber_target === 'number',
    );

    return {
      points,
      chamberHasData,
    };
  }, [heaterHistoryQuery.data?.series, heaterRange]);

  const heaterChartSeries = useLocalizedMemo(
    () => [
      { key: 'nozzle_actual', get label() { return translateNative('native.6fef32ba2d7cf96c'); }, color: colors.warning },
      {
        key: 'nozzle_target',
        get label() { return translateNative('native.f5f626d3bf1bc91d'); },
        color: `${colors.warning}99`,
        dashed: true,
      },
      { key: 'bed_actual', get label() { return translateNative('native.6cf82f9734bcc885'); }, color: colors.accent },
      {
        key: 'bed_target',
        get label() { return translateNative('native.0423aca09d7736d4'); },
        color: `${colors.accent}99`,
        dashed: true,
      },
      { key: 'chamber_actual', get label() { return translateNative('native.68497d1fd2700c95'); }, color: colors.info },
      {
        key: 'chamber_target',
        get label() { return translateNative('native.ac25854ef06470bf'); },
        color: `${colors.info}99`,
        dashed: true,
      },
    ],
    [colors],
  );

  if (printerQuery.isLoading || statusQuery.isLoading) {
    return <LoadingScreen message={translateNative('native.f496663c29951557')} />;
  }

  if (printerQuery.isError || statusQuery.isError || !printerQuery.data) {
    return (
      <ErrorState
        message={translateNative('native.156d048b8d6fa775')}
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
  const isPrinting = ['RUNNING', 'PAUSE'].includes(state.toUpperCase());
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
    translateNative('native.77be770140cae260'),
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
  const movementDelta = jogStepSize;

  const movementDisabled =
    isPrinting ||
    xyJogMutation.isPending ||
    zJogMutation.isPending ||
    homeMutation.isPending;

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
        <Text style={[styles.subtitle, styles.headerSubtitle, { color: colors.textSecondary }]}>
          {pickString(printer, ['model', 'printer_model'], translateNative('native.e292a54ac2d93315'))}
        </Text>
        <StatusBadge label={localizedStatus(state)} color={badgeColor} />
      </View>

      <SectionCard
        title={translateNative('native.4a362111d2e1aa94')}
        subtitle={translateNative('native.0b43ec35c75693eb')}
        right={
          <Pressable
            onPress={showEdit}
            disabled={!hasEditPermission}
            style={[
              styles.editButton,
              {
                backgroundColor: colors.accentBg,
                borderColor: colors.accent,
                opacity: !hasEditPermission ? 0.5 : 1,
              },
            ]}
          >
            <Edit2 size={16} color={colors.accent} strokeWidth={2} />
          </Pressable>
        }
      >
        <KeyValueRow
          label={translateNative('common.name')}
          value={pickString(printer, ['name'], '—')}
        />
        <KeyValueRow
          label={translateNative('native.4fa01b8a6af1174b')}
          value={pickString(printer, ['location'], '—')}
        />
        <KeyValueRow
          label={translateNative('native.8b62363d3367fc41')}
          value={pickString(printer, ['model'], '—')}
        />
        <KeyValueRow
          label={translateNative('native.80a6fd12627344ff')}
          value={pickString(printer, ['serial_number'], '—')}
        />
        <KeyValueRow
          label={translateNative('native.fc54836a42485597')}
          value={pickString(printer, ['ip_address'], '—')}
        />
        {pickString(printer, ['notes']) ? (
          <KeyValueRow
            label={translateNative('native.be6245aeb9573da2')}
            value={pickString(printer, ['notes'], '—')}
          />
        ) : null}
        <KeyValueRow
          label={translateNative('native.370f94cea9a653bb')}
          value={formatDateTime(pickString(printer, ['created_at']))}
        />
        <KeyValueRow
          label={translateNative('native.c16c9eb6f25b8a84')}
          value={formatDateTime(pickString(printer, ['updated_at']))}
        />
      </SectionCard>

      <PrinterPowerIntegration printerId={printerId} />
      <PrinterSourceActions printerId={printerId} />

      <Pressable
        onPress={() => navigation.navigate('Camera', { id: String(printerId) })}
      >
        <Image
          source={{ uri: api.getCameraSnapshotUrl(printerId) }}
          style={[styles.snapshot, { backgroundColor: colors.surface }]}
        />
      </Pressable>

      <SectionCard
        title={translateNative('common.status')}
        subtitle={translateNative('native.a7fca09264bb3c50')}
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
        <KeyValueRow label={translateNative('native.bb42ea23a396f650')} value={formatPercent(progress)} />
        <KeyValueRow
          label={translateNative('native.b9acbc48541e900b', { defaultValue: 'ETA' })}
          value={formatDuration(
            pickNumber(
              status,
              ['eta_seconds', 'remaining_time', 'job.remaining_seconds'],
              0,
            ),
          )}
        />
        <KeyValueRow
          label={translateNative('native.56b23c213be21529')}
          value={`${pickNumber(
            status,
            ['layer_current', 'current_layer'],
            0,
          )} / ${pickNumber(status, ['layer_total', 'total_layers'], 0)}`}
        />
        <KeyValueRow label={translateNative('native.c1a0e1256b5dcef1')} value={currentFile} />
      </SectionCard>

      <SectionCard title={translateNative('native.c507912584538fba')} subtitle={translateNative('native.8c1ddd2c34eebffc')}>
        {actionMutation.isPending ? <Text accessibilityLiveRegion="polite" style={{ color: colors.textSecondary }}>{t('fleet.actionPending', { defaultValue: 'Sending {{action}} to {{printer}}…', action: actionMutation.variables, printer: printerQuery.data?.name ?? String(printerId) })}</Text> : null}
        <View style={styles.buttonRow}>
          <View style={styles.buttonCell}>
            <PrimaryButton
              label={state.toLowerCase().includes('pause') ? translateNative('native.b68738f908376c9e') : translateNative('native.362b1658df45e7f1')}
              onPress={() =>
                confirmPrintAction(
                  state.toLowerCase().includes('pause') ? 'resume' : 'pause',
                )
              }
              disabled={!hasPermission('printers:control') || !statusQuery.data?.connected || !['RUNNING', 'PAUSE'].includes(statusQuery.data?.state ?? '') || actionMutation.isPending}
              variant="secondary"
              loading={actionMutation.isPending}
            />
          </View>
          <View style={styles.buttonCell}>
            <PrimaryButton
              label={translateNative('common.stop')}
              onPress={() => confirmPrintAction('stop')}
              disabled={!hasPermission('printers:control') || !statusQuery.data?.connected || !['RUNNING', 'PAUSE'].includes(statusQuery.data?.state ?? '') || actionMutation.isPending}
              variant="danger"
              loading={actionMutation.isPending}
            />
          </View>
          <View style={styles.buttonCell}>
            <PrimaryButton
              label={
                pickBoolean(status, ['chamber_light_on', 'light_on'], false)
                  ? translateNative('native.3f4155cf168bea58')
                  : translateNative('native.15e639611f60e39c')
              }
              onPress={() => void actionMutation.mutateAsync('light')}
              variant="secondary"
              loading={actionMutation.isPending}
            />
          </View>
        </View>
      </SectionCard>

      <SectionCard title={translateNative('native.4aaa3e130cf42e9f')} subtitle={translateNative('native.bc8bdce5a210c8c8')}>
        {isPrinting ? (
          <View
            style={[
              styles.movementBanner,
              {
                backgroundColor: colors.warning + '18',
                borderColor: colors.warning + '55',
              },
            ]}
          >
            <Text style={[styles.movementBannerText, { color: colors.warning }]}>
              {translateNative('native.15a135deef56e2a3')}</Text>
          </View>
        ) : null}

        <View style={styles.movementPanel}>
          <View style={styles.xySection}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
              {translateNative('native.6158f82545f74a9f')}</Text>
            <View style={styles.xyGrid}>
              <View style={styles.gridSpacer} />
              <JogButton
                label={translateNative('native.624bed550cf73e7d')}
                disabled={movementDisabled}
                onPress={() =>
                  xyJogMutation.mutate({ x: 0, y: movementDelta })
                }
                icon={<ArrowUp size={20} color={colors.text} strokeWidth={2} />}
                colors={colors}
              />
              <View style={styles.gridSpacer} />
              <JogButton
                label={translateNative('native.6086960b45355173')}
                disabled={movementDisabled}
                onPress={() =>
                  xyJogMutation.mutate({ x: -movementDelta, y: 0 })
                }
                icon={<ArrowLeft size={20} color={colors.text} strokeWidth={2} />}
                colors={colors}
              />
              <JogButton
                label={homeMutation.isPending ? translateNative('native.54658c6f45606ca1') : translateNative('native.d286327177e6555f')}
                disabled={movementDisabled}
                highlighted
                onPress={() => homeMutation.mutate({ axes: 'all', get label() { return translateNative('native.4282cb4cc6f15328'); } })}
                icon={<Home size={20} color={colors.accentLight} strokeWidth={2} />}
                colors={colors}
              />
              <JogButton
                label={translateNative('native.ba3aa1e3e83f9357')}
                disabled={movementDisabled}
                onPress={() =>
                  xyJogMutation.mutate({ x: movementDelta, y: 0 })
                }
                icon={<ArrowRight size={20} color={colors.text} strokeWidth={2} />}
                colors={colors}
              />
              <View style={styles.gridSpacer} />
              <JogButton
                label={translateNative('native.9fb2d1b3ef6a5e63')}
                disabled={movementDisabled}
                onPress={() =>
                  xyJogMutation.mutate({ x: 0, y: -movementDelta })
                }
                icon={<ArrowDown size={20} color={colors.text} strokeWidth={2} />}
                colors={colors}
              />
              <View style={styles.gridSpacer} />
            </View>
          </View>

          <View style={styles.zSection}>
            <View style={styles.zHeader}>
              <MoveVertical size={16} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                {"Z"}</Text>
            </View>
            <View style={styles.zButtons}>
              <JogButton
                label={translateNative('native.8fd3871a396d1547')}
                disabled={movementDisabled}
                onPress={() => zJogMutation.mutate(-movementDelta)}
                icon={<ArrowUp size={20} color={colors.text} strokeWidth={2} />}
                colors={colors}
              />
              <JogButton
                label={translateNative('native.0c59c2660c299bbe')}
                disabled={movementDisabled}
                onPress={() => zJogMutation.mutate(movementDelta)}
                icon={<ArrowDown size={20} color={colors.text} strokeWidth={2} />}
                colors={colors}
              />
            </View>
          </View>
        </View>

        <View style={styles.homeButtonRow}>
          {[
            { get label() { return translateNative('native.db197b37e6a6324f'); }, axes: 'all' as const },
            { get label() { return translateNative('native.ecc06d42d9a4b128'); }, axes: 'xy' as const },
            { get label() { return translateNative('native.ab670ea2c9bcebd7'); }, axes: 'xy' as const },
            { get label() { return translateNative('native.c3a6b91217f29600'); }, axes: 'z' as const },
          ].map(action => (
            <Pressable
              key={action.label}
              onPress={() => homeMutation.mutate(action)}
              disabled={movementDisabled}
              style={[
                styles.homeChip,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
                movementDisabled && styles.disabledButton,
              ]}
            >
              <Home size={14} color={colors.textSecondary} strokeWidth={2} />
              <Text style={[styles.homeChipText, { color: colors.textSecondary }]}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.selectorGroup}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            {translateNative('native.f5c4b97e1a1f194c')}</Text>
          <View style={styles.selectorRow}>
            {JOG_STEP_SIZES.map(step => {
              const selected = step === jogStepSize;
              return (
                <Pressable
                  key={step}
                  onPress={() => setJogStepSize(step)}
                  disabled={movementDisabled}
                  style={[
                    styles.selectorChip,
                    {
                      backgroundColor: selected
                        ? colors.accentBg
                        : colors.surfaceElevated,
                      borderColor: selected ? colors.accent : colors.border,
                    },
                    movementDisabled && styles.disabledButton,
                  ]}
                >
                  <Text
                    style={[
                      styles.selectorChipText,
                      {
                        color: selected ? colors.accentLight : colors.textSecondary,
                      },
                    ]}
                  ><NativeTranslation id="native.281d5b92833317ed" values={{ value0: (step) }} /></Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.selectorGroup}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            {translateNative('native.1257da4fa2984d81')}</Text>
          <View style={styles.selectorRow}>
            {JOG_SPEED_OPTIONS.map(option => {
              const selected = option.value === jogSpeed;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setJogSpeed(option.value)}
                  disabled={movementDisabled}
                  style={[
                    styles.selectorChip,
                    {
                      backgroundColor: selected
                        ? colors.accentBg
                        : colors.surfaceElevated,
                      borderColor: selected ? colors.accent : colors.border,
                    },
                    movementDisabled && styles.disabledButton,
                  ]}
                >
                  <Text
                    style={[
                      styles.selectorChipText,
                      {
                        color: selected ? colors.accentLight : colors.textSecondary,
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </SectionCard>

      <SectionCard title={translateNative('native.2cc11150474ebd7d')}>
        <KeyValueRow
          label={translateNative('native.13db537aa9385363')}
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
          label={translateNative('native.a3619e5a7b86c9e4', { defaultValue: 'Bed' })}
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
          label={translateNative('native.3240e2f71b00c6f4')}
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

      <SectionCard
        title={translateNative('native.dd7b72342954e3ed')}
        subtitle={translateNative('native.462d67376c50d5d2')}
      >
        <InlineTabBar
          value={heaterRange}
          tabs={HEATER_RANGE_OPTIONS.map(option => ({
            key: option.key,
            label: option.label,
          }))}
          onChange={value => setHeaterRange(value as HeaterRangeKey)}
        />
        {heaterHistoryQuery.isLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : heaterHistoryQuery.isError ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {translateNative('native.ad7569c2ae4d31c8')}</Text>
        ) : heaterHistory.points.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {translateNative('native.15dba161a287d6f9')}</Text>
        ) : (
          <>
            <MultiSeriesLineChart points={heaterHistory.points} series={heaterChartSeries} />
            {!heaterHistory.chamberHasData ? (
              <Text style={[styles.heaterHistoryNote, { color: colors.textTertiary }]}>
                {translateNative('native.a8f132bfbb735174')}</Text>
            ) : null}
          </>
        )}
      </SectionCard>

      <SectionCard title={translateNative('native.4bc11c35b0cf1881')}>
        <KeyValueRow
          label={translateNative('native.3c9a3ad783508857')}
          value={`${pickNumber(
            status,
            ['fans.part', 'part_fan_speed'],
            0,
          ).toFixed(0)}%`}
        />
        <KeyValueRow
          label={translateNative('native.cae602d2fafe533b')}
          value={`${pickNumber(
            status,
            ['fans.aux', 'aux_fan_speed'],
            0,
          ).toFixed(0)}%`}
        />
        <KeyValueRow
          label={translateNative('native.390965957fc71204')}
          value={`${pickNumber(
            status,
            ['fans.chamber', 'chamber_fan_speed'],
            0,
          ).toFixed(0)}%`}
        />
      </SectionCard>

      <PrinterDeviceControls printerId={printerId} model={printerQuery.data?.model} />

      <SectionCard title="AMS" subtitle={translateNative('native.378c3c651d301d61')}>
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
                  <Text style={[styles.slotTitle, { color: colors.text }]}><NativeTranslation id="native.0fe9bbcfeac0b232" values={{ value0: (index + 1) }} /></Text>
                  <Text
                    style={[styles.slotMeta, { color: colors.textSecondary }]}
                    numberOfLines={2}
                  >
                    {pickString(
                      slot,
                      ['filament_name', 'material', 'brand'],
                      translateNative('native.7f8014f8ed83660d'),
                    )}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {translateNative('native.d80f5b1f5f44a8b0')}</Text>
        )}
      </SectionCard>

      <SectionCard title={translateNative('native.446856b138f02e32')}>
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

      <SectionCard title={translateNative('native.881a9bc355b6b38f')} subtitle={translateNative('native.d7d546b07299788d')}>
        <View style={styles.buttonRow}>
          <View style={styles.buttonCell}>
            <PrimaryButton
              label={translateNative('native.5e49a0ef6c82bb22')}
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
                <Text style={[styles.modalTitle, { color: colors.text }]}>{translateNative('native.a37bc458ee3af02f')}</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  {pickString(printer, ['name'], translateNative('native.1768778a8d9d377a'))}
                </Text>
              </View>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody}>
              {showDebugModal ? <MQTTConsole printerId={printerId} /> : null}
              <SectionCard title={translateNative('native.9f76394a3aa2df15')} subtitle={translateNative('native.436a43245389a515')}>
                {mqttLogsQuery.isLoading ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <>
                    <KeyValueRow
                      label={translateNative('native.b034b1b471040e79')}
                      value={pickString(
                        mqttLogRecord,
                        ['last_message', 'message'],
                        lastMqttEntry ? stringifyDebugValue(lastMqttEntry) : translateNative('native.233ee65a1242785b'),
                      )}
                    />
                    <KeyValueRow
                      label={translateNative('native.7a24d4ce1f2c4857')}
                      value={formatDateTime(
                        pickString(mqttLogRecord, ['connected_at', 'last_connected_at', 'session_started_at']),
                      )}
                    />
                    <KeyValueRow
                      label={translateNative('native.22cd1cee4ce4b061')}
                      value={formatDateTime(
                        pickString(mqttLogRecord, ['disconnected_at', 'last_disconnected_at', 'session_ended_at']),
                      )}
                    />
                    <KeyValueRow
                      label={translateNative('native.2b60565339692c8e')}
                      value={String(mqttEntries.length)}
                    />
                  </>
                )}
              </SectionCard>

              <SectionCard title={translateNative('native.fa1fcd7a650b3866')} subtitle={translateNative('native.4777d810ad66db43')}>
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
                          {pickString(archive, ['print_name', 'filename', 'name'], translateNative('native.1f8fe56a5af104db'))}
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
                    {translateNative('native.0a95d1c8a7473f2f')}</Text>
                )}
              </SectionCard>

              <SectionCard title={translateNative('native.02e5be51cb31a23c')} subtitle={translateNative('native.a42902c068f7138a')}>
                {activeHmsErrors.length > 0 ? (
                  activeHmsErrors.map((error, index) => (
                    <View
                      key={`${pickString(error, ['code'])}-${index}`}
                      style={[styles.historyRow, { borderColor: colors.borderSubtle }]}
                    >
                      <View style={styles.historyText}>
                        <Text style={[styles.rowTitle, { color: colors.text }]}>
                          {pickString(error, ['code'], translateNative('native.110b61dc33838806'))}
                        </Text>
                        <Text style={[styles.rowMeta, { color: colors.textSecondary }]}><NativeTranslation id="native.d4c62cb0a064dbaa" values={{ value0: (pickString(error, ['severity'], '—')), value1: (pickString(error, ['attr'], '—')) }} /></Text>
                      </View>
                      <StatusBadge label={translateNative('native.0882f126ac69b221')} color={colors.warning} />
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
                          {pickString(entry, ['message', 'payload', 'topic'], translateNative('native.8139d6876ddae465'))}
                        </Text>
                        <Text style={[styles.rowMeta, { color: colors.textSecondary }]} numberOfLines={2}>
                          {formatDateTime(pickString(entry, ['timestamp', 'created_at']))}
                        </Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    {translateNative('native.a4fe44fc71d13f7d')}</Text>
                )}
              </SectionCard>

              <SectionCard title={translateNative('native.f6c278b651de58bd')} subtitle={translateNative('native.30153d55af9bc4f2')}>
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
                        <Text style={[styles.rowMeta, { color: colors.textSecondary }]}><NativeTranslation id="native.ae809b3249f76a4f" values={{ value0: (pickString(point, ['temperature'], '—')), value1: (pickString(point, ['humidity'], '—')) }} /></Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    {translateNative('native.d16452dbbdfee8c9')}</Text>
                )}
              </SectionCard>
            </ScrollView>
            <View style={styles.modalActions}>
              <PrimaryButton label={translateNative('common.close')} onPress={() => setShowDebugModal(false)} />
            </View>
          </View>
        </View>
      </Modal>

      <EditPrinterModal visible={showEditModal} printer={printerQuery.data ?? null} onClose={() => setShowEditModal(false)} />
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
  headerSubtitle: { flex: 1 },
  subtitle: { fontSize: fontSize.base },
  snapshot: {
    width: '100%',
    height: 220,
    borderRadius: borderRadius.xl,
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
  movementBanner: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  movementBannerText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  movementPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  xySection: {
    flex: 1,
    minWidth: 220,
    gap: spacing.md,
  },
  zSection: {
    minWidth: 84,
    gap: spacing.md,
  },
  zHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  xyGrid: {
    alignSelf: 'center',
    width: 228,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  gridSpacer: {
    width: 68,
    height: 68,
  },
  jogButton: {
    width: 68,
    height: 68,
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  jogButtonLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  zButtons: {
    gap: spacing.sm,
  },
  homeButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  homeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  homeChipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  selectorGroup: {
    gap: spacing.sm,
  },
  selectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  selectorChip: {
    minWidth: 72,
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  selectorChipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  heaterHistoryNote: {
    fontSize: fontSize.xs,
  },
  disabledButton: {
    opacity: 0.5,
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
  editButton: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  editModalCard: {
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  editModalHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  editModalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
  },
  editModalClose: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editField: {
    gap: spacing.xs,
  },
  editLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  editInput: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
  },
  editInputMultiline: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
    minHeight: 108,
    textAlignVertical: 'top',
  },
  editModalActions: {
    gap: spacing.sm,
  },
});
