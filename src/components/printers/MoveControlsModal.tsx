import { NativeTranslation, translateNative, useLocalizedMemo, useNativeLocale } from '@/i18n';

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Home,
  Layers3,
  Package2,
  X,
} from 'lucide-react-native';
import { PrimaryButton } from '@/components/common/AppUI';
import { api, ApiError } from '@/api/client';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';

interface MoveControlsModalProps {
  visible: boolean;
  printerId: number;
  printerName: string;
  isPrinting: boolean;
  onClose: () => void;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function AxisButton({
  icon,
  label,
  onPress,
  disabled,
  highlighted,
}: {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  highlighted?: boolean;
}) {
  useNativeLocale();
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={[
        styles.axisButton,
        {
          backgroundColor: highlighted ? colors.accentBg : colors.surfaceElevated,
          borderColor: highlighted ? colors.accent : colors.border,
        },
        (disabled || !onPress) && styles.disabledButton,
      ]}
    >
      {icon}
      <Text
        style={[
          styles.axisButtonLabel,
          { color: highlighted ? colors.accentLight : colors.textSecondary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function MoveControlsModal({
  visible,
  printerId,
  printerName,
  isPrinting,
  onClose,
}: MoveControlsModalProps) {
  useNativeLocale();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [stepSize, setStepSize] = useState(10);

  const invalidatePrinter = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['printerStatus', printerId] });
  }, [printerId, queryClient]);

  const xyJogMutation = useMutation({
    mutationFn: ({ x, y }: { x: number; y: number }) => api.xyJog(printerId, x, y),
    onSuccess: () => {
      invalidatePrinter();
    },
    onError: error =>
      showToast(getErrorMessage(error, translateNative('native.9c4bffb9f78a482f')), 'error'),
  });

  const bedJogMutation = useMutation({
    mutationFn: (distance: number) => api.bedJog(printerId, distance),
    onSuccess: () => {
      invalidatePrinter();
    },
    onError: error =>
      showToast(getErrorMessage(error, translateNative('native.ab4f39ea15a67387')), 'error'),
  });

  const extruderJogMutation = useMutation({
    mutationFn: (distance: number) => api.extruderJog(printerId, distance),
    onSuccess: () => {
      invalidatePrinter();
    },
    onError: error =>
      showToast(getErrorMessage(error, translateNative('native.3eb496c5612f2529')), 'error'),
  });

  const homeMutation = useMutation({
    mutationFn: (axes: 'xy' | 'all') => api.homeAxes(printerId, axes),
    onSuccess: async (_, axes) => {
      await invalidatePrinter();
      showToast(
        axes === 'all' ? translateNative('native.ee8c26dd8eaa822c') : translateNative('native.33dd054dc4ccf586'),
        'success',
      );
    },
    onError: error =>
      showToast(getErrorMessage(error, translateNative('native.9bd8aedeaed7801b')), 'error'),
  });

  const controlsDisabled = useLocalizedMemo(
    () =>
      isPrinting ||
      xyJogMutation.isPending ||
      bedJogMutation.isPending ||
      extruderJogMutation.isPending ||
      homeMutation.isPending,
    [
      bedJogMutation.isPending,
      extruderJogMutation.isPending,
      homeMutation.isPending,
      isPrinting,
      xyJogMutation.isPending,
    ],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.modalBg, borderColor: colors.border },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: colors.text }]}>
                {translateNative('native.af4a454ab946b132')}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {printerName}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              style={[
                styles.closeButton,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
              ]}
            >
              <X size={18} color={colors.text} strokeWidth={2} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {isPrinting ? (
              <View
                style={[
                  styles.banner,
                  { backgroundColor: colors.warning + '18', borderColor: colors.warning + '55' },
                ]}
              >
                <Text style={[styles.bannerText, { color: colors.warning }]}>
                  {translateNative('native.15a135deef56e2a3')}</Text>
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                {translateNative('native.ea31c57faf31a042')}</Text>
              <View style={styles.xyGrid}>
                <View style={styles.gridSpacer} />
                <AxisButton
                  label={translateNative('native.b1448a7f2cf1a8f1', { defaultValue: 'Up' })}
                  disabled={controlsDisabled}
                  onPress={() => xyJogMutation.mutate({ x: 0, y: stepSize })}
                  icon={<ArrowUp size={20} color={colors.text} strokeWidth={2} />}
                />
                <View style={styles.gridSpacer} />
                <AxisButton
                  label={translateNative('native.dfc147c34c40d72b')}
                  disabled={controlsDisabled}
                  onPress={() => xyJogMutation.mutate({ x: -stepSize, y: 0 })}
                  icon={<ArrowLeft size={20} color={colors.text} strokeWidth={2} />}
                />
                <AxisButton
                  label={homeMutation.isPending ? translateNative('native.54658c6f45606ca1') : translateNative('native.d286327177e6555f')}
                  disabled={controlsDisabled}
                  highlighted
                  onPress={() => homeMutation.mutate('xy')}
                  icon={
                    homeMutation.isPending ? (
                      <ActivityIndicator size="small" color={colors.accentLight} />
                    ) : (
                      <Home size={20} color={colors.accentLight} strokeWidth={2} />
                    )
                  }
                />
                <AxisButton
                  label={translateNative('native.aa4ff71868bf788c')}
                  disabled={controlsDisabled}
                  onPress={() => xyJogMutation.mutate({ x: stepSize, y: 0 })}
                  icon={<ArrowRight size={20} color={colors.text} strokeWidth={2} />}
                />
                <View style={styles.gridSpacer} />
                <AxisButton
                  label={translateNative('native.4ccb75b28fd68d27')}
                  disabled={controlsDisabled}
                  onPress={() => xyJogMutation.mutate({ x: 0, y: -stepSize })}
                  icon={<ArrowDown size={20} color={colors.text} strokeWidth={2} />}
                />
                <View style={styles.gridSpacer} />
              </View>
            </View>

            <View style={styles.dualSectionRow}>
              <View style={styles.dualSectionColumn}>
                <View style={styles.sectionIconRow}>
                  <Layers3 size={16} color={colors.textSecondary} strokeWidth={2} />
                  <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                    {translateNative('native.739beb5d86118bb9')}</Text>
                </View>
                <View style={styles.verticalControls}>
                  <AxisButton
                    label={translateNative('native.b1448a7f2cf1a8f1', { defaultValue: 'Up' })}
                    disabled={controlsDisabled}
                    onPress={() => bedJogMutation.mutate(-stepSize)}
                    icon={<ArrowUp size={20} color={colors.text} strokeWidth={2} />}
                  />
                  <AxisButton
                    label={translateNative('native.4ccb75b28fd68d27')}
                    disabled={controlsDisabled}
                    onPress={() => bedJogMutation.mutate(stepSize)}
                    icon={<ArrowDown size={20} color={colors.text} strokeWidth={2} />}
                  />
                </View>
              </View>

              <View style={styles.dualSectionColumn}>
                <View style={styles.sectionIconRow}>
                  <Package2 size={16} color={colors.textSecondary} strokeWidth={2} />
                  <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                    {translateNative('native.d059b480b1077242')}</Text>
                </View>
                <View style={styles.verticalControls}>
                  <AxisButton
                    label={translateNative('native.0196976649c8f4eb')}
                    disabled={controlsDisabled}
                    onPress={() => extruderJogMutation.mutate(-stepSize)}
                    icon={<ArrowUp size={20} color={colors.text} strokeWidth={2} />}
                  />
                  <AxisButton
                    label={translateNative('native.684032286b6d28c6')}
                    disabled={controlsDisabled}
                    onPress={() => extruderJogMutation.mutate(stepSize)}
                    icon={<ArrowDown size={20} color={colors.text} strokeWidth={2} />}
                  />
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                {translateNative('native.f5c4b97e1a1f194c')}</Text>
              <View style={styles.stepRow}>
                {[1, 10, 50].map(step => {
                  const selected = step === stepSize;
                  return (
                    <Pressable
                      key={step}
                      onPress={() => setStepSize(step)}
                      disabled={controlsDisabled}
                      style={[
                        styles.stepButton,
                        {
                          backgroundColor: selected
                            ? colors.accentBg
                            : colors.surfaceElevated,
                          borderColor: selected ? colors.accent : colors.border,
                        },
                        controlsDisabled && styles.disabledButton,
                      ]}
                    >
                      <Text
                        style={[
                          styles.stepButtonText,
                          {
                            color: selected ? colors.accentLight : colors.textSecondary,
                          },
                        ]}
                      ><NativeTranslation id="native.281d5b92833317ed" values={{ value0: (step) }} /></Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </ScrollView>

          <PrimaryButton label={translateNative('common.close')} variant="secondary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: spacing.lg,
    gap: spacing.lg,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  bannerText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  section: {
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  sectionIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  xyGrid: {
    alignSelf: 'center',
    width: 228,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  gridSpacer: {
    width: 68,
    height: 68,
  },
  axisButton: {
    width: 68,
    height: 68,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  axisButtonLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  dualSectionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  dualSectionColumn: {
    flex: 1,
  },
  verticalControls: {
    gap: spacing.sm,
  },
  stepRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stepButton: {
    flex: 1,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  stepButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  disabledButton: {
    opacity: 0.5,
  },
});
