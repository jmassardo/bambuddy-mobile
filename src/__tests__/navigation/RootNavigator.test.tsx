import React from 'react';
import { render } from '@testing-library/react-native';
import RootNavigator from '@/navigation/RootNavigator';

const registeredRoutes: string[] = [];

jest.mock('@/navigation/MainNavigator', () => () => null);
jest.mock('@/screens/ServerSetupScreen', () => () => null);
jest.mock('@/screens/LoginScreen', () => () => null);
jest.mock('@/screens/PrinterDetailScreen', () => () => null);
jest.mock('@/screens/ArchiveDetailScreen', () => () => null);
jest.mock('@/screens/ProjectDetailScreen', () => () => null);
jest.mock('@/screens/CameraScreen', () => () => null);
jest.mock('@/screens/ScannerScreen', () => () => null);
jest.mock('@/screens/SettingsScreen', () => () => null);
jest.mock('@/screens/SetupScreen', () => () => null);
jest.mock('@/screens/NotificationsScreen', () => () => null);
jest.mock('@/screens/InventoryScreen', () => () => null);
jest.mock('@/screens/MaintenanceScreen', () => () => null);
jest.mock('@/screens/MakerWorldScreen', () => () => null);
jest.mock('@/screens/ProfilesScreen', () => () => null);
jest.mock('@/screens/ProjectsScreen', () => () => null);
jest.mock('@/screens/StatsScreen', () => () => null);
jest.mock('@/screens/SystemScreen', () => () => null);
jest.mock('@/screens/UsersScreen', () => () => null);
jest.mock('@/screens/EnergyScreen', () => () => null);
jest.mock('@/screens/VirtualPrintersScreen', () => () => null);
jest.mock('@/screens/SpoolBuddyScreen', () => () => null);
jest.mock('@/screens/ExternalLinkBrowserScreen', () => () => null);

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => children,
    Screen: ({ name }: { name: string }) => {
      registeredRoutes.push(name);
      return null;
    },
  }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1 },
    authEnabled: true,
    loading: false,
    requiresSetup: false,
  }),
}));

jest.mock('@/api/server', () => ({
  useServerStore: (selector: (state: { serverUrl: string; loading: boolean }) => unknown) =>
    selector({ serverUrl: 'https://bambuddy.test', loading: false }),
  registerServerUrlChangeHandler: jest.fn(),
}));

jest.mock('@/theme', () => ({
  useTheme: () => ({
    colors: {
      surface: 'surface',
      text: 'text',
      background: 'background',
    },
  }),
}));

jest.mock('@/hooks/useStreamToken', () => ({
  useStreamToken: jest.fn(),
}));

describe('RootNavigator', () => {
  beforeEach(() => {
    registeredRoutes.length = 0;
  });

  it('registers the three shared parity routes', async () => {
    await render(<RootNavigator />);

    expect(registeredRoutes).toEqual(
      expect.arrayContaining([
        'VirtualPrinters',
        'SpoolBuddy',
        'ExternalLinkBrowser',
      ]),
    );
  });
});
