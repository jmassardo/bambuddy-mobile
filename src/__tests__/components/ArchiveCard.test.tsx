import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ArchiveCard } from '@/components/archives/ArchiveCard';
import { setStreamToken } from '@/api/http';
import { useServerStore } from '@/api/server';
import type { Archive } from '@/types/api';

jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }),
}));
jest.mock('@/api/client', () => ({ api: jest.requireActual('@/api/archives').archivesApi }));

it.each([null, 1, 3])('shows the archived plate %s rather than the file default', async plateId => {
  useServerStore.setState({ serverUrl: 'https://farm.example', loading: false });
  setStreamToken('media-token');
  const archive = {
    id: 7, filename: 'Gear.3mf', status: 'completed', plate_id: plateId,
    created_at: '2026-10-29T12:00:00Z',
  } as Archive;
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await act(async () => {
      renderer = ReactTestRenderer.create(<ArchiveCard archive={archive} />);
    });
    const image = renderer.root.findAll(node => node.props.source?.uri)[0];
    expect(image.props.source.uri).toBe(plateId == null
      ? 'https://farm.example/api/v1/archives/7/thumbnail?token=media-token'
      : `https://farm.example/api/v1/archives/7/plate-thumbnail/${plateId}?token=media-token`);
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    setStreamToken(null);
    useServerStore.setState({ serverUrl: null });
  }
});
