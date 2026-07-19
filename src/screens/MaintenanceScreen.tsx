import React, { useEffect, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
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
import { formatDateTime } from '@/utils/data';
import type { AppNavigationProp } from '@/navigation/types';

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
}

const MAINTENANCE_CATEGORIES: Array<{
  key: MaintenanceCategoryKey;
  label: string;
  icon: string;
}> = [
  { key: 'general', label: 'General', icon: 'Wrench' },
  { key: 'cleaning', label: 'Cleaning', icon: 'Sparkles' },
  { key: 'lubrication', label: 'Lubrication', icon: 'Droplet' },
  { key: 'motion', label: 'Motion', icon: 'Ruler' },
  { key: 'extrusion', label: 'Extrusion', icon: 'Flame' },
  { key: 'build-plate', label: 'Build plate', icon: 'Square' },
  { key: 'filament-path', label: 'Filament path', icon: 'Cable' },
];

const DEFAULT_TYPE_FORM: MaintenanceTypeFormState = {
  name: '',
  description: '',
  intervalValue: '100',
  intervalType: 'hours',
  category: 'general',
};

function formatIntervalValue(value: number, type: 'hours' | 'days') {
  return type === 'days'
    ? `${value} day${value === 1 ? '' : 's'}`
    : `${value}h`;
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
      ? `Overdue by ${Math.abs(item.days_until_due ?? 0).toFixed(0)} day(s)`
      : `Overdue by ${Math.abs(item.hours_until_due).toFixed(1)}h`;
  }
  if (item.is_warning) {
    return item.interval_type === 'days'
      ? `Due in ${(item.days_until_due ?? 0).toFixed(0)} day(s)`
      : `Due in ${item.hours_until_due.toFixed(1)}h`;
  }
  return 'On schedule';
}

function nextDueLabel(item: MaintenanceStatus) {
  if (item.interval_type === 'days') {
    const anchor = item.last_performed_at ? new Date(item.last_performed_at) : new Date();
    const next = new Date(anchor.getTime() + item.interval_hours * 24 * 60 * 60 * 1000);
    return Number.isNaN(next.getTime()) ? '—' : next.toLocaleDateString();
  }
  const targetHours = item.current_hours + item.hours_until_due;
  if (!Number.isFinite(targetHours)) return '—';
  return `At ${Math.max(targetHours, 0).toFixed(1)} total print hours`;
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
  return MAINTENANCE_CATEGORIES.find(item => item.key === category)?.label ?? 'General';
}

function categoryIcon(category: MaintenanceCategoryKey) {
  return MAINTENANCE_CATEGORIES.find(item => item.key === category)?.icon ?? 'Wrench';
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

function MaintenanceTypeFormModal({
  visible,
  type,
  loading,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  type: MaintenanceType | null;
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: MaintenanceTypeCreate) => void;
}) {
  const { colors } = useTheme();
  const [form, setForm] = useState<MaintenanceTypeFormState>(DEFAULT_TYPE_FORM);

  useEffect(() => {
    if (!visible) return;
    if (type) {
      setForm({
        name: type.name,
        description: type.description ?? '',
        intervalValue: String(type.default_interval_hours ?? 100),
        intervalType: type.interval_type ?? 'hours',
        category: inferCategory(type),
      });
      return;
    }
    setForm(DEFAULT_TYPE_FORM);
  }, [type, visible]);

  const parsedInterval = Math.max(1, Number.parseFloat(form.intervalValue) || 0);
  const canSave = form.name.trim().length > 0 && parsedInterval >= 1;

  return (
    <ModalShell
      visible={visible}
      title={type ? 'Edit maintenance type' : 'Create maintenance type'}
      subtitle="Configure a reusable maintenance interval and category."
      onClose={onClose}
    >
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <TextField
          label="Name"
          value={form.name}
          onChangeText={value => setForm(current => ({ ...current, name: value }))}
          placeholder="Clean carbon rods"
        />
        <TextField
          label="Description"
          value={form.description}
          onChangeText={value => setForm(current => ({ ...current, description: value }))}
          placeholder="Short instructions or context for this task"
          multiline
        />
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Interval type</Text>
          <InlineTabBar
            value={form.intervalType}
            tabs={[
              { key: 'hours', label: 'Hours' },
              { key: 'days', label: 'Days' },
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
          label={`Interval (${form.intervalType})`}
          value={form.intervalValue}
          onChangeText={value => setForm(current => ({ ...current, intervalValue: value }))}
          placeholder={form.intervalType === 'days' ? '30' : '100'}
          keyboardType="decimal-pad"
        />
        <View style={styles.formGroup}>
          <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Category</Text>
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
        <PrimaryButton label="Cancel" variant="secondary" onPress={onClose} />
        <PrimaryButton
          label={loading ? 'Saving…' : 'Save'}
          onPress={() =>
            onSubmit({
              name: form.name.trim(),
              description: form.description.trim() || null,
              default_interval_hours: parsedInterval,
              interval_type: form.intervalType,
              category: form.category,
              icon: categoryIcon(form.category),
            })
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
  const { colors } = useTheme();

  const unassignedTypes = useMemo(() => {
    if (!printer) return [];
    const assignedIds = new Set(printer.maintenance_items.map(item => item.maintenance_type_id));
    return types.filter(type => !assignedIds.has(type.id));
  }, [printer, types]);

  return (
    <ModalShell
      visible={visible}
      title="Assign maintenance type"
      subtitle={printer ? `Choose a type for ${printer.printer_name}.` : undefined}
      onClose={onClose}
    >
      <ScrollView showsVerticalScrollIndicator={false} style={styles.assignList}>
        {unassignedTypes.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}> 
            Every maintenance type is already assigned to this printer.
          </Text>
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
                  label={loading ? 'Assigning…' : 'Assign'}
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
  const navigation = useNavigation<AppNavigationProp>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Maintenance' });
  }, [navigation]);

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
      showToast('Maintenance setting updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update maintenance item.', 'error'),
  });

  const performMutation = useMutation({
    mutationFn: (id: number) => api.performMaintenance(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['maintenanceOverview'] });
      showToast('Maintenance task marked as performed.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to perform maintenance.', 'error'),
  });

  const createTypeMutation = useMutation({
    mutationFn: (payload: MaintenanceTypeCreate) => api.createMaintenanceType(payload),
    onSuccess: async () => {
      await invalidateMaintenance();
      setShowTypeModal(false);
      setEditingType(null);
      showToast('Maintenance type created.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to create maintenance type.', 'error'),
  });

  const updateTypeMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<MaintenanceTypeCreate> }) =>
      api.updateMaintenanceType(id, payload),
    onSuccess: async () => {
      await invalidateMaintenance();
      setShowTypeModal(false);
      setEditingType(null);
      showToast('Maintenance type updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update maintenance type.', 'error'),
  });

  const deleteTypeMutation = useMutation({
    mutationFn: (id: number) => api.deleteMaintenanceType(id),
    onSuccess: async () => {
      await invalidateMaintenance();
      setPendingDeleteType(null);
      showToast('Maintenance type deleted.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to delete maintenance type.', 'error'),
  });

  const assignTypeMutation = useMutation({
    mutationFn: ({ printerId, typeId }: { printerId: number; typeId: number }) =>
      api.assignMaintenanceType(printerId, typeId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['maintenanceOverview'] });
      setAssignPrinter(null);
      showToast('Maintenance type assigned.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to assign maintenance type.', 'error'),
  });

  const printers = useMemo(() => {
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

  const maintenanceTypes = useMemo(
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
    return <LoadingScreen message="Loading maintenance…" />;
  }

  if (overviewQuery.isError) {
    return (
      <ErrorState
        message="Unable to load maintenance tasks."
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
          <Text style={[styles.title, { color: colors.text }]}>Maintenance</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Track printer upkeep and schedules.</Text>
        </View>

        <InlineTabBar
          value={activeTab}
          tabs={[
            { key: 'overview', label: 'Overview' },
            { key: 'history', label: 'History' },
            { key: 'types', label: 'Types' },
          ]}
          onChange={value => setActiveTab(value)}
        />

        {activeTab === 'overview' ? (
          <>
            <InlineTabBar
              value={filter}
              tabs={[
                { key: 'all', label: 'All' },
                { key: 'due', label: 'Due' },
                { key: 'warning', label: 'Warning' },
              ]}
              onChange={value => setFilter(value)}
            />

            {printers.length === 0 ? (
              <EmptyState
                icon="🧰"
                title="Nothing to show"
                message="No maintenance items match the current filter."
              />
            ) : (
              printers.map(printer => (
                <SectionCard
                  key={printer.printer_id}
                  title={printer.printer_name}
                  subtitle={`${printer.printer_model ?? 'Unknown model'} • ${Math.round(printer.total_print_hours)}h total print time`}
                  right={
                    <View style={styles.headerBadges}>
                      {printer.due_count > 0 ? <StatusBadge label={`${printer.due_count} due`} color={colors.error} /> : null}
                      {printer.warning_count > 0 ? <StatusBadge label={`${printer.warning_count} warning`} color={colors.warning} /> : null}
                    </View>
                  }
                >
                  <View style={styles.printerActions}>
                    <PrimaryButton
                      label="Assign type"
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
                            <Text style={[styles.taskMeta, { color: colors.textSecondary }]}>Interval: {formatIntervalValue(task.interval_hours, task.interval_type)}</Text>
                            <Text style={[styles.taskMeta, { color: colors.textSecondary }]}>Last done: {formatDateTime(task.last_performed_at)}</Text>
                            <Text style={[styles.taskMeta, { color: colors.textSecondary }]}>Next due: {nextDueLabel(task)}</Text>
                          </View>

                          <View style={styles.actions}>
                            <PrimaryButton
                              label={performMutation.isPending ? 'Performing…' : 'Perform'}
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
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No maintenance items match this filter for {printer.printer_name}.</Text>
                  )}
                </SectionCard>
              ))
            )}
          </>
        ) : activeTab === 'history' ? (
          <SectionCard
            title="Maintenance history"
            subtitle="Previously completed maintenance tasks across all printers."
          >
            {(historyQuery.data ?? []).length === 0 ? (
              <EmptyState
                icon="🗓"
                title="No maintenance history"
                message="Completed maintenance events will appear here."
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
                    <StatusBadge label={`${entry.hours_at_maintenance.toFixed(1)}h`} color={colors.accent} />
                  </View>
                  {entry.notes ? (
                    <Text style={[styles.typeDescription, { color: colors.textSecondary }]}>{entry.notes}</Text>
                  ) : (
                    <Text style={[styles.typeDescription, { color: colors.textSecondary }]}>No notes recorded.</Text>
                  )}
                </View>
              ))
            )}
          </SectionCard>
        ) : (
          <SectionCard
            title="Maintenance types"
            subtitle="Create and manage reusable maintenance schedules for your printers."
            right={<PrimaryButton label="Add type" onPress={() => { setEditingType(null); setShowTypeModal(true); }} />}
          >
            {maintenanceTypes.length === 0 ? (
              <EmptyState
                icon="📝"
                title="No maintenance types yet"
                message="Create your first maintenance type to start assigning it to printers."
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
                      <View style={styles.typeText}>
                        <Text style={[styles.typeTitle, { color: colors.text }]}>{type.name}</Text>
                        <Text style={[styles.typeMeta, { color: colors.textSecondary }]}> 
                          {formatIntervalValue(type.default_interval_hours, type.interval_type)} • {categoryLabel(category)}
                        </Text>
                      </View>
                      <View style={styles.typeBadges}>
                        <StatusBadge label={type.is_system ? 'System' : 'Custom'} color={type.is_system ? colors.info : colors.accent} />
                      </View>
                    </View>
                    {type.description ? (
                      <Text style={[styles.typeDescription, { color: colors.textSecondary }]}>{type.description}</Text>
                    ) : null}
                    <View style={styles.typeActions}>
                      <PrimaryButton
                        label="Edit"
                        variant="secondary"
                        onPress={() => {
                          setEditingType(type);
                          setShowTypeModal(true);
                        }}
                      />
                      <PrimaryButton
                        label="Delete"
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
        onClose={() => {
          setShowTypeModal(false);
          setEditingType(null);
        }}
        onSubmit={payload => {
          if (editingType) {
            updateTypeMutation.mutate({ id: editingType.id, payload });
            return;
          }
          createTypeMutation.mutate(payload);
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
        title="Delete maintenance type"
        message={pendingDeleteType ? `Delete “${pendingDeleteType.name}”? Existing printer assignments will be affected.` : ''}
        confirmLabel="Delete"
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
