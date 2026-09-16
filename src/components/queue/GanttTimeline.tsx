import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { CheckCircle, Clock3, Printer } from 'lucide-react-native';
import { useTheme } from '@/theme';
import {
  borderRadius,
  fontSize,
  fontWeight,
  spacing,
} from '@/theme/tokens';
import type { PrintQueueItem } from '@/types/api';
import { formatDuration } from '@/utils/data';

interface GanttTimelineProps {
  items: PrintQueueItem[];
}

interface GanttItem {
  id: number;
  title: string;
  color: string;
  bgColor: string;
  startTime: number;
  duration: number;
  progress?: number;
  status: string;
  printerName: string;
}

interface PrinterSlot {
  name: string;
  color: string;
  items: GanttItem[];
}

const TIMELINE_COLORS = [
  { bg: 'rgba(59, 130, 246, 0.12)', bar: '#3b82f6', light: '#67e8f9' },
  { bg: 'rgba(168, 85, 247, 0.12)', bar: '#a855f7', light: '#c4b5fd' },
  { bg: 'rgba(0, 174, 66, 0.12)', bar: '#00AE42', light: '#00C64D' },
  { bg: 'rgba(245, 158, 11, 0.12)', bar: '#f59e0b', light: '#fbbf24' },
  { bg: 'rgba(239, 68, 68, 0.12)', bar: '#ef4444', light: '#fca5a5' },
  { bg: 'rgba(107, 114, 128, 0.12)', bar: '#6b7280', light: '#d1d5db' },
];

function formatTime(dateStr: string | null): number {
  if (!dateStr) return 0;
  return new Date(dateStr).getTime();
}

function buildGanttItems(
  items: PrintQueueItem[],
  now: number,
): { active: GanttItem[]; queued: GanttItem[]; byPrinter: PrinterSlot[] } {
  const active: GanttItem[] = [];
  const queued: GanttItem[] = [];
  const printerMap: Record<string, GanttItem[]> = {};

  items.forEach(item => {
    const title = item.archive_name || item.library_file_name || `#${item.id}`;
    const printerName = item.printer_name || 'Unassigned';
    const duration = item.print_time_seconds ?? 0;
    const startTime = formatTime(item.started_at) || 0;

    if (item.status === 'printing') {
      const elapsed = now - startTime;
      const progress = duration > 0 ? Math.min(elapsed / (duration * 1000), 0.95) : 0;
      const colorIdx = active.length % TIMELINE_COLORS.length;
      active.push({
        id: item.id,
        title,
        color: TIMELINE_COLORS[colorIdx].bar,
        bgColor: TIMELINE_COLORS[colorIdx].bg,
        startTime,
        duration: (progress * 1000 * duration) + elapsed,
        progress: Math.round(progress * 100),
        status: 'printing',
        printerName,
      });

      if (!printerMap[printerName]) printerMap[printerName] = [];
      printerMap[printerName].push({
        id: item.id,
        title,
        color: TIMELINE_COLORS[colorIdx].bar,
        bgColor: TIMELINE_COLORS[colorIdx].bg,
        startTime,
        duration: (progress * 1000 * duration) + elapsed,
        progress: Math.round(progress * 100),
        status: 'printing',
        printerName,
      });
    } else if (item.status === 'pending') {
      const estStart = startTime || now;
      const colorIdx = queued.length % TIMELINE_COLORS.length;
      queued.push({
        id: item.id,
        title,
        color: TIMELINE_COLORS[colorIdx].bar,
        bgColor: TIMELINE_COLORS[colorIdx].bg,
        startTime: estStart,
        duration: duration * 1000,
        status: 'queued',
        printerName,
      });

      if (!printerMap[printerName]) printerMap[printerName] = [];
      printerMap[printerName].push({
        id: item.id,
        title,
        color: TIMELINE_COLORS[colorIdx].bar,
        bgColor: TIMELINE_COLORS[colorIdx].bg,
        startTime: estStart,
        duration: duration * 1000,
        status: 'queued',
        printerName,
      });
    }
  });

  const byPrinter = Object.entries(printerMap).map(([name, printerItems]) => {
    const colorIdx = Object.keys(printerMap).indexOf(name) % TIMELINE_COLORS.length;
    return { name, color: TIMELINE_COLORS[colorIdx].bar, items: printerItems };
  });

  return { active, queued, byPrinter };
}

function GanttBar({
  item,
  width,
}: {
  item: GanttItem;
  width: number;
}) {
  const { colors } = useTheme();
  const barMargin = Math.max(2, (4 / width) * width);

  return (
    <View style={styles.barRow}>
      <View style={[styles.barTrack, { backgroundColor: colors.surfaceElevated }]}>
        <View
          style={[
            styles.barFill,
            {
              width: Math.max(4, barMargin),
              minWidth: 4,
              backgroundColor: item.color,
              opacity: item.status === 'queued' ? 0.5 : 1,
            },
          ]}
        />
        {item.progress != null && (
          <View
            style={[
              styles.barProgress,
              {
                left: `${item.progress}%`,
                width: 3,
                backgroundColor: '#ffffff',
              },
            ]}
          />
        )}
      </View>
      <Text style={styles.barLabel} numberOfLines={1}>
        {item.status === 'printing' ? `${item.title} (${item.progress}%)` : item.title}
      </Text>
      {item.status === 'queued' && (
        <Text style={styles.barDuration}>
          {formatDuration(item.duration / 1000)}
        </Text>
      )}
    </View>
  );
}

function PrinterTimeline({
  slot,
  _timelineWidth,
}: {
  slot: PrinterSlot;
  _timelineWidth: number;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.printerSlot}>
      <View style={styles.printerHeader}>
        <View style={[styles.printerDot, { backgroundColor: slot.color }]} />
        <Text style={[styles.printerName, { color: colors.text }]} numberOfLines={1}>
          {slot.name}
        </Text>
        <Text style={[styles.printerCount, { color: colors.textTertiary }]}>
          {slot.items.length} job{slot.items.length !== 1 ? 's' : ''}
        </Text>
      </View>
      {slot.items.map(item => (
        <GanttBar key={item.id} item={item} width={_timelineWidth} />
      ))}
    </View>
  );
}

function TimelineOverview({
  active,
  queued,
}: {
  active: GanttItem[];
  queued: GanttItem[];
}) {
  const { colors } = useTheme();
  const hasActive = active.length > 0;
  const hasQueued = queued.length > 0;

  if (!hasActive && !hasQueued) {
    return (
      <View style={styles.emptyState}>
        <Clock3 size={32} color={colors.textTertiary} strokeWidth={1.5} />
        <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No timeline data</Text>
        <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
          Timeline bars appear when items are printing or queued.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.overviewContainer}>
      {hasActive ? (
        <>
          <View style={styles.overviewHeader}>
            <View style={[styles.overviewDot, { backgroundColor: colors.statusPrinting }]} />
            <Text style={[styles.overviewLabel, { color: colors.textSecondary }]}>Printing</Text>
          </View>
          <View style={[styles.overviewTrack, { backgroundColor: colors.surfaceElevated }]}>
            {active.map(item => (
              <View
                key={`active-${item.id}`}
                style={[
                  styles.overviewBar,
                  {
                    backgroundColor: item.color,
                    opacity: 0.7,
                    borderRadius: borderRadius.full,
                  },
                ]}
              >
                <Text style={styles.overviewBarText}>{item.progress}%</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {hasQueued ? (
        <>
          <View style={styles.overviewHeader}>
            <View style={[styles.overviewDot, { backgroundColor: colors.textTertiary }]} />
            <Text style={[styles.overviewLabel, { color: colors.textSecondary }]}>Queued</Text>
          </View>
          <View style={[styles.overviewTrack, { backgroundColor: colors.surfaceElevated }]}>
            {queued.map(item => (
              <View
                key={`queued-${item.id}`}
                style={[
                  styles.overviewBar,
                  {
                    backgroundColor: item.color,
                    opacity: 0.3,
                    borderRadius: borderRadius.full,
                  },
                ]}
              >
                <Text style={[styles.overviewBarText, { opacity: 0.6 }]}>
                  {formatDuration(item.duration / 1000)}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

function PrinterGroupedTimeline({
  items,
  _timelineWidth,
}: {
  items: GanttItem[];
  _timelineWidth: number;
}) {
  const printerGroups = useMemo(() => {
    const groups: Record<string, GanttItem[]> = {};
    items.forEach(item => {
      if (!groups[item.printerName]) groups[item.printerName] = [];
      groups[item.printerName].push(item);
    });
    return Object.entries(groups)
      .filter(([, groupItems]) => groupItems.length > 0)
      .map(([name, groupItems]) => {
        const colorIdx = Object.keys(groups).indexOf(name) % TIMELINE_COLORS.length;
        return { name, color: TIMELINE_COLORS[colorIdx].bar, items: groupItems };
      });
  }, [items]);

  if (printerGroups.length === 0) return null;

  return (
    <View style={styles.groupedContainer}>
      {printerGroups.map(slot => (
        <PrinterTimeline key={slot.name} slot={slot} _timelineWidth={600} />
      ))}
    </View>
  );
}

export function GanttTimeline({ items }: GanttTimelineProps) {
  const { colors } = useTheme();
  const now = useMemo(() => Date.now(), []);
  const { active, queued, byPrinter } = useMemo(
    () => buildGanttItems(items, now),
    [items, now],
  );

  const hasActive = active.length > 0;
  const hasQueued = queued.length > 0;
  const hasGrouped = byPrinter.length > 0;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.container}>
      <View style={styles.inner}>
        <TimelineOverview active={active} queued={queued} />

        {hasGrouped ? (
          <>
            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.textTertiary }]}>By Printer</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>
            <PrinterGroupedTimeline items={items.map(item => {
              const duration = item.print_time_seconds ?? 0;
              const startTime = formatTime(item.started_at) || now;
              const colorIdx = items.indexOf(item) % TIMELINE_COLORS.length;
              return {
                id: item.id,
                title: item.archive_name || item.library_file_name || `#${item.id}`,
                color: TIMELINE_COLORS[colorIdx].bar,
                bgColor: TIMELINE_COLORS[colorIdx].bg,
                startTime,
                duration: duration * 1000,
                status: item.status as 'printing' | 'queued',
                printerName: item.printer_name || 'Unassigned',
              };
            })} _timelineWidth={600} />
          </>
        ) : null}

        {hasActive ? (
          <>
            <View style={styles.sectionHeader}>
              <Printer size={14} color={colors.statusPrinting} strokeWidth={2} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Currently printing</Text>
            </View>
            {active.map(item => (
              <GanttBar key={item.id} item={item} width={Math.max(600, items.length * 120)} />
            ))}
          </>
        ) : null}

        {hasQueued ? (
          <>
            <View style={styles.sectionHeader}>
              <Clock3 size={14} color={colors.textTertiary} strokeWidth={2} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Queued (estimated)</Text>
            </View>
            {queued.map(item => (
              <GanttBar key={item.id} item={item} width={Math.max(600, items.length * 120)} />
            ))}
          </>
        ) : null}

        {active.length === 0 && queued.length === 0 && byPrinter.length === 0 ? (
          <View style={styles.emptyState}>
            <CheckCircle size={32} color={colors.textTertiary} strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>Queue is empty</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
              Timeline bars appear when items are added to the queue.
            </Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.md,
  },
  inner: {
    gap: spacing.lg,
    paddingRight: spacing.lg,
  },
  emptyState: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing['2xl'],
  },
  emptyTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  emptySubtitle: {
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  overviewContainer: {
    gap: spacing.md,
  },
  overviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  overviewDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  overviewLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  overviewTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: spacing.xs,
    gap: spacing.xs,
  },
  overviewBar: {
    height: 20,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overviewBarText: {
    fontSize: fontSize.xs,
    color: '#fff',
    fontWeight: fontWeight.semibold,
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
  printerSlot: {
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
  printerCount: {
    fontSize: fontSize.xs,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  barTrack: {
    height: 8,
    borderRadius: borderRadius.full,
    flex: 1,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  barProgress: {
    position: 'absolute',
    height: 10,
    borderRadius: 2,
    top: -1,
  },
  barLabel: {
    fontSize: fontSize.xs,
    flex: 1,
    maxWidth: 120,
  },
  barDuration: {
    fontSize: fontSize.xs,
    width: 42,
    textAlign: 'right',
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
  groupedContainer: {
    gap: spacing.md,
  },
});
