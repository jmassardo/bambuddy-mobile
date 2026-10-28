import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssetPreviewModal } from '@/components/files/AssetPreviewModal';
import { ApiError, request, requestBlob } from '@/api/http';

let mockWebProps: {source: {html: string}; onMessage: (event: {nativeEvent: {data: string}}) => void} | undefined;
jest.mock('react-native-webview', () => ({WebView: (props: typeof mockWebProps) => {mockWebProps = props; return null;}}));
jest.mock('@/api/http', () => ({request: jest.fn(), requestBlob: jest.fn(), ApiError: class extends Error {
  status: number;
  constructor(message: string, code: number) { super(message); this.status = code; }
}}));
jest.mock('@/utils/share', () => ({blobToDataUrl: jest.fn(async () => 'data:application/octet-stream;base64,QQ=='), shareBlob: jest.fn()}));
jest.mock('@/contexts/AuthContext', () => ({useAuth: () => ({hasAnyPermission: () => true})}));
jest.mock('@/contexts/ToastContext', () => ({useToast: () => ({showToast: jest.fn()})}));
jest.mock('@/theme', () => ({useTheme: () => ({colors: {background: '#222', text: '#fff'}})}));

function TestProviders({children}: {children: React.ReactNode}) {
  const [client] = React.useState(() => new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}}}));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  jest.clearAllMocks(); mockWebProps = undefined;
  jest.mocked(requestBlob).mockResolvedValue({size: 1} as Blob);
});

test('a STEP preview downloads authenticated bytes and persists its actual rendered snapshot with thumbnail form field', async () => {
  await render(<AssetPreviewModal source={{fileId: 7, filename: 'triangle.step'}} onClose={jest.fn()} />, {wrapper: TestProviders});
  await waitFor(() => expect(mockWebProps?.source.html).toContain('triangle.step'));
  expect(requestBlob).toHaveBeenCalledWith('/library/files/7/download');
  mockWebProps!.onMessage({nativeEvent: {data: JSON.stringify({type: 'snapshot', data: 'data:image/png;base64,QQ=='})}});
  await waitFor(() => expect(requestBlob).toHaveBeenCalledWith('/library/files/7/preview-thumbnail', {method: 'POST', body: expect.any(FormData)}));
});

test('changing a toolpath plate fetches that actual plate rather than the default toolpath again', async () => {
  jest.mocked(request).mockResolvedValue({plates: [{index: 1, name: 'First'}, {index: 2, name: 'Second'}]});
  const result = await render(<AssetPreviewModal source={{fileId: 7, filename: 'job.gcode.3mf', mode: 'gcode'}} onClose={jest.fn()} />, {wrapper: TestProviders});
  await result.findByText('Plate 2 · Second');
  expect(requestBlob).toHaveBeenCalledWith('/library/files/7/gcode');
  await fireEvent.press(result.getByText('Plate 2 · Second'));
  await waitFor(() => expect(requestBlob).toHaveBeenCalledWith('/library/files/7/gcode?plate=2'));
});

test('a missing toolpath explains how to recover rather than reporting only HTTP 404', async () => {
  jest.mocked(requestBlob).mockRejectedValueOnce(new ApiError('HTTP 404', 404));
  const result = await render(<AssetPreviewModal source={{fileId: 7, filename: 'unsliced.3mf', mode: 'gcode'}} onClose={jest.fn()} />, {wrapper: TestProviders});
  await result.findByText('No toolpath was found for this file or plate. Choose another plate, or slice the source model first.');
  expect(result.getByText('Retry')).toBeTruthy();
});
