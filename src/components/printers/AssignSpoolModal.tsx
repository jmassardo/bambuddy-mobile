import { NativeTranslation, nativeMessage, translateNative, useLocalizedMemo, useNativeLocale, useTranslation } from '@/i18n';

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Search, X } from 'lucide-react-native';
import { PrimaryButton, TextField } from '@/components/common/AppUI';
import { ErrorState } from '@/components/common/StateScreens';
import { api, ApiError } from '@/api/client';
import { printerControlsApi as device } from '@/api/printerControls';
import { useAuth } from '@/contexts/AuthContext';

import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import type { InventorySpool, SpoolAssignment } from '@/types/api';

interface AssignSpoolModalProps {
  visible: boolean;
  printerId: number;
  amsId: number;
  trayId: number;
  slotLabel: string;
  materialHint?: string | null;
  colorHint?: string | null;
  profileHint?: string | null;
  onClose: () => void;
}

function getErrorMessage<T extends string | import('@/i18n').NativeMessage>(error: unknown, fallback: T) {
  return error instanceof ApiError ? error.message : fallback;
}

function normalizeHex(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.replace('#', '').trim();
  if (!normalized) return null;
  return normalized.slice(0, 6).toUpperCase();
}

function swatchColor(spool: InventorySpool) {
  const hex = normalizeHex(spool.rgba);
  return hex ? `#${hex}` : null;
}

function remainingWeight(spool: InventorySpool) {
  return Math.max(0, Math.round((spool.label_weight ?? 0) - (spool.weight_used ?? 0)));
}

export function AssignSpoolModal({
  visible,
  printerId,
  amsId,
  trayId,
  slotLabel,
  materialHint,
  colorHint,
  profileHint,
  onClose,
}: AssignSpoolModalProps) {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<'inventory' | 'spoolman'>('inventory');
  const spoolman = useQuery({ queryKey: ['spoolmanStatus'], queryFn: () => api.getSpoolmanStatus(), enabled: visible });
  const spoolmanSpools = useQuery({ queryKey: ['spoolmanSlotSpools'], queryFn: () => device.spoolmanSpools(), enabled: visible && source === 'spoolman' && spoolman.data?.enabled === true });
  const bindings = useQuery({ queryKey: ['spoolmanSlotBindings'], queryFn: () => device.spoolmanBindings(), enabled: visible && spoolman.data?.enabled === true });
  const binding = bindings.data?.find(item => item.printer_id === printerId && item.ams_id === amsId && item.tray_id === trayId);
  const confirmAssignment = (spool: { material: string; rgba: string | null; slicer_filament_name?: string | null }, submit: () => void) => {
    const mismatch = (materialHint && spool.material.toLowerCase() !== materialHint.toLowerCase())
      || (profileHint && spool.slicer_filament_name && spool.slicer_filament_name !== profileHint);
    Alert.alert(mismatch ? t('device.assignmentMismatch', { defaultValue: 'Material / profile mismatch' }) : t('device.assignSpool', { defaultValue: 'Assign spool?' }),
      t('device.assignmentChanges', { defaultValue: 'Current: {{current}}. New: {{next}}. Assignment may replace the printer material, color and K profile. Empty slots are configured after insertion. Continue?',
        current: [materialHint, profileHint].filter(Boolean).join(' · ') || '—',
        next: [spool.material, spool.slicer_filament_name, spool.rgba].filter(Boolean).join(' · ') }),
      [{ text: t('common.cancel'), style: 'cancel' }, { text: t('common.confirm', { defaultValue: 'Confirm' }), onPress: submit }]);
  };
  const assignSpoolman = useMutation({
    mutationFn: (id: number) => device.assignSpoolman(printerId, amsId, trayId, id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['spoolmanSlotBindings'] }),
        queryClient.invalidateQueries({ queryKey: ['printerStatus', printerId] }),
      ]);
      showToast(nativeMessage('device.spoolmanAssigned', () => ({ defaultValue: 'Spoolman spool assigned to this slot.' })), 'success');
      onClose();
    },
    onError: error => showToast(error.message, 'error'),
  });

  const spoolsQuery = useQuery({
    queryKey: ['inventorySpools', 'assign-modal'],
    queryFn: () => api.getSpools(true),
    enabled: visible,
    staleTime: 30_000,
  });

  const assignmentsQuery = useQuery({
    queryKey: ['inventoryAssignments'],
    queryFn: () => api.getAssignments(),
    enabled: visible,
    staleTime: 15_000,
  });

  const blockedSpoolIds = useLocalizedMemo(() => {
    const blocked = new Set<number>();
    (assignmentsQuery.data ?? []).forEach((assignment: SpoolAssignment) => {
      const currentSlot =
        assignment.printer_id === printerId &&
        assignment.ams_id === amsId &&
        assignment.tray_id === trayId;
      if (!currentSlot) blocked.add(assignment.spool_id);
    });
    return blocked;
  }, [amsId, assignmentsQuery.data, printerId, trayId]);

  const filteredSpools = useLocalizedMemo(() => {
    const term = search.trim().toLowerCase();
    const material = materialHint?.trim().toLowerCase() ?? '';
    const color = normalizeHex(colorHint);

    return (spoolsQuery.data ?? [])
      .filter(spool => !spool.archived_at)
      .filter(spool => !blockedSpoolIds.has(spool.id))
      .filter(spool => {
        if (!term) return true;
        return [
          spool.brand,
          spool.material,
          spool.subtype,
          spool.color_name,
          spool.slicer_filament_name,
          String(spool.id),
        ]
          .filter(Boolean)
          .some(value => value!.toLowerCase().includes(term));
      })
      .sort((left, right) => {
        const leftMaterialMatch =
          material !== '' && left.material.toLowerCase() === material ? 1 : 0;
        const rightMaterialMatch =
          material !== '' && right.material.toLowerCase() === material ? 1 : 0;
        if (leftMaterialMatch !== rightMaterialMatch) {
          return rightMaterialMatch - leftMaterialMatch;
        }

        const leftColorMatch = normalizeHex(left.rgba) === color ? 1 : 0;
        const rightColorMatch = normalizeHex(right.rgba) === color ? 1 : 0;
        if (leftColorMatch !== rightColorMatch) {
          return rightColorMatch - leftColorMatch;
        }

        return remainingWeight(right) - remainingWeight(left);
      });
  }, [blockedSpoolIds, colorHint, materialHint, search, spoolsQuery.data]);

  const assignMutation = useMutation({
    mutationFn: (spoolId: number) => api.assignSpool(spoolId, printerId, amsId, trayId),
    onSuccess: async assignment => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventoryAssignments'] }),
        queryClient.invalidateQueries({ queryKey: ['inventorySpools'] }),
        queryClient.invalidateQueries({ queryKey: ['printerStatus', printerId] }),
      ]);
      showToast(assignment.pending_config ? nativeMessage('device.assignedAwaitingInsert', () => ({ defaultValue: 'Spool assigned; printer configuration is waiting for insertion.' })) : assignment.configured ? nativeMessage('device.assignedConfigured', () => ({ defaultValue: 'Spool assigned and printer slot configured.' })) : nativeMessage('device.assignedNotConfirmed', () => ({ defaultValue: 'Spool assigned; printer configuration has not been confirmed.' })), 'success');
      onClose();
    },
    onError: error =>
      showToast(getErrorMessage(error, nativeMessage('native.410ce58cbd32a366')), 'error'),
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
      <KeyboardAvoidingView style={styles.viewport} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.card,
            { backgroundColor: colors.modalBg, borderColor: colors.border },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: colors.text }]}>{translateNative('native.81feec5a97a3034f')}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {slotLabel}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              style={[
                styles.iconButton,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
              ]}
            >
              <X size={18} color={colors.text} strokeWidth={2} />
            </Pressable>
          </View>

          <TextField
            label={translateNative('native.7ed66e89b9e6fb69')}
            value={search}
            onChangeText={setSearch}
            placeholder={translateNative('native.898af67559d22bc3')}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {spoolman.data?.enabled ? <View style={styles.hints}>
            <PrimaryButton label={t('device.localInventory', { defaultValue: 'Local inventory' })} variant={source === 'inventory' ? 'primary' : 'secondary'} onPress={() => setSource('inventory')} />
            <PrimaryButton label="Spoolman" variant={source === 'spoolman' ? 'primary' : 'secondary'} onPress={() => setSource('spoolman')} />
          </View> : null}
          {binding ? <Text style={{ color: colors.text }}>{t('device.spoolmanBinding', { defaultValue: 'Current Spoolman binding: #{{id}}', id: binding.spoolman_spool_id })}</Text> : null}
          {bindings.error ? <Text style={{ color: colors.error }}>{bindings.error.message}</Text> : null}
          {source === 'spoolman' ? <ScrollView keyboardShouldPersistTaps="handled">
            {spoolmanSpools.isLoading ? <ActivityIndicator /> : null}
            {spoolmanSpools.error ? <Text style={{ color: colors.error }}>{spoolmanSpools.error.message}</Text> : null}
            {spoolmanSpools.data?.filter(spool => !bindings.data?.some(item =>
              item.spoolman_spool_id === spool.id && !(item.printer_id === printerId && item.ams_id === amsId && item.tray_id === trayId)))
              .filter(spool => [spool.brand, spool.material, spool.color_name, String(spool.id)].join(' ').toLowerCase().includes(search.toLowerCase()))
              .map(spool => <PrimaryButton key={spool.id} label={`#${spool.id} · ${spool.brand} ${spool.material} ${spool.color_name ?? ''}`}
                disabled={!hasPermission('inventory:update') || assignSpoolman.isPending || !bindings.isSuccess}
                onPress={() => confirmAssignment(spool, () => assignSpoolman.mutate(spool.id))} />)}
          </ScrollView> : null}

          <View style={styles.hints}>
            {materialHint ? (
              <View
                style={[
                  styles.hintPill,
                  { backgroundColor: colors.accentBg, borderColor: colors.accent },
                ]}
              >
                <Package size={14} color={colors.accentLight} strokeWidth={2} />
                <Text style={[styles.hintText, { color: colors.accentLight }]}>
                  {materialHint}
                </Text>
              </View>
            ) : null}
            {colorHint ? (
              <View
                style={[
                  styles.hintPill,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
              >
                <View
                  style={[
                    styles.colorDot,
                    { backgroundColor: `#${normalizeHex(colorHint) ?? '808080'}` },
                  ]}
                />
                <Text style={[styles.hintText, { color: colors.textSecondary }]}>
                  {translateNative('native.688767f9694e2455')}</Text>
              </View>
            ) : null}
          </View>

          {source === 'inventory' ? <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {spoolsQuery.isLoading || assignmentsQuery.isLoading ? (
              <View style={styles.stateBlock}>
                <ActivityIndicator color={colors.accent} />
                <Text style={[styles.stateText, { color: colors.textSecondary }]}>
                  {translateNative('native.ca20f4e92ab7bd73')}</Text>
              </View>
            ) : null}

            {spoolsQuery.error || assignmentsQuery.error ? (
              <ErrorState
                message={(spoolsQuery.error || assignmentsQuery.error)!.message}
                onRetry={() => {
                  void spoolsQuery.refetch();
                  void assignmentsQuery.refetch();
                }}
              />
            ) : null}
            {spoolsQuery.isSuccess && assignmentsQuery.isSuccess && filteredSpools.length === 0 ? (
              <View style={styles.stateBlock}>
                <Search size={20} color={colors.textTertiary} strokeWidth={2} />
                <Text style={[styles.stateText, { color: colors.textSecondary }]}>
                  {translateNative('native.b26d96b45780df01')}</Text>
              </View>
            ) : null}

            {source === 'inventory' ? filteredSpools.map(spool => {
              const color = swatchColor(spool);
              return (
                <Pressable
                  key={spool.id}
                  onPress={() => confirmAssignment(spool, () => assignMutation.mutate(spool.id))}
                  disabled={!hasPermission('inventory:update') || assignMutation.isPending || !assignmentsQuery.isSuccess}
                  style={[
                    styles.row,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.border,
                    },
                    assignMutation.isPending && styles.disabled,
                  ]}
                >
                  <View
                    style={[
                      styles.swatch,
                      {
                        backgroundColor: color ?? colors.surfaceHover,
                        borderColor: color ?? colors.border,
                      },
                    ]}
                  />
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
                      {[spool.brand, spool.material].filter(Boolean).join(' • ') || translateNative('native.695cc238a31cecd5', { value0: String(spool.id) })}
                    </Text>
                    <Text
                      style={[styles.rowSubtitle, { color: colors.textSecondary }]}
                      numberOfLines={2}
                    >
                      {[spool.subtype, spool.color_name, `#${spool.id}`]
                        .filter(Boolean)
                        .join(' • ')}
                    </Text>
                  </View>
                  <Text style={[styles.rowMeta, { color: colors.textSecondary }]}><NativeTranslation id="native.7eb7cac004ef21f5" values={{ value0: (remainingWeight(spool)) }} /></Text>
                </Pressable>
              );
            }) : null}
          </ScrollView> : null}

          <PrimaryButton label={translateNative('common.close')} variant="secondary" onPress={onClose} />
        </View>
      </SafeAreaView>
      </KeyboardAvoidingView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1 },
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
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
  },
  subtitle: {
    fontSize: fontSize.sm,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hints: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  hintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  hintText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: borderRadius.full,
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
  row: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  rowText: {
    flex: 1,
    gap: spacing.xs,
  },
  rowTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  rowSubtitle: {
    fontSize: fontSize.xs,
  },
  rowMeta: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  disabled: {
    opacity: 0.6,
  },
});
