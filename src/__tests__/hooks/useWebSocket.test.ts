import React from 'react';
import { AppState } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { useWebSocket } from '@/hooks/useWebSocket';

const mockInvalidateQueries = jest.fn();
const mockSetQueryData = jest.fn();
const mockShowToast = jest.fn();
const mockGetWebSocketToken = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
    setQueryData: mockSetQueryData,
  }),
}));

jest.mock('@/api/client', () => ({
  api: {
    getWebSocketToken: (...args: unknown[]) => mockGetWebSocketToken(...args),
  },
  getAuthToken: () => null,
}));

jest.mock('@/api/server', () => ({
  useServerStore: (selector: (state: { serverUrl: string }) => unknown) =>
    selector({ serverUrl: 'https://bambuddy.test' }),
  wsUrl: (serverUrl: string, token?: string) => {
    const base = serverUrl.replace(/^http/, 'ws');
    return `${base}/api/v1/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },
}));

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  send = jest.fn();
  close = jest.fn(() => {
    this.readyState = 3;
  });

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  emitMessage(payload: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  emitClose(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

describe('useWebSocket', () => {
  let latestHook: ReturnType<typeof useWebSocket> | null = null;

  function HookHarness() {
    latestHook = useWebSocket();
    return null;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    MockWebSocket.instances = [];
    latestHook = null;
    mockGetWebSocketToken.mockResolvedValue({ token: 'ws-token' });
    (globalThis as typeof globalThis & { WebSocket: typeof WebSocket }).WebSocket = MockWebSocket as unknown as typeof WebSocket;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }) as any);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  async function renderHookHarness() {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(React.createElement(HookHarness));
      await Promise.resolve();
    });
    return renderer;
  }

  it('connects to the correct websocket URL', async () => {
    const renderer = await renderHookHarness();

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0]?.url).toBe('wss://bambuddy.test/api/v1/ws?token=ws-token');

    await act(async () => {
      renderer.unmount();
    });
  });

  it('reconnects after an unexpected disconnect', async () => {
    const renderer = await renderHookHarness();

    act(() => {
      MockWebSocket.instances[0]?.emitClose(1006);
      jest.advanceTimersByTime(3000);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(MockWebSocket.instances).toHaveLength(2);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('handles incoming printer status messages', async () => {
    const renderer = await renderHookHarness();

    act(() => {
      MockWebSocket.instances[0]?.open();
      MockWebSocket.instances[0]?.emitMessage({
        type: 'printer_status',
        printer_id: 7,
        data: { progress: 55 },
      });
      jest.advanceTimersByTime(100);
    });

    expect(latestHook?.isConnected).toBe(true);
    expect(mockSetQueryData).toHaveBeenCalledWith(['printerStatus', 7], expect.any(Function));

    const updater = mockSetQueryData.mock.calls[0][1] as (old: Record<string, unknown> | undefined) => Record<string, unknown>;
    expect(updater({ state: 'IDLE' })).toEqual({ state: 'IDLE', progress: 55 });

    await act(async () => {
      renderer.unmount();
    });
  });
});
