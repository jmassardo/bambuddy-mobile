import { act, renderHook } from '@testing-library/react-native';
import { api } from '@/api/client';
import { useSettingsScreenController } from '@/components/settings/useSettingsScreenController';

type MutationOptions = {
  mutationFn: (...args: never[]) => Promise<unknown>;
  onSuccess?: (value: unknown) => void | Promise<void>;
};

jest.mock('@/api/client', () => ({
  api: { updateSettings: jest.fn(async (value: Record<string, unknown>) => value) },
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    authEnabled: true,
    isAdmin: false,
    user: { id: 3 },
    hasPermission: () => true,
  }),
}));
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));
jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: {}, mode: 'dark', setMode: jest.fn() }),
}));
jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, refetch: jest.fn() }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
  useMutation: (options: MutationOptions) => ({
    mutateAsync: async (...args: never[]) => {
      const value = await options.mutationFn(...args);
      await options.onSuccess?.(value);
      return value;
    },
  }),
}));

beforeEach(() => jest.clearAllMocks());

it.each([
  { bambu_studio_api_url: 'ftp://sidecar', slicer_stall_timeout_minutes: 15 },
  { bambu_studio_api_url: 'https://sidecar', slicer_stall_timeout_minutes: 0 },
])('rejects invalid slicer setup before persisting settings: %j', async patch => {
  const { result } = await renderHook(useSettingsScreenController);
  await act(async () => {
    result.current.actions.setDraft({
      preferred_slicer: 'bambu_studio',
      use_slicer_api: true,
      ...patch,
    });
  });
  await act(async () => {
    await expect(
      result.current.mutations.saveSettingsMutation.mutateAsync(),
    ).rejects.toThrow();
  });
  expect(api.updateSettings).not.toHaveBeenCalled();
});

it('preserves the inactive sidecar and unrelated settings when saving', async () => {
  const draft = {
    preferred_slicer: 'bambu_studio',
    use_slicer_api: true,
    bambu_studio_api_url: 'https://bambu-sidecar',
    orcaslicer_api_url: 'https://inactive-orca-sidecar',
    slicer_stall_timeout_minutes: 15,
    unknown_future_setting: 'preserve',
  };
  const { result } = await renderHook(useSettingsScreenController);
  await act(async () => result.current.actions.setDraft(draft));
  await act(async () => {
    await result.current.mutations.saveSettingsMutation.mutateAsync();
  });
  expect(api.updateSettings).toHaveBeenCalledWith(draft);
});
