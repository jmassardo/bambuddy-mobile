module.exports = {
  preset: '@react-native/jest-preset',
  setupFilesAfterSetup: ['./jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-reanimated|react-native-gesture-handler|react-native-screens|react-native-safe-area-context|@react-native-async-storage|react-native-keychain|react-native-device-info|lucide-react-native|react-native-svg)/)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/'],
};
