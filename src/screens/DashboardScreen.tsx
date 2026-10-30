import { NativeTranslation, nativeEnglishSuffix, nativeMessage, translateNative, useLocalizedMemo, useNativeLocale, useTranslation } from '@/i18n';


import React, { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MainTabNavigationProp } from '@/navigation/types';
import {
  FlatList,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  Switch,
  View,
} from 'react-native';
import {
  useQueries,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Grid2x2, List, ListChecks, Plus, SlidersHorizontal } from 'lucide-react-native';
import { api } from '@/api/client';
import {
  InlineTabBar,
  PrimaryButton,
  SearchBar,
} from '@/components/common/AppUI';
import {
  EmptyState,
  ErrorState,
  LoadingScreen,
} from '@/components/common/StateScreens';
import { AddPrinterModal } from '@/components/printers/AddPrinterModal';
import { PrinterCard } from '@/components/printers/PrinterCard';
import { PrintModal } from '@/components/printers/PrintModal';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useTheme } from '@/theme';

import { FleetModal } from '@/components/printers/FleetModal';
import { countFleetStates, isBulkApplicable, type FleetBulkAction } from '@/utils/printerFleet';
import { borderRadius, fontSize, spacing } from '@/theme/tokens';
import type {
  MaintenanceStatus,
  Printer,
  PrinterStatus,
  PrintQueueItem,
} from '@/types/api';

const FILTERS = [
  { key: 'all', get label() { return translateNative('common.all'); } },
  { key: 'printing', get label() { return translateNative('native.58b5ceab5adaa853'); } },
  { key: 'paused', get label() { return translateNative('native.2e8d3baadb9cc3fd'); } },
  { key: 'finished', get label() { return translateNative('native.90a4f4400cd3eda4'); } },
  { key: 'idle', get label() { return translateNative('native.a3b81f922d798281'); } },
  { key: 'issues', get label() { return translateNative('native.5e5e66783e07dfdd'); } },
  { key: 'offline', get label() { return translateNative('native.460c8b942025eaac'); } },
] as const;

type FilterMode = (typeof FILTERS)[number]['key'];
type PrinterMode = Exclude<FilterMode, 'all'>;
export type PrinterSortMode = 'name' | 'status' | 'lastActivity' | 'location' | 'model' | 'connected' | 'eta';
export type PrinterSortSecondaryMode = 'name' | 'status' | 'lastActivity' | 'none';

const SORT_OPTIONS: Array<{ key: PrinterSortMode; label: string; icon: string; description: string }> = [
  { key: 'eta', get label() { return translateNative('native.b9acbc48541e900b', { defaultValue: 'ETA' }); }, icon: '◷', get description() { return translateNative('native.cdbdb7d530f9da19'); } },
  { key: 'status', get label() { return translateNative('common.status'); }, icon: '●', get description() { return translateNative('native.0b53bded2ebc258e'); } },
  { key: 'connected', get label() { return translateNative('native.338a8c40557b22a0'); }, icon: '⚡', get description() { return translateNative('native.fe191ecc175c98e2'); } },
  { key: 'lastActivity', get label() { return translateNative('native.f9bccf042f8c0879'); }, icon: '↻', get description() { return translateNative('native.a924f3f1aae1052b'); } },
  { key: 'location', get label() { return translateNative('native.4fa01b8a6af1174b'); }, icon: '📍', get description() { return translateNative('native.daaec73245e536c1'); } },
  { key: 'model', get label() { return translateNative('native.8b62363d3367fc41'); }, icon: '⚙', get description() { return translateNative('native.96a5b5b100d64755'); } },
  { key: 'name', get label() { return translateNative('common.name'); }, icon: 'Aa', get description() { return translateNative('native.4d3338627aa15683'); } },
];

const SECONDARY_SORT_OPTIONS: Array<{ key: PrinterSortSecondaryMode; label: string }> = [
  { key: 'name', get label() { return translateNative('common.name'); } },
  { key: 'status', get label() { return translateNative('common.status'); } },
  { key: 'lastActivity', get label() { return translateNative('native.f9bccf042f8c0879'); } },
  { key: 'none', get label() { return translateNative('common.none'); } },
];

const PRINTER_SORT_STORAGE_KEY = 'bambuddy-printer-sort';
const PRINTER_SORT_SECONDARY_KEY = 'bambuddy-printer-sort-secondary';
const STATUS_SORT_RANK: Record<PrinterMode, number> = {
  issues: 0,
  printing: 1,
  paused: 2,
  finished: 3,
  idle: 3,
  offline: 4,
};

interface MaintenanceSummary {
  dueCount: number;
  warningCount: number;
  items: MaintenanceStatus[];
}

function ListSeparator() {
  useNativeLocale();
  return <View style={styles.separator} />;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function collectLoadedTypes(status?: PrinterStatus) {
  const types = new Set<string>();

  for (const ams of status?.ams ?? []) {
    for (const tray of ams.tray ?? []) {
      if (tray.tray_type) types.add(tray.tray_type.toUpperCase());
    }
  }

  for (const tray of status?.vt_tray ?? []) {
    if (tray.tray_type) types.add(tray.tray_type.toUpperCase());
  }

  return types;
}

function collectLoadedFilaments(status?: PrinterStatus) {
  const filaments = new Set<string>();

  const addTray = (type: string | null | undefined, color: string | null | undefined) => {
    if (!type || !color) return;
    const normalized = color.replace('#', '').toLowerCase().slice(0, 6);
    filaments.add(`${type.toUpperCase()}:${normalized}`);
  };

  for (const ams of status?.ams ?? []) {
    for (const tray of ams.tray ?? []) {
      addTray(tray.tray_type, tray.tray_color);
    }
  }

  for (const tray of status?.vt_tray ?? []) {
    addTray(tray.tray_type, tray.tray_color);
  }

  return filaments;
}

export function queueItemMatchesPrinter(
  printer: Printer,
  status: PrinterStatus | undefined,
  item: PrintQueueItem,
) {
  if (item.status !== 'pending') return false;

  if (item.printer_id != null) {
    return item.printer_id === printer.id;
  }

  if (item.target_model && normalizeText(item.target_model) !== normalizeText(printer.model)) {
    return false;
  }

  if (item.target_location && normalizeText(item.target_location) !== normalizeText(printer.location)) {
    return false;
  }

  if (!item.target_model && !item.target_location) {
    return false;
  }

  const loadedTypes = collectLoadedTypes(status);
  const loadedFilaments = collectLoadedFilaments(status);

  if (item.required_filament_types?.length) {
    const hasEveryType = item.required_filament_types.every(type =>
      loadedTypes.has(type.toUpperCase()),
    );
    if (!hasEveryType) return false;
  }

  if (item.filament_overrides?.length) {
    const forcedOverrides = item.filament_overrides.filter(
      override => override.force_color_match === true,
    );
    const preferredOverrides = item.filament_overrides.filter(
      override => override.force_color_match !== true,
    );

    if (forcedOverrides.length > 0) {
      const hasAllForced = forcedOverrides.every(override => {
        const color = override.color.replace('#', '').toLowerCase().slice(0, 6);
        const idx = (override as typeof override & { tray_info_idx?: string | null }).tray_info_idx;
        if (!idx) return loadedFilaments.has(`${override.type.toUpperCase()}:${color}`);
        const trays = [...(status?.ams.flatMap(ams => ams.tray) ?? []), ...(status?.vt_tray ?? [])];
        return trays.some(tray => tray.tray_type?.toUpperCase() === override.type.toUpperCase() &&
          tray.tray_color?.replace('#', '').toLowerCase().slice(0, 6) === color &&
          (!tray.tray_info_idx || tray.tray_info_idx === idx));
      });
      if (!hasAllForced) return false;
    }

    if (preferredOverrides.length > 0 && forcedOverrides.length === 0) {
      const hasAnyPreferred = preferredOverrides.some(override => {
        const color = override.color.replace('#', '').toLowerCase().slice(0, 6);
        return loadedFilaments.has(`${override.type.toUpperCase()}:${color}`);
      });
      if (!hasAnyPreferred) return false;
    }
  }

  return true;
}

function classifyPrinter(
  printer: Printer,
  status: PrinterStatus | undefined,
  maintenance: MaintenanceSummary | undefined,
): PrinterMode {
  if (printer.is_active === false) return 'issues';
  if (!status?.connected) return 'offline';
  if ((status.hms_errors?.length ?? 0) > 0) return 'issues';
  if ((maintenance?.dueCount ?? 0) > 0) return 'issues';
  if (status.state === 'RUNNING') return 'printing';
  if (status.state === 'PAUSE') return 'paused';
  if (status.state === 'FAILED') return 'issues';
  if (status.state === 'FINISH') return 'finished';
  return 'idle';
}

export function comparePrinters(
  first: Printer,
  second: Printer,
  sortBy: PrinterSortMode,
  statusByPrinter: ReadonlyMap<number, PrinterStatus | undefined>,
  maintenanceByPrinter: ReadonlyMap<number, MaintenanceSummary | undefined>,
  secondarySort?: PrinterSortSecondaryMode,
) {
  const compareNames = () =>
    first.name.localeCompare(second.name, undefined, { sensitivity: 'base' }) ||
    first.id - second.id;

  const compareLastActivity = () => {
    const firstUpdated = new Date(first.updated_at ?? first.created_at).getTime();
    const secondUpdated = new Date(second.updated_at ?? second.created_at).getTime();
    return secondUpdated - firstUpdated || compareNames();
  };

  const compareConnected = () => {
    const firstConnected = statusByPrinter.get(first.id)?.connected ?? false;
    const secondConnected = statusByPrinter.get(second.id)?.connected ?? false;
    if (firstConnected === secondConnected) {
      return compareLastActivity();
    }
    return firstConnected ? -1 : 1;
  };

  const compareLocation = () => {
    const firstLoc = normalizeText(first.location);
    const secondLoc = normalizeText(second.location);
    if (firstLoc === secondLoc) return compareNames();
    if (!firstLoc) return 1;
    if (!secondLoc) return -1;
    return firstLoc.localeCompare(secondLoc, undefined, { sensitivity: 'base' }) || compareNames();
  };

  const compareModel = () => {
    const firstModel = normalizeText(first.model);
    const secondModel = normalizeText(second.model);
    if (firstModel === secondModel) return compareNames();
    if (!firstModel) return 1;
    if (!secondModel) return -1;
    return firstModel.localeCompare(secondModel, undefined, { sensitivity: 'base' }) || compareNames();
  };

  const compareStatus = () => {
    const firstMode = classifyPrinter(
      first,
      statusByPrinter.get(first.id),
      maintenanceByPrinter.get(first.id),
    );
    const secondMode = classifyPrinter(
      second,
      statusByPrinter.get(second.id),
      maintenanceByPrinter.get(second.id),
    );

    return STATUS_SORT_RANK[firstMode] - STATUS_SORT_RANK[secondMode] || compareNames();
  };

  const applySecondary = (baseResult: number) => {
    if (secondarySort === 'none' || secondarySort === sortBy) return baseResult;
    if (secondarySort === 'name') return baseResult || compareNames();
    if (secondarySort === 'status') return baseResult || compareStatus();
    if (secondarySort === 'lastActivity') return baseResult || compareLastActivity();
    return baseResult;
  };

  if (sortBy === 'name') return applySecondary(compareNames());
  if (sortBy === 'lastActivity') return applySecondary(compareLastActivity());
  if (sortBy === 'connected') return applySecondary(compareConnected());
  if (sortBy === 'location') return applySecondary(compareLocation());
  if (sortBy === 'model') return applySecondary(compareModel());
  if (sortBy === 'eta') {
    const eta = (printer: Printer) => {
      const status = statusByPrinter.get(printer.id);
      if (!status?.connected) return { tier: 3, minutes: 0 };
      if (status.state !== 'RUNNING') return { tier: 2, minutes: 0 };
      if (status.remaining_time == null || status.remaining_time <= 0) return { tier: 1, minutes: 0 };
      return { tier: 0, minutes: status.remaining_time };
    };
    const a = eta(first);
    const b = eta(second);
    return applySecondary(a.tier - b.tier || a.minutes - b.minutes) || compareNames();
  }

  return applySecondary(compareStatus());
}

export default function PrintersDashboardScreen() {
  const titleLocale = useNativeLocale();
  const navigation = useNavigation<MainTabNavigationProp<'Dashboard'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: translateNative('nav.printers') });
  }, [navigation, titleLocale]);

  const { colors } = useTheme();
  const { hasAnyPermission, hasPermission } = useAuth();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { isConnected: wsConnected } = useWebSocket();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [hideOffline, setHideOffline] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [descending, setDescending] = useState(false);
  const [choices, setChoices] = useState<{ title: string; options: { label: string; select: () => void }[] } | null>(null);
  const [sortBy, setSortBy] = useState<PrinterSortMode>('status');
  const [sortSecondary, setSortSecondary] = useState<PrinterSortSecondaryMode>('name');
  const [viewMode, setViewMode] = useState<'normal' | 'compact'>('normal');
  const [snapshotSeed, setSnapshotSeed] = useState(0);
  const [printPrinterId, setPrintPrinterId] = useState<number | null>(null);
  const [showAddPrinter, setShowAddPrinter] = useState(false);
  const [selectedPrinterIds, setSelectedPrinterIds] = useState<number[]>([]);

  const addPrinterMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.createPrinter(data),
    onSuccess: () => {
      setShowAddPrinter(false);
      queryClient.invalidateQueries({ queryKey: ['printers'] });
    },
  });

  useEffect(() => {
    let cancelled = false;

    const loadSortPreference = async () => {
      try {
        const storedSort = await AsyncStorage.getItem(PRINTER_SORT_STORAGE_KEY);
        const storedSecondary = await AsyncStorage.getItem(PRINTER_SORT_SECONDARY_KEY);
        if (!cancelled && (storedSort === 'name' || storedSort === 'status' || storedSort === 'lastActivity' || storedSort === 'location' || storedSort === 'model' || storedSort === 'connected' || storedSort === 'eta')) {
          setSortBy(storedSort);
        }
        if (!cancelled && (storedSecondary === 'name' || storedSecondary === 'status' || storedSecondary === 'lastActivity' || storedSecondary === 'none')) {
          setSortSecondary(storedSecondary);
        }
      } catch {
        if (!cancelled) {
          showToast(nativeMessage('native.1b9b68d107b6538a'), 'warning');
        }
      }
    };

    void loadSortPreference();

    return () => {
      cancelled = true;
    };
  }, [showToast]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSnapshotSeed(current => current + 1);
    }, 15_000);

    return () => clearInterval(interval);
  }, []);

  const printersQuery = useQuery({
    queryKey: ['printers'],
    queryFn: async () => (await api.getPrinters()) as unknown as Printer[],
  });

  const queueQuery = useQuery({
    queryKey: ['queue'],
    queryFn: async () => (await api.getQueue()) as unknown as PrintQueueItem[],
    enabled: hasAnyPermission('queue:read', 'queue:read_all', 'queue:read_own'),
  });

  const maintenanceQuery = useQuery({
    queryKey: ['maintenanceTasks'],
    queryFn: async () =>
      (await api.getMaintenanceTasks()) as unknown as MaintenanceStatus[],
    enabled: hasAnyPermission('maintenance:read'),
  });

  const assignmentsQuery = useQuery({
    queryKey: ['spool-assignments'],
    queryFn: () => api.getAssignments(),
    staleTime: 30_000,
  });

  const selectionMode = selectedPrinterIds.length > 0;

  const printers = useLocalizedMemo(() => printersQuery.data ?? [], [printersQuery.data]);

  const statusQueries = useQueries({
    queries: printers.map(printer => ({
      queryKey: ['printerStatus', printer.id],
      queryFn: async () =>
        (await api.getPrinterStatus(printer.id)) as unknown as PrinterStatus,
      refetchInterval: 15_000,
      staleTime: 5_000,
    })),
  });

  const statusByPrinter = useLocalizedMemo(() => {
    const map = new Map<number, PrinterStatus | undefined>();
    printers.forEach((printer, index) => {
      map.set(printer.id, statusQueries[index]?.data);
    });
    return map;
  }, [printers, statusQueries]);

  const statusQueryByPrinter = useLocalizedMemo(() => {
    const map = new Map<number, (typeof statusQueries)[number] | undefined>();
    printers.forEach((printer, index) => {
      map.set(printer.id, statusQueries[index]);
    });
    return map;
  }, [printers, statusQueries]);

  const maintenanceByPrinter = useLocalizedMemo(() => {
    const map = new Map<number, MaintenanceSummary>();

    for (const item of maintenanceQuery.data ?? []) {
      const existing = map.get(item.printer_id) ?? {
        dueCount: 0,
        warningCount: 0,
        items: [],
      };
      existing.items.push(item);
      if (item.is_due) existing.dueCount += 1;
      else if (item.is_warning) existing.warningCount += 1;
      map.set(item.printer_id, existing);
    }

    return map;
  }, [maintenanceQuery.data]);

  const queueCounts = useLocalizedMemo(() => {
    const map = new Map<number, number>();

    for (const printer of printers) {
      const status = statusByPrinter.get(printer.id);
      const count = (queueQuery.data ?? []).filter(item =>
        queueItemMatchesPrinter(printer, status, item),
      ).length;
      map.set(printer.id, count);
    }

    return map;
  }, [printers, queueQuery.data, statusByPrinter]);
  const nextJobs = useLocalizedMemo(() => new Map(printers.map(printer => [
    printer.id,
    (queueQuery.data ?? []).filter(item => queueItemMatchesPrinter(printer, statusByPrinter.get(printer.id), item))
      .sort((a, b) => a.position - b.position || a.id - b.id)[0],
  ])), [printers, queueQuery.data, statusByPrinter]);
  const locations = useLocalizedMemo(() => [...new Set(printers.map(printer => printer.location ?? ''))].sort(), [printers]);
  const fleetCounts = countFleetStates(printers.map(printer => statusByPrinter.get(printer.id)));
  const nextFinisher = printers.filter(printer => {
    const status = statusByPrinter.get(printer.id);
    return status?.connected && status.state === 'RUNNING' && status.remaining_time != null && status.remaining_time > 0;
  }).sort((a, b) => (statusByPrinter.get(a.id)?.remaining_time ?? Infinity) - (statusByPrinter.get(b.id)?.remaining_time ?? Infinity))[0];

  const filteredPrinters = useLocalizedMemo(() => {
    const term = search.trim().toLowerCase();

    return printers
      .filter(printer => {
        const status = statusByPrinter.get(printer.id);
        const maintenance = maintenanceByPrinter.get(printer.id);
        const mode = classifyPrinter(printer, status, maintenance);
        const matchesSearch =
          !term ||
          [printer.name, printer.model, printer.location]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(term);

        if (!matchesSearch || (hideOffline && !status?.connected) || (locationFilter !== null && (printer.location ?? '') !== locationFilter)) return false;
        if (filter === 'all') return true;
        if (filter === 'printing') return !!status?.connected && status.state === 'RUNNING';
        if (filter === 'paused') return !!status?.connected && status.state === 'PAUSE';
        if (filter === 'finished') return !!status?.connected && status.state === 'FINISH';
        if (filter === 'offline') return !status?.connected;
        return mode === filter;
      })
      .sort((first, second) =>
        (descending ? -1 : 1) * comparePrinters(
          first,
          second,
          sortBy,
          statusByPrinter,
          maintenanceByPrinter,
          sortSecondary,
        ),
      );
  }, [filter, hideOffline, locationFilter, descending, maintenanceByPrinter, printers, search, sortBy, sortSecondary, statusByPrinter]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        printersQuery.refetch(),
        queueQuery.refetch(),
        maintenanceQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ['printerStatus'] }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const toggleSelectedPrinter = (printerId: number) => {
    setSelectedPrinterIds(current =>
      current.includes(printerId)
        ? current.filter(id => id !== printerId)
        : [...current, printerId],
    );
  };

  const handleSortChange = (nextSort: PrinterSortMode) => {
    setSortBy(nextSort);
    void AsyncStorage.setItem(PRINTER_SORT_STORAGE_KEY, nextSort).catch(() => {
      showToast(nativeMessage('native.6c7950190204ade9'), 'warning');
    });
  };

  const handleSecondarySortChange = (nextSecondary: PrinterSortSecondaryMode) => {
    setSortSecondary(nextSecondary);
    void AsyncStorage.setItem(PRINTER_SORT_SECONDARY_KEY, nextSecondary).catch(() => {
      showToast(nativeMessage('native.f07a09411b4f8940'), 'warning');
    });
  };
  const applicableSelected = (action: FleetBulkAction) => selectedPrinterIds.filter(id =>
    printers.find(printer => printer.id === id)?.is_active !== false &&
    isBulkApplicable(action, statusByPrinter.get(id)),
  );

  const bulkActionMutation = useMutation({
    mutationFn: async (
      action: FleetBulkAction,
    ) => {
      if (selectedPrinterIds.length === 0) {
        throw new Error(translateNative('native.a6f73b30362450f6'));
      }

      const permission = action === 'clear-plate' ? 'printers:clear_plate' : 'printers:control';
      if (!hasPermission(permission)) throw new Error(t('fleet.bulkDenied', { defaultValue: 'Permission required: {{permission}}', permission }));
      const applicable = applicableSelected(action);
      if (!applicable.length) throw new Error(t('fleet.noneApplicable', { defaultValue: 'No selected printer is applicable to this action.' }));
      const results = await Promise.allSettled(
        applicable.map(printerId => {
          if (action === 'pause') return api.pausePrint(printerId);
          if (action === 'resume') return api.resumePrint(printerId);
          if (action === 'stop') return api.stopPrint(printerId);
          if (action === 'clear-hms') return api.clearHMSErrors(printerId);
          if (action === 'clear-plate') return api.clearPlate(printerId);
          return api.setChamberLight(printerId, action === 'light-on');
        }),
      );

      const successCount = results.filter(result => result.status === 'fulfilled').length;
      const failureCount = results.length - successCount;

      return { action, successCount, failureCount, report: selectedPrinterIds.map(id => {
        const index = applicable.indexOf(id);
        const result = results[index];
        return `${printers.find(printer => printer.id === id)?.name ?? id}: ${index < 0 ? t('fleet.skipped', { defaultValue: 'Skipped (not applicable)' }) : result.status === 'fulfilled' ? t('fleet.sent', { defaultValue: 'Command sent' }) : String(result.reason instanceof Error ? result.reason.message : result.reason)}`;
      }).join('\n') };
    },
    onSuccess: async ({ action, successCount, failureCount, report }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['printers'] }),
        queryClient.invalidateQueries({ queryKey: ['printerStatus'] }),
        queryClient.invalidateQueries({ queryKey: ['queue'] }),
      ]);
      setSelectedPrinterIds([]);
      Alert.alert(t('fleet.bulkResults', { defaultValue: 'Per-printer results' }), report);
      const actionLabel =
        action === 'pause'
          ? translateNative('native.362b1658df45e7f1')
          : action === 'resume'
            ? translateNative('native.b68738f908376c9e')
            : action === 'stop'
              ? translateNative('common.stop')
              : action === 'clear-hms' ? translateNative('native.c701e5b78fba49e0') : action === 'clear-plate' ? translateNative('native.a9858a59831574c7') : action === 'light-on'
                ? translateNative('native.80f57346541d7270')
                : translateNative('native.df99d810856b6ad4');
      showToast(
        nativeMessage('native.e534e060ea657a9e', () => ({ value0: String(actionLabel), value1: String(successCount), value2: String(nativeEnglishSuffix(successCount === 1 ? '' : 's')), value3: String(failureCount ? translateNative('native.1f9e52119c5cffe7', { value0: String(failureCount) }) : '') })),
        failureCount ? 'warning' : 'success',
      );
    },
    onError: (error: Error) => {
      showToast(error.message || nativeMessage('native.d19e6842d6ef9a5b'), 'error');
    },
  });
  const confirmBulk = (action: FleetBulkAction) => Alert.alert(
    t('fleet.bulkConfirm', { defaultValue: 'Confirm {{action}} for selected printers?', action }),
    t('fleet.bulkWarning', { defaultValue: '{{count}} applicable of {{total}} selected. Others will be skipped. Clearing plates may start queued jobs; stopping cannot be resumed.', count: applicableSelected(action).length, total: selectedPrinterIds.length }),
    [
      { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
      { text: t('common.confirm', { defaultValue: 'Confirm' }), style: action === 'stop' ? 'destructive' : 'default', onPress: () => bulkActionMutation.mutate(action) },
    ],
  );

  if (printersQuery.isLoading) {
    return <LoadingScreen message={translateNative('native.7edf447519097d01')} />;
  }

  if (printersQuery.isError) {
    return (
      <ErrorState
        message={translateNative('native.c99bfbd3c0ec31a8')}
        onRetry={() => {
          printersQuery.refetch();
        }}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <FlatList
        data={filteredPrinters}
        key={viewMode}
        numColumns={viewMode === 'compact' ? 2 : 1}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        columnWrapperStyle={viewMode === 'compact' ? styles.gridRow : undefined}
        ItemSeparatorComponent={viewMode === 'compact' ? undefined : ListSeparator}
        refreshControl={
          <RefreshControl
            testID="printers-refresh"
            refreshing={isRefreshing}
            onRefresh={() => {
              handleRefresh();
            }}
            tintColor={colors.accent}
          />
        }
        renderItem={({ item }) => {
          const status = statusByPrinter.get(item.id);
          const maintenance = maintenanceByPrinter.get(item.id);
          const statusQuery = statusQueryByPrinter.get(item.id);
          const selected = selectedPrinterIds.includes(item.id);
          const toggleSelection = () => toggleSelectedPrinter(item.id);

          return (
            <Pressable
              onLongPress={() => {
                setSelectedPrinterIds(current =>
                  current.includes(item.id) ? current : [...current, item.id],
                );
              }}
            >
              <PrinterCard
                printer={item}
                status={status}
                queueCount={queueCounts.get(item.id) ?? 0}
                nextQueueJob={nextJobs.get(item.id)}
                maintenance={maintenance}
                spoolAssignments={assignmentsQuery.data}
                snapshotSeed={`${snapshotSeed}-${item.id}-${status?.state ?? 'idle'}-${status?.progress ?? 0}`}
                loading={Boolean(statusQuery?.isLoading || statusQuery?.isRefetching)}
                selected={selected}
                selectionMode={selectionMode}
                compact={viewMode === 'compact'}
                onLongPress={() => {
                  setSelectedPrinterIds(current =>
                    current.includes(item.id) ? current : [...current, item.id],
                  );
                }}
                onToggleSelect={toggleSelection}
                onPress={() =>
                  selectionMode
                    ? toggleSelection()
                    : navigation.navigate('PrinterDetail', { id: String(item.id) })
                }
                onCameraPress={() =>
                  selectionMode
                    ? toggleSelection()
                    : navigation.navigate('Camera', { id: String(item.id) })
                }
                onQueuePress={() =>
                  selectionMode ? toggleSelection() : navigation.navigate('Queue')
                }
                onMaintenancePress={() =>
                  selectionMode ? toggleSelection() : navigation.navigate('Maintenance')
                }
                onPrintPress={() =>
                  selectionMode ? toggleSelection() : setPrintPrinterId(item.id)
                }
              />
            </Pressable>
          );
        }}
        ListHeaderComponent={
          <View style={styles.header}>
            {showFilters ? <Text style={{ color: colors.text }}>{FILTERS.filter(item => item.key !== 'all').map(item => `${t(`fleet.state.${item.key}`, { defaultValue: item.label })}: ${fleetCounts[item.key as keyof typeof fleetCounts] ?? 0}`).join(' · ')}{fleetCounts.loading ? ` · ${t('fleet.loadingCount', { defaultValue: '{{count}} loading', count: fleetCounts.loading })}` : ''}</Text> : null}
            {nextFinisher ? <Text style={{ color: colors.textSecondary }}>{t('fleet.nextFinisher', { defaultValue: 'Next finisher: {{name}} · {{minutes}} min · {{eta}}', name: nextFinisher.name, minutes: statusByPrinter.get(nextFinisher.id)?.remaining_time ?? '—', eta: new Date(Date.now() + (statusByPrinter.get(nextFinisher.id)?.remaining_time ?? 0) * 60000).toLocaleTimeString() })}</Text> : null}
            {selectionMode ? <ScrollView horizontal contentContainerStyle={styles.bulkActions}>
              <PrimaryButton label={t('fleet.selectAll', { defaultValue: 'Select all visible' })} variant="secondary" onPress={() => setSelectedPrinterIds(filteredPrinters.map(printer => printer.id))} />
              <PrimaryButton label={t('fleet.selectState', { defaultValue: 'Select by state' })} variant="secondary" onPress={() => setChoices({ get title() { return translateNative('fleet.selectState', { defaultValue: 'Select by state' }); }, options: FILTERS.filter(item => item.key !== 'all').map(item => ({ get label() { return translateNative(`fleet.state.${item.key}`, { defaultValue: item.label }); }, select: () => setSelectedPrinterIds(printers.filter(printer => classifyPrinter(printer, statusByPrinter.get(printer.id), maintenanceByPrinter.get(printer.id)) === item.key).map(printer => printer.id)) })) })} />
              <PrimaryButton label={t('fleet.selectLocation', { defaultValue: 'Select by location' })} variant="secondary" onPress={() => setChoices({ get title() { return translateNative('fleet.selectLocation', { defaultValue: 'Select by location' }); }, options: locations.map(location => ({ label: location || t('fleet.noLocation', { defaultValue: 'No location' }), select: () => setSelectedPrinterIds(printers.filter(printer => (printer.location ?? '') === location).map(printer => printer.id)) })) })} />
            </ScrollView> : null}
            {selectionMode ? (
              <View
                style={[
                  styles.bulkBar,
                  { backgroundColor: colors.card, borderColor: colors.cardBorder },
                ]}
              >
                <View style={styles.bulkBarHeader}>
                  <Text style={[styles.bulkTitle, { color: colors.text }]}><NativeTranslation id="native.df8179da1ed8585c" values={{ value0: (selectedPrinterIds.length) }} /></Text>
                  <PrimaryButton
                    label={translateNative('native.7ab7b842cbd975a6')}
                    variant="secondary"
                    onPress={() => setSelectedPrinterIds([])}
                  />
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.bulkActions}
                >
                  <PrimaryButton
                    label={translateNative('native.61d7a8943554bcf6')}
                    variant="secondary"
                    onPress={() => confirmBulk('pause')}
                    disabled={bulkActionMutation.isPending || !hasPermission('printers:control')}
                  />
                  <PrimaryButton
                    label={translateNative('native.d34ee0bef658d483')}
                    variant="secondary"
                    onPress={() => confirmBulk('resume')}
                    disabled={bulkActionMutation.isPending || !hasPermission('printers:control')}
                  />
                  <PrimaryButton
                    label={translateNative('native.da8b41c2716f5b7a')}
                    variant="danger"
                    onPress={() => confirmBulk('stop')}
                    disabled={bulkActionMutation.isPending || !hasPermission('printers:control')}
                  />
                  <PrimaryButton
                    label={translateNative('native.80f57346541d7270')}
                    variant="secondary"
                    onPress={() => confirmBulk('light-on')}
                    disabled={bulkActionMutation.isPending || !hasPermission('printers:control')}
                  />
                  <PrimaryButton
                    label={translateNative('native.df99d810856b6ad4')}
                    variant="secondary"
                    onPress={() => confirmBulk('light-off')}
                    disabled={bulkActionMutation.isPending || !hasPermission('printers:control')}
                  />
                  <PrimaryButton label={t('fleet.clearHms', { defaultValue: 'Clear selected HMS' })} variant="secondary" onPress={() => confirmBulk('clear-hms')} disabled={bulkActionMutation.isPending || !hasPermission('printers:control')} />
                  <PrimaryButton label={t('fleet.clearPlates', { defaultValue: 'Clear selected plates' })} variant="secondary" onPress={() => confirmBulk('clear-plate')} disabled={bulkActionMutation.isPending || !hasPermission('printers:clear_plate')} />
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.toolbarRow}>
              <View style={styles.search}>
                <SearchBar
                  value={search}
                  onChangeText={setSearch}
                  placeholder={translateNative('native.94b1fd19b67ba826')}
                />
              </View>
              <View
                style={[
                  styles.liveBadge,
                  {
                    backgroundColor: wsConnected ? colors.accentBg : colors.surfaceElevated,
                    borderColor: wsConnected ? colors.accent : colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.liveDot,
                    { backgroundColor: wsConnected ? colors.accent : colors.textTertiary },
                  ]}
                />
                <Text
                  style={[
                    styles.liveLabel,
                    { color: wsConnected ? colors.accentLight : colors.textSecondary },
                  ]}
                >
                  {wsConnected ? translateNative('native.374641901437dd44') : translateNative('native.c50c5c9542d1a158')}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={translateNative('common.filters')}
                accessibilityState={{ expanded: showFilters, selected: hideOffline || locationFilter !== null || descending || sortBy !== 'status' || sortSecondary !== 'name' }}
                hitSlop={6}
                onPress={() => setShowFilters(current => !current)}
                style={[styles.viewToggle, { backgroundColor: showFilters ? colors.accentBg : colors.surfaceElevated, borderColor: colors.border }]}
              >
                <SlidersHorizontal size={16} color={colors.text} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={selectionMode ? translateNative('common.cancel') : t('fleet.selectAll', { defaultValue: 'Select all visible' })}
                accessibilityState={{ selected: selectionMode }}
                hitSlop={6}
                disabled={filteredPrinters.length === 0 && !selectionMode}
                onPress={() => setSelectedPrinterIds(selectionMode ? [] : filteredPrinters.map(printer => printer.id))}
                style={[styles.viewToggle, { backgroundColor: selectionMode ? colors.accentBg : colors.surfaceElevated, borderColor: colors.border }]}
              >
                <ListChecks size={16} color={colors.text} />
              </Pressable>
              <Pressable
                onPress={() => setViewMode(m => m === 'normal' ? 'compact' : 'normal')}
                accessibilityRole="button"
                accessibilityLabel={viewMode === 'normal' ? translateNative('native.7dec88bad08e1b80') : translateNative('native.33b836845ee11768')}
                hitSlop={8}
                style={[styles.viewToggle, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
              >
                {viewMode === 'normal'
                  ? <Grid2x2 size={16} color={colors.text} strokeWidth={2} />
                  : <List size={16} color={colors.text} strokeWidth={2} />
                }
              </Pressable>
              <Pressable
                onPress={() => setShowAddPrinter(true)}
                accessibilityRole="button"
                accessibilityLabel={translateNative('native.112c324655102ccb')}
                hitSlop={8}
                style={[styles.addBtn, { backgroundColor: colors.accent }]}
              >
                <Plus size={18} color={colors.textInverse} strokeWidth={2.5} />
              </Pressable>
            </View>

            <InlineTabBar
              value={filter}
              tabs={FILTERS.map(item => ({ key: item.key, get label() { return translateNative(`fleet.state.${item.key}`, { defaultValue: item.label }); } }))}
              onChange={setFilter}
            />
            {choices ? <FleetModal title={choices.title} onClose={() => setChoices(null)}>{choices.options.map(option => <PrimaryButton key={option.label} label={option.label} variant="secondary" onPress={() => { option.select(); setChoices(null); }} />)}</FleetModal> : null}
            {showFilters ? <View style={[styles.filtersPanel, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.filterOptions}>
              <Text style={{ color: colors.text }}>{t('fleet.hideOffline', { defaultValue: 'Hide offline' })}</Text>
              <Switch value={hideOffline} onValueChange={setHideOffline} accessibilityLabel={t('fleet.hideOffline', { defaultValue: 'Hide offline' })} />
              <PrimaryButton label={locationFilter === null ? t('fleet.allLocations', { defaultValue: 'All locations' }) : locationFilter || t('fleet.noLocation', { defaultValue: 'No location' })} variant="secondary" onPress={() => setChoices({ get title() { return translateNative('fleet.locationFilter', { defaultValue: 'Filter location' }); }, options: [
                { get label() { return translateNative('fleet.allLocations', { defaultValue: 'All locations' }); }, select: () => setLocationFilter(null) },
                ...locations.map(location => ({ label: location || t('fleet.noLocation', { defaultValue: 'No location' }), select: () => setLocationFilter(location) })),
              ] })} />
              <PrimaryButton label={descending ? t('fleet.descending', { defaultValue: 'Descending ↓' }) : t('fleet.ascending', { defaultValue: 'Ascending ↑' })} variant="secondary" onPress={() => setDescending(!descending)} />
            </View>
            <View style={styles.sortRow}>
              <Text style={[styles.sortLabel, { color: colors.textSecondary }]}>{translateNative('native.835f56bb1efa85f9')}</Text>
              <View
                style={[
                  styles.sortControl,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
              >
                {SORT_OPTIONS.map(option => {
                  const selected = sortBy === option.key;

                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => handleSortChange(option.key)}
                      style={[
                        styles.sortOption,
                        selected && { backgroundColor: colors.accentBg },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={t(`fleet.sortDescription.${option.key}`, { defaultValue: option.description })}
                      accessibilityState={{ selected }}
                    >
                      <Text
                        style={[
                          styles.sortOptionLabel,
                          { color: selected ? colors.accentLight : colors.textSecondary },
                        ]}
                      >
                        {t(`fleet.sort.${option.key}`, { defaultValue: option.label })}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={styles.sortRow}>
              <Text style={[styles.sortSecondaryLabel, { color: colors.textTertiary }]}>{translateNative('native.921fa42ec503754b')}</Text>
              <View
                style={[
                  styles.sortControl,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
              >
                {SECONDARY_SORT_OPTIONS.map(option => {
                  const selected = sortSecondary === option.key;

                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => handleSecondarySortChange(option.key)}
                      style={[
                        styles.sortOption,
                        selected && { backgroundColor: colors.accentBg },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={translateNative('native.5a67ee95560babf8', { value0: String(option.label) })}
                      accessibilityState={{ selected }}
                    >
                      <Text
                        style={[
                          styles.sortOptionLabel,
                          { color: selected ? colors.accentLight : colors.textSecondary },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            </View> : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="🖨️"
            title={
              printers.length === 0
                ? translateNative('native.c870940f66e6a809')
                : translateNative('native.46afc4f1084ad331')
            }
            message={
              printers.length === 0
                ? translateNative('native.02b57bff1de92475')
                : translateNative('native.8bff868b14869791')
            }
          />
        }
      />
      <PrintModal
        visible={printPrinterId != null}
        initialPrinterId={printPrinterId}
        onClose={() => setPrintPrinterId(null)}
      />
      <AddPrinterModal
        visible={showAddPrinter}
        onClose={() => setShowAddPrinter(false)}
        onAdd={(data) => addPrinterMutation.mutate(data as Record<string, unknown>)}
        existingSerials={printers.map(p => p.serial_number ?? '')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  separator: { height: spacing.md },
  gridRow: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  search: { flex: 1 },
  filtersPanel: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  filterOptions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  bulkBar: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    gap: spacing.md,
  },
  bulkBarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  bulkTitle: {
    fontSize: fontSize.base,
    fontWeight: '700',
  },
  bulkActions: {
    gap: spacing.sm,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: borderRadius.full,
  },
  liveLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  viewToggle: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  sortLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sortControl: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: 2,
  },
  sortOption: {
    minHeight: 28,
    minWidth: 64,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortOptionLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  sortSecondaryLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    opacity: 0.7,
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
