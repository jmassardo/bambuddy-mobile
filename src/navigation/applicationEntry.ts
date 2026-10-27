import { landingNavigationState } from '@/store/uiPreferencesStore';
import type { BuiltInNavId, BuiltInNavigationItem } from './navigationConfig';
import type { RootStackParamList } from './types';

export function parseConnectAuthorizeLink(url: string): RootStackParamList['ConnectAuthorize'] | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'bambuddy:' || parsed.hostname !== 'connect' || parsed.pathname !== '/authorize') return null;
    const get = (name: string) => {
      const values = parsed.searchParams.getAll(name);
      return values.length === 1 ? values[0] : null;
    };
    const client_id = get('client_id');
    const redirect_uri = get('redirect_uri');
    const code_challenge = get('code_challenge');
    if (!client_id?.trim() || !redirect_uri?.trim() || !code_challenge?.trim() || get('code_challenge_method') !== 'S256') return null;
    if (parsed.searchParams.getAll('state').length > 1) return null;
    const state = get('state');
    return { client_id, redirect_uri, code_challenge, code_challenge_method: 'S256', ...(state !== null ? { state } : {}) };
  } catch {
    return null;
  }
}

export function applicationLandingState(value: BuiltInNavId, items: readonly BuiltInNavigationItem[]) {
  const allowed = items.map(item => item.id);
  const state = landingNavigationState(value, allowed);
  // The preference resolver defaults to Dashboard, but a role or custom layout
  // may remove that tab. Never construct a state pointing at an absent screen.
  const mainTab = items.find(item => item.id === 'dashboard')?.tabRoute ??
    items.find(item => item.tabRoute)?.tabRoute ?? 'More';
  return {
    ...state,
    routes: state.routes.map(route => route.name === 'Main'
      ? { ...route, params: { screen: route.params?.screen && items.some(item => item.tabRoute === route.params?.screen) ? route.params.screen : mainTab } }
      : route),
  };
}
