import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import {
  buildMediaUrl,
  getCameraStreamToken,
  getMediaToken,
  isScopedMediaTokenReady,
  setAuthToken,
  setStreamToken,
  withStreamToken,
} from '@/api/http';
import { useServerStore } from '@/api/server';
import { useMediaToken } from '@/hooks/useStreamToken';

function MediaUrlConsumer() {
  const { token } = useMediaToken();
  return <Text>{`${token ?? 'none'}|${buildMediaUrl('/archives/7/timelapse')}`}</Text>;
}

describe('media URL token scoping', () => {
  beforeEach(async () => {
    useServerStore.setState({
      serverUrl: 'https://one.example.com',
      loading: false,
    });
    await setAuthToken(null);
    setStreamToken(null);
  });

  afterEach(async () => {
    await setAuthToken(null);
    jest.restoreAllMocks();
    setStreamToken(null);
    useServerStore.setState({ serverUrl: null });
  });

  it('builds URLs with and without a scoped token', () => {
    expect(buildMediaUrl('/archives/7/timelapse')).toBe(
      'https://one.example.com/api/v1/archives/7/timelapse',
    );

    setStreamToken('media-token');

    expect(buildMediaUrl('/archives/7/timelapse')).toBe(
      'https://one.example.com/api/v1/archives/7/timelapse?token=media-token',
    );
  });

  it('does not reuse a token after the server origin changes', () => {
    setStreamToken('first-token');
    useServerStore.setState({ serverUrl: 'https://two.example.com' });

    expect(buildMediaUrl('/archives/7/thumbnail')).toBe(
      'https://two.example.com/api/v1/archives/7/thumbnail',
    );

    setStreamToken('second-token');

    expect(buildMediaUrl('/archives/7/thumbnail')).toBe(
      'https://two.example.com/api/v1/archives/7/thumbnail?token=second-token',
    );
  });

  it('re-renders a mounted consumer when the token resolves', async () => {
    const result = await render(<MediaUrlConsumer />);

    expect(result.getByText(/^none\|/)).toBeTruthy();

    await act(() => setStreamToken('late-token'));

    expect(
      result.getByText(
        'late-token|https://one.example.com/api/v1/archives/7/timelapse?token=late-token',
      ),
    ).toBeTruthy();
    await result.unmount();
  });

  it('mints and refreshes media credentials independently of camera credentials', async () => {
    const response = (token: string) => ({
      ok: true, status: 200, headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ token }),
    }) as unknown as Response;
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response('first-media'));
    await setAuthToken('login-credential');
    expect(fetch).toHaveBeenLastCalledWith('https://one.example.com/api/v1/auth/media-token', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer login-credential' }),
    }));
    fetch.mockResolvedValueOnce(response('fresh-media'));
    await expect(getMediaToken()).resolves.toEqual({ token: 'fresh-media' });
    expect(buildMediaUrl('/archives/7/thumbnail')).toContain('token=fresh-media');
    fetch.mockResolvedValueOnce(response('camera-only'));
    await expect(getCameraStreamToken()).resolves.toEqual({ token: 'camera-only' });
    expect(fetch).toHaveBeenLastCalledWith('https://one.example.com/api/v1/printers/camera/stream-token', expect.objectContaining({ method: 'POST' }));
    expect(buildMediaUrl('/archives/7/thumbnail')).toContain('token=fresh-media');
    expect(buildMediaUrl('/archives/7/thumbnail')).not.toContain('login-credential');
  });

  it('keeps failed token requests retryable instead of declaring images ready', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Offline'));
    await setAuthToken('login-credential');
    await expect(getMediaToken()).rejects.toMatchObject({ code: 'media_token_unavailable' });
    expect(isScopedMediaTokenReady()).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('attaches media tokens only to the configured server and replaces stale tokens', () => {
    setStreamToken('fresh-media');
    expect(withStreamToken('/api/v1/library/files/7/thumbnail?token=expired')).toBe(
      'https://one.example.com/api/v1/library/files/7/thumbnail?token=fresh-media',
    );
    expect(withStreamToken('https://external.example/image.png')).toBe('https://external.example/image.png');
    setStreamToken(null);
    expect(withStreamToken('https://one.example.com/api/v1/archives/7/thumbnail?token=expired')).not.toContain('token=');
  });
});
