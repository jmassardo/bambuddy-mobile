'use strict';

const {
  GOVERNANCE_FINDING_SCHEMA_VERSION,
  GOVERNANCE_CONTRACT,
  SCANNER_FINDING_CODES,
  POLICY_FINDING_CODES,
} = require('./github-governance-contract');
const {
  STRUCTURAL_MESSAGES,
  validateRoot,
  addError,
  childPath,
  expectArray,
  expectEnum,
  expectInteger,
  expectNullable,
  expectObject,
  expectString,
  validateCollectionLength,
  validateRepositoryPath,
} = require('./github-governance-validation-runtime');
const {
  requireCanonicalArray,
} = require('./github-governance-validation-ordering');
const ROOT_KEYS = Object.freeze([
  'schemaVersion', 'kind', 'code', 'severity', 'scope', 'subject', 'message',
  'remediation', 'path', 'location', 'evidence',
]);
const LOCATION_KEYS = Object.freeze(['line', 'column']);
const EVIDENCE_KEYS = Object.freeze(['expected', 'observed', 'related']);
const EVIDENCE_ITEM_KEYS = Object.freeze(['namespace', 'name']);
const STATEFUL_EVIDENCE_ITEM_KEYS =
  Object.freeze(['namespace', 'name', 'state']);
const FINDING_KINDS = Object.freeze(['scanner', 'policy']);
const SEVERITIES = Object.freeze(['error', 'warning']);
const SCOPES = Object.freeze([
  'collection', 'workflow', 'workflow-file', 'ruleset', 'branch', 'environment',
  'environment-secret', 'environment-variable', 'repo-secret',
  'repo-variable', 'actions', 'production',
]);
const EVIDENCE_NAMESPACES = Object.freeze([
  ...GOVERNANCE_CONTRACT.evidence.nameNamespaces,
  ...GOVERNANCE_CONTRACT.evidence.identifierNamespaces,
]);
const hasOwn = Object.prototype.hasOwnProperty;
function exactKeys(value, expected) {
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (keys[index] !== expected[index]) return false;
  }
  return true;
}
function requireShape(context, value, path, expected) {
  if (exactKeys(value, expected)) return true;
  addError(context, path, STRUCTURAL_MESSAGES.OBJECT_SHAPE);
  return false;
}
function requireLiteral(context, value, path, expected) {
  if (value === expected) return true;
  addError(context, path, STRUCTURAL_MESSAGES.REQUIRED_LITERAL);
  return false;
}
function expectRepositoryPath(context, value, path) {
  const string = expectString(context, value, path);
  if (string !== null) validateRepositoryPath(context, string, path);
  return string;
}
function validUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (index + 1 === value.length) return false;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}
function validProse(value, maximum) {
  if (value.length < 1 || value.length > maximum || value !== value.trim() ||
      value !== value.normalize('NFC') || !validUnicode(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit <= 0x1f || (unit >= 0x7f && unit <= 0x9f) ||
        (unit >= 0x202a && unit <= 0x202e) ||
        (unit >= 0x2066 && unit <= 0x2069)) return false;
  }
  return true;
}
function validateProse(context, value, path, maximum) {
  const string = expectString(context, value, path);
  if (string !== null && !validProse(string, maximum))
    addError(context, path, STRUCTURAL_MESSAGES.EXPECTED_STRING);
}
function scannerScope(code) {
  switch (code) {
    case 'TRACKED_FILE_READ_FAILED':
    case 'SCHEMA_INVALID':
      return 'collection';
    case 'TRACKED_FILE_LIST_FAILED':
      return 'workflow';
    default:
      return SCANNER_FINDING_CODES.indexOf(code) === -1 ? null :
        'workflow-file';
  }
}
function policyScope(code) {
  if (typeof code !== 'string') return null;
  if (code.startsWith('RULESET_')) return 'ruleset';
  switch (code) {
    case 'LEGACY_BRANCH_PROTECTION_PRESENT':
    case 'GOVERNED_BRANCH_METADATA_INVALID':
      return 'branch';
    case 'ENVIRONMENT_MISSING':
    case 'ENVIRONMENT_ADMIN_BYPASS_MISMATCH':
    case 'ENVIRONMENT_SELF_REVIEW_MISMATCH':
    case 'ENVIRONMENT_DEPLOYMENT_POLICY_MISMATCH':
    case 'ENVIRONMENT_REVIEWER_MISMATCH':
      return 'environment';
    case 'ENVIRONMENT_SECRET_INVENTORY_MISMATCH':
    case 'COPILOT_FORBIDDEN_SECRET':
      return 'environment-secret';
    case 'ENVIRONMENT_VARIABLE_SHADOW':
      return 'environment-variable';
    case 'REPOSITORY_DEMO_SECRET_MISSING':
    case 'REPOSITORY_RELEASE_SECRET_MISSCOPED':
      return 'repo-secret';
    case 'REPOSITORY_VARIABLE_MISSING':
      return 'repo-variable';
    case 'ACTIONS_DEFAULT_PERMISSION_MISMATCH':
    case 'ACTIONS_PR_APPROVAL_MISMATCH':
    case 'ACTIONS_SHA_PINNING_MISMATCH':
    case 'REPOSITORY_MERGE_COMMIT_DISABLED':
      return 'actions';
    case 'PRODUCTION_PARTICIPANT_TOPOLOGY_BLOCKED':
      return 'production';
    default:
      return null;
  }
}

function validateLocation(context, value, path) {
  const object = expectObject(context, value, path);
  if (object === null) return null;
  requireShape(context, object, path, LOCATION_KEYS);
  expectInteger(context, object.line, childPath(path, 'line'), 1,
    Number.MAX_SAFE_INTEGER);
  expectInteger(context, object.column, childPath(path, 'column'), 1,
    Number.MAX_SAFE_INTEGER);
  return object;
}

function validateEvidenceItem(context, item, path) {
  const object = expectObject(context, item, path);
  if (object === null) return false;
  const stateful = hasOwn.call(object, 'state');
  const shapeValid = requireShape(
    context, object, path,
    stateful ? STATEFUL_EVIDENCE_ITEM_KEYS : EVIDENCE_ITEM_KEYS,
  );
  const namespace = expectEnum(
    context, object.namespace, childPath(path, 'namespace'),
    EVIDENCE_NAMESPACES,
  );
  const name = expectString(context, object.name, childPath(path, 'name'));
  let stateValid = true;
  if (stateful)
    stateValid = expectEnum(
      context, object.state, childPath(path, 'state'),
      GOVERNANCE_CONTRACT.evidence.stateValues,
    ) !== null;
  return shapeValid && namespace !== null && name !== null && stateValid;
}

function validateEvidenceBucket(context, value, path) {
  const items = expectArray(context, value, path);
  if (items === null || !validateCollectionLength(context, items, path, 32))
    return;
  let canonicalValues = true;
  for (let index = 0; index < items.length; index += 1) {
    if (!validateEvidenceItem(
      context, items[index], childPath(path, String(index)),
    )) canonicalValues = false;
  }
  if (canonicalValues)
    requireCanonicalArray(
      context,
      items,
      path,
      item => [
        item.namespace,
        item.name,
        hasOwn.call(item, 'state') ? item.state : '',
      ],
      item => [item.namespace, item.name],
    );
}

function validateEvidence(context, value, path) {
  const object = expectObject(context, value, path);
  if (object === null) return;
  requireShape(context, object, path, EVIDENCE_KEYS);
  for (const key of EVIDENCE_KEYS)
    validateEvidenceBucket(
      context, object[key], childPath(path, key),
    );
}

function validateGovernanceFindingInContext(clone, context, path) {
  const object = expectObject(context, clone, path);
  if (object === null) return;
  requireShape(context, object, path, ROOT_KEYS);

  const schemaPath = childPath(path, 'schemaVersion');
  const schemaVersion = expectInteger(
    context, object.schemaVersion, schemaPath,
    0, Number.MAX_SAFE_INTEGER,
  );
  if (schemaVersion !== null)
    requireLiteral(
      context, schemaVersion, schemaPath, GOVERNANCE_FINDING_SCHEMA_VERSION,
    );

  const kind = expectEnum(
    context, object.kind, childPath(path, 'kind'), FINDING_KINDS,
  );
  const codeValues = kind === 'scanner' ? SCANNER_FINDING_CODES :
    kind === 'policy' ? POLICY_FINDING_CODES : null;
  const code = codeValues === null ? null : expectEnum(
    context, object.code, childPath(path, 'code'), codeValues,
  );
  const severity = expectEnum(
    context, object.severity, childPath(path, 'severity'), SEVERITIES,
  );
  const scope = expectEnum(
    context, object.scope, childPath(path, 'scope'), SCOPES,
  );
  if (code !== null && severity !== null)
    requireLiteral(
      context,
      severity,
      childPath(path, 'severity'),
      code === 'PRODUCTION_PARTICIPANT_TOPOLOGY_BLOCKED' ? 'warning' : 'error',
    );
  const mappedScope = kind === 'scanner' ? scannerScope(code) :
    kind === 'policy' ? policyScope(code) : null;
  if (mappedScope !== null && scope !== null)
    requireLiteral(context, scope, childPath(path, 'scope'), mappedScope);

  validateProse(
    context, object.subject, childPath(path, 'subject'), 160,
  );
  validateProse(
    context, object.message, childPath(path, 'message'), 500,
  );
  validateProse(
    context, object.remediation, childPath(path, 'remediation'), 500,
  );

  const findingPath = expectNullable(
    context, object.path, childPath(path, 'path'), expectRepositoryPath,
  );
  const location = expectNullable(
    context, object.location, childPath(path, 'location'), validateLocation,
  );
  if (location !== null && findingPath === null && kind !== 'policy')
    requireLiteral(
      context, object.location, childPath(path, 'location'), null,
    );
  if (kind === 'policy') {
    if (findingPath !== null)
      requireLiteral(context, object.path, childPath(path, 'path'), null);
    if (location !== null)
      requireLiteral(context, object.location, childPath(path, 'location'), null);
  } else if (kind === 'scanner' && code !== null) {
    if (code !== 'SCHEMA_INVALID' && findingPath === null)
      requireLiteral(context, object.path, childPath(path, 'path'), '');
  }

  validateEvidence(context, object.evidence, childPath(path, 'evidence'));
}

function validateGovernanceFinding(value) {
  return validateRoot(value, 400, (clone, context) => {
    validateGovernanceFindingInContext(clone, context, '');
  });
}

function encodeString(value) {
  return `${value.length}:${value}`;
}

function encodeEvidence(items) {
  let encoded = `${items.length}|`;
  for (const item of items) {
    encoded += encodeString(item.namespace);
    encoded += encodeString(item.name);
    encoded += hasOwn.call(item, 'state') ?
      `1${encodeString(item.state)}` : '0';
  }
  return encoded;
}

function findingIdentity(finding) {
  const pathPresent = finding.path === null ? 0 : 1;
  const locationPresent = finding.location === null ? 0 : 1;
  return [
    finding.schemaVersion,
    finding.kind,
    finding.code,
    finding.severity,
    finding.scope,
    finding.subject,
    finding.message,
    finding.remediation,
    pathPresent,
    pathPresent === 0 ? '' : finding.path,
    locationPresent,
    locationPresent === 0 ? 0 : finding.location.line,
    locationPresent === 0 ? 0 : finding.location.column,
    encodeEvidence(finding.evidence.expected),
    encodeEvidence(finding.evidence.observed),
    encodeEvidence(finding.evidence.related),
  ];
}

for (const exportedFunction of [
  validateGovernanceFinding,
  validateGovernanceFindingInContext,
  findingIdentity,
]) Object.freeze(exportedFunction);

module.exports = Object.freeze({
  validateGovernanceFinding,
  validateGovernanceFindingInContext,
  findingIdentity,
});
