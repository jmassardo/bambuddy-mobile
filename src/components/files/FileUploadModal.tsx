import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DocumentPicker, { isCancel } from 'react-native-document-picker';
import { useMutation } from '@tanstack/react-query';
import { FileUp, Upload, X } from 'lucide-react-native';
import { api } from '@/api/client';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { formatFileSize } from '@/utils/formatters';

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
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function FileUploadModal({
  visible,
  folderId = null,
  onClose,
  onUploaded,
}: FileUploadModalProps) {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!visible) {
      setSelectedFile(null);
      setProgress(0);
    }
  }, [visible]);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) {
        throw new Error('Choose a file to upload first.');
      }

      setProgress(0);
      return api.uploadLibraryFile(
        {
          uri: selectedFile.uri,
          name: selectedFile.name,
          type: selectedFile.type,
        },
        folderId,
        (nextProgress) => setProgress(nextProgress),
      );
    },
    onSuccess: () => {
      setProgress(100);
      showToast('File uploaded.', 'success');
      onUploaded?.();
      onClose();
    },
    onError: (error) => {
      showToast(getErrorMessage(error, 'Unable to upload file.'), 'error');
    },
  });

  const chooseFile = async () => {
    try {
      const asset = await DocumentPicker.pickSingle({
        type: [DocumentPicker.types.allFiles],
        presentationStyle: 'fullScreen',
      });

      setSelectedFile({
        uri: asset.fileCopyUri ?? asset.uri,
        name: asset.name ?? 'upload',
        type: asset.type ?? 'application/octet-stream',
        size: asset.size,
      });
      setProgress(0);
    } catch (error) {
      if (isCancel(error)) return;
      showToast(getErrorMessage(error, 'Unable to read the selected file.'), 'error');
    }
  };

  const progressWidth = useMemo(
    () => `${Math.max(0, Math.min(progress, 100))}%` as `${number}%`,
    [progress],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}> 
        <View style={[styles.card, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
          <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}> 
            <View style={styles.headerTextWrap}>
              <Text style={[styles.title, { color: colors.text }]}>Upload file</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Choose a file from your device and upload it to Bambuddy.</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <X size={18} color={colors.textSecondary} strokeWidth={2} />
            </Pressable>
          </View>

          <View style={styles.content}>
            <Pressable
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
                <Text style={[styles.filePickerTitle, { color: colors.text }]}>Choose file</Text>
                <Text style={[styles.filePickerSubtitle, { color: colors.textSecondary }]}>3MF, G-code, STL, ZIP, or any printable library asset</Text>
              </View>
            </Pressable>

            {selectedFile ? (
              <View style={[styles.fileSummary, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={2}>{selectedFile.name}</Text>
                <Text style={[styles.fileMeta, { color: colors.textSecondary }]}> 
                  {selectedFile.size != null ? formatFileSize(selectedFile.size) : 'Unknown size'}
                </Text>
              </View>
            ) : null}

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
                <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>{progress}% uploaded</Text>
              </View>
            ) : null}
          </View>

          <View style={[styles.footer, { borderTopColor: colors.borderSubtle }]}> 
            <Pressable
              onPress={onClose}
              style={[
                styles.secondaryButton,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => uploadMutation.mutate()}
              disabled={!selectedFile || uploadMutation.isPending}
              style={[
                styles.primaryButton,
                {
                  backgroundColor:
                    !selectedFile || uploadMutation.isPending
                      ? colors.surfaceHover
                      : colors.accent,
                  borderColor:
                    !selectedFile || uploadMutation.isPending
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
              <Text style={[styles.primaryButtonText, { color: colors.textInverse }]}>Upload</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
