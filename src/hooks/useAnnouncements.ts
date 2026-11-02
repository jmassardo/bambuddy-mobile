import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { announcementsApi } from '@/api/announcements';
import { useServerStore } from '@/api/server';
import { useAuth } from '@/contexts/AuthContext';
import type { Announcement, AnnouncementList, AnnouncementText } from '@/types/api';

export function isAllowedAnnouncementLink(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password &&
      (!parsed.port || parsed.port === '443') &&
      ['github.com', 'bambuddy.cool'].some(host => parsed.hostname.toLowerCase() === host || parsed.hostname.toLowerCase().endsWith(`.${host}`));
  } catch { return false; }
}

export function announcementText(item: Announcement, language: string): AnnouncementText {
  const keys = Object.keys(item.texts);
  const normalized = language.toLowerCase();
  const key = keys.find(value => value.toLowerCase() === normalized) ??
    keys.find(value => value.toLowerCase().split('-')[0] === normalized.split('-')[0]) ?? 'en';
  return item.texts[key] ?? { title: item.id, body: '' };
}

export function announcementGroups(items: Announcement[]) {
  const current = items.filter(item => !item.archived);
  const earlier = items.filter(item => item.archived);
  const unread = current.filter(item => !item.read);
  const severity = { critical: 2, important: 1, info: 0 };
  const bannerItems = unread.filter(item => item.level !== 'info').sort((a, b) =>
    severity[b.level] - severity[a.level] || (b.published_at ?? '').localeCompare(a.published_at ?? ''));
  return { current, earlier, unread, bannerItems };
}

export function useAnnouncements() {
  const { authEnabled, user, loading } = useAuth();
  const serverUrl = useServerStore(state => state.serverUrl);
  const enabled = Boolean(serverUrl) && !loading && (!authEnabled || Boolean(user));
  const queryClient = useQueryClient();
  const queryKey = ['announcements', serverUrl, user?.id ?? 'anonymous'];
  const query = useQuery({
    queryKey, queryFn: announcementsApi.list, enabled,
    staleTime: 5 * 60 * 1000, refetchInterval: 10 * 60 * 1000,
  });
  const mutation = useMutation({
    mutationFn: announcementsApi.markRead,
    onSuccess: (_data, id) => {
      queryClient.setQueryData<AnnouncementList>(queryKey, old => old ? {
        ...old, announcements: old.announcements.map(item => item.id === id ? { ...item, read: true } : item),
      } : old);
    },
  });
  const visible = enabled && query.data?.visible === true;
  const announcements = visible ? query.data?.announcements ?? [] : [];
  return {
    ...announcementGroups(announcements), announcements, visible, query,
    markRead: mutation.mutateAsync, isMarkingRead: mutation.isPending, readError: mutation.error,
  };
}
