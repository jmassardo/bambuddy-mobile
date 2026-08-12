'use strict';

const {
  CollectionError,
  createGitHubClient,
} = require('../../scripts/release/github-governance-github-client');

const repo = 'octo-org/bam_buddy';
const apiPrefix = [
  'api',
  '-H',
  'Accept: application/vnd.github+json',
  '-H',
  'X-GitHub-Api-Version: 2022-11-28',
];
const remediationByCode = {
  INVALID_ARGUMENT:
    'Fix the documented client argument; do not retry unchanged.',
  NOT_FOUND:
    'Verify the documented repository resource exists and is readable.',
  MALFORMED_JSON:
    'Retry once after GitHub CLI output is stable; inspect CLI/API compatibility if persistent.',
  MALFORMED_RESPONSE:
    'Retry after repository state is stable; inspect the documented endpoint shape if persistent.',
  PAGE_SIZE_EXCEEDED:
    'Retry after GitHub pagination is stable; do not accept the oversized page.',
  PAGINATION_DRIFT:
    'Retry after repository configuration stops changing; never use partial data.',
  PAGE_LIMIT_EXCEEDED:
    'Reduce the collection below the reviewed page bound or approve a contract change.',
  REQUEST_LIMIT_EXCEEDED:
    'Reduce discovered resources below the reviewed run bound or approve a contract change.',
  INCOMPLETE_NAME_LIST:
    'Retry the names-only listing and repair duplicate or malformed names if persistent.',
};

function result(stdout, overrides = {}) {
  return {
    exitCode: 0,
    stdout: typeof stdout === 'string' ? stdout : JSON.stringify(stdout),
    stderr: '',
    failureKind: null,
    ...overrides,
  };
}

function createSequenceRunner(responses) {
  const runner = jest.fn();
  for (const response of responses) {
    runner.mockImplementationOnce(() => response);
  }
  return runner;
}

function expectCollectionError(action, code, operation, retryable) {
  let error;
  try {
    action();
  } catch (caught) {
    error = caught;
  }

  expect(error).toBeInstanceOf(CollectionError);
  expect(error).toMatchObject({ code, operation, retryable });
  expect(error.message).toBe(`${code} during ${operation}`);
  if (code !== 'COMMAND_FAILED') {
    expect(error.remediation).toBe(remediationByCode[code]);
  }
  expect(Object.keys(error)).toEqual([
    'name',
    'code',
    'operation',
    'remediation',
    'retryable',
  ]);
  expect(Object.isFrozen(error)).toBe(true);
  return error;
}

function request(client, overrides = {}) {
  return client.requestJson({
    apiPath: `repos/${repo}`,
    operation: 'repo.metadata',
    ...overrides,
  });
}

function collect(client, overrides = {}) {
  return client.collectApiPages({
    apiPath: `repos/${repo}/rulesets`,
    operation: 'rulesets.list',
    responseShape: 'array',
    ...overrides,
  });
}

describe('createGitHubClient', () => {
  test('exports only the closed production surface and returns a frozen client', () => {
    const exported = require('../../scripts/release/github-governance-github-client');
    const runner = jest.fn(() => result({ id: 1 }));
    const client = createGitHubClient({ repo, runner });

    expect(Object.keys(exported)).toEqual([
      'CollectionError',
      'createGitHubClient',
    ]);
    expect(Object.isFrozen(exported)).toBe(true);
    expect(Object.keys(client)).toEqual([
      'requestJson',
      'collectApiPages',
      'listNames',
    ]);
    expect(Object.isFrozen(client)).toBe(true);
    expect(Object.values(client).every(Object.isFrozen)).toBe(true);
    expect(client.runner).toBeUndefined();
    expect(() => {
      client.requestJson = null;
    }).toThrow(TypeError);
  });

  test.each([
    undefined,
    null,
    {},
    { repo },
    { repo, runner: 'not-a-function' },
    { repo: 'owner', runner: () => result({}) },
    { repo: 'owner/name/extra', runner: () => result({}) },
    { repo: '.owner/name', runner: () => result({}) },
    { repo: '-owner/name', runner: () => result({}) },
    { repo: 'owner./name', runner: () => result({}) },
    { repo: 'owner/.', runner: () => result({}) },
    { repo: 'owner/..', runner: () => result({}) },
    { repo: 'owner/name.', runner: () => result({}) },
    { repo: 'owner/na me', runner: () => result({}) },
    { repo: `${'o'.repeat(101)}/name`, runner: () => result({}) },
    { repo, runner: () => result({}), extra: true },
    { repo, runner: () => result({}), pageSize: 0 },
    { repo, runner: () => result({}), pageSize: 101 },
    { repo, runner: () => result({}), pageSize: 1.5 },
    { repo, runner: () => result({}), maxPages: 0 },
    { repo, runner: () => result({}), maxPages: 21 },
    { repo, runner: () => result({}), maxRequests: 0 },
    { repo, runner: () => result({}), maxRequests: 513 },
  ])('rejects invalid closed factory input %#', options => {
    expectCollectionError(
      () => createGitHubClient(options),
      'INVALID_ARGUMENT',
      'client.create',
      false,
    );
  });

  test('accepts both reviewed bound extremes and valid repository punctuation', () => {
    expect(() =>
      createGitHubClient({
        repo: '_owner/repo-name_',
        runner: () => result({}),
        pageSize: 1,
        maxPages: 1,
        maxRequests: 1,
      }),
    ).not.toThrow();
    expect(() =>
      createGitHubClient({
        repo,
        runner: () => result({}),
        pageSize: 100,
        maxPages: 20,
        maxRequests: 512,
      }),
    ).not.toThrow();
  });

  test.each(['repo', 'runner', 'pageSize', 'maxPages', 'maxRequests'])(
    'rejects a factory %s accessor without executing it',
    property => {
      const canary = `factory-${property}-accessor-canary`;
      const getter = jest.fn(() => {
        throw new Error(canary);
      });
      const options = {
        repo,
        runner: () => result({}),
        pageSize: 100,
        maxPages: 20,
        maxRequests: 512,
      };
      Object.defineProperty(options, property, {
        enumerable: true,
        get: getter,
      });

      const error = expectCollectionError(
        () => createGitHubClient(options),
        'INVALID_ARGUMENT',
        'client.create',
        false,
      );

      expect(getter).not.toHaveBeenCalled();
      expect(
        [
          JSON.stringify(error),
          Object.keys(error).join(' '),
          error.message,
          error.stack,
          error.remediation,
        ].join(' '),
      ).not.toContain(canary);
    },
  );
});

describe('requestJson', () => {
  test('uses the exact API vector and deeply freezes object and array results', () => {
    const payload = { nested: { values: [{ id: 1 }] } };
    const runner = jest.fn(() => result(payload));
    const client = createGitHubClient({ repo, runner });
    const response = request(client);

    expect(runner).toHaveBeenCalledWith([...apiPrefix, `repos/${repo}`]);
    expect(response).toEqual({ found: true, value: payload });
    expect(Object.isFrozen(response)).toBe(true);
    expect(Object.isFrozen(response.value)).toBe(true);
    expect(Object.isFrozen(response.value.nested)).toBe(true);
    expect(Object.isFrozen(response.value.nested.values)).toBe(true);
    expect(Object.isFrozen(response.value.nested.values[0])).toBe(true);
    expect(() => {
      response.value.nested.values[0].id = 9;
    }).toThrow(TypeError);
    expect(() => {
      response.value.nested.values.push({ id: 9 });
    }).toThrow(TypeError);
    expect(() => {
      response.value.nested.extra = true;
    }).toThrow(TypeError);
    expect(() => {
      response.extra = true;
    }).toThrow(TypeError);

    const arrayResponse = request(
      createGitHubClient({ repo, runner: () => result([{ id: 2 }]) }),
    );
    expect(Object.isFrozen(arrayResponse.value)).toBe(true);
    expect(Object.isFrozen(arrayResponse.value[0])).toBe(true);
  });

  test('preserves the sole allowed caller query byte-for-byte', () => {
    const runner = jest.fn(() => result([]));
    const client = createGitHubClient({ repo, runner });

    request(client, {
      apiPath: `repos/${repo}/collaborators?affiliation=direct`,
      operation: 'collaborators.list',
    });

    expect(runner).toHaveBeenCalledWith([
      ...apiPrefix,
      `repos/${repo}/collaborators?affiliation=direct`,
    ]);
  });

  test('accepts lowercase operation slug segments containing digits', () => {
    const client = createGitHubClient({ repo, runner: () => result({}) });
    expect(request(client, { operation: 'repo2.metadata-v1' })).toEqual({
      found: true,
      value: {},
    });
  });

  test.each([
    'https://api.github.com/repos/octo-org/bam_buddy',
    `//repos/${repo}`,
    `repos/${repo}evil`,
    `repos/${repo}/`,
    `repos/${repo}//rulesets`,
    `repos/${repo}/./rulesets`,
    `repos/${repo}/%2e%2e/rulesets`,
    `repos/${repo}/%2Frulesets`,
    `repos/${repo}/%5crulesets`,
    `repos/${repo}/%252e%252e/rulesets`,
    `repos/${repo}/%252Frulesets`,
    `repos/${repo}/%255crulesets`,
    `repos/${repo}/%2500rulesets`,
    `repos/${repo}/bad%escape`,
    `repos/${repo}/bad path`,
    `repos/${repo}/name@host`,
    `repos/${repo}/rulesets#fragment`,
    `repos/${repo}/rulesets?page=1`,
    `repos/${repo}/rulesets?per_page=100`,
    `repos/${repo}/rulesets?token=canary`,
    `repos/${repo}/rulesets?=value`,
    `repos/${repo}/rulesets?a=1&a=2`,
    `repos/${repo}/collaborators?affiliation=outside`,
  ])('rejects unsafe repository path or query %#', apiPath => {
    const runner = jest.fn(() => result({}));
    const client = createGitHubClient({ repo, runner });

    expectCollectionError(
      () => request(client, { apiPath }),
      'INVALID_ARGUMENT',
      'repo.metadata',
      false,
    );
    expect(runner).not.toHaveBeenCalled();
  });

  test.each([
    {},
    { apiPath: `repos/${repo}` },
    { apiPath: `repos/${repo}`, operation: 'UPPER' },
    { apiPath: `repos/${repo}`, operation: 'bad..slug' },
    { apiPath: `repos/${repo}`, operation: 'a'.repeat(81) },
    { apiPath: `repos/${repo}`, operation: 'repo.metadata', extra: true },
    {
      apiPath: `repos/${repo}`,
      operation: 'repo.metadata',
      allowNotFound: 'yes',
    },
  ])('rejects malformed and non-closed request options %#', options => {
    const client = createGitHubClient({ repo, runner: () => result({}) });
    const expectedOperation =
      !Object.hasOwn(options, 'extra') &&
      typeof options.operation === 'string' &&
      /^[a-z]+(?:-[a-z]+)*(?:\.[a-z]+(?:-[a-z]+)*)*$/.test(options.operation) &&
      options.operation.length <= 80
        ? options.operation
        : 'client.request';

    expectCollectionError(
      () => client.requestJson(options),
      'INVALID_ARGUMENT',
      expectedOperation,
      false,
    );
  });

  test('allows not-found only for the two legacy branch protection calls', () => {
    const notFound = result('', {
      exitCode: 1,
      failureKind: 'not-found',
    });
    const runner = createSequenceRunner([notFound, notFound]);
    const client = createGitHubClient({ repo, runner });

    for (const branch of ['dev', 'main']) {
      expect(
        request(client, {
          apiPath: `repos/${repo}/branches/${branch}/protection`,
          operation: 'branches.legacy-protection',
          allowNotFound: true,
        }),
      ).toEqual({ found: false, value: null });
    }

    expectCollectionError(
      () =>
        request(createGitHubClient({ repo, runner: () => notFound }), {
          operation: 'repo.metadata',
        }),
      'NOT_FOUND',
      'repo.metadata',
      false,
    );
    expectCollectionError(
      () =>
        request(createGitHubClient({ repo, runner: () => notFound }), {
          allowNotFound: true,
        }),
      'INVALID_ARGUMENT',
      'repo.metadata',
      false,
    );
  });

  test.each([
    [
      result('', { exitCode: 1, failureKind: 'auth' }),
      'COMMAND_FAILED',
      false,
      'Authenticate with existing least-privilege read access; do not broaden permissions.',
    ],
    [
      result('', { exitCode: 1, failureKind: 'rate-limit' }),
      'COMMAND_FAILED',
      true,
      'Wait for the reported GitHub limit window, then retry the read-only verification.',
    ],
    [
      result('', { exitCode: 1, failureKind: 'other' }),
      'COMMAND_FAILED',
      true,
      'Restore the local GitHub CLI or network, then retry the read-only operation.',
    ],
  ])(
    'maps classified command failures without retrying %#',
    (runnerResult, code, retryable, remediation) => {
      const runner = jest.fn(() => runnerResult);
      const client = createGitHubClient({ repo, runner });
      const error = expectCollectionError(
        () => request(client),
        code,
        'repo.metadata',
        retryable,
      );

      expect(error.remediation).toBe(remediation);
      expect(runner).toHaveBeenCalledTimes(1);
    },
  );

  test.each([
    {},
    { exitCode: 0, stdout: '{}', stderr: '', failureKind: 'other' },
    { exitCode: 1, stdout: '', stderr: '', failureKind: null },
    { exitCode: 1, stdout: '', stderr: '', failureKind: 'unknown' },
    { exitCode: 0, stdout: {}, stderr: '', failureKind: null },
    {
      exitCode: 0,
      stdout: '{}',
      stderr: '',
      failureKind: null,
      extra: true,
    },
  ])('rejects malformed closed runner results %#', runnerResult => {
    const client = createGitHubClient({
      repo,
      runner: () => runnerResult,
    });
    expectCollectionError(
      () => request(client),
      'MALFORMED_RESPONSE',
      'repo.metadata',
      true,
    );
  });

  test.each(['', '   ', '{', 'not-json'])(
    'rejects empty or malformed JSON %#',
    stdout => {
      const client = createGitHubClient({ repo, runner: () => result(stdout) });
      expectCollectionError(
        () => request(client),
        'MALFORMED_JSON',
        'repo.metadata',
        true,
      );
    },
  );

  test.each(['null', 'true', '1', '"value"'])(
    'rejects primitive JSON roots %#',
    stdout => {
      const client = createGitHubClient({ repo, runner: () => result(stdout) });
      expectCollectionError(
        () => request(client),
        'MALFORMED_RESPONSE',
        'repo.metadata',
        true,
      );
    },
  );

  test.each([
    '{"__proto__":{"canary":true}}',
    '{"safe":{"prototype":"canary"}}',
    '[{"nested":{"constructor":"canary"}}]',
  ])('rejects unsafe keys at every JSON depth %#', stdout => {
    const client = createGitHubClient({ repo, runner: () => result(stdout) });
    expectCollectionError(
      () => request(client),
      'MALFORMED_RESPONSE',
      'repo.metadata',
      true,
    );
  });

  test('treats a successful 404 payload field as ordinary data', () => {
    const response = request(
      createGitHubClient({ repo, runner: () => result({ status: 404 }) }),
    );
    expect(response).toEqual({ found: true, value: { status: 404 } });
  });
});

describe('collectApiPages', () => {
  test.each([
    [[], []],
    [[{ id: 1 }], [{ id: 1 }]],
  ])('returns empty and short array pages %#', (page, expected) => {
    const runner = jest.fn(() => result(page));
    const client = createGitHubClient({ repo, runner, pageSize: 2 });

    expect(collect(client)).toEqual(expected);
    expect(runner).toHaveBeenCalledWith([
      ...apiPrefix,
      `repos/${repo}/rulesets?per_page=2&page=1`,
    ]);
  });

  test('collects sequential pages in API order and preserves duplicates', () => {
    const duplicate = { id: 2 };
    const runner = createSequenceRunner([
      result([{ id: 1 }, duplicate]),
      result([duplicate, { id: 3 }]),
      result([]),
    ]);
    const client = createGitHubClient({ repo, runner, pageSize: 2 });

    const collected = collect(client);

    expect(collected).toEqual([{ id: 1 }, { id: 2 }, { id: 2 }, { id: 3 }]);
    expect(runner.mock.calls.map(([args]) => args.at(-1))).toEqual([
      `repos/${repo}/rulesets?per_page=2&page=1`,
      `repos/${repo}/rulesets?per_page=2&page=2`,
      `repos/${repo}/rulesets?per_page=2&page=3`,
    ]);
    expect(Object.isFrozen(collected)).toBe(true);
    expect(collected.every(Object.isFrozen)).toBe(true);
  });

  test('appends pagination after the preserved collaborators query', () => {
    const runner = jest.fn(() => result([]));
    const client = createGitHubClient({ repo, runner });
    collect(client, {
      apiPath: `repos/${repo}/collaborators?affiliation=direct`,
      operation: 'collaborators.list',
    });
    expect(runner).toHaveBeenCalledWith([
      ...apiPrefix,
      `repos/${repo}/collaborators?affiliation=direct&per_page=100&page=1`,
    ]);
  });

  test('requires an empty proof page after an exact-full array page', () => {
    const runner = createSequenceRunner([result([{ id: 1 }]), result([])]);
    const client = createGitHubClient({ repo, runner, pageSize: 1 });

    expect(collect(client)).toEqual([{ id: 1 }]);
    expect(runner).toHaveBeenCalledTimes(2);
  });

  test('rejects oversized pages and non-object collection items', () => {
    expectCollectionError(
      () =>
        collect(
          createGitHubClient({
            repo,
            runner: () => result([{ id: 1 }, { id: 2 }]),
            pageSize: 1,
          }),
        ),
      'PAGE_SIZE_EXCEEDED',
      'rulesets.list',
      true,
    );
    expectCollectionError(
      () =>
        collect(
          createGitHubClient({
            repo,
            runner: () => result([1]),
            pageSize: 2,
          }),
        ),
      'MALFORMED_RESPONSE',
      'rulesets.list',
      true,
    );
  });

  test('fails rather than returning a full page when the page bound is exhausted', () => {
    const runner = jest.fn(() => result([{ id: 1 }]));
    const client = createGitHubClient({
      repo,
      runner,
      pageSize: 1,
      maxPages: 1,
    });
    expectCollectionError(
      () => collect(client),
      'PAGE_LIMIT_EXCEEDED',
      'rulesets.list',
      false,
    );
    expect(runner).toHaveBeenCalledTimes(1);
  });

  test('shares and enforces the client lifetime request budget', () => {
    const runner = jest.fn(() => result({ id: 1 }));
    const client = createGitHubClient({ repo, runner, maxRequests: 2 });
    request(client);
    request(client);
    expectCollectionError(
      () => request(client),
      'REQUEST_LIMIT_EXCEEDED',
      'repo.metadata',
      false,
    );
    expect(runner).toHaveBeenCalledTimes(2);
  });

  test('enforces the request budget before an array proof request', () => {
    const runner = jest.fn(() => result([{ id: 1 }]));
    const client = createGitHubClient({
      repo,
      runner,
      pageSize: 1,
      maxRequests: 1,
    });
    expectCollectionError(
      () => collect(client),
      'REQUEST_LIMIT_EXCEEDED',
      'rulesets.list',
      false,
    );
    expect(runner).toHaveBeenCalledTimes(1);
  });

  test('returns zero-total and exact-total envelopes without an extra probe', () => {
    const zeroRunner = jest.fn(() =>
      result({ environments: [], total_count: 0 }),
    );
    const zeroClient = createGitHubClient({ repo, runner: zeroRunner });
    expect(
      collect(zeroClient, {
        apiPath: `repos/${repo}/environments`,
        operation: 'environments.list',
        responseShape: 'envelope',
        itemsField: 'environments',
        totalCountField: 'total_count',
      }),
    ).toEqual([]);
    expect(zeroRunner).toHaveBeenCalledTimes(1);

    const oneRunner = jest.fn(() =>
      result({ environments: [{ name: 'prod' }], total_count: 1 }),
    );
    const oneClient = createGitHubClient({ repo, runner: oneRunner });
    expect(
      collect(oneClient, {
        apiPath: `repos/${repo}/environments`,
        operation: 'environments.list',
        responseShape: 'envelope',
        itemsField: 'environments',
        totalCountField: 'total_count',
      }),
    ).toEqual([{ name: 'prod' }]);
    expect(oneRunner).toHaveBeenCalledTimes(1);
  });

  test('collects a stable multi-page envelope', () => {
    const runner = createSequenceRunner([
      result({
        branch_policies: [{ id: 1 }, { id: 2 }],
        total_count: 3,
      }),
      result({ branch_policies: [{ id: 3 }], total_count: 3 }),
    ]);
    const client = createGitHubClient({ repo, runner, pageSize: 2 });
    const collected = collect(client, {
      apiPath: `repos/${repo}/environments/prod/deployment-branch-policies`,
      operation: 'environments.branch-policies',
      responseShape: 'envelope',
      itemsField: 'branch_policies',
      totalCountField: 'total_count',
    });
    expect(collected).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });

  test.each([
    [
      [
        { items: [{ id: 1 }], total: 2 },
        { items: [{ id: 2 }], total: 3 },
      ],
      1,
    ],
    [[{ items: [], total: 1 }], 2],
    [[{ items: [{ id: 1 }], total: 3 }], 2],
    [[{ items: [{ id: 1 }, { id: 2 }], total: 1 }], 2],
  ])('rejects envelope pagination drift %#', (pages, pageSize) => {
    const runner = createSequenceRunner(pages.map(page => result(page)));
    const client = createGitHubClient({ repo, runner, pageSize });
    expectCollectionError(
      () =>
        collect(client, {
          responseShape: 'envelope',
          itemsField: 'items',
          totalCountField: 'total',
        }),
      'PAGINATION_DRIFT',
      'rulesets.list',
      true,
    );
  });

  test.each([
    {},
    { items: [], total: -1 },
    { items: [], total: 1.5 },
    { items: {}, total: 0 },
    { items: [1], total: 1 },
  ])('rejects malformed envelope payloads %#', payload => {
    const client = createGitHubClient({ repo, runner: () => result(payload) });
    expectCollectionError(
      () =>
        collect(client, {
          responseShape: 'envelope',
          itemsField: 'items',
          totalCountField: 'total',
        }),
      'MALFORMED_RESPONSE',
      'rulesets.list',
      true,
    );
  });

  test.each([
    { responseShape: 'array', itemsField: 'items' },
    { responseShape: 'array', totalCountField: 'total' },
    { responseShape: 'envelope' },
    {
      responseShape: 'envelope',
      itemsField: 'not-valid',
      totalCountField: 'total',
    },
    {
      responseShape: 'envelope',
      itemsField: 'items',
      totalCountField: 'items',
    },
    { responseShape: 'unknown' },
    { responseShape: 'array', extra: true },
  ])('rejects invalid or non-closed shape options %#', overrides => {
    const client = createGitHubClient({ repo, runner: () => result([]) });
    expectCollectionError(
      () => collect(client, overrides),
      'INVALID_ARGUMENT',
      Object.hasOwn(overrides, 'extra') ? 'client.collect' : 'rulesets.list',
      false,
    );
  });
});

describe('listNames', () => {
  test('uses exact repository and environment vectors and sorts valid names', () => {
    const runner = createSequenceRunner([
      result([{ name: 'ZED' }, { name: '_FIRST' }, { name: 'Alpha1' }]),
      result([]),
    ]);
    const client = createGitHubClient({ repo, runner });

    expect(
      client.listNames({
        kind: 'secret',
        operation: 'repository.secret-names',
      }),
    ).toEqual(['Alpha1', 'ZED', '_FIRST']);
    expect(
      client.listNames({
        kind: 'variable',
        environment: 'prod-1.us',
        operation: 'environments.variable-names',
      }),
    ).toEqual([]);
    expect(runner.mock.calls).toEqual([
      [['secret', 'list', '--repo', repo, '--json', 'name']],
      [
        [
          'variable',
          'list',
          '--repo',
          repo,
          '--env',
          'prod-1.us',
          '--json',
          'name',
        ],
      ],
    ]);
  });

  test.each(
    [
      [{ name: 'DUP' }, { name: 'DUP' }],
      [{ name: 'DUP' }, { name: 'dup' }],
      [{ name: '' }],
      [{ name: '1startsWithNumber' }],
      [{ name: 'has-hyphen' }],
      [{ name: 'a'.repeat(256) }],
      [{}],
      [{ name: 'VALID', extra: true }],
      [null],
    ].map(payload => [payload]),
  )('rejects incomplete, invalid, and duplicate names %#', payload => {
    const client = createGitHubClient({ repo, runner: () => result(payload) });
    expectCollectionError(
      () =>
        client.listNames({
          kind: 'secret',
          operation: 'repository.secret-names',
        }),
      'INCOMPLETE_NAME_LIST',
      'repository.secret-names',
      true,
    );
  });

  test('rejects a non-array names response', () => {
    const client = createGitHubClient({
      repo,
      runner: () => result({ name: 'A' }),
    });
    expectCollectionError(
      () =>
        client.listNames({
          kind: 'variable',
          operation: 'repository.variable-names',
        }),
      'INCOMPLETE_NAME_LIST',
      'repository.variable-names',
      true,
    );
  });

  test.each([
    { kind: 'value', operation: 'repository.secret-names' },
    { kind: 'secret', environment: '', operation: 'repository.secret-names' },
    {
      kind: 'secret',
      environment: '-inject',
      operation: 'repository.secret-names',
    },
    {
      kind: 'secret',
      environment: 'ends-',
      operation: 'repository.secret-names',
    },
    {
      kind: 'secret',
      environment: '_starts',
      operation: 'repository.secret-names',
    },
    {
      kind: 'secret',
      environment: 'token=canary',
      operation: 'repository.secret-names',
    },
    {
      kind: 'secret',
      environment: 'a'.repeat(256),
      operation: 'repository.secret-names',
    },
    { kind: 'secret', operation: 'repository.secret-names', extra: true },
  ])('rejects unsafe names-list options %#', options => {
    const runner = jest.fn(() => result([]));
    const client = createGitHubClient({ repo, runner });
    expectCollectionError(
      () => client.listNames(options),
      'INVALID_ARGUMENT',
      Object.hasOwn(options, 'extra')
        ? 'client.list-names'
        : 'repository.secret-names',
      false,
    );
    expect(runner).not.toHaveBeenCalled();
  });

  test('returns a deeply frozen empty or populated name array', () => {
    const populated = createGitHubClient({
      repo,
      runner: () => result([{ name: 'NAME' }]),
    }).listNames({
      kind: 'secret',
      operation: 'repository.secret-names',
    });
    const empty = createGitHubClient({
      repo,
      runner: () => result([]),
    }).listNames({
      kind: 'secret',
      operation: 'repository.secret-names',
    });
    expect(Object.isFrozen(populated)).toBe(true);
    expect(Object.isFrozen(empty)).toBe(true);
    expect(() => populated.push('OTHER')).toThrow(TypeError);
  });
});

describe('sanitization and local consumer contract', () => {
  test.each([
    [
      'requestJson',
      'client.request',
      {
        apiPath: `repos/${repo}`,
        operation: 'repo.metadata',
      },
    ],
    [
      'collectApiPages',
      'client.collect',
      {
        apiPath: `repos/${repo}/rulesets`,
        operation: 'rulesets.list',
        responseShape: 'array',
      },
    ],
    [
      'listNames',
      'client.list-names',
      {
        kind: 'secret',
        operation: 'repository.secret-names',
      },
    ],
  ])(
    'rejects a throwing %s operation accessor without executing or leaking it',
    (method, fallbackOperation, options) => {
      const canary = `${method}-operation-accessor-canary`;
      const getter = jest.fn(() => {
        throw new Error(canary);
      });
      Object.defineProperty(options, 'operation', {
        enumerable: true,
        get: getter,
      });
      const runner = jest.fn(() => result({}));
      const client = createGitHubClient({ repo, runner });
      const error = expectCollectionError(
        () => client[method](options),
        'INVALID_ARGUMENT',
        fallbackOperation,
        false,
      );

      expect(getter).not.toHaveBeenCalled();
      expect(runner).not.toHaveBeenCalled();
      expect(
        [
          JSON.stringify(error),
          Object.keys(error).join(' '),
          error.message,
          error.stack,
          error.remediation,
        ].join(' '),
      ).not.toContain(canary);
    },
  );

  test.each([
    [
      'stdout-canary',
      () =>
        createGitHubClient({
          repo,
          runner: () => result('stdout-canary'),
        }),
      client => request(client),
    ],
    [
      'stderr-canary',
      () =>
        createGitHubClient({
          repo,
          runner: () =>
            result('', {
              exitCode: 1,
              stderr: 'stderr-canary',
              failureKind: 'auth',
            }),
        }),
      client => request(client),
    ],
    [
      'json-value-canary',
      () =>
        createGitHubClient({
          repo,
          runner: () => result('[{"safe":"json-value-canary"},1]'),
        }),
      client => collect(client),
    ],
    [
      'query-canary',
      () => createGitHubClient({ repo, runner: () => result({}) }),
      client =>
        request(client, {
          apiPath: `repos/${repo}/rulesets?token=query-canary`,
        }),
    ],
    [
      'environment-canary',
      () => createGitHubClient({ repo, runner: () => result([]) }),
      client =>
        client.listNames({
          kind: 'secret',
          environment: 'token=environment-canary',
          operation: 'repository.secret-names',
        }),
    ],
    [
      'exception-canary',
      () =>
        createGitHubClient({
          repo,
          runner: () => {
            throw new Error('exception-canary');
          },
        }),
      client => request(client),
    ],
  ])('does not expose independent %s input', (canary, create, action) => {
    let error;
    try {
      action(create());
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(CollectionError);
    const serialized = JSON.stringify(error);
    const observable = [
      serialized,
      Object.keys(error).join(' '),
      error.message,
      error.stack,
      error.remediation,
    ].join(' ');
    expect(observable).not.toContain(canary);
    expect(error).not.toHaveProperty('cause');
    for (const forbidden of [
      'command',
      'args',
      'executable',
      'path',
      'url',
      'status',
      'payload',
      'stdout',
      'stderr',
      'response',
      'token',
      'value',
      'partialResult',
    ]) {
      expect(error).not.toHaveProperty(forbidden);
    }
  });

  test('supports a fake collector using only the frozen three-method contract', () => {
    const calls = [];
    const runner = args => {
      calls.push(args);
      if (args[0] === 'secret' || args[0] === 'variable') {
        return result([{ name: args[0] === 'secret' ? 'SECRET_A' : 'VAR_A' }]);
      }

      const path = args.at(-1);
      if (path.includes('per_page=')) {
        if (path.includes('/rulesets?')) {
          return result([{ id: 7 }]);
        }
        if (path.includes('/environments?')) {
          return result({
            environments: [{ name: 'prod' }],
            total_count: 1,
          });
        }
        if (path.includes('/deployment-branch-policies?')) {
          return result({ branch_policies: [{ id: 3 }], total_count: 1 });
        }
        if (path.includes('/collaborators?')) {
          return result([{ login: 'octocat' }]);
        }
      }
      if (path.endsWith('/branches/dev/protection')) {
        return result('', { exitCode: 1, failureKind: 'not-found' });
      }
      return result({ path });
    };

    function fakeCollector(client) {
      const metadata = client.requestJson({
        apiPath: `repos/${repo}`,
        operation: 'repo.metadata',
      });
      const rulesets = client.collectApiPages({
        apiPath: `repos/${repo}/rulesets`,
        operation: 'rulesets.list',
        responseShape: 'array',
      });
      const ruleset = client.requestJson({
        apiPath: `repos/${repo}/rulesets/7`,
        operation: 'rulesets.detail',
      });
      const environments = client.collectApiPages({
        apiPath: `repos/${repo}/environments`,
        operation: 'environments.list',
        responseShape: 'envelope',
        itemsField: 'environments',
        totalCountField: 'total_count',
      });
      const environment = client.requestJson({
        apiPath: `repos/${repo}/environments/prod`,
        operation: 'environments.detail',
      });
      const branchPolicies = client.collectApiPages({
        apiPath: `repos/${repo}/environments/prod/deployment-branch-policies`,
        operation: 'environments.branch-policies',
        responseShape: 'envelope',
        itemsField: 'branch_policies',
        totalCountField: 'total_count',
      });
      const environmentSecrets = client.listNames({
        kind: 'secret',
        environment: 'prod',
        operation: 'environments.secret-names',
      });
      const environmentVariables = client.listNames({
        kind: 'variable',
        environment: 'prod',
        operation: 'environments.variable-names',
      });
      const repositorySecrets = client.listNames({
        kind: 'secret',
        operation: 'repository.secret-names',
      });
      const repositoryVariables = client.listNames({
        kind: 'variable',
        operation: 'repository.variable-names',
      });
      const workflowDefaults = client.requestJson({
        apiPath: `repos/${repo}/actions/permissions/workflow`,
        operation: 'actions.workflow-defaults',
      });
      const actionsPolicy = client.requestJson({
        apiPath: `repos/${repo}/actions/permissions`,
        operation: 'actions.policy',
      });
      const collaborators = client.collectApiPages({
        apiPath: `repos/${repo}/collaborators?affiliation=direct`,
        operation: 'collaborators.list',
        responseShape: 'array',
      });
      const branches = ['dev', 'main'].map(branch => ({
        metadata: client.requestJson({
          apiPath: `repos/${repo}/branches/${branch}`,
          operation: 'branches.metadata',
        }),
        protection: client.requestJson({
          apiPath: `repos/${repo}/branches/${branch}/protection`,
          operation: 'branches.legacy-protection',
          allowNotFound: true,
        }),
      }));

      return {
        metadata,
        rulesets,
        ruleset,
        environments,
        environment,
        branchPolicies,
        environmentSecrets,
        environmentVariables,
        repositorySecrets,
        repositoryVariables,
        workflowDefaults,
        actionsPolicy,
        collaborators,
        branches,
      };
    }

    const assembled = fakeCollector(createGitHubClient({ repo, runner }));

    expect(assembled.rulesets).toEqual([{ id: 7 }]);
    expect(assembled.environments).toEqual([{ name: 'prod' }]);
    expect(assembled.environmentSecrets).toEqual(['SECRET_A']);
    expect(assembled.repositoryVariables).toEqual(['VAR_A']);
    expect(assembled.branches[0].protection).toEqual({
      found: false,
      value: null,
    });
    expect(assembled.branches[1].protection.found).toBe(true);
    expect(calls).toHaveLength(17);
  });
});
