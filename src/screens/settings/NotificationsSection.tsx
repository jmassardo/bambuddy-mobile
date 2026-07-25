import React from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { PrimaryButton, SectionCard, StatusBadge } from '@/components/common/AppUI';
import { useTheme } from '@/theme';
import { pickBoolean, pickString, statusColor, type ApiRecord } from '@/utils/data';
import { settingsStyles as styles } from './shared';
import type { AppNavigationProp } from '@/navigation/types';

export default function NotificationsSection() {
  const navigation = useNavigation<AppNavigationProp>();
  const { colors } = useTheme();
  const providersQuery = useQuery({ queryKey: ['notificationProviders'], queryFn: api.getNotificationProviders });

  if (providersQuery.isLoading) {
    return <LoadingScreen message="Loading notifications…" />;
  }

  if (providersQuery.isError) {
    return <ErrorState message="Unable to load notification providers." onRetry={() => void providersQuery.refetch()} />;
  }

  return (
    <SectionCard title="Notifications" subtitle="Provider status plus a shortcut to the dedicated notification preferences screen.">
      <Text style={[styles.helper, { color: colors.textSecondary }]}>Providers: {((providersQuery.data ?? []) as ApiRecord[]).length}</Text>
      {((providersQuery.data ?? []) as ApiRecord[]).slice(0, 5).map(provider => (
        <View key={pickString(provider, ['id'])} style={[styles.itemCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <View style={styles.itemHeader}>
            <View style={styles.itemText}>
              <Text style={[styles.itemTitle, { color: colors.text }]}>{pickString(provider, ['name'], 'Provider')}</Text>
              <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>{pickString(provider, ['type', 'provider_type'], 'Unknown type')}</Text>
            </View>
            <StatusBadge label={pickBoolean(provider, ['enabled']) ? 'enabled' : 'disabled'} color={statusColor(pickBoolean(provider, ['enabled']) ? 'success' : 'offline', colors)} />
          </View>
        </View>
      ))}
      <PrimaryButton label="Open notification preferences" onPress={() => navigation.navigate('Notifications')} variant="secondary" />
    </SectionCard>
  );
}
