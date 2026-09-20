/** React Native 0.72+ exposes the Web Crypto getRandomValues API globally. */
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
