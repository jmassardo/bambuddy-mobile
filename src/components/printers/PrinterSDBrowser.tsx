import { translateNative, useNativeLocale, useTranslation } from '@/i18n';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { printerControlsApi as device } from '@/api/printerControls';
import { request, requestText } from '@/api/http';
import { PrimaryButton } from '@/components/common/AppUI';
import { useAuth } from '@/contexts/AuthContext';

import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import { blobToDataUrl, shareBlob } from '@/utils/share';

function SDPreview({ printerId, path }: { printerId: number; path: string }) {
  useNativeLocale();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [plate, setPlate] = useState(1);
  const kind = /\.3mf$/i.test(path) ? '3mf' : /\.(png|jpe?g)$/i.test(path) ? 'image' : /\.(gcode|txt|json|log)$/i.test(path) ? 'text' : 'unsupported';
  const plates = useQuery({
    queryKey: ['printerSDPlates', printerId, path],
    queryFn: () => request<{ plates: { index: number; name: string | null; objects: string[]; has_thumbnail: boolean }[] }>(`/printers/${printerId}/files/plates?${new URLSearchParams({ path })}`),
    enabled: kind === '3mf',
  });
  const preview = useQuery({
    queryKey: ['printerSDPreview', printerId, path, plate],
    queryFn: async () => {
      if (kind === '3mf') return { image: await blobToDataUrl(await device.thumbnail(printerId, path, plate)) };
      if (kind === 'image') return { image: await blobToDataUrl(await device.download(printerId, path)) };
      return { text: await requestText(`/printers/${printerId}/files/download?${new URLSearchParams({ path })}`) };
    },
    enabled: kind !== 'unsupported',
  });
  useEffect(() => setPlate(plates.data?.plates[0]?.index ?? 1), [plates.data]);
  return <View style={styles.stack}>
    <Text style={{ color: colors.text }}>{path}</Text>
    {kind === 'unsupported' ? <Text style={{ color: colors.textSecondary }}>{t('device.previewUnavailable', { defaultValue: 'No inline preview for this file type. Download to open it.' })}</Text> : null}
    {preview.isLoading || plates.isLoading && kind === '3mf' ? <ActivityIndicator /> : null}
    {preview.error || plates.error ? <Text style={{ color: colors.error }}>{preview.error?.message || plates.error?.message}</Text> : null}
    <View style={styles.row}>{plates.data?.plates.map(item =>
      <PrimaryButton key={item.index} label={`${item.index} · ${item.name ?? t('device.plate', { defaultValue: 'Plate' })}`}
        variant={item.index === plate ? 'primary' : 'secondary'} onPress={() => setPlate(item.index)} />)}</View>
    {plates.data?.plates.find(item => item.index === plate)?.objects.map((object, index) => <Text key={index} style={{ color: colors.text }}>{object}</Text>)}
    {preview.data?.image ? <Image source={{ uri: preview.data.image }} style={styles.preview} resizeMode="contain" /> : null}
    {preview.data?.text ? <Text selectable style={{ color: colors.text }}>{preview.data.text}</Text> : null}
  </View>;
}

export function PrinterSDBrowser({ visible, printerId, onClose }: {
  visible: boolean; printerId: number; onClose: () => void;
}) {
  useNativeLocale();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { hasPermission } = useAuth();
  const client = useQueryClient();
  const [path, setPath] = useState('/');
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [completed, setCompleted] = useState(0);
  const permission = hasPermission('printers:files');
  const listing = useQuery({
    queryKey: ['printerSDFiles', printerId, path], queryFn: () => device.files(printerId, path),
    enabled: visible && permission,
  });
  useEffect(() => { setSelected([]); setPreview(null); }, [path, visible, printerId]);
  const mutation = useMutation({
    mutationFn: async ({ files, remove }: { files: string[]; remove: boolean }) => {
      setCompleted(0);
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        if (remove) await device.deleteFile(printerId, file);
        else await shareBlob(await device.download(printerId, file), file.split('/').pop() || 'download');
        setCompleted(index + 1);
      }
    },
    onSuccess: () => setSelected([]),
    onSettled: () => client.invalidateQueries({ queryKey: ['printerSDFiles', printerId] }),
  });
  const remove = () => Alert.alert(t('device.deleteFiles', { defaultValue: 'Delete printer files?' }),
    t('device.deleteFilesConfirm', { defaultValue: 'Permanently remove {{count}} selected files from this physical printer. This cannot be undone.', count: selected.length }),
    [{ text: t('common.cancel'), style: 'cancel' }, { text: t('common.delete'), style: 'destructive', onPress: () => mutation.mutate({ files: selected, remove: true }) }]);
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <PrimaryButton label={t('common.close')} variant="secondary" onPress={onClose} />
      <Text style={{ color: colors.text }}>{t('device.sd', { defaultValue: 'Printer SD card' })} · {path}</Text>
      {!permission ? <Text style={{ color: colors.error }}>{t('device.filesPermission', { defaultValue: 'Printer files permission required.' })}</Text> : null}
      <View style={styles.row}>
        <PrimaryButton label={t('device.parentFolder', { defaultValue: 'Parent folder' })} variant="secondary" disabled={path === '/' || mutation.isPending}
          onPress={() => setPath(path.split('/').slice(0, -1).join('/') || '/')} />
        <PrimaryButton label={t('common.refresh', { defaultValue: 'Refresh' })} variant="secondary" onPress={() => { listing.refetch(); }} disabled={mutation.isPending} />
      </View>
      {listing.isLoading ? <ActivityIndicator /> : null}
      {listing.error ? <Text style={{ color: colors.error }}>{listing.error.message}</Text> : null}
      {listing.data?.warnings.map(warning => <Text key={warning} style={{ color: colors.warning }}>{warning === 'printer_unavailable' ? t('device.printerStorageUnavailable', { defaultValue: 'Printer storage is unavailable; this is not an empty directory.' }) : warning}</Text>)}
      <ScrollView contentContainerStyle={styles.stack}>
        {listing.data?.files.map(file => <View key={file.path} style={[styles.file, { borderColor: colors.border }]}>
          <Pressable disabled={mutation.isPending} accessibilityRole="button"
            accessibilityLabel={file.name} accessibilityState={{ selected: selected.includes(file.path) }}
            onPress={() => file.is_directory ? setPath(file.path) : setSelected(previous => previous.includes(file.path) ? previous.filter(item => item !== file.path) : [...previous, file.path])}>
            <Text style={{ color: colors.text }}>{file.is_directory ? '▸' : selected.includes(file.path) ? '☑' : '☐'} {file.name}</Text>
            <Text style={{ color: colors.textSecondary }}>{file.is_directory ? '' : translateNative('native.ddb6052bac0eb805', { value0: String(file.size.toLocaleString()) })} {file.modified}</Text>
          </Pressable>
          {!file.is_directory ? <PrimaryButton label={t('common.preview', { defaultValue: 'Preview' })} variant="secondary" onPress={() => setPreview(preview === file.path ? null : file.path)} /> : null}
        </View>)}
        {listing.data?.files.length === 0 && !listing.data.warnings.length ? <Text style={{ color: colors.textSecondary }}>{t('device.emptyFolder', { defaultValue: 'Empty folder.' })}</Text> : null}
        {preview ? <SDPreview key={preview} printerId={printerId} path={preview} /> : null}
      </ScrollView>
      <View style={styles.row}>
        <PrimaryButton label={t('device.downloadSelected', { defaultValue: 'Download selected ({{count}})', count: selected.length })} disabled={!permission || !selected.length} loading={mutation.isPending}
          onPress={() => mutation.mutate({ files: selected, remove: false })} />
        <PrimaryButton label={t('common.delete')} variant="danger" disabled={!permission || !selected.length} loading={mutation.isPending} onPress={remove} />
      </View>
      {mutation.isPending || mutation.isSuccess ? <Text style={{ color: colors.text }}>{t('device.fileProgress', { defaultValue: '{{completed}} files completed', completed })}</Text> : null}
      {mutation.error ? <Text style={{ color: colors.error }}>{mutation.error.message}</Text> : null}
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: spacing.lg, paddingTop: spacing.xl, gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stack: { gap: spacing.md, paddingVertical: spacing.sm },
  file: { borderWidth: 1, padding: spacing.sm, gap: spacing.sm },
  preview: { width: '100%', height: 280 },
});
