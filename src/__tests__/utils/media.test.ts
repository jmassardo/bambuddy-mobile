import { proxyThumbnailUrl } from '@/utils/media';
import { useServerStore } from '@/api/server';

describe('proxyThumbnailUrl', () => {
  beforeEach(() => {
    useServerStore.setState({ serverUrl: 'https://bb.example.com', loading: false });
  });

  it('returns null for null/undefined/empty', () => {
    expect(proxyThumbnailUrl(null)).toBeNull();
    expect(proxyThumbnailUrl(undefined)).toBeNull();
    expect(proxyThumbnailUrl('')).toBeNull();
  });

  it('proxies makerworld.com URLs through server', () => {
    const url = 'https://makerworld.com/models/123/thumb.png';
    const result = proxyThumbnailUrl(url);
    expect(result).toBe(
      `https://bb.example.com/api/proxy/thumbnail?url=${encodeURIComponent(url)}`,
    );
  });

  it('proxies subdomain makerworld URLs', () => {
    const url = 'https://cdn.makerworld.com/image.jpg';
    const result = proxyThumbnailUrl(url);
    expect(result).toContain('bb.example.com/api/proxy/thumbnail');
    expect(result).toContain(encodeURIComponent(url));
  });

  it('passes through non-makerworld URLs unchanged', () => {
    const url = 'https://other-site.com/image.png';
    expect(proxyThumbnailUrl(url)).toBe(url);
  });

  it('passes through when no server URL configured', () => {
    useServerStore.setState({ serverUrl: null });
    const url = 'https://makerworld.com/thumb.png';
    expect(proxyThumbnailUrl(url)).toBe(url);
  });

  it('returns invalid URLs unchanged', () => {
    expect(proxyThumbnailUrl('not-a-url')).toBe('not-a-url');
  });
});
