import { URL } from 'react-native-url-polyfill';

export interface ServerEnrollment {
  serverUrl: string;
  apiKey?: string;
}

function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local')) return true;
  const parts = host.split('.');
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part))) return false;
  const [first, second, ...rest] = parts.map(Number);
  if ([first, second, ...rest].some(part => part > 255)) return false;
  return first === 10 || first === 127 ||
    (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31);
}

function parseServerUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && isLocalHost(url.hostname))) return null;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function parseServerEnrollment(value: string): ServerEnrollment | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'bambuddy:') {
      const serverUrl = parseServerUrl(value);
      return serverUrl ? { serverUrl } : null;
    }
    if (url.hostname !== 'config' || url.port || url.username || url.password ||
      url.hash || (url.pathname !== '' && url.pathname !== '/')) return null;
    const params = url.searchParams;
    if (['v', 'url', 'key'].some(name => params.getAll(name).length !== 1) ||
      params.get('v') !== '1') return null;
    const serverUrl = parseServerUrl(params.get('url') ?? '');
    const apiKey = params.get('key') ?? '';
    if (!serverUrl || !/^bb_[A-Za-z0-9_-]+$/.test(apiKey)) return null;
    return { serverUrl, apiKey };
  } catch {
    return null;
  }
}
