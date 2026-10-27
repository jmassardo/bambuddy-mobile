import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { slicingApi, type SliceSourceProps } from '@/api/slicing';
import { useServerStore } from '@/api/server';
import { useToast } from '@/contexts/ToastContext';
import { Box, Copy } from '@/components/slicing/Controls';
import { PrimaryButton } from '@/components/common/AppUI';
import { useTranslation } from '@/i18n';

type Tracked = SliceSourceProps & { jobId: number; enqueued: number };
const Context = createContext<{ trackJob: (id: number, source: SliceSourceProps) => void; jobs: React.ReactNode }>({ trackJob: () => { throw new Error('SliceJobTrackerProvider must be mounted.'); }, jobs: null });
export const useSliceJobTracker = () => useContext(Context);

export function SliceJobTrackerProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const server = useServerStore(s => s.serverUrl);
  const key = `slice-jobs:${server}`;
  const [tracked, setTracked] = useState<Tracked[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const client = useQueryClient();
  const { showToast } = useToast();
  const notified = useRef(new Set<string>());
  useEffect(() => {
    let active = true;
    setLoadedKey(null);
    setTracked([]);
    AsyncStorage.getItem(key).then(raw => {
      if (!active) return;
      try {
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) setTracked(parsed.filter((v): v is Tracked => !!v && typeof v === 'object' && typeof v.jobId === 'number' && typeof v.sourceId === 'number' && ['file', 'archive'].includes(v.sourceType)));
      } catch { /* Corrupt local tracking never prevents slicing. */ }
      setLoadedKey(key);
    });
    return () => { active = false; };
  }, [key]);
  useEffect(() => {
    if (loadedKey === key) AsyncStorage.setItem(key, JSON.stringify(tracked)).catch(() => {});
  }, [key, loadedKey, tracked]);
  const activeTracked = useMemo(() => loadedKey === key ? tracked : [], [loadedKey, key, tracked]);
  const jobs = useQueries({ queries: activeTracked.map(job => ({
    queryKey: ['trackedSliceJob', server, job.jobId],
    queryFn: () => slicingApi.job(job.jobId),
    refetchInterval: (query: { state: { data?: { status: string } } }) => ['completed', 'failed'].includes(query.state.data?.status ?? '') ? false as const : 1000,
    retry: 2,
  })) });
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') client.invalidateQueries({ queryKey: ['trackedSliceJob', server] });
    });
    return () => { clearInterval(timer); listener.remove(); };
  }, [client, server]);
  useEffect(() => {
    jobs.forEach((query, i) => {
      const state = query.data;
      const identity = `${server}:${activeTracked[i].jobId}`;
      if (!state || !['completed', 'failed'].includes(state.status) || notified.current.has(identity)) return;
      notified.current.add(identity);
      if (state.status === 'completed') {
        ['libraryFiles', 'archives', 'libraryFilePlates', 'archivePlates', 'libraryFile', 'archive', 'slicePlates', 'sliceFilamentReqs'].forEach(name => client.invalidateQueries({ queryKey: [name] }));
        showToast(t('slice.job.completed', { defaultValue: '{{name}}: slicing complete', name: activeTracked[i].sourceName }), 'success');
      } else showToast(state.error_detail || t('slice.job.failed', { defaultValue: 'Slicing failed' }), 'error');
    });
  }, [jobs, activeTracked, server, client, showToast, t]);
  const trackJob = useCallback((jobId: number, source: SliceSourceProps) => {
    setTracked(previous => previous.some(j => j.jobId === jobId) ? previous : [...previous, { ...source, jobId, enqueued: Date.now() }]);
  }, []);
  const content = activeTracked.length ? <ScrollView horizontal>
    {activeTracked.map((job, i) => {
      const query = jobs[i];
      const state = query.data;
      const progress = state?.progress;
      const terminal = !!state && ['completed', 'failed'].includes(state.status);
      return <Box key={job.jobId}>
        <Copy>{`${job.sourceName} · ${state?.status ?? 'pending'} · ${Math.floor((now - job.enqueued) / 1000)}s`}</Copy>
        {progress && <Copy>{`${progress.stage} · ${Math.round(progress.total_percent)}% · ${t('slice.job.plate', { defaultValue: 'Plate' })} ${progress.multi_plate_index ?? progress.plate_index}/${progress.multi_plate_count ?? progress.plate_count}`}</Copy>}
        {state?.error_detail && <Copy>{state.error_detail}</Copy>}
        {state?.result && <Copy>{`${state.result.name} · ${state.result.print_time_seconds}s · ${state.result.filament_used_g}g`}</Copy>}
        {state?.result && 'external_write_fallback' in state.result && !!state.result.external_write_fallback && <Copy>{state.result.external_write_fallback}</Copy>}
        {query.isError && <><Copy>{query.error.message}</Copy><PrimaryButton label={t('common.retry', { defaultValue: 'Retry' })} onPress={() => query.refetch()} /></>}
        {terminal && <PrimaryButton label={t('common.dismiss', { defaultValue: 'Dismiss' })} variant="secondary" onPress={() => setTracked(previous => previous.filter(j => j.jobId !== job.jobId))} />}
      </Box>;
    })}
  </ScrollView> : null;
  return <Context.Provider value={{ trackJob, jobs: content }}>{children}</Context.Provider>;
}
export function SliceJobStatusBanner() { return <>{useSliceJobTracker().jobs}</>; }
