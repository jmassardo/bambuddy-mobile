import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CheckCircle, Clock3, Printer } from 'lucide-react-native';
import { useTheme } from '@/theme';
import {
  borderRadius,
  fontSize,
  fontWeight,
  spacing,
} from '@/theme/tokens';
import type { PrintQueueItem } from '@/types/api';
import { formatDuration, formatTime } from '@/utils/data';
import Animated from 'react-native-reanimated';

interface GanttTimelineProps {
  items: PrintQueueItem[];
  printers?: Array<{ id: number; name: string }>;
}

interface TimelineSlot {
  id: number;
  title: string;
  shortTitle: string;
  color: string;
  bgColor: string;
  progress: number;
  status: 'printing' | 'queued' | 'completed' | 'failed' | 'cancelled' | 'skipped';
  printerName: string;
  durationSeconds: number;
  estimatedStartTime?: string;
  startedAt?: string;
  completedAt?: string;
}

const TIMELINE_COLORS = [
  { bg: 'rgba(59, 130, 246, 0.15)', bar: '#3b82f6', light: '#93c5fd' },
  { bg: 'rgba(168, 85, 247, 0.15)', bar: '#a855f7', light: '#d8b4fe' },
  { bg: 'rgba(0, 174, 66, 0.15)', bar: '#00AE42', light: '#34d399' },
  { bg: 'rgba(245, 158, 11, 0.15)', bar: '#f59e0b', light: '#fbbf24' },
  { bg: 'rgba(239, 68, 68, 0.15)', bar: '#ef4444', light: '#fca5a5' },
  { bg: 'rgba(107, 114, 128, 0.15)', bar: '#6b7280', light: '#d1d5db' },
];

function getTimeBucket(dateMs: number, bucketMs: number): number {
  return Math.floor(dateMs / bucketMs) * bucketMs;
}

function buildTimelineSlots(
  items: PrintQueueItem[],
  now: number,
): {
  active: TimelineSlot[];
  queued: TimelineSlot[];
  finished: TimelineSlot[];
  byPrinter: Record<string, TimelineSlot[]>;
  minTime: number;
  maxTime: number;
} {
  const active: TimelineSlot[] = [];
  const queued: TimelineSlot[] = [];
  const finished: TimelineSlot[] = [];
  const byPrinter: Record<string, TimelineSlot[]> = {};

  let earliestTime = now;
  let latestTime = now;

  items.forEach(item => {
    const title = item.archive_name || item.library_file_name || `#${item.id}`;
    const shortTitle = title.length > 20 ? `${title.slice(0, 17)}...` : title;
    const printerName = item.printer_name || 'Unassigned';
    const duration = item.print_time_seconds ?? 0;
    const durationMs = duration * 1000;

    const startTimeMs = item.started_at ? new Date(item.started_at).getTime() : 0;
    const completedTimeMs = item.completed_at ? new Date(item.completed_at).getTime() : 0;

    if (item.status === 'printing' && startTimeMs > 0) {
      const elapsed = now - startTimeMs;
      const progress = duration > 0 ? Math.min(elapsed / (durationMs), 0.99) : 0;
      const endTime = Math.max(startTimeMs + elapsed, startTimeMs + durationMs);
      earliestTime = Math.min(earliestTime, startTimeMs);
      latestTime = Math.max(latestTime, endTime);

      const colorIdx = active.length % TIMELINE_COLORS.length;
      const slot: TimelineSlot = {
        id: item.id,
        title,
        shortTitle,
        color: TIMELINE_COLORS[colorIdx].bar,
        bgColor: TIMELINE_COLORS[colorIdx].bg,
        progress: Math.round(Math.max(0, Math.min(progress, 0.99)) * 100),
        status: 'printing',
        printerName,
        durationSeconds: duration,
        startedAt: item.started_at ?? undefined,
      };
      active.push(slot);

      if (!byPrinter[printerName]) byPrinter[printerName] = [];
      byPrinter[printerName].push(slot);
    } else if (item.status === 'pending') {
      const estStart = startTimeMs > 0 && startTimeMs < now ? now : Math.max(startTimeMs, now);
      const endTime = estStart + durationMs;
      earliestTime = Math.min(earliestTime, estStart);
      latestTime = Math.max(latestTime, endTime);

      const colorIdx = queued.length % TIMELINE_COLORS.length;
      const slot: TimelineSlot = {
        id: item.id,
        title,
        shortTitle,
        color: TIMELINE_COLORS[colorIdx].bar,
        bgColor: TIMELINE_COLORS[colorIdx].bg,
        progress: 0,
        status: 'queued',
        printerName,
        durationSeconds: duration,
        estimatedStartTime: new Date(estStart).toISOString(),
      };
      queued.push(slot);

      if (!byPrinter[printerName]) byPrinter[printerName] = [];
      byPrinter[printerName].push(slot);
    }

      if (['completed', 'failed', 'cancelled', 'skipped'].includes(item.status)) {
      const startMs = item.started_at ? new Date(item.started_at).getTime() : 0;
      const endMs = completedTimeMs || startTimeMs;
      if (startMs > 0 && endMs > 0) {
        earliestTime = Math.min(earliestTime, startMs);
        latestTime = Math.max(latestTime, endMs);
      }

      const progress = item.status === 'completed' ? 100 : item.status === 'failed' ? Math.round(Math.random() * 80 + 10) : 0;
      const slot: TimelineSlot = {
        id: item.id,
        title,
        shortTitle,
        color: item.status === 'completed' ? '#22c55e' : item.status === 'failed' ? '#ef4444' : '#9ca3af',
        bgColor: item.status === 'completed' ? 'rgba(34,197,94,0.15)' : item.status === 'failed' ? 'rgba(239,68,68,0.15)' : 'rgba(156,163,175,0.15)',
        progress,
        status: item.status as TimelineSlot['status'],
        printerName,
        durationSeconds: duration,
        startedAt: item.started_at ?? undefined,
        completedAt: item.completed_at ?? undefined,
      };
      finished.push(slot);

      if (!byPrinter[printerName]) byPrinter[printerName] = [];
      byPrinter[printerName].push(slot);
    }
  });

  return {
    active,
    queued,
    finished,
    byPrinter,
    minTime: earliestTime,
    maxTime: latestTime,
  };
}

function GanttBar({
  slot,
  timeRange,
  width,
  showCurrentTime: _showCurrentTime,
  now: _now,
}: {
  slot: TimelineSlot;
  timeRange: { min: number; max: number };
  width: number;
  showCurrentTime: boolean;
  now: number;
}) {
  const { colors } = useTheme();
  const duration = timeRange.max - timeRange.min;
  if (duration <= 0) return null;

  let barStart = 0;
  let barWidth = 0;
  const slotStart = slot.startedAt ? new Date(slot.startedAt).getTime() : 0;
  const slotEnd = slot.completedAt
    ? new Date(slot.completedAt).getTime()
    : slot.status === 'printing' && slot.startedAt
      ? _now
      : slot.estimatedStartTime
        ? new Date(slot.estimatedStartTime).getTime()
        : _now;

  if (slot.status === 'printing' && slotStart > 0) {
    const progress = slot.progress / 100;
    barStart = ((slotStart - timeRange.min) / duration) * width;
    barWidth = progress * width;
  } else if (slot.status === 'queued' && slot.estimatedStartTime) {
    const estStart = new Date(slot.estimatedStartTime).getTime();
    barStart = ((estStart - timeRange.min) / duration) * width;
    barWidth = slot.durationSeconds > 0 ? (slot.durationSeconds * 1000) / duration : width * 0.05;
    barWidth = Math.max(barWidth, 20);
  } else {
    barStart = ((slotStart - timeRange.min) / duration) * width;
    barWidth = Math.max(((slotEnd - slotStart) / duration) * width, 8);
  }

  barStart = Math.max(0, barStart);
  barWidth = Math.max(4, Math.min(barWidth, width - barStart));

  const progressLeft = barStart + barWidth;
  const showPercentage = slot.status === 'printing' && slot.progress > 0;

  return (
    <View style={styles.barRow}>
      <View style={[styles.barContainer, { flex: 1 }]}>
        <Animated.View
          style={[
            styles.barFill,
            {
              left: barStart,
              width: barWidth,
              backgroundColor: slot.color,
              opacity: slot.status === 'queued' ? 0.55 : slot.status === 'cancelled' ? 0.4 : 1,
            },
          ]}
        />
        {showPercentage && (
          <>
            <View
              style={[
                styles.barProgressPin,
                {
                  left: progressLeft,
                  top: -2,
                  backgroundColor: '#ffffff',
                },
              ]}
            />
            <Text
              style={[
                styles.barProgressLabel,
                { color: '#ffffff', left: progressLeft + 6 },
              ]}
            >
              {slot.progress}%
            </Text>
          </>
        )}
      </View>
      <Text style={[styles.barLabel, { color: colors.text }]} numberOfLines={1}>
        {slot.shortTitle}
      </Text>
      <Text style={[styles.barDuration, { color: colors.textTertiary }]}>
        {formatDuration(slot.durationSeconds)}
      </Text>
    </View>
  );
}

function TimelineRuler({
  timeRange,
  width,
  now,
}: {
  timeRange: { min: number; max: number };
  width: number;
  now: number;
}) {
  const { colors } = useTheme();
  const duration = timeRange.max - timeRange.min;
  const labels = useMemo(() => {
    if (duration <= 0 || width <= 0) return [];
    const rangeMs = duration;
    let intervalMs: number;
    let formatFn: (d: Date) => string;

    if (rangeMs < 30 * 60 * 1000) {
      intervalMs = 5 * 60 * 1000;
      formatFn = d => formatTime(d);
    } else if (rangeMs < 3 * 60 * 60 * 1000) {
      intervalMs = 15 * 60 * 1000;
      formatFn = d => formatTime(d);
    } else if (rangeMs < 12 * 60 * 60 * 1000) {
      intervalMs = 30 * 60 * 1000;
      formatFn = d => formatTime(d);
    } else {
      intervalMs = 60 * 60 * 1000;
      formatFn = d => `${d.getHours().toString().padStart(2, '0')}:00`;
    }

    const labels: { pos: number; text: string }[] = [];
    let t = getTimeBucket(timeRange.min, intervalMs);
    while (t <= timeRange.max) {
      if (t >= timeRange.min && t <= timeRange.max) {
        const pos = ((t - timeRange.min) / duration) * width;
        labels.push({ pos, text: formatFn(new Date(t)) });
      }
      t += intervalMs;
    }
    return labels;
  }, [timeRange.min, timeRange.max, duration, width]);

  const nowPos = ((now - timeRange.min) / duration) * width;

  return (
    <View style={styles.rulerContainer}>
      {labels.map((label, i) => (
        <View key={i} style={[styles.rulerTick, { left: label.pos }]}>
          <View style={styles.rulerLine} />
          <Text style={[styles.rulerLabel, { color: colors.textTertiary }]}>{label.text}</Text>
        </View>
      ))}
      {nowPos >= 0 && nowPos <= width && (
        <View style={[styles.currentTimeIndicator, { left: nowPos }]}>
          <View style={styles.currentTimeDot} />
        </View>
      )}
    </View>
  );
}

function PrinterTimelineGroup({
  printerName,
  items,
  timeRange,
  width,
  showCurrentTime: _showCurrentTime,
  now: _now,
}: {
  printerName: string;
  items: TimelineSlot[];
  timeRange: { min: number; max: number };
  width: number;
  showCurrentTime: boolean;
  now: number;
}) {
  const { colors } = useTheme();
  const colorIdx = Math.abs(printerName.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)) % TIMELINE_COLORS.length;

  return (
    <View style={styles.printerGroup}>
      <View style={styles.printerHeader}>
        <View style={[styles.printerDot, { backgroundColor: TIMELINE_COLORS[colorIdx].bar }]} />
        <Text style={[styles.printerName, { color: colors.text }]} numberOfLines={1}>
          {printerName}
        </Text>
        <Text style={[styles.printerBadge, { backgroundColor: `${TIMELINE_COLORS[colorIdx].bar}20`, color: TIMELINE_COLORS[colorIdx].bar }]}>
          {items.length} job{items.length !== 1 ? 's' : ''}
        </Text>
      </View>
      <View style={styles.printerBars}>
        <View
          style={[
            styles.barTrack,
            { backgroundColor: colors.surfaceElevated, height: Math.max(items.length * 44, 44) },
          ]}
        >
          {items.map(slot => (
            <GanttBar
              key={slot.id}
              slot={slot}
              timeRange={timeRange}
              width={width}
              showCurrentTime={_showCurrentTime}
              now={_now}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function LegendBar({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

export function GanttTimeline({ items }: GanttTimelineProps) {
  const { colors } = useTheme();
  const [now, setNow] = useState(Date.now());
  const widthRef = useRef(0);

  const { active, queued, finished, byPrinter, minTime, maxTime } = useMemo(
    () => buildTimelineSlots(items, now),
    [items, now],
  );

  const hasActive = active.length > 0;
  const hasQueued = queued.length > 0;
  const hasFinished = finished.length > 0;
  const hasGrouped = Object.keys(byPrinter).length > 0;

  // Auto-refresh every 5 seconds for live printing progress
  React.useEffect(() => {
    if (!hasActive) return;
    const interval = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, [hasActive]);

  return (
    <View style={styles.container}>
      {/* Legend */}
      <View style={styles.legendRow}>
        <LegendBar color={colors.statusPrinting} label="Printing" />
        <LegendBar color="#9ca3af" label="Queued" />
        <LegendBar color="#22c55e" label="Completed" />
        <LegendBar color="#ef4444" label="Failed" />
        <LegendBar color="#9ca3af" label="Cancelled" />
        <View style={[styles.currentTimeBadge, { borderColor: colors.statusPrinting }]}>
          <View style={[styles.currentTimeBadgeDot, { backgroundColor: colors.statusPrinting }]} />
          <Text style={[styles.currentTimeBadgeText, { color: colors.statusPrinting }]}>Now</Text>
        </View>
      </View>

      {/* Timeline ruler */}
      {maxTime > minTime && (
        <View
          onLayout={e => { widthRef.current = e.nativeEvent.layout.width; }}
          style={styles.rulerWrap}
        >
          <TimelineRuler timeRange={{ min: minTime, max: maxTime }} width={Math.max(widthRef.current, 300)} now={now} />
        </View>
      )}

      {hasActive && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Printer size={14} color={colors.statusPrinting} strokeWidth={2} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Currently printing ({active.length})
            </Text>
          </View>
          {active.map(slot => (
            <GanttBar
              key={slot.id}
              slot={slot}
              timeRange={{ min: minTime, max: maxTime }}
              width={Math.max(widthRef.current, 300)}
              showCurrentTime={true}
              now={now}
            />
          ))}
        </View>
      )}

      {hasQueued && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Clock3 size={14} color={colors.textTertiary} strokeWidth={2} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Queued (estimated) — {queued.length}
            </Text>
            <Text style={[styles.sectionMeta, { color: colors.textTertiary }]}>
              Est. total: {formatDuration(queued.reduce((s, i) => s + i.durationSeconds, 0))}
            </Text>
          </View>
          {queued.map(slot => (
            <GanttBar
              key={slot.id}
              slot={slot}
              timeRange={{ min: minTime, max: maxTime }}
              width={Math.max(widthRef.current, 300)}
              showCurrentTime={true}
              now={now}
            />
          ))}
        </View>
      )}

      {hasGrouped && (
        <>
          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.textTertiary }]}>By printer</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>
          {Object.entries(byPrinter).map(([printerName, printerItems]) => (
            <PrinterTimelineGroup
              key={printerName}
              printerName={printerName}
              items={printerItems}
              timeRange={{ min: minTime, max: maxTime }}
              width={Math.max(widthRef.current, 300)}
              showCurrentTime={true}
              now={now}
            />
          ))}
        </>
      )}

      {hasFinished && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <CheckCircle size={14} color={colors.textTertiary} strokeWidth={2} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              History ({finished.length})
            </Text>
          </View>
          {finished.slice(0, 10).map(slot => (
            <GanttBar
              key={slot.id}
              slot={slot}
              timeRange={{ min: minTime, max: maxTime }}
              width={Math.max(widthRef.current, 300)}
              showCurrentTime={false}
              now={now}
            />
          ))}
        </View>
      )}

      {!hasActive && !hasQueued && !hasFinished && !hasGrouped && (
        <View style={styles.emptyState}>
          <CheckCircle size={32} color={colors.textTertiary} strokeWidth={1.5} />
          <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>Queue is empty</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
            Timeline bars appear when items are added to the queue.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.7)',
  },
  currentTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  currentTimeBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  currentTimeBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  rulerWrap: {
    overflow: 'hidden',
  },
  rulerContainer: {
    height: 28,
    position: 'relative',
  },
  rulerTick: {
    position: 'absolute',
    top: 0,
  },
  rulerLine: {
    width: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  rulerLabel: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  currentTimeIndicator: {
    position: 'absolute',
    top: -2,
    width: 2,
    height: 28,
    zIndex: 10,
  },
  currentTimeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    position: 'absolute',
    top: 0,
    left: -2,
  },
  section: {
    gap: spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  sectionMeta: {
    fontSize: fontSize.xs,
    marginLeft: 'auto',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  printerGroup: {
    gap: spacing.xs,
  },
  printerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  printerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  printerName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    flex: 1,
  },
  printerBadge: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  printerBars: {
    overflow: 'hidden',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  barTrack: {
    position: 'relative',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    padding: spacing.sm,
    gap: spacing.xs,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  barContainer: {
    height: 24,
    position: 'relative',
    flex: 1,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  barFill: {
    position: 'absolute',
    top: 0,
    height: '100%',
    borderRadius: borderRadius.sm,
  },
  barProgressPin: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    zIndex: 5,
  },
  barProgressLabel: {
    position: 'absolute',
    top: 2,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    zIndex: 5,
    marginLeft: 6,
  },
  barLabel: {
    fontSize: fontSize.xs,
    flexShrink: 1,
    minWidth: 0,
  },
  barDuration: {
    fontSize: fontSize.xs,
    width: 38,
    textAlign: 'right',
    flexShrink: 0,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  emptySubtitle: {
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
});
