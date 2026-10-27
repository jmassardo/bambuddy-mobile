import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/common/AppUI';
import { LaunchText } from '@/components/printers/PrintOptionsForm';
import { useTheme } from '@/theme';
import { useTranslation } from '@/i18n';
import { spacing } from '@/theme/tokens';
import type { PrintQueueItem } from '@/types/api';
import { formatDateTime, formatDuration } from '@/utils/data';

const HOUR = 3600000;
const WIDTH = 960;
const WINDOW = 12 * HOUR;
interface TimelineEvent {
  item: PrintQueueItem;
  start: number;
  end: number;
  lane: string;
}

export function buildQueueTimeline(
  items: PrintQueueItem[],
  now: number,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const cursors = new Map<string, number>();
  const laneFor = (item: PrintQueueItem) =>
    item.printer_id != null
      ? `printer:${item.printer_id}`
      : item.target_model
      ? `model:${item.target_model}:${item.target_location ?? ''}`
      : 'unassigned';
  items
    .filter(item => item.status !== 'pending')
    .forEach(item => {
      const lane = laneFor(item);
      const start = new Date(
        item.started_at ?? item.completed_at ?? item.created_at,
      ).getTime();
      const end =
        item.status === 'printing'
          ? Math.max(now, start + (item.print_time_seconds ?? 0) * 1000)
          : new Date(
              item.completed_at ?? item.started_at ?? item.created_at,
            ).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end)) return;
      events.push({ item, start, end: Math.max(start + 60000, end), lane });
      if (item.status === 'printing')
        cursors.set(lane, Math.max(cursors.get(lane) ?? now, end));
    });
  [...items]
    .filter(item => item.status === 'pending')
    .sort((a, b) => a.position - b.position)
    .forEach(item => {
      const lane = laneFor(item);
      const scheduled = item.scheduled_time
        ? new Date(item.scheduled_time).getTime()
        : now;
      const start = Math.max(
        now,
        cursors.get(lane) ?? now,
        Number.isFinite(scheduled) ? scheduled : now,
      );
      const end = start + Math.max(60, item.print_time_seconds ?? 0) * 1000;
      events.push({ item, lane, start, end });
      cursors.set(lane, end);
    });
  return events;
}

export function GanttTimeline({
  items,
  printers = [],
  onItemPress,
}: {
  items: PrintQueueItem[];
  printers?: Array<{ id: number; name: string }>;
  onItemPress?: (item: PrintQueueItem) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const start = Math.floor(now / HOUR) * HOUR + offset * WINDOW;
  const end = start + WINDOW;
  const events = useMemo(() => buildQueueTimeline(items, now), [items, now]);
  const lanes = [...new Set(events.map(event => event.lane))];
  const tr = (label: string) =>
    t(`queueTimeline.${label.replace(/\W/g, '')}`, { defaultValue: label });
  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        <PrimaryButton
          label={tr('Previous 12 hours')}
          variant="secondary"
          onPress={() => setOffset(value => value - 1)}
        />
        <PrimaryButton
          label={tr('Now')}
          variant="secondary"
          onPress={() => {
            setNow(Date.now());
            setOffset(0);
          }}
        />
        <PrimaryButton
          label={tr('Next 12 hours')}
          variant="secondary"
          onPress={() => setOffset(value => value + 1)}
        />
      </View>
      <LaunchText>{`${formatDateTime(
        new Date(start).toISOString(),
      )} — ${formatDateTime(new Date(end).toISOString())}`}</LaunchText>
      <ScrollView horizontal>
        <View style={styles.canvas}>
          <View style={styles.scale}>
            {Array.from({ length: 13 }, (_, i) => (
              <Text
                key={i}
                style={[
                  styles.tick,
                  { color: colors.textSecondary, left: (i / 12) * WIDTH },
                ]}
              >
                {new Date(start + i * HOUR).getHours()}:00
              </Text>
            ))}
          </View>
          {lanes.map(lane => {
            const laneEvents = events.filter(
              event =>
                event.lane === lane && event.end > start && event.start < end,
            );
            const first = events.find(event => event.lane === lane)!.item;
            const name =
              first.printer_name ??
              printers.find(p => p.id === first.printer_id)?.name ??
              (first.target_model
                ? `${tr('Any')} ${first.target_model} ${
                    first.target_location ?? ''
                  }`
                : tr('Unassigned'));
            return (
              <View key={lane} style={styles.lane}>
                <LaunchText>{name}</LaunchText>
                <View style={[styles.track, { borderColor: colors.border }]}>
                  {laneEvents.map(event => {
                    const left = Math.max(
                      0,
                      ((event.start - start) / WINDOW) * WIDTH,
                    );
                    const width = Math.min(
                      WIDTH - left,
                      ((Math.min(event.end, end) -
                        Math.max(start, event.start)) /
                        WINDOW) *
                        WIDTH,
                    );
                    const color =
                      event.item.status === 'failed'
                        ? colors.error
                        : event.item.status === 'completed'
                        ? colors.success
                        : event.item.status === 'printing'
                        ? colors.info
                        : colors.accent;
                    const nameText =
                      event.item.archive_name ||
                      event.item.library_file_name ||
                      `#${event.item.id}`;
                    return (
                      <Pressable
                        key={event.item.id}
                        onPress={() => onItemPress?.(event.item)}
                        accessibilityRole="button"
                        accessibilityLabel={`${nameText} · ${tr(
                          event.item.status,
                        )} · ${formatDateTime(
                          new Date(event.start).toISOString(),
                        )} · ${formatDuration(
                          (event.end - event.start) / 1000,
                        )}`}
                        style={[
                          styles.bar,
                          {
                            left,
                            width: Math.max(12, width),
                            backgroundColor: color,
                          },
                        ]}
                      >
                        <Text
                          style={[styles.barText, { color: colors.text }]}
                          numberOfLines={1}
                        >
                          {nameText} · {tr(event.item.status)}
                        </Text>
                      </Pressable>
                    );
                  })}
                  {now >= start && now <= end && (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.nowLine,
                        {
                          left: ((now - start) / WINDOW) * WIDTH,
                          backgroundColor: colors.warning,
                        },
                      ]}
                    />
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
      <LaunchText>
        Tap pending jobs to edit, finished runs to configure a requeue, or
        active prints to stop with confirmation.
      </LaunchText>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  canvas: { width: WIDTH + 48, paddingVertical: spacing.sm },
  scale: { height: 28, position: 'relative' },
  tick: { position: 'absolute', fontSize: 11 },
  lane: { marginBottom: spacing.md },
  track: { height: 48, borderWidth: 1, position: 'relative', width: WIDTH },
  bar: {
    height: 36,
    top: 5,
    position: 'absolute',
    borderRadius: 4,
    padding: 5,
    overflow: 'hidden',
  },
  barText: { fontSize: 12 },
  nowLine: { position: 'absolute', width: 2, height: 48 },
});
