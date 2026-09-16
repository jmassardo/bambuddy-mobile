import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api/client';
import { EmptyState } from '@/components/common/StateScreens';
import { PrimaryButton, SectionCard, StatusBadge } from '@/components/common/AppUI';
import { settingsStyles } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { pickBoolean, pickNumber, pickString, statusColor } from '@/utils/data';

export function VirtualPrinterSettingsSection({ controller }: { controller: SettingsScreenController }) {
  const printers = controller.derived.virtualPrinterItems;
  const { colors } = useTheme();
  const { showToast } = useToast();
  const [testingPrinter, setTestingPrinter] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { status: 'loading' | 'success' | 'error'; message: string }>>({});

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
      showToast(
        pickString(result, ['message', 'error'], success ? 'Connection test successful!' : 'Connection test failed'),
        success ? 'success' : 'error',
      );
    },
    onError: (error: Error, id) => {
      setTestResults(prev => ({
        ...prev,
        [id]: { status: 'error', message: error.message || 'Connection test failed' },
      }));
      showToast(error.message || 'Connection test failed.', 'error');
    },
    onSettled: (_, __, id) => {
      setTestingPrinter(null);
    },
  });

  function testConnection(printer: Record<string, unknown>) {
    const printerId = pickNumber(printer, ['id']);
    setTestingPrinter(printerId);
    setTestResults(prev => ({
      ...prev,
      [printerId]: { status: 'loading', message: 'Testing...' },
    }));
    testConnectionMutation.mutate(printerId);
  }

  return (
    <SectionCard title="Virtual printers" subtitle="Current virtual printer connections and lifecycle actions.">
      <PrimaryButton label="Create virtual printer" variant="secondary" onPress={() => controller.actions.openVirtualPrinterModal()} />
      {printers.length > 0 ? (
        printers.map(printer => {
          const running = pickBoolean(printer, ['status.running', 'running', 'enabled']);
          const printerId = pickString(printer, ['id']);
          const id = Number(printerId);
          return (
            <View key={printerId} style={[settingsStyles.itemCard, { backgroundColor: controller.colors.surfaceElevated, borderColor: controller.colors.border }]}> 
              <View style={settingsStyles.itemHeader}>
                <View style={settingsStyles.itemText}>
                  <Text style={[settingsStyles.itemTitle, { color: controller.colors.text }]}>{pickString(printer, ['name'], 'Virtual printer')}</Text>
                  <Text style={[settingsStyles.itemMeta, { color: controller.colors.textSecondary }]}>{pickString(printer, ['model_name', 'model'], 'Unknown model')} • {pickString(printer, ['mode'], 'archive')} • Pending {pickString(printer, ['status.pending_files'], '0')}</Text>
                </View>
                <StatusBadge label={running ? 'running' : 'stopped'} color={statusColor(running ? 'success' : 'offline', controller.colors)} />
              </View>
              {testResults[printerId] && (
                <View style={{ marginTop: 4, padding: 4, borderRadius: 4, borderWidth: 1, borderStyle: 'dashed', borderColor: testResults[printerId].status === 'success' ? controller.colors.success : controller.colors.error }}>
                  <Text style={{ fontSize: 12, color: testResults[printerId].status === 'success' ? controller.colors.success : controller.colors.error }}>
                    {testResults[printerId].message}
                  </Text>
                </View>
              )}
              <View style={settingsStyles.actions}>
                <PrimaryButton label="Start" variant="secondary" onPress={() => void controller.mutations.virtualPrinterControl.mutateAsync({ id, action: 'start' })} />
                <PrimaryButton label="Stop" variant="secondary" onPress={() => void controller.mutations.virtualPrinterControl.mutateAsync({ id, action: 'stop' })} />
                <PrimaryButton 
                  label="Test" 
                  variant="secondary" 
                  onPress={() => testConnection(printer)}
                  loading={testingPrinter === id}
                />
                <PrimaryButton label="Edit" variant="secondary" onPress={() => controller.actions.openVirtualPrinterModal(printer)} />
                <PrimaryButton label="Delete" variant="danger" onPress={() => controller.actions.setPendingDeleteVirtualPrinter(printer)} />
              </View>
            </View>
          );
        })
      ) : (
        <EmptyState icon="🖨" title="No virtual printers" message="Create virtual printers on the server to manage them here." />
      )}
    </SectionCard>
  );
}
