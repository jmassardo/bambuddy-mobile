import { useServerStore } from '@/api/server';

function isMakerWorldHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === 'makerworld.com' || normalized.endsWith('.makerworld.com');
}

export function proxyThumbnailUrl(url?: string | null): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (!isMakerWorldHost(parsed.hostname)) {
      return url;
    }
  } catch {
    return url;
  }

  const serverUrl = useServerStore.getState().serverUrl;
  if (!serverUrl) {
    return url;
  }

  return `${serverUrl}/api/proxy/thumbnail?url=${encodeURIComponent(url)}`;
}
