import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LocationsModal } from '@/components/inventory/LocationsModal';
import { api } from '@/api/client';
import type { StorageLocation } from '@/types/api';

jest.mock('@/api/client', () => ({
  api: {
    getLocations: jest.fn(),
    createLocation: jest.fn(),
    updateLocation: jest.fn(),
    deleteLocation: jest.fn(),
  },
}));
jest.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }) }));

const location = {
  id: 1, name: 'Shelf A', identifier: 'A', address: 'Old address', notes: 'Old notes', spool_count: 0,
} as StorageLocation;

async function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  return render(<QueryClientProvider client={client}><LocationsModal visible onClose={jest.fn()} /></QueryClientProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(api.getLocations).mockResolvedValue([{ ...location }]);
  jest.mocked(api.createLocation).mockResolvedValue({ ...location });
});

it('clears every edited field before creating a different location', async () => {
  const screen = await mount();
  await fireEvent.press(await screen.findByText('Edit'));
  expect(screen.getByDisplayValue('Old address')).toBeTruthy();
  expect(screen.getByDisplayValue('Old notes')).toBeTruthy();
  await fireEvent.press(screen.getByText('Cancel edit'));
  expect(screen.queryByDisplayValue('Old address')).toBeNull();
  expect(screen.queryByDisplayValue('Old notes')).toBeNull();
  await fireEvent.changeText(screen.getByPlaceholderText('Shelf A'), 'Fresh location');
  await fireEvent.press(screen.getByText('Create location'));
  await waitFor(() => expect(api.createLocation).toHaveBeenCalledWith({
    name: 'Fresh location', identifier: null, address: null, notes: null,
  }));
  expect(api.updateLocation).not.toHaveBeenCalled();
});

it('distinguishes loading and failure from an empty list and allows retry', async () => {
  jest.mocked(api.getLocations).mockRejectedValueOnce(new Error('Locations unavailable')).mockResolvedValue([]);
  const screen = await mount();
  expect(screen.queryByText('No locations yet')).toBeNull();
  await screen.findByText('Locations unavailable');
  expect(screen.queryByText('No locations yet')).toBeNull();
  await fireEvent.press(screen.getByText('Retry'));
  await screen.findByText('No locations yet');
  expect(screen.queryByText('Locations unavailable')).toBeNull();
});
