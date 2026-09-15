import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { AlertTriangle, Info, AlertCircle } from 'lucide-react-native';
import { useTheme } from '@/theme';

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
  returnFocusRef?: React.RefObject<View | null>;
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
  const titleRef = useRef<View>(null);
  const entryFocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const returnFocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const previousVisibleRef = useRef(false);
  const previousLoadingRef = useRef(loading);
  const openCycleRef = useRef(0);
  const confirmInFlightRef = useRef(false);
  const closeInFlightRef = useRef(false);
  const returnFocusHandledRef = useRef(false);
  const latestReturnFocusRef = useRef(returnFocusRef);
  const [confirmInFlight, setConfirmInFlight] = useState(false);
  const [closeInFlight, setCloseInFlight] = useState(false);
  latestReturnFocusRef.current = returnFocusRef;

  const cancelTimer = (
    timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  ) => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    const wasVisible = previousVisibleRef.current;

    if (visible && !wasVisible) {
      cancelTimer(entryFocusTimerRef);
      cancelTimer(returnFocusTimerRef);
      openCycleRef.current += 1;
      const openCycle = openCycleRef.current;
      confirmInFlightRef.current = false;
      closeInFlightRef.current = false;
      returnFocusHandledRef.current = false;
      setConfirmInFlight(false);
      setCloseInFlight(false);

      entryFocusTimerRef.current = setTimeout(() => {
        entryFocusTimerRef.current = null;
        if (!previousVisibleRef.current || openCycleRef.current !== openCycle)
          return;

        try {
          const titleHandle =
            titleRef.current === null ? null : findNodeHandle(titleRef.current);
          if (titleHandle !== null)
            AccessibilityInfo.setAccessibilityFocus(titleHandle);
        } catch {
          // A disappearing native host must not prevent the modal from opening.
        }
      }, 0);
    } else if (!visible && wasVisible) {
      cancelTimer(entryFocusTimerRef);
      confirmInFlightRef.current = false;
      closeInFlightRef.current = false;
      setConfirmInFlight(false);
      setCloseInFlight(false);

      if (!returnFocusHandledRef.current) {
        returnFocusHandledRef.current = true;
        const closedCycle = openCycleRef.current;
        returnFocusTimerRef.current = setTimeout(() => {
          returnFocusTimerRef.current = null;
          if (
            previousVisibleRef.current ||
            openCycleRef.current !== closedCycle
          )
            return;

          try {
            const trigger = latestReturnFocusRef.current?.current;
            const triggerHandle =
              trigger == null ? null : findNodeHandle(trigger);
            if (triggerHandle !== null)
              AccessibilityInfo.setAccessibilityFocus(triggerHandle);
          } catch {
            // Stale caller refs are expected during navigation and are safe to ignore.
          }
        }, 0);
      }
    }

    previousVisibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    if (visible && previousLoadingRef.current && !loading) {
      confirmInFlightRef.current = false;
      setConfirmInFlight(false);
    }
    previousLoadingRef.current = loading;
  }, [loading, visible]);

  useEffect(() => {
    return () => {
      cancelTimer(entryFocusTimerRef);
      cancelTimer(returnFocusTimerRef);
    };
  }, []);

  const variantColors = {
    danger: {
      icon: colors.error,
      button: colors.error,
      buttonHover: colors.error,
    },
    warning: {
      icon: colors.warning,
      button: colors.warning,
      buttonHover: colors.warning,
    },
    info: {
      icon: colors.accent,
      button: colors.accent,
      buttonHover: colors.accentDark,
    },
  };
  const vc = variantColors[variant];

  const IconComponent =
    variant === 'danger'
      ? AlertCircle
      : variant === 'warning'
      ? AlertTriangle
      : Info;
  const variantContext = `${variant[0].toUpperCase()}${variant.slice(
    1,
  )} confirmation`;
  const actionsDisabled = loading || confirmInFlight || closeInFlight;

  const handleClose = () => {
    if (
      loading ||
      confirmInFlightRef.current ||
      closeInFlightRef.current ||
      !previousVisibleRef.current
    ) {
      return;
    }

    closeInFlightRef.current = true;
    setCloseInFlight(true);
    onClose();
  };

  const handleConfirm = () => {
    if (
      loading ||
      confirmInFlightRef.current ||
      closeInFlightRef.current ||
      !previousVisibleRef.current
    ) {
      return;
    }

    confirmInFlightRef.current = true;
    setConfirmInFlight(true);
    try {
      onConfirm();
    } catch (error) {
      confirmInFlightRef.current = false;
      setConfirmInFlight(false);
      throw error;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View
          role="dialog"
          accessibilityViewIsModal
          style={[
            styles.card,
            { backgroundColor: colors.modalBg, borderColor: colors.border },
          ]}
        >
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator
          >
            <View style={styles.iconRow}>
              <View
                accessible
                accessibilityRole="image"
                accessibilityLabel={variantContext}
                style={[styles.iconCircle, { backgroundColor: `${vc.icon}20` }]}
              >
                <IconComponent size={24} color={vc.icon} />
              </View>
            </View>
            <View
              ref={titleRef}
              accessible
              accessibilityRole="header"
              accessibilityLabel={title}
            >
              <Text
                allowFontScaling
                style={[styles.title, { color: colors.text }]}
              >
                {title}
              </Text>
            </View>
            <Text
              allowFontScaling
              style={[styles.message, { color: colors.textSecondary }]}
            >
              {message}
            </Text>
          </ScrollView>
          <View style={styles.buttons}>
            <Pressable
              onPress={handleClose}
              disabled={actionsDisabled}
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
              accessibilityState={{ disabled: actionsDisabled }}
              style={[
                styles.button,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text
                allowFontScaling
                style={[styles.buttonText, { color: colors.text }]}
              >
                {cancelLabel}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleConfirm}
              disabled={actionsDisabled}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              accessibilityState={{
                disabled: actionsDisabled,
                busy: loading || confirmInFlight,
              }}
              style={[
                styles.button,
                styles.confirmButton,
                { backgroundColor: vc.button },
              ]}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text
                  allowFontScaling
                  style={[styles.buttonText, { color: colors.textInverse }]}
                >
                  {confirmLabel}
                </Text>
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
    maxHeight: '80%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  body: {
    width: '100%',
    flexShrink: 1,
  },
  bodyContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  iconRow: {
    marginBottom: 16,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
    flexShrink: 1,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    width: '100%',
  },
  button: {
    flexGrow: 1,
    flexBasis: 120,
    minWidth: 44,
    minHeight: 44,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  confirmButton: {
    borderWidth: 0,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
