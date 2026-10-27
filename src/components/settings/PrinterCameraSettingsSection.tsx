import React, { useEffect, useState } from 'react';
import { Switch } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { printersApi } from '@/api/printers';
import { camerasApi } from '@/api/cameras';
import { PrimaryButton, SectionCard, TextField } from '@/components/common/AppUI';
import { CameraChoices, CameraMessage } from '@/components/printers/CameraControls';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n';
import type { Printer } from '@/types/api';
import { validExternalCameraUrl } from '@/utils/cameraIntegrations';

function PrinterCameraForm({ printer }: { printer: Printer }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('printers:update');
  const canTest = hasPermission('camera:view');
  const [enabled, setEnabled] = useState(printer.external_camera_enabled);
  const [url, setUrl] = useState(printer.external_camera_url ?? '');
  const [type, setType] = useState(printer.external_camera_type ?? 'mjpeg');
  const [snapshot, setSnapshot] = useState(printer.external_camera_snapshot_url ?? '');
  const [rotation, setRotation] = useState(printer.camera_rotation ?? 0);
  const reset = () => {
    setEnabled(printer.external_camera_enabled);
    setUrl(printer.external_camera_url ?? '');
    setType(printer.external_camera_type ?? 'mjpeg');
    setSnapshot(printer.external_camera_snapshot_url ?? '');
    setRotation(printer.camera_rotation ?? 0);
  };
  useEffect(() => {
    setEnabled(printer.external_camera_enabled);
    setUrl(printer.external_camera_url ?? '');
    setType(printer.external_camera_type ?? 'mjpeg');
    setSnapshot(printer.external_camera_snapshot_url ?? '');
    setRotation(printer.camera_rotation ?? 0);
  }, [printer]);
  const validUrl = validExternalCameraUrl(url.trim(), type);
  const validSnapshot = snapshot.trim() === '' || validExternalCameraUrl(snapshot.trim(), 'snapshot');
  const save = useMutation({
    mutationFn: () => printersApi.updatePrinter(printer.id, {
      external_camera_enabled: enabled,
      external_camera_url: url.trim() || null,
      external_camera_type: type,
      external_camera_snapshot_url: snapshot.trim() || null,
      camera_rotation: rotation,
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['printers'] }),
        queryClient.invalidateQueries({ queryKey: ['printer', printer.id] }),
      ]);
    },
  });
  const streamTest = useMutation({ mutationFn: () => camerasApi.testExternal(printer.id, url.trim(), type) });
  const snapshotTest = useMutation({ mutationFn: () => camerasApi.testExternal(printer.id, snapshot.trim(), 'snapshot') });
  return (
    <SectionCard title={printer.name}>
      <CameraMessage>{t('camera.externalEnabled', { defaultValue: 'Use external camera' })}</CameraMessage>
      <Switch accessibilityLabel={t('camera.externalEnabled', { defaultValue: 'Use external camera' })} value={enabled} onValueChange={setEnabled} disabled={!canEdit} />
      <CameraChoices label={t('camera.type', { defaultValue: 'Camera type' })} value={type} options={['mjpeg', 'rtsp', 'snapshot', 'usb']} onChange={value => { setType(value); streamTest.reset(); }} disabled={!canEdit} />
      <TextField label={type === 'usb' ? t('camera.devicePath', { defaultValue: 'USB device path (e.g. /dev/video0)' }) : t('camera.streamUrl', { defaultValue: 'Stream URL' })} value={url} onChangeText={value => { setUrl(value); streamTest.reset(); }} autoCapitalize="none" editable={canEdit} />
      {enabled && !validUrl ? <CameraMessage>{t('camera.invalidStreamUrl', { defaultValue: 'Enter a valid stream URL for this camera type, or a USB path from /dev/video0 to /dev/video99.' })}</CameraMessage> : null}
      <PrimaryButton label={t('camera.testStream', { defaultValue: 'Test current stream' })} disabled={!canTest || !validUrl || streamTest.isPending} loading={streamTest.isPending} onPress={() => streamTest.mutate()} />
      <TextField label={t('camera.snapshotUrl', { defaultValue: 'Dedicated snapshot URL (optional)' })} value={snapshot} onChangeText={value => { setSnapshot(value); snapshotTest.reset(); }} autoCapitalize="none" editable={canEdit} />
      {!validSnapshot ? <CameraMessage>{t('camera.invalidSnapshotUrl', { defaultValue: 'The dedicated snapshot URL must use HTTP or HTTPS.' })}</CameraMessage> : null}
      <PrimaryButton label={t('camera.testSnapshot', { defaultValue: 'Test current snapshot URL' })} disabled={!canTest || !snapshot.trim() || !validSnapshot || snapshotTest.isPending} loading={snapshotTest.isPending} onPress={() => snapshotTest.mutate()} />
      {[streamTest, snapshotTest].map((test, index) => <React.Fragment key={index}>
        {test.error ? <CameraMessage>{test.error.message}</CameraMessage> : null}
        {test.data ? <>
          <CameraMessage>{test.data.success ? t('camera.connectionSuccess', { defaultValue: 'Connection successful' }) : test.data.error || t('camera.connectionFailed', { defaultValue: 'Connection failed' })}</CameraMessage>
          {test.data.resolution ? <CameraMessage>{t('camera.resolution', { defaultValue: 'Resolution: {{resolution}}', resolution: test.data.resolution })}</CameraMessage> : null}
          {test.data.coalesced ? <CameraMessage>{t('camera.sharedCapture', { defaultValue: 'Shared capture: this frame came from an existing capture, not a new connection.' })}</CameraMessage> : null}
        </> : null}
      </React.Fragment>)}
      <CameraChoices label={t('camera.rotation', { defaultValue: 'Camera rotation' })} value={rotation} options={[0, 90, 180, 270]} onChange={setRotation} disabled={!canEdit} />
      <PrimaryButton label={t('camera.saveCamera', { defaultValue: 'Save printer camera' })} disabled={!canEdit || (enabled && !validUrl) || !validSnapshot || save.isPending} loading={save.isPending} onPress={() => save.mutate()} />
      <PrimaryButton label={t('common.cancel', { defaultValue: 'Cancel' })} disabled={save.isPending} variant="secondary" onPress={() => { reset(); streamTest.reset(); snapshotTest.reset(); save.reset(); }} />
      {save.isSuccess ? <CameraMessage>{t('common.saved', { defaultValue: 'Saved' })}</CameraMessage> : null}
      {save.error ? <CameraMessage>{save.error.message}</CameraMessage> : null}
    </SectionCard>
  );
}

export function PrinterCameraSettingsSection() {
  const { t } = useTranslation();
  const printers = useQuery({ queryKey: ['printers'], queryFn: printersApi.getPrinters });
  return <>
    <CameraMessage>{t('camera.perPrinterSettings', { defaultValue: 'External cameras are configured on each printer. Changes apply to monitoring, snapshots and plate checks.' })}</CameraMessage>
    {printers.isError ? <PrimaryButton label={t('common.retry', { defaultValue: 'Retry' })} onPress={() => void printers.refetch()} /> : null}
    {printers.data?.map(printer => <PrinterCameraForm key={printer.id} printer={printer} />)}
  </>;
}
