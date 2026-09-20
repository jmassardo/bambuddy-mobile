import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import NfcManager, { NfcError, NfcTech } from 'react-native-nfc-manager';
import { canonicalizeNfcUid } from '@/utils/nfcUid';

const READ_TIMEOUT_MS = 30_000;

export type NfcOutcome =
  | 'unsupported'
  | 'disabled'
  | 'cancelled'
  | 'timeout'
  | 'multiple_tags'
  | 'invalid_uid'
  | 'read_error';

export type NfcState =
  | { status: 'checking' }
  | { status: 'ready' }
  | { status: 'reading' }
  | { status: 'success'; uid: string }
  | { status: NfcOutcome };

export type NfcReadResult =
  | { status: 'success'; uid: string }
  | {
      status: Exclude<NfcOutcome, 'unsupported' | 'disabled'>;
      recoverable: true;
    }
  | { status: 'unsupported' | 'disabled'; recoverable: false };

type NfcFailureResult = Exclude<NfcReadResult, { status: 'success' }>;

interface ReadSession {
  cancelPromise: Promise<void> | null;
  resolveCancellation: (result: NfcReadResult) => void;
}

function classifyNativeError(error: unknown): NfcFailureResult {
  if (error instanceof NfcError.UserCancel) {
    return { status: 'cancelled', recoverable: true };
  }
  if (error instanceof NfcError.Timeout) {
    return { status: 'timeout', recoverable: true };
  }
  if (error instanceof NfcError.SystemBusy) {
    return { status: 'multiple_tags', recoverable: true };
  }
  if (error instanceof NfcError.RadioDisabled) {
    return { status: 'disabled', recoverable: false };
  }
  if (error instanceof NfcError.UnsupportedFeature) {
    return { status: 'unsupported', recoverable: false };
  }
  return { status: 'read_error', recoverable: true };
}

export function useNfc() {
  const [state, setState] = useState<NfcState>({ status: 'checking' });
  const mountedRef = useRef(false);
  const capabilityCheckRef = useRef(0);
  const activeSessionRef = useRef<ReadSession | null>(null);

  const cancelNativeSession = useCallback(async (session: ReadSession) => {
    if (!session.cancelPromise) {
      session.cancelPromise = NfcManager.cancelTechnologyRequest().catch(
        () => undefined,
      );
    }
    await session.cancelPromise;
  }, []);

  const cancelActiveRead = useCallback(
    (result: NfcReadResult = { status: 'cancelled', recoverable: true }) => {
      const session = activeSessionRef.current;
      if (!session) {
        return;
      }
      session.resolveCancellation(result);
      cancelNativeSession(session).catch(() => undefined);
    },
    [cancelNativeSession],
  );

  const checkCapability = useCallback(async (): Promise<NfcState> => {
    const checkId = ++capabilityCheckRef.current;
    if (mountedRef.current) {
      setState({ status: 'checking' });
    }

    let nextState: NfcState;
    try {
      const supported = await NfcManager.isSupported();
      if (!supported) {
        nextState = { status: 'unsupported' };
      } else {
        await NfcManager.start();
        const enabled = await NfcManager.isEnabled();
        nextState = enabled ? { status: 'ready' } : { status: 'disabled' };
      }
    } catch (error) {
      const classified = classifyNativeError(error);
      nextState = { status: classified.status };
    }

    if (mountedRef.current && capabilityCheckRef.current === checkId) {
      setState(nextState);
    }
    return nextState;
  }, []);

  const readTag = useCallback(async (): Promise<NfcReadResult> => {
    if (activeSessionRef.current) {
      return { status: 'multiple_tags', recoverable: true };
    }
    if (state.status === 'unsupported' || state.status === 'disabled') {
      return { status: state.status, recoverable: false };
    }
    if (state.status === 'checking') {
      return { status: 'read_error', recoverable: true };
    }

    let resolveCancellation!: (result: NfcReadResult) => void;
    const cancellation = new Promise<NfcReadResult>((resolve) => {
      resolveCancellation = resolve;
    });
    const session: ReadSession = {
      cancelPromise: null,
      resolveCancellation,
    };
    activeSessionRef.current = session;
    if (mountedRef.current) {
      setState({ status: 'reading' });
    }

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<NfcReadResult>((resolve) => {
      timeoutHandle = setTimeout(() => {
        const result: NfcReadResult = {
          status: 'timeout',
          recoverable: true,
        };
        resolve(result);
        cancelNativeSession(session).catch(() => undefined);
      }, READ_TIMEOUT_MS);
    });

    const nativeRead = (async (): Promise<NfcReadResult> => {
      try {
        await NfcManager.requestTechnology(NfcTech.NfcA);
        const tag = await NfcManager.getTag();
        const canonical = canonicalizeNfcUid(tag?.id ?? '');
        if (!canonical.ok) {
          return { status: canonical.error, recoverable: true };
        }
        return { status: 'success', uid: canonical.uid };
      } catch (error) {
        return classifyNativeError(error);
      }
    })();

    const result = await Promise.race([nativeRead, timeout, cancellation]);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    await cancelNativeSession(session);

    if (activeSessionRef.current === session) {
      activeSessionRef.current = null;
      if (mountedRef.current) {
        setState(
          result.status === 'success'
            ? result
            : { status: result.status },
        );
      }
    }
    return result;
  }, [cancelNativeSession, state.status]);

  const cancelRead = useCallback(() => {
    cancelActiveRead();
  }, [cancelActiveRead]);

  useEffect(() => {
    mountedRef.current = true;
    checkCapability().catch(() => undefined);

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background') {
        cancelActiveRead();
      }
    };
    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    return () => {
      mountedRef.current = false;
      capabilityCheckRef.current += 1;
      subscription.remove();
      cancelActiveRead();
    };
  }, [cancelActiveRead, checkCapability]);

  return { ...state, checkCapability, readTag, cancelRead };
}
