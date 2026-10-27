import React, { useEffect, useRef, useState } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { filesApi } from '@/api/files';
import { PrimaryButton, SectionCard, TextField } from '@/components/common/AppUI';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTranslation } from '@/i18n';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import { blobToDataUrl } from '@/utils/share';
import { pickArray, pickNumber, pickString } from '@/utils/data';
import { AssetPreviewModal } from './AssetPreviewModal';

function ResultPhoto({ fileId, filename, onPress }: {fileId: number; filename: string; onPress: () => void}) {
  const image = useQuery({ queryKey: ['libraryPhoto', fileId, filename], queryFn: async () => blobToDataUrl(await filesApi.getLibraryPhoto(fileId, filename)), gcTime: 0 });
  return <Pressable onPress={onPress} accessibilityLabel={filename}>{image.data ? <Image source={{uri: image.data}} style={styles.thumb} /> : <Text>{filename}</Text>}</Pressable>;
}

export function LibraryFileDetails({ fileId }: {fileId: number}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { hasPermission, user, authEnabled } = useAuth();
  const { showToast } = useToast();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['libraryFileDetails', fileId], queryFn: () => filesApi.getLibraryFile(fileId) });
  const [notes, setNotes] = useState('');
  const [url, setUrl] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const initializedId = useRef<number | null>(null);
  const canEdit = !authEnabled || hasPermission('library:update_all') || (hasPermission('library:update_own') && user?.id === pickNumber(query.data, ['created_by_id']));
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({queryKey: ['libraryFileDetails', fileId]}),
      client.invalidateQueries({queryKey: ['libraryFiles']}),
    ]);
  };
  useEffect(() => {
    if (query.data && initializedId.current !== fileId) {
      setNotes(pickString(query.data, ['notes']));
      setUrl(pickString(query.data, ['external_url']));
      initializedId.current = fileId;
    }
  }, [fileId, query.data]);
  const save = useMutation({
    mutationFn: () => filesApi.updateLibraryFile(fileId, { notes, external_url: url.trim() }),
    onSuccess: async () => { await refresh(); showToast(t('library.detailsSaved', { defaultValue: 'File details saved.' }), 'success'); },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const upload = useMutation({
    mutationFn: async () => {
      const assets = await pick({ type: [types.images], allowMultiSelection: true });
      for (const asset of assets) await filesApi.uploadLibraryPhoto(fileId, {uri: asset.uri, name: asset.name ?? 'result.jpg', type: asset.type ?? 'image/jpeg'});
    },
    onSettled: refresh,
    onError: (error: Error) => { if (!isErrorWithCode(error) || error.code !== errorCodes.OPERATION_CANCELED) showToast(error.message, 'error'); },
  });
  const remove = useMutation({
    mutationFn: (filename: string) => filesApi.deleteLibraryPhoto(fileId, filename),
    onSuccess: async () => { setPhoto(null); await refresh(); },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const photos = pickArray(query.data ?? {}, ['photos']).filter((value): value is string => typeof value === 'string');
  if (query.isError) return <PrimaryButton label={t('common.retry', { defaultValue: 'Retry' })} onPress={() => void query.refetch()} />;
  return <>
    <SectionCard title={t('library.notesLinks', { defaultValue: 'Notes and links' })}>
      <TextField label={t('library.notes', { defaultValue: 'Notes' })} value={notes} onChangeText={setNotes} multiline editable={canEdit} />
      <TextField label={t('library.externalUrl', { defaultValue: 'External URL' })} value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" editable={canEdit} />
      {canEdit ? <PrimaryButton label={t('common.save')} onPress={() => save.mutate()} disabled={save.isPending || !query.data || Boolean(url.trim() && !/^https?:\/\//i.test(url.trim()))} /> : null}
      {/^https?:\/\//i.test(url) ? <PrimaryButton label={t('library.openLink', { defaultValue: 'Open external link' })} variant="secondary" onPress={() => void Linking.openURL(url).catch((error: Error) => showToast(error.message, 'error'))} /> : null}
      {/^https?:\/\//i.test(pickString(query.data, ['source_url'])) ? <PrimaryButton label={t('library.sourceLink', { defaultValue: 'Open source link' })} variant="secondary" onPress={() => void Linking.openURL(pickString(query.data, ['source_url'])).catch((error: Error) => showToast(error.message, 'error'))} /> : null}
      {query.data?.variant_group_id ? <Text style={{ color: colors.text }}>{t('library.versionGroup', { defaultValue: 'Version group #{{id}}', id: String(query.data.variant_group_id) })}</Text> : null}
    </SectionCard>
    <SectionCard title={t('library.resultPhotos', { defaultValue: 'Result photos' })}>
      {canEdit ? <PrimaryButton label={t('library.addPhotos', { defaultValue: 'Add photos' })} onPress={() => upload.mutate()} disabled={upload.isPending} /> : null}
      <ScrollView horizontal contentContainerStyle={styles.row}>
        {photos.map(filename => <ResultPhoto key={filename} fileId={fileId} filename={filename} onPress={() => setPhoto(filename)} />)}
      </ScrollView>
    </SectionCard>
    <AssetPreviewModal source={photo ? {fileId, filename: photo, photoFilename: photo, mode: 'image'} : null} onClose={() => setPhoto(null)}
      onPrevious={photo ? () => setPhoto(photos[(photos.indexOf(photo) - 1 + photos.length) % photos.length]) : undefined}
      onNext={photo ? () => setPhoto(photos[(photos.indexOf(photo) + 1) % photos.length]) : undefined}
      onDelete={photo && canEdit ? () => Alert.alert(t('library.deletePhoto', { defaultValue: 'Permanently delete photo?' }), photo, [{text: t('common.cancel'), style: 'cancel'}, {text: t('common.delete'), style: 'destructive', onPress: () => remove.mutate(photo)}]) : undefined}
    />
  </>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, thumb: {width: 70, height: 70} });
