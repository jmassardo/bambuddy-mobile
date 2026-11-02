import React from 'react';
import { Text, View } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';
import { api, setStreamToken } from '@/api/client';
import { useServerStore } from '@/api/server';
import { useCameraToken, useStreamToken } from '@/hooks/useStreamToken';
import {
  clearTestQueryClients,
  createTestQueryClient,
} from '@/testUtils/queryClient';

jest.mock('@/api/client', () => ({
  api: {
    getMediaToken: jest.fn(),
    getCameraStreamToken: jest.fn(),
  },
  setStreamToken: jest.fn(),
}));
let mockUserId = 1;
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: mockUserId } }) }));

function StreamTokenHarness({ renderId }: { renderId: number }) {
  useStreamToken();
  return <View testID={`stream-token-${renderId}`} />;
}

function CameraTokenHarness() {
  const { token, isReady } = useCameraToken();
  return <Text>{isReady ? token : 'waiting'}</Text>;
}

describe('useStreamToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 1;
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
      .mocked(api.getMediaToken)
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
        ['media-token', 'https://bambuddy.test', 1],
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

  it.skip('refetches the token when the server changes', async () => {
    // Requires reactive zustand store integration with React Testing Library
    // TODO: Fix this test
  });

  it('keeps camera credentials out of the media store and scopes their cache to the signed-in user', async () => {
    const client = createTestQueryClient();
    jest.mocked(api.getCameraStreamToken).mockResolvedValue({ token: 'first-camera' });
    const result = await render(
      <QueryClientProvider client={client}><CameraTokenHarness /></QueryClientProvider>,
    );
    await waitFor(() => expect(result.getByText('first-camera')).toBeTruthy());
    expect(setStreamToken).not.toHaveBeenCalled();
    mockUserId = 2;
    jest.mocked(api.getCameraStreamToken).mockResolvedValue({ token: 'second-camera' });
    await result.rerender(
      <QueryClientProvider client={client}><CameraTokenHarness /></QueryClientProvider>,
    );
    await waitFor(() => expect(result.getByText('second-camera')).toBeTruthy());
    expect(api.getCameraStreamToken).toHaveBeenCalledTimes(2);
    expect(setStreamToken).not.toHaveBeenCalled();
    await result.unmount();
  });
});
