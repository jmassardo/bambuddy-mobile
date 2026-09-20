import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Scissors, X } from 'lucide-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { PrimaryButton, TextField } from '@/components/common/AppUI';
import type {
  PresetRef,
  PresetSource,
  UnifiedPreset,
} from '@/types/api';

type SliceSourceType = 'file' | 'archive';

interface SliceModalProps {
  visible: boolean;
  onClose: () => void;
  sourceType: SliceSourceType;
  sourceId: number;
  sourceName: string;
}

function ModalShell({
  visible,
  onClose,
  title,
  subtitle,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.5)' }]} onPress={onClose}>
        <Pressable
          style={[styles.card, { backgroundColor: colors.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.headerTitleWrap}>
              <View style={[styles.iconWrap, { backgroundColor: `${colors.accent}20` }]}>
                <Scissors size={18} color={colors.accentLight} strokeWidth={2} />
              </View>
              <View style={styles.headerTextWrap}>
                <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>{subtitle}</Text>
              </View>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton} accessibilityLabel="Close" accessibilityRole="button">
              <X size={20} color={colors.textSecondary} strokeWidth={2} />
            </Pressable>
          </View>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const { colors } = useTheme();

  return (
    <View style={[styles.optionCard, { borderColor: colors.border }]}>
      <View style={[styles.toggleRow, { borderBottomColor: colors.borderSubtle }]}>
        <View style={styles.toggleCopy}>
          <Text style={[styles.toggleLabel, { color: colors.text }]}>{label}</Text>
          <Text style={[styles.toggleDescription, { color: colors.textSecondary }]}>{description}</Text>
        </View>
        <Switch value={value} onValueChange={onValueChange} />
      </View>
    </View>
  );
}

function Switch({ value, onValueChange }: { value: boolean; onValueChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      style={[
        styles.switchBg,
        { backgroundColor: value ? colors.accent : colors.surfaceElevated, borderWidth: 1, borderColor: value ? colors.accent : colors.border },
      ]}
      accessibilityLabel={value ? 'Disable' : 'Enable'}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <View style={[styles.switchKnob, { backgroundColor: value ? colors.textInverse : colors.textSecondary, left: value ? 2 : undefined, right: value ? undefined : 2 }]} />
    </Pressable>
  );
}

export function SliceModal({
  visible,
  onClose,
  sourceType,
  sourceId,
  sourceName,
}: SliceModalProps) {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [profile, setProfile] = useState('');
  const [plate, setPlate] = useState('');
  const [enableSupports, setEnableSupports] = useState(true);
  const [extraJson, setExtraJson] = useState('');
  const [selectedFilaments, setSelectedFilaments] = useState<Record<number, PresetRef>>({});

  const presetsQuery = useQuery({
    queryKey: ['slicerPresets', 'slice-modal', sourceType, sourceId],
    queryFn: () => api.getSlicerPresets(),
    enabled: visible,
  });

  const profileHints = useMemo(() => {
    const data = presetsQuery.data;
    if (!data || typeof data !== 'object') return [];

    const values = new Set<string>();
    const visit = (value: unknown) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (typeof value !== 'object') return;
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        if (typeof nested === 'string' && /profile|preset|name/i.test(key)) values.add(nested);
        else visit(nested);
      }
    };

    visit(data);
    return Array.from(values).filter(Boolean).slice(0, 6);
  }, [presetsQuery.data]);

  const filamentPresets = useMemo(() => {
    const data = presetsQuery.data;
    if (!data || typeof data !== 'object') return [];
    const tiers: PresetSource[] = ['local', 'orca_cloud', 'cloud', 'standard'];
    const result: UnifiedPreset[] = [];
    for (const tier of tiers) {
      const slot = (data as unknown as Record<string, unknown>)[tier];
      if (slot && typeof slot === 'object' && 'filament' in slot) {
        const items = (slot as Record<string, unknown>).filament as UnifiedPreset[] | undefined;
        if (Array.isArray(items)) {
          result.push(...items);
        }
      }
    }
    return result;
  }, [presetsQuery.data]);

  useEffect(() => {
    if (!visible) return;
    setProfile(profileHints[0] ?? '');
    setPlate('');
    setEnableSupports(true);
    setExtraJson('');
    setSelectedFilaments({});
  }, [profileHints, visible]);

  const sliceMutation = useMutation({
    mutationFn: async () => {
      if (sourceType === 'file') {
        return api.sliceFile(sourceId, {
          profile: profile.trim() || undefined,
          plate: plate.trim() || undefined,
          supports: enableSupports,
          extra: extraJson.trim()
            ? (() => {
                try {
                  const parsed = JSON.parse(extraJson);
                  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
                } catch {
                  // ignore
                }
                throw new Error('Additional slice options must be a JSON object.');
              })()
            : undefined,
        });
      }
      return api.sliceArchive(sourceId);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['libraryFiles'] }),
        queryClient.invalidateQueries({ queryKey: ['archives'] }),
        queryClient.invalidateQueries({ queryKey: ['libraryFilePlates'] }),
      ]);
      showToast('Slicing started. It may take a few minutes.', 'success');
      onClose();
    },
    onError: (error: Error) => {
      showToast(error.message || 'Unable to slice this file.', 'error');
    },
  });

  return (
    <ModalShell
      visible={visible}
      onClose={onClose}
      title="Slice file"
      subtitle={sourceName}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <TextField
            label="Profile"
            value={profile}
            onChangeText={setProfile}
            placeholder="Slicer profile name (e.g., Standard 0.2mm)"
          />
          {profileHints.length > 0 ? (
            <View style={styles.hintRow}>
              {profileHints.map((hint) => (
                <Pressable
                  key={hint}
                  onPress={() => setProfile(hint)}
                  style={[
                    styles.hintChip,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: profile === hint ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.hintChipText,
                      { color: profile === hint ? colors.accentLight : colors.textSecondary },
                    ]}
                  >
                    {hint}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <TextField
            label="Plate"
            value={plate}
            onChangeText={setPlate}
            placeholder="Plate name or index (optional)"
          />

          <View style={styles.optionCard}>
            <Text style={[styles.optionLabel, { color: colors.text }]} numberOfLines={1}>
              Multi-color filaments
            </Text>
            <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>
              {filamentPresets.length > 0
                ? `Select AMS slots for ${filamentPresets.length} filament${filamentPresets.length === 1 ? '' : 's'}. Leave empty to use defaults.`
                : 'No filament presets available. Slicer will use defaults.'}
            </Text>
            {filamentPresets.length > 0 && (
              <View style={styles.filamentGrid}>
                {filamentPresets.map((preset, index) => (
                  <FilamentSlotPicker
                    key={`${preset.id}-${index}`}
                    slotIndex={index}
                    slotCount={filamentPresets.length}
                    value={selectedFilaments[index]}
                    availablePresets={filamentPresets}
                    onValueChange={(presetRef) => {
                      setSelectedFilaments((prev) => ({ ...prev, [index]: presetRef }));
                    }}
                  />
                ))}
              </View>
            )}
          </View>

          <ToggleRow
            label="Generate supports"
            description="Include supports when slicing."
            value={enableSupports}
            onValueChange={setEnableSupports}
          />

          <TextField
            label="Additional options"
            value={extraJson}
            onChangeText={setExtraJson}
            placeholder='{"layer_height":"0.2","infill":15}'
            autoCapitalize="none"
            multiline
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.borderSubtle }]}>
        <PrimaryButton label="Cancel" variant="secondary" onPress={onClose} />
        <PrimaryButton
          label={sliceMutation.isPending ? 'Starting…' : 'Slice'}
          onPress={() => sliceMutation.mutateAsync()}
          loading={sliceMutation.isPending}
        />
      </View>
    </ModalShell>
  );
}

function FilamentSlotPicker({
  slotIndex,
  slotCount,
  value,
  availablePresets,
  onValueChange,
}: {
  slotIndex: number;
  slotCount: number;
  value: PresetRef | undefined;
  availablePresets: UnifiedPreset[];
  onValueChange: (presetRef: PresetRef) => void;
}) {
  const { colors } = useTheme();
  const selectedPreset = availablePresets.find(
    (p) => p.id === value?.id && p.source === value?.source,
  );

  return (
    <View style={[styles.filamentSlot, { borderColor: colors.border }]}>
      <Text style={[styles.filamentSlotLabel, { color: colors.textSecondary }]}>
        Slot {slotIndex + 1}{slotCount > 1 ? ` of ${slotCount}` : ''}
      </Text>
      {selectedPreset ? (
        <View style={styles.filamentSlotValue}>
          <View
            style={[
              styles.filamentColorDot,
              selectedPreset.filament_colour
                ? { backgroundColor: selectedPreset.filament_colour }
                : { backgroundColor: colors.surfaceElevated },
              { borderColor: colors.border },
            ]}
          />
          <Text style={[styles.filamentSlotName, { color: colors.text }]} numberOfLines={1}>
            {selectedPreset.name}
          </Text>
          <Pressable onPress={() => onValueChange({ source: 'local', id: '' })} style={styles.filamentSlotRemove} accessibilityLabel="Remove filament" accessibilityRole="button">
            <X size={14} color={colors.textSecondary} strokeWidth={2} />
          </Pressable>
        </View>
      ) : (
        <Text style={[styles.filamentSlotEmpty, { color: colors.textSecondary }]}>
          {availablePresets.length > 0 ? 'Tap to select…' : 'No presets available'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius['2xl'],
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  sectionSubtitle: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  selectionGrid: {
    gap: spacing.sm,
  },
  selectionCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  selectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  selectionTitle: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  selectionMeta: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  loadingInline: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  emptyHint: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  optionCard: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    padding: spacing.md,
    gap: spacing.sm,
  },
  optionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  optionDescription: {
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  toggleCopy: {
    flex: 1,
    gap: 2,
  },
  toggleLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  toggleDescription: {
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  hintRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  hintChip: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  hintChipText: {
    fontSize: fontSize.xs,
  },
  switchBg: {
    width: 44,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    padding: 2,
  },
  switchKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  filamentGrid: {
    gap: spacing.sm,
  },
  filamentSlot: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    minHeight: 40,
    justifyContent: 'center',
  },
  filamentSlotLabel: {
    fontSize: fontSize.xs,
    marginBottom: 4,
  },
  filamentSlotValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  filamentColorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
  },
  filamentSlotName: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  filamentSlotRemove: {
    padding: 2,
  },
  filamentSlotEmpty: {
    fontSize: fontSize.sm,
  },
});
