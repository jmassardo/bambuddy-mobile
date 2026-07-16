import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  Info,
  Trash2,
  X,
} from 'lucide-react-native';
import { api } from '@/api/client';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import type { HMSError } from '@/types/api';
import {
  ERROR_DESCRIPTIONS,
  filterKnownHMSErrors,
  getHMSErrorCode,
} from './hmsErrorCatalog';

export { filterKnownHMSErrors } from './hmsErrorCatalog';

interface HMSErrorModalProps {
  visible: boolean;
  printerId: number;
  printerName: string;
  errors: HMSError[];
  onClose: () => void;
}

function getSeverityMeta(
  severity: number,
  colors: ReturnType<typeof useTheme>['colors'],
) {
  switch (severity) {
    case 1:
      return {
        label: 'Fatal',
        color: colors.error,
        backgroundColor: `${colors.error}18`,
        Icon: AlertTriangle,
      };
    case 2:
      return {
        label: 'Serious',
        color: colors.error,
        backgroundColor: `${colors.error}12`,
        Icon: AlertTriangle,
      };
    case 3:
      return {
        label: 'Warning',
        color: colors.warning,
        backgroundColor: `${colors.warning}16`,
        Icon: AlertCircle,
      };
    default:
      return {
        label: 'Info',
        color: colors.info,
        backgroundColor: `${colors.info}16`,
        Icon: Info,
      };
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function HMSErrorModal({
  visible,
  printerId,
  printerName,
  errors,
  onClose,
}: HMSErrorModalProps) {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const knownErrors = useMemo(() => filterKnownHMSErrors(errors), [errors]);

  const clearMutation = useMutation({
    mutationFn: () => api.clearHMSErrors(printerId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['printerStatus', printerId] });
      showToast('HMS errors cleared.', 'success');
      onClose();
    },
    onError: (error) => {
      showToast(getErrorMessage(error, 'Unable to clear HMS errors.'), 'error');
    },
  });

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}> 
        <View
          style={[
            styles.card,
            { backgroundColor: colors.modalBg, borderColor: colors.border },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}> 
            <View style={styles.headerTextWrap}>
              <Text style={[styles.title, { color: colors.text }]}>HMS errors</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {printerName}
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <X size={18} color={colors.textSecondary} strokeWidth={2} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            {knownErrors.length === 0 ? (
              <View style={styles.emptyState}>
                <AlertCircle size={32} color={colors.textTertiary} strokeWidth={2} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No active HMS errors</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                  Active printer faults will appear here.
                </Text>
              </View>
            ) : (
              knownErrors.map((error, index) => {
                const shortCode = getHMSErrorCode(error);
                const description =
                  ERROR_DESCRIPTIONS[shortCode] ?? 'Unknown HMS error code.';
                const severity = getSeverityMeta(error.severity, colors);

                return (
                  <View
                    key={`${error.code}-${index}`}
                    style={[
                      styles.errorCard,
                      {
                        backgroundColor: colors.surfaceElevated,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.errorHeader}>
                      <View
                        style={[
                          styles.iconWrap,
                          { backgroundColor: severity.backgroundColor },
                        ]}
                      >
                        <severity.Icon
                          size={16}
                          color={severity.color}
                          strokeWidth={2}
                        />
                      </View>
                      <View style={styles.errorTextWrap}>
                        <View style={styles.errorTitleRow}>
                          <Text style={[styles.errorCode, { color: severity.color }]}>
                            {shortCode.replace('_', '-')}
                          </Text>
                          <View
                            style={[
                              styles.severityBadge,
                              { backgroundColor: severity.backgroundColor },
                            ]}
                          >
                            <Text style={[styles.severityText, { color: severity.color }]}>
                              {severity.label}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.errorDescription, { color: colors.textSecondary }]}>
                          {description}
                        </Text>
                      </View>
                    </View>

                    {error.actions?.length ? (
                      <View style={styles.actionsList}>
                        <Text style={[styles.actionsTitle, { color: colors.text }]}>Suggested actions</Text>
                        {error.actions.map((action) => (
                          <Text
                            key={action}
                            style={[styles.actionItem, { color: colors.textSecondary }]}
                          >
                            • {action.replace(/_/g, ' ')}
                          </Text>
                        ))}
                      </View>
                    ) : null}

                    <Pressable
                      onPress={() => {
                        void Linking.openURL('https://wiki.bambulab.com/en/hms/home').catch(() => {
                          showToast('Unable to open the HMS wiki.', 'error');
                        });
                      }}
                      style={styles.linkRow}
                    >
                      <Text style={[styles.linkText, { color: colors.accentLight }]}>Open HMS wiki</Text>
                      <ExternalLink size={14} color={colors.accentLight} strokeWidth={2} />
                    </Pressable>
                  </View>
                );
              })
            )}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.borderSubtle }]}> 
            <Pressable
              onPress={onClose}
              style={[
                styles.secondaryButton,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Close</Text>
            </Pressable>
            <Pressable
              onPress={() => clearMutation.mutate()}
              disabled={clearMutation.isPending || knownErrors.length === 0}
              style={[
                styles.primaryButton,
                {
                  backgroundColor:
                    clearMutation.isPending || knownErrors.length === 0
                      ? colors.surfaceHover
                      : colors.error,
                  borderColor:
                    clearMutation.isPending || knownErrors.length === 0
                      ? colors.border
                      : colors.error,
                },
              ]}
            >
              {clearMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <Trash2 size={16} color={colors.text} strokeWidth={2} />
              )}
              <Text style={[styles.primaryButtonText, { color: colors.text }]}>Clear all</Text>
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
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing['3xl'],
  },
  emptyTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  emptySubtitle: {
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  errorCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  errorHeader: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTextWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  errorTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  errorCode: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  severityBadge: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  severityText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  errorDescription: {
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  actionsList: {
    gap: 2,
  },
  actionsTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  actionItem: {
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  linkText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
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
    borderRadius: borderRadius.lg,
    borderWidth: 1,
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
    borderRadius: borderRadius.lg,
    borderWidth: 1,
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
