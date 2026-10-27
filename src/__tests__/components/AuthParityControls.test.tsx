/* eslint-disable @typescript-eslint/no-shadow */
import React from 'react';
import { Alert, FlatList, Linking, TextInput, View } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { QueryClientProvider } from '@tanstack/react-query';
import { WebView } from 'react-native-webview';
import { authApi } from '@/api/auth';
import { authManagementApi } from '@/api/authManagement';
import { api } from '@/api/client';
import { AccountSecurityControls, EncryptionStatusPanel } from '@/components/settings/AccountSecurityControls';
import { ScopedApiKeysManager } from '@/components/settings/ScopedApiKeysManager';
import { ConnectedAppsManager, validateConnectedCallback } from '@/components/settings/ConnectedAppsManager';
import { OIDCProvidersManager, oidcGroupMapping } from '@/components/settings/OIDCProvidersManager';
import ConnectAuthorizeScreen, { connectCallback } from '@/screens/ConnectAuthorizeScreen';
import SetupScreen from '@/screens/SetupScreen';
import UsersScreen from '@/screens/UsersScreen';
import { OIDCAuthorizationBrowser, oidcBrowserCallback, isOidcProviderCallback } from '@/components/common/OIDCAuthorizationBrowser';
import { createOidcState, validateNewPassword, buildApiKeyEnrollment, oidcCallbackBase } from '@/utils/authSecurity';
import { clearTestQueryClients, createTestQueryClient } from '@/testUtils/queryClient';

const mockLogout = jest.fn();
const mockRefresh = jest.fn();
let mockPermissions = new Set<string>();
let mockIsAdmin = true;
let mockAuthEnabled = true;
let mockSource = 'local';
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'operator', auth_source: mockSource }, isAdmin: mockIsAdmin,
    authEnabled: mockAuthEnabled, hasPermission: (p: string) => mockIsAdmin || mockPermissions.has(p),
    logout: mockLogout, refreshAuth: mockRefresh, requiresSetup: true,
  }),
}));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ setOptions: jest.fn(), reset: jest.fn() }) }));
jest.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('@/api/client', () => ({ api: {
  getUsers: jest.fn(), getGroups: jest.fn(), getAdvancedAuthStatus: jest.fn(), getLDAPStatus: jest.fn(),
} }));
jest.mock('@/components/common/GroupEditModal', () => ({ GroupEditModal: () => null }));
jest.mock('@/components/common/ConfirmModal', () => ({ ConfirmModal: () => null }));
jest.mock('@/components/common/ActionSheetModal', () => ({ ActionSheetModal: () => null }));
jest.mock('@/components/common/StateScreens', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    EmptyState: ({ title }: { title: string }) => React.createElement(Text, null, title),
    ErrorState: ({ message }: { message: string }) => React.createElement(Text, null, message),
    LoadingScreen: ({ message }: { message: string }) => React.createElement(Text, null, message),
  };
});
jest.mock('@/api/auth', () => ({
  authApi: {
    setupAuth: jest.fn(), disableAuth: jest.fn(), changeOwnPassword: jest.fn(),
    getOIDCProvidersAll: jest.fn(), getGroups: jest.fn(), createOIDCProvider: jest.fn(),
    updateOIDCProvider: jest.fn(), deleteOIDCProvider: jest.fn(),
    deleteOIDCProviderIcon: jest.fn(), refreshOIDCProviderIcon: jest.fn(),
    getOIDCProviderIconUrl: jest.fn(() => 'https://server/icon'),
  },
}));
jest.mock('@/api/authManagement', () => ({
  authManagementApi: {
    encryptionStatus: jest.fn(), listKeys: jest.fn(), createKey: jest.fn(), revokeKey: jest.fn(),
    listApps: jest.fn(), createApp: jest.fn(), updateApp: jest.fn(), rotateApp: jest.fn(),
    deleteApp: jest.fn(), authorizeInfo: jest.fn(), authorize: jest.fn(),
  },
}));
jest.mock('@/api/server', () => ({ useServerStore: (selector: (s: { serverUrl: string }) => unknown) => selector({ serverUrl: 'https://server' }) }));
jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));
jest.mock('react-native/Libraries/Linking/Linking', () => ({
  __esModule: true,
  default: { openURL: jest.fn(() => Promise.resolve()) },
}));
jest.mock('react-native-qrcode-svg', () => 'QRCode');
jest.mock('react-native-share', () => ({ __esModule: true, default: { open: jest.fn() } }));
jest.mock('@react-native-clipboard/clipboard', () => ({ __esModule: true, default: { setString: jest.fn() } }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }) }));
jest.mock('@/components/common/AppUI', () => {
  const React = require('react');
  const { Text, TextInput, View } = require('react-native');
  return {
    SectionCard: ({ children, title }: { children: React.ReactNode; title: string }) => React.createElement(View, null, React.createElement(Text, null, title), children),
    TextField: ({ label, ...props }: { label: string }) => React.createElement(TextInput, { ...props, placeholder: label }),
    PrimaryButton: ({ label, ...props }: { label: string }) => React.createElement(View, { ...props, testID: label }, React.createElement(Text, null, label)),
    FloatingActionButton: ({ label, ...props }: { label: string }) => React.createElement(View, { ...props, testID: label }, React.createElement(Text, null, label)),
    InlineTabBar: (props: object) => React.createElement(View, props),
    StatusBadge: ({ label }: { label: string }) => React.createElement(Text, null, label),
  };
});
jest.mock('@/components/settings/shared', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SwitchRow: (props: object) => React.createElement(View, props),
    OptionChipsField: (props: object) => React.createElement(View, props),
  };
});

const a = authApi as jest.Mocked<typeof authApi>;
const m = authManagementApi as jest.Mocked<typeof authManagementApi>;
const renderers: ReactTestRenderer.ReactTestRenderer[] = [];
async function settle() { await act(async () => { await new Promise<void>(r => setTimeout(r, 10)); }); }
async function render(element: React.ReactElement) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const client = createTestQueryClient();
  client.setDefaultOptions({ ...client.getDefaultOptions(), mutations: { retry: false, gcTime: 0 } });
  await act(async () => { renderer = ReactTestRenderer.create(<QueryClientProvider client={client}>{element}</QueryClientProvider>); });
  renderers.push(renderer);
  await settle();
  return renderer;
}
function button(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  return renderer.root.findByProps({ testID: label });
}
async function press(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  await act(async () => { button(renderer, label).props.onPress(); });
  await settle();
}
async function fill(renderer: ReactTestRenderer.ReactTestRenderer, label: string, value: string) {
  await act(async () => { renderer.root.findAllByType(TextInput).find(n => n.props.placeholder === label)!.props.onChangeText(value); });
}
function output(renderer: ReactTestRenderer.ReactTestRenderer) { return JSON.stringify(renderer.toJSON()); }
const key = { id: 9, name: 'scanner', key_prefix: 'bb_12345', user_id: null, enabled: true, last_used: null, created_at: 'today', expires_at: null };
const app = { id: 7, name: 'Portal', client_id: 'client', redirect_uri: 'https://portal/callback', enabled: true, created_at: 'today', last_used_at: null };
const params = { client_id: 'client', redirect_uri: 'https://portal/callback', code_challenge: 'A'.repeat(43), code_challenge_method: 'S256' as const, state: 'request-state' };

beforeEach(() => {
  jest.clearAllMocks(); mockIsAdmin = true; mockAuthEnabled = true; mockSource = 'local'; mockPermissions = new Set();
  a.changeOwnPassword.mockResolvedValue({ message: 'Password changed' });
  a.setupAuth.mockResolvedValue({ auth_enabled: true });
  a.disableAuth.mockResolvedValue({ auth_enabled: false });
  a.getGroups.mockResolvedValue([{ id: 2, name: 'Operators', is_default: true }]);
  a.getOIDCProvidersAll.mockResolvedValue([]);
  jest.mocked(api.getUsers).mockResolvedValue([{ id: 2, username: 'viewer', is_admin: false, groups: [], created_at: 'today' }]);
  jest.mocked(api.getGroups).mockResolvedValue([]);
  jest.mocked(api.getAdvancedAuthStatus).mockResolvedValue({ advanced_auth_enabled: false, smtp_configured: false, local_login_enabled: true, autologin_provider_id: null });
  jest.mocked(api.getLDAPStatus).mockResolvedValue({ ldap_enabled: false, ldap_configured: false });
  m.listKeys.mockResolvedValue([]); m.listApps.mockResolvedValue([]);
  m.createKey.mockResolvedValue({ ...key, key: 'secret-key' } as Awaited<ReturnType<typeof m.createKey>>);
  m.createApp.mockResolvedValue({ ...app, client_secret: 'one-time-secret' });
  m.authorizeInfo.mockResolvedValue({ app_name: 'Portal', username: 'operator', already_granted: false });
  m.authorize.mockResolvedValue({ code: 'authorization-code', redirect_uri: 'https://portal/callback' });
  m.encryptionStatus.mockResolvedValue({
    key_configured: true, key_source: 'generated', decryption_broken: false, migration_error_count: 2,
    encrypted_rows: { oidc_providers: 3, user_totp: 4 }, legacy_plaintext_rows: { oidc_providers: 1, user_totp: 0 },
  });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => { renderers.splice(0).forEach(r => r.unmount()); });
  clearTestQueryClients(); jest.restoreAllMocks();
});

it('allows a non-admin local user to change their own password and signs out after token revocation', async () => {
  mockIsAdmin = false;
  const r = await render(<AccountSecurityControls />);
  await press(r, 'Change my password');
  await fill(r, 'Current password', 'old-password');
  await fill(r, 'New password', 'NewPassword1!');
  await fill(r, 'Confirm new password', 'NewPassword1!');
  await press(r, 'Change password');
  expect(a.changeOwnPassword).toHaveBeenCalledWith('old-password', 'NewPassword1!');
  expect(mockLogout).toHaveBeenCalled();
});
it('keeps the password form and surfaces server denial; cancel clears secrets', async () => {
  a.changeOwnPassword.mockRejectedValue(new Error('Current password is incorrect'));
  const r = await render(<AccountSecurityControls />);
  await press(r, 'Change my password'); await fill(r, 'Current password', 'wrong');
  await fill(r, 'New password', 'NewPassword1!'); await fill(r, 'Confirm new password', 'NewPassword1!');
  await press(r, 'Change password');
  expect(output(r)).toContain('Current password is incorrect'); expect(mockLogout).not.toHaveBeenCalled();
  await press(r, 'Cancel'); await press(r, 'Change my password');
  expect(r.root.findAllByType(TextInput).find(n => n.props.placeholder === 'Current password')!.props.value).toBe('');
});
it('excludes directory passwords and protects auth disable with a confirmation', async () => {
  mockSource = 'ldap';
  const r = await render(<AccountSecurityControls />);
  expect(output(r)).not.toContain('Change my password');
  await press(r, 'Disable authentication');
  expect(a.disableAuth).not.toHaveBeenCalled();
  const choices = jest.mocked(Alert.alert).mock.calls[0][2]!;
  await act(async () => { choices.find(c => c.text === 'Disable')!.onPress!(); });
  await settle(); expect(a.disableAuth).toHaveBeenCalled(); expect(mockRefresh).toHaveBeenCalled();
});
it('enables optional authentication with the actual setup schema', async () => {
  mockAuthEnabled = false;
  const r = await render(<AccountSecurityControls />);
  await fill(r, 'Administrator username', 'admin'); await fill(r, 'Administrator password', 'StrongPassword1!');
  await press(r, 'Enable authentication');
  expect(a.setupAuth).toHaveBeenCalledWith({ auth_enabled: true, admin_username: 'admin', admin_password: 'StrongPassword1!' });
});
it('completes initial setup without forcing administrator credentials when authentication is off', async () => {
  const r = await render(<SetupScreen />);
  await act(async () => { r.root.findAllByType(View).find(n => n.props.label === 'Enable authentication' && n.props.onValueChange)!.props.onValueChange(false); });
  expect(r.root.findAllByType(TextInput)).toHaveLength(0);
  await press(r, 'Complete setup');
  expect(a.setupAuth).toHaveBeenCalledWith({ auth_enabled: false });
  expect(mockRefresh).toHaveBeenCalled();
});
it('admits users:read delegates without requesting inaccessible groups or exposing modifying actions', async () => {
  mockIsAdmin = false; mockPermissions.add('users:read');
  const r = await render(<UsersScreen />);
  expect(api.getUsers).toHaveBeenCalled(); expect(api.getGroups).not.toHaveBeenCalled();
  const list = r.root.findByType(FlatList);
  expect(list.props.data).toEqual(expect.arrayContaining([expect.objectContaining({ username: 'viewer' })]));
  const row = await render(list.props.renderItem({ item: list.props.data[0] }));
  expect(r.root.findAllByProps({ testID: 'Create user' })).toHaveLength(0);
  expect(row.root.findAllByProps({ testID: 'Edit' })).toHaveLength(0);
  expect(row.root.findAllByProps({ testID: 'Delete' })).toHaveLength(0);
});
it('denies the entire user view without users:read', async () => {
  mockIsAdmin = false;
  const r = await render(<UsersScreen />);
  expect(api.getUsers).not.toHaveBeenCalled(); expect(output(r)).toContain('User access required');
});
it('exposes only the user mutation capabilities actually delegated', async () => {
  mockIsAdmin = false; mockPermissions = new Set(['users:read', 'users:update']);
  const r = await render(<UsersScreen />);
  const list = r.root.findByType(FlatList);
  const row = await render(list.props.renderItem({ item: list.props.data[0] }));
  expect(row.root.findAllByProps({ testID: 'Edit' }).length).toBeGreaterThan(0);
  expect(row.root.findAllByProps({ testID: 'Delete' })).toHaveLength(0);
  expect(r.root.findAllByProps({ testID: 'Create user' })).toHaveLength(0);
});
it('creates every selected API scope, presents enrollment QR, and dismisses the one-time secret', async () => {
  const r = await render(<ScopedApiKeysManager />);
  await fill(r, 'API key name', 'scanner');
  await act(async () => {
    r.root.findAllByType(View).filter(n => n.props.onValueChange).forEach(n => n.props.onValueChange(!n.props.value));
  });
  await press(r, 'Create scoped key');
  expect(m.createKey).toHaveBeenCalledWith({
    name: 'scanner', can_queue: false, can_control_printer: true, can_read_status: false,
    can_manage_library: false, can_manage_inventory: false, can_manage_maintenance: false,
    can_manage_archives: false, can_manage_projects: false, can_access_cloud: true,
    can_update_energy_cost: true, can_send_notifications: true,
  });
  expect(output(r)).toContain('secret-key');
  await press(r, 'Show enrollment QR');
  expect(output(r)).toContain(buildApiKeyEnrollment('https://server', 'secret-key'));
  await press(r, 'Dismiss secret'); expect(output(r)).not.toContain('secret-key');
});
it('lists legacy key metadata and revokes only after confirmation', async () => {
  m.listKeys.mockResolvedValue([key] as Awaited<ReturnType<typeof m.listKeys>>);
  const r = await render(<ScopedApiKeysManager />);
  expect(output(r)).toContain('Legacy key: no owner');
  await press(r, 'Revoke scanner'); expect(m.revokeKey).not.toHaveBeenCalled();
  const choices = jest.mocked(Alert.alert).mock.calls[0][2]!;
  await act(async () => { choices.find(c => c.text === 'Revoke')!.onPress!(); });
  expect(m.revokeKey).toHaveBeenCalledWith(9);
});
it('hides key mutations without create/delete permissions and reports errors', async () => {
  mockIsAdmin = false; mockPermissions.add('api_keys:read');
  m.listKeys.mockRejectedValue(new Error('Forbidden'));
  const r = await render(<ScopedApiKeysManager />);
  expect(output(r)).not.toContain('Create scoped key'); expect(output(r)).toContain('Forbidden');
  expect(button(r, 'Retry API keys')).toBeTruthy();
});
it('renders actual encryption counts, migration warnings, and generated key backup guidance', async () => {
  const r = await render(<EncryptionStatusPanel />);
  expect(output(r)).toContain('generated'); expect(output(r)).toContain('Back up the server-generated');
  expect(output(r)).toContain('Migration skipped'); expect(output(r)).toContain('Legacy plaintext:');
});
it('provides encryption failure and retry without inventing health', async () => {
  m.encryptionStatus.mockRejectedValue(new Error('Unavailable'));
  const r = await render(<EncryptionStatusPanel />);
  expect(output(r)).toContain('Encryption health unavailable');
  m.encryptionStatus.mockResolvedValue({ key_configured: false, key_source: 'none', decryption_broken: true, migration_error_count: 0, encrypted_rows: { oidc_providers: 1, user_totp: 0 }, legacy_plaintext_rows: { oidc_providers: 0, user_totp: 0 } });
  await press(r, 'Retry encryption status'); expect(output(r)).toContain('Recovery required');
});
it('registers connected apps with validated callbacks and one-time secrets', async () => {
  const r = await render(<ConnectedAppsManager />);
  await fill(r, 'App name', 'Portal'); await fill(r, 'Callback URL', 'https://portal/callback');
  await press(r, 'Register app');
  expect(m.createApp).toHaveBeenCalledWith('Portal', 'https://portal/callback');
  expect(output(r)).toContain('one-time-secret');
  await press(r, 'Dismiss client secret'); expect(output(r)).not.toContain('one-time-secret');
});
it('confirms connected-app rotation and surfaces permission denial', async () => {
  m.listApps.mockResolvedValue([app]); m.rotateApp.mockRejectedValue(new Error('Permission denied'));
  const r = await render(<ConnectedAppsManager />);
  await press(r, 'Rotate Portal secret'); expect(m.rotateApp).not.toHaveBeenCalled();
  await act(async () => { jest.mocked(Alert.alert).mock.calls[0][2]!.find(c => c.text === 'Rotate')!.onPress!(); });
  await settle(); expect(m.rotateApp).toHaveBeenCalledWith(7); expect(output(r)).toContain('Permission denied');
});
it('shows accurate consent and approves using only the backend-returned callback', async () => {
  const r = await render(<ConnectAuthorizeScreen route={{ params }} />);
  expect(m.authorizeInfo).toHaveBeenCalledWith('client', 'https://portal/callback');
  expect(output(r)).toContain('identity, email, administrator status, groups, and permissions');
  await press(r, 'Allow Portal');
  expect(m.authorize).toHaveBeenCalledWith(params);
  expect(Linking.openURL).toHaveBeenCalledWith('https://portal/callback?code=authorization-code&state=request-state');
});
it('denies only after validating registration, without issuing an authorization code', async () => {
  const r = await render(<ConnectAuthorizeScreen route={{ params }} />);
  await press(r, 'Deny');
  expect(m.authorize).not.toHaveBeenCalled();
  expect(Linking.openURL).toHaveBeenCalledWith('https://portal/callback?error=access_denied&state=request-state');
});
it('never offers consent or follows a callback when the server rejects client registration', async () => {
  m.authorizeInfo.mockRejectedValue(new Error('Callback mismatch'));
  const r = await render(<ConnectAuthorizeScreen route={{ params }} />);
  expect(output(r)).toContain('Request rejected'); expect(output(r)).not.toContain('Allow Portal');
  expect(Linking.openURL).not.toHaveBeenCalled();
});
it('preserves current advanced provider settings while updating credentials without resending blank secrets', async () => {
  a.getOIDCProvidersAll.mockResolvedValue([{
    id: 4, name: 'Provider', issuer_url: 'https://identity', client_id: 'old', scopes: 'openid email profile',
    is_enabled: true, auto_create_users: true, auto_link_existing_accounts: true, require_email_verified: true,
    email_claim: 'email', group_claim: 'roles', group_mapping: { Staff: 'Operators' }, default_group_id: 2, is_autologin: true, has_icon: false,
  }]);
  const r = await render(<OIDCProvidersManager />);
  await press(r, 'Edit Provider'); await fill(r, 'Client ID', 'new');
  await press(r, 'Save provider');
  expect(a.updateOIDCProvider).toHaveBeenCalledWith(4, expect.objectContaining({
    client_id: 'new', group_claim: 'roles', group_mapping: { Staff: 'Operators' },
    auto_create_users: true, auto_link_existing_accounts: true, require_email_verified: true,
    default_group_id: 2, is_autologin: true,
  }));
  expect(a.updateOIDCProvider.mock.calls[0][1]).not.toHaveProperty('client_secret');
});
it('reports when the upstream update handler ignores clearing a nullable default group', async () => {
  const provider = {
    id: 4, name: 'Provider', issuer_url: 'https://identity', client_id: 'old', scopes: 'openid email profile',
    is_enabled: true, auto_create_users: false, auto_link_existing_accounts: false, require_email_verified: true,
    email_claim: 'email', default_group_id: 2, is_autologin: false, has_icon: false,
  };
  a.getOIDCProvidersAll.mockResolvedValue([provider]); a.updateOIDCProvider.mockResolvedValue(provider);
  const r = await render(<OIDCProvidersManager />);
  await press(r, 'Edit Provider');
  await act(async () => { r.root.findAllByType(View).find(n => n.props.label === 'Default local group' && n.props.onChange)!.props.onChange(''); });
  await press(r, 'Save provider');
  expect(a.updateOIDCProvider).toHaveBeenCalledWith(4, expect.objectContaining({ default_group_id: null }));
  expect(output(r)).toContain('The server did not clear the default group');
});
it('rejects duplicate/missing group mappings and unsafe connected-app redirects', () => {
  expect(() => oidcGroupMapping([{ external: 'Staff', local: 'Operators' }, { external: 'staff', local: 'Operators' }], ['Operators'])).toThrow('unique');
  expect(() => oidcGroupMapping([{ external: 'Staff', local: 'Missing' }], ['Operators'])).toThrow('existing local group');
  expect(() => validateConnectedCallback('file:///untrusted/callback')).toThrow();
  expect(() => validateConnectedCallback('https://name:password@portal/cb')).toThrow();
  expect(() => validateConnectedCallback('https://portal/cb#fragment')).toThrow();
  expect(connectCallback('http://lan/cb', { state: 'a&b' })).toBe('http://lan/cb?state=a%26b');
});
it('accepts only configured-server login token fragments, not attacker origins or unrelated paths', () => {
  expect(oidcBrowserCallback('https://server/login#oidc_token=exchange', 'https://server')).toEqual({ token: 'exchange' });
  expect(oidcBrowserCallback('https://attacker/login#oidc_token=exchange', 'https://server')).toBeNull();
  expect(oidcBrowserCallback('https://server/unrelated#oidc_token=exchange', 'https://server')).toBeNull();
  expect(oidcBrowserCallback('https://server/?oidc_error=invalid_state', 'https://server')).toEqual({ error: 'invalid_state' });
  expect(isOidcProviderCallback('https://server/api/v1/auth/oidc/callback?state=expected&code=code', 'https://server', 'expected')).toBe(true);
  expect(isOidcProviderCallback('https://server/api/v1/auth/oidc/callback?state=attacker&code=code', 'https://server', 'expected')).toBe(false);
  expect(isOidcProviderCallback('https://attacker/api/v1/auth/oidc/callback?state=expected&code=code', 'https://server', 'expected')).toBe(false);
});
it('uses the trusted server-advertised HTTPS callback alias but rejects unsafe or unrelated callback routes', () => {
  const authorize = (uri: string) => `https://identity/authorize?state=random&redirect_uri=${encodeURIComponent(uri)}`;
  expect(oidcCallbackBase(authorize('https://external-server/prefix/api/v1/auth/oidc/callback'), 'http://lan-server')).toBe('https://external-server/prefix');
  expect(() => oidcCallbackBase(authorize('http://other-server/api/v1/auth/oidc/callback'), 'http://lan-server')).toThrow('unsafe');
  expect(() => oidcCallbackBase(authorize('https://server/unrelated'), 'https://server')).toThrow('unsafe');
});
it('exchanges browser tokens only after observing the expected top-level provider state and only once', async () => {
  const onToken = jest.fn(); const onError = jest.fn();
  const r = await render(<OIDCAuthorizationBrowser authorizationUrl="https://identity/authorize?state=expected" serverUrl="https://server" onToken={onToken} onError={onError} onCancel={jest.fn()} />);
  const browser = r.root.findByType(WebView);
  expect(browser.props.injectedJavaScript).toBeUndefined();
  expect(browser.props.injectedJavaScriptBeforeContentLoaded).toBeUndefined();
  await act(async () => {
    expect(browser.props.onShouldStartLoadWithRequest({ url: 'https://server/api/v1/auth/oidc/callback?state=expected&code=code', isTopFrame: true })).toBe(true);
    expect(browser.props.onShouldStartLoadWithRequest({ url: 'https://server/login#oidc_token=exchange', isTopFrame: true })).toBe(false);
    browser.props.onNavigationStateChange({ url: 'https://server/login#oidc_token=exchange' });
  });
  expect(onToken).toHaveBeenCalledTimes(1); expect(onToken).toHaveBeenCalledWith('exchange'); expect(onError).not.toHaveBeenCalled();
});
it('rejects unsolicited browser exchange-token fragments without a state-matched callback', async () => {
  const onToken = jest.fn(); const onError = jest.fn();
  const r = await render(<OIDCAuthorizationBrowser authorizationUrl="https://identity/authorize?state=expected" serverUrl="https://server" onToken={onToken} onError={onError} onCancel={jest.fn()} />);
  const browser = r.root.findByType(WebView);
  await act(async () => {
    browser.props.onShouldStartLoadWithRequest({ url: 'https://server/api/v1/auth/oidc/callback?state=other&code=code', isTopFrame: true });
    browser.props.onShouldStartLoadWithRequest({ url: 'https://server/login#oidc_token=unsolicited', isTopFrame: true });
  });
  expect(onToken).not.toHaveBeenCalled(); expect(onError).toHaveBeenCalledWith(expect.stringContaining('expected provider state'));
});
it('requires secure crypto and enforces password complexity and confirmation', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: (bytes: Uint8Array) => { bytes.fill(171); return bytes; } } });
  try {
    expect(createOidcState()).toBe('ab'.repeat(24));
    Reflect.deleteProperty(globalThis, 'crypto');
    expect(() => createOidcState()).toThrow('Secure native random generation is unavailable');
  } finally {
    if (original) Object.defineProperty(globalThis, 'crypto', original); else Reflect.deleteProperty(globalThis, 'crypto');
  }
  expect(() => validateNewPassword('weak', 'weak')).toThrow('8–256');
  expect(() => validateNewPassword('StrongPassword1!', 'different')).toThrow('match');
  expect(() => validateNewPassword('StrongPassword1!', 'StrongPassword1!')).not.toThrow();
});
