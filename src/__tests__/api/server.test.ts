import { apiUrl, isInsecureUrl, useServerStore, wsUrl } from '@/api/server';
import AsyncStorage from '@react-native-async-storage/async-storage';

describe('server store', () => {
  beforeEach(() => {
    useServerStore.setState({ serverUrl: null, loading: true });
    (AsyncStorage.setItem as jest.Mock).mockClear();
    (AsyncStorage.getItem as jest.Mock).mockClear();
    (AsyncStorage.removeItem as jest.Mock).mockClear();
  });

  describe('setServerUrl', () => {
    it('normalizes trailing slashes', async () => {
      await useServerStore.getState().setServerUrl('https://bb.example.com///');
      expect(useServerStore.getState().serverUrl).toBe('https://bb.example.com');
    });

    it('persists to AsyncStorage', async () => {
      await useServerStore.getState().setServerUrl('https://bb.example.com');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'bambuddy-server-url',
        'https://bb.example.com',
      );
    });

    it('accepts HTTP URLs', async () => {
      await useServerStore.getState().setServerUrl('http://bb.example.com');
      expect(useServerStore.getState().serverUrl).toBe('http://bb.example.com');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'bambuddy-server-url',
        'http://bb.example.com',
      );
    });

    it('rejects URLs without a valid scheme', async () => {
      await expect(
        useServerStore.getState().setServerUrl('not-a-url'),
      ).rejects.toThrow('HTTP');
    });
  });

  describe('clearServerUrl', () => {
    it('clears stored URL and state', async () => {
      useServerStore.setState({ serverUrl: 'https://bb.example.com' });
      await useServerStore.getState().clearServerUrl();
      expect(useServerStore.getState().serverUrl).toBeNull();
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('bambuddy-server-url');
    });
  });

  describe('loadServerUrl', () => {
    it('loads URL from AsyncStorage', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('https://bb.example.com');
      await useServerStore.getState().loadServerUrl();
      expect(useServerStore.getState().serverUrl).toBe('https://bb.example.com');
      expect(useServerStore.getState().loading).toBe(false);
    });

    it('sets null when no stored URL', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      await useServerStore.getState().loadServerUrl();
      expect(useServerStore.getState().serverUrl).toBeNull();
      expect(useServerStore.getState().loading).toBe(false);
    });
  });
});

describe('URL helpers', () => {
  describe('apiUrl', () => {
    it('builds a full API URL', () => {
      expect(apiUrl('https://bb.example.com', '/printers/')).toBe(
        'https://bb.example.com/api/v1/printers/',
      );
    });

    it('does not double-slash', () => {
      const result = apiUrl('https://bb.example.com', '/test');
      expect(result).not.toContain('//test');
    });
  });

  describe('wsUrl', () => {
    it('converts http to ws protocol', () => {
      expect(wsUrl('https://bb.example.com')).toBe(
        'wss://bb.example.com/api/v1/ws',
      );
    });

    it('appends token when provided', () => {
      const url = wsUrl('https://bb.example.com', 'my-token');
      expect(url).toBe('wss://bb.example.com/api/v1/ws?token=my-token');
    });

    it('encodes special characters in token', () => {
      const url = wsUrl('https://bb.example.com', 'tok en=val');
      expect(url).toContain('token=tok%20en%3Dval');
    });

    it('omits token param when not provided', () => {
      const url = wsUrl('https://bb.example.com');
      expect(url).not.toContain('?');
    });
  });

  describe('isInsecureUrl', () => {
    it('returns true for http URLs', () => {
      expect(isInsecureUrl('http://192.168.1.50:3000')).toBe(true);
      expect(isInsecureUrl('http://my-server.local')).toBe(true);
    });

    it('returns false for https URLs', () => {
      expect(isInsecureUrl('https://bb.example.com')).toBe(false);
    });

    it('returns false for empty or non-http strings', () => {
      expect(isInsecureUrl('')).toBe(false);
      expect(isInsecureUrl('ftp://files.example.com')).toBe(false);
    });
  });
});
