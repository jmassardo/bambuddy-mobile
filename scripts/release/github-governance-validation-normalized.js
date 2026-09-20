'use strict';

const {
  NORMALIZED_STATE_SCHEMA_VERSION,
} = require('./github-governance-contract');
const {
  STRUCTURAL_MESSAGES,
  addError,
  childPath,
  expectArray,
  expectBoolean,
  expectEnum,
  expectInteger,
  expectObject,
  expectString,
  validateCollectionLength,
  validateRoot,
} = require('./github-governance-validation-runtime');
const {
  foldAsciiCase,
  requireCanonicalArray,
  requireCanonicalStrings,
} = require('./github-governance-validation-ordering');
const {
  validateRulesetsInContext,
} = require('./github-governance-validation-rulesets');
const {
  validateEnvironmentsInContext,
} = require('./github-governance-validation-environments');
const {
  validateWorkflowScanInContext,
} = require('./github-governance-validation-workflow');

const NORMALIZED_OWN_KEY_SLOTS = 2_592_031;
const INVENTORY_LIMIT = 1000;
const COLLABORATOR_LIMIT = 500;
const MAXIMUM_ID = Number.MAX_SAFE_INTEGER;
const ROOT_KEYS = Object.freeze([
  'schemaVersion', 'repository', 'rulesets', 'legacyBranchProtection',
  'environments', 'repositorySecretNames', 'repositoryVariableNames',
  'actions', 'collaborators', 'branches', 'workflowScan',
]);
const REPOSITORY_KEYS = Object.freeze([
  'nameWithOwner', 'defaultBranch', 'allowMergeCommit',
]);
const LEGACY_KEYS = Object.freeze(['dev', 'main']);
const LEGACY_BRANCH_KEYS = Object.freeze(['exists', 'protected']);
const ACTION_KEYS = Object.freeze([
  'defaultWorkflowPermissions', 'canApprovePullRequestReviews',
  'shaPinningRequired', 'allowedActions',
]);
const COLLABORATOR_KEYS = Object.freeze(['login', 'id', 'permission']);
const BRANCH_KEYS = Object.freeze(['dev', 'main']);
const BRANCH_RECORD_KEYS = Object.freeze(['name']);
const DEFAULT_PERMISSION_VALUES = Object.freeze(['read', 'write']);
const ALLOWED_ACTION_VALUES = Object.freeze(['all', 'local_only', 'selected']);
const COLLABORATOR_PERMISSION_VALUES = Object.freeze([
  'admin', 'maintain', 'push', 'triage', 'pull',
]);

function expectShape(context, value, path, expectedKeys) {
  const object = expectObject(context, value, path);
  if (object === null) return null;
  const keys = Reflect.ownKeys(object);
  if (keys.length === expectedKeys.length &&
      keys.every((key, index) => key === expectedKeys[index])) return object;
  addError(context, path, STRUCTURAL_MESSAGES.OBJECT_SHAPE);
  return object;
}

function requireLiteral(context, value, path, expected) {
  if (value !== expected)
    addError(context, path, STRUCTURAL_MESSAGES.REQUIRED_LITERAL);
}

function requireSeparatedFoldedIdentities(context, value, path, valueFor) {
  const seen = new Set();
  let prior;
  for (let index = 0; index < value.length; index += 1) {
    const identity = foldAsciiCase(valueFor(value[index]));
    if (identity !== prior && seen.has(identity))
      addError(context, childPath(path, String(index)),
        STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY);
    seen.add(identity);
    prior = identity;
  }
}

function validateRepository(context, value, path) {
  const repository = expectShape(context, value, path, REPOSITORY_KEYS);
  if (repository === null) return;
  expectString(context, repository.nameWithOwner,
    childPath(path, 'nameWithOwner'));
  expectString(context, repository.defaultBranch,
    childPath(path, 'defaultBranch'));
  expectBoolean(context, repository.allowMergeCommit,
    childPath(path, 'allowMergeCommit'));
}

function validateLegacyBranch(context, value, path) {
  const branch = expectShape(context, value, path, LEGACY_BRANCH_KEYS);
  if (branch === null) return;
  expectBoolean(context, branch.exists, childPath(path, 'exists'));
  expectBoolean(context, branch.protected, childPath(path, 'protected'));
}

function validateLegacyProtection(context, value, path) {
  if (value === null) return;
  const legacy = expectShape(context, value, path, LEGACY_KEYS);
  if (legacy === null) return;
  validateLegacyBranch(context, legacy.dev, childPath(path, 'dev'));
  validateLegacyBranch(context, legacy.main, childPath(path, 'main'));
}

function validateInventory(context, value, path) {
  const inventory = expectArray(context, value, path);
  if (inventory === null ||
      !validateCollectionLength(context, inventory, path, INVENTORY_LIMIT))
    return;
  let valid = true;
  for (let index = 0; index < inventory.length; index += 1)
    if (expectString(context, inventory[index],
      childPath(path, String(index))) === null) valid = false;
  if (valid) {
    requireCanonicalStrings(context, inventory, path);
    requireSeparatedFoldedIdentities(
      context, inventory, path, item => item,
    );
  }
}

function validateActions(context, value, path) {
  const actions = expectShape(context, value, path, ACTION_KEYS);
  if (actions === null) return;
  expectEnum(context, actions.defaultWorkflowPermissions,
    childPath(path, 'defaultWorkflowPermissions'), DEFAULT_PERMISSION_VALUES);
  expectBoolean(context, actions.canApprovePullRequestReviews,
    childPath(path, 'canApprovePullRequestReviews'));
  expectBoolean(context, actions.shaPinningRequired,
    childPath(path, 'shaPinningRequired'));
  expectEnum(context, actions.allowedActions, childPath(path, 'allowedActions'),
    ALLOWED_ACTION_VALUES);
}

function validateCollaborators(context, value, path) {
  const collaborators = expectArray(context, value, path);
  if (collaborators === null ||
      !validateCollectionLength(context, collaborators, path,
        COLLABORATOR_LIMIT)) return;
  let valid = true;
  for (let index = 0; index < collaborators.length; index += 1) {
    const itemPath = childPath(path, String(index));
    const collaborator = expectShape(
      context, collaborators[index], itemPath, COLLABORATOR_KEYS,
    );
    if (collaborator === null) {
      valid = false;
      continue;
    }
    if (expectString(context, collaborator.login,
      childPath(itemPath, 'login')) === null) valid = false;
    if (expectInteger(context, collaborator.id, childPath(itemPath, 'id'),
      0, MAXIMUM_ID) === null) valid = false;
    if (expectEnum(context, collaborator.permission,
      childPath(itemPath, 'permission'),
      COLLABORATOR_PERMISSION_VALUES) === null) valid = false;
  }
  if (!valid) return;
  requireCanonicalArray(
    context, collaborators, path,
    collaborator => [collaborator.login, collaborator.id],
    collaborator => [collaborator.login],
  );
  requireSeparatedFoldedIdentities(
    context, collaborators, path, collaborator => collaborator.login,
  );
}

function validateBranches(context, value, path) {
  const branches = expectShape(context, value, path, BRANCH_KEYS);
  if (branches === null) return;
  for (const name of BRANCH_KEYS) {
    const branchPath = childPath(path, name);
    const branch = expectShape(
      context, branches[name], branchPath, BRANCH_RECORD_KEYS,
    );
    if (branch === null) continue;
    if (expectString(context, branch.name,
      childPath(branchPath, 'name')) !== null)
      requireLiteral(context, branch.name, childPath(branchPath, 'name'), name);
  }
}

function validateNormalizedClone(clone, context) {
  const root = expectShape(context, clone, '', ROOT_KEYS);
  if (root === null) return undefined;
  if (expectInteger(context, root.schemaVersion, '/schemaVersion',
    NORMALIZED_STATE_SCHEMA_VERSION,
    NORMALIZED_STATE_SCHEMA_VERSION) !== null)
    requireLiteral(context, root.schemaVersion, '/schemaVersion',
      NORMALIZED_STATE_SCHEMA_VERSION);
  validateRepository(context, root.repository, '/repository');
  validateRulesetsInContext(root.rulesets, context, '/rulesets');
  validateLegacyProtection(
    context, root.legacyBranchProtection, '/legacyBranchProtection',
  );
  validateEnvironmentsInContext(root.environments, context, '/environments');
  validateInventory(context, root.repositorySecretNames,
    '/repositorySecretNames');
  validateInventory(context, root.repositoryVariableNames,
    '/repositoryVariableNames');
  validateActions(context, root.actions, '/actions');
  validateCollaborators(context, root.collaborators, '/collaborators');
  validateBranches(context, root.branches, '/branches');
  validateWorkflowScanInContext(root.workflowScan, context, '/workflowScan');
  return undefined;
}

function validateNormalizedGovernanceState(value) {
  return validateRoot(value, NORMALIZED_OWN_KEY_SLOTS, validateNormalizedClone);
}

for (const implementation of [
  expectShape, requireLiteral, requireSeparatedFoldedIdentities,
  validateRepository, validateLegacyBranch, validateLegacyProtection,
  validateInventory, validateActions, validateCollaborators, validateBranches,
  validateNormalizedClone, validateNormalizedGovernanceState,
]) Object.freeze(implementation);

module.exports = Object.freeze({validateNormalizedGovernanceState});
