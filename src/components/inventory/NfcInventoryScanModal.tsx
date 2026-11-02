import { NativeTranslation, translateNative, useLocalizedMemo, useNativeLocale } from '@/i18n';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Check, CircleDashed, Tag, X, AlertCircle } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { useNfc } from '@/hooks/useNfc';
import { inventoryApi } from '@/api/inventory';
import type { InventorySpool } from '@/types/api';
import { pickString, pickNumber } from '@/utils/data';
import { fontSize } from '@/theme/tokens';

export type NfcInventoryScanModalProps = {
  spoolman?: boolean;
  visible: boolean;
  onClose: () => void;
  onAdd: (uid: string) => void;
  onEdit: (spool: InventorySpool) => void;
  onAssign: (spool: InventorySpool) => void;
  _toast?: { showToast: (message: string, type: string, duration?: number) => void };
};

type ScanPhase =
  | { phase: 'checking' }
  | { phase: 'unsupported' }
  | { phase: 'disabled' }
  | { phase: 'ready' }
  | { phase: 'scanning' }
  | { phase: 'lookup'; uid: string }
  | { phase: 'not_found'; uid: string }
  | { phase: 'found'; spool: InventorySpool }
  | { phase: 'duplicate'; spools: InventorySpool[]; uid: string }
  | { phase: 'error'; message: string }
  | { phase: 'cancelled' };

function scanDescription(phase: ScanPhase): string {
  switch (phase.phase) {
    case 'checking': return translateNative('native.92df392a81bc83d2');
    case 'unsupported': return translateNative('native.ca484467ec74c655');
    case 'disabled': return translateNative('native.601edb73fd31663f');
    case 'ready': return translateNative('native.f2fd6a3c4899d482');
    case 'scanning': return translateNative('native.9bd10a10034e60c7');
    case 'lookup': return translateNative('native.82734108a1e1c82a');
    case 'not_found': return translateNative('native.60d042b242a12a17');
    case 'found': return translateNative('native.f1522078b548271d');
    case 'duplicate': return translateNative('native.56a92fea627c7d2c');
    case 'error': return phase.message;
    case 'cancelled': return translateNative('native.1fb8f43bb5c86145');
  }
}

export function NfcInventoryScanModal({
  visible,
  onClose,
  onAdd,
  onEdit,
  onAssign,
  _toast,
  spoolman = false,
}: NfcInventoryScanModalProps) {
  useNativeLocale();
  const { colors } = useTheme();
  const nfc = useNfc();
  const isMountedRef = useRef(false);
  const scanSessionRef = useRef(0);
  const isProcessingRef = useRef(false);

  const [phase, setPhase] = useState<ScanPhase>({ phase: 'checking' });
  const [_retryCount, _setRetryCount] = useState(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (visible) {
      if (nfc.status === 'unsupported') {
        setPhase({ phase: 'unsupported' });
      } else if (nfc.status === 'disabled') {
        setPhase({ phase: 'disabled' });
      } else if (nfc.status === 'ready') {
        setPhase({ phase: 'ready' });
      } else if (nfc.status === 'reading') {
        setPhase({ phase: 'scanning' });
      } else {
        setPhase({ phase: 'error', get message() { return translateNative('native.111d3913eb1a77d7'); } });
      }
    }
  }, [visible, nfc.status]);

  const handleStartScan = useCallback(async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    scanSessionRef.current += 1;
    const sessionToken = scanSessionRef.current;

    try {
      setPhase({ phase: 'scanning' });

      const result = await nfc.readTag();

      if (!isMountedRef.current || sessionToken !== scanSessionRef.current) return;

      if (result.status === 'success') {
        setPhase({ phase: 'lookup', uid: result.uid });
        const lookupResult = await inventoryApi.lookupSpoolByUid(result.uid, spoolman);
        if (!isMountedRef.current || sessionToken !== scanSessionRef.current) return;

        if (lookupResult.kind === 'found') {
          setPhase({ phase: 'found', spool: lookupResult.spool });
        } else if (lookupResult.kind === 'duplicate_matches') {
          setPhase({ phase: 'duplicate', spools: lookupResult.spools, uid: lookupResult.uid });
        } else if (lookupResult.kind === 'not_found') {
          setPhase({ phase: 'not_found', uid: lookupResult.uid });
        } else {
          setPhase({ phase: 'error', message: lookupResult.message });
        }
      } else if (result.status === 'cancelled' || result.status === 'timeout') {
        setPhase({ phase: 'cancelled' });
      } else {
        setPhase({ phase: 'error', message: result.status === 'read_error' ? translateNative('native.0c812d53400b09f0') : result.status });
      }
    } catch {
      if (isMountedRef.current && sessionToken === scanSessionRef.current) {
        setPhase({ phase: 'error', get message() { return translateNative('native.111d3913eb1a77d7'); } });
      }
    } finally {
      isProcessingRef.current = false;
    }
  }, [nfc, spoolman]);

  const handleCancelScan = useCallback(() => {
    scanSessionRef.current += 1;
    setPhase({ phase: 'cancelled' });
    nfc.cancelRead();
  }, [nfc]);

  const handleRetry = useCallback(() => {
    _setRetryCount(prev => prev + 1);
    handleStartScan();
  }, [handleStartScan]);

  const handleAddToInventory = useCallback(() => {
    const uid = (() => {
      if (phase.phase === 'not_found') return phase.uid;
      if (phase.phase === 'duplicate') return phase.uid;
      return '';
    })();
    if (uid) {
      onAdd(uid);
    }
  }, [phase, onAdd]);

  const handleEditSpool = useCallback(() => {
    if (phase.phase === 'found') {
      onEdit(phase.spool);
    }
  }, [phase, onEdit]);

  const handleAssignSpool = useCallback(() => {
    if (phase.phase === 'found') {
      onAssign(phase.spool);
    }
  }, [phase, onAssign]);

  const handleScanAnother = useCallback(() => {
    setPhase({ phase: 'ready' });
    setTimeout(() => {
      handleStartScan();
    }, 300);
  }, [handleStartScan]);

  const handleDone = useCallback(() => {
    onClose();
  }, [onClose]);

  // When modal opens, move focus and announce
  useEffect(() => {
    if (visible && phase.phase !== 'checking' && phase.phase !== 'scanning' && phase.phase !== 'lookup') {
      try {
        AccessibilityInfo.announceForAccessibility(scanDescription(phase));
      } catch {
        // AccessibilityInfo may not be available
      }
    }
  }, [visible, phase, scanSessionRef]);

  // If modal becomes hidden, reset to ready
  useEffect(() => {
    if (!visible && isMountedRef.current) {
      setPhase({ phase: 'ready' });
      scanSessionRef.current += 1;
    }
  }, [visible]);

  // Compute actions based on phase
  const actions = useLocalizedMemo((): Array<{
    label: string;
    onPress: () => void;
    disabled: boolean;
    secondary?: boolean;
    loading?: boolean;
  }> => {
    if (phase.phase === 'ready') {
      return [{ get label() { return translateNative('native.dfa42b6b4a8ceb18'); }, onPress: handleStartScan, disabled: isProcessingRef.current }];
    }
    if (phase.phase === 'scanning' || phase.phase === 'lookup') {
      return [
        { get label() { return translateNative('common.cancel'); }, onPress: handleCancelScan, disabled: false }
      ];
    }
    if (phase.phase === 'not_found') {
      return [
        { get label() { return translateNative('native.66e8fed372985bb5'); }, onPress: handleAddToInventory, disabled: false },
        { get label() { return translateNative('native.9e3aed9ca27b49a5'); }, onPress: handleScanAnother, disabled: isProcessingRef.current },
        { get label() { return translateNative('native.7ab7b842cbd975a6'); }, onPress: handleDone, disabled: false, secondary: true },
      ];
    }
    if (phase.phase === 'duplicate') {
      return [
        { get label() { return translateNative('native.9e3aed9ca27b49a5'); }, onPress: handleScanAnother, disabled: isProcessingRef.current },
        { get label() { return translateNative('native.7ab7b842cbd975a6'); }, onPress: handleDone, disabled: false, secondary: true },
      ];
    }
    if (phase.phase === 'found') {
      return [
        { get label() { return translateNative('native.060e4f38051c717e'); }, onPress: handleEditSpool, disabled: false },
        { get label() { return translateNative('native.1dd4c6bd868053df'); }, onPress: handleAssignSpool, disabled: false },
        { get label() { return translateNative('native.9e3aed9ca27b49a5'); }, onPress: handleScanAnother, disabled: isProcessingRef.current },
        { get label() { return translateNative('native.7ab7b842cbd975a6'); }, onPress: handleDone, disabled: false, secondary: true },
      ];
    }
    if (phase.phase === 'error') {
      return [
        { get label() { return translateNative('common.retry'); }, onPress: handleRetry, disabled: isProcessingRef.current },
        { get label() { return translateNative('native.7ab7b842cbd975a6'); }, onPress: handleDone, disabled: false, secondary: true },
      ];
    }
    if (phase.phase === 'cancelled') {
      return [
        { get label() { return translateNative('native.1f08b975eae81786'); }, onPress: handleStartScan, disabled: isProcessingRef.current },
        { get label() { return translateNative('native.7ab7b842cbd975a6'); }, onPress: handleDone, disabled: false, secondary: true },
      ];
    }
    // unsupported / disabled / checking
    return [
      { get label() { return translateNative('native.7ab7b842cbd975a6'); }, onPress: handleDone, disabled: false, secondary: true },
    ];
  }, [phase, handleStartScan, handleCancelScan, handleAddToInventory, handleEditSpool, handleAssignSpool, handleScanAnother, handleDone, handleRetry, isProcessingRef]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleDone} presentationStyle="overFullScreen">
      <SafeAreaProvider>
      <SafeAreaView style={[styles.backdrop, { backgroundColor: colors.overlay }]} accessibilityViewIsModal={true}>
        <View
          style={[styles.card, { backgroundColor: colors.modalBg, borderColor: colors.border }]}
          accessibilityLabel={scanDescription(phase)}
        >
          {/* Status section */}
          <View style={styles.statusSection}>
            {phase.phase === 'scanning' && (
              <ActivityIndicator size="large" color={colors.accent} />
            )}
            {phase.phase === 'lookup' && (
              <ActivityIndicator size="large" color={colors.accent} />
            )}
            {phase.phase === 'found' && (
              <View style={[styles.statusIcon, { backgroundColor: `${colors.accent}20` }]}>
                <Check size={28} color={colors.accent} />
              </View>
            )}
            {phase.phase === 'not_found' && (
              <View style={[styles.statusIcon, { backgroundColor: `${colors.warning}20` }]}>
                <X size={28} color={colors.warning} />
              </View>
            )}
            {phase.phase === 'duplicate' && (
              <View style={[styles.statusIcon, { backgroundColor: `${colors.error}20` }]}>
                <Tag size={28} color={colors.error} />
              </View>
            )}
            {phase.phase === 'error' && (
              <View style={[styles.statusIcon, { backgroundColor: `${colors.error}20` }]}>
                <AlertCircle size={28} color={colors.error} />
              </View>
            )}
            {(phase.phase === 'unsupported' || phase.phase === 'disabled') && (
              <View style={[styles.statusIcon, { backgroundColor: `${colors.textSecondary}20` }]}>
                <CircleDashed size={28} color={colors.textSecondary} />
              </View>
            )}
            {(phase.phase === 'ready' || phase.phase === 'checking' || phase.phase === 'scanning' || phase.phase === 'lookup' || phase.phase === 'cancelled') && (
              <View style={[styles.statusIcon, { backgroundColor: `${colors.accent}20` }]}>
                <Tag size={28} color={colors.accent} />
              </View>
            )}
          </View>

          {/* Title and description */}
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={0}>
              {(() => {
                switch (phase.phase) {
                  case 'checking': return translateNative('native.f37a07f30d0a7976');
                  case 'unsupported': return translateNative('native.8cb7fd3b4df2d91a');
                  case 'disabled': return translateNative('native.d3a82babc0d66bc7');
                  case 'ready': return translateNative('native.c511750cbb9f6d49');
                  case 'scanning': return translateNative('native.5a290dcb50b14003');
                  case 'lookup': return translateNative('native.b3f8c48c4ccae90e');
                  case 'not_found': return translateNative('native.a525773013b4cb00');
                  case 'found': return translateNative('native.1ae994a808a386cd');
                  case 'duplicate': return translateNative('native.07ee170b69efcb80');
                  case 'error': return translateNative('native.0571baa7c7c6090d');
                  case 'cancelled': return translateNative('native.9db3fc60e37e4b35');
                }
              })()}
            </Text>
            <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={0}>
              {scanDescription(phase)}
            </Text>

            {/* Found spool details */}
            {phase.phase === 'found' && (
              <View style={styles.spoolDetails}>
                <Text style={[styles.spoolLabel, { color: colors.textSecondary }]}>
                  {pickString(phase.spool, ['brand'])}
                </Text>
                <Text style={[styles.spoolName, { color: colors.text }]}>
                  {pickString(phase.spool, ['material'])}
                  {' — '}
                  {pickString(phase.spool, ['color_name'])}
                </Text>
                {pickNumber(phase.spool, ['state']) !== null && (
                  <Text style={[styles.spoolState, { color: colors.accent }]}>
                    {pickNumber(phase.spool, ['state']) === 10 ? translateNative('native.09a6280015b8766a') : translateNative('native.338a8c40557b22a0')}
                  </Text>
                )}
              </View>
            )}

            {/* Duplicate spool list */}
            {phase.phase === 'duplicate' && (
              <View style={styles.duplicateList}>
                <Text style={[styles.spoolLabel, { color: colors.textSecondary }]} numberOfLines={0}><NativeTranslation id="native.f3b785a40965592c" values={{ value0: (phase.spools.length) }} /></Text>
                {phase.spools.map((spool) => (
                  <View key={pickNumber(spool, ['id'])} style={[styles.spoolItem, { borderColor: colors.border }]}>
                    <Text style={[styles.spoolName, { color: colors.text }]} numberOfLines={1}>
                      {pickString(spool, ['brand'])}
                      {' — '}
                      {pickString(spool, ['material'])}
                      {': '}
                      {pickString(spool, ['color_name'])}
                    </Text>
                    <Text style={[styles.spoolState, { color: colors.accent }]}>
                      {pickNumber(spool, ['state']) === 10 ? translateNative('native.09a6280015b8766a') : translateNative('native.338a8c40557b22a0')}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Actions */}
          <View style={styles.actionsContainer}>
            {actions.map((action) => (
              <Pressable
                key={action.label}
                onPress={action.onPress}
                disabled={action.disabled}
                style={[
                  styles.actionButton,
                  {
                    backgroundColor: action.secondary ? colors.surfaceElevated : colors.accent,
                    borderColor: action.secondary ? colors.border : colors.accent,
                  },
                  (action.disabled || action.loading) && styles.actionButtonLoading,
                ]}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                accessibilityState={{ disabled: action.disabled }}
                hitSlop={8}
              >
                {action.loading ? (
                  <ActivityIndicator size="small" color={action.secondary ? colors.text : colors.textInverse} />
                ) : (
                  <Text
                    style={[
                      styles.actionButtonText,
                      { color: action.secondary ? colors.text : colors.textInverse },
                      action.loading ? { opacity: 0 } : null,
                    ]}
                  >
                    {action.label}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
        </View>
      </SafeAreaView>
      </SafeAreaProvider>
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
  statusSection: {
    marginBottom: 16,
  },
  statusIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: fontSize.base,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
  },
  spoolDetails: {
    alignItems: 'center',
    marginBottom: 16,
  },
  spoolLabel: {
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  spoolName: {
    fontSize: fontSize.base,
    fontWeight: '600',
    marginTop: 2,
  },
  spoolState: {
    fontSize: fontSize.xs,
    fontWeight: '500',
    marginTop: 4,
  },
  duplicateList: {
    width: '100%',
    marginBottom: 16,
  },
  spoolItem: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 4,
  },
  actionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
  },
  actionButton: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 120,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 44,
  },
  actionButtonLoading: {
    opacity: 0.7,
  },
  actionButtonText: {
    fontSize: fontSize.base,
    fontWeight: '600',
  },
});
