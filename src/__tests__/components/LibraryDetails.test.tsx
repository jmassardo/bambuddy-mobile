import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LibraryFileDetails } from '@/components/files/LibraryFileDetails';
import { markdownHtml } from '@/components/files/FolderReadme';
import { filesApi } from '@/api/files';

jest.mock('@react-native-documents/picker', () => ({pick: jest.fn(), types: {images: 'image/*'}, isErrorWithCode: () => false, errorCodes: {OPERATION_CANCELED: 'CANCEL'}}));
jest.mock('react-native-webview', () => ({WebView: () => null}));
jest.mock('@/components/files/AssetPreviewModal', () => ({AssetPreviewModal: () => null}));
jest.mock('@/api/files', () => ({filesApi: {
  getLibraryFile: jest.fn(async () => ({id: 7, notes: 'Saved notes', external_url: 'https://example.test/part', photos: []})),
  updateLibraryFile: jest.fn(async () => ({})),
}}));
jest.mock('@/contexts/AuthContext', () => ({useAuth: () => ({hasPermission: () => true, authEnabled: false})}));
jest.mock('@/contexts/ToastContext', () => ({useToast: () => ({showToast: jest.fn()})}));
jest.mock('@/theme', () => ({useTheme: () => ({colors: new Proxy({}, {get: () => '#888888'})})}));

test('a full-detail refresh after a photo operation preserves unsaved notes and links', async () => {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}, mutations: {retry: false, gcTime: Infinity}}});
  const result = await render(<QueryClientProvider client={client}><LibraryFileDetails fileId={7} /></QueryClientProvider>);
  const notes = await result.findByDisplayValue('Saved notes');
  await fireEvent.changeText(notes, 'Unsaved result observations');
  await fireEvent.changeText(result.getByDisplayValue('https://example.test/part'), 'https://example.test/new');
  await act(() => { client.setQueryData(['libraryFileDetails', 7], {id: 7, notes: 'Saved notes', external_url: 'https://example.test/part', photos: []}); });
  expect(result.getByDisplayValue('Unsaved result observations')).toBeTruthy();
  await fireEvent.press(result.getByText('Save'));
  await waitFor(() => expect(filesApi.updateLibraryFile).toHaveBeenCalledWith(7, {notes: 'Unsaved result observations', external_url: 'https://example.test/new'}));
  client.clear();
});

test('README renders headings, lists, tables and code while allowing only web links', () => {
  const html = markdownHtml('# Guide\n- item\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```js\n<script>alert(1)</script>\n```\n[Open](https://example.test/docs)\n[No](javascript:alert)');
  expect(html).toContain('<h1>Guide</h1>');
  expect(html).toContain('<li>item</li>');
  expect(html).toContain('<table>');
  expect(html).toContain('<pre><code>');
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('href="https://example.test/docs"');
  expect(html).not.toContain('href="javascript:');
  expect(html).not.toContain('<script>');
});
