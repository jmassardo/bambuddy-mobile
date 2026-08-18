'use strict';

const {
  CONTRACT_VERSION,
  compareGovernanceFindings,
} = require('./github-governance-contract');
const {
  STRUCTURAL_MESSAGES,
  validateRoot,
  addError,
  childPath,
  expectArray,
  expectObject,
  expectString,
  validateCollectionLength,
  validateRepositoryPath,
} = require('./github-governance-validation-runtime');
const {
  compareTuples,
  identityTuple,
  requireCanonicalStrings,
} = require('./github-governance-validation-ordering');
const {
  validateGovernanceFindingInContext,
  findingIdentity,
} = require('./github-governance-validation-finding');

const WORKFLOW_SCAN_OWN_KEY_SLOTS = 2_015_003;
const MAX_SCANNED_FILES = 10000;
const MAX_FINDINGS = 5000;
const ROOT_KEYS = Object.freeze(['schemaVersion', 'scannedFiles', 'findings']);
const IDENTITY_STRING_KEYS = Object.freeze([
  'kind', 'code', 'severity', 'scope', 'subject', 'message', 'remediation',
]);
const EVIDENCE_BUCKET_KEYS = Object.freeze(['expected', 'observed', 'related']);
const hasOwn = Object.prototype.hasOwnProperty;

function requireRootShape(context, value, path) {
  const keys = Reflect.ownKeys(value);
  if (keys.length === ROOT_KEYS.length &&
      keys.every((key, index) => key === ROOT_KEYS[index])) return;
  addError(context, path, STRUCTURAL_MESSAGES.OBJECT_SHAPE);
}

function validateSchemaVersion(context, value, path) {
  const version = expectString(context, value, path);
  if (version !== null && version !== CONTRACT_VERSION)
    addError(context, path, STRUCTURAL_MESSAGES.REQUIRED_LITERAL);
}

function validateScannedFiles(context, value, path) {
  const files = expectArray(context, value, path);
  if (files === null ||
      !validateCollectionLength(context, files, path, MAX_SCANNED_FILES))
    return;
  let comparable = true;
  for (let index = 0; index < files.length; index += 1) {
    const filePath = childPath(path, String(index));
    const file = expectString(context, files[index], filePath);
    if (file === null) comparable = false;
    else validateRepositoryPath(context, file, filePath);
  }
  if (comparable) requireCanonicalStrings(context, files, path);
}

function comparableEvidenceBucket(items) {
  if (!Array.isArray(items)) return false;
  for (const item of items) {
    if (item === null || typeof item !== 'object' ||
        typeof item.namespace !== 'string' || typeof item.name !== 'string' ||
        (hasOwn.call(item, 'state') && typeof item.state !== 'string'))
      return false;
  }
  return true;
}

function comparableFinding(finding) {
  if (finding === null || typeof finding !== 'object' || Array.isArray(finding))
    return false;
  if (!Number.isSafeInteger(finding.schemaVersion)) return false;
  for (const key of IDENTITY_STRING_KEYS)
    if (typeof finding[key] !== 'string') return false;
  if (finding.path !== null && typeof finding.path !== 'string') return false;
  const location = finding.location;
  if (location !== null &&
      (location === undefined || typeof location !== 'object' ||
        !Number.isSafeInteger(location.line) ||
        !Number.isSafeInteger(location.column))) return false;
  const evidence = finding.evidence;
  if (evidence === null || typeof evidence !== 'object') return false;
  for (const key of EVIDENCE_BUCKET_KEYS)
    if (!comparableEvidenceBucket(evidence[key])) return false;
  return true;
}

function requireCanonicalFindings(context, findings, path) {
  if (findings.length === 0) return;
  let priorIdentity = identityTuple(findingIdentity(findings[0]));
  for (let index = 1; index < findings.length; index += 1) {
    const itemPath = childPath(path, String(index));
    const prior = findings[index - 1];
    const current = findings[index];
    if (compareGovernanceFindings(prior, current) > 0)
      addError(context, itemPath, STRUCTURAL_MESSAGES.CANONICAL_ORDER);
    const currentIdentity = identityTuple(findingIdentity(current));
    if (compareTuples(priorIdentity, currentIdentity) === 0)
      addError(context, itemPath, STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY);
    priorIdentity = currentIdentity;
  }
}

function validateFindings(context, value, path) {
  const findings = expectArray(context, value, path);
  if (findings === null ||
      !validateCollectionLength(context, findings, path, MAX_FINDINGS))
    return;
  let comparable = true;
  for (let index = 0; index < findings.length; index += 1) {
    const finding = findings[index];
    validateGovernanceFindingInContext(
      finding, context, childPath(path, String(index)),
    );
    if (!comparableFinding(finding)) comparable = false;
  }
  if (comparable) requireCanonicalFindings(context, findings, path);
}

function validateWorkflowScanInContext(clone, context, path) {
  const object = expectObject(context, clone, path);
  if (object === null) return undefined;
  requireRootShape(context, object, path);
  validateSchemaVersion(
    context, object.schemaVersion, childPath(path, 'schemaVersion'),
  );
  validateScannedFiles(
    context, object.scannedFiles, childPath(path, 'scannedFiles'),
  );
  validateFindings(context, object.findings, childPath(path, 'findings'));
  return undefined;
}

function validateWorkflowScan(value) {
  return validateRoot(value, WORKFLOW_SCAN_OWN_KEY_SLOTS, (clone, context) => {
    validateWorkflowScanInContext(clone, context, '');
    return undefined;
  });
}

for (const implementation of [
  requireRootShape, validateSchemaVersion, validateScannedFiles,
  comparableEvidenceBucket, comparableFinding, requireCanonicalFindings,
  validateFindings, validateWorkflowScanInContext, validateWorkflowScan,
]) Object.freeze(implementation);

module.exports = Object.freeze({
  validateWorkflowScan,
  validateWorkflowScanInContext,
});
