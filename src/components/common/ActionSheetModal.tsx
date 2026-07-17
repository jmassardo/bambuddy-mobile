import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';

export interface ActionSheetAction {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  destructive?: boolean;
  loading?: boolean;
}

export function ActionSheetModal({
  visible,
  title,
  subtitle,
  actions,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  actions: ActionSheetAction[];
  onClose: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.card,
            { backgroundColor: colors.modalBg, borderColor: colors.border },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.titleWrap}>
              <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
              {subtitle ? (
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  {subtitle}
                </Text>
              ) : null}
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

          <View style={styles.actions}>
            {actions.map(action => (
              <Pressable
                key={action.label}
                onPress={action.onPress}
                disabled={action.disabled || action.loading}
                style={[
                  styles.row,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: action.destructive ? `${colors.error}66` : colors.border,
                  },
                  (action.disabled || action.loading) && styles.disabledAction,
                ]}
              >
                {action.icon ? <View style={styles.rowIcon}>{action.icon}</View> : null}
                <Text
                  style={[
                    styles.rowLabel,
                    { color: action.destructive ? colors.error : colors.text },
                  ]}
                >
                  {action.label}
                </Text>
                {action.loading ? (
                  <ActivityIndicator
                    size="small"
                    color={action.destructive ? colors.error : colors.accent}
                  />
                ) : null}
              </Pressable>
            ))}
          </View>
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
  card: {
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  titleWrap: {
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
  actions: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  row: {
    minHeight: 52,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowIcon: {
    width: 20,
    alignItems: 'center',
  },
  rowLabel: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  disabledAction: {
    opacity: 0.45,
  },
});
