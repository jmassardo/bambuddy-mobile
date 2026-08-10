import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import {
  buildMediaUrl,
  setStreamToken,
} from '@/api/http';
import { useServerStore } from '@/api/server';
import { useMediaToken } from '@/hooks/useStreamToken';
import { printersApi } from '@/api/printers';

function MediaUrlConsumer() {
  const { token } = useMediaToken();
  return <Text>{`${token ?? 'none'}|${buildMediaUrl('/archives/7/timelapse')}`}</Text>;
}

describe('media URL token scoping', () => {
  beforeEach(() => {
    useServerStore.setState({
      serverUrl: 'https://one.example.com',
      loading: false,
    });
    setStreamToken(null);
  });

  afterEach(() => {
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

  it('preserves the token and cache-buster-compatible query on camera URLs', () => {
    setStreamToken('camera-token');

    const stream = new URL(printersApi.getCameraStreamUrl(9));
    expect(stream.origin).toBe('https://one.example.com');
    expect(stream.searchParams.get('fps')).toBe('5');
    expect(stream.searchParams.get('token')).toBe('camera-token');

    const snapshot = new URL(printersApi.getCameraSnapshotUrl(9));
    expect(snapshot.searchParams.get('token')).toBe('camera-token');
  });

  it('does not expose the scoped token outside its configured origin', () => {
    setStreamToken('origin-secret');
    useServerStore.setState({ serverUrl: 'https://other.example.com' });

    expect(printersApi.getCameraStreamUrl(9)).not.toContain('origin-secret');
  });
});
