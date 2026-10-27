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

export async function saveReportCollection(
  server: string,
  value: ReportCollection | null,
) {
  if (value)
    await AsyncStorage.setItem(reportSessionKey(server), JSON.stringify(value));
  else await AsyncStorage.removeItem(reportSessionKey(server));
}

// A failed stop never discards the original debug setting, so a reconnect can retry it.
const stopping = new Map<string, Promise<ReportCollection>>();
export async function stopReportCollection(
  server: string,
  session: ReportCollection,
) {
  if (session.phase === 'stopped') return session;
  const existing = stopping.get(server);
  if (existing) return existing;
  const operation = (async () => {
    const result = await systemApi.stopBugReportLogging(session.wasDebug);
    const stopped: ReportCollection = {
      ...session,
      phase: 'stopped',
      logs: result.logs,
    };
    await saveReportCollection(server, stopped);
    return stopped;
  })();
  stopping.set(server, operation);
  try {
    return await operation;
  } finally {
    stopping.delete(server);
  }
}
