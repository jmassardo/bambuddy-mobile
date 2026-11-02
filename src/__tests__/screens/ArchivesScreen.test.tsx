import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ArchivesScreen from '@/screens/ArchivesScreen';
import { useArchiveFiltersStore } from '@/store/archiveFiltersStore';
import type { Archive } from '@/types/api';

const mockNavigation = { setOptions: jest.fn(), navigate: jest.fn() };
let mockArchives: Archive[] = [];
jest.mock('@react-native-clipboard/clipboard', () => ({ setString: jest.fn() }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));
jest.mock('@/api/client', () => ({ api: {
  getPrinters: async () => [{ id: 1, name: 'Printer One' }],
  getTags: async () => [],
  getArchiveStats: async () => ({}),
} }));
jest.mock('@/api/archiveWorkflows', () => ({ archiveWorkflows: {
  allArchives: async () => mockArchives,
} }));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 }, hasPermission: () => true }) }));
jest.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('@/hooks/useStreamToken', () => ({ useMediaToken: () => ({ token: null }) }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }) }));
jest.mock('@/components/archives/ArchiveCard', () => {
  const { Text } = require('react-native');
  return { ArchiveCard: ({ archive }: { archive: Archive }) => <Text>{archive.filename}</Text> };
});
jest.mock('@/components/archives/ArchiveBrowseControls', () => {
  const { Text } = require('react-native');
  return {
    ...jest.requireActual('@/components/archives/ArchiveBrowseControls'),
    ArchiveBrowseControls: () => <Text>Advanced archive filters</Text>,
    ArchiveBatchDialog: () => null,
    ArchiveTagCatalog: () => null,
  };
});
jest.mock('@/components/archives/ArchiveWorkflowUI', () => {
  const { Text } = require('react-native');
  return {
    ArchiveIngestionPanel: () => <Text>Archive import tools</Text>,
    ArchiveDeleteDialog: () => null,
    ArchivePhotoGallery: () => null,
    ConfirmOutcomeDialog: () => null,
  };
});
jest.mock('@/components/archives/CompareArchivesModal', () => ({ CompareArchivesModal: () => null }));
jest.mock('@/components/files/SliceModal', () => ({ SliceModal: () => null }));
jest.mock('@/components/slicing/RunWithPipelineModal', () => ({ RunWithPipelineModal: () => null }));
jest.mock('@/components/printers/PrintModal', () => ({ PrintModal: () => null }));

function TestProviders({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await useArchiveFiltersStore.getState().clearFilters();
  mockArchives = Array.from({ length: 55 }, (_, index) => ({
    id: index + 1,
    filename: `Part ${index + 1}`,
    status: 'completed',
    printer_id: index === 0 ? 1 : 2,
    created_at: new Date(Date.UTC(2026, 9, 28, 12) - index * 60000).toISOString(),
  } as Archive));
});

it('keeps archives ahead of collapsed filters and management tools', async () => {
  const screen = await render(<ArchivesScreen />, { wrapper: TestProviders });
  await screen.findByText('Part 1');
  expect(screen.queryByText('Advanced archive filters')).toBeNull();
  expect(screen.queryByText('Archive import tools')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Filters' }));
  expect(screen.getByText('Advanced archive filters')).toBeTruthy();
  await fireEvent.press(screen.getByText('Printer One'));
  await fireEvent.press(screen.getByRole('button', { name: 'Filters' }));
  expect(screen.queryByText('Advanced archive filters')).toBeNull();
  expect(screen.getByText('Part 1')).toBeTruthy();
  expect(screen.queryByText('Part 2')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'More' }));
  expect(screen.getByText('Archive import tools')).toBeTruthy();
});

it('keeps pagination after archive cards and opens the next page', async () => {
  const screen = await render(<ArchivesScreen />, { wrapper: TestProviders });
  await screen.findByText('Part 1');
  const rowsAndNext = screen.getAllByText(/^(Part \d+|Next)$/);
  expect(rowsAndNext[rowsAndNext.length - 1].props.children).toBe('Next');
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(screen.getByText('Part 51')).toBeTruthy());
  expect(screen.queryByText('Part 1')).toBeNull();
});
