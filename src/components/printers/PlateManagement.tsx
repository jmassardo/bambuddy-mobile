import React, { useState } from 'react';
import { Alert, Image, StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { camerasApi } from '@/api/cameras';
import { api } from '@/api/client';
import { useMediaToken } from '@/hooks/useStreamToken';
import { PrimaryButton, SectionCard, TextField } from '@/components/common/AppUI';
import { CameraMessage } from './CameraControls';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n';
import type { PlateDetectionROI, PlateReference, Printer } from '@/types/api';
import { validPlateRoi } from '@/utils/cameraIntegrations';
import { spacing } from '@/theme/tokens';

const defaultRoi = { x: 0.15, y: 0.35, w: 0.7, h: 0.55 };

function ReferenceEditor({ printerId, reference, canEdit, refresh }: {
  printerId: number; reference: PlateReference; canEdit: boolean; refresh: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { isReady, token } = useMediaToken();
  const [label, setLabel] = useState(reference.label);
  const mutation = useMutation({
    mutationFn: (remove: boolean) => remove
      ? camerasApi.deleteReference(printerId, reference.index)
      : camerasApi.renameReference(printerId, reference.index, label),
    onSuccess: refresh,
  });
  return (
    <View style={styles.reference}>
      {isReady && reference.has_image ? <Image accessibilityLabel={reference.label} style={styles.thumbnail} source={{ uri: camerasApi.referenceImage(printerId, reference.index) }} key={`${reference.timestamp}:${token}`} /> : null}
      <CameraMessage>{reference.timestamp}</CameraMessage>
      <TextField label={t('camera.referenceLabel', { defaultValue: 'Reference label' })} value={label} onChangeText={setLabel} />
      <PrimaryButton label={t('common.save', { defaultValue: 'Save' })} disabled={!canEdit || mutation.isPending} onPress={() => mutation.mutate(false)} />
      <PrimaryButton label={t('common.delete', { defaultValue: 'Delete' })} variant="danger" disabled={!canEdit || mutation.isPending} onPress={() => Alert.alert(
        t('camera.deleteReference', { defaultValue: 'Delete reference?' }), reference.label,
        [{ text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
          { text: t('common.delete', { defaultValue: 'Delete' }), style: 'destructive', onPress: () => mutation.mutate(true) }],
      )} />
      {mutation.error ? <CameraMessage>{mutation.error.message}</CameraMessage> : null}
    </View>
  );
}

export function PlateManagement({ printer }: { printer: Printer }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('printers:update');
  const canManageReferences = hasPermission('camera:view');
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [draft, setDraft] = useState<Record<keyof PlateDetectionROI, string> | null>(null);
  const references = useQuery({
    queryKey: ['plateReferences', printer.id],
    queryFn: () => camerasApi.references(printer.id),
  });
  const check = useMutation({ mutationFn: () => camerasApi.checkPlate(printer.id) });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['plateReferences', printer.id] }),
      queryClient.invalidateQueries({ queryKey: ['plateDetectionStatus', printer.id] }),
    ]);
  };
  const calibrate = useMutation({
    mutationFn: async () => {
      const result = await camerasApi.calibrate(printer.id, label);
      if (!result.success) throw new Error(result.message);
      return result;
    },
    onSuccess: async () => { setLabel(''); await refresh(); check.mutate(); },
  });
  const roi: PlateDetectionROI | null = draft ? {
    x: Number(draft.x) / 100, y: Number(draft.y) / 100,
    w: Number(draft.w) / 100, h: Number(draft.h) / 100,
  } : null;
  const valid = roi != null && validPlateRoi(roi) && Object.values(draft ?? {}).every(value => value.trim() !== '');
  const save = useMutation({
    mutationFn: async () => {
      if (!roi || !valid) throw new Error(t('camera.invalidRoi', { defaultValue: 'Area must fit inside the image (0–100%) with positive width and height.' }));
      return api.updatePrinter(printer.id, { plate_detection_roi: roi });
    },
    onSuccess: async () => {
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['printer', printer.id] });
      check.mutate();
    },
  });
  const result = check.data;
  return (
    <SectionCard title={t('camera.plateManagement', { defaultValue: 'Plate check, references and detection area' })}>
      <PrimaryButton label={t('camera.checkNow', { defaultValue: 'Check plate now' })} loading={check.isPending} disabled={check.isPending} onPress={() => check.mutate()} />
      <CameraMessage>{t('camera.lightReminder', { defaultValue: 'Turn on the chamber light and clear the plate before calibrating.' })}</CameraMessage>
      {check.error ? <CameraMessage>{check.error.message}</CameraMessage> : null}
      {result ? <>
        <CameraMessage>{result.message}</CameraMessage>
        <CameraMessage>{t('camera.analysis', { defaultValue: 'Confidence: {{confidence}}% · Difference: {{difference}}%', confidence: (result.confidence * 100).toFixed(1), difference: result.difference_percent.toFixed(2) })}</CameraMessage>
        {result.light_warning ? <CameraMessage>{t('camera.lightWarning', { defaultValue: 'Chamber light is off; results may be unreliable.' })}</CameraMessage> : null}
        {result.needs_calibration ? <CameraMessage>{t('camera.needsCalibration', { defaultValue: 'Calibration is required.' })}</CameraMessage> : null}
        {result.debug_image_url?.startsWith('data:image/jpeg;base64,') ? <Image accessibilityLabel={t('camera.analysisImage', { defaultValue: 'Plate analysis image' })} style={styles.analysis} source={{ uri: result.debug_image_url }} /> : null}
      </> : null}
      <TextField label={t('camera.newReferenceLabel', { defaultValue: 'New reference label' })} value={label} onChangeText={setLabel} />
      <PrimaryButton label={t('camera.addReference', { defaultValue: 'Calibrate / add reference' })} disabled={!canManageReferences || calibrate.isPending || (references.data != null && references.data.references.length >= references.data.max_references)} loading={calibrate.isPending} onPress={() => calibrate.mutate()} />
      {calibrate.error ? <CameraMessage>{calibrate.error.message}</CameraMessage> : null}
      {references.isError ? <PrimaryButton label={t('camera.retryReferences', { defaultValue: 'Retry loading references' })} onPress={() => void references.refetch()} /> : null}
      {references.data?.references.map(reference => <ReferenceEditor key={`${reference.index}:${reference.label}:${reference.timestamp}`} printerId={printer.id} reference={reference} canEdit={canManageReferences} refresh={refresh} />)}
      {draft ? <>
        {(['x', 'y', 'w', 'h'] as const).map(key => <TextField key={key} label={t(`camera.roi.${key}`, { defaultValue: `${key} (%)` })} value={draft[key]} keyboardType="decimal-pad" onChangeText={value => setDraft(current => current ? { ...current, [key]: value } : current)} />)}
        {!valid ? <CameraMessage>{t('camera.invalidRoi', { defaultValue: 'Area must fit inside the image (0–100%) with positive width and height.' })}</CameraMessage> : null}
        <PrimaryButton label={t('camera.saveArea', { defaultValue: 'Save detection area' })} disabled={!canEdit || !valid || save.isPending} loading={save.isPending} onPress={() => save.mutate()} />
        <PrimaryButton label={t('common.cancel', { defaultValue: 'Cancel' })} disabled={save.isPending} onPress={() => { setDraft(null); save.reset(); }} />
      </> : <PrimaryButton label={t('camera.editArea', { defaultValue: 'Edit detection area' })} disabled={!canEdit} onPress={() => {
        const area = printer.plate_detection_roi ?? defaultRoi;
        setDraft({ x: String(area.x * 100), y: String(area.y * 100), w: String(area.w * 100), h: String(area.h * 100) });
      }} />}
      {save.error ? <CameraMessage>{save.error.message}</CameraMessage> : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  reference: { gap: spacing.sm, marginVertical: spacing.sm },
  thumbnail: { width: '100%', height: 140, resizeMode: 'contain' },
  analysis: { width: '100%', height: 240, resizeMode: 'contain' },
});
