import React from 'react';
import { Text, View } from 'react-native';
import { EmptyState } from '@/components/common/StateScreens';
import { PrimaryButton, SectionCard, StatusBadge } from '@/components/common/AppUI';
import { settingsStyles } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import { pickBoolean, pickString, statusColor, type ApiRecord } from '@/utils/data';

export function SpoolBuddySettingsSection({ controller }: { controller: SettingsScreenController }) {
  const devices = (controller.queries.spoolbuddyQuery.data ?? []) as ApiRecord[];

  return (
    <SectionCard title="SpoolBuddy devices" subtitle="Online device status, sensors, and calibration shortcuts.">
      {devices.length > 0 ? (
        devices.map(device => (
          <View key={pickString(device, ['id', 'device_id'])} style={[settingsStyles.itemCard, { backgroundColor: controller.colors.surfaceElevated, borderColor: controller.colors.border }]}> 
            <View style={settingsStyles.itemHeader}>
              <View style={settingsStyles.itemText}>
                <Text style={[settingsStyles.itemTitle, { color: controller.colors.text }]}>{pickString(device, ['hostname', 'device_id'], 'SpoolBuddy')}</Text>
                <Text style={[settingsStyles.itemMeta, { color: controller.colors.textSecondary }]}>Last seen: {pickString(device, ['last_seen'], 'Unknown')}</Text>
              </View>
              <StatusBadge label={pickBoolean(device, ['online']) ? 'online' : 'offline'} color={statusColor(pickBoolean(device, ['online']) ? 'success' : 'offline', controller.colors)} />
            </View>
            <Text style={[settingsStyles.itemMeta, { color: controller.colors.textSecondary }]}>NFC: {pickBoolean(device, ['has_nfc']) ? 'yes' : 'no'} • Scale: {pickBoolean(device, ['has_scale']) ? 'yes' : 'no'}</Text>
            <PrimaryButton label="Calibrate" variant="secondary" onPress={() => void controller.mutations.calibrateSpoolbuddyMutation.mutateAsync(pickString(device, ['device_id']))} />
          </View>
        ))
      ) : (
        <EmptyState icon="📡" title="No devices found" message="SpoolBuddy devices will appear here when they connect." />
      )}
    </SectionCard>
  );
}
