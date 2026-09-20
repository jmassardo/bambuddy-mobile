import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Modal,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  type ViewStyle,
  ActivityIndicator,
} from 'react-native';
import { AlertTriangle, Info, AlertCircle } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { fontSize } from '@/theme/tokens';

export interface ConfirmModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  loading?: boolean;
  /**
   * Optional ref to a trigger component. When the modal closes, focus returns
   * to this ref so screen readers don't lose their place.
   */
  returnFocusRef?: React.RefObject<React.ComponentRef<typeof Pressable> | null>;
}

function variantIcon(variant: 'danger' | 'warning' | 'info') {
  if (variant === 'warning') return AlertTriangle;
  if (variant === 'info') return Info;
  return AlertCircle;
}

function variantDescription(variant: 'danger' | 'warning' | 'info') {
  if (variant === 'warning') return 'warning';
  if (variant === 'info') return 'information';
  return 'danger';
}

export function ConfirmModal({
  visible,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  returnFocusRef,
}: ConfirmModalProps) {
  const { colors } = useTheme();
  const isMountedRef = useRef(false);
  const isConfirmingRef = useRef(false);

  const [cardHeight, setCardHeight] = useState(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const handleCardLayout = useCallback((e: LayoutChangeEvent) => {
    setCardHeight(e.nativeEvent.layout.height);
  }, []);

  // When modal opens, set modal semantics and move focus
  useEffect(() => {
    if (!visible || !isMountedRef.current) return;
    isConfirmingRef.current = false;

    // Small delay to ensure the native view is available
    const timer = setTimeout(() => {
      if (isMountedRef.current) {
        try {
          AccessibilityInfo.announceForAccessibility(title);
        } catch {
          // AccessibilityInfo may not be available in test environments
        }
      }
    }, 100);

    return () => {
      clearTimeout(timer);
    };
  }, [visible, title, isMountedRef]);

  const handleClose = useCallback(() => {
    if (loading) return;
    onClose();
    if (returnFocusRef?.current) {
      try {
        (returnFocusRef.current as any)?.focus?.();
      } catch {
        // Ref may be stale or unavailable
      }
    }
  }, [loading, onClose, returnFocusRef]);

  const handleConfirm = useCallback(() => {
    if (loading || isConfirmingRef.current) return;
    isConfirmingRef.current = true;
    onConfirm();
  }, [loading, onConfirm]);

  const handleCancel = useCallback(() => {
    isConfirmingRef.current = false;
    handleClose();
  }, [handleClose]);

  const IconComponent = variantIcon(variant);
  const variantDesc = variantDescription(variant);

  // Calculate max height based on available screen space
  const maxHeight = Math.max(cardHeight + 80, 300);

  const cardStyle: ViewStyle = {
    maxHeight: maxHeight,
  };

  const accentColor = variant === 'danger' ? colors.error : variant === 'warning' ? colors.warning : colors.accent;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      presentationStyle="overFullScreen"
    >
      <View
        style={[styles.backdrop, { backgroundColor: colors.overlay }]}
        accessibilityViewIsModal={true}
        accessibilityLabel={`${title}. ${variantDesc}. ${message}. Choose confirm or cancel.`}
      >
        <View
          style={[styles.card, { backgroundColor: colors.modalBg, borderColor: colors.border }, cardStyle]}
          onLayout={handleCardLayout}
          accessibilityLabel={title}
          accessibilityState={{ busy: loading, disabled: false }}
        >
          <View style={styles.iconRow}>
            <View style={[styles.iconCircle, { backgroundColor: `${accentColor}20` }]}>
              <IconComponent size={24} color={accentColor} />
            </View>
            <Text
              style={[styles.srOnly, { color: accentColor }]}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            >
              {variantDesc}
            </Text>
          </View>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
          >
            <Text
              style={[styles.title, { color: colors.text }]}
              accessibilityRole="header"
              numberOfLines={0}
            >
              {title}
            </Text>
            <Text
              style={[styles.message, { color: colors.textSecondary }]}
              accessibilityRole="text"
              numberOfLines={0}
            >
              {message}
            </Text>
          </ScrollView>
          <View style={styles.buttons}>
            <Pressable
              onPress={handleCancel}
              disabled={loading}
              style={[styles.button, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
              accessibilityState={{ disabled: loading, checked: false }}
              hitSlop={8}
            >
              <Text style={[styles.buttonText, { color: colors.text }]}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={handleConfirm}
              disabled={loading}
              style={[styles.button, styles.confirmButton, { backgroundColor: accentColor }]}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              accessibilityState={{ disabled: loading, checked: false, busy: loading }}
              hitSlop={8}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={[styles.buttonText, { color: colors.textInverse }]}>{confirmLabel}</Text>
              )}
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
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  iconRow: {
    marginBottom: 8,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  srOnly: {
    position: 'absolute',
    left: -9999,
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: fontSize.base,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
  },
  scrollContent: {
    flexGrow: 1,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 44,
  },
  confirmButton: {
    borderWidth: 0,
  },
  buttonText: {
    fontSize: fontSize.base,
    fontWeight: '600',
  },
});
