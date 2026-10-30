import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { pick } from '@react-native-documents/picker';
import ProfilesScreen from '@/screens/ProfilesScreen';
import { api } from '@/api/client';
import { profileManagementApi } from '@/api/profileManagement';

jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(),
  types: { allFiles: '*/*' },
  errorCodes: { OPERATION_CANCELED: 'CANCEL' },
  isErrorWithCode: () => false,
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));
jest.mock('@/theme', () => ({
  useTheme: () => ({
    colors: require('@/theme/tokens').colors.dark,
    isDark: true,
  }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ setOptions: jest.fn() }),
}));
jest.mock('@/components/profiles/PresetEditor', () => ({
  PresetEditor: () => null,
}));
jest.mock('@/components/profiles/KProfileManager', () => ({
  KProfileManager: () => null,
}));
jest.mock('@/api/client', () => ({
  api: {
    getCloudStatus: jest.fn(),
    getCloudProfileSyncStatus: jest.fn(),
    orcaCloudStatus: jest.fn(),
    getCloudProfiles: jest.fn(),
    getOrcaCloudProfiles: jest.fn(),
    cloudLogout: jest.fn(),
    orcaCloudLogout: jest.fn(),
  },
  ApiError: class ApiError extends Error {},
}));
jest.mock('@/api/profileManagement', () => ({
  profileManagementApi: {
    localList: jest.fn(),
    localImport: jest.fn(),
    localDetail: jest.fn(),
    localRemove: jest.fn(),
  },
}));
const clients: QueryClient[] = [];
async function mount() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <ProfilesScreen />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(api.getCloudStatus)
    .mockResolvedValue({ is_authenticated: true } as Awaited<
      ReturnType<typeof api.getCloudStatus>
    >);
  jest.mocked(api.getCloudProfileSyncStatus).mockResolvedValue({});
  jest.mocked(api.orcaCloudStatus).mockResolvedValue({ connected: false });
  jest.mocked(api.getCloudProfiles).mockResolvedValue({
    filament: [
      {
        name: 'PLA @BBL X1C 0.4 nozzle',
        setting_id: 'owned',
        type: 'filament',
        is_custom: true,
      },
    ],
    printer: [],
    process: [
      {
        name: '0.20mm Standard @BBL P1S 0.6 nozzle',
        setting_id: 'process',
        type: 'process',
        is_custom: false,
      },
    ],
  } as unknown as Awaited<ReturnType<typeof api.getCloudProfiles>>);
  jest
    .mocked(profileManagementApi.localList)
    .mockResolvedValue({
      filament: [
        { id: 7, name: 'Imported PLA', source: 'orca', filament_type: 'PLA' },
      ],
      process: [],
      printer: [],
    });
});
afterEach(() => clients.splice(0).forEach(client => client.clear()));
it.each(['bambu', 'orca'] as const)('confirms %s disconnect and disables it while pending', async provider => {
  jest.mocked(api.orcaCloudStatus).mockResolvedValue({ connected: true });
  jest.mocked(api.getOrcaCloudProfiles).mockResolvedValue({ filament: [], process: [], printer: [] });
  const logout = provider === 'bambu' ? api.cloudLogout : api.orcaCloudLogout;
  let finish: ((value: Record<string, unknown>) => void) | undefined;
  jest.mocked(logout).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  try {
    const view = await mount();
    if (provider === 'orca') await fireEvent.press(view.getByText('Orca Cloud'));
    await fireEvent.press(await view.findByRole('button', { name: 'Disconnect' }));
    expect(logout).not.toHaveBeenCalled();
    await act(async () => alert.mock.calls[0][2]?.find(button => button.style === 'destructive')?.onPress?.());
    await waitFor(() => expect(view.getByRole('button', { name: /Disconnecting/ })).toBeDisabled());
    expect(logout).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByRole('button', { name: /Disconnecting/ }));
    expect(alert).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => finish?.({}));
    alert.mockRestore();
  }
});
it('combines metadata filters on grouped cloud responses and clears without removing details/compare actions', async () => {
  const screen = await mount();
  await screen.findByText('PLA @BBL X1C 0.4 nozzle');
  await fireEvent.changeText(screen.getByLabelText('Search profiles'), 'pla');
  expect(screen.queryByText('0.20mm Standard @BBL P1S 0.6 nozzle')).toBeNull();
  await fireEvent.press(screen.getByText('custom'));
  expect(screen.getByText('PLA @BBL X1C 0.4 nozzle')).toBeTruthy();
  expect(screen.getByText('Details')).toBeTruthy();
  expect(screen.getByText('Select to compare')).toBeTruthy();
  await fireEvent.press(screen.getByText('Clear filters'));
  expect(screen.getByText('0.20mm Standard @BBL P1S 0.6 nozzle')).toBeTruthy();
});
it('imports multiple native bundles with per-file feedback, inspects all local values and confirms deletion', async () => {
  jest.mocked(pick).mockResolvedValue([
    {
      uri: 'file:///one.zip',
      name: 'one.zip',
      type: 'application/zip',
      error: null,
      nativeType: null,
      size: null,
      isVirtual: false,
      convertibleToMimeTypes: null,
      hasRequestedType: true,
    },
    {
      uri: 'file:///two.bbscfg',
      name: 'two.bbscfg',
      type: null,
      error: null,
      nativeType: null,
      size: null,
      isVirtual: false,
      convertibleToMimeTypes: null,
      hasRequestedType: true,
    },
  ]);
  jest
    .mocked(profileManagementApi.localImport)
    .mockResolvedValueOnce({
      success: true,
      imported: 2,
      skipped: 1,
      errors: [],
    })
    .mockRejectedValueOnce(new Error('Invalid bundle'));
  jest
    .mocked(profileManagementApi.localDetail)
    .mockResolvedValue({
      id: 7,
      name: 'Imported PLA',
      preset_type: 'filament',
      filament_vendor: 'Vendor',
      inherits: 'Generic PLA',
      setting: Object.fromEntries(
        Array.from({ length: 60 }, (_, index) => [
          `field_${index}`,
          `${index}`,
        ]),
      ),
    });
  const screen = await mount();
  await fireEvent.press(screen.getByText('Local'));
  await screen.findByText('Imported PLA');
  await fireEvent.press(
    screen.getByText('Import JSON, ZIP, Orca or Bambu bundles'),
  );
  await screen.findByText(/one.zip: 2 imported, 1 skipped/);
  expect(screen.getByText(/two.bbscfg: Error: Invalid bundle/)).toBeTruthy();
  expect(pick).toHaveBeenCalledWith(
    expect.objectContaining({ allowMultiSelection: true }),
  );
  expect(profileManagementApi.localImport).toHaveBeenCalledTimes(2);
  await fireEvent.press(screen.getByText('Details'));
  await screen.findByText('field_59');
  expect(profileManagementApi.localDetail).toHaveBeenCalledWith(7);
  await fireEvent.press(screen.getAllByRole('button', { name: 'Close' })[0]);
  const alert = jest.spyOn(Alert, 'alert');
  await fireEvent.press(screen.getByText('Delete'));
  expect(profileManagementApi.localRemove).not.toHaveBeenCalled();
  await act(async () => alert.mock.calls[0][2]?.[1].onPress?.());
  await waitFor(() =>
    expect(profileManagementApi.localRemove).toHaveBeenCalledWith(7),
  );
});
