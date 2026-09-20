import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { X } from 'lucide-react-native';
import { PrimaryButton, StatusBadge } from '@/components/common/AppUI';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import type { CloudProfileDetail } from '@/types/api';
import { formatDateTime, statusColor } from '@/utils/data';

interface CloudProfileDetailModalProps {
  visible: boolean;
  profileName: string;
  detail: CloudProfileDetail | null;
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  onClose: () => void;
}

function detailValue(value: unknown): string {
  if (value == null) return '—';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  const asString = String(value).trim();
  return asString || '—';
}

export function CloudProfileDetailModal({
  visible,
  profileName,
  detail,
  isLoading,
  errorMessage,
  onRetry,
  onClose,
}: CloudProfileDetailModalProps) {
  const { colors } = useTheme();

  const settingEntries = detail?.setting
    ? Object.entries(detail.setting).slice(0, 40)
    : [];

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
                Profile details
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {profileName}
              </Text>
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
              Loading profile details…
            </Text>
          ) : errorMessage ? (
            <View style={styles.messageWrap}>
              <Text style={[styles.message, { color: colors.error }]}>
                {errorMessage}
              </Text>
              <PrimaryButton label="Retry" variant="secondary" onPress={onRetry} />
            </View>
          ) : detail ? (
            <ScrollView contentContainerStyle={styles.content}>
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>
                  Type
                </Text>
                <StatusBadge
                  label={detail.type || 'unknown'}
                  color={statusColor(detail.type || 'offline', colors)}
                />
              </View>
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>
                  Version
                </Text>
                <Text style={[styles.metaValue, { color: colors.text }]}>
                  {detailValue(detail.version)}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>
                  Updated
                </Text>
                <Text style={[styles.metaValue, { color: colors.text }]}>
                  {formatDateTime(detail.update_time)}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>
                  Base profile
                </Text>
                <Text style={[styles.metaValue, { color: colors.text }]}>
                  {detailValue(detail.base_id)}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>
                  Setting ID
                </Text>
                <Text style={[styles.metaValue, { color: colors.text }]}>
                  {detailValue(detail.setting_id)}
                </Text>
              </View>

              <View
                style={[
                  styles.section,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Setting values
                </Text>
                {settingEntries.length === 0 ? (
                  <Text style={[styles.sectionEmpty, { color: colors.textSecondary }]}>
                    No setting values returned by the server.
                  </Text>
                ) : (
                  settingEntries.map(([key, value]) => (
                    <View
                      key={key}
                      style={[
                        styles.settingRow,
                        { borderBottomColor: colors.borderSubtle },
                      ]}
                    >
                      <Text
                        style={[styles.settingKey, { color: colors.textSecondary }]}
                      >
                        {key}
                      </Text>
                      <Text style={[styles.settingValue, { color: colors.text }]}>
                        {detailValue(value)}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          ) : (
            <Text style={[styles.message, { color: colors.textSecondary }]}>
              Select a profile to view details.
            </Text>
          )}

          <PrimaryButton label="Close" variant="secondary" onPress={onClose} />
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
  content: {
    gap: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  metaLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  metaValue: {
    fontSize: fontSize.sm,
    flex: 1,
    textAlign: 'right',
  },
  section: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  sectionEmpty: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  settingRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  settingKey: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  settingValue: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  messageWrap: {
    gap: spacing.sm,
  },
  message: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});
