import { useNativeLocale, useTranslation } from '@/i18n';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton, SettingRow } from './AppUI';
import { announcementText, useAnnouncements } from '@/hooks/useAnnouncements';

import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';

export function AnnouncementsEntry({ onPress }: { onPress: () => void }) {
  useNativeLocale();
  const { visible, unread } = useAnnouncements();
  const { t } = useTranslation();
  if (!visible) return null;
  return <SettingRow icon="bell" label={t('announcements.title')} value={String(unread.length)} onPress={onPress} />;
}

export function AnnouncementBanner({ onReadMore }: { onReadMore: (id: string) => void }) {
  useNativeLocale();
  const { bannerItems, markRead, isMarkingRead, readError } = useAnnouncements();
  const { t, language } = useTranslation();
  const { colors } = useTheme();
  const item = bannerItems[0];
  if (!item) return null;
  const message = announcementText(item, language);
  return (
    <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: item.level === 'critical' ? colors.error : colors.warning }]}>
      <Text accessibilityRole="alert" style={[styles.title, { color: colors.text }]}>
        {t(`announcements.${item.level}`)}: {message.title}
      </Text>
      <View style={styles.actions}>
        <PrimaryButton label={t('announcements.readMore')} variant="secondary" onPress={() => onReadMore(item.id)} />
        <PrimaryButton label={t('announcements.gotIt')} loading={isMarkingRead} onPress={() => { void markRead(item.id).catch(() => {}); }} />
      </View>
      {readError ? <Text accessibilityRole="alert" style={{ color: colors.error }}>{t('common.error')}</Text> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  banner: { borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  title: { fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
