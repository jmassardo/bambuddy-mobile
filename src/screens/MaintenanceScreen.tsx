import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import {
  FloatingActionButton,
  PrimaryButton,
  SectionCard,
  StatusBadge,
  TextField,
} from '@/components/common/AppUI';
import {
  EmptyState,
  ErrorState,
  LoadingScreen,
} from '@/components/common/StateScreens';
import {
  formatDate,
  pickId,
  pickNumber,
  pickString,
  type ApiRecord,
} from '@/utils/data';

function dueBadgeColor(
  status: string,
  colors: ReturnType<typeof useTheme>['colors'],
) {
  const normalized = status.toLowerCase();
  if (normalized.includes('overdue')) return colors.error;
  if (normalized.includes('soon') || normalized.includes('due'))
    return colors.warning;
  return colors.success;
}

export default function MaintenanceScreen() {
  const navigation = useNavigation<any>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Maintenance' });
  }, [navigation]);
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [printerId, setPrinterId] = useState('');
  const [taskName, setTaskName] = useState('');
  const [intervalDays, setIntervalDays] = useState('30');

  const tasksQuery = useQuery({
    queryKey: ['maintenanceTasks'],
    queryFn: () => api.getMaintenanceTasks(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createMaintenanceTask({
        printer_id: Number(printerId) || undefined,
        name: taskName,
        interval_days: Number(intervalDays) || 30,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['maintenanceTasks'] });
      showToast('Maintenance task created.', 'success');
      setShowModal(false);
      setPrinterId('');
      setTaskName('');
      setIntervalDays('30');
    },
    onError: () => showToast('Failed to create maintenance task.', 'error'),
  });

  const groupedTasks = useMemo(() => {
    const map = new Map<string, ApiRecord[]>();
    ((tasksQuery.data ?? []) as ApiRecord[]).forEach(task => {
      const printerName = pickString(
        task,
        ['printer_name', 'printer'],
        'Unassigned Printer',
      );
      map.set(printerName, [...(map.get(printerName) ?? []), task]);
    });
    return Array.from(map.entries()).map(([printerName, tasks]) => ({
      printerName,
      tasks,
    }));
  }, [tasksQuery.data]);

  if (tasksQuery.isLoading) {
    return <LoadingScreen message="Loading maintenance tasks…" />;
  }

  if (tasksQuery.isError) {
    return (
      <ErrorState
        message="Unable to load maintenance tasks."
        onRetry={() => void tasksQuery.refetch()}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={groupedTasks}
        keyExtractor={item => item.printerName}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={tasksQuery.isRefetching}
            onRefresh={() => void tasksQuery.refetch()}
            tintColor={colors.accent}
          />
        }
        renderItem={({ item }) => (
          <SectionCard
            title={item.printerName}
            subtitle={`${item.tasks.length} scheduled task${
              item.tasks.length === 1 ? '' : 's'
            }`}
          >
            {item.tasks.map(task => {
              const dueStatus = pickString(
                task,
                ['due_status', 'status'],
                'OK',
              );
              return (
                <View
                  key={pickId(task)}
                  style={[
                    styles.taskCard,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.taskHeader}>
                    <View style={styles.taskText}>
                      <Text style={[styles.taskTitle, { color: colors.text }]}>
                        {pickString(task, ['name'], 'Unnamed task')}
                      </Text>
                      <Text
                        style={[
                          styles.taskMeta,
                          { color: colors.textSecondary },
                        ]}
                      >
                        Every{' '}
                        {pickNumber(task, ['interval_days', 'interval'], 0)}{' '}
                        days
                      </Text>
                    </View>
                    <StatusBadge
                      label={dueStatus}
                      color={dueBadgeColor(dueStatus, colors)}
                    />
                  </View>
                  <Text
                    style={[styles.taskMeta, { color: colors.textSecondary }]}
                  >
                    Last completed:{' '}
                    {formatDate(
                      pickString(task, ['last_completed_at', 'completed_at']),
                    )}
                  </Text>
                </View>
              );
            })}
          </SectionCard>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="🧰"
            title="No maintenance tasks"
            message="Create a recurring task to track preventative maintenance."
          />
        }
      />

      <FloatingActionButton
        icon="plus"
        label="Add Task"
        onPress={() => setShowModal(true)}
      />

      <Modal visible={showModal} animationType="slide" transparent>
        <View
          style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
        >
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.modalBg, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Add maintenance task
            </Text>
            <TextField
              label="Printer ID (optional)"
              value={printerId}
              onChangeText={setPrinterId}
              keyboardType="number-pad"
            />
            <TextField
              label="Task name"
              value={taskName}
              onChangeText={setTaskName}
            />
            <TextField
              label="Interval in days"
              value={intervalDays}
              onChangeText={setIntervalDays}
              keyboardType="number-pad"
            />
            <View style={styles.modalButtons}>
              <View style={styles.modalButton}>
                <PrimaryButton
                  label="Cancel"
                  onPress={() => setShowModal(false)}
                  variant="secondary"
                />
              </View>
              <View style={styles.modalButton}>
                <PrimaryButton
                  label={createMutation.isPending ? 'Saving…' : 'Save'}
                  onPress={() => void createMutation.mutateAsync()}
                  loading={createMutation.isPending}
                  disabled={taskName.trim().length === 0}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 96 },
  separator: { height: spacing.md },
  taskCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  taskText: { flex: 1, gap: spacing.xs },
  taskTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  taskMeta: { fontSize: fontSize.sm },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: borderRadius['2xl'],
    padding: spacing.lg,
    gap: spacing.lg,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  modalButtons: { flexDirection: 'row', gap: spacing.md },
  modalButton: { flex: 1 },
});
