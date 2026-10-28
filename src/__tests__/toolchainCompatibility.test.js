const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { transformFileSync } = require('@babel/core');

describe('compiler isolation', () => {
  it('compiles native gesture worklets with the supported React Native compiler', () => {
    const output = transformFileSync(
      path.resolve(__dirname, '../screens/CameraScreen.tsx'),
    );
    expect(output.code).toContain('__workletHash');
  });

  it('runs Babel 8 presets independently of the native compiler', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import { createRequire } from 'node:module';
      import { runInNewContext } from 'node:vm';
      const require = createRequire(process.cwd() + '/tools/build-tools/package.json');
      const { transformSync } = await import(require.resolve('@babel/core'));
      const { default: presetEnv } = await import(require.resolve('@babel/preset-env'));
      const output = transformSync(
        'globalThis.result = ((value) => value?.answer ?? 0)({ answer: 42 });',
        { presets: [[presetEnv, { targets: { node: '10' } }]], babelrc: false, configFile: false },
      );
      const context = {};
      runInNewContext(output.code, context);
      console.log(context.result);
    `,
      ],
      { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' },
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('42');
  });

  it('keeps React hook rules active under the ESLint 10 compatibility adapter', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/eslint/bin/eslint.js',
        '--stdin',
        '--stdin-filename',
        'src/toolchain-check.tsx',
        '--format',
        'json',
      ],
      {
        cwd: path.resolve(__dirname, '../..'),
        encoding: 'utf8',
        input: `
        import { useState } from 'react';
        export function Example({ enabled }: { enabled: boolean }) {
          if (enabled) useState(0);
          return null;
        }
      `,
      },
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)[0].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'react-hooks/rules-of-hooks',
          severity: 2,
        }),
      ]),
    );
  });
});
