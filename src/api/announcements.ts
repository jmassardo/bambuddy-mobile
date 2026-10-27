import { request } from './http';
import type { AnnouncementList } from '@/types/api';

export const announcementsApi = {
  list: () => request<AnnouncementList>('/announcements'),
  markRead: (id: string) => request<void>(`/announcements/${encodeURIComponent(id)}/read`, { method: 'POST' }),
};
