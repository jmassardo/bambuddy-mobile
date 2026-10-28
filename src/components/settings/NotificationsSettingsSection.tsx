import { translateNative, useNativeLocale, useTranslation } from '@/i18n';

import React from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigationProp } from '@/navigation/types';
import { PrimaryButton, SectionCard, StatusBadge } from '@/components/common/AppUI';
import { settingsStyles } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import { pickBoolean, pickString, statusColor, type ApiRecord } from '@/utils/data';
import { BedCooledThreshold } from '@/components/notifications/BedCooledThreshold';
import { useAuth } from '@/contexts/AuthContext';

export function NotificationsSettingsSection({ controller }: { controller: SettingsScreenController }) {
  useNativeLocale();
  const navigation = useNavigation<RootNavigationProp<'Settings'>>();
  const { hasPermission } = useAuth();
  const { t } = useTranslation();
  const providers = (controller.queries.providersQuery.data ?? []) as ApiRecord[];

  return (
    <SectionCard title={t('notifications.title', { defaultValue: 'Notifications' })} subtitle={t('notifications.settingsSubtitle', { defaultValue: 'Delivery providers and personal notification preferences.' })}>
      <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>{t('notifications.providerCount', { defaultValue: 'Providers: {{count}}', count: providers.length })}</Text>
      {providers.map(provider => {
        const enabled = pickBoolean(provider, ['enabled']);
        return (
          <View key={pickString(provider, ['id'])} style={[settingsStyles.itemCard, { backgroundColor: controller.colors.surfaceElevated, borderColor: controller.colors.border }]}> 
            <View style={settingsStyles.itemHeader}>
              <View style={settingsStyles.itemText}>
                <Text style={[settingsStyles.itemTitle, { color: controller.colors.text }]}>{pickString(provider, ['name'], 'Provider')}</Text>
                <Text style={[settingsStyles.itemMeta, { color: controller.colors.textSecondary }]}>{pickString(provider, ['type', 'provider_type'], translateNative('native.883a86285de71a64'))}</Text>
              </View>
              <StatusBadge label={enabled ? translateNative('native.6786e575ee872370') : translateNative('native.08e76ba2b69926c4')} color={statusColor(enabled ? 'success' : 'offline', controller.colors)} />
            </View>
          </View>
        );
      })}
      {hasPermission('settings:update') ? <BedCooledThreshold /> : null}
      <PrimaryButton label={t('notifications.openPreferences', { defaultValue: 'Open notification preferences' })} onPress={() => navigation.navigate('Notifications')} variant="secondary" />
    </SectionCard>
  );
}
