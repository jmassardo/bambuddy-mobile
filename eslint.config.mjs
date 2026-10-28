import js from '@eslint/js';
import babelParser from './tools/build-tools/index.js';
import { FlatCompat } from '@eslint/eslintrc';
import { fixupConfigRules } from '@eslint/compat';
import { fileURLToPath } from 'node:url';

const compat = new FlatCompat({
  baseDirectory: fileURLToPath(new URL('.', import.meta.url)),
  recommendedConfig: js.configs.recommended,
});

export default [
  // React Native still publishes legacy config/plugins; adapt their rule APIs for ESLint 10.
  ...fixupConfigRules(compat.extends('@react-native')),
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          babelrc: false,
          configFile: false,
          parserOpts: { plugins: ['jsx'] },
        },
      },
    },
  },
  {
    rules: {
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'no-void': 'off',
      'react-native/no-inline-styles': 'off',
      'react/no-unstable-nested-components': ['warn', { allowAsProps: true }],
    },
  },
];
