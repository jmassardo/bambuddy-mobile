import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { PrimaryButton, SectionCard, TextField } from '@/components/common/AppUI';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { EmptyState } from '@/components/common/StateScreens';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import type { StorageLocation } from '@/types/api';

interface LocationsModalProps {
  visible: boolean;
  onClose: () => void;
  selectedSpoolIds?: number[];
  onAssigned?: (locationName: string) => void;
}

export function LocationsModal({
  visible,
  onClose,
  selectedSpoolIds = [],
  onAssigned,
}: LocationsModalProps) {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<StorageLocation | null>(null);
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<StorageLocation | null>(null);

  const locationsQuery = useQuery({
    queryKey: ['inventoryLocations'],
    queryFn: () => api.getLocations(),
    enabled: visible,
  });

  const locations = useMemo(
    () => (Array.isArray(locationsQuery.data) ? (locationsQuery.data as unknown as StorageLocation[]) : []),
    [locationsQuery.data],
  );

  useEffect(() => {
    if (!visible) {
      setEditing(null);
      setName('');
      setIdentifier('');
      setDeleteTarget(null);
    }
  }, [visible]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['inventoryLocations'] }),
      queryClient.invalidateQueries({ queryKey: ['inventorySpools'] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        identifier: identifier.trim() || null,
      };
      if (editing) return api.updateLocation(editing.id, payload);
      return api.createLocation(payload);
    },
    onSuccess: async () => {
      await invalidate();
      showToast(editing ? 'Location updated.' : 'Location created.', 'success');
      setEditing(null);
      setName('');
      setIdentifier('');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to save the location.', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteLocation(id),
    onSuccess: async () => {
      await invalidate();
      showToast('Location deleted.', 'success');
      setDeleteTarget(null);
    },
    onError: (error: Error) => showToast(error.message || 'Unable to delete the location.', 'error'),
  });

  const assignMutation = useMutation({
    mutationFn: (locationName: string) =>
      api.bulkUpdateSpools(selectedSpoolIds, { storage_location: locationName }),
    onSuccess: async (_data, locationName) => {
      await invalidate();
      showToast(`Assigned ${selectedSpoolIds.length} spool${selectedSpoolIds.length === 1 ? '' : 's'} to ${locationName}.`, 'success');
      onAssigned?.(locationName);
      onClose();
    },
    onError: (error: Error) => showToast(error.message || 'Unable to assign the selected spools.', 'error'),
  });

  const startEdit = (location: StorageLocation) => {
    setEditing(location);
    setName(location.name);
    setIdentifier(location.identifier ?? '');
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}> 
          <View style={[styles.card, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={[styles.title, { color: colors.text }]}>Storage locations</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Create, rename, delete, and assign spool storage locations.</Text>
              </View>
              <Pressable onPress={onClose} hitSlop={8}>
                <X size={18} color={colors.textSecondary} strokeWidth={2} />
              </Pressable>
            </View>

            <SectionCard title={editing ? 'Edit location' : 'Add location'}>
              <TextField label="Name" value={name} onChangeText={setName} placeholder="Shelf A" />
              <TextField label="Identifier" value={identifier} onChangeText={setIdentifier} placeholder="A-1" />
              <View style={styles.formActions}>
                {editing ? (
                  <PrimaryButton
                    label="Cancel edit"
                    variant="secondary"
                    onPress={() => {
                      setEditing(null);
                      setName('');
                      setIdentifier('');
                    }}
                  />
                ) : null}
                <PrimaryButton
                  label={saveMutation.isPending ? 'Saving…' : editing ? 'Save location' : 'Create location'}
                  onPress={() => void saveMutation.mutateAsync()}
                  disabled={!name.trim() || saveMutation.isPending}
                  loading={saveMutation.isPending}
                />
              </View>
            </SectionCard>

            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {locations.length === 0 ? (
                <EmptyState icon="📍" title="No locations yet" message="Create a shelf, drawer, or box location to organize spools." />
              ) : (
                locations.map(location => (
                  <View
                    key={location.id}
                    style={[styles.locationRow, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                  >
                    <View style={styles.locationText}>
                      <Text style={[styles.locationName, { color: colors.text }]}>{location.name}</Text>
                      <Text style={[styles.locationMeta, { color: colors.textSecondary }]}>
                        {location.identifier || 'No identifier'} • {location.spool_count} spool{location.spool_count === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <View style={styles.rowActions}>
                      {selectedSpoolIds.length > 0 ? (
                        <PrimaryButton
                          label="Assign"
                          variant="secondary"
                          onPress={() => void assignMutation.mutateAsync(location.name)}
                          disabled={assignMutation.isPending}
                        />
                      ) : null}
                      <PrimaryButton label="Edit" variant="secondary" onPress={() => startEdit(location)} />
                      <PrimaryButton
                        label="Delete"
                        variant="danger"
                        onPress={() => setDeleteTarget(location)}
                        disabled={location.spool_count > 0}
                      />
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={styles.footer}>
              <PrimaryButton label="Close" variant="secondary" onPress={onClose} />
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          void deleteMutation.mutateAsync(deleteTarget.id);
        }}
        title="Delete location"
        message={deleteTarget ? `Delete ${deleteTarget.name}? Locations with assigned spools cannot be removed.` : ''}
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
  },
  subtitle: {
    fontSize: fontSize.sm,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginTop: spacing.md,
  },
  list: {
    maxHeight: 360,
  },
  listContent: {
    gap: spacing.sm,
  },
  locationRow: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  locationText: {
    gap: spacing.xs,
  },
  locationName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  locationMeta: {
    fontSize: fontSize.sm,
  },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});
