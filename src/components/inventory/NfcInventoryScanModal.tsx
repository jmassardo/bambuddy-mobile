import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type ViewStyle,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Check, CircleDashed, Tag, X, AlertCircle } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { useNfc } from '@/hooks/useNfc';
import { inventoryApi } from '@/api/inventory';
import type { InventorySpool } from '@/types/api';
import { pickString, pickNumber } from '@/utils/data';
import { fontSize } from '@/theme/tokens';

export type NfcInventoryScanModalProps = {
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
    case 'checking': return 'Checking NFC capability...';
    case 'unsupported': return 'NFC is not supported on this device.';
    case 'disabled': return 'NFC is turned off. Please enable it to scan spool tags.';
    case 'ready': return 'Ready to scan. Hold a Bambu spool near your phone.';
    case 'scanning': return 'Reading NFC tag...';
    case 'lookup': return 'Checking inventory...';
    case 'not_found': return 'Spool not in inventory.';
    case 'found': return 'Spool found.';
    case 'duplicate': return 'Multiple spools use this tag.';
    case 'error': return 'Scan failed. Tap retry to try again.';
    case 'cancelled': return 'Scan cancelled.';
  }
}

export function NfcInventoryScanModal({
  visible,
  onClose,
  onAdd,
  onEdit,
  onAssign,
  _toast,
}: NfcInventoryScanModalProps) {
  const { colors } = useTheme();
  const nfc = useNfc();
  const isMountedRef = useRef(false);
  const scanSessionRef = useRef(0);
  const isProcessingRef = useRef(false);

  const [phase, setPhase] = useState<ScanPhase>({ phase: 'checking' });
  const [cardHeight, setCardHeight] = useState(0);
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
        setPhase({ phase: 'error', message: 'Scan failed. Tap retry to try again.' });
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
        const lookupResult = await inventoryApi.lookupSpoolByUid(result.uid);
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
        setPhase({ phase: 'error', message: result.status === 'read_error' ? 'Failed to read tag.' : result.status });
      }
    } catch {
      if (isMountedRef.current && sessionToken === scanSessionRef.current) {
        setPhase({ phase: 'error', message: 'Scan failed. Tap retry to try again.' });
      }
    } finally {
      isProcessingRef.current = false;
    }
  }, [nfc]);

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

  const maxHeight = Math.max(cardHeight + 80, 300);
  const cardStyle: ViewStyle = { maxHeight };

  // Compute actions based on phase
  const actions = useMemo((): Array<{
    label: string;
    onPress: () => void;
    disabled: boolean;
    destructive?: boolean;
    loading?: boolean;
  }> => {
    if (phase.phase === 'ready') {
      return [{ label: 'Scan RFID', onPress: handleStartScan, disabled: isProcessingRef.current }];
    }
    if (phase.phase === 'scanning' || phase.phase === 'lookup') {
      return [
        { label: 'Cancel', onPress: handleCancelScan, disabled: false }
      ];
    }
    if (phase.phase === 'not_found') {
      return [
        { label: 'Add to inventory', onPress: handleAddToInventory, disabled: false },
        { label: 'Scan another', onPress: handleScanAnother, disabled: isProcessingRef.current },
        { label: 'Done', onPress: handleDone, disabled: false, destructive: true },
      ];
    }
    if (phase.phase === 'duplicate') {
      return [
        { label: 'Scan another', onPress: handleScanAnother, disabled: isProcessingRef.current },
        { label: 'Done', onPress: handleDone, disabled: false, destructive: true },
      ];
    }
    if (phase.phase === 'found') {
      return [
        { label: 'Edit spool', onPress: handleEditSpool, disabled: false },
        { label: 'Assign to slot', onPress: handleAssignSpool, disabled: false },
        { label: 'Scan another', onPress: handleScanAnother, disabled: isProcessingRef.current },
        { label: 'Done', onPress: handleDone, disabled: false, destructive: true },
      ];
    }
    if (phase.phase === 'error') {
      return [
        { label: 'Retry', onPress: handleRetry, disabled: isProcessingRef.current },
        { label: 'Done', onPress: handleDone, disabled: false, destructive: true },
      ];
    }
    if (phase.phase === 'cancelled') {
      return [
        { label: 'Scan again', onPress: handleStartScan, disabled: isProcessingRef.current },
        { label: 'Done', onPress: handleDone, disabled: false, destructive: true },
      ];
    }
    // unsupported / disabled / checking
    return [
      { label: 'Done', onPress: handleDone, disabled: false, destructive: true },
    ];
  }, [phase, handleStartScan, handleCancelScan, handleAddToInventory, handleEditSpool, handleAssignSpool, handleScanAnother, handleDone, handleRetry, isProcessingRef]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleDone} presentationStyle="overFullScreen">
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]} accessibilityViewIsModal={true}>
        <View
          style={[styles.card, { backgroundColor: colors.modalBg, borderColor: colors.border }, cardStyle]}
          onLayout={(e: LayoutChangeEvent) => setCardHeight(e.nativeEvent.layout.height)}
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
                  case 'checking': return 'NFC Check';
                  case 'unsupported': return 'NFC Not Available';
                  case 'disabled': return 'NFC Disabled';
                  case 'ready': return 'Ready to Scan';
                  case 'scanning': return 'Reading Tag';
                  case 'lookup': return 'Checking Inventory';
                  case 'not_found': return 'Spool Not in Inventory';
                  case 'found': return 'Spool Found';
                  case 'duplicate': return 'Multiple Spools';
                  case 'error': return 'Scan Failed';
                  case 'cancelled': return 'Scan Cancelled';
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
                    {pickNumber(phase.spool, ['state']) === 10 ? 'Archived' : 'Active'}
                  </Text>
                )}
              </View>
            )}

            {/* Duplicate spool list */}
            {phase.phase === 'duplicate' && (
              <View style={styles.duplicateList}>
                <Text style={[styles.spoolLabel, { color: colors.textSecondary }]} numberOfLines={0}>
                  {phase.spools.length} spool(s) match this tag:
                </Text>
                {phase.spools.map((spool) => (
                  <View key={pickNumber(spool, ['id'])} style={styles.spoolItem}>
                    <Text style={[styles.spoolName, { color: colors.text }]} numberOfLines={1}>
                      {pickString(spool, ['brand'])}
                      {' — '}
                      {pickString(spool, ['material'])}
                      {': '}
                      {pickString(spool, ['color_name'])}
                    </Text>
                    <Text style={[styles.spoolState, { color: colors.accent }]}>
                      {pickNumber(spool, ['state']) === 10 ? 'Archived' : 'Active'}
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
                  action.destructive && styles.destructiveButton,
                  action.loading && styles.actionButtonLoading,
                ]}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                accessibilityState={{ disabled: action.disabled, checked: false }}
                hitSlop={8}
              >
                {action.loading ? (
                  <ActivityIndicator size="small" color={action.destructive ? colors.error : colors.textInverse} />
                ) : (
                  <Text
                    style={[
                      styles.actionButtonText,
                      action.destructive ? { color: colors.error } : { color: colors.textInverse },
                      action.destructive ? styles.destructiveButtonText : null,
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
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 4,
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 44,
  },
  destructiveButton: {
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
    borderColor: 'rgba(220, 38, 38, 0.3)',
  },
  actionButtonLoading: {
    opacity: 0.7,
  },
  actionButtonText: {
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  destructiveButtonText: {
  },
});
