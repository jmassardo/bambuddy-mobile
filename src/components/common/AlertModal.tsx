import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';

export interface AlertModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message: string;
  dismissLabel?: string;
  variant?: 'info' | 'warning' | 'success' | 'error';
}

export function AlertModal({
  visible,
  onClose,
  title,
  message,
  dismissLabel = 'OK',
  variant = 'info',
}: AlertModalProps) {
  const { colors } = useTheme();

  const tone = {
    info: { icon: colors.accent, bg: `${colors.accent}20`, Icon: Info },
    warning: { icon: colors.warning, bg: `${colors.warning}20`, Icon: AlertTriangle },
    success: { icon: colors.success, bg: `${colors.success}20`, Icon: CheckCircle2 },
    error: { icon: colors.error, bg: `${colors.error}20`, Icon: AlertCircle },
  }[variant];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.card, { backgroundColor: colors.modalBg, borderColor: colors.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: tone.bg }]}>
            <tone.Icon size={24} color={tone.icon} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
          <Pressable
            onPress={onClose}
            style={[styles.button, { backgroundColor: colors.accent, borderColor: colors.accent }]}
          >
            <Text style={[styles.buttonText, { color: colors.textInverse }]}>{dismissLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  message: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  button: {
    minWidth: 120,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
});
