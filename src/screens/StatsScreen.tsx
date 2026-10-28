import { NativeTranslation, nativeMessage, translateNative, useLocalizedMemo, useNativeLocale, useTranslation } from '@/i18n';


import React, { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Share from 'react-native-share';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigationProp } from '@/navigation/types';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { SimpleBarChart } from '@/components/common/Charts';
import { PrimaryButton, SectionCard, StatCard } from '@/components/common/AppUI';
import { ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { shareBlob } from '@/utils/share';
import { reportsApi } from '@/api/reports';
import { financeApi } from '@/api/finance';
import { reportRange, summarizeReportEvents, validCustomRange, type ReportRange, type ReportScope } from '@/utils/reports';
import { reportCsv, reportXlsxBase64 } from '@/utils/reportExport';
import { ReportRangeControls, reportPresets, reportRangeKey } from '@/components/reports/ReportRangeControls';
import { ReportLayout } from '@/components/reports/ReportLayout';
import { AccuracyReport, ExplorationReport, PurchasingReports, RecordsReport, usePurchasingMode } from '@/components/reports/ReportDetails';

import {
  formatCurrency,
  formatDate,
  formatDuration,
  formatPercent,
  formatWeight,
  pickNumber,
  pickString,
  type ApiRecord,
} from '@/utils/data';

type RangeKey = ReportRange;
type SelectorKey = 'printer' | 'user' | null;

type SelectorOption = {
  key: string;
  label: string;
  value: number | null;
};

function materialKey(item: ApiRecord) {
  return pickString(item, ['material', 'filament_type', 'type'], 'Unknown');
}

function printerKey(item: ApiRecord, printerNames?: Record<string, string>) {
  return printerNames?.[String(item.printer_id)] ?? pickString(
    item,
    ['printer_name', 'printer'],
    item.printer_id == null ? translateNative('native.d2f3cad436de827d') : `#${item.printer_id}`,
  );
}

function archiveStatus(item: ApiRecord) {
  return pickString(item, ['status'], 'unknown').toLowerCase();
}

function dayKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
}

function monthKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function cellColor(count: number, max: number, colors: ReturnType<typeof useTheme>['colors']) {
  if (count <= 0) return colors.surfaceElevated;
  const ratio = count / Math.max(max, 1);
  if (ratio < 0.34) return `${colors.accent}44`;
  if (ratio < 0.67) return `${colors.accent}88`;
  return colors.accent;
}

function getArchiveTimestamp(item: ApiRecord) {
  return pickString(item, ['created_at', 'started_at', 'completed_at']);
}

function isFailure(item: ApiRecord) {
  const status = archiveStatus(item);
  return (
    status.includes('fail') ||
    status.includes('cancel') ||
    pickString(item, ['failure_reason', 'error_reason', 'cancel_reason']).trim().length > 0
  );
}

function failureReasonKey(item: ApiRecord) {
  return pickString(
    item,
    ['failure_reason', 'error_reason', 'cancel_reason', 'ai_failure_reason', 'failure_category'],
    'Unknown',
  );
}

function timeBucket(item: ApiRecord) {
  const value = getArchiveTimestamp(item);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return translateNative('native.ff12a040d13addb7');
  const hour = date.getHours();
  if (hour < 6) return translateNative('native.47db589c093cc231');
  if (hour < 12) return translateNative('native.7cdba8a9ef2a37a7');
  if (hour < 18) return translateNative('native.569c68713cb45a73');
  return translateNative('native.9b14db557f5e32b5');
}

function buildStatsSummaryCsv(stats: ApiRecord, archives: ApiRecord[], range: RangeKey, printerId: number | null, userId: number | null, scope: ReportScope) {
  const rows = [
    { get metric() { return translateNative('native.185578091a522c97'); }, value: String(pickNumber(stats, ['total_prints', 'prints_count'], archives.length)) },
    { get metric() { return translateNative('native.41d8c0b0fb9ced09'); }, value: formatPercent(pickNumber(stats, ['success_rate'], pickNumber(stats, ['total_prints']) ? pickNumber(stats, ['successful_prints']) / pickNumber(stats, ['total_prints']) : 0), 1) },
    { get metric() { return translateNative('native.2f4a337b2e1eeca6'); }, value: formatDuration(Math.round(pickNumber(stats, ['total_print_time_seconds', 'total_print_time'], pickNumber(stats, ['total_print_time_hours']) * 3600))) },
    { get metric() { return translateNative('native.844d300a3502db9f'); }, value: formatWeight(pickNumber(stats, ['total_filament_grams', 'total_filament_g', 'filament_total_g'], 0)) },
    { get metric() { return translateNative('native.f95cddbff6adee85'); }, value: formatCurrency(pickNumber(stats, ['total_cost', 'cost_total'], 0)) },
    { metric: 'Range', value: range },
    { metric: 'From', value: scope.dateFrom ?? 'All' },
    { metric: 'To', value: scope.dateTo ?? 'All' },
    { metric: 'Printer', value: printerId ? `${printerId}` : 'All' },
    { metric: 'User', value: userId !== null ? `${userId}` : 'All' },
  ];
  return toCsvSummary(rows);
}

function toCsvSummary(rows: Array<{ metric: string; value: string }>) {
  return [
    rows.map(r => `"${r.metric}"`).join(','),
    rows.map(r => `"${r.value.replace(/"/g, '""')}"`).join(','),
  ].join('\n');
}

function buildFailureRates(
  items: ApiRecord[],
  keyFn: (item: ApiRecord) => string,
  labelFn: (item: ApiRecord) => string = keyFn,
) {
  const rows = new Map<string, { key: string; label: string; total: number; failures: number; rate: number }>();
  items.forEach(item => {
    const key = keyFn(item) || 'Unknown';
    const current = rows.get(key) ?? { key, label: labelFn(item) || translateNative('native.ff12a040d13addb7'), total: 0, failures: 0, rate: 0 };
    current.total += 1;
    if (isFailure(item)) current.failures += 1;
    current.rate = current.total > 0 ? current.failures / current.total : 0;
    rows.set(key, current);
  });
  return Array.from(rows.values()).sort((a, b) => b.rate - a.rate || b.failures - a.failures);
}

function isValidUserFilter(userId: number | null, isAdminFilter: boolean, usersLoaded: boolean, users: ApiRecord[]) {
  if (userId === null) return true;
  if (!isAdminFilter) return false;
  if (userId === -1) return true;
  if (!usersLoaded) return true;
  return users.some(user => pickNumber(user, ['id']) === userId);
}

export default function StatsScreen() {
  const titleLocale = useNativeLocale();
  const { t } = useTranslation();
  const navigation = useNavigation<RootNavigationProp<'Stats'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: translateNative('native.826ae2f32f3bf893') });
  }, [navigation, titleLocale]);

  const { colors } = useTheme();
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const canFilterUser = hasPermission('stats:filter_by_user');
  const [range, setRange] = useState<RangeKey>('30d');
  const [customDates, setCustomDates] = useState<ReportScope>({});
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selector, setSelector] = useState<SelectorKey>(null);
  const [userFilterValidated, setUserFilterValidated] = useState(true);

  React.useEffect(() => {
    let active = true;
    AsyncStorage.getItem(reportRangeKey).then(raw => {
      if (!raw || !active) return;
      const saved = JSON.parse(raw) as { range?: ReportRange; dateFrom?: string; dateTo?: string };
      if (!saved.range || !reportPresets.includes(saved.range)) return;
      if (saved.range === 'custom' && !validCustomRange(saved.dateFrom ?? '', saved.dateTo ?? '')) return;
      setRange(saved.range);
      setCustomDates({ dateFrom: saved.dateFrom, dateTo: saved.dateTo });
    }).catch(() => showToast(nativeMessage('stats.rangeLoadFailed', () => ({ defaultValue: 'Unable to load saved timeframe.' })), 'warning'));
    return () => { active = false; };
  }, [showToast, t]);
  const params = range === 'custom' ? customDates : reportRange(range);
  const queryParams = useLocalizedMemo(() => ({
    ...params,
    ...(selectedPrinterId ? { printerId: selectedPrinterId } : {}),
    ...(canFilterUser && selectedUserId !== null ? { createdById: selectedUserId } : {}),
  }), [canFilterUser, params, selectedPrinterId, selectedUserId]);

  const aggregateStatsQuery = useQuery({
    queryKey: ['archiveStats', queryParams],
    queryFn: () => api.getArchiveStats({
      dateFrom: queryParams.dateFrom,
      dateTo: queryParams.dateTo,
      createdById: queryParams.createdById,
    }),
  });
  const archivesQuery = useQuery({
    queryKey: ['archives', 'stats-screen', queryParams],
    queryFn: () => reportsApi.events(queryParams),
  });
  const statsQuery = {
    ...aggregateStatsQuery,
    // The aggregate handler does not accept printer_id. Never send a filter
    // that the server silently ignores and present farm-wide totals as local.
    data: selectedPrinterId === null ? aggregateStatsQuery.data : summarizeReportEvents(archivesQuery.data ?? []),
  };
  const printersQuery = useQuery({
    queryKey: ['printers', 'stats-screen'],
    queryFn: () => api.getPrinters(),
  });
  const usersQuery = useQuery({
    queryKey: ['users', 'stats-screen'],
    queryFn: financeApi.users,
    enabled: canFilterUser && (hasPermission('users:read') || hasPermission('users:read_slim')),
  });
  const flagsQuery = useQuery({ queryKey: ['ui-flags'], queryFn: reportsApi.flags });
  const inventoryMode = usePurchasingMode();

  const usersData = useLocalizedMemo(
    () => (usersQuery.data ?? []) as ApiRecord[],
    [usersQuery.data],
  );

  const isUserFilterValid = useLocalizedMemo(() => {
    return isValidUserFilter(selectedUserId, canFilterUser, usersQuery.isSuccess, usersData);
  }, [selectedUserId, canFilterUser, usersQuery.isSuccess, usersData]);

  React.useEffect(() => {
    if (!isUserFilterValid && selectedUserId !== null) {
      setUserFilterValidated(false);
      showToast(nativeMessage('native.287099fa63715304'), 'warning');
      setSelectedUserId(null);
    } else if (userFilterValidated && !isUserFilterValid) {
      setUserFilterValidated(true);
    }
  }, [isUserFilterValid, selectedUserId, userFilterValidated, showToast]);

  React.useEffect(() => {
    if (usersQuery.isSuccess && usersData.length === 0 && canFilterUser) {
      console.warn('StatsScreen: No users available to filter by.');
    }
  }, [usersQuery.isSuccess, usersData.length, canFilterUser]);

  const refreshAll = async () => {
    await Promise.all([
      statsQuery.refetch(),
      archivesQuery.refetch(),
      printersQuery.refetch(),
      canFilterUser ? usersQuery.refetch() : Promise.resolve(),
    ]);
  };

  const exportMutation = useMutation({
    mutationFn: async (format: 'csv' | 'xlsx' | 'json') => {
      const filenameBase = `bambuddy-stats-${range}${selectedPrinterId ? `-printer-${selectedPrinterId}` : ''}${selectedUserId !== null ? `-user-${selectedUserId}` : ''}`;
      if (format === 'json') {
        const blobOptions: BlobOptions = {
          type: 'application/json',
          lastModified: Date.now(),
        };
        const blob = new Blob([JSON.stringify(archivesQuery.data ?? [], null, 2)], blobOptions);
        await shareBlob(blob, `${filenameBase}.json`);
        return;
      }
      if (format === 'xlsx') {
        const type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        await Share.open({ url: `data:${type};base64,${reportXlsxBase64(archivesQuery.data ?? [], queryParams)}`, type, filename: `${filenameBase}.xlsx`, saveToFiles: true, failOnCancel: false });
        return;
      }
      await shareBlob(new Blob([reportCsv(archivesQuery.data ?? [], queryParams)], { type: 'text/csv', lastModified: Date.now() }), `${filenameBase}.csv`);
    },
    onSuccess: (_data, format) => showToast(nativeMessage('native.6e87274835985d3c', () => ({ value0: String(format.toUpperCase()) })), 'success'),
    onError: (error: Error) => showToast(error.message || nativeMessage('native.49c7fbf6dffe8c58'), 'error'),
  });

  const statsSummaryMutation = useMutation({
    mutationFn: async () => {
      const filenameBase = `bambuddy-stats-summary-${range}`;
      const csv = buildStatsSummaryCsv(
        statsQuery.data ?? {},
        archives,
        range,
        selectedPrinterId,
        canFilterUser ? selectedUserId : null,
        queryParams,
      );
      const blobOptions: BlobOptions = {
        type: 'text/csv',
        lastModified: Date.now(),
      };
      const blob = new Blob([csv], blobOptions);
      await shareBlob(blob, `${filenameBase}.csv`);
    },
    onSuccess: () => showToast(nativeMessage('native.70b44dbe91e4cb71'), 'success'),
    onError: () => showToast(nativeMessage('native.9ebf6f64f2513714'), 'error'),
  });

  const recalculateCostsMutation = useMutation({
    mutationFn: api.recalculateCosts,
    onSuccess: async result => {
      await refreshAll();
      showToast(result.message || nativeMessage('native.e4f729d601bbc009'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.87040dbe0adb91fc'), 'error'),
  });

  const archives = useLocalizedMemo(
    () => ((archivesQuery.data ?? []) as ApiRecord[]).filter(Boolean),
    [archivesQuery.data],
  );
  const printerNames = useLocalizedMemo(() => {
    const result: Record<string, string> = {};
    const names = aggregateStatsQuery.data?.printer_names;
    if (names && typeof names === 'object') {
      Object.entries(names).forEach(([id, name]) => { if (typeof name === 'string') result[id] = name; });
    }
    printersQuery.data?.forEach(printer => { result[String(printer.id)] = printer.name; });
    return result;
  }, [aggregateStatsQuery.data, printersQuery.data]);
  const reportCurrency = pickString(flagsQuery.data, ['currency'], 'USD');

  const printerOptions = useLocalizedMemo<SelectorOption[]>(() => {
    const options: SelectorOption[] = [{ key: 'all', get label() { return translateNative('native.b8ed6cb4c204100e'); }, value: null }];
    ((printersQuery.data ?? []) as ApiRecord[]).forEach(printer => {
      options.push({
        key: String(pickNumber(printer, ['id'])),
        label: pickString(printer, ['name'], `Printer ${pickNumber(printer, ['id'])}`),
        value: pickNumber(printer, ['id']),
      });
    });
    return options;
  }, [printersQuery.data]);

  const userOptions = useLocalizedMemo<SelectorOption[]>(() => {
    const options: SelectorOption[] = [
      { key: 'all', get label() { return translateNative('native.c311af34acd4fa38'); }, value: null },
      { key: 'system', get label() { return translateNative('stats.systemUser', { defaultValue: 'No user (system)' }); }, value: -1 },
    ];
    ((usersQuery.data ?? []) as ApiRecord[]).forEach(row => {
      const id = pickNumber(row, ['id']);
      options.push({
        key: String(id),
        label: pickString(row, ['full_name', 'username', 'email'], `User ${id}`),
        value: id,
      });
    });
    return options;
  }, [usersQuery.data, t]);

  const selectedPrinterLabel = useLocalizedMemo(
    () => printerOptions.find(option => option.value === selectedPrinterId)?.label ?? translateNative('native.b8ed6cb4c204100e'),
    [printerOptions, selectedPrinterId],
  );
  const selectedUserLabel = useLocalizedMemo(
    () => userOptions.find(option => option.value === selectedUserId)?.label ?? translateNative('native.c311af34acd4fa38'),
    [selectedUserId, userOptions],
  );

  const quickStats = useLocalizedMemo(() => ({
    totalPrints: pickNumber(statsQuery.data, ['total_prints', 'prints_count'], archives.length),
    successRate: pickNumber(statsQuery.data, ['success_rate'], pickNumber(statsQuery.data, ['total_prints']) > 0 ? pickNumber(statsQuery.data, ['successful_prints']) / pickNumber(statsQuery.data, ['total_prints']) : 0),
    printTime: pickNumber(statsQuery.data, ['total_print_time_seconds', 'total_print_time'], pickNumber(statsQuery.data, ['total_print_time_hours']) * 3600),
    filament: pickNumber(statsQuery.data, ['total_filament_grams', 'total_filament_g', 'filament_total_g'], 0),
    cost: pickNumber(statsQuery.data, ['total_cost', 'cost_total'], 0),
  }), [archives.length, statsQuery.data]);

  const heatmap = useLocalizedMemo(() => {
    const days: string[] = [];
    if (params.dateFrom && params.dateTo) {
      const cursor = new Date(`${params.dateFrom}T00:00:00`);
      const end = new Date(`${params.dateTo}T00:00:00`);
      while (cursor <= end) {
        days.push(cursor.toISOString().split('T')[0]);
        cursor.setDate(cursor.getDate() + 1);
      }
    } else {
      const uniqueDays = new Set<string>();
      archives.forEach(item => {
        const key = dayKey(getArchiveTimestamp(item));
        if (key) uniqueDays.add(key);
      });
      days.push(...Array.from(uniqueDays).sort());
    }
    const counts = new Map<string, number>();
    archives.forEach(item => {
      const key = dayKey(getArchiveTimestamp(item));
      if (!key) return;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    const max = Math.max(...Array.from(counts.values()), 0);
    return { days, counts, max };
  }, [archives, params.dateFrom, params.dateTo]);

  const filamentTrends = useLocalizedMemo(() => {
    const trendMap = new Map<string, { label: string; grams: number }>();
    archives.forEach(item => {
      const key = monthKey(getArchiveTimestamp(item));
      if (!key) return;
      const current = trendMap.get(key) ?? { label: key, grams: 0 };
      current.grams += pickNumber(item, ['filament_used_grams', 'filament_used_g'], 0);
      trendMap.set(key, current);
    });
    return Array.from(trendMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [archives]);

  const printerBreakdown = useLocalizedMemo(() => {
    const byPrinter = new Map<string, { name: string; prints: number; grams: number; failures: number }>();
    archives.forEach(item => {
      const key = printerNames[String(item.printer_id)] ?? printerKey(item);
      const current = byPrinter.get(key) ?? { name: key, prints: 0, grams: 0, failures: 0 };
      current.prints += 1;
      current.grams += pickNumber(item, ['filament_used_grams', 'filament_used_g'], 0);
      if (isFailure(item)) current.failures += 1;
      byPrinter.set(key, current);
    });
    return Array.from(byPrinter.values()).sort((a, b) => b.prints - a.prints);
  }, [archives, printerNames]);

  const materialBreakdown = useLocalizedMemo(() => {
    const rows = new Map<string, number>();
    archives.forEach(item => {
      const key = materialKey(item);
      rows.set(key, (rows.get(key) ?? 0) + pickNumber(item, ['filament_used_grams', 'filament_used_g'], 0));
    });
    return Array.from(rows.entries())
      .map(([name, grams]) => ({ name, grams }))
      .sort((a, b) => b.grams - a.grams);
  }, [archives]);

  const durationDistribution = useLocalizedMemo(() => {
    const buckets = [
      { get label() { return translateNative('native.eed6171f4de54462'); }, min: 0, max: 3600, count: 0 },
      { label: '1-2h', min: 3600, max: 7200, count: 0 },
      { label: '2-4h', min: 7200, max: 14400, count: 0 },
      { label: '4-8h', min: 14400, max: 28800, count: 0 },
      { label: '8-16h', min: 28800, max: 57600, count: 0 },
      { get label() { return translateNative('native.69bb9fb14d87863a'); }, min: 57600, max: Infinity, count: 0 },
    ];
    archives.forEach(item => {
      const seconds = pickNumber(item, ['actual_time_seconds', 'print_time_seconds', 'print_time', 'duration_seconds'], 0);
      if (seconds <= 0) return;
      const bucket = buckets.find(b => seconds >= b.min && seconds < b.max);
      if (bucket) bucket.count += 1;
    });
    return buckets;
  }, [archives]);

  const habitsData = useLocalizedMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const counts = new Array(7).fill(0);
    archives.forEach(item => {
      const date = new Date(getArchiveTimestamp(item));
      if (!Number.isNaN(date.getTime())) counts[date.getDay()] += 1;
    });
    return days.map((label, i) => ({ label, value: counts[i] }));
  }, [archives]);

  const hourlyData = useLocalizedMemo(() => {
    const hours = new Array(24).fill(0);
    archives.forEach(item => {
      const date = new Date(getArchiveTimestamp(item));
      if (!Number.isNaN(date.getTime())) hours[date.getHours()] += 1;
    });
    return hours.map((count, h) => ({ label: `${h}`, value: count }));
  }, [archives]);

  const failureRateByMaterial = useLocalizedMemo(() => buildFailureRates(archives, materialKey), [archives]);
  const failureRateByPrinter = useLocalizedMemo(() => buildFailureRates(
    archives,
    item => item.printer_id == null ? `name:${printerKey(item)}` : `id:${item.printer_id}`,
    item => printerKey(item, printerNames),
  ), [archives, printerNames]);
  const failureRateByTimeOfDay = useLocalizedMemo(() => buildFailureRates(archives, timeBucket), [archives]);
  const failureReasons = useLocalizedMemo(() => {
    const rows = new Map<string, number>();
    archives.filter(isFailure).forEach(item => {
      const key = failureReasonKey(item);
      rows.set(key, (rows.get(key) ?? 0) + 1);
    });
    return Array.from(rows.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }, [archives]);

  if (statsQuery.isLoading || archivesQuery.isLoading) {
    return <LoadingScreen message={translateNative('native.78103ae6f7539825')} />;
  }

  if (statsQuery.isError || archivesQuery.isError) {
    return (
      <ErrorState
        message={translateNative('native.d259ab430ccef33c')}
        onRetry={() => void refreshAll()}
      />
    );
  }

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={
              statsQuery.isRefetching ||
              archivesQuery.isRefetching ||
              printersQuery.isRefetching ||
              usersQuery.isRefetching
            }
            onRefresh={() => void refreshAll()}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>{translateNative('native.1e998d66d2ced9cd')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{translateNative('native.4432e07e01f3ee7d')}</Text>
        </View>

        <ReportRangeControls
          value={range}
          scope={params}
          onApply={(value, dates) => { setCustomDates(dates ?? {}); setRange(value); }}
        />

        {(selectedPrinterId !== null || selectedUserId !== null) && (
          <View style={styles.activeFilters}>
            <Text style={[styles.activeFiltersLabel, { color: colors.textSecondary }]}>{translateNative('native.ea8a72360e8512f1')}</Text>
            {selectedPrinterId !== null && (
              <Pressable
                style={[styles.filterBadge, { backgroundColor: colors.accentBg, borderColor: `${colors.accent}44` }]}
                onPress={() => setSelectedPrinterId(null)}
              >
                <Text style={[styles.filterBadgeText, { color: colors.accent }]} numberOfLines={1}>
                  🖨️ {selectedPrinterLabel}
                </Text>
              </Pressable>
            )}
            {selectedUserId !== null && (
              <Pressable
                style={[styles.filterBadge, { backgroundColor: colors.accentBg, borderColor: `${colors.accent}44` }]}
                onPress={() => setSelectedUserId(null)}
              >
                <Text style={[styles.filterBadgeText, { color: colors.accent }]} numberOfLines={1}>
                  👤 {selectedUserLabel}
                </Text>
              </Pressable>
            )}
            <Pressable onPress={() => { setSelectedPrinterId(null); setSelectedUserId(null); }} style={styles.clearFiltersBadge}>
              <Text style={[styles.clearFiltersText, { color: colors.textSecondary }]}>{translateNative('native.e0c9e7047ac670ee')}</Text>
            </Pressable>
          </View>
        )}

        <SectionCard title={translateNative('native.96c944d7b6cedf1a')} subtitle={translateNative('native.d36309c1d711dd12')}>
          <View style={styles.filterGrid}>
            <Pressable style={[styles.filterButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]} onPress={() => setSelector('printer')}>
              <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>{translateNative('screen.printer')}</Text>
              <Text style={[styles.filterValue, { color: colors.text }]} numberOfLines={1}>{selectedPrinterLabel}</Text>
            </Pressable>
            {canFilterUser ? (
              <Pressable style={[styles.filterButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]} onPress={() => setSelector('user')}>
                <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>{translateNative('native.79911ae711e1198c')}</Text>
                <Text style={[styles.filterValue, { color: colors.text }]} numberOfLines={1}>{selectedUserLabel}</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.actions}>
            <PrimaryButton
              label={exportMutation.isPending ? translateNative('native.d437dda8a411fea8') : translateNative('native.0b34e87efafc8013')}
              variant="secondary"
              onPress={() => void exportMutation.mutateAsync('csv')}
              loading={exportMutation.isPending}
              disabled={exportMutation.isPending}
            />
            <PrimaryButton
              label={exportMutation.isPending ? translateNative('native.d437dda8a411fea8') : translateNative('native.4a9a8c12888936dd')}
              variant="secondary"
              onPress={() => void exportMutation.mutateAsync('xlsx')}
              loading={exportMutation.isPending}
              disabled={exportMutation.isPending}
            />
            <PrimaryButton
              label={exportMutation.isPending ? translateNative('native.d437dda8a411fea8') : translateNative('native.acf1a2579eb4526f')}
              variant="secondary"
              onPress={() => void exportMutation.mutateAsync('json')}
              loading={exportMutation.isPending}
              disabled={exportMutation.isPending}
            />
            <PrimaryButton
              label={statsSummaryMutation.isPending ? translateNative('native.d437dda8a411fea8') : translateNative('native.4efb8b780f21a5cd')}
              variant="secondary"
              onPress={() => void statsSummaryMutation.mutateAsync()}
              loading={statsSummaryMutation.isPending}
              disabled={statsSummaryMutation.isPending}
            />
          </View>
          {hasPermission('archives:update_all') && <PrimaryButton
            label={recalculateCostsMutation.isPending ? translateNative('native.a016f35810e12eec') : translateNative('native.5d8b340ffecf3406')}
            onPress={() => void recalculateCostsMutation.mutateAsync()}
            loading={recalculateCostsMutation.isPending}
            disabled={recalculateCostsMutation.isPending}
          />}
        </SectionCard>

        <View style={styles.grid}>
          <StatCard label={translateNative('native.185578091a522c97')} value={String(Math.round(quickStats.totalPrints))} />
          <StatCard label={translateNative('native.41d8c0b0fb9ced09')} value={formatPercent(quickStats.successRate, 1)} />
          <StatCard label={translateNative('native.e3f6c45e9f8c8d80')} value={formatDuration(quickStats.printTime)} />
          <StatCard label={translateNative('native.844d300a3502db9f')} value={formatWeight(quickStats.filament)} />
          <StatCard label={translateNative('common.cost')} value={formatCurrency(quickStats.cost)} />
        </View>

        {canFilterUser && selectedUserId !== null && (
          <SectionCard
            title={translateNative('native.bf2a3f4f2464a499')}
            subtitle={translateNative('native.fc38f171550352da', { value0: String(selectedUserLabel) })}
          >
            <View style={[styles.userDetailCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
              <View style={styles.userDetailRow}>
                <Text style={[styles.userDetailLabel, { color: colors.textSecondary }]}>{translateNative('native.41a4a4d43f428c88')}</Text>
                <Text style={[styles.userDetailValue, { color: colors.text }]}>{selectedUserId}</Text>
              </View>
              <View style={[styles.userDetailDivider, { backgroundColor: colors.border }]} />
              <View style={styles.userDetailRow}>
                <Text style={[styles.userDetailLabel, { color: colors.textSecondary }]}>{translateNative('native.25aa70e7a115eef2')}</Text>
                <Text style={[styles.userDetailValue, { color: colors.text }]} numberOfLines={2}>{selectedUserLabel}</Text>
              </View>
              <View style={[styles.userDetailDivider, { backgroundColor: colors.border }]} />
              <View style={styles.userDetailRow}>
                <Text style={[styles.userDetailLabel, { color: colors.textSecondary }]}>{translateNative('native.736e819e822204c0')}</Text>
                <Text style={[styles.userDetailValue, { color: colors.accent }]}>
                  {String(Math.round(quickStats.totalPrints))}
                </Text>
              </View>
              <View style={[styles.userDetailDivider, { backgroundColor: colors.border }]} />
              <View style={styles.userDetailRow}>
                <Text style={[styles.userDetailLabel, { color: colors.textSecondary }]}>{translateNative('native.2b991e7b05d0d160')}</Text>
                <Text style={[styles.userDetailValue, { color: colors.accent }]}>{formatWeight(quickStats.filament)}</Text>
              </View>
              <View style={[styles.userDetailDivider, { backgroundColor: colors.border }]} />
              <View style={styles.userDetailRow}>
                <Text style={[styles.userDetailLabel, { color: colors.textSecondary }]}>{translateNative('native.3e7049754bd78122')}</Text>
                <Text style={[styles.userDetailValue, { color: colors.accent }]}>{formatCurrency(quickStats.cost)}</Text>
              </View>
              <View style={[styles.userDetailDivider, { backgroundColor: colors.border }]} />
              <View style={styles.userDetailRow}>
                <Text style={[styles.userDetailLabel, { color: colors.textSecondary }]}>{translateNative('native.ca4716dc67ff2ce8')}</Text>
                <Text style={[styles.userDetailValue, { color: colors.accent }]}>{formatDuration(quickStats.printTime)}</Text>
              </View>
              <View style={[styles.userDetailDivider, { backgroundColor: colors.border }]} />
              <View style={styles.userDetailRow}>
                <Text style={[styles.userDetailLabel, { color: colors.textSecondary }]}>{translateNative('native.03009a45705d4dfc')}</Text>
                <Text style={[styles.userDetailValue, { color: colors.accent }]}>{formatPercent(quickStats.successRate, 1)}</Text>
              </View>
            </View>
            {usersQuery.isLoading ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{translateNative('native.86a90a467bf9c675')}</Text>
            ) : usersQuery.isError ? (
              <Text style={[styles.emptyText, { color: colors.warning }]}>{translateNative('native.bb45b731e25f87c0')}</Text>
            ) : usersQuery.isSuccess && usersData.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{translateNative('native.193b5ce7bd9771ed')}</Text>
            ) : null}
          </SectionCard>
        )}

        <ReportLayout summaries={{
          'Failure Analysis': `${failureRateByMaterial.reduce((sum, row) => sum + row.failures, 0)} / ${archives.length}`,
          'Activity heatmap': `${heatmap.days.length} · ${archives.length}`,
          'Filament trends': formatWeight(quickStats.filament),
          'Printer breakdown': `${printerBreakdown.length} · ${archives.length}`,
          'Print duration distribution': formatDuration(quickStats.printTime),
          'Print habits': `${archives.length}`,
          'Time of day': `${hourlyData.filter(row => row.value > 0).length} / 24`,
          accuracy: statsQuery.data?.average_time_accuracy == null ? t('stats.noAccuracy', { defaultValue: 'No estimate data' }) : `${statsQuery.data.average_time_accuracy}%`,
          records: `${archives.length} ${t('stats.recordEvents', { defaultValue: 'print events considered' })}`,
          exploration: `${formatWeight(quickStats.filament)} · ${formatDuration(quickStats.printTime)} · ${archives.length}`,
          purchasing: t('stats.currentStock', { defaultValue: 'Current stock; consumption and cost follow selected dates.' }),
        }}>
        <SectionCard key="accuracy" title={t('stats.estimateAccuracy', { defaultValue: 'Estimate accuracy' })}>
          <AccuracyReport stats={statsQuery.data ?? {}} printerNames={printerNames} />
        </SectionCard>
        <SectionCard key="records" title={t('stats.recordsStreaks', { defaultValue: 'Records and streaks' })}>
          <RecordsReport archives={archives} currency={reportCurrency} />
        </SectionCard>
        <SectionCard key="exploration" title={t('stats.exploration', { defaultValue: 'Report exploration' })}>
          <ExplorationReport archives={archives} printerNames={printerNames} currency={reportCurrency} scope={queryParams} />
        </SectionCard>
        {inventoryMode.data !== true && <SectionCard key="purchasing" title={t('stats.purchasing', { defaultValue: 'Purchasing reports' })}>
          <PurchasingReports scope={queryParams} currency={reportCurrency} />
        </SectionCard>}
        <SectionCard title={translateNative('nav.failure-analysis')} subtitle={translateNative('native.af4358d15cbc725b')}>
          <FailureList title={translateNative('native.c22d8f8cea134ef5')} rows={failureRateByMaterial} colors={colors} formatValue={row => `${formatPercent(row.rate, 0)} • ${row.failures}/${row.total}`} />
          <FailureList title={translateNative('native.1431e6d7a579da92')} rows={failureRateByPrinter} colors={colors} formatValue={row => `${formatPercent(row.rate, 0)} • ${row.failures}/${row.total}`} />
          <FailureList title={translateNative('native.4b1e36ad9ff19a2c')} rows={failureRateByTimeOfDay} colors={colors} formatValue={row => `${formatPercent(row.rate, 0)} • ${row.failures}/${row.total}`} />
          <FailureReasonList rows={failureReasons} colors={colors} />
        </SectionCard>

        <SectionCard title={translateNative('native.94d43ac1d977be00')} subtitle={translateNative('native.4c4c75cf0974da8e')}>
          <View style={styles.heatmapWrap}>
            {heatmap.days.map(day => (
              <View key={day} style={styles.heatmapItem}>
                <View
                  style={[
                    styles.heatmapCell,
                    { backgroundColor: cellColor(heatmap.counts.get(day) ?? 0, heatmap.max, colors) },
                  ]}
                />
                <Text style={[styles.heatmapLabel, { color: colors.textTertiary }]}>
                  {formatDate(day).slice(0, 5)}
                </Text>
              </View>
            ))}
          </View>
        </SectionCard>

        <SectionCard title={translateNative('native.38483102ad776003')} subtitle={translateNative('native.b51fade981aebeb3')}>
          {filamentTrends.length > 0 ? (
            filamentTrends.map(row => {
              const max = Math.max(...filamentTrends.map(entry => entry.grams), 1);
              return (
                <View key={row.label} style={styles.barRow}>
                  <View style={styles.barHeader}>
                    <Text style={[styles.barLabel, { color: colors.text }]}>{row.label}</Text>
                    <Text style={[styles.barValue, { color: colors.textSecondary }]}>{formatWeight(row.grams)}</Text>
                  </View>
                  <View style={[styles.barTrack, { backgroundColor: colors.surfaceElevated }]}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${(row.grams / max) * 100}%`, backgroundColor: colors.accent },
                      ]}
                    />
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{translateNative('native.02a26f8675328478')}</Text>
          )}
          {materialBreakdown.length > 0 ? (
            <View style={styles.materialWrap}>
              {materialBreakdown.map(row => (
                <View key={row.name} style={[styles.materialChip, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                  <Text style={[styles.materialName, { color: colors.text }]}>{row.name}</Text>
                  <Text style={[styles.materialValue, { color: colors.textSecondary }]}>{formatWeight(row.grams)}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </SectionCard>

        <SectionCard title={translateNative('native.511b7e03670c82e5')} subtitle={translateNative('native.9766388731d2ddd3')}>
          {printerBreakdown.length > 0 ? (
            printerBreakdown.map(printer => (
              <View
                key={printer.name}
                style={[
                  styles.printerRow,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
              >
                <View style={styles.printerHeader}>
                  <Text style={[styles.printerName, { color: colors.text }]}>{printer.name}</Text>
                  <Text style={[styles.printerCount, { color: colors.textSecondary }]}><NativeTranslation id="native.2a5721842f3783d9" values={{ value0: (printer.prints) }} /></Text>
                </View>
                <View style={styles.printerStats}>
                  <Text style={[styles.printerMeta, { color: colors.textSecondary }]}><NativeTranslation id="native.b31e5fb0ff81b7b5" values={{ value0: (formatWeight(printer.grams)) }} /></Text>
                  <Text style={[styles.printerMeta, { color: printer.failures > 0 ? colors.warning : colors.textSecondary }]}><NativeTranslation id="native.78a7e802de4a2396" values={{ value0: (printer.failures) }} /></Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{translateNative('native.9921898254f89202')}</Text>
          )}
        </SectionCard>

        <SectionCard title={translateNative('native.d2a3f0c42a783b66')} subtitle={translateNative('native.e2ca59e57fabf101')}>
          {durationDistribution.some(b => b.count > 0) ? (
            <SimpleBarChart
              data={durationDistribution.map(b => ({ label: b.label, value: b.count }))}
              height={160}
            />
          ) : (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{translateNative('native.391f8c27cfbf7624')}</Text>
          )}
        </SectionCard>

        <SectionCard title={translateNative('native.f221a4b0bd59714f')} subtitle={translateNative('native.11b422545ca01fef')}>
          {habitsData.some(d => d.value > 0) ? (
            <SimpleBarChart
              data={habitsData.map(d => ({ label: d.label, value: d.value, color: colors.info }))}
              height={160}
            />
          ) : (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{translateNative('native.4c32def2caf928c0')}</Text>
          )}
        </SectionCard>

        <SectionCard title={translateNative('native.68bcf106e2b5c209')} subtitle={translateNative('native.6e447cc9bab39acc')}>
          {hourlyData.some(d => d.value > 0) ? (
            <SimpleBarChart
              data={hourlyData.map(d => ({ label: d.label, value: d.value, color: colors.warning }))}
              height={160}
            />
          ) : (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{translateNative('native.29d4e3595729d58f')}</Text>
          )}
        </SectionCard>
        </ReportLayout>
      </ScrollView>

      <SelectionModal
        visible={selector === 'printer'}
        title={translateNative('native.e45e1427971b8b4c')}
        options={printerOptions}
        selectedValue={selectedPrinterId}
        onClose={() => setSelector(null)}
        onSelect={value => {
          setSelectedPrinterId(value);
          setSelector(null);
        }}
      />

      <SelectionModal
        visible={selector === 'user'}
        title={translateNative('native.82b311825b5bbbcc')}
        options={userOptions}
        selectedValue={selectedUserId}
        onClose={() => setSelector(null)}
        onSelect={value => {
          setSelectedUserId(value);
          setSelector(null);
        }}
      />
    </>
  );
}

function FailureList({
  title,
  rows,
  colors,
  formatValue,
}: {
  title: string;
  rows: { key?: string; label: string; total: number; failures: number; rate: number }[];
  colors: ReturnType<typeof useTheme>['colors'];
  formatValue: (row: { label: string; total: number; failures: number; rate: number }) => string;
}) {
  useNativeLocale();
  if (rows.length === 0) {
    return <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{translateNative('native.0956166278de8ee6')}</Text>;
  }

  const max = Math.max(...rows.map(row => row.rate), 0.01);

  return (
    <View style={styles.failureSection}>
      <Text style={[styles.failureTitle, { color: colors.text }]}>{title}</Text>
      {rows.map(row => (
        <View key={row.key ?? row.label} style={styles.barRow}>
          <View style={styles.barHeader}>
            <Text style={[styles.barLabel, { color: colors.text }]}>{row.label}</Text>
            <Text style={[styles.barValue, { color: colors.textSecondary }]}>{formatValue(row)}</Text>
          </View>
          <View style={[styles.barTrack, { backgroundColor: colors.surfaceElevated }]}>
            <View
              style={[
                styles.barFill,
                { width: `${(row.rate / max) * 100}%`, backgroundColor: colors.warning },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function FailureReasonList({
  rows,
  colors,
}: {
  rows: { label: string; count: number }[];
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  useNativeLocale();
  if (rows.length === 0) {
    return <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{translateNative('native.8dc865ae121c119b')}</Text>;
  }

  const max = Math.max(...rows.map(row => row.count), 1);

  return (
    <View style={styles.failureSection}>
      <Text style={[styles.failureTitle, { color: colors.text }]}>{translateNative('native.aa8f6565bb671aa5')}</Text>
      {rows.map(row => (
        <View key={row.label} style={styles.barRow}>
          <View style={styles.barHeader}>
            <Text style={[styles.barLabel, { color: colors.text }]} numberOfLines={1}>{row.label}</Text>
            <Text style={[styles.barValue, { color: colors.textSecondary }]}>{row.count}</Text>
          </View>
          <View style={[styles.barTrack, { backgroundColor: colors.surfaceElevated }]}>
            <View
              style={[
                styles.barFill,
                { width: `${(row.count / max) * 100}%`, backgroundColor: colors.accent },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function SelectionModal({
  visible,
  title,
  options,
  selectedValue,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  options: SelectorOption[];
  selectedValue: number | null;
  onClose: () => void;
  onSelect: (value: number | null) => void;
}) {
  useNativeLocale();
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]} onPress={onClose}>
        <Pressable style={[styles.modalCard, { backgroundColor: colors.surface }]} onPress={() => {}}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text>
          <FlatList
            data={options}
            keyExtractor={item => item.key}
            renderItem={({ item }) => {
              const selected = item.value === selectedValue;
              return (
                <Pressable
                  style={[
                    styles.modalOption,
                    {
                      backgroundColor: selected ? colors.accentBg : colors.surfaceElevated,
                      borderColor: selected ? colors.accent : colors.border,
                    },
                  ]}
                  onPress={() => onSelect(item.value)}
                >
                  <Text style={[styles.modalOptionLabel, { color: selected ? colors.accent : colors.text }]}>{item.label}</Text>
                </Pressable>
              );
            }}
            ItemSeparatorComponent={SelectionItemSeparator}
          />
          <PrimaryButton label={translateNative('common.close')} variant="secondary" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SelectionItemSeparator() {
  useNativeLocale();
  return <View style={{ height: spacing.sm }} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  header: { gap: spacing.xs },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    fontSize: fontSize.base,
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  filterButton: {
    flex: 1,
    minWidth: 140,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  filterLabel: {
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  filterValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  activeFilters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  activeFiltersLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  filterBadge: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  filterBadgeText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  clearFiltersBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  clearFiltersText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textDecorationLine: 'underline',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  failureSection: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  failureTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  heatmapWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  heatmapItem: {
    width: 44,
    gap: spacing.xs,
    alignItems: 'center',
  },
  heatmapCell: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
  },
  heatmapLabel: {
    fontSize: fontSize.xs,
  },
  barRow: {
    gap: spacing.xs,
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  barLabel: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  barValue: {
    fontSize: fontSize.sm,
  },
  barTrack: {
    height: 8,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  materialWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  materialChip: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  materialName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  materialValue: {
    fontSize: fontSize.xs,
  },
  printerRow: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  printerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  printerName: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  printerCount: {
    fontSize: fontSize.sm,
  },
  printerStats: {
    gap: spacing.xs,
  },
  printerMeta: {
    fontSize: fontSize.sm,
  },
  emptyText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  userDetailCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  userDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  userDetailLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  userDetailValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    textAlign: 'right',
  },
  userDetailDivider: {
    height: 1,
    borderRadius: 1,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    maxHeight: '80%',
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  modalOption: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  modalOptionLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
});
