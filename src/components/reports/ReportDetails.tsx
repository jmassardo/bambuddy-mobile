import { translateNative, useLocalizedMemo, useNativeLocale, useTranslation } from '@/i18n';

import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { InlineTabBar } from '@/components/common/AppUI';
import { SimpleBarChart } from '@/components/common/Charts';
import { useTheme } from '@/theme';

import { useAuth } from '@/contexts/AuthContext';
import { reportsApi } from '@/api/reports';
import { spacing } from '@/theme/tokens';
import { formatWeekday } from '@/utils/formatters';
import {
  formatPreferredCurrency as money,
  formatPreferredDate,
  formatPreferredDateTime,
  parseServerDate,
} from '@/utils/preferences';
import {
  formatDuration,
  formatWeight,
  isRecord,
  pickNumber,
  pickString,
  type ApiRecord,
} from '@/utils/data';
import {
  groupReport,
  hourBuckets,
  metricValue,
  reportRecords,
  reportTimestamp,
  splitReport,
  type ReportMetric,
  type ReportScope,
} from '@/utils/reports';

type Props = {
  archives: ApiRecord[];
  stats: ApiRecord;
  printerNames: Record<string, string>;
  currency: string;
  scope: ReportScope;
};
const temporalLabel = (value: string) =>
  value.endsWith(' UTC')
    ? formatPreferredDateTime(value.replace(' ', 'T').replace(' UTC', ':00Z'))
    : formatPreferredDate(value);

export function AccuracyReport({
  stats,
  printerNames,
}: Pick<Props, 'stats' | 'printerNames'>) {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const accuracy =
    typeof stats.average_time_accuracy === 'number'
      ? stats.average_time_accuracy
      : null;
  const label = (value: string) => t(`stats.${value}`, { defaultValue: value });
  if (accuracy === null)
    return (
      <Text style={{ color: colors.textSecondary }}>
        {label('No time accuracy data. Prints without estimates are excluded.')}
      </Text>
    );
  const byPrinter = isRecord(stats.time_accuracy_by_printer)
    ? stats.time_accuracy_by_printer
    : {};
  return (
    <View style={styles.group}>
      <Text style={{ color: colors.text }}>
        {label('Overall estimate accuracy')}: {accuracy.toFixed(1)}%
      </Text>
      <Text style={{ color: colors.text }}>
        {Math.abs(accuracy - 100).toFixed(1)}%{' '}
        {label(
          accuracy > 100
            ? 'faster than estimated'
            : accuracy < 100
            ? 'slower than estimated'
            : 'on estimate',
        )}
      </Text>
      {Object.entries(byPrinter).map(
        ([id, value]) =>
          typeof value === 'number' && (
            <Text key={id} style={{ color: colors.text }}>
              {printerNames[id] ?? `#${id}`}: {value.toFixed(1)}% ·{' '}
              {Math.abs(value - 100).toFixed(1)}%{' '}
              {label(value >= 100 ? 'faster' : 'slower')}
            </Text>
          ),
      )}
    </View>
  );
}

export function RecordsReport({
  archives,
  currency,
}: Pick<Props, 'archives' | 'currency'>) {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const records = useLocalizedMemo(() => reportRecords(archives), [archives]);
  const label = (value: string) => t(`stats.${value}`, { defaultValue: value });
  return (
    <View style={styles.group}>
      {(
        [
          [
            translateNative('native.f8df4aa97cb0ac03'),
            records.longest,
            formatDuration(records.longest.value),
          ],
          [
            translateNative('native.45555a31eb2a9757'),
            records.heaviest,
            formatWeight(records.heaviest.value),
          ],
          [
            translateNative('native.87209a605f30a64d'),
            records.costliest,
            money(records.costliest.value, currency),
          ],
        ] as const
      ).map(([title, record, value]) => (
        <Text key={title} style={{ color: colors.text }}>
          {label(title)}:{' '}
          {record.item
            ? `${value} · ${pickString(
                record.item,
                ['print_name'],
                label('Unnamed print'),
              )}`
            : label('No qualifying print')}
        </Text>
      ))}
      <Text style={{ color: colors.text }}>
        {label('Busiest day')}:{' '}
        {records.busiest
          ? `${formatPreferredDate(records.busiest.day)} · ${
              records.busiest.count
            }`
          : '—'}
      </Text>
      <Text style={{ color: colors.text }}>
        {label('Current success streak')}: {records.streak}
      </Text>
    </View>
  );
}

export function ExplorationReport({
  archives,
  printerNames,
  currency,
  scope,
}: Omit<Props, 'stats'>) {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [metric, setMetric] = useState<ReportMetric>('prints');
  const [colorMetric, setColorMetric] = useState<'weight' | 'prints'>('weight');
  const [trendMetric, setTrendMetric] = useState<'weight' | 'cost'>('weight');
  const label = (value: string) => t(`stats.${value}`, { defaultValue: value });
  const formatMetric = (value: number, selected: ReportMetric = metric) =>
    selected === 'weight'
      ? formatWeight(value)
      : selected === 'time'
      ? formatDuration(value)
      : `${value}`;
  const printerRows = groupReport(
    archives,
    item =>
      printerNames[String(item.printer_id)] ??
      pickString(item, ['printer_name'], `#${item.printer_id ?? '?'}`),
    metric,
  );
  const materialRows = splitReport(archives, 'filament_type', metric);
  const colorRows = splitReport(archives, 'filament_color', colorMetric);
  const dayRows = Array.from({ length: 7 }, (_, index) => ({
    label: formatWeekday(index),
    value: archives
      .filter(item => parseServerDate(reportTimestamp(item)).getDay() === index)
      .reduce((sum, item) => sum + metricValue(item, metric), 0),
  }));
  const hours = hourBuckets(archives, metric);
  const trend = new Map<string, number>();
  const activity = new Map<string, number>();
  const rangeDays =
    scope.dateFrom && scope.dateTo
      ? (Date.parse(scope.dateTo) - Date.parse(scope.dateFrom)) / 86400000 + 1
      : Infinity;
  for (const item of archives) {
    const date = parseServerDate(reportTimestamp(item));
    if (!Number.isFinite(date.getTime())) continue;
    const key = date.toISOString().slice(0, 10);
    const hourKey = `${key} ${String(date.getUTCHours()).padStart(
      2,
      '0',
    )}:00 UTC`;
    const trendKey = rangeDays <= 7 ? hourKey : key;
    trend.set(
      trendKey,
      (trend.get(trendKey) ?? 0) +
        (trendMetric === 'weight'
          ? metricValue(item, 'weight')
          : pickNumber(item, ['cost'], 0)),
    );
    activity.set(hourKey, (activity.get(hourKey) ?? 0) + 1);
  }
  const chart = (rows: { label: string; value: number }[]) => (
    <ScrollView horizontal>
      <SimpleBarChart data={rows} height={180} />
    </ScrollView>
  );
  return (
    <View style={styles.group}>
      <InlineTabBar
        value={metric}
        onChange={setMetric}
        tabs={[
          { key: 'prints', label: label('Prints') },
          { key: 'weight', label: label('Weight') },
          { key: 'time', label: label('Time') },
        ]}
      />
      <Text style={{ color: colors.text }}>
        {label('Printer distribution')}
      </Text>
      {printerRows.map(row => (
        <Text key={row.label} style={{ color: colors.text }}>
          {row.label}: {formatMetric(row.value)}
        </Text>
      ))}
      <Text style={{ color: colors.text }}>
        {label('Material distribution and success')}
      </Text>
      {materialRows.map(row => {
        const items = archives.filter(item =>
          pickString(item, ['filament_type'], 'Unknown')
            .split(',')
            .map(part => part.trim())
            .includes(row.label),
        );
        const success = items.filter(
          item => item.status === 'completed',
        ).length;
        return (
          <Text key={row.label} style={{ color: colors.text }}>
            {row.label}: {formatMetric(row.value)} · {label('Successful')}:{' '}
            {success}/{items.length}
          </Text>
        );
      })}
      <Text style={{ color: colors.text }}>{label('Weekday habits')}</Text>
      {chart(dayRows)}
      {dayRows.map(row => (
        <Text key={row.label} style={{ color: colors.text }}>
          {row.label}: {formatMetric(row.value)}
        </Text>
      ))}
      <Text style={{ color: colors.text }}>
        {label('Hourly habits (all 24 hours)')}
      </Text>
      {chart(hours)}
      {hours.map(row => (
        <Text key={row.label} style={{ color: colors.text }}>
          {row.label}: {formatMetric(row.value)}
        </Text>
      ))}
      {rangeDays <= 7 && (
        <>
          <Text style={{ color: colors.text }}>
            {label('Hourly activity in selected range')}
          </Text>
          {Array.from(activity)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([hour, count]) => (
              <Text key={hour} style={{ color: colors.text }}>
                {temporalLabel(hour)}: {count}
              </Text>
            ))}
          {!activity.size && (
            <Text style={{ color: colors.textSecondary }}>
              {label('No hourly activity')}
            </Text>
          )}
        </>
      )}
      <Text style={{ color: colors.text }}>
        {label('Filament usage / cost over time')}
      </Text>
      <InlineTabBar
        value={trendMetric}
        onChange={setTrendMetric}
        tabs={[
          { key: 'weight', label: label('Usage') },
          { key: 'cost', label: label('Cost') },
        ]}
      />
      {Array.from(trend)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, value]) => (
          <Text key={day} style={{ color: colors.text }}>
            {temporalLabel(day)}:{' '}
            {trendMetric === 'weight'
              ? formatWeight(value)
              : money(value, currency)}
          </Text>
        ))}
      <Text style={{ color: colors.text }}>{label('Color distribution')}</Text>
      <InlineTabBar
        value={colorMetric}
        onChange={setColorMetric}
        tabs={[
          { key: 'weight', label: label('Weight') },
          { key: 'prints', label: label('Prints') },
        ]}
      />
      {colorRows.map(row => (
        <Text key={row.label} style={{ color: colors.text }}>
          {row.label}: {formatMetric(row.value, colorMetric)}
        </Text>
      ))}
      {!archives.length && (
        <Text style={{ color: colors.textSecondary }}>
          {label('No report data in this timeframe')}
        </Text>
      )}
    </View>
  );
}

export function usePurchasingMode() {
  const { hasPermission } = useAuth();
  const settingsRead = hasPermission('settings:read');
  return useQuery({
    queryKey: ['reports-inventory-mode', settingsRead],
    queryFn: () => reportsApi.inventoryMode(settingsRead),
    enabled:
      hasPermission('inventory:read') &&
      (settingsRead || hasPermission('filaments:read')),
  });
}

export function PurchasingReports({
  scope,
  currency,
}: Pick<Props, 'scope' | 'currency'>) {
  useNativeLocale();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { hasPermission } = useAuth();
  const label = (value: string) => t(`stats.${value}`, { defaultValue: value });
  const mode = usePurchasingMode();
  const isSpoolman = mode.data === true;
  const allowed =
    hasPermission('inventory:read') && mode.isSuccess && !isSpoolman;
  const supplier = useQuery({
    queryKey: ['supplier-stats', scope.dateFrom, scope.dateTo],
    queryFn: () => reportsApi.purchasing('suppliers', scope),
    enabled: allowed,
  });
  const material = useQuery({
    queryKey: ['material-number-stats', scope.dateFrom, scope.dateTo],
    queryFn: () => reportsApi.purchasing('material-numbers', scope),
    enabled: allowed,
  });
  if (isSpoolman) return null;
  if (!hasPermission('inventory:read'))
    return (
      <Text style={{ color: colors.textSecondary }}>
        {label('Inventory read permission is required.')}
      </Text>
    );
  if (!mode.isSuccess)
    return (
      <Text
        accessibilityRole={mode.isError ? 'alert' : 'text'}
        style={{ color: colors.textSecondary }}
      >
        {label(
          'Inventory mode is unavailable. Settings or filament read permission is required to enable purchasing reports.',
        )}
      </Text>
    );
  return (
    <View style={styles.group}>
      <Text style={{ color: colors.textSecondary }}>
        {label(
          'Stock is current. Consumption and cost follow the selected dates across all printers/users.',
        )}
      </Text>
      {[
        { get title() { return translateNative('native.9c90cb8f73a5518a'); }, query: supplier },
        { get title() { return translateNative('native.3de0989b0e76b67f'); }, query: material },
      ].map(({ title, query }) => (
        <View key={title} style={styles.group}>
          <Text style={{ color: colors.text }}>{label(title)}</Text>
          {query.isPending && (
            <Text style={{ color: colors.textSecondary }}>
              {label('Loading…')}
            </Text>
          )}
          {query.isError && (
            <Text accessibilityRole="alert" style={{ color: colors.error }}>
              {query.error.message}
            </Text>
          )}
          {query.data?.map(row => (
            <Text
              key={row.supplier_id ?? row.material_number}
              style={{ color: colors.text }}
            >
              {row.supplier_name ?? row.material_number} · {label('Spools')}:{' '}
              {row.spool_count} · {label('Remaining')}:{' '}
              {formatWeight(row.remaining_g)} · {label('Consumed')}:{' '}
              {formatWeight(row.consumed_g)} · {label('Cost')}:{' '}
              {money(row.cost, currency)}
            </Text>
          ))}
          {query.isSuccess && !query.data.length && (
            <Text style={{ color: colors.textSecondary }}>
              {label('No purchasing data')}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ group: { gap: spacing.sm } });
