// Jest setup for Bambuddy Mobile
import '@testing-library/jest-native/extend-expect';

// Mock react-native-keychain
jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn(() => Promise.resolve(true)),
  getGenericPassword: jest.fn(() => Promise.resolve(false)),
  resetGenericPassword: jest.fn(() => Promise.resolve(true)),
}));

// Mock @react-native-async-storage/async-storage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

// Mock react-native-device-info
jest.mock('react-native-device-info', () => ({
  getVersion: () => '1.0.0',
  getBuildNumber: () => '1',
  getSystemName: () => 'iOS',
  getSystemVersion: () => '17.0',
  getModel: () => 'iPhone 15',
  getDeviceId: () => 'test-device-id',
  getUniqueId: () => Promise.resolve('test-unique-id'),
  hasNotch: () => true,
  isTablet: () => false,
}));

// Mock react-native-nfc-manager
jest.mock('react-native-nfc-manager', () => ({
  default: {
    start: jest.fn(),
    isEnabled: jest.fn(() => Promise.resolve(true)),
    requestTechnology: jest.fn(),
    getTag: jest.fn(),
    cancelTechnologyRequest: jest.fn(),
  },
  NfcTech: { Ndef: 'Ndef', NfcA: 'NfcA' },
  Ndef: { text: { decodePayload: jest.fn() } },
}));

// Mock lucide-react-native (return simple View components)
jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        if (prop === '__esModule') return true;
        return (props: Record<string, unknown>) =>
          require('react').createElement(View, { testID: `icon-${prop}`, ...props });
      },
    },
  );
});

// Mock react-native-svg
jest.mock('react-native-svg', () => {
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: View,
    Svg: View,
    Rect: View,
    Circle: View,
    Path: View,
    Line: View,
    Text: Text,
    G: View,
    Defs: View,
    ClipPath: View,
    LinearGradient: View,
    Stop: View,
  };
});

// Suppress act() warnings in tests
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('act(')) return;
  originalConsoleError(...args);
};

// Mock Linking
jest.mock('react-native/Libraries/Linking/Linking', () => ({
  openURL: jest.fn(() => Promise.resolve()),
  canOpenURL: jest.fn(() => Promise.resolve(true)),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
}));
