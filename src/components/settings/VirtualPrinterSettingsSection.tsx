import { NativeTranslation, translateNative, useNativeLocale } from '@/i18n';

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
  useNativeLocale();
  const printers = controller.derived.virtualPrinterItems;
  const tr = useIntegrationTranslation();
  const navigation = useNavigation<RootNavigationProp<'Settings'>>();

  return (
    <>
    <VirtualPrinterGlobalSetup canEdit={controller.permissions.canUpdateSettings} />
    <SectionCard title={translateNative('native.f2e4cf8146418886')} subtitle={translateNative('native.885f556aac1c583b')}>
      <PrimaryButton label={tr('Advanced virtual printer setup')} variant="secondary" onPress={() => navigation.navigate('VirtualPrinters')} />
      <PrimaryButton label={translateNative('native.72f5a60c986eaf7f')} variant="secondary" onPress={() => controller.actions.openVirtualPrinterModal()} />
      {printers.length > 0 ? (
        printers.map(printer => {
          const running = pickBoolean(printer, ['status.running', 'running', 'enabled']);
          const printerId = pickString(printer, ['id']);
          const id = Number(printerId);
          return (
            <View key={printerId} style={[settingsStyles.itemCard, { backgroundColor: controller.colors.surfaceElevated, borderColor: controller.colors.border }]}> 
              <View style={settingsStyles.itemHeader}>
                <View style={settingsStyles.itemText}>
                  <Text style={[settingsStyles.itemTitle, { color: controller.colors.text }]}>{pickString(printer, ['name'], translateNative('native.4d00890bc58d24d0'))}</Text>
                  <Text style={[settingsStyles.itemMeta, { color: controller.colors.textSecondary }]}><NativeTranslation id="native.383f9fea9f78f8c8" values={{ value0: (pickString(printer, ['model_name', 'model'], translateNative('native.e292a54ac2d93315'))), value1: (pickString(printer, ['mode'], 'archive')), value2: (pickString(printer, ['status.pending_files'], '0')) }} /></Text>
                </View>
                <StatusBadge label={running ? translateNative('native.3180e7c2ebffe771') : translateNative('native.23ea8b9cde72dff7')} color={statusColor(running ? 'success' : 'offline', controller.colors)} />
              </View>
              <VirtualPrinterAddress disabled={pickBoolean(printer, ['tailscale_disabled'])} />
              <VirtualPrinterDiagnostics id={id} />
              <View style={settingsStyles.actions}>
                <PrimaryButton label={translateNative('common.start')} variant="secondary" onPress={() => void controller.mutations.virtualPrinterControl.mutateAsync({ id, action: 'start' })} />
                <PrimaryButton label={translateNative('common.stop')} variant="secondary" onPress={() => void controller.mutations.virtualPrinterControl.mutateAsync({ id, action: 'stop' })} />
                <PrimaryButton label={translateNative('common.edit')} variant="secondary" onPress={() => controller.actions.openVirtualPrinterModal(printer)} />
                <PrimaryButton label={translateNative('common.delete')} variant="danger" onPress={() => controller.actions.setPendingDeleteVirtualPrinter(printer)} />
              </View>
            </View>
          );
        })
      ) : (
        <EmptyState icon="🖨" title={translateNative('native.0abb319ce2736eab')} message={translateNative('native.41f18bd732ce1d78')} />
      )}
    </SectionCard>
    </>
  );
}
