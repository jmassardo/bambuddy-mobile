import { NativeTranslation, translateNative, useNativeLocale, useTranslation } from '@/i18n';

import React from 'react';
import { Text, View } from 'react-native';
import { EmptyState } from '@/components/common/StateScreens';
import { PrimaryButton, SectionCard, StatusBadge } from '@/components/common/AppUI';
import { settingsStyles } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import { pickBoolean, pickString, statusColor, type ApiRecord } from '@/utils/data';
import { RemoteSpoolBuddyModal } from '@/components/spoolbuddy/RemoteSpoolBuddyPanel';

export function SpoolBuddySettingsSection({ controller }: { controller: SettingsScreenController }) {
  useNativeLocale();
  const devices = (controller.queries.spoolbuddyQuery.data ?? []) as ApiRecord[];
  const [deviceId, setDeviceId] = React.useState<string | null>(null);
  const { t } = useTranslation();

  return (
    <SectionCard title={translateNative('native.56d13dfac15377cd')} subtitle={translateNative('native.ce986efe1e5e7480')}>
      {devices.length > 0 ? (
        devices.map(device => (
          <View key={pickString(device, ['id', 'device_id'])} style={[settingsStyles.itemCard, { backgroundColor: controller.colors.surfaceElevated, borderColor: controller.colors.border }]}> 
            <View style={settingsStyles.itemHeader}>
              <View style={settingsStyles.itemText}>
                <Text style={[settingsStyles.itemTitle, { color: controller.colors.text }]}>{pickString(device, ['hostname', 'device_id'], 'SpoolBuddy')}</Text>
                <Text style={[settingsStyles.itemMeta, { color: controller.colors.textSecondary }]}><NativeTranslation id="native.89422ee1a96dd166" values={{ value0: (pickString(device, ['last_seen'], 'Unknown')) }} /></Text>
              </View>
              <StatusBadge label={pickBoolean(device, ['online']) ? translateNative('native.901d5a89d9f5cad2') : translateNative('native.c4b60eea6e399455')} color={statusColor(pickBoolean(device, ['online']) ? 'success' : 'offline', controller.colors)} />
            </View>
            <Text style={[settingsStyles.itemMeta, { color: controller.colors.textSecondary }]}>{translateNative('native.d887a0c408b3f550')}{pickBoolean(device, ['has_nfc']) ? translateNative('native.69d469e78de0ce33', { defaultValue: 'yes' }) : translateNative('native.294fae9b9ab07565', { defaultValue: 'no' })} {translateNative('native.64a0dbe9b57518a5')}{pickBoolean(device, ['has_scale']) ? translateNative('native.69d469e78de0ce33', { defaultValue: 'yes' }) : translateNative('native.294fae9b9ab07565', { defaultValue: 'no' })}</Text>
            <PrimaryButton label={t('spoolbuddy.remoteControls', { defaultValue: 'Remote controls / calibrate' })} variant="secondary" onPress={() => setDeviceId(pickString(device, ['device_id']))} />
          </View>
        ))
      ) : (
        <EmptyState icon="📡" title={translateNative('native.3f7b20cb93eaf076')} message={translateNative('native.c18e24749c6ad1f7')} />
      )}
      <RemoteSpoolBuddyModal deviceId={deviceId} onClose={() => setDeviceId(null)} />
    </SectionCard>
  );
}
