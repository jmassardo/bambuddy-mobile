import { useEffect, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, setStreamToken } from '@/api/client';
import {
  getMediaTokenVersion,
  getScopedMediaToken,
  isScopedMediaTokenReady,
  subscribeToMediaToken,
} from '@/api/http';
import { useServerStore } from '@/api/server';

export function useMediaToken() {
  const serverUrl = useServerStore(state => state.serverUrl);
  useSyncExternalStore(
    subscribeToMediaToken,
    getMediaTokenVersion,
    getMediaTokenVersion,
  );

  return {
    token: getScopedMediaToken(),
    isReady: Boolean(serverUrl) && isScopedMediaTokenReady(),
  };
}

/**
 * Fetches a camera stream token on mount and stores it globally.
 * The stream token is required for thumbnail and camera image URLs
 * (the backend guards those endpoints with RequireCameraStreamTokenIfAuthEnabled).
 *
 * Mount once near the app root so the token is available app-wide.
 */
export function useStreamToken() {
  const serverUrl = useServerStore(state => state.serverUrl);
  const { data } = useQuery({
    queryKey: ['camera-stream-token', serverUrl],
    queryFn: () => api.getCameraStreamToken(),
    enabled: Boolean(serverUrl),
    staleTime: 50 * 60 * 1000, // refresh at 50 min (tokens expire at 60)
    refetchInterval: 50 * 60 * 1000,
    retry: 2,
  });

  useEffect(() => {
    if (data) {
      setStreamToken(data.token);
    }
  }, [data, serverUrl]);

  useEffect(() => () => setStreamToken(null), []);
}
