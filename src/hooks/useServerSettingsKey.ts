import { useServerStore } from '@/api/server';

/** Full settings must never reuse another deployment's data while loading. */
export function useServerSettingsKey() {
  const serverUrl = useServerStore(state => state.serverUrl);
  return ['settings', serverUrl] as const;
}
