import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, getAuthToken, api } from '@/api/client';
import { useServerStore } from '@/api/server';
import { StatusBadge } from '@/components/common/AppUI';
import { EditPrinterModal } from '@/components/printers/EditPrinterModal';
import { HMSErrorModal } from '@/components/printers/HMSErrorModal';
import { MoveControlsModal } from '@/components/printers/MoveControlsModal';
import { SkipObjectsModal } from '@/components/printers/SkipObjectsModal';
import {
  TrayDetailModal,
  type TrayDetailContext,
} from '@/components/printers/TrayDetailModal';
import { filterKnownHMSErrors } from '@/components/printers/hmsErrorCatalog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import type {
  AMSUnit,
  AMSTray,
  HMSError,
  MaintenanceStatus,
  NozzleRackSlot,
  Printer,
  PrinterStatus,
  SpoolAssignment,
} from '@/types/api';
import { formatDuration, getPrinterModelImagePath, statusColor, withCacheBuster } from '@/utils/data';
import {
  AlertCircle,
  Camera,
  CheckCircle,
  ChevronDown,
  FolderOpen,
  Gauge,
  Layers,
  Lightbulb,
  Link,
  MoreVertical,
  Move,
  Pause,
  Pencil,
  Play,
  Printer as PrinterIcon,
  RefreshCw,
  RotateCcw,
  Square,
  Trash2,
  Wifi,
  WifiOff,
  Wrench,
  X,
} from 'lucide-react-native';

const DOOR_SENSOR_MODELS = new Set([
  'X1C',
  'X1',
  'X1E',
  'X2D',
  'P2S',
  'H2D',
  'H2D Pro',
  'H2C',
  'H2S',
]);

const CHAMBER_FAN_MODELS = new Set([
  'X1C',
  'X1',
  'X1E',
  'X2D',
  'P1S',
  'P2S',
  'H2D',
  'H2D Pro',
  'H2C',
  'H2S',
]);

const SPEED_LEVELS: Record<number, { label: string; percent: string }> = {
  1: { label: 'Silent', percent: '50%' },
  2: { label: 'Standard', percent: '100%' },
  3: { label: 'Sport', percent: '124%' },
  4: { label: 'Ludicrous', percent: '166%' },
};

const PRINT_GREEN = '#10b981';
const PAUSE_AMBER = '#f59e0b';
const STOP_RED = '#ef4444';

interface MaintenanceSummary {
  dueCount: number;
  warningCount: number;
  items: MaintenanceStatus[];
}

type TrayPressContext = TrayDetailContext;

interface PrinterCardProps {
  printer: Printer;
  status?: PrinterStatus;
  queueCount?: number;
  maintenance?: MaintenanceSummary;
  spoolAssignments?: SpoolAssignment[];
  loading?: boolean;
  snapshotSeed?: number | string;
  selected?: boolean;
  selectionMode?: boolean;
  compact?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onToggleSelect?: () => void;
  onCameraPress?: () => void;
  onQueuePress?: () => void;
  onMaintenancePress?: () => void;
  onPrintPress?: () => void;
  onTrayPress?: (tray: AMSTray, context: TrayPressContext) => void;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function getStatusLabel(status?: PrinterStatus) {
  if (!status?.connected) return 'Offline';
  if (status.stg_cur_name) return status.stg_cur_name;

  switch (status.state) {
    case 'RUNNING':
      return 'Printing';
    case 'PAUSE':
      return 'Paused';
    case 'FINISH':
      return 'Finished';
    case 'FAILED':
      return 'Failed';
    case 'IDLE':
      return 'Idle';
    default:
      return status.state
        ? status.state.charAt(0) + status.state.slice(1).toLowerCase()
        : 'Idle';
  }
}

function getSeverityColor(
  errors: HMSError[],
  colors: ReturnType<typeof useTheme>['colors'],
) {
  if (!errors.length) return colors.success;
  if (errors.some(error => error.severity <= 2)) return colors.error;
  return colors.warning;
}

function getBadgeColor(
  printer: Printer,
  status: PrinterStatus | undefined,
  colors: ReturnType<typeof useTheme>['colors'],
  hmsErrors: HMSError[],
) {
  if (printer.is_active === false) return colors.warning;
  if (!status?.connected) return colors.statusOffline;
  if (hmsErrors.length) return getSeverityColor(hmsErrors, colors);
  return statusColor(status.state ?? 'idle', colors);
}

function getWifiTone(
  signal: number,
  colors: ReturnType<typeof useTheme>['colors'],
) {
  if (signal >= -60) return colors.success;
  if (signal >= -70) return colors.warning;
  return colors.error;
}

function formatEta(minutes: number | null | undefined) {
  if (minutes == null || minutes <= 0) return '—';
  const eta = new Date(Date.now() + minutes * 60 * 1000);
  return eta.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function estimateElapsedSeconds(
  progress: number,
  remainingMinutes: number | null | undefined,
) {
  if (!remainingMinutes || remainingMinutes <= 0) return null;
  if (progress <= 0 || progress >= 100) return null;
  const remainingSeconds = remainingMinutes * 60;
  const totalSeconds = remainingSeconds / (1 - progress / 100);
  if (!Number.isFinite(totalSeconds) || totalSeconds <= remainingSeconds) {
    return null;
  }
  return Math.round(totalSeconds - remainingSeconds);
}

function temperatureTone(
  current: number | null | undefined,
  target: number | null | undefined,
  colors: ReturnType<typeof useTheme>['colors'],
) {
  if (target != null && target > 0 && (current ?? 0) + 2 < target) {
    return colors.warning;
  }
  if ((current ?? 0) >= 200) return colors.error;
  if ((current ?? 0) >= 50) return colors.info;
  return colors.textTertiary;
}

function formatTemperature(
  current: number | null | undefined,
  target: number | null | undefined,
) {
  const currentValue = `${Math.round(current ?? 0)}°`;
  if (target != null && target > 0) {
    return `${currentValue} / ${Math.round(target)}°`;
  }
  return currentValue;
}

function formatDualNozzleTemperature(status: PrinterStatus) {
  const primary = formatTemperature(
    status.temperatures?.nozzle,
    status.temperatures?.nozzle_target,
  );
  const secondary = formatTemperature(
    status.temperatures?.nozzle_2,
    status.temperatures?.nozzle_2_target,
  );
  return `L ${primary} • R ${secondary}`;
}

function parseFilamentColor(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.replace('#', '').trim();
  if (!normalized || /^0+$/.test(normalized)) return null;
  if (normalized.length >= 6) return `#${normalized.slice(0, 6)}`;
  return normalized.startsWith('#') ? normalized : `#${normalized}`;
}

function isLightColor(hex: string | null | undefined) {
  const parsed = parseFilamentColor(hex);
  if (!parsed) return false;
  const raw = parsed.slice(1);
  const red = Number.parseInt(raw.slice(0, 2), 16);
  const green = Number.parseInt(raw.slice(2, 4), 16);
  const blue = Number.parseInt(raw.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance >= 180;
}

function getFillColor(
  percent: number | null | undefined,
  colors: ReturnType<typeof useTheme>['colors'],
) {
  if (percent == null) return colors.surfaceHover;
  if (percent >= 60) return colors.success;
  if (percent >= 25) return colors.warning;
  return colors.error;
}

function getAmsStatusLabel(ams: AMSUnit) {
  if (ams.dry_time > 0) return `${Math.ceil(ams.dry_time / 60)}h drying`;
  if (ams.is_ams_ht || ams.module_type === 'n3s') return 'AMS HT';
  if (ams.module_type === 'n3f') return 'AMS Pro';
  return 'AMS';
}

function getAmsTitle(ams: AMSUnit) {
  return `AMS ${String.fromCharCode(65 + ((ams.id >= 128 ? ams.id - 128 : ams.id) % 26))}`;
}

function getTrayLabel(tray: AMSTray) {
  return tray.tray_sub_brands || tray.tray_type || 'Empty';
}

/** Compute effective fill level using the same priority chain as the web UI:
 *  inventory spool (label_weight - weight_used) → raw AMS remain */
function getEffectiveTrayFill(
  tray: AMSTray,
  printerId: number,
  amsId: number,
  slotIdx: number,
  assignments?: SpoolAssignment[],
): number | null {
  if (!tray.tray_type) return null;
  const hasFillLevel = tray.remain >= 0;

  // Check inventory spool assignment
  const assignment = assignments?.find(
    a => a.printer_id === printerId && a.ams_id === amsId && a.tray_id === slotIdx,
  );
  const sp = assignment?.spool;
  const inventoryFill =
    sp && sp.label_weight > 0 && sp.weight_used != null
      ? Math.round(Math.max(0, sp.label_weight - sp.weight_used) / sp.label_weight * 100)
      : null;

  // If inventory says 0% but AMS reports positive remain, prefer AMS
  const resolvedInventoryFill =
    inventoryFill === 0 && hasFillLevel && tray.remain > 0 ? null : inventoryFill;

  return resolvedInventoryFill ?? (hasFillLevel ? clamp(tray.remain) : null);
}

function getTrayStateLabel(tray: AMSTray) {
  if (tray.tray_type) return tray.tray_type;
  if (tray.state === 9 || tray.state === 10) return 'Empty';
  return 'Unset';
}

function getTrayGlobalId(amsId: number, trayId: number) {
  return amsId >= 255 ? trayId : amsId * 4 + trayId;
}

function getNozzleName(slot: NozzleRackSlot) {
  const diameter = slot.nozzle_diameter ? `${slot.nozzle_diameter}mm` : 'Nozzle';
  const type = slot.nozzle_type ? slot.nozzle_type.replace(/_/g, ' ') : '';
  return type ? `${diameter} ${type}` : diameter;
}

function stripExtension(name: string | null | undefined) {
  if (!name) return 'No active job';
  return name.replace(/\.(gcode|3mf)$/i, '');
}

function MetricCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: string;
}) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.metricCard,
        { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
      ]}
    >
      <View style={styles.metricHeader}>
        <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
          {label}
        </Text>
        <View
          style={[
            styles.metricDot,
            { backgroundColor: tone ?? colors.textTertiary },
          ]}
        />
      </View>
      <Text style={[styles.metricValue, { color: colors.text }]}>{value}</Text>
      {helper ? (
        <Text style={[styles.metricHelper, { color: colors.textTertiary }]}> 
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

function InfoPill({
  label,
  color,
  icon,
  onPress,
}: {
  label: string;
  color: string;
  icon?: React.ReactNode;
  onPress?: () => void;
}) {
  const content = (
    <View
      style={[
        styles.infoPill,
        { backgroundColor: `${color}18`, borderColor: `${color}45` },
      ]}
    >
      {icon}
      <Text style={[styles.infoPillText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }

  return content;
}

function SectionLabel({ label }: { label: string }) {
  const { colors } = useTheme();

  return (
    <View style={styles.sectionLabelRow}>
      <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
        {label}
      </Text>
      <View style={[styles.sectionDivider, { backgroundColor: colors.borderSubtle }]} />
    </View>
  );
}

function TrayCard({
  label,
  subtitle,
  fill,
  colorHex,
  active,
  helper,
  onPress,
  compact,
}: {
  label: string;
  subtitle?: string;
  fill: number | null;
  colorHex: string | null | undefined;
  active: boolean;
  helper: string;
  onPress?: () => void;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const color = parseFilamentColor(colorHex);
  const lightColor = isLightColor(colorHex);
  const textColor = color && lightColor ? colors.textInverse : colors.text;

  const content = (
    <View
      style={[
        styles.trayCard,
        compact && styles.trayCardCompact,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: active ? colors.accent : colors.border,
        },
      ]}
    >
      <View style={styles.trayTopRow}>
        <View
          style={[
            styles.trayColorCircle,
            {
              backgroundColor: color ?? colors.surfaceHover,
              borderColor: color ?? colors.border,
            },
          ]}
        >
          <Text style={[styles.trayColorText, { color: textColor }]}>{helper}</Text>
        </View>
        {active ? <View style={[styles.activeDot, { backgroundColor: colors.accent }]} /> : null}
      </View>
      <Text style={[styles.trayLabel, { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
      {subtitle ? (
        <Text style={[styles.traySubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
      <View style={[styles.fillTrack, { backgroundColor: colors.surfaceHover }]}>
        <View
          style={[
            styles.fillBar,
            {
              width: `${fill ?? 0}%`,
              backgroundColor: getFillColor(fill, colors),
            },
          ]}
        />
      </View>
      <Text style={[styles.trayFillText, { color: colors.textSecondary }]}> 
        {fill == null ? '—' : `${fill}% remaining`}
      </Text>
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable onPress={onPress} style={styles.trayPressable}>
      {content}
    </Pressable>
  );
}

function NozzleRackView({
  slots,
  activeNozzle,
}: {
  slots: NozzleRackSlot[];
  activeNozzle: number | null | undefined;
}) {
  const { colors } = useTheme();
  const rackSlots = useMemo(() => {
    const rackOnly = slots.filter(slot => slot.id >= 2);
    return Array.from({ length: 6 }, (_, index) => {
      const slotId = 16 + index;
      return (
        rackOnly.find(slot => slot.id === slotId) ?? {
          id: -index - 1,
          nozzle_type: '',
          nozzle_diameter: '',
          wear: null,
          stat: null,
          max_temp: 0,
          serial_number: '',
          filament_color: '',
          filament_id: '',
          filament_type: '',
        }
      );
    });
  }, [slots]);

  return (
    <View style={styles.rackRow}>
      {rackSlots.map((slot, index) => {
        const color = parseFilamentColor(slot.filament_color);
        const lightColor = isLightColor(slot.filament_color);
        const isEmpty = !slot.nozzle_diameter && !slot.nozzle_type;
        return (
          <View
            key={`${slot.id}-${index}`}
            style={[
              styles.rackSlot,
              {
                backgroundColor: color ?? colors.surfaceElevated,
                borderColor:
                  activeNozzle != null && slot.id === activeNozzle
                    ? colors.accent
                    : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.rackSlotText,
                {
                  color: color && lightColor ? colors.textInverse : colors.text,
                },
              ]}
            >
              {isEmpty ? '—' : slot.nozzle_diameter || '?'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function ControlButton({
  label,
  icon,
  trailingIcon,
  onPress,
  disabled,
  backgroundColor,
  borderColor,
  textColor,
  outline,
  iconOnly,
}: {
  label: string;
  icon: React.ReactNode;
  trailingIcon?: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  outline?: boolean;
  iconOnly?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        iconOnly ? styles.controlIconButton : styles.controlButton,
        { backgroundColor, borderColor },
        outline && styles.controlButtonOutline,
        disabled && styles.disabledAction,
      ]}
      accessibilityLabel={label}
    >
      {icon}
      {!iconOnly && (
        <Text style={[styles.controlButtonText, { color: textColor }]} numberOfLines={1}>
          {label}
        </Text>
      )}
      {trailingIcon}
    </Pressable>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

interface ActionSheetAction {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
  loading?: boolean;
}

function ActionSheetModal({
  visible,
  title,
  subtitle,
  actions,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  actions: ActionSheetAction[];
  onClose: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.actionSheetBackdrop, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.actionSheetCard,
            { backgroundColor: colors.modalBg, borderColor: colors.border },
          ]}
        >
          <View style={styles.actionSheetHeader}>
            <View style={styles.actionSheetTitleWrap}>
              <Text style={[styles.actionSheetTitle, { color: colors.text }]}>
                {title}
              </Text>
              {subtitle ? (
                <Text
                  style={[styles.actionSheetSubtitle, { color: colors.textSecondary }]}
                >
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={onClose}
              style={[
                styles.actionSheetClose,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
              ]}
            >
              <X size={18} color={colors.text} strokeWidth={2} />
            </Pressable>
          </View>

          <View style={styles.actionSheetActions}>
            {actions.map(action => (
              <Pressable
                key={action.label}
                onPress={action.onPress}
                disabled={action.disabled || action.loading}
                style={[
                  styles.actionSheetRow,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: action.destructive ? `${colors.error}66` : colors.border,
                  },
                  (action.disabled || action.loading) && styles.disabledAction,
                ]}
              >
                <View style={styles.actionSheetRowIcon}>{action.icon}</View>
                <Text
                  style={[
                    styles.actionSheetRowLabel,
                    { color: action.destructive ? colors.error : colors.text },
                  ]}
                >
                  {action.label}
                </Text>
                {action.loading ? (
                  <ActivityIndicator
                    size="small"
                    color={action.destructive ? colors.error : colors.accent}
                  />
                ) : null}
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function PrinterCard({
  printer,
  status,
  queueCount = 0,
  maintenance,
  spoolAssignments,
  loading = false,
  snapshotSeed = 0,
  selected = false,
  selectionMode = false,
  compact = false,
  onPress,
  onLongPress,
  onToggleSelect,
  onCameraPress,
  onQueuePress,
  onMaintenancePress,
  onPrintPress,
  onTrayPress,
}: PrinterCardProps) {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const serverUrl = useServerStore(state => state.serverUrl);
  const authToken = getAuthToken();
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [calibrateSheetVisible, setCalibrateSheetVisible] = useState(false);
  const [moreSheetVisible, setMoreSheetVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [showHmsModal, setShowHmsModal] = useState(false);
  const [skipObjectsVisible, setSkipObjectsVisible] = useState(false);
  const [selectedTray, setSelectedTray] = useState<{
    tray: AMSTray;
    context: TrayPressContext;
  } | null>(null);
  const authHeaders = useMemo(
    () => (authToken ? { Authorization: `Bearer ${authToken}` } : undefined),
    [authToken],
  );

  const isConnected = status?.connected ?? false;
  const isPrinting = status?.state === 'RUNNING' || status?.state === 'PAUSE';
  const isPaused = status?.state === 'PAUSE';
  const isPrintingWithObjects =
    isPrinting && (status?.printable_objects_count ?? 0) > 0;
  const hmsErrors = filterKnownHMSErrors(status?.hms_errors ?? []);
  const badgeLabel = getStatusLabel(status);
  const badgeColor = getBadgeColor(printer, status, colors, hmsErrors);
  const currentPrintName = stripExtension(
    status?.subtask_name || status?.current_print || status?.gcode_file,
  );
  const rawProgress = status?.progress ?? 0;
  const progress = clamp(rawProgress);
  const elapsedSeconds = estimateElapsedSeconds(progress, status?.remaining_time);
  const speedInfo = SPEED_LEVELS[status?.speed_level ?? 2] ?? SPEED_LEVELS[2];
  const maintenanceCount =
    (maintenance?.dueCount ?? 0) + (maintenance?.warningCount ?? 0);
  const canCamera = hasPermission('camera:view') && !!onCameraPress;
  const canPrintControl =
    isPrinting && hasPermission('printers:control');
  const canControlPrinter = isConnected && hasPermission('printers:control');
  const canBrowse = !!onPrintPress;
  const canEditPrinter = hasPermission('printers:update');
  const canDeletePrinter = hasPermission('printers:delete');
  const canClearPlate =
    Boolean(status?.awaiting_plate_clear) &&
    !isPrinting &&
    hasPermission('printers:clear_plate');

  const invalidatePrinterQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['printerStatus', printer.id] }),
      queryClient.invalidateQueries({ queryKey: ['printer', printer.id] }),
      queryClient.invalidateQueries({ queryKey: ['queue'] }),
      queryClient.invalidateQueries({ queryKey: ['maintenanceTasks'] }),
      queryClient.invalidateQueries({ queryKey: ['currentPrintUser', printer.id] }),
    ]);
  }, [printer.id, queryClient]);

  const cameraUri = useMemo(() => {
    if (!canCamera) return null;
    return withCacheBuster(api.getCameraSnapshotUrl(printer.id), snapshotSeed);
  }, [canCamera, printer.id, snapshotSeed]);

  const cameraSource = useMemo(() => {
    if (!cameraUri) return null;
    return {
      uri: cameraUri,
      headers: authHeaders,
    };
  }, [authHeaders, cameraUri]);

  const printerImageUrl = useMemo(() => {
    if (!serverUrl) return null;
    // Use the model-based static image from the server (same as web UI)
    const imagePath = getPrinterModelImagePath(printer.model);
    return `${serverUrl}${imagePath}`;
  }, [printer.model, serverUrl]);

  const printerImageSource = useMemo(() => {
    if (!printerImageUrl) return null;
    return {
      uri: printerImageUrl,
      headers: authHeaders,
    };
  }, [authHeaders, printerImageUrl]);

  const currentPrintUserQuery = useQuery({
    queryKey: ['currentPrintUser', printer.id],
    queryFn: async () =>
      (await api.getCurrentPrintUser(printer.id)) as { username: string | null },
    enabled: isPrinting,
    staleTime: 15_000,
  });

  const actionMutation = useMutation({
    mutationFn: async (action: 'pause' | 'resume' | 'stop') => {
      if (action === 'pause') return api.pausePrint(printer.id);
      if (action === 'resume') return api.resumePrint(printer.id);
      return api.stopPrint(printer.id);
    },
    onSuccess: async (_, action) => {
      await invalidatePrinterQueries();
      showToast(`Printer ${action} command sent.`, 'success');
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Printer command failed.'), 'error'),
  });

  const lightMutation = useMutation({
    mutationFn: () => api.setChamberLight(printer.id, !status?.chamber_light),
    onSuccess: async () => {
      await invalidatePrinterQueries();
      showToast(
        status?.chamber_light ? 'Chamber light turned off.' : 'Chamber light turned on.',
        'success',
      );
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Could not update chamber light.'), 'error'),
  });

  const speedMutation = useMutation({
    mutationFn: (mode: number) => api.setPrintSpeed(printer.id, mode),
    onSuccess: async () => {
      await invalidatePrinterQueries();
      showToast('Print speed updated.', 'success');
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Failed to update print speed.'), 'error'),
  });

  const clearPlateMutation = useMutation({
    mutationFn: () => api.clearPlate(printer.id),
    onSuccess: async () => {
      await invalidatePrinterQueries();
      showToast('Plate marked as cleared.', 'success');
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Could not update plate status.'), 'error'),
  });

  const calibrateMutation = useMutation({
    mutationFn: (axes: 'z' | 'xy' | 'all') => api.homeAxes(printer.id, axes),
    onSuccess: async (_, axes) => {
      await invalidatePrinterQueries();
      showToast(
        axes === 'z'
          ? 'Auto-level bed started.'
          : axes === 'all'
            ? 'Homing all axes started.'
            : 'Homing XY started.',
        'success',
      );
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Calibration command failed.'), 'error'),
  });

  const maintenanceMutation = useMutation({
    mutationFn: (nextIsActive: boolean) =>
      api.updatePrinter(printer.id, { is_active: nextIsActive }),
    onSuccess: async (_, nextIsActive) => {
      await invalidatePrinterQueries();
      showToast(
        nextIsActive
          ? `${printer.name} is back online.`
          : `${printer.name} is now in maintenance mode.`,
        'success',
      );
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Could not update maintenance mode.'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deletePrinter(printer.id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['printers'] }),
        invalidatePrinterQueries(),
      ]);
      showToast(`${printer.name} deleted.`, 'success');
      if (typeof navigation.canGoBack === 'function' && navigation.canGoBack()) {
        navigation.goBack();
      }
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Could not delete printer.'), 'error'),
  });

  const handleRefresh = useCallback(async () => {
    await invalidatePrinterQueries();
    showToast('Refreshing printer status…', 'success');
  }, [invalidatePrinterQueries, showToast]);

  const handleTrayPress = useCallback(
    (tray: AMSTray, context: TrayPressContext) => {
      if (onTrayPress) {
        onTrayPress(tray, context);
        return;
      }

      setSelectedTray({ tray, context });
    },
    [onTrayPress],
  );

  const handleToggleMaintenance = useCallback(() => {
    const nextIsActive = !printer.is_active;
    Alert.alert(
      nextIsActive ? 'Disable maintenance mode' : 'Enable maintenance mode',
      nextIsActive
        ? `${printer.name} will return to active service.`
        : `${printer.name} will stop accepting normal printer actions until maintenance mode is disabled.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: nextIsActive ? 'Disable' : 'Enable',
          style: nextIsActive ? 'default' : 'destructive',
          onPress: () => maintenanceMutation.mutate(nextIsActive),
        },
      ],
    );
  }, [maintenanceMutation, printer.is_active, printer.name]);

  const handleDeletePrinter = useCallback(() => {
    Alert.alert(
      'Delete printer',
      `Delete ${printer.name}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(),
        },
      ],
    );
  }, [deleteMutation, printer.name]);

  const showMoveMenu = useCallback(() => {
    setMoveModalVisible(true);
  }, []);

  const showCalibrateMenu = useCallback(() => {
    setCalibrateSheetVisible(true);
  }, []);

  const showSpeedMenu = useCallback(() => {
    Alert.alert('Print speed', 'Choose a print speed.', [
      ...Object.entries(SPEED_LEVELS).map(([value, info]) => ({
        text: `${info.label} (${info.percent})`,
        onPress: () => {
          speedMutation.mutate(Number(value));
        },
      })),
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [speedMutation]);

  const showMoreMenu = useCallback(() => {
    setMoreSheetVisible(true);
  }, []);

  const cameraPreview = canCamera ? (
    <Pressable
      onPress={onCameraPress}
      style={[
        styles.previewFrame,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
        },
      ]}
    >
      {cameraSource ? <Image source={cameraSource} style={styles.previewImage} /> : null}
      <View style={[styles.previewOverlay, { backgroundColor: colors.overlay }]}> 
        <Camera size={14} color={colors.text} strokeWidth={2} />
        <Text style={[styles.previewOverlayText, { color: colors.text }]} numberOfLines={1}>
          {currentPrintName || 'Live view'}
        </Text>
      </View>
    </Pressable>
  ) : (
    <View
      style={[
        styles.previewPlaceholder,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
        },
      ]}
    >
      <Camera size={20} color={colors.textTertiary} strokeWidth={2} />
      <Text style={[styles.previewPlaceholderText, { color: colors.textSecondary }]}> 
        Camera unavailable
      </Text>
    </View>
  );

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: selected ? colors.accentBg : colors.card,
          borderColor: selected ? colors.accent : colors.cardBorder,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={onPress} style={styles.titleArea}>
          <View
            style={[
              styles.printerImageWrap,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
              },
            ]}
          >
            {printerImageSource ? (
              <Image source={printerImageSource} style={styles.printerImage} />
            ) : (
              <PrinterIcon size={18} color={colors.textSecondary} strokeWidth={2} />
            )}
          </View>
          <View style={styles.titleText}>
            <View style={styles.titleLine}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                {printer.name}
              </Text>
              <View
                style={[
                  styles.connectionDot,
                  {
                    backgroundColor: isConnected ? colors.success : colors.error,
                  },
                ]}
              />
            </View>
            <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
              {printer.model || 'Unknown model'}
              {printer.location ? ` • ${printer.location}` : ''}
            </Text>
          </View>
        </Pressable>
        <StatusBadge label={badgeLabel} color={badgeColor} />
      </View>

      <View style={styles.badgesWrap}>
        <InfoPill
          label={
            printer.is_active === false
              ? 'Maintenance mode'
              : isConnected
                ? 'Online'
                : 'Offline'
          }
          color={
            printer.is_active === false
              ? colors.warning
              : isConnected
                ? colors.success
                : colors.error
          }
          icon={
            printer.is_active === false ? (
              <Wrench size={12} color={colors.warning} strokeWidth={2} />
            ) : isConnected ? (
              <Link size={12} color={colors.success} strokeWidth={2} />
            ) : (
              <WifiOff size={12} color={colors.error} strokeWidth={2} />
            )
          }
        />
        {isConnected ? (
          status?.wired_network ? (
            <InfoPill
              label="LAN"
              color={colors.success}
              icon={<Link size={12} color={colors.success} strokeWidth={2} />}
            />
          ) : status?.wifi_signal != null ? (
            <InfoPill
              label={`${status.wifi_signal} dBm`}
              color={getWifiTone(status.wifi_signal, colors)}
              icon={
                <Wifi
                  size={12}
                  color={getWifiTone(status.wifi_signal, colors)}
                  strokeWidth={2}
                />
              }
            />
          ) : null
        ) : null}
        {hmsErrors.length ? (
          <InfoPill
            label={`${hmsErrors.length} HMS`}
            color={getSeverityColor(hmsErrors, colors)}
            icon={
              <AlertCircle
                size={12}
                color={getSeverityColor(hmsErrors, colors)}
                strokeWidth={2}
              />
            }
            onPress={() => setShowHmsModal(true)}
          />
        ) : (
          <InfoPill
            label="HMS OK"
            color={colors.success}
            icon={<CheckCircle size={12} color={colors.success} strokeWidth={2} />}
          />
        )}
        {queueCount > 0 ? (
          <InfoPill
            label={`${queueCount} queued`}
            color={colors.info}
            icon={<Layers size={12} color={colors.info} strokeWidth={2} />}
            onPress={onQueuePress}
          />
        ) : null}
        {maintenanceCount > 0 ? (
          <InfoPill
            label={`${maintenanceCount} maintenance`}
            color={maintenance?.dueCount ? colors.error : colors.warning}
            icon={
              <Wrench
                size={12}
                color={maintenance?.dueCount ? colors.error : colors.warning}
                strokeWidth={2}
              />
            }
            onPress={onMaintenancePress}
          />
        ) : (
          <InfoPill
            label="Maintenance OK"
            color={colors.success}
            icon={<Wrench size={12} color={colors.success} strokeWidth={2} />}
          />
        )}
        {status?.firmware_version ? (
          <InfoPill label={status.firmware_version} color={colors.textSecondary} />
        ) : null}
        {status && DOOR_SENSOR_MODELS.has(printer.model ?? '') ? (
          <InfoPill
            label={status.door_open ? 'Door open' : 'Door closed'}
            color={status.door_open ? colors.warning : colors.success}
          />
        ) : null}
      </View>

      <SectionLabel label="Status" />
      <View style={styles.statusRow}>
        {cameraPreview}
        <View style={styles.statusContent}>
          <View style={styles.statusTopRow}>
            <Text style={[styles.stateText, { color: colors.textSecondary }]} numberOfLines={1}>
              {badgeLabel}
            </Text>
            {loading ? (
              <Text style={[styles.refreshText, { color: colors.textTertiary }]}>Refreshing…</Text>
            ) : null}
          </View>
          <Text style={[styles.printName, { color: colors.text }]} numberOfLines={2}>
            {currentPrintName}
          </Text>
          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceHover }]}> 
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progress}%`,
                  backgroundColor: badgeColor,
                },
              ]}
            />
          </View>
          <View style={styles.progressMetaRow}>
            <Text style={[styles.progressText, { color: colors.text }]}> 
              {`${Math.round(progress)}%`}
            </Text>
            <Text style={[styles.progressMeta, { color: colors.textSecondary }]}> 
              Layer{' '}
              {status?.layer_num != null && status?.total_layers != null
                ? `${status.layer_num}/${status.total_layers}`
                : '—'}
            </Text>
          </View>
          <View style={styles.timelineRow}>
            <Text style={[styles.timelineItem, { color: colors.textSecondary }]}>
              Remaining {formatDuration((status?.remaining_time ?? 0) * 60)}
            </Text>
            <Text style={[styles.timelineItem, { color: colors.textSecondary }]}>
              Elapsed {formatDuration(elapsedSeconds ?? 0)}
            </Text>
          </View>
          <View style={styles.timelineRow}>
            <Text style={[styles.timelineItem, { color: colors.textSecondary }]}>
              ETA {formatEta(status?.remaining_time)}
            </Text>
            <Text style={[styles.timelineItem, { color: colors.textSecondary }]}>
              Speed {speedInfo.label} · {speedInfo.percent}
            </Text>
          </View>
          {currentPrintUserQuery.data?.username ? (
            <Text style={[styles.userText, { color: colors.textTertiary }]} numberOfLines={1}>
              Started by {currentPrintUserQuery.data.username}
            </Text>
          ) : null}
        </View>
      </View>

      {!compact && (
      <>
      <SectionLabel label="Controls" />
      <View style={styles.controlsGrid}>
        <ControlButton
          label={status?.chamber_light ? 'Light on' : 'Light off'}
          icon={<Lightbulb size={16} color={status?.chamber_light ? colors.warning : colors.text} strokeWidth={2} />}
          onPress={() => lightMutation.mutate()}
          disabled={!canControlPrinter || lightMutation.isPending}
          backgroundColor={colors.surfaceElevated}
          borderColor={colors.border}
          textColor={colors.text}
          iconOnly
        />
        <ControlButton
          label="Move"
          icon={<Move size={16} color={colors.text} strokeWidth={2} />}
          onPress={showMoveMenu}
          disabled={!canControlPrinter}
          backgroundColor={colors.surfaceElevated}
          borderColor={colors.border}
          textColor={colors.text}
          iconOnly
        />
        <ControlButton
          label="Calibrate"
          icon={<RotateCcw size={16} color={colors.text} strokeWidth={2} />}
          onPress={showCalibrateMenu}
          disabled={!canControlPrinter}
          backgroundColor={colors.surfaceElevated}
          borderColor={colors.border}
          textColor={colors.text}
          iconOnly
        />
        <ControlButton
          label={speedInfo.label}
          icon={<Gauge size={16} color={colors.text} strokeWidth={2} />}
          trailingIcon={<ChevronDown size={12} color={colors.textSecondary} strokeWidth={2} />}
          onPress={showSpeedMenu}
          disabled={!canControlPrinter || speedMutation.isPending}
          backgroundColor={colors.surfaceElevated}
          borderColor={colors.border}
          textColor={colors.text}
        />
        <ControlButton
          label="Refresh"
          icon={<RefreshCw size={16} color={colors.text} strokeWidth={2} />}
          onPress={handleRefresh}
          backgroundColor={colors.surfaceElevated}
          borderColor={colors.border}
          textColor={colors.text}
          iconOnly
        />
        {isPrintingWithObjects ? (
          <ControlButton
            label="Skip objects"
            icon={<Layers size={16} color={colors.text} strokeWidth={2} />}
            onPress={() => setSkipObjectsVisible(true)}
            disabled={!hasPermission('printers:control')}
            backgroundColor={colors.surfaceElevated}
            borderColor={colors.border}
            textColor={colors.text}
            iconOnly
          />
        ) : null}
      </View>
      <View style={styles.controlActionsRow}>
        <ControlButton
          label={isPaused ? 'Resume' : 'Pause'}
          icon={
            isPaused ? (
              <Play size={16} color={colors.textInverse} strokeWidth={2} />
            ) : (
              <Pause size={16} color={colors.textInverse} strokeWidth={2} />
            )
          }
          onPress={() => actionMutation.mutate(isPaused ? 'resume' : 'pause')}
          disabled={!canPrintControl || actionMutation.isPending}
          backgroundColor={isPaused ? PRINT_GREEN : PAUSE_AMBER}
          borderColor={isPaused ? PRINT_GREEN : PAUSE_AMBER}
          textColor={colors.textInverse}
          iconOnly
        />
        <ControlButton
          label="Stop"
          icon={<Square size={16} color={colors.textInverse} strokeWidth={2} />}
          onPress={() => actionMutation.mutate('stop')}
          disabled={!canPrintControl || actionMutation.isPending}
          backgroundColor={STOP_RED}
          borderColor={STOP_RED}
          textColor={colors.textInverse}
          iconOnly
        />
        {status?.awaiting_plate_clear ? (
          <ControlButton
            label="Clear plate"
            icon={<Wrench size={15} color={PAUSE_AMBER} strokeWidth={2} />}
            onPress={() => clearPlateMutation.mutate()}
            disabled={!canClearPlate || clearPlateMutation.isPending}
            backgroundColor="transparent"
            borderColor={PAUSE_AMBER}
            textColor={PAUSE_AMBER}
            outline
          />
        ) : null}
      </View>

      <SectionLabel label="Temperatures & fans" />
      <View style={styles.metricGrid}>
        <MetricCard
          label={status?.temperatures?.nozzle_2 != null ? 'Nozzles' : 'Nozzle'}
          value={
            status?.temperatures?.nozzle_2 != null && status
              ? formatDualNozzleTemperature(status)
              : formatTemperature(
                  status?.temperatures?.nozzle,
                  status?.temperatures?.nozzle_target,
                )
          }
          helper={
            status?.active_extruder != null && status?.temperatures?.nozzle_2 != null
              ? `Active ${status.active_extruder === 1 ? 'left' : 'right'} nozzle`
              : status?.nozzles?.[0]?.nozzle_diameter
                ? `${status.nozzles[0].nozzle_diameter}mm ${status.nozzles[0].nozzle_type.replace(/_/g, ' ')}`
                : undefined
          }
          tone={temperatureTone(status?.temperatures?.nozzle, status?.temperatures?.nozzle_target, colors)}
        />
        <MetricCard
          label="Bed"
          value={formatTemperature(
            status?.temperatures?.bed,
            status?.temperatures?.bed_target,
          )}
          tone={temperatureTone(status?.temperatures?.bed, status?.temperatures?.bed_target, colors)}
        />
        {status?.temperatures?.chamber != null ? (
          <MetricCard
            label="Chamber"
            value={formatTemperature(
              status?.temperatures?.chamber,
              status?.temperatures?.chamber_target,
            )}
            helper={status.supports_chamber_heater ? 'Heated chamber' : 'Sensor only'}
            tone={temperatureTone(status?.temperatures?.chamber, status?.temperatures?.chamber_target, colors)}
          />
        ) : null}
        <MetricCard
          label="Part fan"
          value={`${status?.cooling_fan_speed ?? 0}%`}
          tone={(status?.cooling_fan_speed ?? 0) > 0 ? colors.info : colors.textTertiary}
        />
        <MetricCard
          label="Aux fan"
          value={`${status?.big_fan1_speed ?? 0}%`}
          tone={(status?.big_fan1_speed ?? 0) > 0 ? colors.info : colors.textTertiary}
        />
        {CHAMBER_FAN_MODELS.has(printer.model ?? '') ? (
          <MetricCard
            label="Chamber fan"
            value={`${status?.big_fan2_speed ?? 0}%`}
            tone={(status?.big_fan2_speed ?? 0) > 0 ? colors.success : colors.textTertiary}
          />
        ) : null}
      </View>

      {(status?.ams?.length || status?.vt_tray?.length) ? (
        <>
          <SectionLabel label="Filament systems" />
          <View style={styles.amsList}>
            {(status?.ams ?? []).map(ams => {
              const trayCount = ams.tray.length;
              return (
                <View
                  key={ams.id}
                  style={[
                    styles.amsCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.amsHeader}>
                    <View style={styles.amsHeaderText}>
                      <Text style={[styles.amsTitle, { color: colors.text }]}> 
                        {`AMS ${String.fromCharCode(65 + ((ams.id >= 128 ? ams.id - 128 : ams.id) % 26))}`}
                      </Text>
                      <Text style={[styles.amsSubtitle, { color: colors.textSecondary }]}> 
                        {getAmsStatusLabel(ams)}
                      </Text>
                    </View>
                    <View style={styles.amsIndicators}>
                      {ams.temp != null ? (
                        <Text style={[styles.amsIndicatorText, { color: getFillColor(100 - ams.temp, colors) }]}> 
                          {ams.temp}°C
                        </Text>
                      ) : null}
                      {ams.humidity != null ? (
                        <Text
                          style={[
                            styles.amsIndicatorText,
                            {
                              color:
                                ams.humidity <= 40
                                  ? colors.success
                                  : ams.humidity <= 60
                                    ? colors.warning
                                    : colors.error,
                            },
                          ]}
                        >
                          {ams.humidity}% RH
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.trayGrid}>
                    {ams.tray.map((tray, index) => {
                      const active = status?.tray_now === getTrayGlobalId(ams.id, tray.id);
                      return (
                        <TrayCard
                          key={`${ams.id}-${tray.id}-${index}`}
                          label={getTrayLabel(tray)}
                          subtitle={
                            tray.tray_sub_brands && tray.tray_type && tray.tray_sub_brands !== tray.tray_type
                              ? tray.tray_type
                              : undefined
                          }
                          fill={getEffectiveTrayFill(tray, printer.id, ams.id, index, spoolAssignments)}
                          colorHex={tray.tray_color}
                          active={active}
                          helper={String(index + 1)}
                          onPress={() =>
                            handleTrayPress(tray, {
                              amsId: ams.id,
                              trayId: tray.id,
                              slotIndex: index,
                              isExternal: false,
                              label: String(index + 1),
                              amsLabel: getAmsTitle(ams),
                              temperature: ams.temp,
                            })
                          }
                          compact={trayCount < 4}
                        />
                      );
                    })}
                  </View>
                </View>
              );
            })}

            {(status?.vt_tray ?? []).length > 0 ? (
              <View
                style={[
                  styles.amsCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.amsHeader}>
                  <View style={styles.amsHeaderText}>
                    <Text style={[styles.amsTitle, { color: colors.text }]}>External</Text>
                    <Text style={[styles.amsSubtitle, { color: colors.textSecondary }]}>Virtual tray</Text>
                  </View>
                </View>
                <View style={styles.trayGrid}>
                  {(status?.vt_tray ?? []).map((tray, index) => {
                    const active = status?.tray_now === (tray.id ?? 254);
                    const helper =
                      printer.nozzle_count > 1
                        ? (tray.id ?? 254) === 254
                          ? 'L'
                          : 'R'
                        : String(index + 1);
                    return (
                      <TrayCard
                        key={`ext-${tray.id ?? index}`}
                        label={tray.tray_sub_brands || getTrayStateLabel(tray)}
                        subtitle={tray.tray_type && tray.tray_sub_brands ? tray.tray_type : 'Virtual tray'}
                        fill={getEffectiveTrayFill(tray, printer.id, 255, (tray.id ?? 254) - 254, spoolAssignments)}
                        colorHex={tray.tray_color}
                        active={active}
                        helper={helper}
                        onPress={() =>
                          handleTrayPress(tray, {
                            amsId: 255,
                            trayId: tray.id ?? 254,
                            slotIndex: index,
                            isExternal: true,
                            label: helper,
                            amsLabel: 'External spool',
                            temperature: null,
                          })
                        }
                        compact
                      />
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>
        </>
      ) : null}

      {status?.nozzle_rack?.some(slot => slot.id >= 2) ? (
        <>
          <SectionLabel label="Nozzle rack" />
          <NozzleRackView slots={status.nozzle_rack} activeNozzle={status.active_extruder} />
          <View style={styles.nozzleMetaList}>
            {status.nozzle_rack
              .filter(slot => slot.id >= 2)
              .slice(0, 3)
              .map(slot => (
                <Text
                  key={`meta-${slot.id}`}
                  style={[styles.nozzleMetaText, { color: colors.textSecondary }]}
                >
                  {getNozzleName(slot)}
                  {slot.filament_type ? ` • ${slot.filament_type}` : ''}
                  {slot.wear != null ? ` • wear ${slot.wear}%` : ''}
                </Text>
              ))}
          </View>
        </>
      ) : null}

      {hmsErrors.length > 0 ? (
        <>
          <SectionLabel label="HMS alerts" />
          <View style={styles.hmsList}>
            {hmsErrors.slice(0, 3).map((error, index) => (
              <View
                key={`${error.code}-${index}`}
                style={[
                  styles.hmsItem,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.hmsSeverity,
                    {
                      backgroundColor:
                        error.severity <= 2 ? colors.error : colors.warning,
                    },
                  ]}
                />
                <View style={styles.hmsText}>
                  <Text style={[styles.hmsTitle, { color: colors.text }]}> 
                    {error.full_code || error.code}
                  </Text>
                  <Text style={[styles.hmsSubtitle, { color: colors.textSecondary }]}> 
                    Severity {error.severity}
                    {error.actions?.length ? ` • ${error.actions.join(', ')}` : ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {(maintenance?.items?.length ?? 0) > 0 ? (() => {
        const neededItems = maintenance!.items.filter(item => item.is_due || item.is_warning);
        if (neededItems.length === 0) return null;
        return (
        <>
          <SectionLabel label="Maintenance needed" />
          <View style={styles.maintenanceList}>
            {neededItems.slice(0, 5).map(item => {
              const tone = item.is_due
                ? colors.error
                : colors.warning;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    Alert.alert(
                      item.maintenance_type_name,
                      item.is_due
                        ? `This task is overdue. Mark as completed?`
                        : `This task is due soon (${item.interval_type === 'days' ? `${item.days_until_due ?? 0} days left` : `${Math.round(item.hours_until_due)}h left`}). Mark as completed?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Mark complete',
                          onPress: () => {
                            api.performMaintenance(item.id).then(() => {
                              queryClient.invalidateQueries({ queryKey: ['maintenanceTasks'] });
                              showToast(`${item.maintenance_type_name} marked complete`, 'success');
                            }).catch(err => {
                              showToast(getErrorMessage(err, 'Could not complete task'), 'error');
                            });
                          },
                        },
                      ],
                    );
                  }}
                  style={[
                    styles.maintenanceItem,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={[styles.maintenanceDot, { backgroundColor: tone }]} />
                  <View style={styles.maintenanceText}>
                    <Text style={[styles.maintenanceTitle, { color: colors.text }]}> 
                      {item.maintenance_type_name}
                    </Text>
                    <Text style={[styles.maintenanceSubtitle, { color: colors.textSecondary }]}> 
                      {item.is_due
                        ? 'Overdue'
                        : item.interval_type === 'days'
                          ? `${item.days_until_due ?? 0} day${(item.days_until_due ?? 0) === 1 ? '' : 's'} left`
                          : `${Math.round(item.hours_until_due)}h left`}
                    </Text>
                  </View>
                  <CheckCircle size={16} color={colors.textTertiary} strokeWidth={1.5} />
                </Pressable>
              );
            })}
          </View>
        </>
        );
      })() : null}
      </>
      )}

      <View style={styles.footerRow}>
        <View style={styles.footerLeft}>
          <Pressable
            onPress={showMoreMenu}
            style={[
              styles.iconButton,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
              },
            ]}
          >
            <MoreVertical size={18} color={colors.text} strokeWidth={2} />
          </Pressable>
        </View>
        <View style={styles.footerRight}>
          <Pressable
            onPress={onCameraPress}
            disabled={!canCamera}
            style={[
              styles.iconButton,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
              },
              !canCamera && styles.disabledAction,
            ]}
          >
            <Camera size={16} color={colors.text} strokeWidth={2} />
          </Pressable>
          <Pressable
            onPress={onPrintPress}
            disabled={!canBrowse}
            style={[
              styles.iconButton,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
              },
              !canBrowse && styles.disabledAction,
            ]}
          >
            <FolderOpen size={16} color={colors.text} strokeWidth={2} />
          </Pressable>
          <Pressable
            onPress={onPrintPress}
            disabled={!canBrowse}
            style={[
              styles.footerPrintButton,
              {
                backgroundColor: PRINT_GREEN,
                borderColor: PRINT_GREEN,
              },
              !canBrowse && styles.disabledAction,
            ]}
          >
            <Play size={14} color={colors.textInverse} strokeWidth={2} />
            <Text style={[styles.footerPrintText, { color: colors.textInverse }]}>Print</Text>
          </Pressable>
        </View>
      </View>

      <MoveControlsModal
        visible={moveModalVisible}
        printerId={printer.id}
        printerName={printer.name}
        isPrinting={isPrinting}
        onClose={() => setMoveModalVisible(false)}
      />

      <HMSErrorModal
        visible={showHmsModal}
        printerId={printer.id}
        printerName={printer.name}
        errors={hmsErrors}
        onClose={() => setShowHmsModal(false)}
      />

      <TrayDetailModal
        visible={selectedTray != null}
        printerId={printer.id}
        tray={selectedTray?.tray ?? null}
        context={selectedTray?.context ?? null}
        isPrinting={isPrinting}
        onClose={() => setSelectedTray(null)}
      />

      <SkipObjectsModal
        visible={skipObjectsVisible}
        printerId={printer.id}
        onClose={() => setSkipObjectsVisible(false)}
      />

      <EditPrinterModal
        visible={editModalVisible}
        printer={editModalVisible ? printer : null}
        onClose={() => setEditModalVisible(false)}
      />

      <ActionSheetModal
        visible={calibrateSheetVisible}
        title="Calibration"
        subtitle="Choose a printer homing action."
        onClose={() => setCalibrateSheetVisible(false)}
        actions={[
          {
            label: 'Auto-level bed',
            icon: <RotateCcw size={18} color={colors.text} strokeWidth={2} />,
            onPress: () => {
              setCalibrateSheetVisible(false);
              calibrateMutation.mutate('z');
            },
            disabled: !canControlPrinter || calibrateMutation.isPending,
            loading: calibrateMutation.isPending,
          },
          {
            label: 'Home all axes',
            icon: <Move size={18} color={colors.text} strokeWidth={2} />,
            onPress: () => {
              setCalibrateSheetVisible(false);
              calibrateMutation.mutate('all');
            },
            disabled: !canControlPrinter || calibrateMutation.isPending,
            loading: calibrateMutation.isPending,
          },
          {
            label: 'Home XY',
            icon: <Move size={18} color={colors.text} strokeWidth={2} />,
            onPress: () => {
              setCalibrateSheetVisible(false);
              calibrateMutation.mutate('xy');
            },
            disabled: !canControlPrinter || calibrateMutation.isPending,
            loading: calibrateMutation.isPending,
          },
        ]}
      />

      <ActionSheetModal
        visible={moreSheetVisible}
        title={printer.name}
        subtitle={printer.model || 'Printer options'}
        onClose={() => setMoreSheetVisible(false)}
        actions={[
          {
            label: 'Edit',
            icon: <Pencil size={18} color={colors.text} strokeWidth={2} />,
            onPress: () => {
              setMoreSheetVisible(false);
              setEditModalVisible(true);
            },
            disabled: !canEditPrinter,
          },
          {
            label:
              printer.is_active === false
                ? 'Disable maintenance mode'
                : 'Enable maintenance mode',
            icon: <Wrench size={18} color={colors.text} strokeWidth={2} />,
            onPress: () => {
              setMoreSheetVisible(false);
              handleToggleMaintenance();
            },
            disabled: !canEditPrinter || maintenanceMutation.isPending,
            loading: maintenanceMutation.isPending,
          },
          {
            label: 'Delete',
            icon: <Trash2 size={18} color={colors.error} strokeWidth={2} />,
            onPress: () => {
              setMoreSheetVisible(false);
              handleDeletePrinter();
            },
            destructive: true,
            disabled: !canDeletePrinter || deleteMutation.isPending,
            loading: deleteMutation.isPending,
          },
        ]}
      />
      {selectionMode ? (
        <>
          <Pressable
            onPress={onToggleSelect}
            onLongPress={onLongPress}
            style={styles.selectionCover}
          />
          <View
            style={[
              styles.selectionBadge,
              {
                backgroundColor: selected ? colors.accent : colors.overlay,
                borderColor: selected ? colors.accent : colors.border,
              },
            ]}
          >
            {selected ? (
              <CheckCircle size={16} color={colors.textInverse} strokeWidth={2} />
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    gap: spacing.md,
  },
  selectionCover: {
    ...StyleSheet.absoluteFill,
    borderRadius: borderRadius.xl,
  },
  selectionBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 24,
    height: 24,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  titleArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  printerImageWrap: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  printerImage: {
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.lg,
  },
  titleText: {
    flex: 1,
    gap: 2,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  connectionDot: {
    width: 10,
    height: 10,
    borderRadius: borderRadius.full,
  },
  meta: {
    fontSize: fontSize.sm,
  },
  badgesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  infoPillText: {
    fontSize: 10,
    fontWeight: fontWeight.semibold,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    fontWeight: fontWeight.semibold,
  },
  sectionDivider: {
    flex: 1,
    height: 2,
    borderRadius: borderRadius.full,
  },
  statusRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  previewFrame: {
    width: 108,
    height: 108,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  previewOverlayText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  previewPlaceholder: {
    width: 108,
    height: 108,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  previewPlaceholderText: {
    fontSize: fontSize.xs,
    textAlign: 'center',
  },
  statusContent: {
    flex: 1,
    gap: spacing.sm,
  },
  statusTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  stateText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  refreshText: {
    fontSize: fontSize.xs,
  },
  printName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
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
  progressMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  progressText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  progressMeta: {
    fontSize: fontSize.sm,
  },
  timelineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  timelineItem: {
    fontSize: fontSize.xs,
  },
  userText: {
    fontSize: fontSize.xs,
  },
  controlsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  controlActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  controlButton: {
    minHeight: 38,
    minWidth: 96,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  controlIconButton: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonOutline: {
    backgroundColor: 'transparent',
  },
  controlButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricCard: {
    width: '31%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  metricLabel: {
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricDot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
  },
  metricValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  metricHelper: {
    fontSize: fontSize.xs,
  },
  amsList: {
    gap: spacing.sm,
  },
  amsCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  amsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  amsHeaderText: {
    flex: 1,
    gap: 2,
  },
  amsTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  amsSubtitle: {
    fontSize: fontSize.xs,
  },
  amsIndicators: {
    alignItems: 'flex-end',
    gap: 2,
  },
  amsIndicatorText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  trayGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  trayPressable: {
    flex: 1,
    minWidth: 0,
  },
  trayCard: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    gap: 4,
  },
  trayCardCompact: {
    maxWidth: 140,
  },
  trayTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  trayColorCircle: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trayColorText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  activeDot: {
    width: 10,
    height: 10,
    borderRadius: borderRadius.full,
    marginTop: 2,
  },
  trayLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  traySubtitle: {
    fontSize: 10,
  },
  fillTrack: {
    height: 6,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  fillBar: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  trayFillText: {
    fontSize: fontSize.xs,
  },
  rackRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rackSlot: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rackSlotText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  nozzleMetaList: {
    gap: spacing.xs,
  },
  nozzleMetaText: {
    fontSize: fontSize.xs,
  },
  hmsList: {
    gap: spacing.sm,
  },
  hmsItem: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hmsSeverity: {
    width: 8,
    height: 36,
    borderRadius: borderRadius.full,
  },
  hmsText: {
    flex: 1,
    gap: 2,
  },
  hmsTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  hmsSubtitle: {
    fontSize: fontSize.xs,
  },
  maintenanceList: {
    gap: spacing.sm,
  },
  maintenanceItem: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  maintenanceDot: {
    width: 8,
    height: 32,
    borderRadius: borderRadius.full,
  },
  maintenanceText: {
    flex: 1,
    gap: 2,
  },
  maintenanceTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  maintenanceSubtitle: {
    fontSize: fontSize.xs,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  footerRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerPrintButton: {
    minHeight: 38,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  footerPrintText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  actionSheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  actionSheetCard: {
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  actionSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  actionSheetTitleWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  actionSheetTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
  },
  actionSheetSubtitle: {
    fontSize: fontSize.sm,
  },
  actionSheetClose: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSheetActions: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  actionSheetRow: {
    minHeight: 52,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  actionSheetRowIcon: {
    width: 20,
    alignItems: 'center',
  },
  actionSheetRowLabel: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  disabledAction: {
    opacity: 0.45,
  },
});
