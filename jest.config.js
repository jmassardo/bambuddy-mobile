module.exports = {
  preset: '@react-native/jest-preset',
  testEnvironment: '<rootDir>/jest.environment.js',
  setupFilesAfterEnv: ['./jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-reanimated|react-native-gesture-handler|react-native-screens|react-native-safe-area-context|@react-native-async-storage|react-native-keychain|react-native-device-info|lucide-react-native|react-native-svg|react-native-chart-kit)/)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/__tests__/**',
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      statements: 13,
      branches: 10,
      functions: 7,
      lines: 13,
    },
  },
};
