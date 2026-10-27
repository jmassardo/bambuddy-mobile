import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { uiPreferencesApi } from '@/api/uiPreferences';
import { useAuth } from '@/contexts/AuthContext';
import { useServerStore } from '@/api/server';
import { canAccessNavigationItem, getNavigationLayout } from './navigationConfig';

export function useNavigationItems() {
  const { user, authEnabled, loading, requiresSetup, hasPermission } = useAuth();
  const serverUrl = useServerStore(state => state.serverUrl);
  const enabled = Boolean(serverUrl) && !loading && !requiresSetup && (!authEnabled || Boolean(user));
  const canReadSettings = enabled && hasPermission('settings:read');
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
    enabled: canReadSettings,
  });
  const flags = useQuery({
    queryKey: ['uiFlags', serverUrl],
    queryFn: uiPreferencesApi.getFlags,
    enabled,
  });
  const access = {
    hasPermission,
    authenticatedUser: Boolean(user),
    billingEnabled: flags.data?.billing_enabled === true,
  };
  const layout = getNavigationLayout({ defaultSidebarOrder: canReadSettings ? settings.data?.default_sidebar_order : undefined });
  return {
    access,
    items: layout.orderedBuiltIns.filter(item => canAccessNavigationItem(item, access)),
    loading: (canReadSettings && settings.isPending) || (enabled && flags.isPending),
  };
}
