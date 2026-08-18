'use strict';

const {GOVERNANCE_CONTRACT} = require('./github-governance-contract');
const {
  STRUCTURAL_MESSAGES,
  addError,
  childPath,
  expectArray,
  expectBoolean,
  expectEnum,
  expectInteger,
  expectNullable,
  expectObject,
  expectString,
  validateCollectionLength,
} = require('./github-governance-validation-runtime');
const {
  comparePrimitive,
  requireCanonicalArray,
} = require('./github-governance-validation-ordering');

const MAX_COLLECTION = 100;
const MAX_REFS = 1000;
const MAX_INTEGER = Number.MAX_SAFE_INTEGER;
const RULESET_KEYS = Object.freeze([
  'id', 'name', 'enforcement', 'target', 'conditions', 'bypassActors', 'rules',
]);
const CONDITIONS_KEYS = Object.freeze(['refName']);
const REF_NAME_KEYS = Object.freeze(['include', 'exclude']);
const ACTOR_KEYS = Object.freeze(['actor_id', 'actor_type', 'bypass_mode']);
const RULE_KEYS = Object.freeze(['type', 'parameters']);
const PULL_REQUEST_KEYS = Object.freeze([
  'required_approving_review_count',
  'dismiss_stale_reviews_on_push',
  'require_last_push_approval',
  'required_review_thread_resolution',
  'require_code_owner_review',
]);
const STATUS_CHECK_KEYS = Object.freeze([
  'required_status_checks', 'strict_required_status_checks_policy',
]);
const CHECK_KEYS = Object.freeze(['context', 'integration_id']);
const ENFORCEMENT_VALUES = Object.freeze(['active', 'evaluate', 'disabled']);
const KNOWN_RULE_TYPES = Object.freeze(
  GOVERNANCE_CONTRACT.rulesets['protect-dev'].rules.map(rule => rule.type),
);

function hasShape(context, value, path, expectedKeys) {
  const keys = Reflect.ownKeys(value);
  if (keys.length === expectedKeys.length &&
      keys.every((key, index) => key === expectedKeys[index])) return true;
  addError(context, path, STRUCTURAL_MESSAGES.OBJECT_SHAPE);
  return false;
}

function requireLiteral(context, value, path, literal) {
  if (value === literal) return true;
  addError(context, path, STRUCTURAL_MESSAGES.REQUIRED_LITERAL);
  return false;
}

function expectNullableInteger(context, value, path) {
  return expectNullable(context, value, path, expectNonnegativeInteger);
}

function expectNonnegativeInteger(context, value, path) {
  return expectInteger(context, value, path, 0, MAX_INTEGER);
}

function validateExactStrings(context, value, path, maximum) {
  const array = expectArray(context, value, path);
  if (array === null || !validateCollectionLength(context, array, path, maximum))
    return false;
  let canonical = true;
  for (let index = 0; index < array.length; index += 1) {
    const itemPath = childPath(path, String(index));
    if (expectString(context, array[index], itemPath) === null)
      canonical = false;
  }
  if (canonical) {
    for (let index = 1; index < array.length; index += 1) {
      const itemPath = childPath(path, String(index));
      if (comparePrimitive(array[index - 1], array[index]) > 0)
        addError(context, itemPath, STRUCTURAL_MESSAGES.CANONICAL_ORDER);
      if (array[index - 1] === array[index])
        addError(context, itemPath, STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY);
    }
  }
  return canonical;
}

function validateBypassActors(context, value, path) {
  const actors = expectArray(context, value, path);
  if (actors === null ||
      !validateCollectionLength(context, actors, path, MAX_COLLECTION))
    return false;
  let canonical = true;
  for (let index = 0; index < actors.length; index += 1) {
    const actorPath = childPath(path, String(index));
    const actor = expectObject(context, actors[index], actorPath);
    if (actor === null) {
      canonical = false;
      continue;
    }
    hasShape(context, actor, actorPath, ACTOR_KEYS);
    const id = expectNullableInteger(
      context, actor.actor_id, childPath(actorPath, 'actor_id'),
    );
    const type = expectString(
      context, actor.actor_type, childPath(actorPath, 'actor_type'),
    );
    const mode = expectString(
      context, actor.bypass_mode, childPath(actorPath, 'bypass_mode'),
    );
    if (id === null && actor.actor_id !== null || type === null || mode === null)
      canonical = false;
  }
  if (canonical) requireExactCanonical(
    context, actors, path,
    actor => [actor.actor_type, actor.actor_id, actor.bypass_mode],
    actor => [
      actor.actor_type,
      actor.actor_id === null ? 0 : actor.actor_id,
      actor.bypass_mode,
    ],
  );
  return canonical;
}

function validateRequiredChecks(context, value, path) {
  const checks = expectArray(context, value, path);
  if (checks === null ||
      !validateCollectionLength(context, checks, path, MAX_COLLECTION))
    return false;
  let canonical = true;
  for (let index = 0; index < checks.length; index += 1) {
    const checkPath = childPath(path, String(index));
    const check = expectObject(context, checks[index], checkPath);
    if (check === null) {
      canonical = false;
      continue;
    }
    hasShape(context, check, checkPath, CHECK_KEYS);
    const name = expectString(
      context, check.context, childPath(checkPath, 'context'),
    );
    const integration = expectNullableInteger(
      context, check.integration_id, childPath(checkPath, 'integration_id'),
    );
    if (name === null ||
        integration === null && check.integration_id !== null) canonical = false;
  }
  if (canonical) requireCanonicalArray(
    context, checks, path,
    check => [check.context, check.integration_id],
    check => [check.context],
  );
  return canonical;
}

function validatePullRequest(context, value, path) {
  const parameters = expectObject(context, value, path);
  if (parameters === null) return;
  hasShape(context, parameters, path, PULL_REQUEST_KEYS);
  expectInteger(context, parameters.required_approving_review_count,
    childPath(path, 'required_approving_review_count'), 0, 6);
  for (const key of PULL_REQUEST_KEYS.slice(1))
    expectBoolean(context, parameters[key], childPath(path, key));
}

function validateStatusChecks(context, value, path) {
  const parameters = expectObject(context, value, path);
  if (parameters === null) return;
  hasShape(context, parameters, path, STATUS_CHECK_KEYS);
  validateRequiredChecks(context, parameters.required_status_checks,
    childPath(path, 'required_status_checks'));
  expectBoolean(context, parameters.strict_required_status_checks_policy,
    childPath(path, 'strict_required_status_checks_policy'));
}

function validateRuleParameters(context, rule, rulePath) {
  const parametersPath = childPath(rulePath, 'parameters');
  switch (rule.type) {
    case 'pull_request':
      validatePullRequest(context, rule.parameters, parametersPath);
      break;
    case 'required_status_checks':
      validateStatusChecks(context, rule.parameters, parametersPath);
      break;
    default:
      requireLiteral(context, rule.parameters, parametersPath, null);
  }
}

function ruleTuple(rule) {
  const index = KNOWN_RULE_TYPES.indexOf(rule.type);
  return index === -1 ? [KNOWN_RULE_TYPES.length, rule.type] : [index, ''];
}

function validateRules(context, value, path) {
  const rules = expectArray(context, value, path);
  if (rules === null ||
      !validateCollectionLength(context, rules, path, MAX_COLLECTION))
    return false;
  let canonical = true;
  for (let index = 0; index < rules.length; index += 1) {
    const rulePath = childPath(path, String(index));
    const rule = expectObject(context, rules[index], rulePath);
    if (rule === null) {
      canonical = false;
      continue;
    }
    hasShape(context, rule, rulePath, RULE_KEYS);
    if (expectString(context, rule.type, childPath(rulePath, 'type')) === null) {
      canonical = false;
      continue;
    }
    validateRuleParameters(context, rule, rulePath);
  }
  if (canonical) requireExactCanonical(context, rules, path, ruleTuple,
    rule => [rule.type]);
  return canonical;
}

function requireExactCanonical(context, values, path, tupleFor,
  identityFor = tupleFor) {
  for (let index = 1; index < values.length; index += 1) {
    const itemPath = childPath(path, String(index));
    const priorTuple = tupleFor(values[index - 1]);
    const tuple = tupleFor(values[index]);
    let comparison = 0;
    for (let field = 0; field < priorTuple.length && comparison === 0; field += 1)
      comparison = comparePrimitive(priorTuple[field], tuple[field]);
    if (comparison > 0)
      addError(context, itemPath, STRUCTURAL_MESSAGES.CANONICAL_ORDER);
    const priorIdentity = identityFor(values[index - 1]);
    const identity = identityFor(values[index]);
    if (priorIdentity.length === identity.length &&
        priorIdentity.every((item, field) => item === identity[field]))
      addError(context, itemPath, STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY);
  }
}

function validateRuleset(context, ruleset, path) {
  const record = expectObject(context, ruleset, path);
  if (record === null) return false;
  hasShape(context, record, path, RULESET_KEYS);
  const id = expectString(context, record.id, childPath(path, 'id'));
  const name = expectString(context, record.name, childPath(path, 'name'));
  expectEnum(context, record.enforcement, childPath(path, 'enforcement'),
    ENFORCEMENT_VALUES);
  requireLiteral(context, record.target, childPath(path, 'target'), 'branch');
  const conditionsPath = childPath(path, 'conditions');
  const conditions = expectObject(context, record.conditions, conditionsPath);
  if (conditions !== null) {
    hasShape(context, conditions, conditionsPath, CONDITIONS_KEYS);
    const refPath = childPath(conditionsPath, 'refName');
    const refName = expectObject(context, conditions.refName, refPath);
    if (refName !== null) {
      hasShape(context, refName, refPath, REF_NAME_KEYS);
      validateExactStrings(context, refName.include,
        childPath(refPath, 'include'), MAX_REFS);
      validateExactStrings(context, refName.exclude,
        childPath(refPath, 'exclude'), MAX_REFS);
    }
  }
  validateBypassActors(context, record.bypassActors,
    childPath(path, 'bypassActors'));
  validateRules(context, record.rules, childPath(path, 'rules'));
  return id !== null && name !== null;
}

function validateRulesetsInContext(clone, context, path) {
  const rulesets = expectArray(context, clone, path);
  if (rulesets === null ||
      !validateCollectionLength(context, rulesets, path, MAX_COLLECTION))
    return undefined;
  let canonical = true;
  for (let index = 0; index < rulesets.length; index += 1)
    if (!validateRuleset(context, rulesets[index],
      childPath(path, String(index)))) canonical = false;
  if (canonical) requireCanonicalArray(
    context, rulesets, path,
    ruleset => [ruleset.name, ruleset.id],
    ruleset => [ruleset.name],
  );
  return undefined;
}

Object.freeze(validateRulesetsInContext);
module.exports = Object.freeze({validateRulesetsInContext});
