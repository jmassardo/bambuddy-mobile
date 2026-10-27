import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, ScrollView, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { slicingApi, type SliceSourceProps } from '@/api/slicing';
import { useServerStore } from '@/api/server';
import { useToast } from '@/contexts/ToastContext';
import { Box, Copy } from '@/components/slicing/Controls';
import { PrimaryButton } from '@/components/common/AppUI';
import { useTranslation } from '@/i18n';
import type { SliceJobState } from '@/types/api';

type Tracked = SliceSourceProps & {
  jobId: number;
  enqueued: number;
  final?: SliceJobState;
};
const Context = createContext<{
  trackJob: (id: number, source: SliceSourceProps) => void;
  jobs: React.ReactNode;
}>({
  trackJob: () => {
    throw new Error('SliceJobTrackerProvider must be mounted.');
  },
  jobs: null,
});
export const useSliceJobTracker = () => useContext(Context);

export function SliceJobTrackerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const server = useServerStore(s => s.serverUrl);
  const key = `slice-jobs:${server}`;
  const [tracking, setTracking] = useState<{ key: string; jobs: Tracked[] }>({
    key,
    jobs: [],
  });
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const client = useQueryClient();
  const { showToast } = useToast();
  const notified = useRef(new Set<string>());
  useEffect(() => {
    let active = true;
    setLoadedKey(null);
    setTracking(previous =>
      previous.key === key ? previous : { key, jobs: [] },
    );
    AsyncStorage.getItem(key)
      .then(raw => {
        if (!active) return;
        try {
          const parsed: unknown = raw ? JSON.parse(raw) : [];
          if (Array.isArray(parsed)) {
            const restored = parsed.filter(
              (v): v is Tracked =>
                !!v &&
                typeof v === 'object' &&
                typeof v.jobId === 'number' &&
                typeof v.sourceId === 'number' &&
                typeof v.enqueued === 'number' &&
                typeof v.sourceName === 'string' &&
                ['file', 'archive'].includes(v.sourceType),
            );
            setTracking(previous => ({
              key,
              jobs: [
                ...restored,
                ...(previous.key === key ? previous.jobs : []).filter(
                  job => !restored.some(old => old.jobId === job.jobId),
                ),
              ],
            }));
          }
        } catch {
          /* Corrupt local tracking never prevents slicing. */
        }
        setLoadedKey(key);
      })
      .catch(() => {
        if (active) setLoadedKey(key);
      });
    return () => {
      active = false;
    };
  }, [key]);
  useEffect(() => {
    if (loadedKey === key && tracking.key === key)
      AsyncStorage.setItem(key, JSON.stringify(tracking.jobs)).catch(() => {});
  }, [key, loadedKey, tracking]);
  const activeTracked = useMemo(
    () => (tracking.key === key ? tracking.jobs : []),
    [key, tracking],
  );
  const jobs = useQueries({
    queries: activeTracked.map(job => ({
      queryKey: ['trackedSliceJob', server, job.jobId],
      queryFn: () => slicingApi.job(job.jobId),
      initialData: job.final,
      enabled: !job.final,
      refetchInterval: (query: { state: { data?: { status: string } } }) =>
        ['completed', 'failed'].includes(query.state.data?.status ?? '')
          ? (false as const)
          : 1000,
      retry: 2,
    })),
  });
  useEffect(() => {
    const timer = activeTracked.some(job => !job.final)
      ? setInterval(() => setNow(Date.now()), 1000)
      : undefined;
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active')
        client.invalidateQueries({ queryKey: ['trackedSliceJob', server] });
    });
    return () => {
      if (timer) clearInterval(timer);
      listener.remove();
    };
  }, [client, server, activeTracked]);
  useEffect(() => {
    jobs.forEach((query, i) => {
      const state = query.data;
      const identity = `${server}:${activeTracked[i].jobId}`;
      if (!state || !['completed', 'failed'].includes(state.status)) return;
      if (!activeTracked[i].final)
        setTracking(previous =>
          previous.key === key
            ? {
                key,
                jobs: previous.jobs.map(job =>
                  job.jobId === state.job_id ? { ...job, final: state } : job,
                ),
              }
            : previous,
        );
      if (notified.current.has(identity)) return;
      notified.current.add(identity);
      if (state.status === 'completed') {
        [
          'libraryFiles',
          'archives',
          'libraryFilePlates',
          'archivePlates',
          'libraryFile',
          'archive',
          'slicePlates',
          'sliceFilamentReqs',
        ].forEach(name => client.invalidateQueries({ queryKey: [name] }));
        showToast(
          t('slice.job.completed', {
            defaultValue: '{{name}}: slicing complete',
            name: activeTracked[i].sourceName,
          }),
          'success',
        );
      } else
        showToast(
          state.error_detail ||
            t('slice.job.failed', { defaultValue: 'Slicing failed' }),
          'error',
        );
    });
  }, [jobs, activeTracked, server, key, client, showToast, t]);
  const trackJob = useCallback(
    (jobId: number, source: SliceSourceProps) => {
      setTracking(previous => {
        const current = previous.key === key ? previous.jobs : [];
        return {
          key,
          jobs: current.some(j => j.jobId === jobId)
            ? current
            : [
                ...current,
                {
                  sourceType: source.sourceType,
                  sourceId: source.sourceId,
                  sourceName: source.sourceName,
                  jobId,
                  enqueued: Date.now(),
                },
              ],
        };
      });
    },
    [key],
  );
  const content = activeTracked.length ? (
    <ScrollView horizontal style={styles.banner}>
      {activeTracked.map((job, i) => {
        const query = jobs[i];
        const state = query.data;
        const progress = state?.progress;
        const terminal =
          !!state && ['completed', 'failed'].includes(state.status);
        return (
          <Box key={job.jobId}>
            <Copy>{`${job.sourceName} · ${
              state?.status ?? 'pending'
            } · ${Math.max(
              0,
              Math.floor(
                ((state?.completed_at ? Date.parse(state.completed_at) : now) -
                  job.enqueued) /
                  1000,
              ),
            )}s`}</Copy>
            {progress && (
              <Copy>{`${progress.stage} · ${Math.round(
                progress.total_percent,
              )}% · ${t('slice.job.plate', { defaultValue: 'Plate' })} ${
                progress.multi_plate_index ?? progress.plate_index
              }/${progress.multi_plate_count ?? progress.plate_count}`}</Copy>
            )}
            {state?.error_detail && <Copy>{state.error_detail}</Copy>}
            {state?.result && (
              <Copy>{`${state.result.name} · ${state.result.print_time_seconds}s · ${state.result.filament_used_g}g`}</Copy>
            )}
            {state?.result &&
              'external_write_fallback' in state.result &&
              !!state.result.external_write_fallback && (
                <Copy>{state.result.external_write_fallback}</Copy>
              )}
            {query.isError && (
              <>
                <Copy>{query.error.message}</Copy>
                <PrimaryButton
                  label={t('common.retry', { defaultValue: 'Retry' })}
                  onPress={() => query.refetch()}
                />
                <PrimaryButton
                  label={t('slice.job.stopTracking', {
                    defaultValue: 'Stop tracking (does not cancel the job)',
                  })}
                  variant="secondary"
                  onPress={() =>
                    setTracking(previous => ({
                      ...previous,
                      jobs: previous.jobs.filter(j => j.jobId !== job.jobId),
                    }))
                  }
                />
              </>
            )}
            {terminal && (
              <PrimaryButton
                label={t('common.dismiss', { defaultValue: 'Dismiss' })}
                variant="secondary"
                onPress={() =>
                  setTracking(previous => ({
                    ...previous,
                    jobs: previous.jobs.filter(j => j.jobId !== job.jobId),
                  }))
                }
              />
            )}
          </Box>
        );
      })}
    </ScrollView>
  ) : null;
  return (
    <Context.Provider value={{ trackJob, jobs: content }}>
      {children}
    </Context.Provider>
  );
}
export function SliceJobStatusBanner() {
  return <>{useSliceJobTracker().jobs}</>;
}
const styles = StyleSheet.create({ banner: { maxHeight: 180, flexGrow: 0 } });
