import { useQuery } from '@tanstack/react-query';
import { uiPreferencesApi } from '@/api/uiPreferences';
import { useAuth } from '@/contexts/AuthContext';
import { useServerStore } from '@/api/server';
import { canAccessNavigationItem, getNavigationLayout } from './navigationConfig';

export function useNavigationItems() {
  const { user, authEnabled, loading, requiresSetup, hasPermission } = useAuth();
  const serverUrl = useServerStore(state => state.serverUrl);
  const enabled = Boolean(serverUrl) && !loading && !requiresSetup && (!authEnabled || Boolean(user));
  const navigation = useQuery({
    queryKey: ['navigationOrder', serverUrl],
    queryFn: uiPreferencesApi.getNavigationOrder,
    enabled,
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
  const layout = getNavigationLayout({ defaultSidebarOrder: navigation.data?.default_sidebar_order });
  return {
    access,
    items: layout.orderedBuiltIns.filter(item => canAccessNavigationItem(item, access)),
    loading: enabled && (navigation.isPending || flags.isPending),
  };
}
