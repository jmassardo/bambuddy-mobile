import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, setStreamToken } from '@/api/client';

/**
 * Fetches a camera stream token on mount and stores it globally.
 * The stream token is required for thumbnail and camera image URLs
 * (the backend guards those endpoints with RequireCameraStreamTokenIfAuthEnabled).
 *
 * Mount once near the app root so the token is available app-wide.
 */
export function useStreamToken() {
  const { data } = useQuery({
    queryKey: ['camera-stream-token'],
    queryFn: () => api.getCameraStreamToken(),
    staleTime: 50 * 60 * 1000, // refresh at 50 min (tokens expire at 60)
    refetchInterval: 50 * 60 * 1000,
    retry: 2,
  });

  useEffect(() => {
    setStreamToken(data?.token ?? null);
    return () => setStreamToken(null);
  }, [data?.token]);
}
