'use strict';

const {selectRootPolicy} = require('./github-governance-validation-runtime-policy');
const {walkBoundedData} = require('./github-governance-validation-walk');

const STRUCTURAL_MESSAGES = Object.freeze({
  REFLECTION_FAILURE: 'Input could not be inspected safely.',
  BUDGET_EXCEEDED: 'Validation budget exceeded.',
  ACCESSOR_PROPERTY: 'Accessor properties are forbidden.',
  SYMBOL_KEY: 'Symbol keys are forbidden.',
  WRONG_PRIMITIVE_TYPE: 'Value has the wrong primitive type.',
  UNSAFE_KEY: 'Unsafe key is forbidden.',
  PLAIN_OBJECT: 'Expected a plain data object.',
  DENSE_ARRAY: 'Expected a dense array.',
  REPEATED_REFERENCE: 'Repeated or cyclic references are forbidden.',
  EXPECTED_ARRAY: 'Expected an array.',
  EXPECTED_BOOLEAN: 'Expected a boolean.',
  EXPECTED_ENUM: 'Expected an allowed value.',
  EXPECTED_INTEGER: 'Expected an integer in the allowed range.',
  EXPECTED_OBJECT: 'Expected a plain data object.',
  EXPECTED_STRING: 'Expected a string.',
  COLLECTION_LENGTH: 'Collection length exceeds its limit.',
  OBJECT_SHAPE: 'Object keys do not match the required shape and insertion order.',
  REQUIRED_LITERAL: 'Value does not match the required literal.',
  CANONICAL_ORDER: 'Collection is not in canonical order.',
  DUPLICATE_IDENTITY: 'Collection contains a duplicate identity.',
  REPOSITORY_PATH: 'Repository path format is invalid.',
});
const HELPER_ERROR = 'Validation helper arguments are invalid.';
const ERROR_CODE = 'SCHEMA_INVALID';
const MAX_ERRORS = 100;
const MAX_REPOSITORY_PATHS = 15000;
const privateStates = new WeakMap();
const messageValues = Object.freeze(Object.values(STRUCTURAL_MESSAGES));
const diagnosticMessages = Object.freeze({
  ACCESSOR_GETTER: STRUCTURAL_MESSAGES.ACCESSOR_PROPERTY,
  ACCESSOR_SETTER: STRUCTURAL_MESSAGES.ACCESSOR_PROPERTY,
  ACCESSOR_GETTER_SETTER: STRUCTURAL_MESSAGES.ACCESSOR_PROPERTY,
  SYMBOL_KEY: STRUCTURAL_MESSAGES.SYMBOL_KEY,
  SYMBOL_VALUE: STRUCTURAL_MESSAGES.WRONG_PRIMITIVE_TYPE,
  UNSUPPORTED_FUNCTION: STRUCTURAL_MESSAGES.WRONG_PRIMITIVE_TYPE,
  UNSAFE_KEY: STRUCTURAL_MESSAGES.UNSAFE_KEY,
  NONPLAIN_PROTOTYPE: STRUCTURAL_MESSAGES.PLAIN_OBJECT,
  SPARSE_ARRAY: STRUCTURAL_MESSAGES.DENSE_ARRAY,
  ARRAY_NON_INDEX_KEY: STRUCTURAL_MESSAGES.DENSE_ARRAY,
  CIRCULAR_REFERENCE: STRUCTURAL_MESSAGES.REPEATED_REFERENCE,
  REPEATED_REFERENCE: STRUCTURAL_MESSAGES.REPEATED_REFERENCE,
});

function invalidArguments() {
  throw new TypeError(HELPER_ERROR);
}
function isCanonicalPath(value) {
  return typeof value === 'string' &&
    (value === '' || /^(?:\/(?:[^~]|~[01])*)+$/.test(value));
}
function requireState(context, path) {
  const state = privateStates.get(context);
  if (!state || !isCanonicalPath(path)) invalidArguments();
  return state;
}
function singleton(message) {
  const error = Object.freeze({code: ERROR_CODE, path: '', message});
  return Object.freeze({ok: false, errors: Object.freeze([error])});
}
function addInternal(state, path, message) {
  if (state.fatal !== null) return false;
  const ordinal = state.nextOrdinal;
  state.nextOrdinal += 1;
  if (ordinal >= MAX_ERRORS) {
    state.fatal = 'budget';
    return false;
  }
  state.errors.push({code: ERROR_CODE, path, message, ordinal});
  return true;
}
function addError(context, path, message) {
  const state = requireState(context, path);
  if (messageValues.indexOf(message) === -1) invalidArguments();
  return addInternal(state, path, message);
}
function childPath(parentPath, segment) {
  if (!isCanonicalPath(parentPath) || typeof segment !== 'string')
    invalidArguments();
  return `${parentPath}/${segment.replace(/~/g, '~0').replace(/\//g, '~1')}`;
}
function expectArray(context, value, path) {
  requireState(context, path);
  if (Array.isArray(value)) return value;
  addError(context, path, STRUCTURAL_MESSAGES.EXPECTED_ARRAY);
  return null;
}
function expectBoolean(context, value, path) {
  requireState(context, path);
  if (typeof value === 'boolean') return value;
  addError(context, path, STRUCTURAL_MESSAGES.EXPECTED_BOOLEAN);
  return null;
}
function expectEnum(context, value, path, allowedValues) {
  requireState(context, path);
  if (!Array.isArray(allowedValues) || !Object.isFrozen(allowedValues))
    invalidArguments();
  for (let index = 0; index < allowedValues.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(allowedValues, index))
      invalidArguments();
    const allowed = allowedValues[index];
    if (allowed !== null && typeof allowed !== 'string' &&
        typeof allowed !== 'number' && typeof allowed !== 'boolean')
      invalidArguments();
    for (let prior = 0; prior < index; prior += 1)
      if (allowedValues[prior] === allowed) invalidArguments();
  }
  for (const allowed of allowedValues) if (value === allowed) return value;
  addError(context, path, STRUCTURAL_MESSAGES.EXPECTED_ENUM);
  return null;
}
function expectInteger(context, value, path, minimum, maximum) {
  requireState(context, path);
  if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) ||
      minimum > maximum) invalidArguments();
  if (Number.isSafeInteger(value) && value >= minimum && value <= maximum)
    return value;
  addError(context, path, STRUCTURAL_MESSAGES.EXPECTED_INTEGER);
  return null;
}
function expectNullable(context, value, path, expectPresent) {
  requireState(context, path);
  if (typeof expectPresent !== 'function' || expectPresent.length !== 3)
    invalidArguments();
  return value === null ? null : expectPresent(context, value, path);
}
function expectObject(context, value, path) {
  requireState(context, path);
  if (value !== null && typeof value === 'object' && !Array.isArray(value))
    return value;
  addError(context, path, STRUCTURAL_MESSAGES.EXPECTED_OBJECT);
  return null;
}
function expectString(context, value, path) {
  requireState(context, path);
  if (typeof value === 'string') return value;
  addError(context, path, STRUCTURAL_MESSAGES.EXPECTED_STRING);
  return null;
}
function validateCollectionLength(context, value, path, maximum) {
  const state = requireState(context, path);
  if (!Array.isArray(value) || !Number.isSafeInteger(maximum) || maximum < 0)
    invalidArguments();
  if (value.length <= maximum) return true;
  addInternal(state, path, STRUCTURAL_MESSAGES.COLLECTION_LENGTH);
  state.fatal = 'budget';
  return false;
}
function wellFormedUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}
function validRepositoryPath(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 240 ||
      value[0] === '/' || value[value.length - 1] === '/' ||
      value.indexOf('//') !== -1 || value.indexOf('\\') !== -1 ||
      !wellFormedUnicode(value)) return false;
  const components = value.split('/');
  if (components.length > 120) return false;
  for (const component of components) {
    if (component === '.' || component === '..' || /[ .]$/.test(component) ||
        /[\x00-\x1f\x7f:*?"<>|]/.test(component)) return false;
    const stem = component.split('.')[0].toUpperCase();
    if (/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem)) return false;
  }
  return true;
}
function validateRepositoryPath(context, value, path) {
  const state = requireState(context, path);
  state.repositoryPathOccurrences += 1;
  if (state.repositoryPathOccurrences > MAX_REPOSITORY_PATHS) {
    state.fatal = 'budget';
    return false;
  }
  if (validRepositoryPath(value)) return true;
  addInternal(state, path, STRUCTURAL_MESSAGES.REPOSITORY_PATH);
  return false;
}
function compareErrors(left, right) {
  for (const key of ['path', 'message', 'code']) {
    if (left[key] < right[key]) return -1;
    if (left[key] > right[key]) return 1;
  }
  return left.ordinal < right.ordinal ? -1 :
    left.ordinal > right.ordinal ? 1 : 0;
}
function ordinaryFailure(errors) {
  const projected = errors.slice().sort(compareErrors).map(error =>
    Object.freeze({
      code: error.code, path: error.path, message: error.message,
    }));
  return Object.freeze({ok: false, errors: Object.freeze(projected)});
}
function denseDiagnostics(value) {
  if (!Array.isArray(value) || !Number.isSafeInteger(value.length) ||
      value.length > MAX_ERRORS) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || keys[keys.length - 1] !== 'length')
    return false;
  for (let index = 0; index < value.length; index += 1)
    if (keys[index] !== String(index)) return false;
  return true;
}
function diagnosticValues(value) {
  if (value === null || typeof value !== 'object') return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 2 || keys[0] !== 'code' || keys[1] !== 'path') return null;
  const code = value.code;
  const path = value.path;
  const message = diagnosticMessages[code];
  return typeof code === 'string' &&
    Object.prototype.hasOwnProperty.call(diagnosticMessages, code) &&
    isCanonicalPath(path) ? {path, message} : null;
}
function validCounter(value, maximum) {
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}
function validateRoot(value, ownKeySlotBudget, validateClone) {
  let policy;
  try {
    policy = selectRootPolicy(ownKeySlotBudget);
  } catch {
    return singleton(STRUCTURAL_MESSAGES.BUDGET_EXCEEDED);
  }
  if (policy === null || typeof validateClone !== 'function')
    return singleton(STRUCTURAL_MESSAGES.BUDGET_EXCEEDED);
  let walkResult;
  try {
    walkResult = walkBoundedData(value, policy.limits);
  } catch {
    return singleton(STRUCTURAL_MESSAGES.BUDGET_EXCEEDED);
  }
  if (walkResult && walkResult.status === 'inspection-fatal')
    return singleton(STRUCTURAL_MESSAGES.REFLECTION_FAILURE);
  if (!walkResult || walkResult.status !== 'ok')
    return singleton(STRUCTURAL_MESSAGES.BUDGET_EXCEEDED);
  try {
    const clone = walkResult.value;
    const counters = walkResult.counters;
    const diagnostics = walkResult.diagnostics;
    const entries = counters.entries;
    const stringCodeUnits = counters.stringCodeUnits;
    const maxContainerDepth = counters.maxContainerDepth;
    const diagnosticCount = counters.diagnostics;
    const ownKeySlots = entries - 1;
    const limits = policy.limits;
    if (!Number.isSafeInteger(entries) || entries < 1 ||
        !Number.isSafeInteger(ownKeySlots) || ownKeySlots < 0 ||
        policy.ownKeySlotBudget !== ownKeySlotBudget ||
        ownKeySlots > policy.ownKeySlotBudget ||
        limits.maxEntries !== policy.ownKeySlotBudget + 1 ||
        entries > limits.maxEntries ||
        !validCounter(stringCodeUnits, limits.maxStringCodeUnits) ||
        !validCounter(maxContainerDepth, limits.maxDepth) ||
        limits.maxDiagnostics !== MAX_ERRORS ||
        !denseDiagnostics(diagnostics) ||
        !validCounter(diagnosticCount, limits.maxDiagnostics) ||
        diagnosticCount !== diagnostics.length)
      return singleton(STRUCTURAL_MESSAGES.BUDGET_EXCEEDED);
    const context = Object.freeze({
      ownKeySlots, visitedValues: entries, stringCodeUnits,
      maxContainerDepth, diagnosticCount,
    });
    const state = {
      errors: [], nextOrdinal: 0, repositoryPathOccurrences: 0, fatal: null,
    };
    privateStates.set(context, state);
    for (const diagnostic of diagnostics) {
      const mapped = diagnosticValues(diagnostic);
      if (mapped === null) return singleton(STRUCTURAL_MESSAGES.BUDGET_EXCEEDED);
      addInternal(state, mapped.path, mapped.message);
    }
    if (maxContainerDepth > 8)
      return singleton(STRUCTURAL_MESSAGES.BUDGET_EXCEEDED);
    const callbackResult = validateClone.call(undefined, clone, context);
    if (callbackResult !== undefined)
      return singleton(STRUCTURAL_MESSAGES.BUDGET_EXCEEDED);
    if (state.fatal !== null)
      return singleton(STRUCTURAL_MESSAGES.BUDGET_EXCEEDED);
    return state.errors.length === 0 ? Object.freeze({ok: true, value: clone}) :
      ordinaryFailure(state.errors);
  } catch {
    return singleton(STRUCTURAL_MESSAGES.BUDGET_EXCEEDED);
  }
}

for (const exportedFunction of [
  validateRoot, addError, childPath, expectArray, expectBoolean, expectEnum,
  expectInteger, expectNullable, expectObject, expectString,
  validateCollectionLength, validateRepositoryPath,
]) Object.freeze(exportedFunction);

module.exports = Object.freeze({
  STRUCTURAL_MESSAGES,
  validateRoot,
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
  validateRepositoryPath,
});
