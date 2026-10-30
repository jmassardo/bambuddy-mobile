import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import SpoolBuddyScreen from '@/screens/SpoolBuddyScreen';
import {
  clearTestQueryClients,
  createTestQueryClient,
} from '@/testUtils/queryClient';

const mockGetSlots = jest.fn();
const mockGetUsage = jest.fn();
const mockGetUsageSummary = jest.fn();
const device = {
  id: 7,
  device_id: 'spoolbuddy-7',
  hostname: 'Workshop Buddy',
  online: true,
  has_nfc: true,
  has_scale: true,
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ setOptions: jest.fn() }),
}));
jest.mock('react-native/Libraries/Components/RefreshControl/RefreshControl', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => ReactModule.createElement(View, props),
  };
});
jest.mock('@/api/client', () => ({
  api: {
    getSpoolBuddyDevices: async () => [device],
    getSpools: async () => [],
    getSpoolBuddySlots: (...args: unknown[]) => mockGetSlots(...args),
    getSpoolBuddySlotAssignments: async () => [],
    getSpoolBuddyUsage: (...args: unknown[]) => mockGetUsage(...args),
    getSpoolBuddyUsageSummary: (...args: unknown[]) => mockGetUsageSummary(...args),
  },
}));
jest.mock('@/components/spoolbuddy/RemoteSpoolBuddyPanel', () => ({
  RemoteSpoolBuddyModal: () => null,
}));
jest.mock('@/components/settings/shared', () => ({ SimpleModal: () => null }));
jest.mock('@/components/common/StateScreens', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return {
    LoadingScreen: () => ReactModule.createElement(Text, null, 'Loading…'),
    ErrorState: ({ message }: { message: string }) =>
      ReactModule.createElement(Text, null, message),
    EmptyState: ({ title }: { title: string }) =>
      ReactModule.createElement(Text, null, title),
  };
});
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));
jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: require('@/theme/tokens').colors.dark, isDark: true }),
}));

async function renderScreen() {
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <SpoolBuddyScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSlots.mockResolvedValue([]);
  mockGetUsage.mockResolvedValue([]);
  mockGetUsageSummary.mockResolvedValue([]);
});
afterEach(async () => {
  await cleanup();
  clearTestQueryClients();
});

it('distinguishes loading and failed slot requests from an empty slot list', async () => {
  let reject!: (error: Error) => void;
  mockGetSlots.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
  const screen = await renderScreen();
  await fireEvent.press(await screen.findByText('Workshop Buddy'));
  expect(await screen.findByText('Loading…')).toBeTruthy();
  expect(screen.queryByText('No slots configured')).toBeNull();
  reject(new Error('Slots unavailable'));
  expect(await screen.findByText('Slots unavailable')).toBeTruthy();
  expect(screen.queryByText('No slots configured')).toBeNull();
});

it('refreshes displayed usage resources and shows a usage failure instead of no data', async () => {
  const screen = await renderScreen();
  await fireEvent.press(await screen.findByText('Workshop Buddy'));
  await screen.findByText('No slots configured');
  await fireEvent.press(screen.getByRole('tab', { name: 'Usage' }));
  await screen.findByText('No usage data');
  const usageCalls = mockGetUsage.mock.calls.length;
  const summaryCalls = mockGetUsageSummary.mock.calls.length;
  const slotCalls = mockGetSlots.mock.calls.length;
  mockGetUsage.mockRejectedValue(new Error('Usage unavailable'));
  await fireEvent(screen.getByTestId('spoolbuddy-refresh'), 'refresh');
  expect(await screen.findByText('Usage unavailable')).toBeTruthy();
  expect(mockGetUsage).toHaveBeenCalledTimes(usageCalls + 1);
  expect(mockGetUsageSummary).toHaveBeenCalledTimes(summaryCalls + 1);
  expect(mockGetSlots).toHaveBeenCalledTimes(slotCalls);
  expect(screen.queryByText('No usage data')).toBeNull();
});
