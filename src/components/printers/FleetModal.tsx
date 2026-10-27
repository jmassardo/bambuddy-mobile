import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/common/AppUI';
import { useTheme } from '@/theme';
import { borderRadius, spacing, fontSize } from '@/theme/tokens';
import { useTranslation } from '@/i18n';

export function FleetModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.modalBg }]}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          <PrimaryButton
            label={t('common.close', { defaultValue: 'Close' })}
            onPress={onClose}
            variant="secondary"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  card: {
    maxHeight: '90%',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { fontSize: fontSize.xl },
  content: { gap: spacing.md },
});
