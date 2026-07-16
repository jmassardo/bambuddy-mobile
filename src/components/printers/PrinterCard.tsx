import React, { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Icon } from '@/components/common/TabBarIcon';
import { StatusBadge } from '@/components/common/AppUI';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import {
  borderRadius,
  fontSize,
  fontWeight,
  spacing,
} from '@/theme/tokens';
import type {
  AMSUnit,
  AMSTray,
  HMSError,
  MaintenanceStatus,
  NozzleRackSlot,
  Printer,
  PrinterStatus,
} from '@/types/api';
import { formatDuration, statusColor, withCacheBuster } from '@/utils/data';

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

interface MaintenanceSummary {
  dueCount: number;
  warningCount: number;
  items: MaintenanceStatus[];
}

interface PrinterCardProps {
  printer: Printer;
  status?: PrinterStatus;
  queueCount?: number;
  maintenance?: MaintenanceSummary;
  loading?: boolean;
  snapshotSeed?: number | string;
  onPress?: () => void;
  onCameraPress?: () => void;
  onQueuePress?: () => void;
  onMaintenancePress?: () => void;
  onPrintPress?: () => void;
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

function getTrayLabel(tray: AMSTray) {
  return tray.tray_sub_brands || tray.tray_type || 'Empty';
}

function getTrayFill(tray: AMSTray) {
  if (!tray.tray_type || tray.remain < 0) return null;
  return clamp(tray.remain);
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
  const type = slot.nozzle_type
    ? slot.nozzle_type.replace(/_/g, ' ')
    : '';
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
  icon?: string;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const content = (
    <View
      style={[
        styles.infoPill,
        { backgroundColor: `${color}22`, borderColor: `${color}55` },
      ]}
    >
      {icon ? <Icon name={icon} size={14} color={color} /> : null}
      <Text style={[styles.infoPillText, { color: label ? color : colors.text }]}>
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
  fill,
  colorHex,
  active,
  helper,
}: {
  label: string;
  fill: number | null;
  colorHex: string | null | undefined;
  active: boolean;
  helper: string;
}) {
  const { colors } = useTheme();
  const color = parseFilamentColor(colorHex);
  const lightColor = isLightColor(colorHex);

  return (
    <View
      style={[
        styles.trayCard,
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
          <Text
            style={[
              styles.trayColorText,
              { color: color && lightColor ? colors.textInverse : colors.text },
            ]}
          >
            {helper}
          </Text>
        </View>
        {active ? (
          <View style={[styles.activeDot, { backgroundColor: colors.accent }]} />
        ) : null}
      </View>
      <Text style={[styles.trayLabel, { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
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
                  color:
                    color && lightColor ? colors.textInverse : colors.text,
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

export function PrinterCard({
  printer,
  status,
  queueCount = 0,
  maintenance,
  loading = false,
  snapshotSeed = 0,
  onPress,
  onCameraPress,
  onQueuePress,
  onMaintenancePress,
  onPrintPress,
}: PrinterCardProps) {
  const { colors } = useTheme();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const isConnected = status?.connected ?? false;
  const isPrinting = status?.state === 'RUNNING' || status?.state === 'PAUSE';
  const isPaused = status?.state === 'PAUSE';
  const hmsErrors = status?.hms_errors ?? [];
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
  const cameraUri = useMemo(() => {
    if (!canCamera) return null;
    return withCacheBuster(api.getCameraSnapshotUrl(printer.id), snapshotSeed);
  }, [canCamera, printer.id, snapshotSeed]);

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
      await queryClient.invalidateQueries({ queryKey: ['printerStatus', printer.id] });
      await queryClient.invalidateQueries({ queryKey: ['queue'] });
      showToast(`Printer ${action} command sent.`, 'success');
    },
    onError: () => showToast('Printer command failed.', 'error'),
  });

  const clearPlateMutation = useMutation({
    mutationFn: () => api.clearPlate(printer.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['printerStatus', printer.id] });
      showToast('Plate marked as cleared.', 'success');
    },
    onError: () => showToast('Could not update plate status.', 'error'),
  });

  const canClearPlate =
    Boolean(status?.awaiting_plate_clear) &&
    !isPrinting &&
    hasPermission('printers:clear_plate');
  const canControlPrint =
    isPrinting &&
    !actionMutation.isPending &&
    hasPermission('printers:control');

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
      {cameraUri ? (
        <Image source={{ uri: cameraUri }} style={styles.previewImage} />
      ) : null}
      <View style={[styles.previewOverlay, { backgroundColor: colors.overlay }]}>
        <Icon name="camera" size={16} color={colors.text} />
        <Text style={[styles.previewOverlayText, { color: colors.text }]}> 
          Live view
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
      <Icon name="camera" size={22} color={colors.textTertiary} />
      <Text style={[styles.previewPlaceholderText, { color: colors.textSecondary }]}>
        Camera unavailable
      </Text>
    </View>
  );

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.cardBorder },
      ]}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={onPress} style={styles.titleArea}>
          <View style={[styles.printerIconWrap, { backgroundColor: colors.accentBg }]}>
            <Icon name="printer" size={18} color={colors.accentLight} />
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
          label={printer.is_active === false ? 'Maintenance mode' : isConnected ? 'Online' : 'Offline'}
          color={printer.is_active === false ? colors.warning : isConnected ? colors.success : colors.error}
          icon={isConnected ? 'link' : 'wifi-off'}
        />
        {isConnected ? (
          status?.wired_network ? (
            <InfoPill label="LAN" color={colors.success} icon="link" />
          ) : status?.wifi_signal != null ? (
            <InfoPill
              label={`${status.wifi_signal} dBm`}
              color={getWifiTone(status.wifi_signal, colors)}
              icon="wifi"
            />
          ) : null
        ) : null}
        {hmsErrors.length ? (
          <InfoPill
            label={`${hmsErrors.length} HMS`}
            color={getSeverityColor(hmsErrors, colors)}
            icon="alert-circle"
          />
        ) : (
          <InfoPill label="HMS OK" color={colors.success} icon="check-circle" />
        )}
        {queueCount > 0 ? (
          <InfoPill
            label={`${queueCount} queued`}
            color={colors.info}
            icon="layers"
            onPress={onQueuePress}
          />
        ) : null}
        {maintenanceCount > 0 ? (
          <InfoPill
            label={`${maintenanceCount} maintenance`}
            color={maintenance?.dueCount ? colors.error : colors.warning}
            icon="wrench"
            onPress={onMaintenancePress}
          />
        ) : (
          <InfoPill label="Maintenance OK" color={colors.success} icon="wrench" />
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
              <Text style={[styles.refreshText, { color: colors.textTertiary }]}> 
                Refreshing…
              </Text>
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
            {(status?.ams ?? []).map(ams => (
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
                        🌡 {ams.temp}°C
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
                        💧 {ams.humidity}%
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
                        fill={getTrayFill(tray)}
                        colorHex={tray.tray_color}
                        active={active}
                        helper={String(index + 1)}
                      />
                    );
                  })}
                </View>
              </View>
            ))}

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
                        label={getTrayStateLabel(tray)}
                        fill={getTrayFill(tray)}
                        colorHex={tray.tray_color}
                        active={active}
                        helper={helper}
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

      {(maintenance?.items?.length ?? 0) > 0 ? (
        <>
          <SectionLabel label="Maintenance" />
          <View style={styles.maintenanceList}>
            {maintenance?.items.slice(0, 3).map(item => {
              const tone = item.is_due
                ? colors.error
                : item.is_warning
                  ? colors.warning
                  : colors.success;
              return (
                <View
                  key={item.id}
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
                      {item.interval_type === 'days'
                        ? `${item.days_until_due ?? 0} day${(item.days_until_due ?? 0) === 1 ? '' : 's'} left`
                        : `${Math.round(item.hours_until_due)}h left`}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      <View style={styles.footerRow}>
        <View style={styles.footerLeft}>
          {status?.awaiting_plate_clear && !isPrinting ? (
            <Pressable
              onPress={() => {
                clearPlateMutation.mutate();
              }}
              disabled={!canClearPlate || clearPlateMutation.isPending}
              style={[
                styles.actionButton,
                {
                  backgroundColor: colors.warning,
                  borderColor: colors.warning,
                },
                (!canClearPlate || clearPlateMutation.isPending) && styles.disabledAction,
              ]}
            >
              <Text style={[styles.actionButtonText, { color: colors.textInverse }]}> 
                Clear plate
              </Text>
            </Pressable>
          ) : null}
          {onPrintPress ? (
            <Pressable
              onPress={onPrintPress}
              style={[
                styles.actionButton,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
              ]}
            >
              <Icon name="printer" size={14} color={colors.text} />
              <Text style={[styles.actionButtonText, { color: colors.text }]}>Print</Text>
            </Pressable>
          ) : null}
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
            <Icon name="camera" size={16} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => {
              actionMutation.mutate(isPaused ? 'resume' : 'pause');
            }}
            disabled={!canControlPrint}
            style={[
              styles.actionButton,
              {
                backgroundColor: isPaused ? colors.success : colors.warning,
                borderColor: isPaused ? colors.success : colors.warning,
              },
              !canControlPrint && styles.disabledAction,
            ]}
          >
            <Icon
              name={isPaused ? 'play' : 'pause'}
              size={14}
              color={colors.textInverse}
            />
            <Text style={[styles.actionButtonText, { color: colors.textInverse }]}> 
              {isPaused ? 'Resume' : 'Pause'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              actionMutation.mutate('stop');
            }}
            disabled={!canControlPrint}
            style={[
              styles.actionButton,
              {
                backgroundColor: colors.error,
                borderColor: colors.error,
              },
              !canControlPrint && styles.disabledAction,
            ]}
          >
            <Icon name="stop" size={14} color={colors.text} />
            <Text style={[styles.actionButtonText, { color: colors.text }]}>Stop</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  titleArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  printerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: {
    flex: 1,
    gap: spacing.xs,
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
    gap: spacing.sm,
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  infoPillText: {
    fontSize: fontSize.xs,
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
    width: 116,
    height: 116,
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
    width: 116,
    height: 116,
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
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricCard: {
    minWidth: '31%',
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
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  trayCard: {
    width: '23%',
    minWidth: 72,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    gap: spacing.xs,
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
    fontWeight: fontWeight.medium,
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
    flexWrap: 'wrap',
    gap: spacing.sm,
    flex: 1,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: spacing.sm,
    flex: 1,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButton: {
    minHeight: 38,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  actionButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  disabledAction: {
    opacity: 0.45,
  },
});
