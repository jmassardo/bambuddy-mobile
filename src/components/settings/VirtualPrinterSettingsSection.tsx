import React from 'react';
import { Text, View } from 'react-native';
import { EmptyState } from '@/components/common/StateScreens';
import { PrimaryButton, SectionCard, StatusBadge } from '@/components/common/AppUI';
import { settingsStyles } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import { pickBoolean, pickString, statusColor } from '@/utils/data';
import { VirtualPrinterAddress, VirtualPrinterDiagnostics, VirtualPrinterGlobalSetup } from './VirtualPrinterIntegration';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigationProp } from '@/navigation/types';
import { useIntegrationTranslation } from './useIntegrationTranslation';

export function VirtualPrinterSettingsSection({ controller }: { controller: SettingsScreenController }) {
  const printers = controller.derived.virtualPrinterItems;
  const tr = useIntegrationTranslation();
  const navigation = useNavigation<RootNavigationProp<'Settings'>>();

  return (
    <>
    <VirtualPrinterGlobalSetup canEdit={controller.permissions.canUpdateSettings} />
    <SectionCard title="Virtual printers" subtitle="Current virtual printer connections and lifecycle actions.">
      <PrimaryButton label={tr('Advanced virtual printer setup')} variant="secondary" onPress={() => navigation.navigate('VirtualPrinters')} />
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
              <VirtualPrinterAddress disabled={pickBoolean(printer, ['tailscale_disabled'])} />
              <VirtualPrinterDiagnostics id={id} />
              <View style={settingsStyles.actions}>
                <PrimaryButton label="Start" variant="secondary" onPress={() => void controller.mutations.virtualPrinterControl.mutateAsync({ id, action: 'start' })} />
                <PrimaryButton label="Stop" variant="secondary" onPress={() => void controller.mutations.virtualPrinterControl.mutateAsync({ id, action: 'stop' })} />
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
    </>
  );
}
