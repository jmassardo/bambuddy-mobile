import { pickNumber, pickString, type ApiRecord } from '@/utils/data';

export type ReportRange =
  | 'today'
  | 'this-week'
  | 'this-month'
  | '7d'
  | '30d'
  | '90d'
  | 'this-year'
  | 'all'
  | 'custom';
export type ReportScope = {
  dateFrom?: string;
  dateTo?: string;
  createdById?: number;
  printerId?: number;
};
export type ReportMetric = 'weight' | 'prints' | 'time';

export function reportRange(range: ReportRange, now = new Date()): ReportScope {
  const y = now.getUTCFullYear(),
    m = now.getUTCMonth(),
    d = now.getUTCDate();
  const fmt = (date: Date) => date.toISOString().split('T')[0];
  if (range === 'all' || range === 'custom') return {};
  const dateTo = fmt(now);
  let start: Date;
  switch (range) {
    case 'today':
      start = new Date(Date.UTC(y, m, d));
      break;
    case 'this-week':
      start = new Date(Date.UTC(y, m, d - ((now.getUTCDay() + 6) % 7)));
      break;
    case 'this-month':
      start = new Date(Date.UTC(y, m, 1));
      break;
    case 'this-year':
      start = new Date(Date.UTC(y, 0, 1));
      break;
    default:
      start = new Date(Date.UTC(y, m, d - Number(range.replace('d', '')) + 1));
  }
  return { dateFrom: fmt(start), dateTo };
}

export function validCustomRange(from: string, to: string) {
  const valid = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  return valid(from) && valid(to) && from <= to;
}

export function reportTimestamp(item: ApiRecord) {
  return pickString(item, ['created_at', 'started_at', 'completed_at']);
}

export function metricValue(item: ApiRecord, metric: ReportMetric) {
  if (metric === 'prints') return 1;
  if (metric === 'weight') return pickNumber(item, ['filament_used_grams'], 0);
  return pickNumber(item, ['actual_time_seconds', 'print_time_seconds'], 0);
}

export function groupReport(
  items: ApiRecord[],
  key: (item: ApiRecord) => string,
  metric: ReportMetric,
) {
  const result = new Map<string, number>();
  for (const item of items) {
    const name = key(item);
    result.set(name, (result.get(name) ?? 0) + metricValue(item, metric));
  }
  return Array.from(result, ([label, value]) => ({ label, value })).sort(
    (a, b) => b.value - a.value,
  );
}

export function splitReport(
  items: ApiRecord[],
  field: 'filament_type' | 'filament_color',
  metric: ReportMetric,
) {
  const result = new Map<string, number>();
  for (const item of items) {
    const raw = pickString(item, [field]);
    if (!raw && field === 'filament_color') continue;
    const parts = raw
      .split(',')
      .map(part => part.trim())
      .filter(Boolean);
    if (!parts.length) parts.push('Unknown');
    const value =
      metricValue(item, metric) / (metric === 'prints' ? 1 : parts.length);
    for (const name of parts) result.set(name, (result.get(name) ?? 0) + value);
  }
  return Array.from(result, ([label, value]) => ({ label, value })).sort(
    (a, b) => b.value - a.value,
  );
}

export function hourBuckets(items: ApiRecord[], metric: ReportMetric) {
  const result = Array.from({ length: 24 }, (_, hour) => ({
    label: `${String(hour).padStart(2, '0')}:00`,
    value: 0,
  }));
  for (const item of items) {
    const date = new Date(reportTimestamp(item));
    if (Number.isFinite(date.getTime()))
      result[date.getHours()].value += metricValue(item, metric);
  }
  return result;
}

export function reportRecords(items: ApiRecord[]) {
  const max = (get: (item: ApiRecord) => number) =>
    items.reduce<{ item: ApiRecord | null; value: number }>(
      (best, item) => {
        const value = get(item);
        return value > best.value ? { item, value } : best;
      },
      { item: null, value: 0 },
    );
  const longest = max(item =>
    item.status === 'completed'
      ? pickNumber(item, ['actual_time_seconds'], 0)
      : 0,
  );
  const heaviest = max(item => pickNumber(item, ['filament_used_grams'], 0));
  const costliest = max(
    item =>
      pickNumber(item, ['cost'], 0) + pickNumber(item, ['energy_cost'], 0),
  );
  const days = new Map<string, number>();
  items.forEach(item => {
    const date = new Date(reportTimestamp(item));
    if (!Number.isFinite(date.getTime())) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      '0',
    )}-${String(date.getDate()).padStart(2, '0')}`;
    days.set(key, (days.get(key) ?? 0) + 1);
  });
  const busiest =
    Array.from(days, ([day, count]) => ({ day, count })).sort(
      (a, b) => b.count - a.count,
    )[0] ?? null;
  const sorted = items
    .filter(item => item.status === 'completed' || item.status === 'failed')
    .sort(
      (a, b) =>
        Date.parse(pickString(b, ['completed_at', 'created_at'])) -
        Date.parse(pickString(a, ['completed_at', 'created_at'])),
    );
  let streak = 0;
  for (const item of sorted) {
    if (item.status !== 'completed') break;
    streak += 1;
  }
  return { longest, heaviest, costliest, busiest, streak };
}

export function summarizeReportEvents(items: ApiRecord[]) {
  const accuracies = new Map<string, number[]>();
  const allAccuracy: number[] = [];
  let time = 0,
    grams = 0,
    cost = 0;
  for (const item of items) {
    const actual = pickNumber(item, ['actual_time_seconds'], 0);
    time += actual;
    grams += pickNumber(item, ['filament_used_grams'], 0);
    cost += pickNumber(item, ['cost'], 0);
    const estimate = pickNumber(item, ['print_time_seconds'], 0);
    if (item.status !== 'completed' || actual <= 0 || estimate <= 0) continue;
    const accuracy = (estimate / actual) * 100;
    if (accuracy < 50 || accuracy > 200) continue;
    const key = String(item.printer_id ?? 'unknown');
    const values = accuracies.get(key) ?? [];
    values.push(accuracy);
    accuracies.set(key, values);
    allAccuracy.push(accuracy);
  }
  const average = (values: number[]) =>
    Math.round(
      (values.reduce((sum, value) => sum + value, 0) / values.length) * 10,
    ) / 10;
  return {
    total_prints: items.length,
    successful_prints: items.filter(item => item.status === 'completed').length,
    failed_prints: items.filter(item => item.status === 'failed').length,
    total_print_time_seconds: time,
    total_filament_grams: grams,
    total_cost: cost,
    average_time_accuracy: allAccuracy.length ? average(allAccuracy) : null,
    time_accuracy_by_printer: Object.fromEntries(
      Array.from(accuracies, ([id, values]) => [id, average(values)]),
    ),
  };
}
