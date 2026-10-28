import { NativeTranslation, translateNative, useNativeLocale } from '@/i18n';
import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AlertTriangle, X } from 'lucide-react-native';
import { PrimaryButton } from '@/components/common/AppUI';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import type { CloudProfileDiffField } from '@/types/api';

interface CloudProfileDiffModalProps {
  visible: boolean;
  leftLabel: string;
  rightLabel: string;
  fields: CloudProfileDiffField[];
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  onClose: () => void;
}

function formatValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string') return value || '—';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export function CloudProfileDiffModal({
  visible,
  leftLabel,
  rightLabel,
  fields,
  isLoading,
  errorMessage,
  onRetry,
  onClose,
}: CloudProfileDiffModalProps) {
  useNativeLocale();
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
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
              <Text style={[styles.title, { color: colors.text }]}>
                {translateNative('native.469a1ddb4dd5875a')}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}><NativeTranslation id="native.6d0bbb5237a7d99d" values={{ value0: (leftLabel), value1: (rightLabel) }} /></Text>
            </View>
            <Pressable
              onPress={onClose}
              style={[
                styles.closeButton,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
              ]}
            >
              <X size={18} color={colors.text} strokeWidth={2} />
            </Pressable>
          </View>

          {isLoading ? (
            <Text style={[styles.message, { color: colors.textSecondary }]}>
              {translateNative('native.cfe185b8c844d5fc')}</Text>
          ) : errorMessage ? (
            <View style={styles.messageWrap}>
              <Text style={[styles.message, { color: colors.error }]}>
                {errorMessage}
              </Text>
              <PrimaryButton label={translateNative('native.dcd36c14f443a507')} variant="secondary" onPress={onRetry} />
            </View>
          ) : fields.length === 0 ? (
            <View
              style={[
                styles.summary,
                { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.summaryText, { color: colors.text }]}>
                {translateNative('native.06a0eaf63d51a48f')}</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.list}>
              {fields.map(field => (
                <View
                  key={`${field.path}-${field.category ?? 'default'}`}
                  style={[
                    styles.diffCard,
                    { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.pathRow}>
                    <AlertTriangle size={14} color={colors.warning} strokeWidth={2} />
                    <Text style={[styles.pathText, { color: colors.warning }]}>
                      {field.path}
                    </Text>
                  </View>
                  <View style={styles.compareRow}>
                    <Text style={[styles.compareLabel, { color: colors.textSecondary }]}>
                      {leftLabel}
                    </Text>
                    <Text style={[styles.compareValue, { color: colors.text }]}>
                      {formatValue(field.left_value)}
                    </Text>
                  </View>
                  <View style={styles.compareRow}>
                    <Text style={[styles.compareLabel, { color: colors.textSecondary }]}>
                      {rightLabel}
                    </Text>
                    <Text style={[styles.compareValue, { color: colors.text }]}>
                      {formatValue(field.right_value)}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          <PrimaryButton label={translateNative('common.close')} variant="secondary" onPress={onClose} />
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
    padding: spacing.lg,
    gap: spacing.md,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
    lineHeight: 20,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageWrap: {
    gap: spacing.sm,
  },
  message: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  list: {
    gap: spacing.sm,
  },
  diffCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  pathRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  pathText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  compareRow: {
    gap: spacing.xs,
  },
  compareLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  compareValue: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  summary: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  summaryText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});
