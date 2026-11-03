import { NativeModules, Platform } from 'react-native';
import { canRequestPasswordManagerLogin, findPasswordManagerLogin } from '@/utils/passwordManager';

const findLogin = jest.fn();

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  NativeModules.BambuddyPasswordManager = { findLogin };
  findLogin.mockReset();
});

afterEach(() => {
  delete NativeModules.BambuddyPasswordManager;
  jest.restoreAllMocks();
});

it('forwards the full configured website URL, including its port and base path', async () => {
  const login = { username: 'operator', password: 'example-password' };
  findLogin.mockResolvedValue(login);
  expect(canRequestPasswordManagerLogin()).toBe(true);
  await expect(findPasswordManagerLogin('https://farm.example:8443/bambuddy')).resolves.toEqual(login);
  expect(findLogin).toHaveBeenCalledWith('https://farm.example:8443/bambuddy');
});

it.each(['https://user:password@farm.example', 'https://farm.example?token=secret', 'https://farm.example#secret', 'file:///private/example'])(
  'does not forward unsupported or credential-bearing URLs: %s',
  async url => {
    await expect(findPasswordManagerLogin(url)).rejects.toThrow('Invalid server URL');
    expect(findLogin).not.toHaveBeenCalled();
  },
);

it('hides the action on other platforms and binaries without the native module', () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  expect(canRequestPasswordManagerLogin()).toBe(false);
  jest.replaceProperty(Platform, 'OS', 'ios');
  delete NativeModules.BambuddyPasswordManager;
  expect(canRequestPasswordManagerLogin()).toBe(false);
});
