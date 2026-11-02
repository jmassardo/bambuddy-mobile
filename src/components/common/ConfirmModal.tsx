import { translateNative, useNativeLocale, useTranslation } from '@/i18n';
import React, { useCallback, useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Modal,
  ScrollView,
  Text,
  View,
  Pressable,
  StyleSheet,
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
  if (variant === 'warning') return translateNative('native.201075b73563c5a7');
  if (variant === 'info') return translateNative('native.e665a9f35a027a6f');
  return translateNative('native.9076936470978ba1');
}

export function ConfirmModal({
  visible,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = translateNative('common.confirm'),
  cancelLabel = translateNative('common.cancel'),
  variant = 'danger',
  loading = false,
  returnFocusRef,
}: ConfirmModalProps) {
  useNativeLocale();
  const { colors } = useTheme();
  const { text } = useTranslation();
  const isMountedRef = useRef(false);
  const isConfirmingRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // When modal opens, set modal semantics and move focus
  useEffect(() => {
    if (!visible || !isMountedRef.current) return;
    isConfirmingRef.current = false;

    // Small delay to ensure the native view is available
    const timer = setTimeout(() => {
      if (isMountedRef.current) {
        try {
          AccessibilityInfo.announceForAccessibility(text(title));
        } catch {
          // AccessibilityInfo may not be available in test environments
        }
      }
    }, 100);

    return () => {
      clearTimeout(timer);
    };
  }, [visible, title, text, isMountedRef]);
  useEffect(() => {
    if (!loading) isConfirmingRef.current = false;
  }, [loading]);

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
        accessibilityLabel={`${text(title)}. ${text(message)}. ${text(confirmLabel)} / ${text(cancelLabel)}`}
      >
        <View
          style={[styles.card, { backgroundColor: colors.modalBg, borderColor: colors.border }]}
          accessibilityLabel={text(title)}
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
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
          >
            <Text
              style={[styles.title, { color: colors.text }]}
              accessibilityRole="header"
              numberOfLines={0}
            >
              {text(title)}
            </Text>
            <Text
              style={[styles.message, { color: colors.textSecondary }]}
              accessibilityRole="text"
              numberOfLines={0}
            >
              {text(message)}
            </Text>
          </ScrollView>
          <View style={styles.buttons}>
            <Pressable
              onPress={handleCancel}
              disabled={loading}
              style={[styles.button, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, opacity: loading ? 0.5 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={text(cancelLabel)}
              accessibilityState={{ disabled: loading }}
              hitSlop={8}
            >
              <Text style={[styles.buttonText, { color: colors.text }]}>{text(cancelLabel)}</Text>
            </Pressable>
            <Pressable
              onPress={handleConfirm}
              disabled={loading}
              style={[styles.button, styles.confirmButton, { backgroundColor: accentColor }]}
              accessibilityRole="button"
              accessibilityLabel={text(confirmLabel)}
              accessibilityState={{ disabled: loading, busy: loading }}
              hitSlop={8}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={[styles.buttonText, { color: colors.textInverse }]}>{text(confirmLabel)}</Text>
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
    maxHeight: '90%',
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
  scroll: {
    flexShrink: 1,
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
    minHeight: 48,
  },
  confirmButton: {
    borderWidth: 0,
  },
  buttonText: {
    fontSize: fontSize.base,
    fontWeight: '600',
    textAlign: 'center',
  },
});
