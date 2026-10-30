import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProjectsScreen from '@/screens/ProjectsScreen';
import { api } from '@/api/client';

const mockNavigation = { setOptions: jest.fn(), navigate: jest.fn() };
let mockPermissions: Set<string> | null = null;
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: (permission: string) => mockPermissions === null || mockPermissions.has(permission) }) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));
jest.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }) }));
jest.mock('@react-native-documents/picker', () => ({ pick: jest.fn(), types: { images: 'images' } }));
jest.mock('@/components/projects/ProjectActionModals', () => ({ ProjectBatchPrintModal: () => null }));
jest.mock('@/components/projects/ProjectTransferActions', () => ({ ProjectTransferActions: () => null }));
jest.mock('@/api/client', () => ({
  api: { getProjects: jest.fn(), createProject: jest.fn(), updateProject: jest.fn() },
}));

const projects = [
  { id: 1, name: 'Root', parent_id: null, target_sets: 5 },
  { id: 2, name: 'Child', parent_id: 1 },
  { id: 3, name: 'Grandchild', parent_id: 2 },
  { id: 4, name: 'Other', parent_id: null },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = null;
  jest.mocked(api.getProjects).mockResolvedValue(projects as never);
  jest.mocked(api.createProject).mockResolvedValue({ id: 5 });
  jest.mocked(api.updateProject).mockResolvedValue({});
});

async function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  const screen = await render(<QueryClientProvider client={client}><ProjectsScreen /></QueryClientProvider>);
  await screen.findByText('Root');
  return screen;
}

it('expands nested branches and can search a collapsed descendant without hiding its ancestors', async () => {
  const screen = await setup();
  expect(screen.queryByText('Child')).toBeNull();
  await fireEvent.press(screen.getByText('Expand subprojects'));
  await screen.findByText('Child');
  await fireEvent.press(screen.getByText('Expand subprojects'));
  await screen.findByText('Grandchild');
  await fireEvent.press(screen.getAllByText('Collapse subprojects')[0]);
  expect(screen.queryByText('Grandchild')).toBeNull();
  await fireEvent.changeText(screen.getByPlaceholderText('Search projects'), 'Grandchild');
  await screen.findByText('Grandchild');
  expect(screen.getByText('Root')).toBeTruthy();
  expect(screen.getByText('Child')).toBeTruthy();
});

it('creates nested projects with complete-set targets and prevents selecting descendant parents while editing', async () => {
  const screen = await setup();
  await fireEvent.press(screen.getByRole('button', { name: 'Project' }));
  await fireEvent.changeText(screen.getByLabelText('Name'), 'New assembly');
  await fireEvent.changeText(screen.getByLabelText('Target complete sets (copies per printable file)'), '7');
  await fireEvent.press(screen.getByText('Parent: None (top level)'));
  await fireEvent.press(screen.getByText('— — Grandchild'));
  await fireEvent.press(screen.getByText('Create'));
  await waitFor(() => expect(api.createProject).toHaveBeenCalledWith(expect.objectContaining({ name: 'New assembly', parent_id: 3, target_sets: 7 })));
  await waitFor(() => expect(screen.queryByText('New project')).toBeNull());
  await fireEvent.press(screen.getByRole('button', { name: 'More · Root' }));
  await fireEvent.press(screen.getByText('Edit'));
  await fireEvent.press(screen.getByText('Parent: None (top level)'));
  // Only Other is eligible: Root, Child and Grandchild would all create a cycle.
  expect(screen.queryByText('— Child')).toBeNull();
  expect(screen.queryByText('— — Grandchild')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Other' }));
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(api.updateProject).toHaveBeenCalledWith(1, expect.objectContaining({ parent_id: 4, target_sets: 5 })));
});

it('keeps opening projects available without exposing unpermitted secondary actions', async () => {
  mockPermissions = new Set(['projects:read']);
  const screen = await setup();
  expect(screen.queryByRole('button', { name: 'Project' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'More · Root' })).toBeNull();
  await fireEvent.press(screen.getAllByText('Open')[0]);
  expect(mockNavigation.navigate).toHaveBeenCalledWith('ProjectDetail', { id: 1 });
});

it('discloses permitted project actions without filling the card', async () => {
  const screen = await setup();
  expect(screen.queryByText('Batch Print')).toBeNull();
  expect(screen.queryByText('Delete')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'More · Root' }));
  expect(screen.getByText('Batch Print')).toBeTruthy();
  expect(screen.getByText('Edit')).toBeTruthy();
  expect(screen.getByText('Delete')).toBeTruthy();
});
