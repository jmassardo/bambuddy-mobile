import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { PrimaryButton, SectionCard, StatusBadge, TextField } from '@/components/common/AppUI';
import { OptionChipsField, SimpleModal, SwitchRow, settingsStyles } from '@/components/settings/shared';
import { useToast } from '@/contexts/ToastContext';
import type { RootNavigationProp } from '@/navigation/types';
import { useTheme } from '@/theme';
import { fontSize, fontWeight, spacing } from '@/theme/tokens';
import { pickBoolean, pickNumber, pickString, statusColor, type ApiRecord } from '@/utils/data';

type VirtualPrinterFormState = {
  name: string;
  model: string;
  model_name: string;
  description: string;
  serial_number: string;
  enabled: boolean;
};

const EMPTY_VIRTUAL_PRINTER_FORM: VirtualPrinterFormState = {
  name: 'Bambuddy',
  model: 'BL-P001',
  model_name: 'BL-P001',
  description: '',
  serial_number: '',
  enabled: false,
};

export default function VirtualPrintersScreen() {
  const navigation = useNavigation<RootNavigationProp<'VirtualPrinters'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Virtual Printers' });
  }, [navigation]);

  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [virtualPrinterModalVisible, setVirtualPrinterModalVisible] = useState(false);
  const [editingVirtualPrinter, setEditingVirtualPrinter] = useState<ApiRecord | null>(null);
  const [virtualPrinterForm, setVirtualPrinterForm] = useState<VirtualPrinterFormState>(EMPTY_VIRTUAL_PRINTER_FORM);
  const [pendingDeleteVirtualPrinter, setPendingDeleteVirtualPrinter] = useState<ApiRecord | null>(null);

  const virtualPrinterListQuery = useQuery({
    queryKey: ['virtualPrinterList'],
    queryFn: api.getVirtualPrinterList,
  });

  const virtualPrinterItems = useMemo(
    () =>
      Array.isArray(virtualPrinterListQuery.data?.printers)
        ? (virtualPrinterListQuery.data.printers as ApiRecord[])
        : [],
    [virtualPrinterListQuery.data],
  );

  const virtualPrinterModels = useMemo(() => {
    const source = (virtualPrinterListQuery.data?.models ?? {}) as Record<string, unknown>;
    return Object.entries(source).map(([key, value]) => ({ key, label: String(value) }));
  }, [virtualPrinterListQuery.data]);

  const virtualPrinterControlMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'start' | 'stop' }) =>
      action === 'start' ? api.startVirtualPrinter(id) : api.stopVirtualPrinter(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['virtualPrinterList'] });
    },
    onError: (error: Error) =>
      showToast(error.message || 'Unable to update virtual printer.', 'error'),
  });

  const saveVirtualPrinterMutation = useMutation({
    mutationFn: () => {
      const model = virtualPrinterForm.model_name.trim() || virtualPrinterForm.model.trim();
      const payload: Record<string, unknown> = {
        name: virtualPrinterForm.name.trim() || 'Bambuddy',
        model: model || undefined,
        enabled: virtualPrinterForm.enabled,
      };
      if (virtualPrinterForm.description.trim()) {
        payload.description = virtualPrinterForm.description.trim();
      }
      if (virtualPrinterForm.serial_number.trim()) {
        payload.access_code = virtualPrinterForm.serial_number.trim();
      }
      return editingVirtualPrinter
        ? api.updateVirtualPrinter(pickNumber(editingVirtualPrinter, ['id']), payload)
        : api.createVirtualPrinter(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['virtualPrinterList'] });
      closeVirtualPrinterModal();
      showToast('Virtual printer saved.', 'success');
    },
    onError: (error: Error) =>
      showToast(error.message || 'Unable to save virtual printer.', 'error'),
  });

  const deleteVirtualPrinterMutation = useMutation({
    mutationFn: (id: number) => api.deleteVirtualPrinter(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['virtualPrinterList'] });
      setPendingDeleteVirtualPrinter(null);
      showToast('Virtual printer deleted.', 'success');
    },
    onError: (error: Error) =>
      showToast(error.message || 'Unable to delete virtual printer.', 'error'),
  });

  function closeVirtualPrinterModal() {
    setVirtualPrinterModalVisible(false);
    setEditingVirtualPrinter(null);
    setVirtualPrinterForm(EMPTY_VIRTUAL_PRINTER_FORM);
  }

  function openVirtualPrinterModal(printer?: ApiRecord) {
    if (printer) {
      const model = pickString(printer, ['model_name', 'model'], 'BL-P001');
      setEditingVirtualPrinter(printer);
      setVirtualPrinterForm({
        name: pickString(printer, ['name'], 'Bambuddy'),
        model,
        model_name: model,
        description: pickString(printer, ['description'], ''),
        serial_number: pickString(printer, ['serial_number', 'serial'], ''),
        enabled: pickBoolean(printer, ['enabled', 'status.running']),
      });
    } else {
      setEditingVirtualPrinter(null);
      setVirtualPrinterForm(EMPTY_VIRTUAL_PRINTER_FORM);
    }
    setVirtualPrinterModalVisible(true);
  }

  const handleSaveVirtualPrinter = () => {
    if (!virtualPrinterForm.name.trim()) {
      showToast('Virtual printer name is required.', 'error');
      return;
    }
    saveVirtualPrinterMutation.mutate();
  };

  if (virtualPrinterListQuery.isLoading) {
    return <LoadingScreen message="Loading virtual printers…" />;
  }

  if (virtualPrinterListQuery.isError) {
    return (
      <ErrorState
        message="Unable to load virtual printers."
        onRetry={() => void virtualPrinterListQuery.refetch()}
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
            refreshing={virtualPrinterListQuery.isRefetching}
            onRefresh={() => void virtualPrinterListQuery.refetch()}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Virtual Printers</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Software-defined printers for testing, planning, and tracking.
          </Text>
        </View>

        <SectionCard
          title="Manage virtual printers"
          subtitle="Create, edit, start/stop, and remove virtual printers."
        >
          <PrimaryButton
            label="Create virtual printer"
            variant="secondary"
            onPress={() => openVirtualPrinterModal()}
          />
          {virtualPrinterItems.length > 0 ? (
            virtualPrinterItems.map(printer => {
              const running = pickBoolean(printer, [
                'status.running',
                'running',
                'enabled',
              ]);
              return (
                <View
                  key={pickString(printer, ['id'])}
                  style={[
                    settingsStyles.itemCard,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={settingsStyles.itemHeader}>
                    <View style={settingsStyles.itemText}>
                      <Text style={[settingsStyles.itemTitle, { color: colors.text }]}>
                        {pickString(printer, ['name'], 'Virtual printer')}
                      </Text>
                      <Text
                        style={[settingsStyles.itemMeta, { color: colors.textSecondary }]}
                      >
                        {pickString(printer, ['model_name', 'model'], 'Unknown model')} •
                        Pending {pickString(printer, ['status.pending_files'], '0')}
                      </Text>
                      {pickString(printer, ['description']) ? (
                        <Text
                          style={[
                            settingsStyles.itemMeta,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {pickString(printer, ['description'])}
                        </Text>
                      ) : null}
                    </View>
                    <StatusBadge
                      label={running ? 'running' : 'stopped'}
                      color={statusColor(
                        running ? 'success' : 'offline',
                        colors,
                      )}
                    />
                  </View>
                  <View style={settingsStyles.actions}>
                    <PrimaryButton
                      label="Start"
                      variant="secondary"
                      onPress={() =>
                        void virtualPrinterControlMutation.mutateAsync({
                          id: pickNumber(printer, ['id']),
                          action: 'start',
                        })
                      }
                    />
                    <PrimaryButton
                      label="Stop"
                      variant="secondary"
                      onPress={() =>
                        void virtualPrinterControlMutation.mutateAsync({
                          id: pickNumber(printer, ['id']),
                          action: 'stop',
                        })
                      }
                    />
                    <PrimaryButton
                      label="Edit"
                      variant="secondary"
                      onPress={() => openVirtualPrinterModal(printer)}
                    />
                    <PrimaryButton
                      label="Delete"
                      variant="danger"
                      onPress={() => setPendingDeleteVirtualPrinter(printer)}
                    />
                  </View>
                </View>
              );
            })
          ) : (
            <EmptyState
              icon="🖨"
              title="No virtual printers"
              message="Create a virtual printer to start managing it here."
            />
          )}
        </SectionCard>
      </ScrollView>

      <SimpleModal
        visible={virtualPrinterModalVisible}
        title={editingVirtualPrinter ? 'Edit virtual printer' : 'Create virtual printer'}
        subtitle="Name, model, description, access code, and enabled state."
        onClose={closeVirtualPrinterModal}
      >
        <ScrollView contentContainerStyle={settingsStyles.modalBody}>
          <TextField
            label="Name"
            value={virtualPrinterForm.name}
            onChangeText={value =>
              setVirtualPrinterForm(current => ({ ...current, name: value }))
            }
          />
          <OptionChipsField
            label="Model"
            value={virtualPrinterForm.model_name}
            options={virtualPrinterModels}
            onChange={value =>
              setVirtualPrinterForm(current => ({
                ...current,
                model: value,
                model_name: value,
              }))
            }
          />
          <TextField
            label="Custom model"
            value={virtualPrinterForm.model_name}
            onChangeText={value =>
              setVirtualPrinterForm(current => ({
                ...current,
                model: value,
                model_name: value,
              }))
            }
          />
          <TextField
            label="Description"
            value={virtualPrinterForm.description}
            onChangeText={value =>
              setVirtualPrinterForm(current => ({ ...current, description: value }))
            }
            multiline
          />
          <TextField
            label="Access code"
            value={virtualPrinterForm.serial_number}
            onChangeText={value =>
              setVirtualPrinterForm(current => ({
                ...current,
                serial_number: value,
              }))
            }
            autoCapitalize="characters"
          />
          <SwitchRow
            label="Enabled"
            value={virtualPrinterForm.enabled}
            onValueChange={value =>
              setVirtualPrinterForm(current => ({ ...current, enabled: value }))
            }
          />
          <View style={settingsStyles.modalFooter}>
            <PrimaryButton
              label="Cancel"
              variant="secondary"
              onPress={closeVirtualPrinterModal}
            />
            <PrimaryButton
              label={
                editingVirtualPrinter
                  ? saveVirtualPrinterMutation.isPending
                    ? 'Saving…'
                    : 'Save printer'
                  : saveVirtualPrinterMutation.isPending
                    ? 'Creating…'
                    : 'Create printer'
              }
              onPress={handleSaveVirtualPrinter}
              loading={saveVirtualPrinterMutation.isPending}
              disabled={saveVirtualPrinterMutation.isPending}
            />
          </View>
        </ScrollView>
      </SimpleModal>

      <ConfirmModal
        visible={pendingDeleteVirtualPrinter !== null}
        title="Delete virtual printer"
        message={
          pendingDeleteVirtualPrinter
            ? `Delete ${pickString(pendingDeleteVirtualPrinter, ['name'], 'this virtual printer')}?`
            : 'Delete this virtual printer?'
        }
        confirmLabel="Delete"
        onClose={() => setPendingDeleteVirtualPrinter(null)}
        onConfirm={() =>
          pendingDeleteVirtualPrinter &&
          void deleteVirtualPrinterMutation.mutateAsync(
            pickNumber(pendingDeleteVirtualPrinter, ['id']),
          )
        }
        loading={deleteVirtualPrinterMutation.isPending}
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
  header: {
    gap: spacing.xs,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    fontSize: fontSize.base,
    lineHeight: 22,
  },
});
