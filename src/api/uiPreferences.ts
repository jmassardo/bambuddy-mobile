import { request } from './http';
import type { UiDisplayPreferences, UiFlags, UiNavigationPreferences } from '@/types/api';

export const uiPreferencesApi = {
  getDisplayPreferences: () => request<UiDisplayPreferences>('/settings/ui-preferences'),
  getFlags: () => request<UiFlags>('/settings/ui-flags'),
  getNavigationOrder: () => request<UiNavigationPreferences>('/settings/default-sidebar-order'),
};
