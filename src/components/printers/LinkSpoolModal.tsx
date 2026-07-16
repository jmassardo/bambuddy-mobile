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
import { Link2, Search, X } from 'lucide-react-native';
import { PrimaryButton, TextField } from '@/components/common/AppUI';
import { api, ApiError } from '@/api/client';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import type { InventorySpool } from '@/types/api';

interface LinkSpoolModalProps {
  visible: boolean;
  printerId: number;
  amsId: number;
  trayId: number;
  slotLabel: string;
  spoolTag: string | null;
  materialHint?: string | null;
  colorHint?: string | null;
  onClose: () => void;
}

function getErrorMessage(error: unknown, fallback: string) {
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

export function LinkSpoolModal({
  visible,
  printerId,
  amsId,
  trayId,
  slotLabel,
  spoolTag,
  materialHint,
  colorHint,
  onClose,
}: LinkSpoolModalProps) {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const spoolsQuery = useQuery({
    queryKey: ['inventorySpools', 'link-modal'],
    queryFn: () => api.getSpools(true),
    enabled: visible,
    staleTime: 30_000,
  });

  const filteredSpools = useMemo(() => {
    const term = search.trim().toLowerCase();
    const material = materialHint?.trim().toLowerCase() ?? '';
    const color = normalizeHex(colorHint);

    return (spoolsQuery.data ?? [])
      .filter(spool => !spool.archived_at)
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
  }, [colorHint, materialHint, search, spoolsQuery.data]);

  const linkMutation = useMutation({
    mutationFn: (spoolId: number) => {
      if (!spoolTag) throw new Error('No spool tag is available for this slot.');
      return api.linkSpool(spoolId, {
        spoolTag,
        printerId,
        amsId,
        trayId,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['linkedSpools'] }),
        queryClient.invalidateQueries({ queryKey: ['inventorySpools'] }),
      ]);
      showToast('Spool linked to tag.', 'success');
      onClose();
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Unable to link spool.'), 'error'),
  });

  return (
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
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: colors.text }]}>Link spool</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {slotLabel}
              </Text>
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

          {spoolTag ? (
            <View
              style={[
                styles.tagCard,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
              ]}
            >
              <Link2 size={16} color={colors.accentLight} strokeWidth={2} />
              <View style={styles.tagText}>
                <Text style={[styles.tagLabel, { color: colors.textSecondary }]}>
                  RFID tag / spool UUID
                </Text>
                <Text style={[styles.tagValue, { color: colors.text }]} numberOfLines={2}>
                  {spoolTag}
                </Text>
              </View>
            </View>
          ) : (
            <View
              style={[
                styles.tagCard,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.tagValue, { color: colors.textSecondary }]}>
                This slot does not currently report a tag or spool UUID.
              </Text>
            </View>
          )}

          <TextField
            label="Find a spool"
            value={search}
            onChangeText={setSearch}
            placeholder="Material, brand, color, ID…"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {spoolsQuery.isLoading ? (
              <View style={styles.stateBlock}>
                <ActivityIndicator color={colors.accent} />
                <Text style={[styles.stateText, { color: colors.textSecondary }]}>
                  Loading spools…
                </Text>
              </View>
            ) : null}

            {!spoolsQuery.isLoading && filteredSpools.length === 0 ? (
              <View style={styles.stateBlock}>
                <Search size={20} color={colors.textTertiary} strokeWidth={2} />
                <Text style={[styles.stateText, { color: colors.textSecondary }]}>
                  No spools matched this slot.
                </Text>
              </View>
            ) : null}

            {filteredSpools.map(spool => {
              const color = swatchColor(spool);
              return (
                <Pressable
                  key={spool.id}
                  onPress={() => linkMutation.mutate(spool.id)}
                  disabled={linkMutation.isPending || !spoolTag}
                  style={[
                    styles.row,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.border,
                    },
                    (linkMutation.isPending || !spoolTag) && styles.disabled,
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
                      {[spool.brand, spool.material].filter(Boolean).join(' • ') || `Spool #${spool.id}`}
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
                  <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                    {remainingWeight(spool)}g
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <PrimaryButton label="Close" variant="secondary" onPress={onClose} />
        </View>
      </View>
    </Modal>
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
    width: 38,
    height: 38,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  tagText: {
    flex: 1,
    gap: spacing.xs,
  },
  tagLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  tagValue: {
    fontSize: fontSize.sm,
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
