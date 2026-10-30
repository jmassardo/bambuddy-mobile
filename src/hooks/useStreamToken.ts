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
import { useAuth } from '@/contexts/AuthContext';

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
 * Refreshes the non-camera media token used by thumbnails and cover images.
 *
 * Mount once near the app root so the token is available app-wide.
 */
export function useStreamToken() {
  const serverUrl = useServerStore(state => state.serverUrl);
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ['media-token', serverUrl, user?.id],
    queryFn: () => api.getMediaToken(),
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

export function useCameraToken(enabled = true) {
  const serverUrl = useServerStore(state => state.serverUrl);
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['camera-stream-token', serverUrl, user?.id],
    queryFn: () => api.getCameraStreamToken(),
    enabled: Boolean(serverUrl) && enabled,
    staleTime: 50 * 60 * 1000,
    refetchInterval: 50 * 60 * 1000,
    retry: 2,
  });
  return { token: query.data?.token ?? null, isReady: query.isSuccess };
}
