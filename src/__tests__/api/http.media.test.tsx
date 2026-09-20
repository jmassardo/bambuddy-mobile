import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import {
  buildMediaUrl,
  setStreamToken,
} from '@/api/http';
import { useServerStore } from '@/api/server';
import { useMediaToken } from '@/hooks/useStreamToken';

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
  });
});
