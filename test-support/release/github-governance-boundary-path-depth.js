'use strict';

const INVALID_OPTION_MESSAGE = 'Unsupported governance fixture option.';
const CANONICAL_PATH = 'fixture/path';
const COMPONENT = 'x';
const PATH_SEPARATOR = '/';
const UTF16_AXIS = 'utf16';
const COMPONENTS_AXIS = 'components';

function validateG5Axis(axis, argumentCount) {
  if (
    argumentCount !== 1 ||
    (axis !== UTF16_AXIS && axis !== COMPONENTS_AXIS)
  ) {
    throw new TypeError(INVALID_OPTION_MESSAGE);
  }
}

function createComponentPath(componentCount) {
  let path = COMPONENT;

  for (let component = 1; component < componentCount; component += 1) {
    path += PATH_SEPARATOR + COMPONENT;
  }

  return path;
}

function createG5Result(axis, path) {
  return {
    group: 'G5',
    axis,
    path,
    utf16Units: path.length,
    components: path.split(PATH_SEPARATOR).length,
  };
}

function createG6Result(declaredDepth) {
  const root = Object.create(null);
  let current = root;

  for (let container = 1; container < declaredDepth; container += 1) {
    const next = Object.create(null);
    Object.defineProperty(current, 'next', {
      value: next,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    current = next;
  }

  Object.defineProperty(current, 'value', {
    value: null,
    enumerable: true,
    writable: true,
    configurable: true,
  });

  return {group: 'G6', declaredDepth, root};
}

const G5 = Object.freeze({
  canonical: Object.freeze(function canonical(axis) {
    validateG5Axis(axis, arguments.length);
    return createG5Result(axis, CANONICAL_PATH);
  }),
  max: Object.freeze(function max(axis) {
    validateG5Axis(axis, arguments.length);
    const path =
      axis === UTF16_AXIS
        ? COMPONENT.repeat(240)
        : createComponentPath(120);
    return createG5Result(axis, path);
  }),
  maxPlusOne: Object.freeze(function maxPlusOne(axis) {
    validateG5Axis(axis, arguments.length);
    const path =
      axis === UTF16_AXIS
        ? COMPONENT.repeat(241)
        : createComponentPath(121);
    return createG5Result(axis, path);
  }),
});

const G6 = Object.freeze({
  canonical: Object.freeze(function canonical() {
    return createG6Result(1);
  }),
  max: Object.freeze(function max() {
    return createG6Result(32);
  }),
  maxPlusOne: Object.freeze(function maxPlusOne() {
    return createG6Result(33);
  }),
});

module.exports = Object.freeze({G5, G6});
