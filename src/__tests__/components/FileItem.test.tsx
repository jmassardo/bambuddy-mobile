import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { FileItem } from '@/components/files/FileItem';
import { setStreamToken } from '@/api/http';
import { useServerStore } from '@/api/server';

jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }),
}));
jest.mock('@/api/client', () => ({
  api: {
    getLibraryFileThumbnailUrl: (id: number) =>
      jest.requireActual('@/api/http').buildMediaUrl(`/library/files/${id}/thumbnail`),
  },
}));

it('recovers a failed file thumbnail when scoped image access resolves or refreshes', async () => {
  useServerStore.setState({ serverUrl: 'https://farm.example', loading: false });
  setStreamToken(null);
  const item = { id: 7, filename: 'Gear.3mf' };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const images = () => renderer.root.findAll(node => node.props.source?.uri && node.props.onError);
  try {
    await act(async () => {
      renderer = ReactTestRenderer.create(<FileItem item={item} onPress={jest.fn()} />);
    });
    await act(async () => images()[0].props.onError());
    expect(images()).toHaveLength(0);
    await act(async () => setStreamToken('first-media'));
    expect(images()[0].props.source.uri).toBe('https://farm.example/api/v1/library/files/7/thumbnail?token=first-media');
    await act(async () => images()[0].props.onError());
    await act(async () => setStreamToken('fresh-media'));
    expect(images()[0].props.source.uri).toBe('https://farm.example/api/v1/library/files/7/thumbnail?token=fresh-media');
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    setStreamToken(null);
    useServerStore.setState({ serverUrl: null });
  }
});
