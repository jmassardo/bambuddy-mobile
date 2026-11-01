import { useNativeLocale, useTranslation } from '@/i18n';
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton, SectionCard } from '@/components/common/AppUI';
import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { announcementText, isAllowedAnnouncementLink, useAnnouncements } from '@/hooks/useAnnouncements';

import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import { formatDate } from '@/utils/data';
import type { Announcement } from '@/types/api';

export default function AnnouncementsScreen({ route }: { route?: { params?: { id?: string } } }) {
  useNativeLocale();
  const { t, language } = useTranslation();
  const { colors } = useTheme();
  const inbox = useAnnouncements();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showEarlier, setShowEarlier] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const focused = useRef<string | undefined>(undefined);
  const focusId = route?.params?.id;
  useEffect(() => {
    const item = inbox.announcements.find(candidate => candidate.id === focusId);
    if (!item || focused.current === item.id) return;
    focused.current = item.id;
    setExpanded(new Set([item.id]));
    if (item.archived) setShowEarlier(true);
    if (!item.read && !item.archived) void inbox.markRead(item.id).catch(() => {});
  }, [focusId, inbox]);
  function toggle(item: Announcement) {
    setExpanded(previous => {
      const next = new Set(previous);
      if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
      return next;
    });
    if (!expanded.has(item.id) && !item.read && !item.archived) void inbox.markRead(item.id).catch(() => {});
  }
  if (inbox.query.isLoading) return <LoadingScreen message={t('common.loading')} />;
  if (inbox.query.isError) return <ErrorState message={t('common.error')} onRetry={() => { void inbox.query.refetch(); }} />;
  if (!inbox.visible) return <EmptyState title={t('announcements.title')} message={t('announcements.hidden')} />;

  function renderItem(item: Announcement) {
    const message = announcementText(item, language);
    const open = expanded.has(item.id);
    return (
      <SectionCard key={item.id}>
        <Pressable onPress={() => toggle(item)} accessibilityRole="button" accessibilityState={{ expanded: open }}
          accessibilityLabel={`${message.title}, ${t(`announcements.${item.level}`)}${!item.read && !item.archived ? `, ${t('announcements.unread')}` : ''}`}>
          <Text style={[styles.title, { color: colors.text }]}>{message.title}</Text>
          <Text style={{ color: item.level === 'critical' ? colors.error : colors.textSecondary }}>
            {t(`announcements.${item.level}`)} · {item.published_at ? formatDate(item.published_at) : '—'}
            {!item.read && !item.archived ? ` · ${t('announcements.unread')}` : ''}
          </Text>
        </Pressable>
        {open ? <>
          <Text selectable style={{ color: colors.text }}>{message.body}</Text>
          {isAllowedAnnouncementLink(item.link_url) ? <PrimaryButton
            label={message.link_label || t('announcements.readMore')} variant="secondary"
            onPress={() => { void Linking.openURL(item.link_url!).catch(() => setLinkError(true)); }} /> : null}
          {!item.archived && !item.read ? <PrimaryButton label={t('announcements.gotIt')} loading={inbox.isMarkingRead}
            onPress={() => { void inbox.markRead(item.id).catch(() => {}); }} /> : null}
        </> : null}
      </SectionCard>
    );
  }
  return (
    <ScrollView style={[styles.screen, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={inbox.query.isRefetching} onRefresh={() => { void inbox.query.refetch(); }} />}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{t('announcements.title')}</Text>
      {(inbox.readError || linkError) ? <Text accessibilityRole="alert" style={{ color: colors.error }}>{t('common.error')}</Text> : null}
      {inbox.current.length ? inbox.current.map(renderItem) : <EmptyState title={t('announcements.empty')} />}
      {inbox.earlier.length ? <View style={styles.content}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showEarlier }}
          accessibilityLabel={`${t('announcements.earlier')} (${inbox.earlier.length})`}
          style={[styles.historyToggle, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
          onPress={() => setShowEarlier(value => !value)}>
          <Text style={{ color: colors.text }}>{t('announcements.earlier')} ({inbox.earlier.length})</Text>
        </Pressable>
        {showEarlier ? inbox.earlier.map(renderItem) : null}
      </View> : null}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 18, fontWeight: '600' },
  historyToggle: { borderWidth: 1, borderRadius: 8, padding: spacing.md, minHeight: 44 },
});
