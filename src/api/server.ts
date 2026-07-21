// Server connection store that persists the user's Bambuddy server URL
// Uses AsyncStorage for persistence and Zustand for state management

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SERVER_URL_KEY = 'bambuddy-server-url';
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
  loading: boolean;
  setServerUrl: (url: string) => Promise<void>;
  clearServerUrl: () => Promise<void>;
  loadServerUrl: () => Promise<void>;
}

export const useServerStore = create<ServerStore>((set) => ({
  serverUrl: null,
  loading: true,
  setServerUrl: async (url: string) => {
    const previousUrl = useServerStore.getState().serverUrl;
    // Normalize: strip trailing slash
    const normalized = url.replace(/\/+$/, '');
    await AsyncStorage.setItem(SERVER_URL_KEY, normalized);
    if (previousUrl !== normalized) {
      await serverUrlChangeHandler(previousUrl, normalized);
    }
    set({ serverUrl: normalized });
  },
  clearServerUrl: async () => {
    const previousUrl = useServerStore.getState().serverUrl;
    await AsyncStorage.removeItem(SERVER_URL_KEY);
    if (previousUrl !== null) {
      await serverUrlChangeHandler(previousUrl, null);
    }
    set({ serverUrl: null });
  },
  loadServerUrl: async () => {
    const stored = await AsyncStorage.getItem(SERVER_URL_KEY);
    set({ serverUrl: stored, loading: false });
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
