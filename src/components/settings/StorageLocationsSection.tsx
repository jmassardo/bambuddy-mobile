import { nativeEnglishSuffix, translateNative, useNativeLocale } from '@/i18n';

import React from 'react';
import { View } from 'react-native';
import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { PrimaryButton, SectionCard, StatusBadge } from '@/components/common/AppUI';
import { settingsStyles } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import type { StorageLocation } from '@/types/api';

export function StorageLocationsSection({ controller }: { controller: SettingsScreenController }) {
  useNativeLocale();
  const locationsQuery = controller.queries.storageLocationsQuery;
  const locations = (Array.isArray(locationsQuery.data) ? (locationsQuery.data as unknown as StorageLocation[]) : []) ?? [];

  return (
    <>
      <SectionCard title={translateNative('native.2fa2048283af4f30')} subtitle={translateNative('native.a01461ef31d6115f')}>
        <PrimaryButton
          label={translateNative('native.2846432316620fd1')}
          variant="secondary"
          disabled={!controller.permissions.canManageSpools}
          onPress={() => controller.actions.openLocationModal()}
        />
      </SectionCard>
      {locationsQuery.isLoading ? <LoadingScreen inline /> : locationsQuery.isError ? <ErrorState message={locationsQuery.error.message} onRetry={() => void locationsQuery.refetch()} /> : locations.length > 0 ? (
        locations.map(location => (
          <StorageLocationCard
            key={location.id}
            location={location}
            canEdit={controller.permissions.canManageSpools}
            canDelete={controller.permissions.canManageSpools}
            onEdit={() => controller.actions.openLocationModal(location)}
            onDelete={() => controller.actions.setPendingDeleteLocation(location)}
          />
        ))
      ) : (
        <EmptyState icon="📍" title={translateNative('native.3e2a18d309eb70ff')} message={translateNative('native.3b2b569938240404')} />
      )}
    </>
  );
}

function StorageLocationCard({
  location,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  location: { id: number; name: string; identifier: string | null; address: string | null; notes: string | null; spool_count: number };
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  useNativeLocale();
  return (
    <SectionCard
      title={location.name}
      subtitle={
        [location.address, location.notes]
          .filter(Boolean)
          .join(' • ') || translateNative('native.12347729a5e38a43')
      }
      right={<StatusBadge label={translateNative('native.aea1210825b04d1d', { value0: String(location.spool_count), value1: String(nativeEnglishSuffix(location.spool_count === 1 ? '' : 's')) })} color="accent" />}
    >
      {location.identifier ? (
        <View style={settingsStyles.plugSummaryRow}>
          <StatusBadge label={translateNative('native.5316e7447ba324cb', { value0: String(location.identifier) })} color="accent" />
        </View>
      ) : null}
      <View style={settingsStyles.actions}>
        <PrimaryButton label={translateNative('common.edit')} variant="secondary" onPress={onEdit} disabled={!canEdit} />
        <PrimaryButton
          label={translateNative('common.delete')}
          variant="danger"
          onPress={onDelete}
          disabled={!canDelete || location.spool_count > 0}
        />
      </View>
    </SectionCard>
  );
}
