'use strict';

const API_ARGUMENT_PREFIX = Object.freeze([
  'api',
  '-H',
  'Accept: application/vnd.github+json',
  '-H',
  'X-GitHub-Api-Version: 2022-11-28',
]);

const ERROR_DETAILS = Object.freeze({
  INVALID_ARGUMENT: Object.freeze({
    remediation: 'Fix the documented client argument; do not retry unchanged.',
    retryable: false,
  }),
  NOT_FOUND: Object.freeze({
    remediation:
      'Verify the documented repository resource exists and is readable.',
    retryable: false,
  }),
  MALFORMED_JSON: Object.freeze({
    remediation:
      'Retry once after GitHub CLI output is stable; inspect CLI/API compatibility if persistent.',
    retryable: true,
  }),
  MALFORMED_RESPONSE: Object.freeze({
    remediation:
      'Retry after repository state is stable; inspect the documented endpoint shape if persistent.',
    retryable: true,
  }),
  PAGE_SIZE_EXCEEDED: Object.freeze({
    remediation:
      'Retry after GitHub pagination is stable; do not accept the oversized page.',
    retryable: true,
  }),
  PAGINATION_DRIFT: Object.freeze({
    remediation:
      'Retry after repository configuration stops changing; never use partial data.',
    retryable: true,
  }),
  PAGE_LIMIT_EXCEEDED: Object.freeze({
    remediation:
      'Reduce the collection below the reviewed page bound or approve a contract change.',
    retryable: false,
  }),
  REQUEST_LIMIT_EXCEEDED: Object.freeze({
    remediation:
      'Reduce discovered resources below the reviewed run bound or approve a contract change.',
    retryable: false,
  }),
  INCOMPLETE_NAME_LIST: Object.freeze({
    remediation:
      'Retry the names-only listing and repair duplicate or malformed names if persistent.',
    retryable: true,
  }),
});

const COMMAND_ERROR_DETAILS = Object.freeze({
  auth: Object.freeze({
    remediation:
      'Authenticate with existing least-privilege read access; do not broaden permissions.',
    retryable: false,
  }),
  'rate-limit': Object.freeze({
    remediation:
      'Wait for the reported GitHub limit window, then retry the read-only verification.',
    retryable: true,
  }),
  other: Object.freeze({
    remediation:
      'Restore the local GitHub CLI or network, then retry the read-only operation.',
    retryable: true,
  }),
});

const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const OPERATION_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
const FIELD_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,254}$/;
const ENVIRONMENT_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,253}[A-Za-z0-9])?$/;

class CollectionError extends Error {
  constructor(code, operation, failureKind = null) {
    const details =
      code === 'COMMAND_FAILED'
        ? COMMAND_ERROR_DETAILS[failureKind]
        : ERROR_DETAILS[code];

    if (details === undefined) {
      throw new TypeError('Unsupported CollectionError code');
    }

    super(`${code} during ${operation}`);
    this.name = 'CollectionError';
    this.code = code;
    this.operation = operation;
    this.remediation = details.remediation;
    this.retryable = details.retryable;
    Object.freeze(this);
  }
}

function collectionError(code, operation, failureKind = null) {
  return new CollectionError(code, operation, failureKind);
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactKeys(value, allowedKeys, requiredKeys) {
  if (!isPlainObject(value)) {
    return false;
  }

  const keys = Reflect.ownKeys(value);
  return (
    keys.every(key => typeof key === 'string' && allowedKeys.includes(key)) &&
    keys.every(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor.enumerable && Object.hasOwn(descriptor, 'value');
    }) &&
    requiredKeys.every(key => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function deepFreeze(value) {
  if (value === null || !['object', 'function'].includes(typeof value)) {
    return value;
  }

  const pending = [value];
  const seen = new Set();
  while (pending.length > 0) {
    const current = pending.pop();
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);

    for (const key of Object.keys(current)) {
      const child = current[key];
      if (
        child !== null &&
        ['object', 'function'].includes(typeof child) &&
        !seen.has(child)
      ) {
        pending.push(child);
      }
    }
    Object.freeze(current);
  }

  return value;
}

function validOperation(operation) {
  return (
    typeof operation === 'string' &&
    operation.length >= 1 &&
    operation.length <= 80 &&
    OPERATION_PATTERN.test(operation)
  );
}

function validRepoSegment(segment) {
  return (
    segment.length >= 1 &&
    segment.length <= 100 &&
    /^[A-Za-z0-9._-]+$/.test(segment) &&
    segment !== '.' &&
    segment !== '..' &&
    segment[0] !== '.' &&
    segment[0] !== '-' &&
    !segment.endsWith('.')
  );
}

function validRepo(repo) {
  if (typeof repo !== 'string') {
    return false;
  }

  const segments = repo.split('/');
  return (
    segments.length === 2 &&
    validRepoSegment(segments[0]) &&
    validRepoSegment(segments[1])
  );
}

function validBound(value, maximum) {
  return Number.isInteger(value) && value >= 1 && value <= maximum;
}

function assertJsonValue(value, operation) {
  const pending = [value];
  const seen = new Set();

  while (pending.length > 0) {
    const current = pending.pop();
    if (
      current === null ||
      typeof current === 'string' ||
      typeof current === 'boolean' ||
      (typeof current === 'number' && Number.isFinite(current))
    ) {
      continue;
    }

    if (typeof current !== 'object' || seen.has(current)) {
      throw collectionError('MALFORMED_RESPONSE', operation);
    }
    seen.add(current);

    if (Array.isArray(current)) {
      if (Object.keys(current).length !== current.length) {
        throw collectionError('MALFORMED_RESPONSE', operation);
      }
      for (const item of current) {
        pending.push(item);
      }
      continue;
    }

    if (!isPlainObject(current)) {
      throw collectionError('MALFORMED_RESPONSE', operation);
    }

    for (const key of Object.keys(current)) {
      if (UNSAFE_KEYS.has(key)) {
        throw collectionError('MALFORMED_RESPONSE', operation);
      }
      pending.push(current[key]);
    }
  }
}

function parseJson(stdout, operation) {
  if (stdout.trim().length === 0) {
    throw collectionError('MALFORMED_JSON', operation);
  }

  let value;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw collectionError('MALFORMED_JSON', operation);
  }

  if (!isPlainObject(value) && !Array.isArray(value)) {
    throw collectionError('MALFORMED_RESPONSE', operation);
  }

  assertJsonValue(value, operation);
  return value;
}

function validRunnerResult(result) {
  if (
    !hasExactKeys(
      result,
      ['exitCode', 'stdout', 'stderr', 'failureKind'],
      ['exitCode', 'stdout', 'stderr', 'failureKind'],
    ) ||
    !Number.isInteger(result.exitCode) ||
    typeof result.stdout !== 'string' ||
    typeof result.stderr !== 'string'
  ) {
    return false;
  }

  if (result.exitCode === 0) {
    return result.failureKind === null;
  }

  return ['not-found', 'auth', 'rate-limit', 'other'].includes(
    result.failureKind,
  );
}

function validateApiPath(apiPath, repo) {
  if (
    typeof apiPath !== 'string' ||
    apiPath.includes('#') ||
    /[\u0000-\u0020\u007f\\]/.test(apiPath) ||
    !apiPath.startsWith(`repos/${repo}`)
  ) {
    return false;
  }

  const boundary = apiPath[`repos/${repo}`.length];
  if (boundary !== undefined && boundary !== '/' && boundary !== '?') {
    return false;
  }

  const questionMark = apiPath.indexOf('?');
  if (questionMark !== -1 && apiPath.indexOf('?', questionMark + 1) !== -1) {
    return false;
  }

  const pathPart =
    questionMark === -1 ? apiPath : apiPath.slice(0, questionMark);
  const query = questionMark === -1 ? null : apiPath.slice(questionMark + 1);
  const segments = pathPart.split('/');

  if (segments.some(segment => segment.length === 0)) {
    return false;
  }

  for (const segment of segments) {
    if (/%(?![0-9A-Fa-f]{2})/.test(segment)) {
      return false;
    }

    let decoded;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return false;
    }

    if (
      decoded === '.' ||
      decoded === '..' ||
      /%[0-9A-Fa-f]{2}/.test(decoded) ||
      /[\/\\\u0000-\u001f\u007f@]/.test(decoded)
    ) {
      return false;
    }
  }

  if (query === null) {
    return true;
  }

  return (
    pathPart === `repos/${repo}/collaborators` && query === 'affiliation=direct'
  );
}

function createGitHubClient(options) {
  const factoryOperation = 'client.create';
  if (
    !hasExactKeys(
      options,
      ['repo', 'runner', 'pageSize', 'maxPages', 'maxRequests'],
      ['repo', 'runner'],
    )
  ) {
    throw collectionError('INVALID_ARGUMENT', factoryOperation);
  }

  const {
    repo,
    runner,
    pageSize = 100,
    maxPages = 20,
    maxRequests = 512,
  } = options;

  if (
    !validRepo(repo) ||
    typeof runner !== 'function' ||
    !validBound(pageSize, 100) ||
    !validBound(maxPages, 20) ||
    !validBound(maxRequests, 512)
  ) {
    throw collectionError('INVALID_ARGUMENT', factoryOperation);
  }

  let requestCount = 0;

  function invoke(args, operation, allowNotFound) {
    if (requestCount >= maxRequests) {
      throw collectionError('REQUEST_LIMIT_EXCEEDED', operation);
    }
    requestCount += 1;

    let result;
    try {
      result = runner(Object.freeze([...args]));
    } catch {
      throw collectionError('COMMAND_FAILED', operation, 'other');
    }

    if (!validRunnerResult(result)) {
      throw collectionError('MALFORMED_RESPONSE', operation);
    }

    const { exitCode, stdout, failureKind } = result;
    if (exitCode !== 0) {
      if (failureKind === 'not-found') {
        if (allowNotFound) {
          return null;
        }
        throw collectionError('NOT_FOUND', operation);
      }
      throw collectionError('COMMAND_FAILED', operation, failureKind);
    }

    return parseJson(stdout, operation);
  }

  function validateMethodOptions(
    optionsValue,
    allowedKeys,
    requiredKeys,
    fallbackOperation,
  ) {
    const operation =
      isPlainObject(optionsValue) && validOperation(optionsValue.operation)
        ? optionsValue.operation
        : fallbackOperation;

    if (
      !hasExactKeys(optionsValue, allowedKeys, requiredKeys) ||
      !validOperation(optionsValue.operation)
    ) {
      throw collectionError('INVALID_ARGUMENT', operation);
    }

    return operation;
  }

  function requestJson(requestOptions) {
    const operation = validateMethodOptions(
      requestOptions,
      ['apiPath', 'operation', 'allowNotFound'],
      ['apiPath', 'operation'],
      'client.request',
    );
    const { apiPath, allowNotFound = false } = requestOptions;

    if (
      !validateApiPath(apiPath, repo) ||
      typeof allowNotFound !== 'boolean' ||
      (allowNotFound &&
        !(
          operation === 'branches.legacy-protection' &&
          (apiPath === `repos/${repo}/branches/dev/protection` ||
            apiPath === `repos/${repo}/branches/main/protection`)
        ))
    ) {
      throw collectionError('INVALID_ARGUMENT', operation);
    }

    const value = invoke(
      [...API_ARGUMENT_PREFIX, apiPath],
      operation,
      allowNotFound,
    );

    return deepFreeze(
      value === null ? { found: false, value: null } : { found: true, value },
    );
  }

  function collectApiPages(collectionOptions) {
    const operation = validateMethodOptions(
      collectionOptions,
      [
        'apiPath',
        'operation',
        'responseShape',
        'itemsField',
        'totalCountField',
      ],
      ['apiPath', 'operation', 'responseShape'],
      'client.collect',
    );
    const {
      apiPath,
      responseShape,
      itemsField = null,
      totalCountField = null,
    } = collectionOptions;

    const arrayShape =
      responseShape === 'array' &&
      itemsField === null &&
      totalCountField === null;
    const envelopeShape =
      responseShape === 'envelope' &&
      typeof itemsField === 'string' &&
      FIELD_PATTERN.test(itemsField) &&
      typeof totalCountField === 'string' &&
      FIELD_PATTERN.test(totalCountField) &&
      itemsField !== totalCountField;

    if (!validateApiPath(apiPath, repo) || (!arrayShape && !envelopeShape)) {
      throw collectionError('INVALID_ARGUMENT', operation);
    }

    const collected = [];
    let expectedTotal = null;
    let nextPage = 1;

    while (true) {
      if (nextPage > maxPages) {
        throw collectionError('PAGE_LIMIT_EXCEEDED', operation);
      }

      const separator = apiPath.includes('?') ? '&' : '?';
      const pagePath = `${apiPath}${separator}per_page=${pageSize}&page=${nextPage}`;
      const response = invoke(
        [...API_ARGUMENT_PREFIX, pagePath],
        operation,
        false,
      );

      let items;
      let currentTotal = null;
      if (arrayShape) {
        if (!Array.isArray(response)) {
          throw collectionError('MALFORMED_RESPONSE', operation);
        }
        items = response;
      } else {
        if (
          !isPlainObject(response) ||
          !Object.prototype.hasOwnProperty.call(response, itemsField) ||
          !Object.prototype.hasOwnProperty.call(response, totalCountField) ||
          !Array.isArray(response[itemsField]) ||
          !Number.isSafeInteger(response[totalCountField]) ||
          response[totalCountField] < 0
        ) {
          throw collectionError('MALFORMED_RESPONSE', operation);
        }

        items = response[itemsField];
        currentTotal = response[totalCountField];
      }

      if (items.length > pageSize) {
        throw collectionError('PAGE_SIZE_EXCEEDED', operation);
      }
      if (items.some(item => !isPlainObject(item))) {
        throw collectionError('MALFORMED_RESPONSE', operation);
      }
      if (envelopeShape) {
        if (expectedTotal === null) {
          expectedTotal = currentTotal;
        } else if (currentTotal !== expectedTotal) {
          throw collectionError('PAGINATION_DRIFT', operation);
        }
      }

      collected.push(...items);

      if (arrayShape) {
        if (items.length < pageSize) {
          return deepFreeze(collected);
        }
      } else {
        if (collected.length > expectedTotal) {
          throw collectionError('PAGINATION_DRIFT', operation);
        }
        if (collected.length === expectedTotal) {
          return deepFreeze(collected);
        }
        if (items.length === 0 || items.length < pageSize) {
          throw collectionError('PAGINATION_DRIFT', operation);
        }
      }

      nextPage += 1;
    }
  }

  function listNames(listOptions) {
    const operation = validateMethodOptions(
      listOptions,
      ['kind', 'environment', 'operation'],
      ['kind', 'operation'],
      'client.list-names',
    );
    const { kind, environment = null } = listOptions;

    if (
      !['secret', 'variable'].includes(kind) ||
      (environment !== null &&
        (typeof environment !== 'string' ||
          !ENVIRONMENT_PATTERN.test(environment) ||
          environment === '.' ||
          environment === '..'))
    ) {
      throw collectionError('INVALID_ARGUMENT', operation);
    }

    const args = [kind, 'list', '--repo', repo];
    if (environment !== null) {
      args.push('--env', environment);
    }
    args.push('--json', 'name');

    const response = invoke(args, operation, false);
    if (!Array.isArray(response)) {
      throw collectionError('INCOMPLETE_NAME_LIST', operation);
    }

    const names = [];
    const foldedNames = new Set();
    for (const item of response) {
      if (
        !hasExactKeys(item, ['name'], ['name']) ||
        typeof item.name !== 'string' ||
        !NAME_PATTERN.test(item.name)
      ) {
        throw collectionError('INCOMPLETE_NAME_LIST', operation);
      }

      const foldedName = item.name.toLowerCase();
      if (foldedNames.has(foldedName)) {
        throw collectionError('INCOMPLETE_NAME_LIST', operation);
      }
      foldedNames.add(foldedName);
      names.push(item.name);
    }

    names.sort();
    return deepFreeze(names);
  }

  const client = {
    requestJson,
    collectApiPages,
    listNames,
  };
  deepFreeze(client);
  return client;
}

Object.freeze(CollectionError.prototype);
Object.freeze(CollectionError);
Object.freeze(createGitHubClient);

module.exports = Object.freeze({
  CollectionError,
  createGitHubClient,
});
