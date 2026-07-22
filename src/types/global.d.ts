/** React Native 0.72+ exposes the Web Crypto getRandomValues API globally. */
declare const crypto: {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
};
