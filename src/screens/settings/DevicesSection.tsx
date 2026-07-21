import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { PrimaryButton, SectionCard, StatusBadge, TextField } from '@/components/common/AppUI';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { pickBoolean, pickNumber, pickString, statusColor, type ApiRecord } from '@/utils/data';
import { OptionChipsField, SimpleModal, SwitchRow, settingsStyles as styles, stringifyNumberField } from './shared';
import { useSettingsDraft } from './useSettingsDraft';

type VirtualPrinterFormState = {
  name: string;
  model: string;
  model_name: string;
  serial: string;
  serial_number: string;
  enabled: boolean;
};

const EMPTY_VIRTUAL_PRINTER_FORM: VirtualPrinterFormState = {
  name: 'Bambuddy',
  model: 'BL-P001',
  model_name: 'BL-P001',
  serial: '',
  serial_number: '',
  enabled: false,
};

export default function DevicesSection({ section }: { section: 'virtual-printer' | 'spoolbuddy' | 'failure-detection' }) {
  if (section === 'virtual-printer') return <VirtualPrinterSection />;
  if (section === 'spoolbuddy') return <SpoolBuddySection />;
  return <FailureDetectionSection />;
}

function VirtualPrinterSection() {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const virtualPrinterListQuery = useQuery({ queryKey: ['virtualPrinterList'], queryFn: api.getVirtualPrinterList });
  const [virtualPrinterModalVisible, setVirtualPrinterModalVisible] = useState(false);
  const [editingVirtualPrinter, setEditingVirtualPrinter] = useState<ApiRecord | null>(null);
  const [virtualPrinterForm, setVirtualPrinterForm] = useState<VirtualPrinterFormState>(EMPTY_VIRTUAL_PRINTER_FORM);
  const [pendingDeleteVirtualPrinter, setPendingDeleteVirtualPrinter] = useState<ApiRecord | null>(null);

  const virtualPrinterItems = useMemo(
    () => (Array.isArray(virtualPrinterListQuery.data?.printers) ? (virtualPrinterListQuery.data.printers as ApiRecord[]) : []),
    [virtualPrinterListQuery.data],
  );
  const virtualPrinterModels = useMemo(() => {
    const source = (virtualPrinterListQuery.data?.models ?? {}) as Record<string, unknown>;
    return Object.entries(source).map(([key, value]) => ({ key, label: String(value) }));
  }, [virtualPrinterListQuery.data]);

  const virtualPrinterControl = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'start' | 'stop' }) =>
      action === 'start' ? api.startVirtualPrinter(id) : api.stopVirtualPrinter(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['virtualPrinterList'] });
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update virtual printer.', 'error'),
  });

  const saveVirtualPrinterMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        name: virtualPrinterForm.name.trim() || 'Bambuddy',
        model: virtualPrinterForm.model.trim() || undefined,
        enabled: virtualPrinterForm.enabled,
      };
      if (virtualPrinterForm.serial.trim()) {
        payload.access_code = virtualPrinterForm.serial.trim();
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
    onError: (error: Error) => showToast(error.message || 'Unable to save virtual printer.', 'error'),
  });

  const deleteVirtualPrinterMutation = useMutation({
    mutationFn: (id: number) => api.deleteVirtualPrinter(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['virtualPrinterList'] });
      setPendingDeleteVirtualPrinter(null);
      showToast('Virtual printer deleted.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to delete virtual printer.', 'error'),
  });

  function closeVirtualPrinterModal() {
    setVirtualPrinterModalVisible(false);
    setEditingVirtualPrinter(null);
    setVirtualPrinterForm(EMPTY_VIRTUAL_PRINTER_FORM);
  }

  function openVirtualPrinterModal(printer?: ApiRecord) {
    if (printer) {
      setEditingVirtualPrinter(printer);
      setVirtualPrinterForm({
        name: pickString(printer, ['name'], 'Bambuddy'),
        model: pickString(printer, ['model'], 'BL-P001'),
        model_name: pickString(printer, ['model', 'model_name'], 'BL-P001'),
        serial: pickString(printer, ['serial'], ''),
        serial_number: pickString(printer, ['serial', 'serial_number'], ''),
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
    return <ErrorState message="Unable to load virtual printers." onRetry={() => void virtualPrinterListQuery.refetch()} />;
  }

  return (
    <>
      <SectionCard title="Virtual printers" subtitle="Current virtual printer connections and lifecycle actions.">
        <PrimaryButton label="Create virtual printer" variant="secondary" onPress={() => openVirtualPrinterModal()} />
        {virtualPrinterItems.length > 0 ? (
          virtualPrinterItems.map(printer => {
            const running = pickBoolean(printer, ['status.running', 'running', 'enabled']);
            return (
              <View key={pickString(printer, ['id'])} style={[styles.itemCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                <View style={styles.itemHeader}>
                  <View style={styles.itemText}>
                    <Text style={[styles.itemTitle, { color: colors.text }]}>{pickString(printer, ['name'], 'Virtual printer')}</Text>
                    <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>{pickString(printer, ['model_name', 'model'], 'Unknown model')} • Pending {pickString(printer, ['status.pending_files'], '0')}</Text>
                  </View>
                  <StatusBadge label={running ? 'running' : 'stopped'} color={statusColor(running ? 'success' : 'offline', colors)} />
                </View>
                <View style={styles.actions}>
                  <PrimaryButton label="Start" variant="secondary" onPress={() => void virtualPrinterControl.mutateAsync({ id: pickNumber(printer, ['id']), action: 'start' })} />
                  <PrimaryButton label="Stop" variant="secondary" onPress={() => void virtualPrinterControl.mutateAsync({ id: pickNumber(printer, ['id']), action: 'stop' })} />
                  <PrimaryButton label="Edit" variant="secondary" onPress={() => openVirtualPrinterModal(printer)} />
                  <PrimaryButton label="Delete" variant="danger" onPress={() => setPendingDeleteVirtualPrinter(printer)} />
                </View>
              </View>
            );
          })
        ) : (
          <EmptyState icon="🖨" title="No virtual printers" message="Create virtual printers on the server to manage them here." />
        )}
      </SectionCard>

      <SimpleModal
        visible={virtualPrinterModalVisible}
        title={editingVirtualPrinter ? 'Edit virtual printer' : 'Create virtual printer'}
        subtitle="Name, printer model, serial number, and enabled state."
        onClose={closeVirtualPrinterModal}
      >
        <ScrollView contentContainerStyle={styles.modalBody}>
          <TextField label="Name" value={virtualPrinterForm.name} onChangeText={value => setVirtualPrinterForm(current => ({ ...current, name: value }))} />
          <OptionChipsField label="Model" value={virtualPrinterForm.model_name} options={virtualPrinterModels} onChange={value => setVirtualPrinterForm(current => ({ ...current, model_name: value }))} />
          <TextField label="Custom model" value={virtualPrinterForm.model_name} onChangeText={value => setVirtualPrinterForm(current => ({ ...current, model_name: value }))} />
          <TextField label="Serial number" value={virtualPrinterForm.serial_number} onChangeText={value => setVirtualPrinterForm(current => ({ ...current, serial_number: value }))} autoCapitalize="characters" />
          <SwitchRow label="Enabled" value={virtualPrinterForm.enabled} onValueChange={value => setVirtualPrinterForm(current => ({ ...current, enabled: value }))} />
          <View style={styles.modalFooter}>
            <PrimaryButton label="Cancel" variant="secondary" onPress={closeVirtualPrinterModal} />
            <PrimaryButton
              label={editingVirtualPrinter ? (saveVirtualPrinterMutation.isPending ? 'Saving…' : 'Save printer') : (saveVirtualPrinterMutation.isPending ? 'Creating…' : 'Create printer')}
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
        message={pendingDeleteVirtualPrinter ? `Delete ${pickString(pendingDeleteVirtualPrinter, ['name'], 'this virtual printer')}?` : 'Delete this virtual printer?'}
        confirmLabel="Delete"
        onClose={() => setPendingDeleteVirtualPrinter(null)}
        onConfirm={() => pendingDeleteVirtualPrinter && void deleteVirtualPrinterMutation.mutateAsync(pickNumber(pendingDeleteVirtualPrinter, ['id']))}
        loading={deleteVirtualPrinterMutation.isPending}
      />
    </>
  );
}

function SpoolBuddySection() {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const spoolbuddyQuery = useQuery({ queryKey: ['spoolbuddyDevices'], queryFn: api.getSpoolBuddyDevices });

  const calibrateSpoolbuddyMutation = useMutation({
    mutationFn: (deviceId: string) => api.calibrateSpoolBuddy(deviceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['spoolbuddyDevices'] });
      showToast('Calibration command sent.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to calibrate device.', 'error'),
  });

  if (spoolbuddyQuery.isLoading) {
    return <LoadingScreen message="Loading SpoolBuddy devices…" />;
  }

  if (spoolbuddyQuery.isError) {
    return <ErrorState message="Unable to load SpoolBuddy devices." onRetry={() => void spoolbuddyQuery.refetch()} />;
  }

  return (
    <SectionCard title="SpoolBuddy devices" subtitle="Online device status, sensors, and calibration shortcuts.">
      {((spoolbuddyQuery.data ?? []) as ApiRecord[]).length > 0 ? (
        ((spoolbuddyQuery.data ?? []) as ApiRecord[]).map(device => (
          <View key={pickString(device, ['id', 'device_id'])} style={[styles.itemCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
            <View style={styles.itemHeader}>
              <View style={styles.itemText}>
                <Text style={[styles.itemTitle, { color: colors.text }]}>{pickString(device, ['hostname', 'device_id'], 'SpoolBuddy')}</Text>
                <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>Last seen: {pickString(device, ['last_seen'], 'Unknown')}</Text>
              </View>
              <StatusBadge label={pickBoolean(device, ['online']) ? 'online' : 'offline'} color={statusColor(pickBoolean(device, ['online']) ? 'success' : 'offline', colors)} />
            </View>
            <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>NFC: {pickBoolean(device, ['has_nfc']) ? 'yes' : 'no'} • Scale: {pickBoolean(device, ['has_scale']) ? 'yes' : 'no'}</Text>
            <PrimaryButton label="Calibrate" variant="secondary" onPress={() => void calibrateSpoolbuddyMutation.mutateAsync(pickString(device, ['device_id']))} />
          </View>
        ))
      ) : (
        <EmptyState icon="📡" title="No devices found" message="SpoolBuddy devices will appear here when they connect." />
      )}
    </SectionCard>
  );
}

function FailureDetectionSection() {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const { canUpdateSettings, draft, saveSettingsMutation, setDraft, settingsQuery } = useSettingsDraft();
  const obicoQuery = useQuery({ queryKey: ['obicoStatus'], queryFn: api.getObicoStatus });
  const testObicoMutation = useMutation({
    mutationFn: (url: string) => api.testObicoConnection(url),
    onSuccess: result => {
      const ok = pickBoolean(result as ApiRecord, ['ok', 'success']);
      showToast(
        ok
          ? pickString(result as ApiRecord, ['message'], 'Failure detection service is reachable.')
          : pickString(result as ApiRecord, ['error', 'message'], 'Failure detection test failed.'),
        ok ? 'success' : 'error',
      );
    },
    onError: (error: Error) => showToast(error.message || 'Unable to test failure detection.', 'error'),
  });

  if (settingsQuery.isLoading) {
    return <LoadingScreen message="Loading settings…" />;
  }

  if (settingsQuery.isError) {
    return <ErrorState message="Unable to load settings." onRetry={() => void settingsQuery.refetch()} />;
  }

  return (
    <>
      <SectionCard title="Failure detection" subtitle="Obico service configuration and current runtime state.">
        <SwitchRow label="Failure detection enabled" value={pickBoolean(draft, ['obico_enabled'])} onValueChange={value => setDraft(current => ({ ...current, obico_enabled: value }))} />
        <TextField label="Server URL" value={pickString(draft, ['obico_ml_url', 'failure_detection.server_url'])} onChangeText={value => setDraft(current => ({ ...current, obico_ml_url: value }))} autoCapitalize="none" />
        <TextField label="API key" value={pickString(draft, ['obico_api_key', 'failure_detection.api_key'])} onChangeText={value => setDraft(current => ({ ...current, obico_api_key: value }))} autoCapitalize="none" secureTextEntry />
        <OptionChipsField
          label="Sensitivity"
          value={pickString(draft, ['obico_sensitivity', 'failure_detection.sensitivity'], 'medium')}
          options={[
            { key: 'low', label: 'Low' },
            { key: 'medium', label: 'Medium' },
            { key: 'high', label: 'High' },
          ]}
          onChange={value => setDraft(current => ({ ...current, obico_sensitivity: value }))}
        />
        <OptionChipsField
          label="Action"
          value={pickString(draft, ['obico_action'], 'notify')}
          options={[
            { key: 'notify', label: 'Notify' },
            { key: 'pause', label: 'Pause' },
            { key: 'pause_and_off', label: 'Pause + Power Off' },
          ]}
          onChange={value => setDraft(current => ({ ...current, obico_action: value }))}
        />
        <TextField label="Poll interval (s)" value={stringifyNumberField(draft.obico_poll_interval, '30')} onChangeText={value => setDraft(current => ({ ...current, obico_poll_interval: Number(value) || 30 }))} keyboardType="number-pad" />
        <Text style={[styles.helper, { color: colors.textSecondary }]}>Runtime: {pickBoolean(obicoQuery.data as ApiRecord | undefined, ['enabled']) ? 'enabled' : 'disabled'} • Last error: {pickString(obicoQuery.data as ApiRecord | undefined, ['last_error'], 'none')}</Text>
        <PrimaryButton
          label={testObicoMutation.isPending ? 'Testing…' : 'Test connection'}
          variant="secondary"
          onPress={() => void testObicoMutation.mutateAsync(pickString(draft, ['obico_ml_url']))}
          loading={testObicoMutation.isPending}
          disabled={testObicoMutation.isPending || !pickString(draft, ['obico_ml_url']).trim()}
        />
      </SectionCard>
      <PrimaryButton
        label={saveSettingsMutation.isPending ? 'Saving…' : 'Save settings'}
        onPress={() => void saveSettingsMutation.mutateAsync()}
        loading={saveSettingsMutation.isPending}
        disabled={!canUpdateSettings || saveSettingsMutation.isPending}
      />
    </>
  );
}
