import AsyncStorage from '@react-native-async-storage/async-storage';
import { systemApi } from '@/api/system';

export const MAX_REPORT_LOG_SECONDS = 300;
export interface ReportCollection {
  description: string;
  email: string;
  includeSupportInfo: boolean;
  startedAt: number;
  wasDebug: boolean;
  phase: 'logging' | 'stopped';
  logs?: string;
}
export type ReportCollectionEdits = Partial<
  Pick<ReportCollection, 'description' | 'email' | 'includeSupportInfo'>
>;

export function reportSessionKey(server: string) {
  return `bambuddy-bug-report-session:${encodeURIComponent(server)}`;
}

export function parseReportCollection(
  raw: string | null,
): ReportCollection | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ReportCollection>;
    if (
      typeof value.startedAt !== 'number' ||
      !Number.isFinite(value.startedAt) ||
      value.startedAt < 0 ||
      typeof value.wasDebug !== 'boolean' ||
      typeof value.description !== 'string' ||
      (value.phase !== 'logging' && value.phase !== 'stopped')
    )
      return null;
    return {
      description: value.description,
      startedAt: Math.min(value.startedAt, Date.now()),
      wasDebug: value.wasDebug,
      phase: value.phase,
      email: typeof value.email === 'string' ? value.email : '',
      includeSupportInfo: value.includeSupportInfo !== false,
      logs: typeof value.logs === 'string' ? value.logs : undefined,
    };
  } catch {
    return null;
  }
}

const collectionOperations = new Map<string, Promise<void>>();

function serializeCollectionOperation<T>(
  server: string,
  run: () => Promise<T>,
): Promise<T> {
  const operation = (
    collectionOperations.get(server) ?? Promise.resolve()
  ).then(run);
  const settled = operation.then(
    () => {},
    () => {},
  );
  collectionOperations.set(server, settled);
  void settled.then(() => {
    if (collectionOperations.get(server) === settled)
      collectionOperations.delete(server);
  });
  return operation;
}

async function readCollection(server: string) {
  return parseReportCollection(
    await AsyncStorage.getItem(reportSessionKey(server)),
  );
}

async function writeCollection(server: string, value: ReportCollection | null) {
  if (value)
    await AsyncStorage.setItem(reportSessionKey(server), JSON.stringify(value));
  else await AsyncStorage.removeItem(reportSessionKey(server));
}

export function loadReportCollection(server: string) {
  return serializeCollectionOperation(server, () => readCollection(server));
}

export function saveReportCollection(
  server: string,
  value: ReportCollection | null,
) {
  return serializeCollectionOperation(server, () =>
    writeCollection(server, value),
  );
}

export function editReportCollection(
  server: string,
  startedAt: number,
  edits: ReportCollectionEdits,
) {
  return serializeCollectionOperation(server, async () => {
    const current = await readCollection(server);
    if (!current || current.startedAt !== startedAt) return current;
    const updated: ReportCollection = {
      ...current,
      description: edits.description ?? current.description,
      email: edits.email ?? current.email,
      includeSupportInfo:
        edits.includeSupportInfo ?? current.includeSupportInfo,
    };
    await writeCollection(server, updated);
    return updated;
  });
}

// Draft edits are optimistic: an older async stop/write must only advance logging state.
export function mergeReportCollectionState(
  current: ReportCollection | null | undefined,
  incoming: ReportCollection | null,
) {
  if (!current || !incoming || current.startedAt !== incoming.startedAt)
    return current;
  return {
    ...current,
    phase: current.phase === 'stopped' ? current.phase : incoming.phase,
    logs: incoming.phase === 'stopped' ? incoming.logs : current.logs,
  };
}

// A failed stop never discards the original debug setting, so a reconnect can retry it.
const stopping = new Map<string, Promise<ReportCollection>>();
export async function stopReportCollection(
  server: string,
  session: ReportCollection,
) {
  if (session.phase === 'stopped') return session;
  const key = `${reportSessionKey(server)}:${session.startedAt}`;
  const existing = stopping.get(key);
  if (existing) return existing;
  const operation = (async () => {
    const result = await systemApi.stopBugReportLogging(session.wasDebug);
    return serializeCollectionOperation(server, async () => {
      const current = await readCollection(server);
      const matches = current?.startedAt === session.startedAt;
      const stopped: ReportCollection = {
        ...(matches ? current : session),
        phase: 'stopped',
        logs: result.logs,
      };
      if (matches) await writeCollection(server, stopped);
      return stopped;
    });
  })();
  stopping.set(key, operation);
  try {
    return await operation;
  } finally {
    stopping.delete(key);
  }
}
