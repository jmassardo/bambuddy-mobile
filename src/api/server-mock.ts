// Mock for @/api/server - properly exposes zustand API
const defaultState = { serverUrl: null, demoMode: false, loading: false };

let _state = { ...defaultState };

const setState = jest.fn((partial: any) => {
  _state = { ..._state, ...partial };
  // Simulate zustand's state replacement
  if (typeof partial === 'function') {
    _state = partial(_state);
  }
});

const getState = jest.fn(() => _state);

// The store function itself (what useServerStore is)
const useServerStore = Object.assign(
  jest.fn(() => _state),
  { setState, getState }
) as any;

export { useServerStore, setState, getState };

export const apiUrl = 'https://test.bambuddy.local';
export const registerServerUrlChangeHandler = jest.fn();
