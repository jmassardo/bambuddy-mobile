// Server connection store — persists the user's Bambuddy server URL
// Uses AsyncStorage for persistence and Zustand for state management

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SERVER_URL_KEY = 'bambuddy-server-url';

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
    // Normalize: strip trailing slash
    const normalized = url.replace(/\/+$/, '');
    if (!/^https:\/\//i.test(normalized)) {
      throw new Error('Server URL must use HTTPS (https://)');
    }
    await AsyncStorage.setItem(SERVER_URL_KEY, normalized);
    set({ serverUrl: normalized });
  },
  clearServerUrl: async () => {
    await AsyncStorage.removeItem(SERVER_URL_KEY);
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
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${base}/api/v1/ws${tokenParam}`;
}
