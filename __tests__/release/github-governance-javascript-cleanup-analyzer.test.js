'use strict';

const { analyzeJavaScriptCredentialCleanup } = require('../../scripts/release/github-governance-javascript-cleanup-analyzer.js');
const { validateGovernanceFinding } = require('../../scripts/release/github-governance-validation-finding.js');
const { GOVERNANCE_FINDING_SCHEMA_VERSION } = require('../../scripts/release/github-governance-contract.js');

const CREDENTIAL_NAME_NAMESPACE = 'credential-name';

function expectValidFinding(findings, name, expectedCode) {
  for (const f of (findings || [])) {
    const validation = validateGovernanceFinding(f);
    if (!validation.ok) {
      throw new Error(`${name}: Finding failed validation: ${JSON.stringify(validation.errors, null, 2)}`);
    }
    if (expectedCode && f.code !== expectedCode) {
      throw new Error(`${name}: Expected code ${expectedCode}, got ${f.code}`);
    }
  }
  return findings;
}

describe('analyzeJavaScriptCredentialCleanup', () => {
  describe('CREDENTIAL_CLEANUP_UNPROVEN', () => {
    test('reports finding when credential is written without cleanup in finally', () => {
      const source = `
try {
  fs.writeFileSync(destination, process.env.MY_SECRET);
} finally {
  console.log('done');
}
`;
      const result = analyzeJavaScriptCredentialCleanup({
        filePath: 'test.js',
        source,
        credentialNames: ['MY_SECRET'],
      });

      expectValidFinding(result, 'no cleanup', 'CREDENTIAL_CLEANUP_UNPROVEN');
      expect(result.length).toBe(1);
      expect(result[0].subject).toBe('test.js: destination');
      expect(result[0].scope).toBe('workflow-file');
      expect(result[0].severity).toBe('error');
      expect(result[0].evidence.expected).toEqual([
        { namespace: CREDENTIAL_NAME_NAMESPACE, name: 'MY_SECRET', state: 'present' },
      ]);
    });

    test('reports finding when credential is written to file without any try/finally', () => {
      const source = `
fs.writeFileSync(destination, process.env.MY_SECRET);
`;
      const result = analyzeJavaScriptCredentialCleanup({
        filePath: 'test.js',
        source,
        credentialNames: ['MY_SECRET'],
      });

      expectValidFinding(result, 'no try block', 'CREDENTIAL_CLEANUP_UNPROVEN');
      expect(result.length).toBe(1);
    });

    test('does not report finding when credential is properly cleaned up in finally', () => {
      const source = `
try {
  fs.writeFileSync(destination, process.env.MY_SECRET);
} finally {
  fs.rmSync(destination);
}
`;
      const result = analyzeJavaScriptCredentialCleanup({
        filePath: 'test.js',
        source,
        credentialNames: ['MY_SECRET'],
      });

      expect(result).toEqual([]);
    });

    test('does not report finding with fs.unlinkSync cleanup', () => {
      const source = `
try {
  fs.writeFileSync(destination, process.env.MY_SECRET);
} finally {
  fs.unlinkSync(destination);
}
`;
      const result = analyzeJavaScriptCredentialCleanup({
        filePath: 'test.js',
        source,
        credentialNames: ['MY_SECRET'],
      });

      expect(result).toEqual([]);
    });

    test('does not report finding with async fs.promises.rm cleanup', () => {
      const source = `
try {
  fs.writeFileSync(destination, process.env.MY_SECRET);
} finally {
  await fs.promises.rm(destination);
}
`;
      const result = analyzeJavaScriptCredentialCleanup({
        filePath: 'test.js',
        source,
        credentialNames: ['MY_SECRET'],
      });

      expect(result).toEqual([]);
    });

    test('does not report finding with async fs.promises.unlink cleanup', () => {
      const source = `
try {
  fs.writeFileSync(destination, process.env.MY_SECRET);
} finally {
  await fs.promises.unlink(destination);
}
`;
      const result = analyzeJavaScriptCredentialCleanup({
        filePath: 'test.js',
        source,
        credentialNames: ['MY_SECRET'],
      });

      expect(result).toEqual([]);
    });

    test('reports finding when cleanup uses different identifier', () => {
      const source = `
try {
  fs.writeFileSync(destination, process.env.MY_SECRET);
} finally {
  fs.rmSync(other_file);
}
`;
      const result = analyzeJavaScriptCredentialCleanup({
        filePath: 'test.js',
        source,
        credentialNames: ['MY_SECRET'],
      });

      expectValidFinding(result, 'wrong identifier', 'CREDENTIAL_CLEANUP_UNPROVEN');
      expect(result.length).toBe(1);
    });
  });

  describe('credential detection', () => {
    test('detects process.env.CREDENTIAL_NAME access', () => {
      const source = `
try {
  fs.writeFileSync(file, process.env.SECRET_KEY);
} finally {
  console.log('done');
}
`;
      const result = analyzeJavaScriptCredentialCleanup({
        filePath: 'test.js',
        source,
        credentialNames: ['SECRET_KEY'],
      });

      expect(result.length).toBe(1);
    });

    test('ignores non-credential environment variables', () => {
      const source = `
try {
  fs.writeFileSync(file, process.env.NODE_ENV);
} finally {
  console.log('done');
}
`;
      const result = analyzeJavaScriptCredentialCleanup({
        filePath: 'test.js',
        source,
        credentialNames: ['SECRET_KEY'],
      });

      expect(result).toEqual([]);
    });

    test('supports multiple credential names', () => {
      const source = `
try {
  fs.writeFileSync(file, process.env.SECRET_A);
} finally {
  console.log('done');
}
`;
      const result1 = analyzeJavaScriptCredentialCleanup({
        filePath: 'test.js',
        source,
        credentialNames: ['SECRET_A', 'SECRET_B'],
      });
      expect(result1.length).toBe(1);

      const result2 = analyzeJavaScriptCredentialCleanup({
        filePath: 'test.js',
        source,
        credentialNames: ['SECRET_B'],
      });
      expect(result2).toEqual([]);
    });
  });

  describe('async writeFile', () => {
    test('detects async fs.promises.writeFile', () => {
      const source = `
try {
  await fs.promises.writeFile(file, process.env.SECRET);
} finally {
  console.log('done');
}
`;
      const result = analyzeJavaScriptCredentialCleanup({
        filePath: 'test.js',
        source,
        credentialNames: ['SECRET'],
      });

      expectValidFinding(result, 'async write', 'CREDENTIAL_CLEANUP_UNPROVEN');
      expect(result.length).toBe(1);
    });

    test('allows async cleanup with fs.promises.rm', () => {
      const source = `
try {
  await fs.promises.writeFile(file, process.env.SECRET);
} finally {
  await fs.promises.rm(file);
}
`;
      const result = analyzeJavaScriptCredentialCleanup({
        filePath: 'test.js',
        source,
        credentialNames: ['SECRET'],
      });

      expect(result).toEqual([]);
    });
  });

  describe('nested try statements', () => {
    test('reports each destination that lacks cleanup in its nearest finally', () => {
      const source = `
try {
  try {
    fs.writeFileSync(inner, process.env.SECRET);
  } finally {
    fs.rmSync(inner);
  }
  fs.writeFileSync(outer, process.env.SECRET);
} finally {
  console.log('done');
}
`;
      const result = analyzeJavaScriptCredentialCleanup({
        filePath: 'test.js',
        source,
        credentialNames: ['SECRET'],
      });

      expectValidFinding(result, 'nested', 'CREDENTIAL_CLEANUP_UNPROVEN');
      expect(result.length).toBe(1);
      expect(result[0].subject).toBe('test.js: outer');
    });
  });

  describe('unsupported forms', () => {
    test('handles empty source', () => {
      const result = analyzeJavaScriptCredentialCleanup({
        filePath: 'test.js',
        source: '',
        credentialNames: ['SECRET'],
      });
      expect(result).toEqual([]);
    });

    test('handles source with no try blocks', () => {
      const source = `
const file = 'test.txt';
console.log('hello');
`;
      const result = analyzeJavaScriptCredentialCleanup({
        filePath: 'test.js',
        source,
        credentialNames: ['SECRET'],
      });
      expect(result).toEqual([]);
    });
  });

  describe('UNSUPPORTED_SOURCE_SYNTAX', () => {
    test('reports finding when source cannot be parsed', () => {
      const source = `
this is not valid javascript { { {
`;
      const result = analyzeJavaScriptCredentialCleanup({
        filePath: 'invalid.js',
        source,
        credentialNames: ['SECRET'],
      });

      expect(result.length).toBe(1);
      expect(result[0].code).toBe('UNSUPPORTED_SOURCE_SYNTAX');
      expect(result[0].subject).toBe('invalid.js');
    });
  });

  describe('output validation', () => {
    test('every finding has correct schema version', () => {
      const source = `
try {
  fs.writeFileSync(file, process.env.SECRET);
} finally {
  console.log('done');
}
`;
      const result = analyzeJavaScriptCredentialCleanup({
        filePath: 'test.js',
        source,
        credentialNames: ['SECRET'],
      });

      for (const f of result) {
        expect(f.schemaVersion).toBe(GOVERNANCE_FINDING_SCHEMA_VERSION);
      }
    });

    test('output is frozen', () => {
      const source = `
try {
  fs.writeFileSync(file, process.env.SECRET);
} finally {
  console.log('done');
}
`;
      const result = analyzeJavaScriptCredentialCleanup({
        filePath: 'test.js',
        source,
        credentialNames: ['SECRET'],
      });

      expect(Object.isFrozen(result)).toBe(true);
      for (const f of result) {
        expect(Object.isFrozen(f)).toBe(true);
      }
    });

    test('findings are sorted by location', () => {
      const source = `
try {
  fs.writeFileSync(outer, process.env.SECRET);
  try {
    fs.writeFileSync(inner, process.env.SECRET);
  } finally {
    console.log('done');
  }
} finally {
  console.log('done');
}
`;
      const result = analyzeJavaScriptCredentialCleanup({
        filePath: 'test.js',
        source,
        credentialNames: ['SECRET'],
      });

      expect(result.length).toBe(2);
      if (result[0].location && result[1].location) {
        expect(result[0].location.line).toBeLessThanOrEqual(result[1].location.line);
      }
    });
  });

  describe('credentialNames input validation', () => {
    test('returns empty array when credentialNames is null', () => {
      const result = analyzeJavaScriptCredentialCleanup({
        filePath: 'test.js',
        source: 'try { fs.writeFileSync(f, process.env.SEC); } finally { fs.rmSync(f); }',
        credentialNames: null,
      });
      expect(result).toEqual([]);
    });

    test('returns empty array when credentialNames is not an array', () => {
      const result = analyzeJavaScriptCredentialCleanup({
        filePath: 'test.js',
        source: 'try { fs.writeFileSync(f, process.env.SEC); } finally { fs.rmSync(f); }',
        credentialNames: undefined,
      });
      expect(result).toEqual([]);
    });
  });

  describe('subject and message format', () => {
    test('subject includes file path and destination identifier', () => {
      const source = `
try {
  fs.writeFileSync(myFile, process.env.SECRET);
} finally {
  console.log('done');
}
`;
      const result = analyzeJavaScriptCredentialCleanup({
        filePath: 'scripts/release/test.js',
        source,
        credentialNames: ['SECRET'],
      });

      expect(result.length).toBe(1);
      expect(result[0].subject).toBe('scripts/release/test.js: myFile');
      expect(result[0].message).toContain('credential secret');
      expect(result[0].message).toContain('finally block');
    });

    test('message never contains source text or credential values', () => {
      const source = `
try {
  fs.writeFileSync(file, process.env.EXPOSED_SECRET_TOKEN);
} finally {
  console.log('done');
}
`;
      const result = analyzeJavaScriptCredentialCleanup({
        filePath: 'test.js',
        source,
        credentialNames: ['EXPOSED_SECRET_TOKEN'],
      });

      expect(result.length).toBe(1);
      expect(result[0].message).not.toMatch(/EXPOSED_SECRET_TOKEN/);
      expect(result[0].message).not.toMatch(/EXPOSED/);
      expect(result[0].message).not.toMatch(/SECRET/);
    });

    test('subject never contains source text', () => {
      const source = `
try {
  fs.writeFileSync(cred_file, process.env.MY_TOKEN);
} finally {
  console.log('done');
}
`;
      const result = analyzeJavaScriptCredentialCleanup({
        filePath: 'test.js',
        source,
        credentialNames: ['MY_TOKEN'],
      });

      expect(result.length).toBe(1);
      expect(result[0].subject).toBe('test.js: cred_file');
      expect(result[0].subject).not.toContain('process');
      expect(result[0].subject).not.toContain('ENV');
    });
  });
});
