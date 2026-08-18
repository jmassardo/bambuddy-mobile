'use strict';

const {
  STRUCTURAL_MESSAGES,
  addError,
  childPath,
  expectArray,
  expectBoolean,
  expectInteger,
  expectObject,
  expectString,
  validateCollectionLength,
} = require('./github-governance-validation-runtime');
const {
  foldAsciiCase,
  requireCanonicalArray,
  requireCanonicalStrings,
} = require('./github-governance-validation-ordering');

const COLLECTION_LIMIT = 100;
const INVENTORY_LIMIT = 1000;
const MAXIMUM_ID = Number.MAX_SAFE_INTEGER;
const ENVIRONMENT_KEYS = Object.freeze(
  'id,name,canAdminsBypass,preventSelfReview,reviewers,deploymentBranchPolicy,branchPolicies,secretNames,variableNames'.split(
    ',',
  ),
);
const REVIEWER_KEYS = Object.freeze(['type', 'login', 'id']);
const DEPLOYMENT_POLICY_KEYS = Object.freeze(
  'protectedBranches,customBranchPolicies'.split(','),
);
const BRANCH_POLICY_KEYS = Object.freeze(['type', 'name']);
function hasExactShape(value, keys) {
  const actual = Object.keys(value);
  if (actual.length !== keys.length) return false;
  for (let index = 0; index < keys.length; index += 1) {
    if (actual[index] !== keys[index]) return false;
  }
  return true;
}
function expectShape(context, value, path, keys) {
  const object = expectObject(context, value, path);
  if (object === null) return null;
  if (hasExactShape(object, keys)) return object;
  addError(context, path, STRUCTURAL_MESSAGES.OBJECT_SHAPE);
  return null;
}
function validString(context, value, path) {
  return expectString(context, value, path) !== null;
}

function requireSeparatedIdentities(context, value, path, keyFor) {
  const seen = new Set();
  const duplicate = STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY;
  let prior;
  for (let index = 0; index < value.length; index += 1) {
    const key = keyFor(value[index]);
    if (key !== prior && seen.has(key))
      addError(context, childPath(path, String(index)), duplicate);
    seen.add(key);
    prior = key;
  }
}

function expectBooleanField(context, value, path, field) {
  expectBoolean(context, value[field], childPath(path, field));
}
function validateStringInventory(context, value, path) {
  const inventory = expectArray(context, value, path);
  if (
    inventory === null ||
    !validateCollectionLength(context, inventory, path, INVENTORY_LIMIT)
  ) {
    return false;
  }
  let valid = true;
  for (let index = 0; index < inventory.length; index += 1) {
    if (!validString(context, inventory[index], childPath(path, String(index))))
      valid = false;
  }
  if (valid) {
    requireCanonicalStrings(context, inventory, path);
    requireSeparatedIdentities(context, inventory, path, foldAsciiCase);
  }
}
function validateReviewers(context, value, path) {
  const reviewers = expectArray(context, value, path);
  if (
    reviewers === null ||
    !validateCollectionLength(context, reviewers, path, COLLECTION_LIMIT)
  ) {
    return false;
  }
  let valid = true;
  for (let index = 0; index < reviewers.length; index += 1) {
    const itemPath = childPath(path, String(index));
    const reviewer = expectShape(
      context,
      reviewers[index],
      itemPath,
      REVIEWER_KEYS,
    );
    if (reviewer === null) {
      valid = false;
      continue;
    }
    if (!validString(context, reviewer.type, childPath(itemPath, 'type')))
      valid = false;
    if (!validString(context, reviewer.login, childPath(itemPath, 'login')))
      valid = false;
    if (
      expectInteger(
        context,
        reviewer.id,
        childPath(itemPath, 'id'),
        0,
        MAXIMUM_ID,
      ) === null
    )
      valid = false;
  }
  if (valid) {
    requireCanonicalArray(
      context,
      reviewers,
      path,
      reviewer => [reviewer.type, reviewer.login, reviewer.id],
      reviewer => [reviewer.login],
    );
    requireSeparatedIdentities(context, reviewers, path, reviewer =>
      foldAsciiCase(reviewer.login),
    );
  }
  return valid;
}

function validateBranchPolicies(context, value, path) {
  const policies = expectArray(context, value, path);
  if (
    policies === null ||
    !validateCollectionLength(context, policies, path, COLLECTION_LIMIT)
  ) {
    return false;
  }
  let valid = true;
  for (let index = 0; index < policies.length; index += 1) {
    const itemPath = childPath(path, String(index));
    const policy = expectShape(
      context,
      policies[index],
      itemPath,
      BRANCH_POLICY_KEYS,
    );
    if (policy === null) {
      valid = false;
      continue;
    }
    if (!validString(context, policy.type, childPath(itemPath, 'type')))
      valid = false;
    if (!validString(context, policy.name, childPath(itemPath, 'name')))
      valid = false;
  }
  if (valid) {
    requireCanonicalArray(
      context,
      policies,
      path,
      policy => [policy.type, policy.name],
      policy => [policy.type, policy.name],
    );
    requireSeparatedIdentities(
      context,
      policies,
      path,
      policy => `${policy.type.length}:${policy.type}${policy.name}`,
    );
  }
  return valid;
}

function validateDeploymentPolicy(context, value, path) {
  const policy = expectShape(context, value, path, DEPLOYMENT_POLICY_KEYS);
  if (policy === null) return;
  expectBooleanField(context, policy, path, 'protectedBranches');
  expectBooleanField(context, policy, path, 'customBranchPolicies');
}

function validateEnvironment(context, environment, path) {
  expectString(context, environment.id, childPath(path, 'id'));
  expectString(context, environment.name, childPath(path, 'name'));
  expectBooleanField(context, environment, path, 'canAdminsBypass');
  expectBooleanField(context, environment, path, 'preventSelfReview');
  validateReviewers(
    context,
    environment.reviewers,
    childPath(path, 'reviewers'),
  );
  validateDeploymentPolicy(
    context,
    environment.deploymentBranchPolicy,
    childPath(path, 'deploymentBranchPolicy'),
  );
  validateBranchPolicies(
    context,
    environment.branchPolicies,
    childPath(path, 'branchPolicies'),
  );
  validateStringInventory(
    context,
    environment.secretNames,
    childPath(path, 'secretNames'),
  );
  validateStringInventory(
    context,
    environment.variableNames,
    childPath(path, 'variableNames'),
  );
}

function validateEnvironmentsInContext(clone, context, path) {
  const environments = expectArray(context, clone, path);
  if (
    environments === null ||
    !validateCollectionLength(context, environments, path, COLLECTION_LIMIT)
  )
    return undefined;
  let valid = true;
  for (let index = 0; index < environments.length; index += 1) {
    const itemPath = childPath(path, String(index));
    const environment = expectShape(
      context,
      environments[index],
      itemPath,
      ENVIRONMENT_KEYS,
    );
    if (environment === null) {
      valid = false;
      continue;
    }
    if (
      typeof environment.name !== 'string' ||
      typeof environment.id !== 'string'
    )
      valid = false;
    validateEnvironment(context, environment, itemPath);
  }
  if (valid) {
    requireCanonicalArray(
      context,
      environments,
      path,
      environment => [environment.name, environment.id],
      environment => [environment.name],
    );
    requireSeparatedIdentities(context, environments, path, environment =>
      foldAsciiCase(environment.name),
    );
  }
  return undefined;
}

Object.freeze(validateEnvironmentsInContext);

module.exports = Object.freeze({ validateEnvironmentsInContext });
