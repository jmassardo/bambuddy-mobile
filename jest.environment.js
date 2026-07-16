const ReactNativeEnv =
  require('@react-native/jest-preset/jest/react-native-env');

module.exports = class PatchedReactNativeEnv extends ReactNativeEnv {
  constructor(config, context) {
    super(config, context);

    if (
      this.moduleMocker &&
      typeof this.moduleMocker.clearMocksOnScope !== 'function'
    ) {
      this.moduleMocker.clearMocksOnScope =
        this.moduleMocker.clearAllMocks.bind(this.moduleMocker);
    }
  }
};
