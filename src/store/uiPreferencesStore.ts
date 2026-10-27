import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BUILT_IN_NAV_ITEMS, type BuiltInNavId } from '@/navigation/navigationConfig';

export const LANDING_PAGE_KEY = '@bambuddy_mobile:landing_page';
const PRINTER_SORT_KEYS = ['bambuddy-printer-sort', 'bambuddy-printer-sort-secondary'];
export function resolveLandingPage(value: unknown, allowed?: readonly BuiltInNavId[]): BuiltInNavId {
  const item = BUILT_IN_NAV_ITEMS.find(candidate => candidate.id === value && candidate.id !== 'more');
  return item && (!allowed || allowed.includes(item.id)) ? item.id : 'dashboard';
}
export function landingNavigationState(value: unknown, allowed?: readonly BuiltInNavId[]) {
  const id = resolveLandingPage(value, allowed);
  const item = BUILT_IN_NAV_ITEMS.find(candidate => candidate.id === id)!;
  return item.tabRoute
    ? { index: 0, routes: [{ name: 'Main', params: { screen: item.tabRoute } }] }
    : { index: 1, routes: [{ name: 'Main', params: { screen: 'Dashboard' } }, { name: item.stackRoute! }] };
}
interface UiPreferences {
  landingPage: BuiltInNavId;
  loaded: boolean;
  resetRevision: number;
  load: () => Promise<void>;
  setLandingPage: (value: string) => Promise<void>;
  reset: () => Promise<void>;
}
export const useUiPreferencesStore = create<UiPreferences>((set, get) => ({
  landingPage: 'dashboard', loaded: false, resetRevision: 0,
  load: async () => {
    try { set({ landingPage: resolveLandingPage(await AsyncStorage.getItem(LANDING_PAGE_KEY)) }); }
    catch { set({ landingPage: 'dashboard' }); }
    finally { set({ loaded: true }); }
  },
  setLandingPage: async value => {
    const landingPage = resolveLandingPage(value);
    await AsyncStorage.setItem(LANDING_PAGE_KEY, landingPage);
    set({ landingPage });
  },
  reset: async () => {
    await Promise.all([LANDING_PAGE_KEY, ...PRINTER_SORT_KEYS].map(key => AsyncStorage.removeItem(key)));
    set({ landingPage: 'dashboard', loaded: true, resetRevision: get().resetRevision + 1 });
  },
}));
