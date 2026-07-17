import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Boxes, X } from 'lucide-react-native';
import { ActionSheetModal } from '@/components/common/ActionSheetModal';
import { PrimaryButton } from '@/components/common/AppUI';
import { api, ApiError } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';

interface PrintableObject {
  id: number;
  name: string;
  skipped: boolean;
}

interface SkipObjectsModalProps {
  visible: boolean;
  printerId: number;
  onClose: () => void;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export function SkipObjectsModal({
  visible,
  printerId,
  onClose,
}: SkipObjectsModalProps) {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [pendingObject, setPendingObject] = useState<PrintableObject | null>(null);

  const statusQuery = useQuery({
    queryKey: ['printerStatus', printerId],
    queryFn: () => api.getPrinterStatus(printerId),
    enabled: visible,
    refetchInterval: visible ? 15_000 : false,
  });

  const objectsQuery = useQuery({
    queryKey: ['printableObjects', printerId],
    queryFn: () => api.getPrintableObjects(printerId),
    enabled: visible,
    refetchInterval: visible ? 5_000 : false,
  });

  const skipMutation = useMutation({
    mutationFn: (objectIds: number[]) => api.skipObjects(printerId, objectIds),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['printableObjects', printerId] }),
        queryClient.invalidateQueries({ queryKey: ['printerStatus', printerId] }),
      ]);
      showToast('Object skipped.', 'success');
      setPendingObject(null);
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Unable to skip object.'), 'error'),
  });

  const objects = useMemo(
    () => (objectsQuery.data?.objects ?? []) as PrintableObject[],
    [objectsQuery.data?.objects],
  );
  const isPrinting =
    statusQuery.data?.state === 'RUNNING' || statusQuery.data?.state === 'PAUSE';
  const layerNumber = Number(statusQuery.data?.layer_num ?? 0);
  const canSkip = hasPermission('printers:control') && isPrinting && layerNumber > 1;
  const activeCount = objects.filter(object => !object.skipped).length;

  const requestSkip = (object: PrintableObject) => {
    setPendingObject(object);
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <View
            style={[
              styles.card,
              { backgroundColor: colors.modalBg, borderColor: colors.border },
            ]}
          >
            <View style={styles.header}>
              <View style={styles.headerTitle}>
                <Boxes size={18} color={colors.accentLight} strokeWidth={2} />
                <Text style={[styles.title, { color: colors.text }]}>Skip objects</Text>
              </View>
              <Pressable
                onPress={onClose}
                style={[
                  styles.iconButton,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
              >
                <X size={18} color={colors.text} strokeWidth={2} />
              </Pressable>
            </View>

          <View
            style={[
              styles.summary,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.summaryText, { color: colors.text }]}>
              {activeCount} active • {objects.length - activeCount} skipped
            </Text>
            <Text style={[styles.summarySubtext, { color: colors.textSecondary }]}>
              Select a part to cancel it mid-print.
            </Text>
          </View>

          {!canSkip ? (
            <View
              style={[
                styles.warning,
                {
                  backgroundColor: `${colors.warning}18`,
                  borderColor: `${colors.warning}55`,
                },
              ]}
            >
              <AlertCircle size={16} color={colors.warning} strokeWidth={2} />
              <Text style={[styles.warningText, { color: colors.warning }]}>
                {!hasPermission('printers:control')
                  ? 'You do not have permission to control this printer.'
                  : !isPrinting
                    ? 'Object skipping is only available while a print is running.'
                    : `Wait for layer 2 before skipping parts (currently layer ${layerNumber}).`}
              </Text>
            </View>
          ) : null}

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {objectsQuery.isLoading ? (
              <View style={styles.stateBlock}>
                <ActivityIndicator color={colors.accent} />
                <Text style={[styles.stateText, { color: colors.textSecondary }]}>
                  Loading printable objects…
                </Text>
              </View>
            ) : null}

            {!objectsQuery.isLoading && objects.length === 0 ? (
              <View style={styles.stateBlock}>
                <Boxes size={20} color={colors.textTertiary} strokeWidth={2} />
                <Text style={[styles.stateText, { color: colors.textSecondary }]}>
                  No printable objects were reported for this print.
                </Text>
              </View>
            ) : null}

            {objects.map(object => {
              const skipped = object.skipped;
              return (
                <View
                  key={object.id}
                  style={[
                    styles.objectRow,
                    {
                      backgroundColor: skipped
                        ? `${colors.error}12`
                        : colors.surfaceElevated,
                      borderColor: skipped ? `${colors.error}44` : colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.objectBadge,
                      {
                        backgroundColor: skipped ? `${colors.error}22` : colors.accentBg,
                        borderColor: skipped ? `${colors.error}55` : colors.accent,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.objectBadgeText,
                        { color: skipped ? colors.error : colors.accentLight },
                      ]}
                    >
                      {object.id}
                    </Text>
                  </View>
                  <View style={styles.objectText}>
                    <Text style={[styles.objectTitle, { color: colors.text }]} numberOfLines={1}>
                      {object.name || `Object ${object.id}`}
                    </Text>
                    <Text
                      style={[styles.objectSubtitle, { color: colors.textSecondary }]}
                      numberOfLines={1}
                    >
                      {skipped ? 'Skipped' : 'Active'}
                    </Text>
                  </View>
                  <PrimaryButton
                    label={skipped ? 'Skipped' : 'Skip'}
                    variant={skipped ? 'secondary' : 'danger'}
                    onPress={() => requestSkip(object)}
                    disabled={skipped || !canSkip || skipMutation.isPending}
                    loading={pendingObject?.id === object.id && skipMutation.isPending}
                  />
                </View>
              );
            })}
          </ScrollView>

            <PrimaryButton label="Close" variant="secondary" onPress={onClose} />
          </View>
        </View>
      </Modal>

      <ActionSheetModal
        visible={pendingObject != null}
        title="Skip object"
        subtitle={
          pendingObject
            ? `Skip "${pendingObject.name}" for the rest of this print?`
            : undefined
        }
        onClose={() => setPendingObject(null)}
        actions={[
          {
            label: 'Cancel',
            onPress: () => setPendingObject(null),
          },
          {
            label: 'Skip',
            onPress: () => {
              if (!pendingObject) return;
              const objectId = pendingObject.id;
              setPendingObject(null);
              skipMutation.mutate([objectId]);
            },
            destructive: true,
          },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '88%',
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  summaryText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  summarySubtext: {
    fontSize: fontSize.sm,
  },
  warning: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  warningText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  stateBlock: {
    paddingVertical: spacing['2xl'],
    alignItems: 'center',
    gap: spacing.sm,
  },
  stateText: {
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  objectRow: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  objectBadge: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  objectBadgeText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
  },
  objectText: {
    flex: 1,
    gap: spacing.xs,
  },
  objectTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  objectSubtitle: {
    fontSize: fontSize.xs,
  },
});
