// Mock for @/api/server - TypeScript compatible
const mockState = { serverUrl: null, demoMode: false, loading: false };
const setStateMock = jest.fn();
const getStateMock = jest.fn(() => mockState);

export const useServerStore: any = Object.assign(
  jest.fn(() => ({ ...mockState })),
  { setState: setStateMock, getState: getStateMock }
);

export const apiUrl = 'https://test.bambuddy.local';
export const registerServerUrlChangeHandler = jest.fn();
