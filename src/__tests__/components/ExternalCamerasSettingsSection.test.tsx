import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExternalCamerasSettingsSection } from '@/components/settings/ExternalCamerasSettingsSection';
import type { SettingsScreenController } from '@/components/settings/useSettingsScreenController';
import { request } from '@/api/http';
import type { ExternalCameraConnectionResult, Printer } from '@/types/api';

let mockCanUpdate = true;
let mockCanViewCamera = true;

jest.mock('@/theme', () => ({
  useTheme: () => ({
    colors: new Proxy({}, { get: () => '#888888' }),
    isDark: true,
  }),
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    hasPermission: (permission: string) =>
      permission === 'printers:update' ? mockCanUpdate : mockCanViewCamera,
  }),
}));
jest.mock('@/api/http', () => ({ request: jest.fn() }));

const mockRequest = request as jest.MockedFunction<
  (endpoint: string, options?: RequestInit) => Promise<unknown>
>;
const printer = {
  id: 7,
  name: 'Printer Seven',
  external_camera_enabled: true,
  external_camera_url: 'rtsp://old/live',
  external_camera_type: 'rtsp',
  external_camera_snapshot_url: null,
  camera_rotation: 90,
  plate_detection_roi: { x: 0.1, y: 0.2, w: 0.7, h: 0.6 },
} as Printer;
let storedPrinters: Printer[];
let connectionResult: ExternalCameraConnectionResult;

function Wrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderSection() {
  return render(
    <ExternalCamerasSettingsSection controller={{} as SettingsScreenController} />,
    { wrapper: Wrapper },
  );
}

async function loadedSection() {
  const result = await renderSection();
  await waitFor(() => expect(result.getByLabelText('Stream URL').props.value).toBe('rtsp://old/live'));
  return result;
}

beforeEach(() => {
  mockCanUpdate = true;
  mockCanViewCamera = true;
  storedPrinters = [{ ...printer }];
  connectionResult = { success: true, resolution: '1920x1080' };
  mockRequest.mockReset();
  mockRequest.mockImplementation(async (endpoint, options) => {
    if (endpoint === '/printers/') return storedPrinters;
    if (options?.method === 'PATCH') {
      const id = Number(endpoint.split('/').at(-1));
      const update = JSON.parse(String(options.body)) as Partial<Printer>;
      storedPrinters = storedPrinters.map(current => current.id === id ? { ...current, ...update } : current);
      return {};
    }
    if (endpoint.startsWith('/printers/') && endpoint.includes('/camera/external/test?')) {
      return connectionResult;
    }
    throw new Error(`Unexpected request: ${endpoint}`);
  });
});

describe('ExternalCamerasSettingsSection per-printer configuration', () => {
  it('loads the supported printer fields and all camera types and rotations through the mounted editor', async () => {
    const result = await loadedSection();
    expect(mockRequest).toHaveBeenCalledWith('/printers/');
    expect(result.getByText('Printer Seven')).toBeTruthy();
    expect(result.getByLabelText('Use external camera').props.value).toBe(true);
    expect(result.getByLabelText('Dedicated snapshot URL (optional)').props.value).toBe('');
    for (const option of ['mjpeg', 'rtsp', 'snapshot', 'usb', '0', '90', '180', '270']) {
      expect(result.getByRole('button', { name: option })).toBeTruthy();
    }
  });

  it('does not invent a camera configuration when the printer list is empty', async () => {
    storedPrinters = [];
    const result = await renderSection();
    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith('/printers/'));
    expect(result.getByText(/External cameras are configured on each printer/)).toBeTruthy();
    expect(result.queryByLabelText('Stream URL')).toBeNull();
    expect(result.queryByRole('button', { name: 'Save printer camera' })).toBeNull();
    expect(mockRequest.mock.calls).toEqual([['/printers/']]);
  });

  it('keeps edits and connection tests scoped to the selected printer instead of a separate camera record', async () => {
    storedPrinters.push({ ...printer, id: 8, name: 'Printer Eight' });
    const result = await renderSection();
    await waitFor(() => expect(result.getByText('Printer Eight')).toBeTruthy());
    await fireEvent.changeText(result.getAllByLabelText('Stream URL')[1], 'rtsp://eight/new');
    await fireEvent.press(result.getAllByRole('button', { name: 'Test current stream' })[1]);
    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith(
      '/printers/8/camera/external/test?url=rtsp%3A%2F%2Feight%2Fnew&camera_type=rtsp',
      { method: 'POST' },
    ));
    expect(result.getAllByLabelText('Stream URL')[0].props.value).toBe('rtsp://old/live');
  });

  it('saves every integration field to the actual printer endpoint and restores those values on revisit', async () => {
    const result = await loadedSection();
    await fireEvent.press(result.getByRole('button', { name: 'usb' }));
    await fireEvent.changeText(result.getByLabelText('USB device path (e.g. /dev/video0)'), '/dev/video2');
    await fireEvent.changeText(result.getByLabelText('Dedicated snapshot URL (optional)'), 'https://camera/frame.jpg');
    await fireEvent.press(result.getByRole('button', { name: '270' }));
    await fireEvent.press(result.getByRole('button', { name: 'Save printer camera' }));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith('/printers/7', {
      method: 'PATCH',
      body: JSON.stringify({
        external_camera_enabled: true,
        external_camera_url: '/dev/video2',
        external_camera_type: 'usb',
        external_camera_snapshot_url: 'https://camera/frame.jpg',
        camera_rotation: 270,
      }),
    }));
    await waitFor(() => expect(result.getByText('Settings saved')).toBeTruthy());
    await result.unmount();
    const revisited = await renderSection();
    await waitFor(() => expect(revisited.getByLabelText('USB device path (e.g. /dev/video0)').props.value).toBe('/dev/video2'));
    expect(revisited.getByLabelText('Dedicated snapshot URL (optional)').props.value).toBe('https://camera/frame.jpg');
    expect(revisited.getByRole('button', { name: '270', selected: true })).toBeTruthy();
  });

  it('supports disabling a printer camera and clearing optional URLs with null, without deleting a camera record', async () => {
    const result = await loadedSection();
    await fireEvent(result.getByLabelText('Use external camera'), 'valueChange', false);
    await fireEvent.changeText(result.getByLabelText('Stream URL'), '');
    await fireEvent.press(result.getByRole('button', { name: 'Save printer camera' }));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith('/printers/7', {
      method: 'PATCH',
      body: JSON.stringify({
        external_camera_enabled: false,
        external_camera_url: null,
        external_camera_type: 'rtsp',
        external_camera_snapshot_url: null,
        camera_rotation: 90,
      }),
    }));
    expect(mockRequest.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false);
  });

  it('cancels unsaved field, enable, type and rotation changes without persisting', async () => {
    const result = await loadedSection();
    await fireEvent(result.getByLabelText('Use external camera'), 'valueChange', false);
    await fireEvent.press(result.getByRole('button', { name: 'usb' }));
    await fireEvent.changeText(result.getByLabelText('USB device path (e.g. /dev/video0)'), '/dev/video4');
    await fireEvent.changeText(result.getByLabelText('Dedicated snapshot URL (optional)'), 'https://new/frame.jpg');
    await fireEvent.press(result.getByRole('button', { name: '180' }));
    await fireEvent.press(result.getByRole('button', { name: 'Cancel' }));
    expect(result.getByLabelText('Use external camera').props.value).toBe(true);
    expect(result.getByLabelText('Stream URL').props.value).toBe('rtsp://old/live');
    expect(result.getByLabelText('Dedicated snapshot URL (optional)').props.value).toBe('');
    expect(result.getByRole('button', { name: '90', selected: true })).toBeTruthy();
    expect(mockRequest.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false);
  });

  it('tests the current unsaved stream input and displays its returned resolution', async () => {
    const result = await loadedSection();
    await fireEvent.changeText(result.getByLabelText('Stream URL'), 'rtsp://camera/new?key=a&b=c');
    await fireEvent.press(result.getByRole('button', { name: 'Test current stream' }));
    await waitFor(() => expect(result.getByText('Resolution: 1920x1080')).toBeTruthy());
    expect(mockRequest).toHaveBeenCalledWith(
      '/printers/7/camera/external/test?url=rtsp%3A%2F%2Fcamera%2Fnew%3Fkey%3Da%26b%3Dc&camera_type=rtsp',
      { method: 'POST' },
    );
    expect(result.getByText('Connection successful')).toBeTruthy();
    expect(mockRequest.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false);
  });

  it('independently tests the dedicated snapshot URL and distinguishes shared capture from connection failure', async () => {
    const result = await loadedSection();
    connectionResult = { success: true, resolution: '640x480', coalesced: true };
    await fireEvent.press(result.getByRole('button', { name: 'Test current stream' }));
    await waitFor(() => expect(result.getByText(/Shared capture: this frame came from an existing capture/)).toBeTruthy());
    connectionResult = { success: false, error: 'Snapshot denied' };
    await fireEvent.changeText(result.getByLabelText('Dedicated snapshot URL (optional)'), 'https://camera/snapshot.jpg');
    await fireEvent.press(result.getByRole('button', { name: 'Test current snapshot URL' }));
    await waitFor(() => expect(result.getByText('Snapshot denied')).toBeTruthy());
    expect(mockRequest).toHaveBeenCalledWith(
      '/printers/7/camera/external/test?url=https%3A%2F%2Fcamera%2Fsnapshot.jpg&camera_type=snapshot',
      { method: 'POST' },
    );
    expect(result.getByText('Resolution: 640x480')).toBeTruthy();
  });

  it('disables a pending stream test without blocking the independent snapshot test', async () => {
    const result = await loadedSection();
    await fireEvent.changeText(result.getByLabelText('Dedicated snapshot URL (optional)'), 'https://camera/frame.jpg');
    let resolveTest: ((value: ExternalCameraConnectionResult) => void) | undefined;
    mockRequest.mockImplementationOnce(() => new Promise<ExternalCameraConnectionResult>(resolve => { resolveTest = resolve; }));
    await fireEvent.press(result.getByRole('button', { name: 'Test current stream' }));
    await waitFor(() => expect(result.getByRole('button', { name: 'Test current stream' }).props.accessibilityState).toMatchObject({ disabled: true, busy: true }));
    expect(result.getByRole('button', { name: 'Test current snapshot URL' }).props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(result.getByRole('button', { name: 'Test current stream' }));
    expect(mockRequest.mock.calls.filter(([endpoint]) => endpoint.includes('/external/test?'))).toHaveLength(1);
    await act(async () => { resolveTest?.({ success: true, resolution: '800x600' }); });
    await waitFor(() => expect(result.getByText('Resolution: 800x600')).toBeTruthy());
  });

  it('keeps printer settings read-only without printers:update while allowing authorized camera tests', async () => {
    mockCanUpdate = false;
    const result = await loadedSection();
    expect(result.getByLabelText('Stream URL').props.editable).toBe(false);
    expect(result.getByLabelText('Dedicated snapshot URL (optional)').props.editable).toBe(false);
    expect(result.getByLabelText('Use external camera').props.disabled).toBe(true);
    for (const name of ['usb', '180', 'Save printer camera']) {
      expect(result.getByRole('button', { name }).props.accessibilityState.disabled).toBe(true);
    }
    await fireEvent.press(result.getByRole('button', { name: 'Save printer camera' }));
    await fireEvent.press(result.getByRole('button', { name: 'Test current stream' }));
    await waitFor(() => expect(result.getByText('Connection successful')).toBeTruthy());
    expect(mockRequest.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false);
  });

  it('requires camera:view for tests independently of printer-update permission', async () => {
    mockCanViewCamera = false;
    const result = await loadedSection();
    await fireEvent.changeText(result.getByLabelText('Dedicated snapshot URL (optional)'), 'https://camera/frame.jpg');
    for (const name of ['Test current stream', 'Test current snapshot URL']) {
      expect(result.getByRole('button', { name }).props.accessibilityState.disabled).toBe(true);
      await fireEvent.press(result.getByRole('button', { name }));
    }
    expect(result.getByRole('button', { name: 'Save printer camera' }).props.accessibilityState.disabled).toBe(false);
    expect(mockRequest.mock.calls.some(([endpoint]) => endpoint.includes('/external/test?'))).toBe(false);
  });

  it('validates USB device paths and HTTP snapshot URLs before save or test', async () => {
    const result = await loadedSection();
    await fireEvent.press(result.getByRole('button', { name: 'usb' }));
    await fireEvent.changeText(result.getByLabelText('USB device path (e.g. /dev/video0)'), '/dev/null');
    await fireEvent.changeText(result.getByLabelText('Dedicated snapshot URL (optional)'), 'file:///camera.jpg');
    expect(result.getByText(/Enter a valid stream URL/)).toBeTruthy();
    expect(result.getByText('The dedicated snapshot URL must use HTTP or HTTPS.')).toBeTruthy();
    for (const name of ['Test current stream', 'Test current snapshot URL', 'Save printer camera']) {
      expect(result.getByRole('button', { name }).props.accessibilityState.disabled).toBe(true);
    }
    expect(mockRequest.mock.calls).toEqual([['/printers/']]);
  });

  it('exposes printer-list failures and retries against the actual printer endpoint', async () => {
    mockRequest.mockRejectedValueOnce(new Error('Printer list unavailable'));
    const result = await renderSection();
    await waitFor(() => expect(result.getByRole('button', { name: 'Retry' })).toBeTruthy());
    await fireEvent.press(result.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(result.getByText('Printer Seven')).toBeTruthy());
    expect(mockRequest.mock.calls).toEqual([['/printers/'], ['/printers/']]);
  });
});
