import React from 'react';
import { AppState } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import NfcManager, {
  NfcError,
  NfcTech,
  type TagEvent,
} from 'react-native-nfc-manager';
import { useNfc } from '@/hooks/useNfc';

jest.mock('react-native-nfc-manager', () => {
  class NfcErrorBase extends Error {}
  class UserCancel extends NfcErrorBase {}
  class Timeout extends NfcErrorBase {}
  class SystemBusy extends NfcErrorBase {}
  class RadioDisabled extends NfcErrorBase {}
  class UnsupportedFeature extends NfcErrorBase {}

  return {
    __esModule: true,
    default: {
      isSupported: jest.fn(),
      start: jest.fn(),
      isEnabled: jest.fn(),
      requestTechnology: jest.fn(),
      getTag: jest.fn(),
      cancelTechnologyRequest: jest.fn(),
    },
    NfcTech: { NfcA: 'NfcA' },
    NfcError: {
      NfcErrorBase,
      UserCancel,
      Timeout,
      SystemBusy,
      RadioDisabled,
      UnsupportedFeature,
    },
  };
});

const mockNfcManager = NfcManager as jest.Mocked<typeof NfcManager>;

interface HookValue {
  status: ReturnType<typeof useNfc>['status'];
  uid?: string;
  checkCapability: ReturnType<typeof useNfc>['checkCapability'];
  readTag: ReturnType<typeof useNfc>['readTag'];
  cancelRead: ReturnType<typeof useNfc>['cancelRead'];
}

describe('useNfc', () => {
  let latestHook: HookValue | null = null;
  let appStateHandler: ((state: 'active' | 'background' | 'inactive') => void) | null = null;
  let removeAppStateListener: jest.Mock;

  function HookHarness() {
    latestHook = useNfc();
    return null;
  }

  async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
  }

  async function renderHook() {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(React.createElement(HookHarness));
      await flushPromises();
    });
    return renderer;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    latestHook = null;
    appStateHandler = null;
    removeAppStateListener = jest.fn();

    mockNfcManager.isSupported.mockResolvedValue(true);
    mockNfcManager.start.mockResolvedValue(undefined);
    mockNfcManager.isEnabled.mockResolvedValue(true);
    mockNfcManager.requestTechnology.mockResolvedValue(NfcTech.NfcA);
    mockNfcManager.getTag.mockResolvedValue({
      id: '1234abcd',
      ndefMessage: [],
    });
    mockNfcManager.cancelTechnologyRequest.mockResolvedValue(undefined);
    jest.spyOn(AppState, 'addEventListener').mockImplementation(
      (_event, handler) => {
        appStateHandler = handler as typeof appStateHandler;
        return { remove: removeAppStateListener };
      },
    );
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('checks support, starts the manager, and checks enabled state in order', async () => {
    const renderer = await renderHook();

    expect(latestHook?.status).toBe('ready');
    expect(mockNfcManager.isSupported).toHaveBeenCalledTimes(1);
    expect(mockNfcManager.start).toHaveBeenCalledTimes(1);
    expect(mockNfcManager.isEnabled).toHaveBeenCalledTimes(1);
    expect(mockNfcManager.isSupported.mock.invocationCallOrder[0]).toBeLessThan(
      mockNfcManager.start.mock.invocationCallOrder[0],
    );
    expect(mockNfcManager.start.mock.invocationCallOrder[0]).toBeLessThan(
      mockNfcManager.isEnabled.mock.invocationCallOrder[0],
    );

    await act(async () => renderer.unmount());
    expect(removeAppStateListener).toHaveBeenCalledTimes(1);
  });

  it('exposes unsupported and disabled capabilities without opening a session', async () => {
    mockNfcManager.isSupported.mockResolvedValue(false);
    const unsupportedRenderer = await renderHook();

    expect(latestHook?.status).toBe('unsupported');
    expect(mockNfcManager.start).not.toHaveBeenCalled();
    expect(mockNfcManager.requestTechnology).not.toHaveBeenCalled();
    await act(async () => unsupportedRenderer.unmount());

    jest.clearAllMocks();
    mockNfcManager.isSupported.mockResolvedValue(true);
    mockNfcManager.start.mockResolvedValue(undefined);
    mockNfcManager.isEnabled.mockResolvedValue(false);
    mockNfcManager.cancelTechnologyRequest.mockResolvedValue(undefined);
    const disabledRenderer = await renderHook();

    expect(latestHook?.status).toBe('disabled');
    expect(mockNfcManager.requestTechnology).not.toHaveBeenCalled();
    await act(async () => disabledRenderer.unmount());
  });

  it('returns unsupported without starting a read session', async () => {
    mockNfcManager.isSupported.mockResolvedValue(false);
    const renderer = await renderHook();

    let result;
    await act(async () => {
      result = await latestHook?.readTag();
    });

    expect(result).toEqual({ status: 'unsupported', recoverable: false });
    expect(latestHook?.status).toBe('unsupported');
    expect(mockNfcManager.requestTechnology).not.toHaveBeenCalled();
    expect(mockNfcManager.getTag).not.toHaveBeenCalled();
    expect(mockNfcManager.cancelTechnologyRequest).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it('returns disabled without starting a read session', async () => {
    mockNfcManager.isEnabled.mockResolvedValue(false);
    const renderer = await renderHook();

    let result;
    await act(async () => {
      result = await latestHook?.readTag();
    });

    expect(result).toEqual({ status: 'disabled', recoverable: false });
    expect(latestHook?.status).toBe('disabled');
    expect(mockNfcManager.requestTechnology).not.toHaveBeenCalled();
    expect(mockNfcManager.getTag).not.toHaveBeenCalled();
    expect(mockNfcManager.cancelTechnologyRequest).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it('returns a sanitized error while capability is checking', async () => {
    mockNfcManager.isSupported.mockImplementation(
      () => new Promise<boolean>(() => undefined),
    );
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    const renderer = await renderHook();

    let result;
    await act(async () => {
      result = await latestHook?.readTag();
    });

    expect(result).toEqual({ status: 'read_error', recoverable: true });
    expect(result).not.toHaveProperty('message');
    expect(latestHook?.status).toBe('checking');
    expect(mockNfcManager.requestTechnology).not.toHaveBeenCalled();
    expect(mockNfcManager.getTag).not.toHaveBeenCalled();
    expect(mockNfcManager.cancelTechnologyRequest).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it('rechecks capability and recovers after NFC is enabled', async () => {
    mockNfcManager.isEnabled
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const renderer = await renderHook();
    expect(latestHook?.status).toBe('disabled');

    await act(async () => {
      await latestHook?.checkCapability();
    });

    expect(latestHook?.status).toBe('ready');
    expect(mockNfcManager.isSupported).toHaveBeenCalledTimes(2);
    await act(async () => renderer.unmount());
  });

  it('sanitizes capability initialization failures', async () => {
    mockNfcManager.start.mockRejectedValue(
      new Error('native payload: device=private-device'),
    );
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    const renderer = await renderHook();

    expect(latestHook?.status).toBe('read_error');
    expect(latestHook).not.toHaveProperty('message');
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(mockNfcManager.requestTechnology).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it('reads only tag.id with NfcA and always cleans up after success', async () => {
    const privatePayload = 'private-ndef-payload';
    const tag = {
      id: '04:a1-b2 c3:d4:e5:f6',
      get ndefMessage(): never {
        throw new Error(privatePayload);
      },
    };
    mockNfcManager.getTag.mockResolvedValue(tag as TagEvent);
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    const renderer = await renderHook();

    let result;
    await act(async () => {
      result = await latestHook?.readTag();
    });

    expect(result).toEqual({
      status: 'success',
      uid: '04A1B2C3D4E5F6',
    });
    expect(latestHook).toMatchObject({
      status: 'success',
      uid: '04A1B2C3D4E5F6',
    });
    expect(mockNfcManager.requestTechnology).toHaveBeenCalledWith(NfcTech.NfcA);
    expect(mockNfcManager.getTag).toHaveBeenCalledTimes(1);
    expect(mockNfcManager.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
    expect(
      mockNfcManager.requestTechnology.mock.invocationCallOrder[0],
    ).toBeLessThan(mockNfcManager.getTag.mock.invocationCallOrder[0]);
    expect(mockNfcManager.getTag.mock.invocationCallOrder[0]).toBeLessThan(
      mockNfcManager.cancelTechnologyRequest.mock.invocationCallOrder[0],
    );
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();

    await act(async () => renderer.unmount());
  });

  it.each([
    [null, 'invalid_uid'],
    [{}, 'invalid_uid'],
    [{ id: '12.34' }, 'invalid_uid'],
  ])('returns %s for missing or invalid tag IDs', async (tag, outcome) => {
    mockNfcManager.getTag.mockResolvedValue(tag as unknown as TagEvent | null);
    const renderer = await renderHook();

    let result;
    await act(async () => {
      result = await latestHook?.readTag();
    });

    expect(result).toEqual({ status: outcome, recoverable: true });
    expect(result).not.toHaveProperty('uid');
    expect(mockNfcManager.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
    await act(async () => renderer.unmount());
  });

  it.each([
    [new NfcError.UserCancel(), 'cancelled', true],
    [new NfcError.Timeout(), 'timeout', true],
    [new NfcError.SystemBusy(), 'multiple_tags', true],
    [new NfcError.RadioDisabled(), 'disabled', false],
    [new NfcError.UnsupportedFeature(), 'unsupported', false],
    [new Error('native payload: tag=DEADBEEF'), 'read_error', true],
  ])('classifies native failures without exposing their payload', async (error, status, recoverable) => {
    mockNfcManager.requestTechnology.mockRejectedValue(error);
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    const renderer = await renderHook();

    let result;
    await act(async () => {
      result = await latestHook?.readTag();
    });

    expect(result).toEqual({ status, recoverable });
    expect(latestHook?.status).toBe(status);
    expect(result).not.toHaveProperty('message');
    expect(result).not.toHaveProperty('tag');
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(mockNfcManager.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
    await act(async () => renderer.unmount());
  });

  it('sanitizes a rejected native cancellation and cancels only once', async () => {
    mockNfcManager.getTag.mockImplementation(
      () => new Promise<never>(() => undefined),
    );
    mockNfcManager.cancelTechnologyRequest.mockRejectedValue(
      new Error('native cancellation payload: tag=DEADBEEF'),
    );
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    const renderer = await renderHook();
    let readPromise!: ReturnType<HookValue['readTag']>;

    act(() => {
      readPromise = latestHook!.readTag();
    });
    await act(async () => {
      latestHook?.cancelRead();
      latestHook?.cancelRead();
    });

    await expect(readPromise).resolves.toEqual({
      status: 'cancelled',
      recoverable: true,
    });
    expect(latestHook?.status).toBe('cancelled');
    expect(mockNfcManager.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
    expect(mockNfcManager.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
  });

  it('does not invoke native cancellation without an active session', async () => {
    const renderer = await renderHook();

    await act(async () => {
      latestHook?.cancelRead();
      latestHook?.cancelRead();
      await flushPromises();
    });

    expect(latestHook?.status).toBe('ready');
    expect(mockNfcManager.cancelTechnologyRequest).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
    expect(mockNfcManager.cancelTechnologyRequest).not.toHaveBeenCalled();
  });

  it('times out after 30 seconds and cancels exactly once', async () => {
    mockNfcManager.requestTechnology.mockImplementation(
      () => new Promise<NfcTech | null>(() => undefined),
    );
    const renderer = await renderHook();
    let readPromise!: ReturnType<HookValue['readTag']>;

    act(() => {
      readPromise = latestHook!.readTag();
    });
    expect(latestHook?.status).toBe('reading');

    await act(async () => {
      jest.advanceTimersByTime(29_999);
      await flushPromises();
    });
    expect(mockNfcManager.cancelTechnologyRequest).not.toHaveBeenCalled();

    let result;
    await act(async () => {
      jest.advanceTimersByTime(1);
      result = await readPromise;
    });

    expect(result).toEqual({ status: 'timeout', recoverable: true });
    expect(mockNfcManager.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
    await act(async () => renderer.unmount());
    expect(mockNfcManager.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
  });

  it('cancels once when the user cancels or the app backgrounds', async () => {
    mockNfcManager.getTag.mockImplementation(
      () => new Promise<never>(() => undefined),
    );
    const renderer = await renderHook();
    let firstRead!: ReturnType<HookValue['readTag']>;

    act(() => {
      firstRead = latestHook!.readTag();
    });
    await act(async () => {
      latestHook?.cancelRead();
      latestHook?.cancelRead();
    });
    await expect(firstRead).resolves.toEqual({
      status: 'cancelled',
      recoverable: true,
    });
    expect(mockNfcManager.cancelTechnologyRequest).toHaveBeenCalledTimes(1);

    mockNfcManager.cancelTechnologyRequest.mockClear();
    let secondRead!: ReturnType<HookValue['readTag']>;
    act(() => {
      secondRead = latestHook!.readTag();
    });
    act(() => {
      appStateHandler?.('inactive');
    });
    expect(mockNfcManager.cancelTechnologyRequest).not.toHaveBeenCalled();
    await act(async () => {
      appStateHandler?.('background');
    });
    await expect(secondRead).resolves.toEqual({
      status: 'cancelled',
      recoverable: true,
    });
    expect(mockNfcManager.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
    await act(async () => renderer.unmount());
  });

  it('cancels on unmount without applying stale state', async () => {
    mockNfcManager.getTag.mockImplementation(
      () => new Promise<never>(() => undefined),
    );
    const statuses: string[] = [];

    function TrackingHarness() {
      const hook = useNfc();
      latestHook = hook;
      statuses.push(hook.status);
      return null;
    }

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(React.createElement(TrackingHarness));
      await flushPromises();
    });
    let readPromise!: ReturnType<HookValue['readTag']>;
    act(() => {
      readPromise = latestHook!.readTag();
    });

    await act(async () => renderer.unmount());
    await expect(readPromise).resolves.toEqual({
      status: 'cancelled',
      recoverable: true,
    });
    expect(mockNfcManager.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toBe('reading');
  });

  it('allows only one active read so the first valid tag wins', async () => {
    let resolveTag!: (tag: TagEvent) => void;
    mockNfcManager.getTag.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTag = resolve;
        }),
    );
    const renderer = await renderHook();
    let firstRead!: ReturnType<HookValue['readTag']>;
    let secondResult;

    act(() => {
      firstRead = latestHook!.readTag();
    });
    await act(async () => {
      await flushPromises();
      secondResult = await latestHook?.readTag();
      resolveTag({ id: 'CDAB3412', ndefMessage: [] });
    });
    const firstResult = await firstRead;

    expect(secondResult).toEqual({
      status: 'multiple_tags',
      recoverable: true,
    });
    expect(firstResult).toEqual({ status: 'success', uid: 'CDAB3412' });
    expect(latestHook).toMatchObject({ status: 'success', uid: 'CDAB3412' });
    expect(mockNfcManager.requestTechnology).toHaveBeenCalledTimes(1);
    expect(mockNfcManager.getTag).toHaveBeenCalledTimes(1);
    expect(mockNfcManager.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
    await act(async () => renderer.unmount());
  });
});
