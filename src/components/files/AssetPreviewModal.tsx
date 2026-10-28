import { nativeMessage, translateNative, useLocalizedMemo, useNativeLocale, useNativeMessageState, useTranslation } from '@/i18n';


import React, { useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, request, requestBlob } from '@/api/http';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import { blobToDataUrl, shareBlob } from '@/utils/share';
import { isRecord, pickArray, pickNumber, pickString } from '@/utils/data';
import { Chip, PrimaryButton } from '@/components/common/AppUI';
import { assetViewerHtml } from './assetViewerHtml';

type AssetWebViewProps = React.ComponentProps<typeof WebView> & {
  source: {html: string; baseUrl?: string};
  domStorageEnabled?: boolean;
  onShouldStartLoadWithRequest?: (event: {url: string}) => boolean;
  onError?: (event: {nativeEvent: {description: string}}) => void;
  onMessage?: (event: {nativeEvent: {data: string}}) => void;
  onContentProcessDidTerminate?: () => void;
  onRenderProcessGone?: () => void;
};
const AssetWebView = WebView as React.ComponentType<AssetWebViewProps>;

export interface AssetPreviewSource {
  fileId?: number;
  archiveId?: number;
  filename: string;
  mode?: 'model' | 'gcode' | 'document' | 'image';
  photoFilename?: string;
  archiveSource?: boolean;
}

export function inferPreviewMode(filename: string): AssetPreviewSource['mode'] {
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(filename)) return 'image';
  if (/\.gcode(\.3mf)?$/i.test(filename)) return 'gcode';
  if (/\.(stl|3mf|step|stp)$/i.test(filename)) return 'model';
  if (/\.(pdf|csv|xlsx|xls|ods)$/i.test(filename)) return 'document';
  return undefined;
}

export function previewEndpoint(source: AssetPreviewSource, plate?: number): string {
  const base = source.fileId != null ? `/library/files/${source.fileId}` : `/archives/${source.archiveId}`;
  if (source.photoFilename) return `${base}/photos/${encodeURIComponent(source.photoFilename)}`;
  if ((source.mode ?? inferPreviewMode(source.filename)) === 'gcode') return `${base}/gcode${plate ? `?plate=${plate}` : ''}`;
  return `${base}/${source.archiveId != null && source.archiveSource !== false ? 'source' : 'download'}`;
}

export function AssetPreviewModal({ source, onClose, onPrevious, onNext, onDelete }: {
  source: AssetPreviewSource | null; onClose: () => void;
  onPrevious?: () => void; onNext?: () => void; onDelete?: () => void;
}) {
  useNativeLocale();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { hasAnyPermission } = useAuth();
  const { showToast } = useToast();
  const client = useQueryClient();
  const [plate, setPlate] = useState<number | undefined>();
  const [renderError, setRenderError] = useNativeMessageState('');
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const mode = source?.mode ?? inferPreviewMode(source?.filename ?? '');
  React.useEffect(() => { setPlate(undefined); setRenderError(''); }, [source?.fileId, source?.archiveId, source?.filename, source?.mode, setRenderError]);
  const platesQuery = useQuery({
    queryKey: ['assetPlates', source?.fileId, source?.archiveId],
    queryFn: () => request<Record<string, unknown>>(source?.fileId != null ? `/library/files/${source.fileId}/plates` : `/archives/${source?.archiveId}/plates`),
    enabled: Boolean(source && /\.(3mf)$/i.test(source.filename) && !source.photoFilename),
    retry: false,
  });
  const asset = useQuery({
    queryKey: ['assetPreview', source?.fileId, source?.archiveId, source?.photoFilename, mode, mode === 'gcode' ? plate : undefined, source?.archiveSource],
    queryFn: async () => {
      if (!source || !mode) throw new Error(t('library.unsupported', { defaultValue: 'This format has no content preview. Download the original to inspect it.' }));
      if (source.fileId == null && source.archiveId == null) throw new Error(t('library.noAsset', {defaultValue: 'No library file or archive was supplied. Close the preview and open the asset again.'}));
      let blob: Blob;
      try {
        blob = await requestBlob(previewEndpoint({ ...source, mode }, plate));
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) throw new Error(t(mode === 'gcode' ? 'library.noToolpath' : 'library.missingSource', {
          defaultValue: mode === 'gcode' ? translateNative('native.de25cb78510378c9') : translateNative('native.e937025df72f2093'),
        }));
        throw error;
      }
      if (blob.size > 100 * 1024 * 1024) throw new Error(t('library.previewOversize', { defaultValue: 'This asset exceeds the 100 MB mobile preview memory limit. Download the original, or choose a smaller plate.' }));
      return blobToDataUrl(blob);
    },
    enabled: Boolean(source),
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
  });
  const plates = useLocalizedMemo(() => pickArray(platesQuery.data ?? {}, ['plates']).filter(isRecord), [platesQuery.data]);
  const activePlate = plates.find(item => pickNumber(item, ['index']) === plate);
  const html = useLocalizedMemo(() => asset.data && source && mode ? assetViewerHtml({
    data: asset.data,
    filename: source.filename,
    mode,
    plate,
    plates,
    background: colors.background,
    foreground: colors.text,
    labels: Object.fromEntries(Object.entries({
      loading: 'Loading preview…', failed: 'Preview failed. Close and retry, or download the original.',
      loadingPdfEngine: 'Loading PDF engine…', loadingPdfDocument: 'Reading PDF pages…',
      timeout: 'The preview engine took too long. Retry with an internet connection, choose a smaller plate, or download the original.',
      moduleFailed: 'Unable to load the preview engine. Check your internet connection and retry.',
      reset: 'Reset to fit', previous: 'Previous page', next: 'Next page',
      sheet: 'Sheet', previousRows: 'Previous rows', nextRows: 'Next rows', previousColumns: 'Previous columns', nextColumns: 'Next columns',
      rows: 'Rows', columns: 'Columns', feature: 'Feature', filament: 'Filament', height: 'Height', width: 'Width', travel: 'Show travel',
      bottom: 'Bottom layer', top: 'Top layer', allPlates: 'All plates', plate: 'Plate',
      noGeometry: 'No renderable geometry or toolpaths were found.',
      cyclicModel: 'The 3MF contains cyclic component references and cannot be displayed.',
      plateUnavailable: 'This plate has no identifiable model build items. Choose All plates or inspect its toolpath.',
      unsupported: 'Unsupported model format.',
    }).map(([key, defaultValue]) => [key, t(`library.viewer.${key}`, { defaultValue })])),
  }) : '', [asset.data, source, mode, plate, plates, colors.background, colors.text, t]);
  const download = async () => {
    if (!source) return;
    setBusy(true);
    try {
      const endpoint = source.photoFilename ? previewEndpoint(source) : source.fileId != null ? `/library/files/${source.fileId}/download` : `/archives/${source.archiveId}/${source.archiveSource !== false && mode !== 'gcode' ? 'source' : 'download'}`;
      await shareBlob(await requestBlob(endpoint), source.photoFilename ?? source.filename);
    } catch (error) {
      showToast(error instanceof Error ? error.message : nativeMessage('library.downloadFailed', () => ({ defaultValue: 'Download failed.' })), 'error');
    } finally { setBusy(false); }
  };
  return <Modal visible={source !== null} animationType="slide" onRequestClose={onClose}>
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        {onPrevious ? <PrimaryButton label={t('library.previousPhoto', { defaultValue: 'Previous photo' })} onPress={onPrevious} /> : null}
        {onNext ? <PrimaryButton label={t('library.nextPhoto', { defaultValue: 'Next photo' })} onPress={onNext} /> : null}
        {onDelete ? <PrimaryButton label={t('common.delete')} onPress={onDelete} variant="danger" /> : null}
        <Text style={[styles.title, { color: colors.text }]}>{source?.filename}</Text>
        <PrimaryButton label={t('common.close')} variant="secondary" onPress={onClose} />
      </View>
      <View style={styles.header}>
        <PrimaryButton label={t('library.downloadOriginal', { defaultValue: 'Download / share original' })} onPress={() => void download()} disabled={busy} variant="secondary" />
        {renderError || asset.isError ? <PrimaryButton label={t('common.retry', { defaultValue: 'Retry' })} onPress={() => { setRenderError(''); setRetry(value => value + 1); void asset.refetch(); }} /> : null}
      </View>
      {plates.length ? <>
        <ScrollView horizontal style={styles.plateBar} contentContainerStyle={styles.chips}>
          {mode !== 'gcode' ? <Chip label={t('library.allPlates', { defaultValue: 'All plates' })} selected={!plate} onPress={() => setPlate(undefined)} /> : null}
          {plates.map(item => <Chip key={pickNumber(item, ['index'])} label={t('library.plateName', { defaultValue: 'Plate {{index}} · {{name}}', index: pickNumber(item, ['index']), name: pickString(item, ['name']) })} selected={plate === pickNumber(item, ['index'])} onPress={() => { setRenderError(''); setPlate(pickNumber(item, ['index'])); }} />)}
        </ScrollView>
        {activePlate ? <Text style={[styles.meta, { color: colors.textSecondary }]}>{t('library.plateMetadata', { defaultValue: '{{objects}} objects · {{seconds}} s · {{grams}} g', objects: pickNumber(activePlate, ['object_count']), seconds: pickNumber(activePlate, ['print_time_seconds']), grams: pickNumber(activePlate, ['filament_used_grams']) })}</Text> : null}
      </> : null}
      {asset.isLoading ? <ActivityIndicator /> : null}
      {asset.isError ? <Text style={[styles.meta, { color: colors.error }]}>{asset.error.message}</Text> : null}
      {renderError ? <Text style={[styles.meta, { color: colors.error }]}>{renderError}</Text> : null}
      {html ? <AssetWebView
        key={`${source?.fileId}-${source?.archiveId}-${mode}-${retry}`}
        source={{ html, baseUrl: 'https://localhost/' }}
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={event => event.url === 'about:blank' || event.url === 'https://localhost/'}
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        setSupportMultipleWindows={false}
        onError={event => setRenderError(event.nativeEvent.description)}
        onContentProcessDidTerminate={() => setRenderError(nativeMessage('library.viewerProcessStopped', () => ({defaultValue: 'The preview exhausted the available WebView memory. Retry a smaller plate, or download the original.'})))}
        onRenderProcessGone={() => setRenderError(nativeMessage('library.viewerProcessStopped', () => ({defaultValue: 'The preview exhausted the available WebView memory. Retry a smaller plate, or download the original.'})))}
        onMessage={event => {
          try {
            const message: unknown = JSON.parse(event.nativeEvent.data);
            if (!isRecord(message)) return;
            if (message.type === 'ready') setRenderError('');
            if (message.type === 'error') setRenderError(pickString(message, ['message']));
            if (message.type === 'snapshot' && source?.fileId != null && hasAnyPermission('library:update_all', 'library:update_own') && /\.(step|stp|pdf|csv|xlsx|xls|ods)$/i.test(source.filename)) {
              const data = pickString(message, ['data']);
              if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data) || data.length > 3 * 1024 * 1024) return;
              const form = new FormData();
              form.append('thumbnail', { uri: data, name: 'preview.png', type: 'image/png' } as unknown as Blob);
              void requestBlob(`/library/files/${source.fileId}/preview-thumbnail`, { method: 'POST', body: form })
                .then(() => client.invalidateQueries({ queryKey: ['libraryFiles'] }))
                .catch(() => {});
            }
          } catch { /* Ignore messages not produced by the viewer protocol. */ }
        }}
        style={styles.web}
      /> : null}
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', padding: spacing.sm, gap: spacing.sm },
  title: { flex: 1, fontWeight: '600' },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.sm },
  plateBar: { flexGrow: 0, maxHeight: 55 },
  meta: { padding: spacing.sm },
  web: { flex: 1 },
});
