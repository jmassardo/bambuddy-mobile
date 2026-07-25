import React from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigationProp } from '@/navigation/types';
import { PrimaryButton, SectionCard, StatusBadge } from '@/components/common/AppUI';
import { settingsStyles } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import { pickBoolean, pickString, statusColor, type ApiRecord } from '@/utils/data';

export function NotificationsSettingsSection({ controller }: { controller: SettingsScreenController }) {
  const navigation = useNavigation<RootNavigationProp<'Settings'>>();
  const providers = (controller.queries.providersQuery.data ?? []) as ApiRecord[];

  return (
    <SectionCard title="Notifications" subtitle="Provider status plus a shortcut to the dedicated notification preferences screen.">
      <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>Providers: {providers.length}</Text>
      {providers.slice(0, 5).map(provider => {
        const enabled = pickBoolean(provider, ['enabled']);
        return (
          <View key={pickString(provider, ['id'])} style={[settingsStyles.itemCard, { backgroundColor: controller.colors.surfaceElevated, borderColor: controller.colors.border }]}> 
            <View style={settingsStyles.itemHeader}>
              <View style={settingsStyles.itemText}>
                <Text style={[settingsStyles.itemTitle, { color: controller.colors.text }]}>{pickString(provider, ['name'], 'Provider')}</Text>
                <Text style={[settingsStyles.itemMeta, { color: controller.colors.textSecondary }]}>{pickString(provider, ['type', 'provider_type'], 'Unknown type')}</Text>
              </View>
              <StatusBadge label={enabled ? 'enabled' : 'disabled'} color={statusColor(enabled ? 'success' : 'offline', controller.colors)} />
            </View>
          </View>
        );
      })}
      <PrimaryButton label="Open notification preferences" onPress={() => navigation.navigate('Notifications')} variant="secondary" />
    </SectionCard>
  );
}
