import { NativeTranslation, translateNative, useNativeLocale, useTranslation } from '@/i18n';
import React, { useCallback, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  CheckCircle,
  Clock3,
  GripVertical,
  Layers,
  Pause,
  Play,
  Printer,
  RefreshCw,
  Square,
  Tag,
  Trash2,
  X,
} from 'lucide-react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { withStreamToken } from '@/api/client';
import { useServerStore } from '@/api/server';
import { useMediaToken } from '@/hooks/useStreamToken';
import { StatusBadge } from '@/components/common/AppUI';
import { useTheme } from '@/theme';
import {
  borderRadius,
  fontSize,
  fontWeight,
  spacing,
} from '@/theme/tokens';
import type { PrintQueueItem } from '@/types/api';
import {
  formatCurrency,
  formatDuration,
  formatWeight,
} from '@/utils/data';
import HapticFeedback from 'react-native-haptic-feedback';
import { calibration } from '@/utils/printLaunch';

const HAPTIC_OPTIONS = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

type QueueActionIconName = 'play' | 'printer' | 'x' | 'trash' | 'pause' | 'stop' | 'refresh';

const QUEUE_ACTION_ICONS = {
  play: Play,
  printer: Printer,
  x: X,
  trash: Trash2,
  pause: Pause,
  stop: Square,
  refresh: RefreshCw,
} satisfies Record<QueueActionIconName, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>>;

interface QueueItemCardProps {
  item: PrintQueueItem;
  printerState?: string | null;
  selected?: boolean;
  showSelection?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onToggleSelect?: () => void;
  onStart?: () => void;
  onCancel?: () => void;
  onPause?: () => void;
  onStop?: () => void;
  onDelete?: () => void;
  onRetry?: () => void;
  onReassign?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onReorder?: (direction: 'up' | 'down') => void;
  onDragStart?: (index: number) => void;
  onDragMove?: (index: number, targetIndex: number) => void;
  onDragEnd?: () => void;
  index?: number | null;
  isDragging?: boolean;
  dragIndex?: number;
  dragTargetIndex?: number;
  dragEnabled?: boolean;
}

function statusPresentation(
  item: PrintQueueItem,
  printerState: string | null | undefined,
  colors: ReturnType<typeof useTheme>['colors'],
) {
  if (item.status === 'pending' && item.waiting_reason) {
    return { get label() { return translateNative('native.62363493900507d9'); }, color: colors.highlight };
  }
  if (item.status === 'printing' && printerState === 'PAUSE') {
    return { get label() { return translateNative('native.2e8d3baadb9cc3fd'); }, color: colors.statusPaused };
  }

  switch (item.status) {
    case 'pending':
      return { get label() { return translateNative('native.f57578b016dacb32'); }, color: colors.warning };
    case 'printing':
      return { get label() { return translateNative('native.58b5ceab5adaa853'); }, color: colors.statusPrinting };
    case 'completed':
      return { get label() { return translateNative('native.e8d25c3ab5a7be5d'); }, color: colors.success };
    case 'failed':
      return { get label() { return translateNative('native.4951b5090ada997d'); }, color: colors.error };
    case 'skipped':
      return { get label() { return translateNative('native.23a65d62ff0a8c05'); }, color: colors.warning };
    case 'cancelled':
      return { get label() { return translateNative('native.827f4f3e696f5356'); }, color: colors.textTertiary };
    default:
      return { label: item.status, color: colors.info };
  }
}

function QueueActionButton({
  label,
  icon,
  onPress,
  color,
  subtle = false,
}: {
  label: string;
  icon?: QueueActionIconName;
  onPress?: () => void;
  color: string;
  subtle?: boolean;
}) {
  useNativeLocale();
  const { t } = useTranslation();
  if (!onPress) return null;
  const IconComponent = icon ? QUEUE_ACTION_ICONS[icon] : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        {
          backgroundColor: subtle ? `${color}18` : `${color}22`,
          borderColor: `${color}55`,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      {IconComponent ? <IconComponent size={14} color={color} strokeWidth={2} /> : null}
      <Text style={[styles.actionText, { color }]}>{t(`queue.${label.replace(/\W/g, '')}`, { defaultValue: label })}</Text>
    </Pressable>
  );
}

function OptionChip({
  label,
  color,
}: {
  label: string;
  color: string;
}) {
  useNativeLocale();
  const { t } = useTranslation();
  return (
    <View
      style={[
        styles.optionChip,
        { backgroundColor: `${color}18`, borderColor: `${color}55` },
      ]}
    >
      <Text style={[styles.optionChipText, { color }]}>{t(`queue.${label.replace(/\W/g, '')}`, { defaultValue: label })}</Text>
    </View>
  );
}

interface QueueItemCardContentProps {
  cardStyle?: StyleProp<ViewStyle>;
  dragHandle?: React.ReactNode;
  item: PrintQueueItem;
  printerState?: string | null;
  selected?: boolean;
  showSelection?: boolean;
  _onPress?: () => void;
  _onLongPress?: () => void;
  onToggleSelect?: () => void;
  onStart?: () => void;
  onCancel?: () => void;
  onPause?: () => void;
  onStop?: () => void;
  onDelete?: () => void;
  onRetry?: () => void;
  onReassign?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  _onDragStart?: (index: number) => void;
  _onDragMove?: (index: number, targetIndex: number) => void;
  _onDragEnd?: () => void;
  _isDragging?: boolean;
  _dragIndex?: number;
  dragTargetIndex?: number;
  dragEnabled?: boolean;
}

export function QueueItemCardContent({
  cardStyle,
  dragHandle,
  item,
  printerState,
  selected = false,
  showSelection = false,
  _onPress,
  _onLongPress,
  onToggleSelect,
  onStart,
  onCancel,
  onPause,
  onStop,
  onDelete,
  onRetry,
  onReassign,
  onMoveUp,
  onMoveDown,
  _onDragStart,
  _onDragMove,
  _onDragEnd,
  _isDragging,
  _dragIndex,
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  dragTargetIndex,
  dragEnabled = false,
}: QueueItemCardContentProps) {
  useNativeLocale();
  const { colors } = useTheme();
  const serverUrl = useServerStore(s => s.serverUrl);
  useMediaToken();

  const thumbnailUri = (() => {
    if (!serverUrl) return null;
    if (item.archive_id && !item.archive_deleted) {
      return item.plate_id != null
        ? withStreamToken(`${serverUrl}/api/v1/archives/${item.archive_id}/plate-thumbnail/${item.plate_id}`)
        : withStreamToken(`${serverUrl}/api/v1/archives/${item.archive_id}/thumbnail`);
    }
    if (item.library_file_id) {
      return item.plate_id != null
        ? withStreamToken(`${serverUrl}/api/v1/library/files/${item.library_file_id}/plate-thumbnail/${item.plate_id}`)
        : withStreamToken(`${serverUrl}/api/v1/library/files/${item.library_file_id}/thumbnail`);
    }
    return null;
  })();

  const [failedThumbnail, setFailedThumbnail] = useState<string | null>(null);

  const status = statusPresentation(item, printerState, colors);
  const title =
    item.archive_name ||
    item.library_file_name ||
    translateNative('native.77bba0849c238b47', { value0: String(item.id) });
  const printerLabel = item.target_model && !item.printer_id
    ? translateNative('native.215bf686c05d12c4', { value0: String(item.target_model), value1: String(item.target_location ? ` • ${item.target_location}` : '') })
    : item.printer_name || (item.printer_id ? translateNative('native.cce5106f9222d909', { value0: String(item.printer_id) }) : translateNative('native.424849cf8f869437'));

  const options = [
    item.manual_start ? { get label() { return translateNative('native.89d359ec067e3df2'); }, color: colors.highlight } : null,
    item.require_previous_success
      ? { get label() { return translateNative('native.d6f1b06d7f64e893'); }, color: colors.warning }
      : null,
    item.auto_off_after ? { get label() { return translateNative('native.5ae540a7e1150dcf'); }, color: colors.info } : null,
    item.gcode_injection ? { get label() { return translateNative('native.d57b223220f72ff4'); }, color: colors.accent } : null,
    calibration(item.bed_levelling) !== 'off' ? { get label() { return translateNative('native.ce069d1c6bfa45b5', { value0: String(calibration(item.bed_levelling)) }); }, color: colors.accent } : null,
    calibration(item.flow_cali) !== 'off' ? { get label() { return translateNative('native.19e17bfd05f0e426', { value0: String(calibration(item.flow_cali)) }); }, color: colors.accent } : null,
    item.vibration_cali ? { get label() { return translateNative('native.b100a4275c30ba04'); }, color: colors.accent } : null,
    item.layer_inspect ? { get label() { return translateNative('native.a64647dc5b62466d'); }, color: colors.accent } : null,
    item.timelapse ? { get label() { return translateNative('native.190a6a4c52455a67'); }, color: colors.accent } : null,
    item.use_ams ? { label: 'AMS', color: colors.accent } : null,
    calibration(item.nozzle_offset_cali) !== 'off' ? { get label() { return translateNative('native.0962dfa2aa4691b3', { value0: String(calibration(item.nozzle_offset_cali)) }); }, color: colors.accent } : null,
    item.confirm_outcome ? { get label() { return translateNative('native.6beafac4854e37c0'); }, color: colors.info } : null,
    item.preheat_override && item.preheat_override !== 'inherit'
      ? {
          label:
            item.preheat_override === 'on'
              ? translateNative('native.46630b1daa03bd46')
              : translateNative('native.d99b016d5e28d4a7'),
          color: colors.warning,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; color: string }>;

  const progressBar = item.status === 'printing';
  const approximateProgress = item.started_at && item.print_time_seconds
    ? Math.min(
        100,
        Math.max(
          4,
          ((Date.now() - new Date(item.started_at).getTime()) /
            (item.print_time_seconds * 1000)) *
            100,
        ),
      )
    : 0;
  const hasPendingActions = !!onStart || !!onReassign || !!onCancel || !!onDelete;
  const hasPrintingActions = !!onPause || !!onStop;
  const hasHistoryActions = !!onRetry || !!onDelete;
  const hasReorderActions = !!onMoveUp || !!onMoveDown || dragEnabled;
  const shouldShowFooter = hasPendingActions || hasPrintingActions || hasHistoryActions || hasReorderActions;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: selected ? colors.accentBg : colors.card,
          borderColor: selected ? colors.accent : colors.cardBorder,
        },
        cardStyle,
      ]}
    >
      <View style={styles.headerRow}>
        {dragEnabled ? dragHandle : null}
        {showSelection ? (
          <Pressable
            onPress={onToggleSelect}
            accessibilityRole="checkbox"
            accessibilityLabel={title}
            accessibilityState={{ checked: selected }}
            hitSlop={8}
            style={[
              styles.selectBox,
              {
                backgroundColor: selected ? colors.accent : 'transparent',
                borderColor: selected ? colors.accent : colors.border,
              },
            ]}
          >
            {selected ? (
              <CheckCircle size={16} color={colors.textInverse} strokeWidth={2} />
            ) : null}
          </Pressable>
        ) : null}
        <View
          style={[
            styles.thumbnailWrap,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
          ]}
        >
          {thumbnailUri && failedThumbnail !== thumbnailUri ? (
            <Image
              source={{ uri: thumbnailUri }}
              style={styles.thumbnail}
              onError={() => setFailedThumbnail(thumbnailUri)}
            />
          ) : (
            <Layers size={20} color={colors.textTertiary} strokeWidth={2} />
          )}
        </View>
        <View style={styles.titleGroup}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
              {title}
            </Text>
            {item.batch_name ? (
              <View
                style={[
                  styles.batchBadge,
                  { backgroundColor: colors.infoBg, borderColor: `${colors.info}44` },
                ]}
              >
                <Text style={[styles.batchBadgeText, { color: colors.infoLight }]}>{translateNative('native.2e57cf859b6571e8')}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
            {printerLabel}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <StatusBadge label={status.label} color={status.color} />
          {item.position ? (
            <Text style={[styles.position, { color: colors.textTertiary }]}>#{item.position}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.metaGrid}>
        <View style={styles.metaItem}>
          <Printer size={14} color={colors.textTertiary} strokeWidth={2} />
          <Text style={[styles.metaLabel, { color: colors.textTertiary }]}>{translateNative('screen.printer')}</Text>
          <Text style={[styles.metaValue, { color: colors.text }]} numberOfLines={1}>
            {printerLabel}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Clock3 size={14} color={colors.textTertiary} strokeWidth={2} />
          <Text style={[styles.metaLabel, { color: colors.textTertiary }]}>{translateNative('native.ba2693c5402aa290')}</Text>
          <Text style={[styles.metaValue, { color: colors.text }]}>
            {formatDuration(item.print_time_seconds)}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Tag size={14} color={colors.textTertiary} strokeWidth={2} />
          <Text style={[styles.metaLabel, { color: colors.textTertiary }]}>{translateNative('native.12e2b8020ce55e27')}</Text>
          <View style={styles.filamentRow}>
            {item.filament_color ? (
              <View
                style={[
                  styles.colorDot,
                  {
                    backgroundColor: item.filament_color,
                    borderColor: colors.border,
                  },
                ]}
              />
            ) : null}
            <Text style={[styles.metaValue, { color: colors.text }]} numberOfLines={1}>
              {item.filament_type || translateNative('native.ff12a040d13addb7')}
            </Text>
          </View>
        </View>
      </View>

      {progressBar ? (
        <View style={styles.progressSection}>
          <View
            style={[
              styles.progressTrack,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
            ]}
          >
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.statusPrinting,
                  width: `${approximateProgress}%`,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: colors.statusPrinting }]}>
            {Math.round(approximateProgress)}%
          </Text>
        </View>
      ) : null}

      {item.waiting_reason ? (
        <Text style={[styles.notice, { color: colors.highlightLight }]}>{item.waiting_reason}</Text>
      ) : null}
      {item.filament_short ? (
        <Text style={[styles.notice, { color: colors.warning }]}>{translateNative('native.f582eebe084da79a')}</Text>
      ) : null}
      {item.error_message ? (
        <Text style={[styles.notice, { color: colors.error }]}>{item.error_message}</Text>
      ) : null}

      {options.length > 0 ? (
        <View style={styles.optionsRow}>
          {options.map(option => (
            <OptionChip key={option.label} label={option.label} color={option.color} />
          ))}
        </View>
      ) : null}

      {shouldShowFooter ? (
        <View style={[styles.footerRow, { borderColor: colors.borderSubtle }]}>
          {dragEnabled ? (
            <View style={styles.reorderRow}>
              <Text style={[styles.reorderHint, { color: colors.textTertiary }]}>{translateNative('native.9c9c06a286b3d5e3')}</Text>
            </View>
          ) : null}
          {hasReorderActions && !dragEnabled ? (
            <View style={styles.reorderRow}>
              <QueueActionButton
                label={translateNative('native.95917ebd829777ae')}
                onPress={onMoveUp}
                color={colors.textSecondary}
                subtle
              />
              <QueueActionButton
                label={translateNative('native.1617a1aeda76f651')}
                onPress={onMoveDown}
                color={colors.textSecondary}
                subtle
              />
            </View>
          ) : null}
          <View style={styles.actionsRow}>
            {item.status === 'pending' ? (
              <>
                <QueueActionButton label={translateNative('common.start')} icon="play" onPress={onStart} color={colors.accent} />
                <QueueActionButton label={translateNative('common.edit')} icon="printer" onPress={onReassign} color={colors.info} />
                <QueueActionButton label={translateNative('common.cancel')} icon="x" onPress={onCancel} color={colors.warning} />
                <QueueActionButton label={translateNative('common.delete')} icon="trash" onPress={onDelete} color={colors.error} />
              </>
            ) : null}
            {item.status === 'printing' ? (
              <>
                <QueueActionButton label={translateNative('native.362b1658df45e7f1')} icon="pause" onPress={onPause} color={colors.warning} />
                <QueueActionButton label={translateNative('common.stop')} icon="stop" onPress={onStop} color={colors.error} />
              </>
            ) : null}
            {['completed', 'failed', 'skipped', 'cancelled'].includes(item.status) ? (
              <>
                <QueueActionButton label={translateNative('native.85ed8d3e341d9bea')} icon="refresh" onPress={onRetry} color={colors.accent} />
                <QueueActionButton label={translateNative('common.delete')} icon="trash" onPress={onDelete} color={colors.error} />
              </>
            ) : null}
          </View>
        </View>
      ) : null}

      {(item.print_time_seconds || item.filament_used_grams) && item.status !== 'pending' ? (
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
            {formatDuration(item.print_time_seconds)}
          </Text>
          <Text style={[styles.summaryDivider, { color: colors.textTertiary }]}>•</Text>
          <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
            {formatWeight(item.filament_used_grams)}
          </Text>
          {item.preheat_chamber_target_override != null ? (
            <>
              <Text style={[styles.summaryDivider, { color: colors.textTertiary }]}>•</Text>
              <Text style={[styles.summaryText, { color: colors.textSecondary }]}><NativeTranslation id="native.70ebe0ee91b8ee5d" values={{ value0: (item.preheat_chamber_target_override) }} /></Text>
            </>
          ) : null}
          {item.archive_id ? (
            <>
              <Text style={[styles.summaryDivider, { color: colors.textTertiary }]}>•</Text>
              <Text style={[styles.summaryText, { color: colors.textSecondary }]}><NativeTranslation id="native.44f949b4bc07a152" values={{ value0: (item.archive_id) }} /></Text>
            </>
          ) : null}
        </View>
      ) : null}

      {item.estimated_cost != null ? (
        <Text style={[styles.costHint, { color: colors.textTertiary }]}><NativeTranslation id="native.96a19bdd05536717" values={{ value0: (formatCurrency(item.estimated_cost)) }} /></Text>
      ) : null}
    </View>
  );
}

export function QueueItemCard({
  item,
  printerState,
  selected = false,
  showSelection = false,
  onPress,
  onLongPress,
  onToggleSelect,
  onStart,
  onCancel,
  onPause,
  onStop,
  onDelete,
  onRetry,
  onReassign,
  onMoveUp,
  onMoveDown,
  onReorder,
  onDragStart,
  onDragMove,
  onDragEnd,
  index,
  isDragging: parentIsDragging = false,
  dragIndex,
  dragTargetIndex,
  dragEnabled = false,
}: QueueItemCardProps) {
  useNativeLocale();
  const { colors } = useTheme();
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const isDragging = useSharedValue(false);
  const animationRef = useRef<{ animate: () => void } | null>(null);
  const activeIndex = useRef<number | null>(null);

  const handleLongPress = useCallback(() => {
    if (onLongPress) {
      onLongPress();
    }
  }, [onLongPress]);

  const resetAnimation = useCallback(() => {
    translateY.value = withSpring(0);
    scale.value = withSpring(1);
    opacity.value = withTiming(0.6, { duration: 150 });
    isDragging.value = false;

    animationRef.current = {
      animate() {
        opacity.value = withTiming(1, { duration: 150 });
      },
    };
  }, [translateY, scale, opacity, isDragging]);

  const handleReorder = useCallback((direction: 'up' | 'down') => {
    if (onReorder) {
      onReorder(direction);
    } else if (direction === 'up') {
      onMoveUp?.();
    } else {
      onMoveDown?.();
    }
  }, [onReorder, onMoveUp, onMoveDown]);

  const handleDragStart = useCallback((currentIndex: number) => {
    activeIndex.current = currentIndex;
    HapticFeedback.trigger('impactMedium', HAPTIC_OPTIONS);
    onDragStart?.(currentIndex);
  }, [onDragStart]);

  const handleDragMove = useCallback((sourceIndex: number, targetIndex: number) => {
    onDragMove?.(sourceIndex, targetIndex);
  }, [onDragMove]);

  const resolvedIndex = index ?? -1;

  const handleDragEnd = useCallback(() => {
    const currentIdx = activeIndex.current;
    activeIndex.current = null;
    onDragEnd?.();
    if (currentIdx !== null && dragTargetIndex !== undefined && dragTargetIndex !== currentIdx) {
      const direction: 'up' | 'down' = dragTargetIndex < currentIdx ? 'up' : 'down';
      handleReorder(direction);
    }
  }, [onDragEnd, dragTargetIndex, handleReorder]);

  const panGesture = Gesture
    .Pan()
    .minDistance(0)
    .onStart(() => {
      'worklet';
      cancelAnimation(translateY);
      cancelAnimation(scale);
      cancelAnimation(opacity);
      isDragging.value = true;
      runOnJS(handleDragStart)(resolvedIndex);
    })
    .onUpdate(event => {
      'worklet';
      translateY.value = event.translationY;
      const absDelta = Math.abs(event.translationY);
      scale.value = 1 - Math.min(absDelta / 200, 0.08);
      opacity.value = 1 - Math.min(absDelta / 300, 0.3);
      if (absDelta > 20) {
        const direction = event.translationY < 0 ? 'up' : 'down';
        const targetIdx = resolvedIndex + (direction === 'up' ? -1 : 1);
        if (targetIdx >= 0) {
          runOnJS(handleDragMove)(resolvedIndex, targetIdx);
        }
      }
    })
    .onEnd(() => {
      'worklet';
      runOnJS(resetAnimation)();
      runOnJS(handleDragEnd)();
    });

  const animatedStyle = useAnimatedStyle(() => {
    const isActiveDrag = isDragging.value || (parentIsDragging && resolvedIndex === dragIndex);
    const isTargetDrag = resolvedIndex === dragTargetIndex && parentIsDragging;
    let targetScale = 1;
    let targetOpacity = 1;
    let targetTranslateY = translateY.value;

    if (isActiveDrag) {
      targetScale = scale.value;
      targetOpacity = opacity.value;
      targetTranslateY = translateY.value;
    } else if (isTargetDrag) {
      targetScale = 1.03;
      targetOpacity = 0.85;
    } else {
      targetScale = withSpring(1);
    }

    return {
      transform: [
        { translateY: targetTranslateY },
        { scale: targetScale },
      ],
      opacity: targetOpacity,
    };
  });

  const isActiveDrag = parentIsDragging && resolvedIndex === dragIndex;
  const isAdjacentToTarget = resolvedIndex === dragTargetIndex && parentIsDragging;

  if (!dragEnabled) {
    return (
      <QueueItemCardContent
        item={item}
        printerState={printerState}
        selected={selected}
        showSelection={showSelection}
        _onPress={onPress}
        _onLongPress={onLongPress}
        onToggleSelect={onToggleSelect}
        onStart={onStart}
        onCancel={onCancel}
        onPause={onPause}
        onStop={onStop}
        onDelete={onDelete}
        onRetry={onRetry}
        onReassign={onReassign}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        _onDragStart={onDragStart}
        _onDragMove={onDragMove}
        _onDragEnd={onDragEnd}
        _isDragging={parentIsDragging}
        _dragIndex={dragIndex}
        dragTargetIndex={dragTargetIndex}
        dragEnabled={false}
      />
    );
  }

  return (
    <Animated.View style={[animatedStyle]}>
      <Pressable
        onPress={onPress}
        onLongPress={handleLongPress}
        style={({ pressed }) => [
          {
            opacity: isActiveDrag ? opacity.value : pressed && !parentIsDragging ? 0.96 : parentIsDragging && isAdjacentToTarget ? 0.85 : 1,
            transform: isAdjacentToTarget && !isActiveDrag ? [{ scale: 1.03 }] : [],
          },
        ]}
      >
        <QueueItemCardContent
          dragHandle={
            <GestureDetector gesture={panGesture}>
              <View collapsable={false} testID="queue-drag-handle" style={styles.gripHandle}>
                <GripVertical size={16} color={colors.textTertiary} strokeWidth={2} />
              </View>
            </GestureDetector>
          }
          cardStyle={[
            isActiveDrag && { borderColor: colors.accent },
            isAdjacentToTarget && { borderColor: isActiveDrag ? colors.accent : colors.highlight, borderWidth: 2 },
          ]}
          item={item}
          printerState={printerState}
          selected={selected}
          showSelection={showSelection}
          onToggleSelect={onToggleSelect}
          onStart={onStart}
          onCancel={onCancel}
          onPause={onPause}
          onStop={onStop}
          onDelete={onDelete}
          onRetry={onRetry}
          onReassign={onReassign}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          _onDragStart={onDragStart}
          _onDragMove={onDragMove}
          _onDragEnd={onDragEnd}
          _isDragging={parentIsDragging}
          _dragIndex={dragIndex}
          dragTargetIndex={dragTargetIndex}
          dragEnabled
        />
      </Pressable>
    </Animated.View>
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
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  gripHandle: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  selectBox: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  thumbnailWrap: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  titleGroup: {
    flex: 1,
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  subtitle: {
    fontSize: fontSize.sm,
  },
  batchBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderRadius: borderRadius.full,
  },
  batchBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  position: {
    fontSize: fontSize.xs,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metaItem: {
    minWidth: '30%',
    flexGrow: 1,
    gap: 2,
  },
  metaLabel: {
    fontSize: fontSize.xs,
  },
  metaValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  filamentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  timelineStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
  },
  timelineText: {
    fontSize: fontSize.xs,
  },
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  progressText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    width: 38,
    textAlign: 'right',
  },
  notice: {
    fontSize: fontSize.sm,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  optionChip: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  optionChipText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  footerRow: {
    borderTopWidth: 1,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  reorderRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  reorderHint: {
    fontSize: fontSize.xs,
    fontStyle: 'italic',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  actionButton: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  summaryText: {
    fontSize: fontSize.xs,
  },
  summaryDivider: {
    fontSize: fontSize.xs,
  },
  costHint: {
    fontSize: fontSize.xs,
  },
});
