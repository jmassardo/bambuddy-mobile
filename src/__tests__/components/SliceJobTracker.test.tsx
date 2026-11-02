import React from 'react';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  SliceJobStatusBanner,
  SliceJobTrackerProvider,
  useSliceJobTracker,
} from '@/contexts/SliceJobTrackerContext';
import { slicingApi } from '@/api/slicing';
import type { SliceJobState } from '@/types/api';
const mockToast = jest.fn();
let mockServer = 'http://server-one';
jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }),
}));
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockToast }),
}));
jest.mock('@/api/server', () => ({
  useServerStore: (select: (state: { serverUrl: string }) => unknown) =>
    select({ serverUrl: mockServer }),
}));
jest.mock('@/api/slicing', () => ({ slicingApi: { job: jest.fn() } }));
const state: SliceJobState = {
  job_id: 7,
  status: 'running',
  kind: 'library_file',
  source_id: 4,
  source_name: 'object.3mf',
  created_at: '2026-10-27',
  started_at: null,
  completed_at: null,
  progress: {
    stage: 'Generating G-code',
    total_percent: 47,
    plate_percent: 20,
    plate_index: 1,
    plate_count: 2,
    multi_plate_index: 2,
    multi_plate_count: 5,
    updated_at: 1,
  },
};
function Launcher() {
  const { trackJob } = useSliceJobTracker();
  return (
    <Text
      onPress={() =>
        trackJob(7, {
          sourceType: 'file',
          sourceId: 4,
          sourceName: 'object.3mf',
        })
      }
    >
      Track slice
    </Text>
  );
}
const clients: QueryClient[] = [];
function wrap(children = <Launcher />) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  return {
    client,
    tree: (
      <QueryClientProvider client={client}>
        <SliceJobTrackerProvider>
          {children}
          <SliceJobStatusBanner />
        </SliceJobTrackerProvider>
      </QueryClientProvider>
    ),
  };
}
beforeEach(() => {
  jest.clearAllMocks();
  mockServer = 'http://server-one';
  const storage = new Map<string, string>();
  jest
    .mocked(AsyncStorage.getItem)
    .mockImplementation(async key => storage.get(key) ?? null);
  jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => {
    storage.set(key, value);
  });
});
afterEach(() => {
  clients.forEach(client => client.clear());
  clients.length = 0;
});
describe('Persistent slice jobs', () => {
  it('keeps progress after launch UI unmounts, persists final results, and invalidates only on successful completion', async () => {
    jest.mocked(slicingApi.job).mockResolvedValue(state);
    const { client, tree } = wrap();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const ui = await render(tree);
    await fireEvent.press(ui.getByText('Track slice'));
    await ui.findByText('Generating G-code · 47% · Plate 2/5');
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['libraryFiles'] });
    const completed: SliceJobState = {
      ...state,
      status: 'completed',
      progress: null,
      result: {
        library_file_id: 12,
        name: 'object.gcode.3mf',
        print_time_seconds: 3600,
        filament_used_g: 45,
        filament_used_mm: 1000,
        used_embedded_settings: false,
      },
    };
    jest.mocked(slicingApi.job).mockResolvedValue(completed);
    await client.invalidateQueries({ queryKey: ['trackedSliceJob'] });
    await ui.findByText('object.gcode.3mf · 3600s · 45g');
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['libraryFiles'] }),
    );
    await waitFor(async () =>
      expect(
        JSON.parse(
          (await AsyncStorage.getItem('slice-jobs:http://server-one'))!,
        )[0].final.status,
      ).toBe('completed'),
    );
    await ui.unmount();
    client.clear();
    jest.mocked(slicingApi.job).mockClear();
    const restored = await render(wrap(<Text>Different screen</Text>).tree);
    await restored.findByText('object.gcode.3mf · 3600s · 45g');
    expect(slicingApi.job).not.toHaveBeenCalled();
    await fireEvent.press(restored.getByText('Dismiss'));
    await waitFor(() =>
      expect(restored.queryByText('object.gcode.3mf · 3600s · 45g')).toBeNull(),
    );
    await restored.unmount();
  });
  it('isolates jobs by server and preserves actionable failure without invalidating final assets', async () => {
    jest
      .mocked(slicingApi.job)
      .mockResolvedValue({
        ...state,
        status: 'failed',
        error_detail: 'Sidecar stalled',
      });
    const { client, tree } = wrap();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const ui = await render(tree);
    await fireEvent.press(ui.getByText('Track slice'));
    await ui.findByText('Sidecar stalled');
    expect(mockToast).toHaveBeenCalledWith('Sidecar stalled', 'error');
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['archives'] });
    mockServer = 'http://server-two';
    await ui.rerender(tree);
    // A rerender with fresh children represents navigation/server switching.
    await ui.rerender(wrap(<Text>Second server</Text>).tree);
    await waitFor(() => expect(ui.queryByText('Sidecar stalled')).toBeNull());
    expect(
      await AsyncStorage.getItem('slice-jobs:http://server-one'),
    ).toContain('Sidecar stalled');
    await ui.unmount();
  });
});
