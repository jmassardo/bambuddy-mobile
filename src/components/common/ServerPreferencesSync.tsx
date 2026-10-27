import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '@/api/settings';
import { uiPreferencesApi } from '@/api/uiPreferences';
import { useAuth } from '@/contexts/AuthContext';
import { useServerStore } from '@/api/server';
import { useTheme } from '@/theme';
import { sanitizeTheme } from '@/theme/preferences';
import { setFormattingPreferences } from '@/utils/preferences';
import { useUiPreferencesStore } from '@/store/uiPreferencesStore';

/** Mount once under AuthProvider, QueryClientProvider and ThemeProvider. */
export function ServerPreferencesSync() {
  const { authEnabled, user, loading, hasPermission } = useAuth();
  const serverUrl = useServerStore(state => state.serverUrl);
  const { setCustomization } = useTheme();
  const queryClient = useQueryClient();
  const previousPolicy = useRef<string | null>(null);
  const enabled = Boolean(serverUrl) && !loading && (!authEnabled || Boolean(user));
  const canReadSettings = !authEnabled || hasPermission('settings:read');
  const { data } = useQuery({
    queryKey: ['settings'], queryFn: settingsApi.getSettings,
    enabled: enabled && canReadSettings,
  });
  const { data: display } = useQuery({
    queryKey: ['uiPreferences', serverUrl], queryFn: uiPreferencesApi.getDisplayPreferences, enabled,
  });
  const { data: flags } = useQuery({
    queryKey: ['uiFlags', serverUrl], queryFn: uiPreferencesApi.getFlags, enabled,
  });
  useEffect(() => { void useUiPreferencesStore.getState().load().catch(() => {}); }, []);
  useEffect(() => {
    setFormattingPreferences({
      dateFormat: enabled ? (canReadSettings ? data?.date_format : undefined) ?? display?.date_format ?? 'system' : 'system',
      timeFormat: enabled ? (canReadSettings ? data?.time_format : undefined) ?? display?.time_format ?? 'system' : 'system',
      currency: enabled ? (canReadSettings ? data?.currency : undefined) || flags?.currency || 'USD' : 'USD',
    });
  }, [data, display, flags, enabled, canReadSettings]);
  useEffect(() => {
    if (enabled && canReadSettings && data) void setCustomization(sanitizeTheme(data)).catch(() => {});
  }, [data, enabled, canReadSettings, setCustomization]);
  const hasSettings = Boolean(data);
  const announcementsEnabled = data?.announcements_enabled;
  const announcementsAllUsers = data?.announcements_all_users;
  useEffect(() => {
    if (!enabled || !canReadSettings || !hasSettings) {
      previousPolicy.current = null;
      return;
    }
    const policy = JSON.stringify([announcementsEnabled, announcementsAllUsers]);
    if (previousPolicy.current !== null && previousPolicy.current !== policy) {
      void queryClient.invalidateQueries({ queryKey: ['announcements'] });
    }
    previousPolicy.current = policy;
  }, [enabled, canReadSettings, hasSettings, announcementsEnabled, announcementsAllUsers, queryClient]);
  return null;
}
