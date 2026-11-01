import { translateNative } from '@/i18n';
export function createOidcState(): string {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error(translateNative('native.ca0f8159abf61ae9'));
  }
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function validateNewPassword(password: string, confirmation: string): void {
  if (password !== confirmation) throw new Error(translateNative('native.4bf243cf9137809e'));
  if (password.length < 8 || password.length > 256 ||
      !/[A-Z]/.test(password) || !/[a-z]/.test(password) ||
      !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error(translateNative('native.8434abb09da7c887'));
  }

}

export function buildApiKeyEnrollment(baseUrl: string, key: string): string {
  return `bambuddy://config?v=1&url=${encodeURIComponent(baseUrl)}&key=${encodeURIComponent(key)}`;
}

export function oidcCallbackBase(authorizationUrl: string, configuredServerUrl: string): string {
  const authorization = new URL(authorizationUrl);
  const callback = new URL(authorization.searchParams.get('redirect_uri') ?? '');
  const configured = new URL(configuredServerUrl);
  const suffix = '/api/v1/auth/oidc/callback';
  if (authorization.protocol !== 'https:' || !authorization.searchParams.get('state') ||
      !callback.pathname.endsWith(suffix) || callback.username || callback.password ||
      callback.hash || callback.search ||
      (callback.protocol !== 'https:' && !(callback.protocol === 'http:' && callback.origin === configured.origin))) {
    throw new Error(translateNative('native.6ed0a70f7a3978c9'));
  }
  // The trusted server may advertise its HTTPS external URL instead of the LAN URL used by the app.
  return callback.origin + callback.pathname.slice(0, -suffix.length);
}
