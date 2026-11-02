module.exports = {
  dependencies: {
    // Keep phone NFC unlinked until device scanning is re-enabled.
    'react-native-nfc-manager': {
      platforms: {
        ios: null,
        android: null,
      },
    },
  },
};
