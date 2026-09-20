'use strict';

const {STRUCTURAL_MESSAGES, addError, childPath} =
  require('./github-governance-validation-runtime');

const HELPER_ERROR = 'Ordering helper arguments are invalid.';

function invalidArguments() {
  throw new TypeError(HELPER_ERROR);
}

function numericValue(value) {
  if (value === null) return 0;
  if (typeof value !== 'number' || Number.isNaN(value)) invalidArguments();
  return value;
}

function comparePrimitive(left, right) {
  if (typeof left === 'string' || typeof right === 'string') {
    if (typeof left !== 'string' || typeof right !== 'string') invalidArguments();
    return left < right ? -1 : left > right ? 1 : 0;
  }
  const leftNumber = numericValue(left);
  const rightNumber = numericValue(right);
  return leftNumber < rightNumber ? -1 : leftNumber > rightNumber ? 1 : 0;
}

function compareTuples(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length)
    invalidArguments();
  for (let index = 0; index < left.length; index += 1) {
    const result = comparePrimitive(left[index], right[index]);
    if (result !== 0) return result;
  }
  return 0;
}

function foldAsciiCase(value) {
  if (typeof value !== 'string') invalidArguments();
  let result = '';
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    result += unit >= 0x41 && unit <= 0x5a ?
      String.fromCharCode(unit + 0x20) : value[index];
  }
  return result;
}

function identityTuple(value) {
  if (!Array.isArray(value)) invalidArguments();
  const result = new Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    if (typeof current === 'string') result[index] = foldAsciiCase(current);
    else {
      numericValue(current);
      result[index] = current;
    }
  }
  return result;
}

function requireCanonicalArray(context, value, path, tupleFor, identityFor) {
  if (!Array.isArray(value) || typeof tupleFor !== 'function' ||
      typeof identityFor !== 'function') invalidArguments();
  for (let index = 1; index < value.length; index += 1) {
    const prior = value[index - 1];
    const current = value[index];
    if (compareTuples(tupleFor(prior), tupleFor(current)) > 0)
      addError(context, childPath(path, String(index)),
        STRUCTURAL_MESSAGES.CANONICAL_ORDER);
    if (compareTuples(identityTuple(identityFor(prior)),
      identityTuple(identityFor(current))) === 0)
      addError(context, childPath(path, String(index)),
        STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY);
  }
}

function requireCanonicalStrings(context, value, path) {
  if (!Array.isArray(value)) invalidArguments();
  for (let index = 1; index < value.length; index += 1) {
    const prior = value[index - 1];
    const current = value[index];
    if (comparePrimitive(prior, current) > 0)
      addError(context, childPath(path, String(index)),
        STRUCTURAL_MESSAGES.CANONICAL_ORDER);
    if (comparePrimitive(foldAsciiCase(prior), foldAsciiCase(current)) === 0)
      addError(context, childPath(path, String(index)),
        STRUCTURAL_MESSAGES.DUPLICATE_IDENTITY);
  }
}

for (const helper of [
  comparePrimitive, compareTuples, foldAsciiCase, identityTuple,
  requireCanonicalArray, requireCanonicalStrings,
]) Object.freeze(helper);

module.exports = Object.freeze({
  comparePrimitive,
  compareTuples,
  foldAsciiCase,
  identityTuple,
  requireCanonicalArray,
  requireCanonicalStrings,
});
