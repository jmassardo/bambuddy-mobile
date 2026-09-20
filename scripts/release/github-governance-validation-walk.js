'use strict';
const hasOwn = Object.prototype.hasOwnProperty;
const LIMIT_KEYS = Object.freeze([
  'maxDepth', 'maxEntries', 'maxStringCodeUnits', 'maxOwnKeysCalls', 'maxDescriptorCalls',
  'maxPrototypeCalls', 'maxDiagnostics', 'declaredPaths', 'collectionLimits',
]);
const UNSAFE_KEYS = Object.freeze(['__proto__', 'prototype', 'constructor']);
const ERRORS = Object.freeze({
  configuration: ['WALK_CONFIGURATION_INVALID', 'Walker limits are invalid.'],
  inspection: ['WALK_INSPECTION_FAILED', 'Data inspection failed.'],
  budget: ['WALK_BUDGET_EXCEEDED', 'Data inspection budget exceeded.'],
});
const FATAL = Object.freeze({configuration: Object.freeze({kind: 'configuration'}),
  inspection: Object.freeze({kind: 'inspection'}),
  budget: Object.freeze({kind: 'budget'})});
function zeroCounters() {
  return {
    entries: 0, stringCodeUnits: 0, ownKeysCalls: 0, descriptorCalls: 0,
    prototypeCalls: 0, maxContainerDepth: 0, diagnostics: 0,
  };
}
function fatalResult(kind, counters) {
  const [code, message] = ERRORS[kind];
  return {
    status: `${kind}-fatal`, value: null, counters, diagnostics: [],
    error: {code, message},
  };
}
function inspectOperation(operation, target, key) {
  try {
    return key === undefined ? operation(target) : operation(target, key);
  } catch {
    throw FATAL.configuration;
  }
}
function inspectedRecord(input, expectedKeys, prototype) {
  if (input === null || typeof input !== 'object') throw FATAL.configuration;
  const actualPrototype = inspectOperation(Reflect.getPrototypeOf, input);
  const keys = inspectOperation(Reflect.ownKeys, input);
  if ((actualPrototype !== prototype && actualPrototype !== null) ||
      keys.length !== expectedKeys.length) throw FATAL.configuration;
  const values = Object.create(null);
  for (const key of keys) {
    if (typeof key !== 'string' || UNSAFE_KEYS.indexOf(key) !== -1 ||
        expectedKeys.indexOf(key) === -1 || hasOwn.call(values, key)) {
      throw FATAL.configuration;
    }
    const descriptor = inspectOperation(
      Reflect.getOwnPropertyDescriptor, input, key);
    if (!descriptor || !hasOwn.call(descriptor, 'value')) {
      throw FATAL.configuration;
    }
    values[key] = descriptor.value;
  }
  return values;
}
function inspectedDenseArray(input) {
  const array = inspectOperation(Array.isArray, input);
  const prototype = inspectOperation(Reflect.getPrototypeOf, input);
  if (!array || (prototype !== Array.prototype && prototype !== null))
    throw FATAL.configuration;
  const keys = inspectOperation(Reflect.ownKeys, input);
  const lengthDescriptor = inspectOperation(
    Reflect.getOwnPropertyDescriptor, input, 'length');
  if (
    !lengthDescriptor || !hasOwn.call(lengthDescriptor, 'value') ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0 || keys.length !== lengthDescriptor.value + 1
  ) throw FATAL.configuration;
  const values = new Array(lengthDescriptor.value);
  let lengthKeys = 0;
  for (const key of keys) {
    if (key === 'length') {
      lengthKeys += 1;
      continue;
    }
    if (!canonicalIndex(key) || Number(key) >= values.length)
      throw FATAL.configuration;
    const descriptor = inspectOperation(
      Reflect.getOwnPropertyDescriptor, input, key);
    if (!descriptor || !hasOwn.call(descriptor, 'value'))
      throw FATAL.configuration;
    values[Number(key)] = descriptor.value;
  }
  if (lengthKeys !== 1) throw FATAL.configuration;
  return values;
}
function inspectedPath(input) {
  const values = inspectedDenseArray(input);
  for (const segment of values) {
    if (typeof segment !== 'string' || UNSAFE_KEYS.indexOf(segment) !== -1)
      throw FATAL.configuration;
  }
  return values;
}
function canonicalIndex(value) {
  return typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) &&
    Number(value) <= 4294967294;
}
function patternsOverlap(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a !== b && !(a === '*' && canonicalIndex(b)) &&
        !(b === '*' && canonicalIndex(a))) return false;
  }
  return true;
}
function rejectOverlappingPatterns(patterns) {
  for (let right = 0; right < patterns.length; right += 1) {
    for (let left = 0; left < right; left += 1) {
      if (patternsOverlap(patterns[left], patterns[right]))
        throw FATAL.configuration;
    }
  }
}
function inspectLimits(input) {
  const values = inspectedRecord(input, LIMIT_KEYS, Object.prototype);
  for (let index = 0; index < 7; index += 1) {
    const key = LIMIT_KEYS[index];
    if (!Number.isSafeInteger(values[key]) ||
        values[key] < (index < 2 ? 1 : 0)) throw FATAL.configuration;
  }
  const declaredPaths = inspectedDenseArray(values.declaredPaths)
    .map(inspectedPath);
  rejectOverlappingPatterns(declaredPaths);
  const collectionLimits = inspectedDenseArray(values.collectionLimits)
    .map(inputRecord => {
      const record = inspectedRecord(inputRecord, ['path', 'maxLength'],
        Object.prototype);
      if (!Number.isSafeInteger(record.maxLength) || record.maxLength < 0)
        throw FATAL.configuration;
      return {path: inspectedPath(record.path), maxLength: record.maxLength};
    });
  rejectOverlappingPatterns(collectionLimits.map(item => item.path));
  return {
    maxDepth: values.maxDepth, maxEntries: values.maxEntries,
    maxStringCodeUnits: values.maxStringCodeUnits,
    maxOwnKeysCalls: values.maxOwnKeysCalls,
    maxDescriptorCalls: values.maxDescriptorCalls,
    maxPrototypeCalls: values.maxPrototypeCalls,
    maxDiagnostics: values.maxDiagnostics, declaredPaths, collectionLimits,
  };
}
function matches(pattern, route) {
  if (pattern.length !== route.length) return false;
  for (let index = 0; index < pattern.length; index += 1) {
    if (pattern[index] === '*' ? !route[index].index :
      pattern[index] !== route[index].value) return false;
  }
  return true;
}
function escapedPath(route) {
  let output = '';
  for (const segment of route) {
    output += `/${segment.value.replace(/~/g, '~0').replace(/\//g, '~1')}`;
  }
  return output;
}
function walkBoundedData(value, limits) {
  let policy;
  try {
    policy = inspectLimits(limits);
  } catch {
    return fatalResult('configuration', zeroCounters());
  }
  const counters = zeroCounters();
  const diagnostics = [];
  const seen = new WeakMap();
  function charge(counter, amount, maximum) {
    if (counters[counter] + amount > maximum) throw FATAL.budget;
    counters[counter] += amount;
  }
  function reflect(counter, maximum, operation, target, key) {
    charge(counter, 1, maximum);
    try {
      return key === undefined ? operation(target) : operation(target, key);
    } catch {
      throw FATAL.inspection;
    }
  }
  function diagnostic(code, path) {
    charge('diagnostics', 1, policy.maxDiagnostics);
    diagnostics.push({code, path});
  }
  function pathIsDeclared(route) {
    return policy.declaredPaths.some(pattern => matches(pattern, route));
  }
  function displayForChild(route, parentDisplay, isIndex) {
    return pathIsDeclared(route) ? escapedPath(route) : isIndex ?
      `${parentDisplay}/${route[route.length - 1].value}` : parentDisplay;
  }
  function stringCharge(input) {
    charge('stringCodeUnits', input.length, policy.maxStringCodeUnits);
  }
  function visit(input, route, displayPath, depth) {
    if (typeof input === 'string') {
      stringCharge(input); return input;
    }
    if (typeof input === 'symbol') {
      diagnostic('SYMBOL_VALUE', displayPath); return null;
    }
    if (typeof input === 'function') {
      diagnostic('UNSUPPORTED_FUNCTION', displayPath); return null;
    }
    if (input === null || typeof input !== 'object') return input;
    const prior = seen.get(input);
    if (prior !== undefined) {
      diagnostic(
        prior === 'active' ? 'CIRCULAR_REFERENCE' : 'REPEATED_REFERENCE',
        displayPath,
      );
      return null;
    }
    if (depth > policy.maxDepth) throw FATAL.budget;
    counters.maxContainerDepth = Math.max(counters.maxContainerDepth, depth);
    seen.set(input, 'active');
    let array;
    try {
      array = Array.isArray(input);
    } catch {
      throw FATAL.inspection;
    }
    const prototype = reflect(
      'prototypeCalls', policy.maxPrototypeCalls, Reflect.getPrototypeOf, input,
    );
    if ((array && prototype !== Array.prototype && prototype !== null) ||
        (!array && prototype !== Object.prototype && prototype !== null)) {
      diagnostic('NONPLAIN_PROTOTYPE', displayPath);
      seen.set(input, 'done');
      return null;
    }
    let clone;
    let arrayLength = 0;
    if (array) {
      const lengthDescriptor = reflect(
        'descriptorCalls', policy.maxDescriptorCalls,
        Reflect.getOwnPropertyDescriptor, input, 'length',
      );
      if (!lengthDescriptor || !hasOwn.call(lengthDescriptor, 'value') ||
          !Number.isInteger(lengthDescriptor.value) ||
          lengthDescriptor.value < 0 || lengthDescriptor.value > 4294967295) {
        throw FATAL.inspection;
      }
      arrayLength = lengthDescriptor.value;
      const collection = policy.collectionLimits.find(item =>
        matches(item.path, route));
      if (collection && arrayLength > collection.maxLength) throw FATAL.budget;
      clone = new Array(arrayLength);
    } else clone = Object.create(null);
    const keys = reflect(
      'ownKeysCalls', policy.maxOwnKeysCalls, Reflect.ownKeys, input,
    );
    const chargedKeys = keys.length -
      (array && keys.indexOf('length') !== -1 ? 1 : 0);
    charge('entries', chargedKeys, policy.maxEntries);
    if (array) {
      let indices = 0;
      for (const key of keys) {
        if (canonicalIndex(key) && Number(key) < arrayLength) indices += 1;
      }
      if (indices !== arrayLength) diagnostic('SPARSE_ARRAY', displayPath);
    }
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (typeof key === 'symbol') {
        diagnostic('SYMBOL_KEY', displayPath);
        continue;
      }
      const isIndex = array && canonicalIndex(key);
      const childRoute = route.concat({value: key, index: isIndex});
      const declared = pathIsDeclared(childRoute);
      if (!isIndex && !declared) stringCharge(key);
      if (UNSAFE_KEYS.indexOf(key) !== -1) {
        diagnostic('UNSAFE_KEY', displayPath);
        continue;
      }
      if (array && !isIndex) {
        diagnostic('ARRAY_NON_INDEX_KEY', displayPath);
        continue;
      }
      const descriptor = reflect(
        'descriptorCalls', policy.maxDescriptorCalls,
        Reflect.getOwnPropertyDescriptor, input, key,
      );
      if (!descriptor) throw FATAL.inspection;
      if (!hasOwn.call(descriptor, 'value')) {
        const getter = descriptor.get !== undefined;
        const setter = descriptor.set !== undefined;
        diagnostic(
          getter && setter ? 'ACCESSOR_GETTER_SETTER' :
            getter ? 'ACCESSOR_GETTER' : 'ACCESSOR_SETTER',
          displayForChild(childRoute, displayPath, isIndex),
        );
        continue;
      }
      const childDisplay = displayForChild(childRoute, displayPath, isIndex);
      const child = visit(descriptor.value, childRoute, childDisplay, depth + 1);
      Object.defineProperty(clone, key, {
        value: child, writable: true, enumerable: true, configurable: true,
      });
    }
    seen.set(input, 'done');
    return clone;
  }
  try {
    charge('entries', 1, policy.maxEntries);
    return {
      status: 'ok', value: visit(value, [], '', 1), counters, diagnostics,
      error: null,
    };
  } catch (error) {
    return fatalResult(
      error === FATAL.budget ? 'budget' : 'inspection', counters,
    );
  }
}
Object.freeze(walkBoundedData);
module.exports = Object.freeze({walkBoundedData});
