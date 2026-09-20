// Server connection store that persists the user's Bambuddy server URL
// Uses AsyncStorage for persistence and Zustand for state management

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SERVER_URL_KEY = 'bambuddy-server-url';
const DEMO_MODE_KEY = 'bambuddy-demo-mode';
type ServerUrlChangeHandler = (
  previousUrl: string | null,
  nextUrl: string | null,
) => Promise<void>;

let serverUrlChangeHandler: ServerUrlChangeHandler = async () => {};

export function registerServerUrlChangeHandler(
  handler: ServerUrlChangeHandler,
): void {
  serverUrlChangeHandler = handler;
}

interface ServerStore {
  serverUrl: string | null;
  demoMode: boolean;
  loading: boolean;
  setServerUrl: (url: string) => Promise<void>;
  setDemoMode: (enabled: boolean) => Promise<void>;
  clearServerUrl: () => Promise<void>;
  loadServerUrl: () => Promise<void>;
}

/** Returns true if the URL uses plain HTTP (not HTTPS) */
export function isInsecureUrl(url: string): boolean {
  return /^http:\/\//i.test(url) && !/^https:\/\//i.test(url);
}

export const useServerStore = create<ServerStore>((set) => ({
  serverUrl: null,
  demoMode: false,
  loading: true,
  setServerUrl: async (url: string) => {
    const previousUrl = useServerStore.getState().serverUrl;
    // Normalize: strip trailing slash
    const normalized = url.replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(normalized)) {
      throw new Error('Server URL must use HTTP or HTTPS (e.g. https://...)');
    }
    await AsyncStorage.setItem(SERVER_URL_KEY, normalized);
    if (previousUrl !== normalized) {
      await serverUrlChangeHandler(previousUrl, normalized);
    }
    set({ serverUrl: normalized });
  },
  setDemoMode: async (enabled: boolean) => {
    if (enabled) {
      await AsyncStorage.setItem(DEMO_MODE_KEY, 'true');
    } else {
      await AsyncStorage.removeItem(DEMO_MODE_KEY);
    }
    set({ demoMode: enabled });
  },
  clearServerUrl: async () => {
    const previousUrl = useServerStore.getState().serverUrl;
    await AsyncStorage.removeItem(SERVER_URL_KEY);
    await AsyncStorage.removeItem(DEMO_MODE_KEY);
    if (previousUrl !== null) {
      await serverUrlChangeHandler(previousUrl, null);
    }
    set({ serverUrl: null, demoMode: false });
  },
  loadServerUrl: async () => {
    const stored = await AsyncStorage.getItem(SERVER_URL_KEY);
    const demo = await AsyncStorage.getItem(DEMO_MODE_KEY);
    set({ serverUrl: stored, demoMode: demo === 'true', loading: false });
  },
}));

/** Build a full API URL from an endpoint path */
export function apiUrl(serverUrl: string, endpoint: string): string {
  return `${serverUrl}/api/v1${endpoint}`;
}

/** Build a WebSocket URL from the server URL */
export function wsUrl(serverUrl: string, token?: string): string {
  const base = serverUrl.replace(/^http/, 'ws');
  // WebSocket auth should use a dedicated ws-token minted by the API.
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${base}/api/v1/ws${tokenParam}`;
}
