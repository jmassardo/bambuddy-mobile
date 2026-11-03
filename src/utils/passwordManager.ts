import { NativeModules, Platform } from 'react-native';
import { translateNative } from '@/i18n';

interface PasswordManagerLogin {
  username: string;
  password: string;
}

interface PasswordManagerModule {
  findLogin: (serverUrl: string) => Promise<PasswordManagerLogin | null>;
}

function nativeModule(): PasswordManagerModule | undefined {
  return NativeModules.BambuddyPasswordManager;
}

export function canRequestPasswordManagerLogin(): boolean {
  return Platform.OS === 'ios' && typeof nativeModule()?.findLogin === 'function';
}

export async function findPasswordManagerLogin(serverUrl: string): Promise<PasswordManagerLogin | null> {
  const url = new URL(serverUrl);
  if (!/^https?:$/.test(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error('Invalid server URL');
  }
  const module = nativeModule();
  if (!canRequestPasswordManagerLogin() || !module) {
    throw new Error(translateNative('auth.passwordManagerFailed'));
  }
  return module.findLogin(serverUrl);
}
