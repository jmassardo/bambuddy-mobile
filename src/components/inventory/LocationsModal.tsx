import { nativeEnglishSuffix, translateNative, useLocalizedMemo, useNativeLocale } from '@/i18n';

import React, { useEffect, useState } from 'react';
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
import { inventoryBackend } from '@/api/inventoryManagement';
import { PrimaryButton, SectionCard, TextField } from '@/components/common/AppUI';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { EmptyState } from '@/components/common/StateScreens';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import type { StorageLocation } from '@/types/api';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { pickNumber, pickString } from '@/utils/data';

interface LocationsModalProps {
  visible: boolean;
  onClose: () => void;
  selectedSpoolIds?: number[];
  onAssigned?: (locationName: string) => void;
  spoolman?: boolean;
}

export function LocationsModal({
  visible,
  onClose,
  selectedSpoolIds = [],
  onAssigned,
  spoolman = false,
}: LocationsModalProps) {
  useNativeLocale();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<StorageLocation | null>(null);
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<StorageLocation | null>(null);

  const locationsQuery = useQuery({
    queryKey: ['inventoryLocations'],
    queryFn: () => api.getLocations(),
    enabled: visible,
  });

  const locations = useLocalizedMemo(
    () => (Array.isArray(locationsQuery.data) ? (locationsQuery.data as unknown as StorageLocation[]) : []),
    [locationsQuery.data],
  );

  useEffect(() => {
    if (!visible) {
      setEditing(null);
      setName('');
      setIdentifier('');
      setAddress('');
      setNotes('');
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
        address: address.trim() || null,
        notes: notes.trim() || null,
      };
      if (editing) return api.updateLocation(editing.id, payload);
      return api.createLocation(payload);
    },
    onSuccess: async () => {
      await invalidate();
      showToast(editing ? translateNative('native.414d3e19519b8318') : translateNative('native.1b519ba12fb62958'), 'success');
      setEditing(null);
      setName('');
      setIdentifier('');
      setAddress('');
      setNotes('');
    },
    onError: (error: Error) => showToast(error.message || translateNative('native.2d103780243fc7b1'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteLocation(id),
    onSuccess: async () => {
      await invalidate();
      showToast(translateNative('native.9b6e5697acc85502'), 'success');
      setDeleteTarget(null);
    },
    onError: (error: Error) => showToast(error.message || translateNative('native.9b6978d48d356ab6'), 'error'),
  });

  const assignMutation = useMutation({
    mutationFn: (locationName: string) =>
      inventoryBackend(spoolman).bulk('bulk-update', selectedSpoolIds, {
        location_id: locations.find(location => location.name === locationName)?.id ?? null,
        storage_location: locationName,
      }),
    onSuccess: async (_data, locationName) => {
      await invalidate();
      showToast(translateNative('native.257233fbba0a822e', { value0: String(selectedSpoolIds.length), value1: String(nativeEnglishSuffix(selectedSpoolIds.length === 1 ? '' : 's')), value2: String(locationName) }), 'success');
      onAssigned?.(locationName);
      onClose();
    },
    onError: (error: Error) => showToast(error.message || translateNative('native.a4a084ce15decf5c'), 'error'),
  });

  const startEdit = (location: StorageLocation) => {
    setEditing(location);
    setName(location.name);
    setIdentifier(location.identifier ?? '');
    setAddress(location.address ?? '');
    setNotes(location.notes ?? '');
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}> 
          <View style={[styles.card, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={[styles.title, { color: colors.text }]}>{translateNative('native.2fa2048283af4f30')}</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{translateNative('native.5e9f2c50afc64f2e')}</Text>
              </View>
              <Pressable onPress={onClose} hitSlop={8}>
                <X size={18} color={colors.textSecondary} strokeWidth={2} />
              </Pressable>
            </View>

            <SectionCard title={editing ? translateNative('native.e31b25c4cac430e9') : translateNative('native.69340a073e7e3418')}>
              <TextField label={translateNative('common.name')} value={name} onChangeText={setName} placeholder={translateNative('native.425fe6638a069ac5')} />
              <TextField label={translateNative('native.2c9ce243b8a0f476')} value={identifier} onChangeText={setIdentifier} placeholder={translateNative('native.7b4298b76c274a63')} />
              <TextField label={translateNative('native.a5dba1b4a932b0ea')} value={address} onChangeText={setAddress} placeholder={translateNative('native.43332df0fcf37e64')} />
              <TextField label={translateNative('native.be6245aeb9573da2')} value={notes} onChangeText={setNotes} multiline placeholder={translateNative('native.dbfc9eedd5cac85d')} />
              <View style={styles.formActions}>
                {editing ? (
                  <PrimaryButton
                    label={translateNative('native.f8a8d015aac0eb84')}
                    variant="secondary"
                    onPress={() => {
                      setEditing(null);
                      setName('');
                      setIdentifier('');
                    }}
                  />
                ) : null}
                <PrimaryButton
                  label={saveMutation.isPending ? translateNative('native.018c2002806e2312') : editing ? translateNative('native.54198eb01e614fd1') : translateNative('native.75e3747a4394d714')}
                  onPress={() => void saveMutation.mutateAsync()}
                  disabled={!name.trim() || saveMutation.isPending}
                  loading={saveMutation.isPending}
                />
              </View>
            </SectionCard>

            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {locations.length === 0 ? (
                <EmptyState icon="📍" title={translateNative('native.b3861bd05024eae9')} message={translateNative('native.fc7d4790dee70139')} />
              ) : (
                locations.map(location => (
                  <View
                    key={location.id}
                    style={[styles.locationRow, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                  >
                    <View style={styles.locationText}>
                      <Text style={[styles.locationName, { color: colors.text }]}>{location.name}</Text>
                      <Text style={[styles.locationMeta, { color: colors.textSecondary }]}>
                        {location.identifier || translateNative('native.15bc6925697ed75d')} • {location.spool_count} {translateNative('native.ac5eeabf4703b3d2')}{nativeEnglishSuffix(location.spool_count === 1 ? '' : 's')}
                      </Text>
                    </View>
                    <View style={styles.rowActions}>
                      {selectedSpoolIds.length > 0 ? (
                        <PrimaryButton
                          label={translateNative('native.aff9b055e1df6025')}
                          variant="secondary"
                          onPress={() => void assignMutation.mutateAsync(location.name)}
                          disabled={assignMutation.isPending}
                        />
                      ) : null}
                      <PrimaryButton label={translateNative('common.edit')} variant="secondary" onPress={() => startEdit(location)} />
                      <PrimaryButton
                        label={translateNative('common.delete')}
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
              <PrimaryButton label={translateNative('common.close')} variant="secondary" onPress={onClose} />
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
        title={translateNative('native.0c70de670d5f21c3')}
        message={deleteTarget ? translateNative('native.ae721c4182f0e3bd', { value0: String(deleteTarget.name) }) : ''}
        confirmLabel={translateNative('common.delete')}
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
