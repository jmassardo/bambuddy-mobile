import React from 'react';
import { Linking } from 'react-native';
import { act, cleanup, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { announcementsApi } from '@/api/announcements';
import { settingsApi } from '@/api/settings';
import { uiPreferencesApi } from '@/api/uiPreferences';
import * as http from '@/api/http';
import { useServerStore } from '@/api/server';
import { announcementGroups, announcementText, isAllowedAnnouncementLink, useAnnouncements } from '@/hooks/useAnnouncements';
import { AnnouncementBanner, AnnouncementsEntry } from '@/components/common/AnnouncementBanner';
import { ServerPreferencesSync } from '@/components/common/ServerPreferencesSync';
import AnnouncementsScreen from '@/screens/AnnouncementsScreen';
import { LANGUAGE_STORAGE_KEY, LocalizationProvider } from '@/i18n';
import { ThemeProvider } from '@/theme';
import type { Announcement } from '@/types/api';

const mockAuth = { authEnabled: false, user: null, loading: false };
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('react-native/Libraries/Linking/Linking', () => ({
  __esModule: true,
  default: { openURL: jest.fn(async () => {}), canOpenURL: jest.fn(async () => true) },
}));
const item: Announcement = {
  id: 'release/2026', level: 'important', published_at: '2026-10-25T10:00:00',
  expires_at: null, archived: false, read: false,
  texts: { en: { title: 'Release notes', body: 'Important release details' }, fr: { title: 'Notes de version', body: 'Détails de la version', link_label: 'Documentation' } },
  link_url: 'https://wiki.bambuddy.cool/releases/',
};
const archived: Announcement = { ...item, id: 'old', archived: true, texts: { en: { title: 'Old message', body: 'Earlier details' } } };
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}><LocalizationProvider><ThemeProvider>{children}</ThemeProvider></LocalizationProvider></QueryClientProvider>;
  }
  return { client, wrapper: Wrapper };
}
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.authEnabled = false;
  mockAuth.loading = false;
  useServerStore.setState({ serverUrl: 'https://farm.example' });
  jest.mocked(AsyncStorage.getItem).mockImplementation(async key => key === LANGUAGE_STORAGE_KEY ? 'en' : null);
});
afterEach(async () => {
  await cleanup();
  for (const client of clients.splice(0)) client.clear();
  jest.restoreAllMocks();
});

it('uses the dedicated server feed/read endpoint and URL-encodes public IDs', async () => {
  const request = jest.spyOn(http, 'request').mockResolvedValue(undefined);
  await announcementsApi.list();
  expect(request).toHaveBeenCalledWith('/announcements');
  await announcementsApi.markRead('release/2026');
  expect(request).toHaveBeenCalledWith('/announcements/release%2F2026/read', { method: 'POST' });
});

it('localizes content with language fallback and excludes history from unread and severity banners', () => {
  expect(announcementText(item, 'FR').title).toBe('Notes de version');
  expect(announcementText(item, 'fr-CA').title).toBe('Notes de version');
  expect(announcementText(item, 'ja').title).toBe('Release notes');
  const critical = { ...item, id: 'critical', level: 'critical' as const };
  const groups = announcementGroups([item, archived, critical, { ...item, id: 'info', level: 'info' }]);
  expect(groups.unread.map(message => message.id)).toEqual([item.id, 'critical', 'info']);
  expect(groups.bannerItems.map(message => message.id)).toEqual(['critical', item.id]);
  expect(groups.earlier).toEqual([archived]);
});

it.each([
  ['https://github.com/bambuddy/releases', true],
  ['https://wiki.bambuddy.cool/announcements', true],
  ['https://github.com.evil.example/', false],
  ['https://evilgithub.com/', false],
  ['http://github.com/', false],
  ['https://user:password@github.com/', false],
  ['https://github.com:444/', false],
  ['data:text/html,untrusted', false],
])('checks announcement link %s', (url, allowed) => {
  expect(isAllowedAnnouncementLink(url)).toBe(allowed);
});

it('honors server visibility even if a response includes messages, and waits for authentication', async () => {
  const list = jest.spyOn(announcementsApi, 'list').mockResolvedValue({ visible: false, announcements: [item] });
  const { wrapper, client } = setup();
  const hook = await renderHook(() => useAnnouncements(), { wrapper });
  await waitFor(() => expect(hook.result.current.query.isSuccess).toBe(true));
  expect(hook.result.current.visible).toBe(false);
  expect(hook.result.current.unread).toEqual([]);
  await hook.unmount();
  client.clear();
  list.mockClear();
  mockAuth.authEnabled = true;
  const gated = await renderHook(() => useAnnouncements(), { wrapper });
  expect(list).not.toHaveBeenCalled();
  expect(gated.result.current.visible).toBe(false);
  await gated.unmount();
  client.clear();
});

it('keeps acknowledgement failures unread and updates server-confirmed read state across consumers', async () => {
  jest.spyOn(announcementsApi, 'list').mockResolvedValue({ visible: true, announcements: [item, archived] });
  const markRead = jest.spyOn(announcementsApi, 'markRead').mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  const { wrapper, client } = setup();
  const hook = await renderHook(() => useAnnouncements(), { wrapper });
  await waitFor(() => expect(hook.result.current.unread).toHaveLength(1));
  await act(async () => { await hook.result.current.markRead(item.id).catch(() => {}); });
  expect(hook.result.current.unread).toHaveLength(1);
  await waitFor(() => expect(hook.result.current.readError).toBeTruthy());
  await act(async () => { await hook.result.current.markRead(item.id); });
  await waitFor(() => expect(hook.result.current.unread).toHaveLength(0));
  expect(markRead).toHaveBeenCalledTimes(2);
  expect(hook.result.current.earlier).toHaveLength(1);
  await hook.unmount();
  client.clear();
});

it('shows a severity banner and inbox count, opens the selected message, and acknowledges Got it', async () => {
  jest.spyOn(announcementsApi, 'list').mockResolvedValue({ visible: true, announcements: [item, archived] });
  const markRead = jest.spyOn(announcementsApi, 'markRead').mockResolvedValue(undefined);
  const onReadMore = jest.fn();
  const onPress = jest.fn();
  const { wrapper, client } = setup();
  const screen = await render(<><AnnouncementBanner onReadMore={onReadMore} /><AnnouncementsEntry onPress={onPress} /></>, { wrapper });
  await waitFor(() => expect(screen.getByText('Important: Release notes')).toBeTruthy());
  expect(screen.getByText('1')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Announcements'));
  expect(onPress).toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText('Read more'));
  expect(onReadMore).toHaveBeenCalledWith(item.id);
  await fireEvent.press(screen.getByLabelText('Got it'));
  await waitFor(() => expect(markRead).toHaveBeenCalledWith(item.id, expect.anything()));
  await waitFor(() => expect(screen.queryByText('Important: Release notes')).toBeNull());
  expect(screen.getByText('0')).toBeTruthy();
  await screen.unmount();
  client.clear();
});

it('renders localized expandable native content, allowed links, and earlier-message history', async () => {
  jest.mocked(AsyncStorage.getItem).mockImplementation(async key => key === LANGUAGE_STORAGE_KEY ? 'fr' : null);
  jest.spyOn(announcementsApi, 'list').mockResolvedValue({ visible: true, announcements: [item, archived] });
  const markRead = jest.spyOn(announcementsApi, 'markRead').mockResolvedValue(undefined);
  const { wrapper, client } = setup();
  const screen = await render(<AnnouncementsScreen route={{ params: { id: item.id } }} />, { wrapper });
  await waitFor(() => expect(screen.getByText('Détails de la version')).toBeTruthy());
  expect(markRead).toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText('Documentation'));
  await waitFor(() => expect(Linking.openURL).toHaveBeenCalledWith(item.link_url));
  expect(screen.queryByText('Old message')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Précédentes (1)'));
  expect(screen.getByText('Old message')).toBeTruthy();
  expect(markRead).not.toHaveBeenCalledWith('old', expect.anything());
  await screen.unmount();
  client.clear();
});

it('refreshes visibility immediately after an authorized policy save', async () => {
  const settings = { announcements_enabled: true, announcements_all_users: false } as Awaited<ReturnType<typeof settingsApi.getSettings>>;
  jest.spyOn(settingsApi, 'getSettings').mockResolvedValue(settings);
  jest.spyOn(uiPreferencesApi, 'getDisplayPreferences').mockResolvedValue({ date_format: 'system', time_format: 'system' });
  jest.spyOn(uiPreferencesApi, 'getFlags').mockResolvedValue({ currency: 'USD', billing_enabled: false, check_updates: true, user_notifications_enabled: true });
  const list = jest.spyOn(announcementsApi, 'list')
    .mockResolvedValueOnce({ visible: true, announcements: [item] })
    .mockResolvedValue({ visible: false, announcements: [] });
  const { wrapper, client } = setup();
  const screen = await render(<><ServerPreferencesSync /><AnnouncementBanner onReadMore={() => {}} /></>, { wrapper });
  await waitFor(() => expect(screen.getByText('Important: Release notes')).toBeTruthy());
  await act(async () => { client.setQueryData(['settings'], { ...settings, announcements_enabled: false }); });
  await waitFor(() => expect(screen.queryByText('Important: Release notes')).toBeNull());
  expect(list).toHaveBeenCalledTimes(2);
  await screen.unmount();
  client.clear();
});
