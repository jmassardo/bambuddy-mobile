import React from 'react';
import { View } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';
import { api, setStreamToken } from '@/api/client';
import { useServerStore } from '@/api/server';
import { useStreamToken } from '@/hooks/useStreamToken';
import {
  clearTestQueryClients,
  createTestQueryClient,
} from '@/testUtils/queryClient';

jest.mock('@/api/client', () => ({
  api: {
    getCameraStreamToken: jest.fn(),
  },
  setStreamToken: jest.fn(),
}));

function StreamTokenHarness({ renderId }: { renderId: number }) {
  useStreamToken();
  return <View testID={`stream-token-${renderId}`} />;
}

describe('useStreamToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useServerStore.setState({
      serverUrl: 'https://bambuddy.test',
      loading: false,
    });
  });

  afterEach(() => {
    clearTestQueryClients();
    useServerStore.setState({ serverUrl: null });
  });

  it('does not clear a valid token when its data effect re-runs', async () => {
    const client = createTestQueryClient();
    jest
      .mocked(api.getCameraStreamToken)
      .mockResolvedValue({ token: 'first-token' });

    const result = await render(
      <QueryClientProvider client={client}>
        <StreamTokenHarness renderId={1} />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(setStreamToken).toHaveBeenCalledWith('first-token'),
    );
    jest.mocked(setStreamToken).mockClear();

    await act(async () => {
      client.setQueryData(
        ['camera-stream-token', 'https://bambuddy.test'],
        { token: 'refreshed-token' },
      );
    });

    await waitFor(() =>
      expect(setStreamToken).toHaveBeenCalledWith('refreshed-token'),
    );
    expect(setStreamToken).not.toHaveBeenCalledWith(null);

    await result.rerender(
      <QueryClientProvider client={client}>
        <StreamTokenHarness renderId={2} />
      </QueryClientProvider>,
    );

    expect(setStreamToken).not.toHaveBeenCalledWith(null);
  });

  it('refetches the token when the server changes', async () => {
    const client = createTestQueryClient();
    jest
      .mocked(api.getCameraStreamToken)
      .mockResolvedValueOnce({ token: 'first-token' })
      .mockResolvedValueOnce({ token: 'second-token' });

    await render(
      <QueryClientProvider client={client}>
        <StreamTokenHarness renderId={1} />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(setStreamToken).toHaveBeenCalledWith('first-token'),
    );

    await act(async () => {
      useServerStore.setState({ serverUrl: 'https://second.test' });
    });

    await waitFor(() => {
      expect(api.getCameraStreamToken).toHaveBeenCalledTimes(2);
      expect(setStreamToken).toHaveBeenCalledWith('second-token');
    });
  });
});
