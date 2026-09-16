import React from 'react';
import { View } from 'react-native';
import { EmptyState } from '@/components/common/StateScreens';
import { PrimaryButton, SectionCard, StatusBadge } from '@/components/common/AppUI';
import { settingsStyles } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import type { StorageLocation } from '@/types/api';

export function StorageLocationsSection({ controller }: { controller: SettingsScreenController }) {
  const locationsQuery = controller.queries.storageLocationsQuery;
  const locations = (Array.isArray(locationsQuery.data) ? (locationsQuery.data as unknown as StorageLocation[]) : []) ?? [];

  return (
    <>
      <SectionCard title="Storage locations" subtitle="Manage shelves, drawers, and boxes where filament spools are stored.">
        <PrimaryButton
          label="Add storage location"
          variant="secondary"
          onPress={() => controller.actions.openLocationModal()}
        />
      </SectionCard>
      {locations.length > 0 ? (
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
        <EmptyState icon="📍" title="No storage locations" message="Create a shelf, drawer, or box to organize your filament spools." />
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
  return (
    <SectionCard
      title={location.name}
      subtitle={
        [location.address, location.notes]
          .filter(Boolean)
          .join(' • ') || 'No address or notes set'
      }
      right={<StatusBadge label={`${location.spool_count} spool${location.spool_count === 1 ? '' : 's'}`} color="accent" />}
    >
      {location.identifier ? (
        <View style={settingsStyles.plugSummaryRow}>
          <StatusBadge label={`ID: ${location.identifier}`} color="accent" />
        </View>
      ) : null}
      <View style={settingsStyles.actions}>
        <PrimaryButton label="Edit" variant="secondary" onPress={onEdit} disabled={!canEdit} />
        <PrimaryButton
          label="Delete"
          variant="danger"
          onPress={onDelete}
          disabled={!canDelete || location.spool_count > 0}
        />
      </View>
    </SectionCard>
  );
}
