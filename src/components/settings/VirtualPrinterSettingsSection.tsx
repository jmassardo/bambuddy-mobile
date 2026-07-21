import React from 'react';
import { Text, View } from 'react-native';
import { EmptyState } from '@/components/common/StateScreens';
import { PrimaryButton, SectionCard, StatusBadge } from '@/components/common/AppUI';
import { settingsStyles } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import { pickBoolean, pickNumber, pickString, statusColor } from '@/utils/data';

export function VirtualPrinterSettingsSection({ controller }: { controller: SettingsScreenController }) {
  const printers = controller.derived.virtualPrinterItems;

  return (
    <SectionCard title="Virtual printers" subtitle="Current virtual printer connections and lifecycle actions.">
      <PrimaryButton label="Create virtual printer" variant="secondary" onPress={() => controller.actions.openVirtualPrinterModal()} />
      {printers.length > 0 ? (
        printers.map(printer => {
          const running = pickBoolean(printer, ['status.running', 'running', 'enabled']);
          return (
            <View key={pickString(printer, ['id'])} style={[settingsStyles.itemCard, { backgroundColor: controller.colors.surfaceElevated, borderColor: controller.colors.border }]}> 
              <View style={settingsStyles.itemHeader}>
                <View style={settingsStyles.itemText}>
                  <Text style={[settingsStyles.itemTitle, { color: controller.colors.text }]}>{pickString(printer, ['name'], 'Virtual printer')}</Text>
                  <Text style={[settingsStyles.itemMeta, { color: controller.colors.textSecondary }]}>{pickString(printer, ['model_name', 'model'], 'Unknown model')} • Pending {pickString(printer, ['status.pending_files'], '0')}</Text>
                </View>
                <StatusBadge label={running ? 'running' : 'stopped'} color={statusColor(running ? 'success' : 'offline', controller.colors)} />
              </View>
              <View style={settingsStyles.actions}>
                <PrimaryButton label="Start" variant="secondary" onPress={() => void controller.mutations.virtualPrinterControl.mutateAsync({ id: pickNumber(printer, ['id']), action: 'start' })} />
                <PrimaryButton label="Stop" variant="secondary" onPress={() => void controller.mutations.virtualPrinterControl.mutateAsync({ id: pickNumber(printer, ['id']), action: 'stop' })} />
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
