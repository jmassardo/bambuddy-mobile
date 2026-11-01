import { NativeTranslation, nativeMessage, translateNative, useLocalizedMemo, useNativeLocale, useTranslation } from '@/i18n';


import React, { useEffect, useState } from 'react';
import { localizedStatus } from '@/utils/statusLabel';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
  Switch,
} from 'react-native';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { useMutation } from '@tanstack/react-query';
import { FileUp, Upload, X } from 'lucide-react-native';
import { filesApi } from '@/api/files';

import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { formatFileSize } from '@/utils/data';

interface FileUploadModalProps {
  visible: boolean;
  folderId?: number | null;
  onClose: () => void;
  onUploaded?: () => void;
}

interface SelectedFile {
  uri: string;
  name: string;
  type: string;
  size?: number | null;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

function getErrorMessage<T extends string | import('@/i18n').NativeMessage>(error: unknown, fallback: T) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function FileUploadModal({
  visible,
  folderId = null,
  onClose,
  onUploaded,
}: FileUploadModalProps) {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [preserveStructure, setPreserveStructure] = useState(true);
  const [createFolderFromZip, setCreateFolderFromZip] = useState(false);
  const [generateThumbnails, setGenerateThumbnails] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!visible) {
      setSelectedFiles([]);
      setProgress(0);
    }
  }, [visible]);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFiles.length) {
        throw new Error(translateNative('native.437bcbb4c918bfbd'));
      }

      setProgress(0);
      let failed = false;
      for (const file of selectedFiles.filter(value => value.status !== 'done')) {
        const update = (patch: Partial<SelectedFile>) => setSelectedFiles(current =>
          current.map(value => value.uri === file.uri ? { ...value, ...patch } : value));
        update({ status: 'uploading', progress: 0, error: undefined });
        try {
          await filesApi.uploadLibraryFile(file, folderId, nextProgress => {
            setProgress(nextProgress);
            update({ progress: nextProgress });
          }, { preserveStructure, createFolderFromZip, generateThumbnails });
          update({ status: 'done', progress: 100 });
        } catch (error) {
          failed = true;
          update({ status: 'error', error: getErrorMessage(error, t('library.uploadFailed', { defaultValue: 'Upload failed; retry this file.' })) });
        }
      }
      onUploaded?.();
      if (failed) throw new Error(t('library.uploadPartial', { defaultValue: 'Some files could not be uploaded. Successful files are kept; retry the remaining files.' }));
    },
    onSuccess: () => {
      setProgress(100);
      showToast(nativeMessage('library.uploadsCompleted', () => ({defaultValue: 'Uploads completed.'})), 'success');
    },
    onError: (error) => {
      showToast(getErrorMessage(error, nativeMessage('native.96886a0199fc382e')), 'error');
    },
  });

  const chooseFile = async () => {
    try {
      const assets = await pick({
        type: [types.allFiles],
        presentationStyle: 'fullScreen',
        allowMultiSelection: true,
      });

      setSelectedFiles(current => [...current, ...assets.filter(asset => !current.some(file => file.uri === asset.uri)).map(asset => ({
        uri: asset.uri, name: asset.name ?? 'upload',
        type: asset.type ?? 'application/octet-stream', size: asset.size,
        progress: 0, status: 'pending' as const,
      }))]);
      setProgress(0);
    } catch (error) {
      if (isErrorWithCode(error) && error.code === errorCodes.OPERATION_CANCELED) return;
      showToast(getErrorMessage(error, nativeMessage('native.a1dd48da4ee28053')), 'error');
    }
  };

  const progressWidth = useLocalizedMemo(
    () => `${Math.max(0, Math.min(progress, 100))}%` as `${number}%`,
    [progress],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {if (!uploadMutation.isPending) onClose();}}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}> 
        <View style={[styles.card, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
          <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}> 
            <View style={styles.headerTextWrap}>
              <Text style={[styles.title, { color: colors.text }]}>{translateNative('native.8d67a08f65f2e968')}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{translateNative('native.10ce370bb70d42ca')}</Text>
            </View>
            <Pressable disabled={uploadMutation.isPending} onPress={onClose} style={styles.closeButton} accessibilityLabel={translateNative('common.close')} accessibilityRole="button">
              <X size={18} color={colors.textSecondary} strokeWidth={2} />
            </Pressable>
          </View>

          <View style={styles.content}>
            <Pressable
              disabled={uploadMutation.isPending}
              onPress={() => {
                void chooseFile();
              }}
              style={[
                styles.filePicker,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
              ]}
            >
              <FileUp size={22} color={colors.accentLight} strokeWidth={2} />
              <View style={styles.filePickerTextWrap}>
                <Text style={[styles.filePickerTitle, { color: colors.text }]}>{t('library.chooseFiles', {defaultValue: 'Choose files'})}</Text>
                <Text style={[styles.filePickerSubtitle, { color: colors.textSecondary }]}>{translateNative('native.b83c4a8e4ef9dc35')}</Text>
              </View>
            </Pressable>

            <ScrollView style={styles.fileList}>
              {selectedFiles.map(file => (
                <View key={file.uri} style={[styles.fileSummary, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                  <Text style={[styles.fileName, { color: colors.text }]}>{file.name}</Text>
                  <Text style={[styles.fileMeta, { color: file.status === 'error' ? colors.error : colors.textSecondary }]}>
                    {file.size != null ? formatFileSize(file.size) : ''} •                     {localizedStatus(file.status)} • {file.progress}% {file.error}
                  </Text>
                  {file.status !== 'done' && !uploadMutation.isPending ? (
                    <Pressable onPress={() => setSelectedFiles(current => current.filter(value => value.uri !== file.uri))}>
                      <Text style={{ color: colors.error }}>{t('library.removePending', { defaultValue: 'Remove from upload list' })}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </ScrollView>
            {([
              [t('library.zipHierarchy', { defaultValue: 'Preserve ZIP folder hierarchy' }), preserveStructure, setPreserveStructure],
              [t('library.zipFolder', { defaultValue: 'Create a folder named after each ZIP' }), createFolderFromZip, setCreateFolderFromZip],
              [t('library.uploadThumbnails', { defaultValue: 'Generate STL thumbnails (including ZIP contents)' }), generateThumbnails, setGenerateThumbnails],
            ] as const).map(([label, value, setter]) => (
              <View key={label} style={styles.optionRow}>
                <Text style={[styles.optionLabel, { color: colors.text }]}>{label}</Text>
                <Switch accessibilityLabel={label} value={value} onValueChange={setter} disabled={uploadMutation.isPending} />
              </View>
            ))}

            {(uploadMutation.isPending || progress > 0) ? (
              <View style={styles.progressSection}>
                <View style={[styles.progressTrack, { backgroundColor: colors.surfaceHover }]}> 
                  <View
                    style={[
                      styles.progressFill,
                      {
                        backgroundColor: colors.accent,
                        width: progressWidth as `${number}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.progressLabel, { color: colors.textSecondary }]}><NativeTranslation id="native.a29b901e1158605d" values={{ value0: (progress) }} /></Text>
              </View>
            ) : null}
          </View>

          <View style={[styles.footer, { borderTopColor: colors.borderSubtle }]}> 
            <Pressable
              disabled={uploadMutation.isPending}
              onPress={onClose}
              style={[
                styles.secondaryButton,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.text }]}>{translateNative('common.cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={() => uploadMutation.mutate()}
              disabled={!selectedFiles.some(file => file.status !== 'done') || uploadMutation.isPending}
              style={[
                styles.primaryButton,
                {
                  backgroundColor:
                    !selectedFiles.some(file => file.status !== 'done') || uploadMutation.isPending
                      ? colors.surfaceHover
                      : colors.accent,
                  borderColor:
                    !selectedFiles.some(file => file.status !== 'done') || uploadMutation.isPending
                      ? colors.border
                      : colors.accent,
                },
              ]}
            >
              {uploadMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Upload size={16} color={colors.textInverse} strokeWidth={2} />
              )}
              <Text style={[styles.primaryButtonText, { color: colors.textInverse }]}>{translateNative('common.upload')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fileList: { maxHeight: 230 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  optionLabel: { flex: 1 },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  headerTextWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    fontSize: fontSize.sm,
  },
  closeButton: {
    padding: spacing.xs,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  filePicker: {
    minHeight: 100,
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    borderStyle: 'dashed',
    padding: spacing.lg,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  filePickerTextWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  filePickerTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  filePickerSubtitle: {
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  fileSummary: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  fileName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  fileMeta: {
    fontSize: fontSize.xs,
  },
  progressSection: {
    gap: spacing.xs,
  },
  progressTrack: {
    height: 10,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  progressLabel: {
    fontSize: fontSize.xs,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  primaryButton: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  primaryButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
});
