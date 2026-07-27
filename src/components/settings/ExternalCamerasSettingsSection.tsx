import React from 'react';
import { Text, View } from 'react-native';
import { EmptyState } from '@/components/common/StateScreens';
import { PrimaryButton, SectionCard, StatusBadge } from '@/components/common/AppUI';
import { settingsStyles } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import { pickNumber, pickString, type ApiRecord } from '@/utils/data';

export function ExternalCamerasSettingsSection({ controller }: { controller: SettingsScreenController }) {
  const cameras = controller.derived.externalCameraItems;

  return (
    <SectionCard title="External cameras" subtitle="Manage IP camera streams and map each camera to a printer.">
      <PrimaryButton label="Add external camera" variant="secondary" onPress={() => controller.actions.openExternalCameraModal()} />
      {cameras.length > 0 ? (
        cameras.map(camera => {
          const cameraId = pickNumber(camera, ['id']);
          const printerId = pickNumber(camera, ['printer_id'], 0);
          const printerLabel = printerId > 0 ? controller.derived.printerLabelById[String(printerId)] ?? 'Unknown printer' : 'Unassigned';
          const isTesting = controller.mutations.testExternalCameraMutation.isPending && controller.mutations.testExternalCameraMutation.variables === cameraId;

          return (
            <View key={pickString(camera, ['id'])} style={[settingsStyles.itemCard, { backgroundColor: controller.colors.surfaceElevated, borderColor: controller.colors.border }]}>
              <View style={settingsStyles.itemHeader}>
                <View style={settingsStyles.itemText}>
                  <Text style={[settingsStyles.itemTitle, { color: controller.colors.text }]}>{pickString(camera, ['name'], 'External camera')}</Text>
                  <Text style={[settingsStyles.itemMeta, { color: controller.colors.textSecondary }]}>{pickString(camera, ['stream_url'])}</Text>
                  <Text style={[settingsStyles.itemMeta, { color: controller.colors.textSecondary }]}>Printer: {printerLabel}</Text>
                </View>
                <StatusBadge label={pickString(camera, ['camera_type'], 'mjpeg').toUpperCase()} color={controller.colors.accent} />
              </View>
              <View style={settingsStyles.actions}>
                <PrimaryButton
                  label={isTesting ? 'Testing…' : 'Test connection'}
                  variant="secondary"
                  onPress={() => void controller.mutations.testExternalCameraMutation.mutateAsync(cameraId)}
                  loading={isTesting}
                  disabled={isTesting}
                />
                <PrimaryButton label="Edit" variant="secondary" onPress={() => controller.actions.openExternalCameraModal(camera as ApiRecord)} />
                <PrimaryButton label="Delete" variant="danger" onPress={() => controller.actions.setPendingDeleteExternalCamera(camera as ApiRecord)} />
              </View>
            </View>
          );
        })
      ) : (
        <EmptyState icon="📷" title="No external cameras" message="Add external camera streams to monitor printers beyond the built-in feed." />
      )}
    </SectionCard>
  );
}
