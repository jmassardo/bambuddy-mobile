import { NativeTranslation, nativeEnglishSuffix, nativeMessage, translateNative, useLocalizedMemo, useNativeLocale, useTranslation } from '@/i18n';


import React, { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigationProp } from '@/navigation/types';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react-native';
import { api } from '@/api/client';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import {
  InlineTabBar,
  PrimaryButton,
  ProgressBar,
  SectionCard,
  StatusBadge,
  TextField,
} from '@/components/common/AppUI';
import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import type {
  MaintenanceHistory,
  MaintenanceStatus,
  MaintenanceType,
  MaintenanceTypeCreate,
  PrinterMaintenanceOverview,
} from '@/types/api';
import { formatDate, formatDateTime } from '@/utils/data';
import { MaintenanceControls, RestoreMaintenanceDefaults } from '@/components/profiles/MaintenanceControls';

import { maintenanceIcons, MaintenanceIcon } from '@/components/profiles/MaintenanceIcon';

type FilterKey = 'all' | 'due' | 'warning';
type MaintenanceTab = 'overview' | 'history' | 'types';
type MaintenanceCategoryKey =
  | 'general'
  | 'cleaning'
  | 'lubrication'
  | 'motion'
  | 'extrusion'
  | 'build-plate'
  | 'filament-path';

interface MaintenanceTypeFormState {
  name: string;
  description: string;
  intervalValue: string;
  intervalType: 'hours' | 'days';
  category: MaintenanceCategoryKey;
  icon: string;
  wikiUrl: string;
}

const MAINTENANCE_CATEGORIES: Array<{
  key: MaintenanceCategoryKey;
  label: string;
  icon: string;
}> = [
  { key: 'general', get label() { return translateNative('native.c16ffe4ebbc1709c'); }, icon: 'Wrench' },
  { key: 'cleaning', get label() { return translateNative('native.eea44ccec89299da'); }, icon: 'Sparkles' },
  { key: 'lubrication', get label() { return translateNative('native.3f4f6f181672a272'); }, icon: 'Droplet' },
  { key: 'motion', get label() { return translateNative('native.53942aab53da9918'); }, icon: 'Ruler' },
  { key: 'extrusion', get label() { return translateNative('native.e569310b66dcd68f'); }, icon: 'Flame' },
  { key: 'build-plate', get label() { return translateNative('native.5e331a7fd0fc73be'); }, icon: 'Square' },
  { key: 'filament-path', get label() { return translateNative('native.26b69006a6c8ae07'); }, icon: 'Cable' },
];

const DEFAULT_TYPE_FORM: MaintenanceTypeFormState = {
  name: '',
  description: '',
  intervalValue: '100',
  intervalType: 'hours',
  category: 'general',
  icon: 'Wrench',
  wikiUrl: '',
};

function formatIntervalValue(value: number, type: 'hours' | 'days') {
  return type === 'days'
    ? translateNative('native.4611c24e402a7e7c', { value0: String(value), value1: String(nativeEnglishSuffix(value === 1 ? '' : 's')) })
    : translateNative('native.53dde993a4442eb6', { value0: String(value) });
}

function progressValue(item: MaintenanceStatus) {
  if (item.interval_type === 'days') {
    const used = item.days_since_maintenance ?? 0;
    const total = Math.max(item.interval_hours, 1);
    return Math.min(100, Math.max(0, (used / total) * 100));
  }
  const total = Math.max(item.interval_hours, 1);
  const used = item.hours_since_maintenance ?? 0;
  return Math.min(100, Math.max(0, (used / total) * 100));
}

function dueLabel(item: MaintenanceStatus) {
  if (item.is_due) {
    return item.interval_type === 'days'
      ? translateNative('native.3ee55269e9000c5e', { value0: String(Math.abs(item.days_until_due ?? 0).toFixed(0)) })
      : translateNative('native.ecfa56a81ee429f3', { value0: String(Math.abs(item.hours_until_due).toFixed(1)) });
  }
  if (item.is_warning) {
    return item.interval_type === 'days'
      ? translateNative('native.f8fc0ffe731d68be', { value0: String((item.days_until_due ?? 0).toFixed(0)) })
      : translateNative('native.56af02918a934d91', { value0: String(item.hours_until_due.toFixed(1)) });
  }
  return translateNative('native.0658c83845ad1fdd');
}

export function nextDueLabel(item: MaintenanceStatus) {
  if (item.interval_type === 'days') {
    const anchor = item.last_performed_at ? new Date(item.last_performed_at) : new Date();
    const next = new Date(anchor.getTime() + item.interval_hours * 24 * 60 * 60 * 1000);
    return Number.isNaN(next.getTime()) ? '—' : formatDate(next.getTime());
  }
  const targetHours = item.current_hours + item.hours_until_due;
  if (!Number.isFinite(targetHours)) return '—';
  return translateNative('native.90c4367c0701da20', { value0: String(Math.max(targetHours, 0).toFixed(1)) });
}

function statusColor(item: MaintenanceStatus, colors: ReturnType<typeof useTheme>['colors']) {
  if (!item.enabled) return colors.textTertiary;
  if (item.is_due) return colors.error;
  if (item.is_warning) return colors.warning;
  return colors.success;
}

function inferCategory(type: MaintenanceType): MaintenanceCategoryKey {
  if (type.category) {
    const matched = MAINTENANCE_CATEGORIES.find(category => category.key === type.category);
    if (matched) return matched.key;
  }
  const matchedByIcon = MAINTENANCE_CATEGORIES.find(category => category.icon === type.icon);
  return matchedByIcon?.key ?? 'general';
}

function categoryLabel(category: MaintenanceCategoryKey) {
  return MAINTENANCE_CATEGORIES.find(item => item.key === category)?.label ?? translateNative('native.c16ffe4ebbc1709c');
}

function ModalShell({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useNativeLocale();
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}> 
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalKeyboardArea}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text>
                {subtitle ? (
                  <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
                ) : null}
              </View>
              <Pressable
                onPress={onClose}
                style={[styles.closeButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
              >
                <X size={18} color={colors.text} strokeWidth={2} />
              </Pressable>
            </View>
            {children}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export function MaintenanceTypeFormModal({
  visible,
  type,
  loading,
  onClose,
  onSubmit,
  printers,
}: {
  visible: boolean;
  type: MaintenanceType | null;
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: MaintenanceTypeCreate, printerIds: number[]) => void;
  printers: PrinterMaintenanceOverview[];
}) {
  useNativeLocale();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [form, setForm] = useState<MaintenanceTypeFormState>(DEFAULT_TYPE_FORM);
  const [selectedPrinters, setSelectedPrinters] = useState<number[]>([]);

  useEffect(() => {
    if (!visible) return;
    setSelectedPrinters([]);
    if (type) {
      setForm({
        name: type.name,
        description: type.description ?? '',
        intervalValue: String(type.default_interval_hours ?? 100),
        intervalType: type.interval_type ?? 'hours',
        category: inferCategory(type),
        icon: type.icon ?? '',
        wikiUrl: type.wiki_url ?? '',
      });
      return;
    }
    setForm(DEFAULT_TYPE_FORM);
  }, [type, visible]);

  const parsedInterval = Number(form.intervalValue);
  const canSave = form.name.trim().length > 0 && Number.isFinite(parsedInterval) && parsedInterval >= 1 &&
    (!form.wikiUrl.trim() || /^https?:\/\/\S+$/i.test(form.wikiUrl.trim()));

  return (
    <ModalShell
      visible={visible}
      title={type ? translateNative('native.e017856bdb9c14d4') : translateNative('native.17e910a01e8b6028')}
      subtitle={translateNative('native.cf1e43b96817a6ac')}
      onClose={onClose}
    >
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <TextField
          label={translateNative('common.name')}
          value={form.name}
          onChangeText={value => setForm(current => ({ ...current, name: value }))}
          placeholder={translateNative('native.72f26297b229bcd9')}
        />
        <TextField
          label={translateNative('native.a7115fb87dd30c12')}
          value={form.description}
          onChangeText={value => setForm(current => ({ ...current, description: value }))}
          placeholder={translateNative('native.76d9f55e7900ba43')}
          multiline
        />
        <TextField label={t('maintenance.documentationUrl', { defaultValue: 'Documentation URL (https://…)' })} value={form.wikiUrl} onChangeText={wikiUrl => setForm(current => ({ ...current, wikiUrl }))} autoCapitalize="none" />
        <TextField label={t('maintenance.icon', { defaultValue: 'Icon' })} value={form.icon} onChangeText={icon => setForm(current => ({ ...current, icon }))} />
        <View style={styles.categoryWrap}>
          {Object.keys(maintenanceIcons).map(icon => <PrimaryButton key={icon} label={icon} variant={form.icon === icon ? 'primary' : 'secondary'} onPress={() => setForm(current => ({ ...current, icon }))} />)}
        </View>
        {!type ? <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('maintenance.assignInitial', { defaultValue: 'Assign to printers (optional)' })}</Text>
          {printers.map(printer => <PrimaryButton key={printer.printer_id} label={`${selectedPrinters.includes(printer.printer_id) ? '✓ ' : ''}${printer.printer_name}`} variant="secondary" onPress={() => setSelectedPrinters(current => current.includes(printer.printer_id) ? current.filter(id => id !== printer.printer_id) : [...current, printer.printer_id])} />)}
        </View> : null}
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{translateNative('native.dd14e32c3ee784ff')}</Text>
          <InlineTabBar
            value={form.intervalType}
            tabs={[
              { key: 'hours', get label() { return translateNative('native.bfbd4dfe23aa1f5f'); } },
              { key: 'days', get label() { return translateNative('native.2c810316bb380b21'); } },
            ]}
            onChange={value =>
              setForm(current => ({
                ...current,
                intervalType: value,
                intervalValue: value === 'days' && current.intervalValue === '100' ? '30' : current.intervalValue,
              }))
            }
          />
        </View>
        <TextField
          label={translateNative('native.d48672582308a426', { value0: String(form.intervalType) })}
          value={form.intervalValue}
          onChangeText={value => setForm(current => ({ ...current, intervalValue: value }))}
          placeholder={form.intervalType === 'days' ? '30' : '100'}
          keyboardType="decimal-pad"
        />
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{translateNative('native.96903af5948f6ca5')}</Text>
          <View style={styles.categoryWrap}>
            {MAINTENANCE_CATEGORIES.map(category => {
              const selected = form.category === category.key;
              return (
                <Pressable
                  key={category.key}
                  onPress={() => setForm(current => ({ ...current, category: category.key }))}
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: selected ? colors.accentBg : colors.surfaceElevated,
                      borderColor: selected ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.categoryChipText, { color: selected ? colors.accentLight : colors.textSecondary }]}>
                    {category.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
      <View style={styles.modalActions}>
        <PrimaryButton label={translateNative('common.cancel')} variant="secondary" onPress={onClose} />
        <PrimaryButton
          label={loading ? translateNative('native.018c2002806e2312') : translateNative('common.save')}
          onPress={() =>
            onSubmit({
              name: form.name.trim(),
              description: form.description.trim() || null,
              default_interval_hours: parsedInterval,
              interval_type: form.intervalType,
              category: form.category,
              icon: form.icon || null,
              wiki_url: form.wikiUrl.trim() || null,
            }, selectedPrinters)
          }
          disabled={!canSave || loading}
          loading={loading}
        />
      </View>
    </ModalShell>
  );
}

function AssignTypeModal({
  visible,
  printer,
  types,
  loading,
  onClose,
  onAssign,
}: {
  visible: boolean;
  printer: PrinterMaintenanceOverview | null;
  types: MaintenanceType[];
  loading: boolean;
  onClose: () => void;
  onAssign: (typeId: number) => void;
}) {
  useNativeLocale();
  const { colors } = useTheme();

  const unassignedTypes = useLocalizedMemo(() => {
    if (!printer) return [];
    const assignedIds = new Set(printer.maintenance_items.map(item => item.maintenance_type_id));
    return types.filter(type => !assignedIds.has(type.id));
  }, [printer, types]);

  return (
    <ModalShell
      visible={visible}
      title={translateNative('native.ec4c0533e3a47183')}
      subtitle={printer ? translateNative('native.9e99da422c8c39f4', { value0: String(printer.printer_name) }) : undefined}
      onClose={onClose}
    >
      <ScrollView showsVerticalScrollIndicator={false} style={styles.assignList}>
        {unassignedTypes.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}> 
            {translateNative('native.cc8f1bebf008e7a4')}</Text>
        ) : (
          unassignedTypes.map(type => {
            const category = inferCategory(type);
            return (
              <Pressable
                key={type.id}
                onPress={() => onAssign(type.id)}
                style={[
                  styles.assignRow,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
              >
                <View style={styles.assignText}>
                  <Text style={[styles.assignTitle, { color: colors.text }]}>{type.name}</Text>
                  <Text style={[styles.assignMeta, { color: colors.textSecondary }]}> 
                    {formatIntervalValue(type.default_interval_hours, type.interval_type)} • {categoryLabel(category)}
                  </Text>
                  {type.description ? (
                    <Text style={[styles.assignDescription, { color: colors.textSecondary }]}>
                      {type.description}
                    </Text>
                  ) : null}
                </View>
                <PrimaryButton
                  label={loading ? translateNative('native.a02e16d8e3452166') : translateNative('native.aff9b055e1df6025')}
                  onPress={() => onAssign(type.id)}
                  disabled={loading}
                  loading={loading}
                />
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </ModalShell>
  );
}

export default function MaintenanceScreen() {
  const titleLocale = useNativeLocale();
  useTranslation();
  const navigation = useNavigation<RootNavigationProp<'Maintenance'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: translateNative('nav.maintenance') });
  }, [navigation, titleLocale]);

  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<MaintenanceTab>('overview');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [editingType, setEditingType] = useState<MaintenanceType | null>(null);
  const [assignPrinter, setAssignPrinter] = useState<PrinterMaintenanceOverview | null>(null);
  const [pendingDeleteType, setPendingDeleteType] = useState<MaintenanceType | null>(null);

  const overviewQuery = useQuery({
    queryKey: ['maintenanceOverview'],
    queryFn: () => api.getMaintenanceOverview(),
  });

  const typesQuery = useQuery({
    queryKey: ['maintenanceTypes'],
    queryFn: () => api.getMaintenanceTypes(),
  });
  const historyQuery = useQuery({
    queryKey: ['maintenanceHistory', overviewQuery.data],
    enabled: activeTab === 'history' && !!overviewQuery.data,
    queryFn: async () => {
      const overview = (overviewQuery.data ?? []) as PrinterMaintenanceOverview[];
      const rows = await Promise.all(
        overview.flatMap(printer =>
          printer.maintenance_items.map(async item => {
            const history = await api.getMaintenanceHistory(item.id).catch(() => [] as MaintenanceHistory[]);
            return history.map(entry => ({
              ...entry,
              printer_name: printer.printer_name,
              maintenance_type_name: item.maintenance_type_name,
            }));
          }),
        ),
      );
      const flattened = rows.flat() as Array<MaintenanceHistory & { printer_name: string; maintenance_type_name: string }>;
      return flattened.sort((a, b) => new Date(b.performed_at).getTime() - new Date(a.performed_at).getTime());
    },
  });

  const invalidateMaintenance = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['maintenanceOverview'] }),
      queryClient.invalidateQueries({ queryKey: ['maintenanceTypes'] }),
    ]);
  };

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      api.updateMaintenanceItem(id, { enabled }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['maintenanceOverview'] });
      showToast(nativeMessage('native.934080249f318e84'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.3ababee768306619'), 'error'),
  });

  const performMutation = useMutation({
    mutationFn: (id: number) => api.performMaintenance(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['maintenanceOverview'] });
      showToast(nativeMessage('native.9cdadec4570ec0f3'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.5beffef460dfb2e7'), 'error'),
  });

  const createTypeMutation = useMutation({
    mutationFn: async ({ payload, printerIds }: { payload: MaintenanceTypeCreate; printerIds: number[] }) => {
      const created = await api.createMaintenanceType(payload);
      const assignments = await Promise.allSettled(printerIds.map(printer => api.assignMaintenanceType(printer, created.id)));
      return assignments.map((result, index) => result.status === 'rejected' ? `${printerIds[index]}: ${String(result.reason)}` : null).filter(Boolean);
    },
    onSuccess: async failures => {
      await invalidateMaintenance();
      setShowTypeModal(false);
      setEditingType(null);
      showToast(failures.length ? nativeMessage('maintenance.assignmentFailed', () => ({ defaultValue: 'Type created. Some assignments failed: {{errors}}', errors: failures.join('; ') })) : nativeMessage('maintenance.createdAssigned', () => ({ defaultValue: 'Type created and selected printers assigned.' })), failures.length ? 'error' : 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.84943eb909edef54'), 'error'),
  });

  const updateTypeMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<MaintenanceTypeCreate> }) =>
      api.updateMaintenanceType(id, payload),
    onSuccess: async () => {
      await invalidateMaintenance();
      setShowTypeModal(false);
      setEditingType(null);
      showToast(nativeMessage('native.a178120d96309cd1'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.1ab6b21f4f93574a'), 'error'),
  });

  const deleteTypeMutation = useMutation({
    mutationFn: (id: number) => api.deleteMaintenanceType(id),
    onSuccess: async () => {
      await invalidateMaintenance();
      setPendingDeleteType(null);
      showToast(nativeMessage('native.14d2898cd564e329'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.89ffe7a3642fe5df'), 'error'),
  });

  const assignTypeMutation = useMutation({
    mutationFn: ({ printerId, typeId }: { printerId: number; typeId: number }) =>
      api.assignMaintenanceType(printerId, typeId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['maintenanceOverview'] });
      setAssignPrinter(null);
      showToast(nativeMessage('native.91f5d5b8467e0c4d'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.cfca4abd199b8a86'), 'error'),
  });

  const printers = useLocalizedMemo(() => {
    const rows = (overviewQuery.data ?? []) as PrinterMaintenanceOverview[];
    return rows
      .map(printer => ({
        ...printer,
        maintenance_items: printer.maintenance_items.filter(task => {
          if (filter === 'due') return task.is_due;
          if (filter === 'warning') return task.is_warning;
          return true;
        }),
      }))
      .sort((a, b) => {
        const scoreA = a.due_count * 10 + a.warning_count;
        const scoreB = b.due_count * 10 + b.warning_count;
        if (scoreA !== scoreB) return scoreB - scoreA;
        return a.printer_name.localeCompare(b.printer_name);
      });
  }, [filter, overviewQuery.data]);

  const maintenanceTypes = useLocalizedMemo(
    () =>
      ([...(typesQuery.data ?? [])] as MaintenanceType[]).sort((a, b) => a.name.localeCompare(b.name)),
    [typesQuery.data],
  );

  const refreshAll = async () => {
    await Promise.all([
      overviewQuery.refetch(),
      typesQuery.refetch(),
      activeTab === 'history' ? historyQuery.refetch() : Promise.resolve(),
    ]);
  };

  if (overviewQuery.isLoading && typesQuery.isLoading) {
    return <LoadingScreen message={translateNative('native.0852097f10406d0a')} />;
  }

  if (overviewQuery.isError) {
    return (
      <ErrorState
        message={translateNative('native.8d2cf47bb6f5a9b3')}
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
            refreshing={overviewQuery.isRefetching || typesQuery.isRefetching || historyQuery.isRefetching}
            onRefresh={() => void refreshAll()}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>{translateNative('nav.maintenance')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{translateNative('native.f6a61fafe516bf67')}</Text>
        </View>

        <InlineTabBar
          value={activeTab}
          tabs={[
            { key: 'overview', get label() { return translateNative('native.dd193ff312ed2a5e'); } },
            { key: 'history', get label() { return translateNative('native.3e425c5cfa54f209'); } },
            { key: 'types', get label() { return translateNative('native.6988195259ec96ea'); } },
          ]}
          onChange={value => setActiveTab(value)}
        />
        {activeTab === 'types' ? <RestoreMaintenanceDefaults /> : null}

        {activeTab === 'overview' ? (
          <>
            <InlineTabBar
              value={filter}
              tabs={[
                { key: 'all', get label() { return translateNative('common.all'); } },
                { key: 'due', get label() { return translateNative('native.d4e5a0b431ab8f69', { defaultValue: 'Due' }); } },
                { key: 'warning', get label() { return translateNative('native.ecedc86c28d0c0db'); } },
              ]}
              onChange={value => setFilter(value)}
            />

            {printers.length === 0 ? (
              <EmptyState
                icon="🧰"
                title={translateNative('native.0659537f445b7f04')}
                message={translateNative('native.68c2a7f68e54f377')}
              />
            ) : (
              printers.map(printer => (
                <SectionCard
                  key={printer.printer_id}
                  title={printer.printer_name}
                  subtitle={translateNative('native.3137b40d28733679', { value0: String(printer.printer_model ?? translateNative('native.e292a54ac2d93315')), value1: String(Math.round(printer.total_print_hours)) })}
                  right={
                    <View style={styles.headerBadges}>
                      {printer.due_count > 0 ? <StatusBadge label={translateNative('native.5f2f077e23e56796', { value0: String(printer.due_count) })} color={colors.error} /> : null}
                      {printer.warning_count > 0 ? <StatusBadge label={translateNative('native.25635c2151ad42c3', { value0: String(printer.warning_count) })} color={colors.warning} /> : null}
                    </View>
                  }
                >
                  <View style={styles.printerActions}>
                    <MaintenanceControls printer={printer} />
                    <PrimaryButton
                      label={translateNative('native.3d29e8394fbaf781')}
                      variant="secondary"
                      onPress={() => setAssignPrinter(printer)}
                    />
                  </View>
                  {printer.maintenance_items.length > 0 ? (
                    printer.maintenance_items.map(task => {
                      const color = statusColor(task, colors);
                      const isBusy = toggleMutation.isPending || performMutation.isPending;
                      return (
                        <View
                          key={task.id}
                          style={[
                            styles.taskCard,
                            { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                          ]}
                        >
                          <View style={styles.taskHeader}>
                            <MaintenanceIcon name={task.maintenance_type_icon} color={color} />
                            <View style={styles.taskText}>
                              <Text style={[styles.taskTitle, { color: colors.text }]}>{task.maintenance_type_name}</Text>
                              <Text style={[styles.taskMeta, { color }]}>{dueLabel(task)}</Text>
                            </View>
                            <Switch
                              value={task.enabled}
                              onValueChange={enabled =>
                                void toggleMutation.mutateAsync({ id: task.id, enabled })
                              }
                              trackColor={{ false: colors.surfaceHover, true: colors.accent }}
                              thumbColor={colors.text}
                            />
                          </View>

                          <ProgressBar progress={progressValue(task)} color={color} trackColor={colors.surfaceHover} />

                          <View style={styles.metaGrid}>
                            <Text style={[styles.taskMeta, { color: colors.textSecondary }]}><NativeTranslation id="native.d0e6a4083c921a0d" values={{ value0: (formatIntervalValue(task.interval_hours, task.interval_type)) }} /></Text>
                            <Text style={[styles.taskMeta, { color: colors.textSecondary }]}><NativeTranslation id="native.a724053ef18ebaa2" values={{ value0: (formatDateTime(task.last_performed_at)) }} /></Text>
                            <Text style={[styles.taskMeta, { color: colors.textSecondary }]}><NativeTranslation id="native.b5ed0e628d5b05c4" values={{ value0: (nextDueLabel(task)) }} /></Text>
                          </View>

                          <View style={styles.actions}>
                            <MaintenanceControls printer={printer} item={task} />
                            <PrimaryButton
                              label={performMutation.isPending ? translateNative('native.32ea9ced32d1ed6a') : translateNative('native.73e85c617bd70e70')}
                              onPress={() => void performMutation.mutateAsync(task.id)}
                              disabled={!task.enabled || isBusy}
                              variant={task.is_due ? 'primary' : 'secondary'}
                              loading={performMutation.isPending}
                            />
                          </View>
                        </View>
                      );
                    })
                  ) : (
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}><NativeTranslation id="native.0239c673d19b8f16" values={{ value0: (printer.printer_name) }} /></Text>
                  )}
                </SectionCard>
              ))
            )}
          </>
        ) : activeTab === 'history' ? (
          <SectionCard
            title={translateNative('native.8f8d67f6169af2be')}
            subtitle={translateNative('native.741a5c195dd27025')}
          >
            {(historyQuery.data ?? []).length === 0 ? (
              <EmptyState
                icon="🗓"
                title={translateNative('native.b61d9331298bf253')}
                message={translateNative('native.a9447417c7c9c258')}
              />
            ) : (
              ((historyQuery.data ?? []) as Array<MaintenanceHistory & { printer_name: string; maintenance_type_name: string }>).map(entry => (
                <View
                  key={entry.id}
                  style={[
                    styles.typeCard,
                    { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.typeHeader}>
                    <View style={styles.typeText}>
                      <Text style={[styles.typeTitle, { color: colors.text }]}>{entry.maintenance_type_name}</Text>
                      <Text style={[styles.typeMeta, { color: colors.textSecondary }]}>
                        {entry.printer_name} • {formatDateTime(entry.performed_at)}
                      </Text>
                    </View>
                    <StatusBadge label={translateNative('native.53dde993a4442eb6', { value0: String(entry.hours_at_maintenance.toFixed(1)) })} color={colors.accent} />
                  </View>
                  {entry.notes ? (
                    <Text style={[styles.typeDescription, { color: colors.textSecondary }]}>{entry.notes}</Text>
                  ) : (
                    <Text style={[styles.typeDescription, { color: colors.textSecondary }]}>{translateNative('native.f4b3e8197d2a1fb7')}</Text>
                  )}
                </View>
              ))
            )}
          </SectionCard>
        ) : (
          <SectionCard
            title={translateNative('native.3f52406d78fe2db5')}
            subtitle={translateNative('native.96c0ab8ab55f3aeb')}
            right={<PrimaryButton label={translateNative('native.c519ba28020cef84')} onPress={() => { setEditingType(null); setShowTypeModal(true); }} />}
          >
            {maintenanceTypes.length === 0 ? (
              <EmptyState
                icon="📝"
                title={translateNative('native.5071c42e08d40ff0')}
                message={translateNative('native.f2615fe7879bd0d8')}
              />
            ) : (
              maintenanceTypes.map(type => {
                const category = inferCategory(type);
                return (
                  <View
                    key={type.id}
                    style={[
                      styles.typeCard,
                      { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                    ]}
                  >
                    <View style={styles.typeHeader}>
                      <MaintenanceIcon name={type.icon} color={colors.accent} />
                      <View style={styles.typeText}>
                        <Text style={[styles.typeTitle, { color: colors.text }]}>{type.name}</Text>
                        <Text style={[styles.typeMeta, { color: colors.textSecondary }]}> 
                          {formatIntervalValue(type.default_interval_hours, type.interval_type)} • {categoryLabel(category)}
                        </Text>
                      </View>
                      <View style={styles.typeBadges}>
                        <StatusBadge label={type.is_system ? translateNative('nav.system') : translateNative('native.19e0b7062d3b2276')} color={type.is_system ? colors.info : colors.accent} />
                      </View>
                    </View>
                    {type.description ? (
                      <Text style={[styles.typeDescription, { color: colors.textSecondary }]}>{type.description}</Text>
                    ) : null}
                    <View style={styles.typeActions}>
                      <PrimaryButton
                        label={translateNative('common.edit')}
                        variant="secondary"
                        onPress={() => {
                          setEditingType(type);
                          setShowTypeModal(true);
                        }}
                      />
                      <PrimaryButton
                        label={translateNative('common.delete')}
                        variant="danger"
                        onPress={() => setPendingDeleteType(type)}
                      />
                    </View>
                  </View>
                );
              })
            )}
          </SectionCard>
        )}
      </ScrollView>

      <MaintenanceTypeFormModal
        visible={showTypeModal}
        type={editingType}
        loading={createTypeMutation.isPending || updateTypeMutation.isPending}
        printers={overviewQuery.data ?? []}
        onClose={() => {
          setShowTypeModal(false);
          setEditingType(null);
        }}
        onSubmit={(payload, printerIds) => {
          if (editingType) {
            updateTypeMutation.mutate({ id: editingType.id, payload });
            return;
          }
          createTypeMutation.mutate({ payload, printerIds });
        }}
      />

      <AssignTypeModal
        visible={assignPrinter !== null}
        printer={assignPrinter}
        types={maintenanceTypes}
        loading={assignTypeMutation.isPending}
        onClose={() => setAssignPrinter(null)}
        onAssign={typeId => {
          if (!assignPrinter) return;
          assignTypeMutation.mutate({ printerId: assignPrinter.printer_id, typeId });
        }}
      />

      <ConfirmModal
        visible={pendingDeleteType !== null}
        title={translateNative('native.76656bc3518aeda3')}
        message={pendingDeleteType ? translateNative('native.cd3f568f91923dc7', { value0: String(pendingDeleteType.name) }) : ''}
        confirmLabel={translateNative('common.delete')}
        variant="danger"
        loading={deleteTypeMutation.isPending}
        onClose={() => setPendingDeleteType(null)}
        onConfirm={() => {
          if (!pendingDeleteType) return;
          deleteTypeMutation.mutate(pendingDeleteType.id);
        }}
      />
    </>
  );
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
  headerBadges: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  printerActions: {
    marginBottom: spacing.sm,
  },
  taskCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  taskHeader: {
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taskText: {
    flex: 1,
    gap: spacing.xs,
  },
  taskTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  taskMeta: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  metaGrid: {
    gap: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  emptyText: {
    fontSize: fontSize.sm,
  },
  typeCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  typeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  typeText: {
    flex: 1,
    gap: spacing.xs,
  },
  typeTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  typeMeta: {
    fontSize: fontSize.sm,
  },
  typeDescription: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  typeBadges: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  typeActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalKeyboardArea: {
    width: '100%',
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  modalHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
  },
  modalSubtitle: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formGroup: {
    marginBottom: spacing.md,
  },
  formLabel: {
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
  },
  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  categoryChip: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  categoryChipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  modalActions: {
    gap: spacing.sm,
  },
  assignList: {
    maxHeight: 360,
  },
  assignRow: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  assignText: {
    gap: spacing.xs,
  },
  assignTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  assignMeta: {
    fontSize: fontSize.sm,
  },
  assignDescription: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});
