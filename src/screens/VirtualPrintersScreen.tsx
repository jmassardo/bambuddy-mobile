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
import {
  PrimaryButton,
  SectionCard,
  StatusBadge,
  TextField,
} from '@/components/common/AppUI';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import {
  EmptyState,
  ErrorState,
  LoadingScreen,
} from '@/components/common/StateScreens';
import {
  OptionChipsField,
  settingsStyles,
  SimpleModal,
  SwitchRow,
} from '@/components/settings/shared';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import type { RootNavigationProp } from '@/navigation/types';
import { useTheme } from '@/theme';
import { fontSize, fontWeight, spacing } from '@/theme/tokens';
import type {
  VirtualPrinterConfig,
  VirtualPrinterListResponse,
} from '@/types/api';
import { statusColor } from '@/utils/data';

const VIRTUAL_PRINTERS_QUERY_KEY = ['virtualPrinters'] as const;

type VirtualPrinterFormState = {
  name: string;
  model: string;
  accessCode: string;
  enabled: boolean;
};

const EMPTY_FORM: VirtualPrinterFormState = {
  name: 'Bambuddy',
  model: 'BL-P001',
  accessCode: '',
  enabled: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isVirtualPrinter(value: unknown): value is VirtualPrinterConfig {
  if (!isRecord(value) || !isRecord(value.status)) {
    return false;
  }
  return (
    typeof value.id === 'number' &&
    typeof value.name === 'string' &&
    typeof value.enabled === 'boolean' &&
    typeof value.status.running === 'boolean' &&
    typeof value.status.pending_files === 'number'
  );
}

async function getVirtualPrinterList(): Promise<VirtualPrinterListResponse> {
  const response = await api.getVirtualPrinterList();
  const models = isRecord(response.models)
    ? Object.fromEntries(
        Object.entries(response.models).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    : {};

  return {
    printers: Array.isArray(response.printers)
      ? response.printers.filter(isVirtualPrinter)
      : [],
    models,
  };
}

export default function VirtualPrintersScreen() {
  const navigation = useNavigation<RootNavigationProp<'VirtualPrinters'>>();
  const { colors } = useTheme();
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPrinter, setEditingPrinter] =
    useState<VirtualPrinterConfig | null>(null);
  const [form, setForm] = useState<VirtualPrinterFormState>(EMPTY_FORM);
  const [pendingDelete, setPendingDelete] =
    useState<VirtualPrinterConfig | null>(null);

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Virtual Printers' });
  }, [navigation]);

  const printersQuery = useQuery<VirtualPrinterListResponse>({
    queryKey: VIRTUAL_PRINTERS_QUERY_KEY,
    queryFn: getVirtualPrinterList,
  });

  const printers = printersQuery.data?.printers ?? [];
  const modelOptions = useMemo(
    () =>
      Object.entries(printersQuery.data?.models ?? {}).map(([key, label]) => ({
        key,
        label,
      })),
    [printersQuery.data?.models],
  );

  const controlMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'start' | 'stop' }) =>
      action === 'start'
        ? api.startVirtualPrinter(id)
        : api.stopVirtualPrinter(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: VIRTUAL_PRINTERS_QUERY_KEY,
      });
    },
    onError: (error: Error) => {
      showToast(
        error.message || 'Unable to update virtual printer.',
        'error',
      );
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        model: form.model.trim() || undefined,
        enabled: form.enabled,
      };
      if (form.accessCode.trim()) {
        payload.access_code = form.accessCode.trim();
      }

      return editingPrinter
        ? api.updateVirtualPrinter(editingPrinter.id, payload)
        : api.createVirtualPrinter(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: VIRTUAL_PRINTERS_QUERY_KEY,
      });
      closeModal();
      showToast('Virtual printer saved.', 'success');
    },
    onError: (error: Error) => {
      showToast(error.message || 'Unable to save virtual printer.', 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteVirtualPrinter(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: VIRTUAL_PRINTERS_QUERY_KEY,
      });
      setPendingDelete(null);
      showToast('Virtual printer deleted.', 'success');
    },
    onError: (error: Error) => {
      showToast(error.message || 'Unable to delete virtual printer.', 'error');
    },
  });

  function closeModal() {
    setModalVisible(false);
    setEditingPrinter(null);
    setForm(EMPTY_FORM);
  }

  function openModal(printer?: VirtualPrinterConfig) {
    if (printer) {
      setEditingPrinter(printer);
      setForm({
        name: printer.name,
        model: printer.model || printer.model_name || 'BL-P001',
        accessCode: printer.serial,
        enabled: printer.enabled,
      });
    } else {
      setEditingPrinter(null);
      setForm(EMPTY_FORM);
    }
    setModalVisible(true);
  }

  function handleSave() {
    if (!form.name.trim()) {
      showToast('Virtual printer name is required.', 'error');
      return;
    }
    saveMutation.mutate();
  }

  if (printersQuery.isLoading) {
    return <LoadingScreen message="Loading virtual printers..." />;
  }

  if (printersQuery.isError) {
    return (
      <ErrorState
        message="Unable to load virtual printers."
        onRetry={() => void printersQuery.refetch()}
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
            refreshing={printersQuery.isRefetching}
            onRefresh={() => void printersQuery.refetch()}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>
            Virtual Printers
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Software-defined printers for testing, planning, and tracking.
          </Text>
        </View>

        <SectionCard
          title="Manage virtual printers"
          subtitle="Create, edit, start, stop, and remove virtual printers."
        >
          {isAdmin ? (
            <PrimaryButton
              label="Create virtual printer"
              variant="secondary"
              onPress={() => openModal()}
            />
          ) : null}
          {printers.length > 0 ? (
            printers.map(printer => {
              const running = printer.status.running;
              return (
                <View
                  key={printer.id}
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
                      <Text
                        style={[
                          settingsStyles.itemTitle,
                          { color: colors.text },
                        ]}
                      >
                        {printer.name}
                      </Text>
                      <Text
                        style={[
                          settingsStyles.itemMeta,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {printer.model_name ||
                          printer.model ||
                          'Unknown model'}{' '}
                        • Pending {printer.status.pending_files}
                      </Text>
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
                        controlMutation.mutate({
                          id: printer.id,
                          action: 'start',
                        })
                      }
                      disabled={running || controlMutation.isPending}
                    />
                    <PrimaryButton
                      label="Stop"
                      variant="secondary"
                      onPress={() =>
                        controlMutation.mutate({
                          id: printer.id,
                          action: 'stop',
                        })
                      }
                      disabled={!running || controlMutation.isPending}
                    />
                    {isAdmin ? (
                      <>
                        <PrimaryButton
                          label="Edit"
                          variant="secondary"
                          onPress={() => openModal(printer)}
                        />
                        <PrimaryButton
                          label="Delete"
                          variant="danger"
                          onPress={() => setPendingDelete(printer)}
                        />
                      </>
                    ) : null}
                  </View>
                </View>
              );
            })
          ) : (
            <EmptyState
              icon="printer"
              title="No virtual printers"
              message="Create a virtual printer to start managing it here."
            />
          )}
        </SectionCard>
      </ScrollView>

      <SimpleModal
        visible={modalVisible}
        title={editingPrinter ? 'Edit virtual printer' : 'Create virtual printer'}
        subtitle="Configure the name, model, access code, and enabled state."
        onClose={closeModal}
      >
        <ScrollView contentContainerStyle={settingsStyles.modalBody}>
          <TextField
            label="Name"
            value={form.name}
            onChangeText={name => setForm(current => ({ ...current, name }))}
          />
          <OptionChipsField
            label="Model"
            value={form.model}
            options={modelOptions}
            onChange={model => setForm(current => ({ ...current, model }))}
          />
          <TextField
            label="Custom model"
            value={form.model}
            onChangeText={model => setForm(current => ({ ...current, model }))}
          />
          <TextField
            label="Access code"
            value={form.accessCode}
            onChangeText={accessCode =>
              setForm(current => ({ ...current, accessCode }))
            }
            autoCapitalize="characters"
          />
          <SwitchRow
            label="Enabled"
            value={form.enabled}
            onValueChange={enabled =>
              setForm(current => ({ ...current, enabled }))
            }
          />
          <View style={settingsStyles.modalFooter}>
            <PrimaryButton
              label="Cancel"
              variant="secondary"
              onPress={closeModal}
            />
            <PrimaryButton
              label={
                editingPrinter
                  ? saveMutation.isPending
                    ? 'Saving...'
                    : 'Save printer'
                  : saveMutation.isPending
                    ? 'Creating...'
                    : 'Create printer'
              }
              onPress={handleSave}
              loading={saveMutation.isPending}
              disabled={saveMutation.isPending}
            />
          </View>
        </ScrollView>
      </SimpleModal>

      <ConfirmModal
        visible={pendingDelete !== null}
        title="Delete virtual printer"
        message={
          pendingDelete
            ? `Delete ${pendingDelete.name}?`
            : 'Delete this virtual printer?'
        }
        confirmLabel="Delete"
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            deleteMutation.mutate(pendingDelete.id);
          }
        }}
        loading={deleteMutation.isPending}
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
