module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      // Inlines the demo-instance settings at bundle time so no credentials
      // are committed to this (public) repository. Unset vars inline as
      // `undefined`, which disables the demo button.
      'transform-inline-environment-variables',
      {
        include: [
          'BAMBUDDY_DEMO_URL',
          'BAMBUDDY_DEMO_USERNAME',
          'BAMBUDDY_DEMO_PASSWORD',
        ],
      },
    ],
    [
      'module-resolver',
      {
        root: ['./'],
        alias: {
          '@': './src',
        },
      },
    ],
    'react-native-reanimated/plugin',
  ],
};
