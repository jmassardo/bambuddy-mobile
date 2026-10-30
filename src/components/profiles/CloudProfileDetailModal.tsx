import { translateNative, useNativeLocale, useTranslation } from '@/i18n';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { PrimaryButton, StatusBadge, TextField } from '@/components/common/AppUI';

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
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [raw, setRaw] = useState(false);
  useEffect(() => { if (visible) { setSearch(''); setRaw(false); } }, [visible, profileName]);

  const settingEntries = detail?.setting
    ? Object.entries(detail.setting).filter(([key, value]) => `${key} ${JSON.stringify(value)}`.toLowerCase().includes(search.toLowerCase()))
    : [];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaProvider>
      <KeyboardAvoidingView style={styles.viewport} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
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
                {translateNative('native.6b263d68c00d232f')}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {profileName}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('common.close', { defaultValue: 'Close' })}
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
              {translateNative('native.ef996d8d5f863551')}</Text>
          ) : errorMessage ? (
            <View style={styles.messageWrap}>
              <Text style={[styles.message, { color: colors.error }]}>
                {errorMessage}
              </Text>
              <PrimaryButton label={translateNative('common.retry')} variant="secondary" onPress={onRetry} />
            </View>
          ) : detail ? (
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <TextField label={t('profiles.searchSettings', { defaultValue: 'Search all setting values' })} value={search} onChangeText={setSearch} />
              <PrimaryButton label={raw ? t('profiles.showValues', { defaultValue: 'Show values' }) : t('profiles.showJson', { defaultValue: 'Show complete JSON' })} variant="secondary" onPress={() => setRaw(!raw)} />
              {raw ? <Text selectable style={[styles.settingValue, { color: colors.text }]}>{JSON.stringify(detail, null, 2)}</Text> : null}
              {Object.entries(detail).filter(([key]) => !['setting', 'name', 'type', 'version', 'base_id', 'setting_id', 'update_time'].includes(key)).map(([key, value]) => <View key={key} style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>{key}</Text>
                <Text selectable style={[styles.metaValue, { color: colors.text }]}>{detailValue(value)}</Text>
              </View>)}
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>
                  {translateNative('native.aeee596fdaf12076')}</Text>
                <StatusBadge
                  label={detail.type || translateNative('native.649d2a9c05f2b32c')}
                  color={statusColor(detail.type || 'offline', colors)}
                />
              </View>
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>
                  {translateNative('native.2c260e8a6631b5f2')}</Text>
                <Text style={[styles.metaValue, { color: colors.text }]}>
                  {detailValue(detail.version)}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>
                  {translateNative('native.579768fa26620d83')}</Text>
                <Text style={[styles.metaValue, { color: colors.text }]}>
                  {formatDateTime(detail.update_time)}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>
                  {translateNative('native.4f41a33dc60d80f4')}</Text>
                <Text style={[styles.metaValue, { color: colors.text }]}>
                  {detailValue(detail.base_id)}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>
                  {translateNative('native.6800b210eb95d6e3')}</Text>
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
                  {translateNative('native.beb8fc733d2135fe')}</Text>
                {settingEntries.length === 0 ? (
                  <Text style={[styles.sectionEmpty, { color: colors.textSecondary }]}>
                    {translateNative('native.d0a81c81d66f73c5')}</Text>
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
              {translateNative('native.31cbf50342d5ed96')}</Text>
          )}

          <PrimaryButton label={translateNative('common.close')} variant="secondary" onPress={onClose} />
        </View>
      </SafeAreaView>
      </KeyboardAvoidingView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1 },
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
    width: 44,
    height: 44,
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
