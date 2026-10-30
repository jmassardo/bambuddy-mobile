import React from 'react';
import { Alert, Platform } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrinterCameraSettingsSection } from '@/components/settings/PrinterCameraSettingsSection';
import { PlateManagement } from '@/components/printers/PlateManagement';
import { CameraSnapshot } from '@/components/printers/CameraSnapshot';
import { ScopedCameraStream } from '@/components/printers/ScopedCameraStream';
import { OverlayPreview, allowOverlayNavigation } from '@/components/printers/OverlayPreview';
import { camerasApi } from '@/api/cameras';
import { printersApi } from '@/api/printers';
import { api } from '@/api/client';
import type { Printer } from '@/types/api';

let mockMediaReady = true;
let mockMediaToken: string | null = 'scoped-media';
let mockPermission = true;
const mockWebView = jest.fn();
jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: { text: '#fff', accent: '#0f0' } }),
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => mockPermission }),
}));
jest.mock('@/hooks/useStreamToken', () => ({
  useCameraToken: () => ({ isReady: mockMediaReady, token: mockMediaToken }),
}));
jest.mock('@/api/cameras', () => ({
  camerasApi: {
    references: jest.fn(), checkPlate: jest.fn(), calibrate: jest.fn(),
    renameReference: jest.fn(), deleteReference: jest.fn(), testExternal: jest.fn(),
    referenceImage: (id: number, index: number) => `https://farm/${id}/${index}?token=scoped`,
    snapshot: (id: number, seed: number) => `https://farm/${id}/snapshot?t=${seed}`,
  },
}));
jest.mock('@/api/printers', () => ({
  printersApi: { getPrinters: jest.fn(), updatePrinter: jest.fn(), getCameraStreamUrl: () => 'https://farm/7/stream?token=scoped-media' },
}));
jest.mock('@/api/client', () => ({ api: { updatePrinter: jest.fn() } }));
jest.mock('@/api/http', () => ({ getAuthToken: () => 'login-secret' }));
jest.mock('react-native-webview', () => ({
  WebView: (props: object) => { mockWebView(props); return null; },
}));
jest.mock('@/components/common/AppUI', () => {
  const { View: MockView, Text: MockText, TextInput: MockTextInput, Pressable: MockPressable } = require('react-native');
  return {
    SectionCard: ({ title, children }: { title?: string; children: React.ReactNode }) => <MockView><MockText>{title}</MockText>{children}</MockView>,
    TextField: ({ label, ...props }: { label: string }) => <MockTextInput accessibilityLabel={label} {...props} />,
    PrimaryButton: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => <MockPressable accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled }} onPress={onPress}><MockText>{label}</MockText></MockPressable>,
  };
});

const printer = {
  id: 7, name: 'Printer Seven', external_camera_enabled: true,
  external_camera_url: 'rtsp://old/live', external_camera_type: 'rtsp',
  external_camera_snapshot_url: null, camera_rotation: 90,
  plate_detection_roi: { x: 0.1, y: 0.2, w: 0.7, h: 0.6 },
} as Printer;

function Wrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPermission = true;
  mockMediaReady = true;
  mockMediaToken = 'scoped-media';
  jest.mocked(printersApi.getPrinters).mockResolvedValue([printer as Printer & Record<string, unknown>]);
  jest.mocked(printersApi.updatePrinter).mockResolvedValue({});
  jest.mocked(api.updatePrinter).mockResolvedValue({});
  jest.mocked(camerasApi.references).mockResolvedValue({ references: [], max_references: 5 });
});

it('loads per-printer values, tests current USB/snapshot input, and persists every integration field', async () => {
  const result = await render(<PrinterCameraSettingsSection />, { wrapper: Wrapper });
  await waitFor(() => expect(result.getByLabelText('Stream URL').props.value).toBe('rtsp://old/live'));
  await fireEvent.press(result.getByText('usb'));
  await fireEvent.changeText(result.getByLabelText('USB device path (e.g. /dev/video0)'), '/dev/video2');
  jest.mocked(camerasApi.testExternal).mockResolvedValue({ success: true, resolution: '1920x1080', coalesced: true });
  await fireEvent.press(result.getByText('Test current stream'));
  await waitFor(() => expect(camerasApi.testExternal).toHaveBeenCalledWith(7, '/dev/video2', 'usb'));
  await waitFor(() => expect(result.getByText(/Shared capture:/)).toBeTruthy());
  expect(result.getByText('Resolution: 1920x1080')).toBeTruthy();
  await fireEvent.changeText(result.getByLabelText('Dedicated snapshot URL (optional)'), 'https://cam/new.jpg');
  jest.mocked(camerasApi.testExternal).mockResolvedValue({ success: false, error: 'Snapshot denied' });
  await fireEvent.press(result.getByText('Test current snapshot URL'));
  await waitFor(() => expect(result.getByText('Snapshot denied')).toBeTruthy());
  expect(camerasApi.testExternal).toHaveBeenLastCalledWith(7, 'https://cam/new.jpg', 'snapshot');
  await fireEvent.press(result.getByText('180'));
  await fireEvent.press(result.getByText('Save printer camera'));
  await waitFor(() => expect(printersApi.updatePrinter).toHaveBeenCalledWith(7, {
    external_camera_enabled: true, external_camera_url: '/dev/video2',
    external_camera_type: 'usb', external_camera_snapshot_url: 'https://cam/new.jpg', camera_rotation: 180,
  }));
});

it('cancels unsaved camera values without a request and prevents read-only saves/tests', async () => {
  const result = await render(<PrinterCameraSettingsSection />, { wrapper: Wrapper });
  await waitFor(() => expect(result.getByLabelText('Stream URL')).toBeTruthy());
  await fireEvent.changeText(result.getByLabelText('Stream URL'), 'rtsp://new/live');
  await fireEvent.press(result.getByText('Cancel'));
  expect(result.getByLabelText('Stream URL').props.value).toBe('rtsp://old/live');
  expect(printersApi.updatePrinter).not.toHaveBeenCalled();
  mockPermission = false;
  await result.rerender(<PrinterCameraSettingsSection />);
  expect(result.getByText('Save printer camera').parent?.props.accessibilityState.disabled).toBe(true);
  expect(result.getByText('Test current stream').parent?.props.accessibilityState.disabled).toBe(true);
});

it('restores persisted printer settings on revisit and supports disabling a camera with nullable URLs', async () => {
  let saved = printer;
  jest.mocked(printersApi.getPrinters).mockImplementation(async () => [saved as Printer & Record<string, unknown>]);
  jest.mocked(printersApi.updatePrinter).mockImplementation(async (_id, data) => {
    saved = { ...saved, ...data };
    return {};
  });
  const result = await render(<PrinterCameraSettingsSection />, { wrapper: Wrapper });
  await waitFor(() => expect(result.getByLabelText('Stream URL')).toBeTruthy());
  await fireEvent(result.getByLabelText('Use external camera'), 'valueChange', false);
  await fireEvent.changeText(result.getByLabelText('Stream URL'), '');
  await fireEvent.press(result.getByText('Save printer camera'));
  await waitFor(() => expect(printersApi.updatePrinter).toHaveBeenCalledWith(7, {
    external_camera_enabled: false, external_camera_url: null, external_camera_type: 'rtsp',
    external_camera_snapshot_url: null, camera_rotation: 90,
  }));
  await result.unmount();
  const revisited = await render(<PrinterCameraSettingsSection />, { wrapper: Wrapper });
  await waitFor(() => expect(revisited.getByLabelText('Use external camera').props.value).toBe(false));
  expect(revisited.getByLabelText('Stream URL').props.value).toBe('');
  expect(revisited.getByText('✓ 90')).toBeTruthy();
});

it('shows check analysis and edits bounded ROI while cancel never persists', async () => {
  jest.mocked(camerasApi.checkPlate).mockResolvedValue({
    is_empty: false, confidence: 0.85, difference_percent: 5.2, message: 'Object detected',
    has_debug_image: true, debug_image_url: 'data:image/jpeg;base64,abc', needs_calibration: false,
  });
  const result = await render(<PlateManagement printer={printer} />, { wrapper: Wrapper });
  await fireEvent.press(result.getByText('Check plate now'));
  await waitFor(() => expect(result.getByText('Object detected')).toBeTruthy());
  expect(result.getByText('Confidence: 85.0% · Difference: 5.20%')).toBeTruthy();
  expect(result.getByLabelText('Plate analysis image')).toBeTruthy();
  await fireEvent.press(result.getByText('Edit detection area'));
  await fireEvent.changeText(result.getByLabelText('x (%)'), '90');
  expect(result.getByText('Save detection area').parent?.props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(result.getByText('Cancel'));
  expect(api.updatePrinter).not.toHaveBeenCalled();
  await fireEvent.press(result.getByText('Edit detection area'));
  await fireEvent.changeText(result.getByLabelText('w (%)'), '50');
  await fireEvent.press(result.getByText('Save detection area'));
  await waitFor(() => expect(api.updatePrinter).toHaveBeenCalledWith(7, { plate_detection_roi: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 } }));
});

it('renames references and confirms destructive deletion', async () => {
  jest.mocked(camerasApi.references).mockResolvedValue({ references: [
    { index: 0, label: 'Old reference', timestamp: '2026-10-27', has_image: true, thumbnail_url: '' },
  ], max_references: 5 });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const result = await render(<PlateManagement printer={printer} />, { wrapper: Wrapper });
  await waitFor(() => expect(result.getByLabelText('Reference label')).toBeTruthy());
  await fireEvent.changeText(result.getByLabelText('Reference label'), 'Clean PEI');
  await fireEvent.press(result.getByText('Save'));
  await waitFor(() => expect(camerasApi.renameReference).toHaveBeenCalledWith(7, 0, 'Clean PEI'));
  await fireEvent.press(result.getByText('Delete'));
  expect(camerasApi.deleteReference).not.toHaveBeenCalled();
  const confirm = alert.mock.calls[0][2]?.find(button => button.style === 'destructive');
  await act(async () => confirm?.onPress?.());
  await waitFor(() => expect(camerasApi.deleteReference).toHaveBeenCalledWith(7, 0));
  alert.mockRestore();
});

it('refreshes snapshots without any continuous stream and unmounts while inactive', async () => {
  const result = await render(<CameraSnapshot printerId={7} />);
  const image = result.getByLabelText('Camera snapshot');
  const firstUrl = image.props.source.uri;
  await fireEvent(image, 'error');
  expect(result.getByText(/Snapshot unavailable/)).toBeTruthy();
  await fireEvent.press(result.getByText('Refresh snapshot'));
  expect(result.getByLabelText('Camera snapshot').props.source.uri).not.toBe(firstUrl);
  await result.rerender(<CameraSnapshot printerId={7} active={false} />);
  expect(result.queryByLabelText('Camera snapshot')).toBeNull();
});

it('waits for scoped media readiness before requesting snapshots', async () => {
  mockMediaReady = false;
  mockMediaToken = null;
  const result = await render(<CameraSnapshot printerId={7} />);
  expect(result.queryByLabelText('Camera snapshot')).toBeNull();
  mockMediaReady = true;
  mockMediaToken = 'fresh-scoped-token';
  await result.rerender(<CameraSnapshot printerId={7} />);
  expect(result.getByLabelText('Camera snapshot')).toBeTruthy();
});

it('uses an isolated scoped-only iOS wall transport and recovers after token replacement', async () => {
  const platform = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  const result = await render(<ScopedCameraStream printerId={7} />);
  const props = mockWebView.mock.calls.at(-1)?.[0];
  expect(props.source.html).toContain('token=scoped-media');
  expect(props.source.html).not.toContain('login-secret');
  expect(props.javaScriptEnabled).toBe(false);
  expect(props.incognito).toBe(true);
  expect(props.onShouldStartLoadWithRequest({ url: 'https://external.example' })).toBe(false);
  await act(async () => props.onError());
  expect(result.getByText(/Live stream unavailable/)).toBeTruthy();
  mockMediaToken = 'replacement';
  await result.rerender(<ScopedCameraStream printerId={7} />);
  expect(result.queryByText(/Live stream unavailable/)).toBeNull();
  await result.unmount();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
});

it('isolates overlay preview to the exact trusted route and session bootstrap', async () => {
  const url = 'https://farm/overlay/7?show=status&token=overlay';
  await render(<OverlayPreview url={url} />);
  const props = mockWebView.mock.calls.at(-1)?.[0];
  expect(props.incognito).toBe(true);
  expect(props.sharedCookiesEnabled).toBe(false);
  expect(props.injectedJavaScriptBeforeContentLoaded).toContain('sessionStorage');
  expect(props.source.uri).not.toContain('login-secret');
  expect(allowOverlayNavigation(url, url)).toBe(true);
  expect(allowOverlayNavigation(url, 'https://farm/login')).toBe(false);
  expect(allowOverlayNavigation(url, 'https://evil/overlay/7?show=status&token=overlay')).toBe(false);
  expect(allowOverlayNavigation(url, 'file:///etc/passwd')).toBe(false);
});
