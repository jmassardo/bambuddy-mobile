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
<<<<<<< HEAD
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { PrimaryButton, SectionCard, StatusBadge, TextField } from '@/components/common/AppUI';
import { OptionChipsField, SimpleModal, SwitchRow, settingsStyles } from '@/components/settings/shared';
import { useToast } from '@/contexts/ToastContext';
import type { RootNavigationProp } from '@/navigation/types';
import { useTheme } from '@/theme';
import { fontSize, fontWeight, spacing } from '@/theme/tokens';
import { pickBoolean, pickNumber, pickString, statusColor, type ApiRecord } from '@/utils/data';
=======
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
import { fontSize, fontWeight, spacing, borderRadius } from '@/theme/tokens';
import type {
  VirtualPrinterConfig,
  VirtualPrinterListResponse,
  VirtualPrinterMode,
} from '@/types/api';
import { pickBoolean, pickNumber, pickString, statusColor } from '@/utils/data';

const VIRTUAL_PRINTERS_QUERY_KEY = ['virtualPrinters'] as const;

const VIRTUAL_PRINTER_MODES: Array<{ key: VirtualPrinterMode; label: string; description: string }> = [
  { key: 'archive', label: 'Archive', description: 'Automatically archive prints' },
  { key: 'review', label: 'Review', description: 'Queue prints for review before printing' },
  { key: 'queue', label: 'Queue', description: 'Add prints to the queue' },
  { key: 'proxy', label: 'Proxy', description: 'Proxy to a real Bambu printer' },
  { key: 'immediate', label: 'Immediate', description: 'Print files immediately' },
  { key: 'print_queue', label: 'Print Queue', description: 'Direct print queue integration' },
];
>>>>>>> origin/develop

type VirtualPrinterFormState = {
  name: string;
  model: string;
<<<<<<< HEAD
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
=======
  accessCode: string;
  enabled: boolean;
  mode: VirtualPrinterMode;
  targetPrinterId: string;
  autoDispatch: boolean;
  queueForceColorMatch: boolean;
  gcodeInjection: boolean;
  tailscaleDisabled: boolean;
};

const EMPTY_FORM: VirtualPrinterFormState = {
  name: 'Bambuddy',
  model: 'BL-P001',
  accessCode: '',
  enabled: false,
  mode: 'archive',
  targetPrinterId: '',
  autoDispatch: false,
  queueForceColorMatch: false,
  gcodeInjection: false,
  tailscaleDisabled: false,
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
  const [testingPrinter, setTestingPrinter] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<string, {
    status: 'loading' | 'success' | 'error';
    message: string;
  }>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);

>>>>>>> origin/develop
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Virtual Printers' });
  }, [navigation]);

<<<<<<< HEAD
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
=======
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
        mode: form.mode,
      };
      if (form.accessCode.trim()) {
        payload.access_code = form.accessCode.trim();
      }
      if (form.targetPrinterId) {
        payload.target_printer_id = Number(form.targetPrinterId);
      }
      payload.auto_dispatch = form.autoDispatch;
      payload.queue_force_color_match = form.queueForceColorMatch;
      payload.gcode_injection = form.gcodeInjection;
      payload.tailscale_disabled = form.tailscaleDisabled;

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

  const testConnectionMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await api.testVirtualPrinterConnection(id);
      return response;
    },
    onSuccess: (result, id) => {
      const success = pickBoolean(result, ['ok', 'success']);
      setTestResults(prev => ({
        ...prev,
        [id]: {
          status: success ? 'success' : 'error',
          message: pickString(result, ['message', 'error'], success ? 'Connection successful' : 'Connection failed'),
        },
      }));
      if (!success) {
        showToast(
          pickString(result, ['message', 'error'], 'Connection test failed'),
          'error',
        );
      } else {
        showToast('Connection test successful!', 'success');
      }
    },
    onError: (error: Error, id) => {
      setTestResults(prev => ({
        ...prev,
        [id]: {
          status: 'error',
          message: error.message || 'Connection test failed',
        },
      }));
      showToast(error.message || 'Connection test failed.', 'error');
    },
    onSettled: (_, __, _id) => {
      setTestingPrinter(null);
    },
  });

  function testConnection(printer: VirtualPrinterConfig) {
    const printerId = printer.id;
    setTestingPrinter(printerId);
    setTestResults(prev => ({
      ...prev,
      [printerId]: { status: 'loading', message: 'Testing...' },
    }));
    testConnectionMutation.mutate(printerId);
  }

  function closeModal() {
    setModalVisible(false);
    setEditingPrinter(null);
    setForm(EMPTY_FORM);
    setTestResults({});
  }

  function openModal(printer?: VirtualPrinterConfig) {
    if (printer) {
      setEditingPrinter(printer);
      setForm({
        name: printer.name,
        model: printer.model || printer.model_name || 'BL-P001',
        accessCode: printer.serial,
        enabled: printer.enabled,
        mode: pickString(printer, ['mode'], 'archive') as VirtualPrinterMode,
        targetPrinterId: String(pickNumber(printer, ['target_printer_id']) || ''),
        autoDispatch: pickBoolean(printer, ['auto_dispatch'], false),
        queueForceColorMatch: pickBoolean(printer, ['queue_force_color_match'], false),
        gcodeInjection: pickBoolean(printer, ['gcode_injection'], false),
        tailscaleDisabled: pickBoolean(printer, ['tailscale_disabled'], false),
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
    if (form.mode === 'proxy' && !form.targetPrinterId) {
      showToast('Please select a target printer for proxy mode.', 'error');
      return;
    }
    saveMutation.mutate();
  }

  function handleTestProxyPrinter() {
    if (form.targetPrinterId && !editingPrinter) {
      const printerId = Number(form.targetPrinterId);
      if (printerId > 0) {
        setTestingPrinter(printerId);
        showToast('Testing target printer connection...', 'info');
      }
    }
  }

  const isProxyMode = form.mode === 'proxy';
  const isNewPrinter = !editingPrinter;

  if (printersQuery.isLoading) {
    return <LoadingScreen message="Loading virtual printers..." />;
  }

  if (printersQuery.isError) {
    return (
      <ErrorState
        message="Unable to load virtual printers."
        onRetry={() => void printersQuery.refetch()}
>>>>>>> origin/develop
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
<<<<<<< HEAD
            refreshing={virtualPrinterListQuery.isRefetching}
            onRefresh={() => void virtualPrinterListQuery.refetch()}
=======
            refreshing={printersQuery.isRefetching}
            onRefresh={() => void printersQuery.refetch()}
>>>>>>> origin/develop
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.header}>
<<<<<<< HEAD
          <Text style={[styles.title, { color: colors.text }]}>Virtual Printers</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Software-defined printers for testing, planning, and tracking.
=======
          <Text style={[styles.title, { color: colors.text }]}>
            Virtual Printers
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Software-defined printers for Bambu Studio/OrcaSlicer integration. Test connections, manage lifecycle, and configure modes.
>>>>>>> origin/develop
          </Text>
        </View>

        <SectionCard
          title="Manage virtual printers"
<<<<<<< HEAD
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
=======
          subtitle="Create, edit, test, start, stop, and remove virtual printers."
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
>>>>>>> origin/develop
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
<<<<<<< HEAD
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
=======
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
                        • {printer.mode} • Pending {printer.status.pending_files}
                      </Text>
>>>>>>> origin/develop
                    </View>
                    <StatusBadge
                      label={running ? 'running' : 'stopped'}
                      color={statusColor(
                        running ? 'success' : 'offline',
                        colors,
                      )}
                    />
                  </View>
<<<<<<< HEAD
=======

                  {/* Connection test result */}
                  {testResults[printer.id] && (
                    <View style={styles.testResult}>
                      <Text
                        style={[
                          styles.testResultText,
                          {
                            color:
                              testResults[printer.id].status === 'success'
                                ? colors.success
                                : colors.error,
                          },
                        ]}
                      >
                        {testResults[printer.id].message}
                      </Text>
                    </View>
                  )}

>>>>>>> origin/develop
                  <View style={settingsStyles.actions}>
                    <PrimaryButton
                      label="Start"
                      variant="secondary"
                      onPress={() =>
<<<<<<< HEAD
                        void virtualPrinterControlMutation.mutateAsync({
                          id: pickNumber(printer, ['id']),
                          action: 'start',
                        })
                      }
=======
                        controlMutation.mutate({
                          id: printer.id,
                          action: 'start',
                        })
                      }
                      disabled={running || controlMutation.isPending}
>>>>>>> origin/develop
                    />
                    <PrimaryButton
                      label="Stop"
                      variant="secondary"
                      onPress={() =>
<<<<<<< HEAD
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
=======
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
                      label="Test"
                      variant="secondary"
                      onPress={() => testConnection(printer)}
                      loading={testingPrinter === printer.id}
                    />
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
>>>>>>> origin/develop
                  </View>
                </View>
              );
            })
          ) : (
            <EmptyState
<<<<<<< HEAD
              icon="🖨"
=======
              icon="printer"
>>>>>>> origin/develop
              title="No virtual printers"
              message="Create a virtual printer to start managing it here."
            />
          )}
        </SectionCard>
      </ScrollView>

      <SimpleModal
<<<<<<< HEAD
        visible={virtualPrinterModalVisible}
        title={editingVirtualPrinter ? 'Edit virtual printer' : 'Create virtual printer'}
        subtitle="Name, model, description, access code, and enabled state."
        onClose={closeVirtualPrinterModal}
=======
        visible={modalVisible}
        title={editingPrinter ? 'Edit virtual printer' : 'Create virtual printer'}
        subtitle="Configure the name, mode, connection details, and advanced options."
        onClose={closeModal}
>>>>>>> origin/develop
      >
        <ScrollView contentContainerStyle={settingsStyles.modalBody}>
          <TextField
            label="Name"
<<<<<<< HEAD
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
=======
            value={form.name}
            onChangeText={name => setForm(current => ({ ...current, name }))}
            placeholder="e.g., Bambu Lab X1C"
          />

          <OptionChipsField
            label="Mode"
            value={form.mode}
            options={VIRTUAL_PRINTER_MODES}
            onChange={mode => setForm(current => ({ ...current, mode }))}
          />

          <OptionChipsField
            label="Model"
            value={form.model}
            options={modelOptions}
            onChange={model => setForm(current => ({ ...current, model }))}
          />

          {isProxyMode && (
            <View style={styles.proxySection}>
              <Text style={[styles.proxyLabel, { color: colors.text }]}>
                Target Printer
              </Text>
              <View style={styles.proxyInputRow}>
                <TextField
                  label="Printer ID"
                  value={form.targetPrinterId}
                  onChangeText={targetPrinterId =>
                    setForm(current => ({ ...current, targetPrinterId }))
                  }
                  placeholder="Enter printer ID"
                  style={styles.proxyInput}
                />
                {isNewPrinter && form.targetPrinterId && (
                  <View style={styles.testButton}>
                    <PrimaryButton
                      label="Test"
                      variant="secondary"
                      onPress={handleTestProxyPrinter}
                      loading={testingPrinter !== null}
                    />
                  </View>
                )}
              </View>
              <Text style={[styles.proxyHint, { color: colors.textSecondary }]}>
                The physical Bambu printer to proxy prints to (for proxy mode only).
              </Text>
            </View>
          )}

          <TextField
            label="Access code"
            value={form.accessCode}
            onChangeText={accessCode =>
              setForm(current => ({ ...current, accessCode }))
            }
            autoCapitalize="characters"
            placeholder="Bambu printer access code"
          />

          <SwitchRow
            label="Enabled"
            value={form.enabled}
            onValueChange={enabled =>
              setForm(current => ({ ...current, enabled }))
            }
          />

          <View style={styles.advancedToggle}>
            <Text
              style={[styles.advancedTitle, { color: colors.text }]}
              onPress={() => setShowAdvanced(!showAdvanced)}
            >
              Advanced Options {showAdvanced ? '▲' : '▼'}
            </Text>
          </View>

          {showAdvanced && (
            <View style={styles.advancedSection}>
              <SwitchRow
                label="Auto dispatch"
                value={form.autoDispatch}
                onValueChange={autoDispatch =>
                  setForm(current => ({ ...current, autoDispatch }))
                }
              />
              <SwitchRow
                label="Force color match"
                value={form.queueForceColorMatch}
                onValueChange={queueForceColorMatch =>
                  setForm(current => ({ ...current, queueForceColorMatch }))
                }
              />
              <SwitchRow
                label="G-code injection"
                value={form.gcodeInjection}
                onValueChange={gcodeInjection =>
                  setForm(current => ({ ...current, gcodeInjection }))
                }
              />
              <SwitchRow
                label="Disable Tailscale"
                value={form.tailscaleDisabled}
                onValueChange={tailscaleDisabled =>
                  setForm(current => ({ ...current, tailscaleDisabled }))
                }
              />
            </View>
          )}

>>>>>>> origin/develop
          <View style={settingsStyles.modalFooter}>
            <PrimaryButton
              label="Cancel"
              variant="secondary"
<<<<<<< HEAD
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
=======
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
>>>>>>> origin/develop
            />
          </View>
        </ScrollView>
      </SimpleModal>

      <ConfirmModal
<<<<<<< HEAD
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
=======
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
>>>>>>> origin/develop
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
<<<<<<< HEAD
=======
  testResult: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  testResultText: {
    fontSize: fontSize.sm,
  },
  proxySection: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  proxyLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  proxyInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  proxyInput: {
    flex: 1,
  },
  testButton: {
    minWidth: 70,
  },
  proxyHint: {
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  advancedToggle: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  advancedTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  advancedSection: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    marginTop: spacing.xs,
  },
>>>>>>> origin/develop
});
