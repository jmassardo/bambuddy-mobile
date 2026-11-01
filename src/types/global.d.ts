/** Installed at startup by react-native-get-random-values; declarations alone do not provide a runtime. */
declare const crypto: {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
};

/** Window and navigator globals for network connectivity detection */
declare const window: {
  addEventListener: typeof addEventListener;
  removeEventListener: typeof removeEventListener;
};

declare const navigator: {
  onLine: boolean;
};
