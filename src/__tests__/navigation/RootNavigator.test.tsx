import React from 'react';
import { render } from '@testing-library/react-native';
import RootNavigator from '@/navigation/RootNavigator';

jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(),
  launchImageLibrary: jest.fn(),
}));

jest.mock('react-native-share', () => ({
  default: jest.fn(),
}));

const registeredRoutes: string[] = [];
const mockAuth = {
  user: { id: 1 } as { id: number } | null,
  authEnabled: true,
  loading: false,
  requiresSetup: false,
  hasPermission: jest.fn(() => true),
};
let mockBillingEnabled = true;
let mockServerUrl = 'https://bambuddy.test';

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
jest.mock('@/screens/Model3DPreviewScreen', () => () => null);
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
jest.mock('@/screens/AnnouncementsScreen', () => () => null);
jest.mock('@/screens/CameraWallScreen', () => () => null);
jest.mock('@/screens/CameraIntegrationsScreen', () => () => null);
jest.mock('@/screens/FinanceScreen', () => () => null);
jest.mock('@/screens/ConnectAuthorizeScreen', () => () => null);
jest.mock('@/screens/SlicerPipelinesScreen', () => ({ SlicerPipelinesScreen: () => null }));
jest.mock('@/screens/PipelineRunsScreen', () => ({ PipelineRunsScreen: () => null }));
jest.mock('@/screens/FailureAnalysisScreen', () => () => null);
jest.mock('@/screens/WebSocketStatusScreen', () => () => null);
jest.mock('@/screens/TimelapseEditorScreen', () => () => null);
jest.mock('@/screens/PrintLogScreen', () => () => null);
jest.mock('@/screens/SpoolAssignmentHistoryScreen', () => () => null);
jest.mock('@/navigation/useNavigationItems', () => ({
  useNavigationItems: () => ({
    access: { hasPermission: mockAuth.hasPermission, authenticatedUser: Boolean(mockAuth.user), billingEnabled: mockBillingEnabled },
  }),
}));

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
  useAuth: () => mockAuth,
}));

jest.mock('@/api/server', () => ({
  useServerStore: (selector: (state: { serverUrl: string; loading: boolean }) => unknown) =>
    selector({ serverUrl: mockServerUrl, loading: false }),
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
    mockAuth.user = { id: 1 };
    mockAuth.authEnabled = true;
    mockAuth.loading = false;
    mockAuth.requiresSetup = false;
    mockAuth.hasPermission.mockReturnValue(true);
    mockBillingEnabled = true;
    mockServerUrl = 'https://bambuddy.test';
  });

  it('registers implemented parity routes after authentication', async () => {
    await render(<RootNavigator />);

    expect(registeredRoutes).toEqual(
      expect.arrayContaining([
        'VirtualPrinters',
        'SpoolBuddy',
        'ExternalLinkBrowser',
        'Announcements',
        'CameraWall',
        'CameraIntegrations',
        'SlicerPipelines',
        'PipelineRuns',
        'Finance',
        'ConnectAuthorize',
      ]),
    );
  });

  it('removes protected routes from the navigator for unauthorized users', async () => {
    mockAuth.hasPermission.mockReturnValue(false);
    await render(<RootNavigator />);
    expect(registeredRoutes).toContain('Main');
    expect(registeredRoutes).not.toContain('Users');
    for (const route of ['Camera', 'CameraWall', 'CameraIntegrations', 'SlicerPipelines', 'PipelineRuns', 'Finance']) {
      expect(registeredRoutes).not.toContain(route);
    }
  });

  it('keeps setup and sign-in gates ahead of consent and all app routes', async () => {
    mockAuth.user = null;
    const view = await render(<RootNavigator />);
    expect(registeredRoutes).toEqual(['Login']);
    registeredRoutes.length = 0;
    mockServerUrl = '';
    await view.rerender(<RootNavigator />);
    expect(registeredRoutes).toEqual(['ServerSetup', 'Scanner']);
  });

  it('does not expose authenticated-only consent or finance in guest mode', async () => {
    mockAuth.user = null;
    mockAuth.authEnabled = false;
    await render(<RootNavigator />);
    expect(registeredRoutes).toContain('Main');
    expect(registeredRoutes).not.toContain('ConnectAuthorize');
    expect(registeredRoutes).not.toContain('Finance');
  });

  it('waits for startup preferences only after the authentication gate', async () => {
    const view = await render(<RootNavigator entryReady={false} />);
    expect(registeredRoutes).toEqual([]);
    mockAuth.user = null;
    await view.rerender(<RootNavigator entryReady={false} />);
    expect(registeredRoutes).toEqual(['Login']);
  });
});
