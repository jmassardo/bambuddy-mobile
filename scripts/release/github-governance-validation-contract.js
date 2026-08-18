'use strict';

const {GOVERNANCE_CONTRACT} = require('./github-governance-contract');
const {
  STRUCTURAL_MESSAGES,
  addError,
  childPath,
  expectArray,
  expectBoolean,
  expectInteger,
  expectObject,
  expectString,
  validateRoot,
} = require('./github-governance-validation-runtime');
const {
  comparePrimitive,
} = require('./github-governance-validation-ordering');

function addLiteralError(context, path) {
  addError(context, path, STRUCTURAL_MESSAGES.REQUIRED_LITERAL);
}

function hasExactKeys(value, expected) {
  const actualKeys = Object.keys(value);
  const expectedKeys = Object.keys(expected);
  if (actualKeys.length !== expectedKeys.length) return false;
  for (let index = 0; index < expectedKeys.length; index += 1) {
    if (actualKeys[index] !== expectedKeys[index]) return false;
  }
  return true;
}

function validateArray(context, value, expected, path) {
  const array = expectArray(context, value, path);
  if (array === null) return;
  if (array.length !== expected.length) {
    addLiteralError(context, path);
    return;
  }
  for (let index = 0; index < expected.length; index += 1) {
    validateExactValue(
      context,
      array[index],
      expected[index],
      childPath(path, String(index)),
    );
  }
}

function validateObject(context, value, expected, path) {
  const object = expectObject(context, value, path);
  if (object === null) return;
  if (!hasExactKeys(object, expected)) {
    addError(context, path, STRUCTURAL_MESSAGES.OBJECT_SHAPE);
    return;
  }
  for (const key of Object.keys(expected)) {
    validateExactValue(
      context,
      object[key],
      expected[key],
      childPath(path, key),
    );
  }
}

function validateExactValue(context, value, expected, path) {
  if (Array.isArray(expected)) {
    validateArray(context, value, expected, path);
    return;
  }
  if (expected !== null && typeof expected === 'object') {
    validateObject(context, value, expected, path);
    return;
  }
  if (typeof expected === 'string') {
    const string = expectString(context, value, path);
    if (string !== null && comparePrimitive(string, expected) !== 0)
      addLiteralError(context, path);
    return;
  }
  if (typeof expected === 'boolean') {
    const boolean = expectBoolean(context, value, path);
    if (boolean !== null && boolean !== expected) addLiteralError(context, path);
    return;
  }
  if (typeof expected === 'number') {
    const integer = expectInteger(
      context,
      value,
      path,
      Number.MIN_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER,
    );
    if (integer !== null && comparePrimitive(integer, expected) !== 0)
      addLiteralError(context, path);
    return;
  }
  if (value !== null) addLiteralError(context, path);
}

function validateGovernanceContract(value) {
  return validateRoot(value, 311, (clone, context) => {
    validateExactValue(context, clone, GOVERNANCE_CONTRACT, '');
    return undefined;
  });
}

for (const implementation of [
  addLiteralError,
  hasExactKeys,
  validateArray,
  validateObject,
  validateExactValue,
  validateGovernanceContract,
]) Object.freeze(implementation);

module.exports = Object.freeze({validateGovernanceContract});
