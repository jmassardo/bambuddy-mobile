import { useNativeLocale, useTranslation } from '@/i18n';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { request } from '@/api/http';
import { PrimaryButton } from '@/components/common/AppUI';
import { useAuth } from '@/contexts/AuthContext';

import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import { SkipObjectsPlate } from './SkipObjectsPlate';

export function SkipObjectsModal({ visible, printerId, onClose }: {
  visible: boolean; printerId: number; onClose: () => void;
}) {
  useNativeLocale();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { hasPermission } = useAuth();
  const client = useQueryClient();
  const [selected, setSelected] = useState<number[]>([]);
  const status = useQuery({
    queryKey: ['printerStatus', printerId], queryFn: () => api.getPrinterStatus(printerId),
    enabled: visible, refetchInterval: visible ? 5000 : false,
  });
  const objects = useQuery({
    queryKey: ['printableObjects', printerId], queryFn: () => api.getPrintableObjects(printerId),
    enabled: visible, refetchInterval: visible ? 5000 : false,
  });
  const reload = useMutation({
    mutationFn: () => request(`/printers/${printerId}/print/objects?reload=true`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['printableObjects', printerId] }),
  });
  const active = objects.data?.objects.filter(object => !object.skipped) ?? [];
  const selectedIds = selected.filter(id => active.some(object => object.id === id));
  const canSkip = hasPermission('printers:control') && status.data?.connected
    && ['RUNNING', 'PAUSE'].includes(status.data?.state ?? '') && (status.data?.layer_num ?? 0) > 1;
  const mutation = useMutation({
    mutationFn: (ids: number[]) => api.skipObjects(printerId, ids),
    onSuccess: async () => {
      setSelected([]);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['printableObjects', printerId] }),
        client.invalidateQueries({ queryKey: ['printerStatus', printerId] }),
      ]);
    },
  });
  useEffect(() => { setSelected([]); }, [visible, printerId, status.data?.current_print]);
  const toggle = (id: number) => {
    if (!canSkip || mutation.isPending || !active.some(object => object.id === id)) return;
    setSelected(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]);
  };
  const confirm = () => Alert.alert(t('device.skipObjects', { defaultValue: 'Skip selected objects?' }),
    selectedIds.length === active.length
      ? t('device.skipAllWarning', { defaultValue: 'You selected every remaining object. This can end the print. Skip all {{count}} objects?', count: selectedIds.length })
      : t('device.skipConfirmation', { defaultValue: 'Skip {{count}} objects for the rest of this print? This cannot be undone.', count: selectedIds.length }),
    [{ text: t('common.cancel'), style: 'cancel' }, { text: t('device.skip', { defaultValue: 'Skip' }), style: 'destructive', onPress: () => {
      if (canSkip && selectedIds.length) mutation.mutate(selectedIds);
    } }]);
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <SafeAreaProvider>
    <SafeAreaView edges={{ top: 'maximum', bottom: 'maximum', left: 'maximum', right: 'maximum' }} style={[styles.root, { backgroundColor: colors.background }]}>
      <PrimaryButton label={t('common.close')} variant="secondary" onPress={onClose} />
      <Text style={{ color: colors.text }}>{t('device.skipObjectsTitle', { defaultValue: 'Skip objects' })}</Text>
      {!canSkip ? <Text style={{ color: colors.warning }}>{t('device.skipGuard', { defaultValue: 'A connected running print after layer 1 and printer control permission are required.' })}</Text> : null}
      <ScrollView contentContainerStyle={styles.stack}>
        {visible && objects.data?.objects.length ? <SkipObjectsPlate printerId={printerId}
          printKey={`${status.data?.current_archive_id ?? status.data?.current_print ?? ''}:${status.data?.current_plate_id ?? ''}`}
          selected={selectedIds} skipped={objects.data.objects.filter(object => object.skipped).map(object => object.id)} onSelect={toggle} /> : null}
        {objects.isLoading ? <ActivityIndicator /> : null}
        {objects.error || status.error || reload.error ? <Text style={{ color: colors.error }}>{objects.error?.message || status.error?.message || reload.error?.message}</Text> : null}
        {objects.data?.objects.length === 0 ? <Text style={{ color: colors.textSecondary }}>{t('device.noObjects', { defaultValue: 'No objects loaded. Reload from the current print after reconnecting.' })}</Text> : null}
        <PrimaryButton label={t('device.reloadObjects', { defaultValue: 'Reload current print objects' })} variant="secondary" disabled={!status.data?.connected} loading={reload.isPending} onPress={() => reload.mutate()} />
        <PrimaryButton label={selectedIds.length === active.length && active.length ? t('device.clearSelection', { defaultValue: 'Clear selection' }) : t('device.selectAll', { defaultValue: 'Select all remaining' })}
          variant="secondary" disabled={!canSkip || mutation.isPending} onPress={() => setSelected(selectedIds.length === active.length ? [] : active.map(object => object.id))} />
        {objects.data?.objects.map(object => <PrimaryButton key={object.id}
          label={`${object.skipped ? '⊘' : selectedIds.includes(object.id) ? '☑' : '☐'} ${object.name || `#${object.id}`}`}
          variant={selectedIds.includes(object.id) ? 'primary' : 'secondary'} disabled={object.skipped || !canSkip || mutation.isPending} onPress={() => toggle(object.id)} />)}
      </ScrollView>
      <PrimaryButton label={t('device.skipCount', { defaultValue: 'Skip selected ({{count}})', count: selectedIds.length })}
        variant="danger" disabled={!canSkip || !selectedIds.length} loading={mutation.isPending} onPress={confirm} />
      {mutation.error ? <Text style={{ color: colors.error }}>{mutation.error.message}</Text> : null}
      {mutation.isSuccess ? <Text style={{ color: colors.success }}>{t('device.objectsSkipped', { defaultValue: 'Selected objects skipped.' })}</Text> : null}
    </SafeAreaView>
    </SafeAreaProvider>
  </Modal>;
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: spacing.lg, paddingTop: spacing.xl, gap: spacing.sm },
  stack: { gap: spacing.sm, paddingVertical: spacing.sm },
});
