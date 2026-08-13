"use strict";
const MAX_NODES = 600000;
const MAX_ENTRIES = 3000000;
const MAX_DEPTH = 64;
const hasOwn = Object.prototype.hasOwnProperty;
function isContainer(value) {
  return value !== null && (typeof value === "object" || typeof value === "function");
}
function fixedFailure() {
  return new TypeError("Fixture graph is not inspectable.");
}
function validDescriptor(descriptor) {
  if (descriptor === null || typeof descriptor !== "object") return false;
  const data = hasOwn.call(descriptor, "value") || hasOwn.call(descriptor, "writable");
  const accessor = hasOwn.call(descriptor, "get") || hasOwn.call(descriptor, "set");
  if (
    data === accessor ||
    typeof descriptor.enumerable !== "boolean" ||
    typeof descriptor.configurable !== "boolean"
  ) {
    return false;
  }
  if (data) {
    return hasOwn.call(descriptor, "value") && typeof descriptor.writable === "boolean";
  }
  return (
    hasOwn.call(descriptor, "get") &&
    hasOwn.call(descriptor, "set") &&
    (descriptor.get === undefined || typeof descriptor.get === "function") &&
    (descriptor.set === undefined || typeof descriptor.set === "function")
  );
}
function inertAccessor() {
  return function fixtureAccessor() {
    throw new Error("Fixture accessor invoked.");
  };
}
function cloneWithDescriptors(value) {
  const clones = new WeakMap();
  let nodes = 0;
  let entries = 0;
  function copy(input, depth) {
    if (!isContainer(input)) return input;
    const known = clones.get(input);
    if (known) return known;
    if (depth > MAX_DEPTH || nodes >= MAX_NODES) throw fixedFailure();
    let target;
    try {
      target = Array.isArray(input) ? [] : Object.create(null);
    } catch {
      throw fixedFailure();
    }
    clones.set(input, target);
    nodes += 1;
    let keys;
    try {
      keys = Reflect.ownKeys(input);
    } catch {
      throw fixedFailure();
    }
    for (let index = 0; index < keys.length; index += 1) {
      if (entries >= MAX_ENTRIES) throw fixedFailure();
      const key = keys[index];
      let descriptor;
      try {
        descriptor = Reflect.getOwnPropertyDescriptor(input, key);
      } catch {
        throw fixedFailure();
      }
      if (!validDescriptor(descriptor)) throw fixedFailure();
      entries += 1;
      const replacement = descriptor.value === undefined && !hasOwn.call(descriptor, "value")
        ? {
            enumerable: descriptor.enumerable,
            configurable: descriptor.configurable,
            get: descriptor.get === undefined ? undefined : inertAccessor(),
            set: descriptor.set === undefined ? undefined : inertAccessor(),
          }
        : {
            enumerable: descriptor.enumerable,
            configurable: descriptor.configurable,
            writable: descriptor.writable,
            value: copy(descriptor.value, depth + 1),
          };
      try {
        Object.defineProperty(target, key, replacement);
      } catch {
        throw fixedFailure();
      }
    }
    return target;
  }
  try {
    return copy(value, 1);
  } catch {
    throw fixedFailure();
  }
}
function snapshotGraph(value) {
  const seen = new WeakMap();
  const symbols = new Map();
  const queue = [];
  const nodes = [];
  let entries = 0;
  function freeze(record) {
    return Object.freeze(record);
  }
  function symbolInfo(symbol) {
    let info = symbols.get(symbol);
    if (!info) {
      const globalKey = Symbol.keyFor(symbol);
      const description = symbol.description;
      info = freeze({
        symbolId: symbols.size,
        globalKey: globalKey === undefined ? null : globalKey,
        description: description === undefined ? null : description,
      });
      symbols.set(symbol, info);
    }
    return info;
  }
  function primitive(input) {
    if (input === null) return freeze({ kind: "primitive", type: "null", value: null });
    switch (typeof input) {
      case "undefined":
        return freeze({ kind: "primitive", type: "undefined", value: null });
      case "boolean":
        return freeze({ kind: "primitive", type: "boolean", value: input });
      case "number":
        return freeze({
          kind: "primitive",
          type: "number",
          value: Object.is(input, -0) ? "-0" : String(input),
        });
      case "string":
        return freeze({ kind: "primitive", type: "string", value: input });
      case "bigint":
        return freeze({ kind: "primitive", type: "bigint", value: String(input) });
      case "symbol":
        return freeze({ kind: "primitive", type: "symbol", value: symbolInfo(input) });
      default:
        return null;
    }
  }
  function reference(id) {
    return freeze({ kind: "ref", id });
  }
  function snapshotValue(input, depth, blocked) {
    if (!isContainer(input)) return primitive(input);
    const known = seen.get(input);
    if (known) return reference(known.id);
    if (depth > MAX_DEPTH || queue.length >= MAX_NODES) {
      blocked.value = true;
      return null;
    }
    let array = false;
    try {
      array = Array.isArray(input);
    } catch {
      array = false;
    }
    const info = { source: input, depth, id: queue.length, array };
    seen.set(input, info);
    queue.push(info);
    return reference(info.id);
  }
  function snapshotKey(key) {
    if (typeof key === "symbol") {
      const info = symbolInfo(key);
      return freeze({
        kind: "symbol",
        symbolId: info.symbolId,
        globalKey: info.globalKey,
        description: info.description,
      });
    }
    const number = Number(key);
    if (
      Number.isInteger(number) &&
      number >= 0 &&
      number <= 4294967294 &&
      String(number) === key
    ) {
      return freeze({ kind: "index", value: key, index: number });
    }
    return freeze({ kind: "string", value: key });
  }
  function inspectionError(operation) {
    return freeze({ kind: "inspection-error", operation, errorName: "Error" });
  }
  function appendNode(info, arrayLength, properties) {
    nodes.push(freeze(info.array ? { id: info.id, kind: "array", arrayLength, properties: freeze(properties) } : { id: info.id, kind: "object", properties: freeze(properties) }));
  }
  function snapshotDescriptor(descriptor, depth, blocked) {
    if (hasOwn.call(descriptor, "value")) {
      const child = snapshotValue(descriptor.value, depth + 1, blocked);
      if (blocked.value) return null;
      return freeze({
        kind: "data",
        enumerable: descriptor.enumerable,
        configurable: descriptor.configurable,
        writable: descriptor.writable,
        value: child,
      });
    }
    return freeze({
      kind: "accessor",
      enumerable: descriptor.enumerable,
      configurable: descriptor.configurable,
      get: descriptor.get === undefined ? "absent" : "present",
      set: descriptor.set === undefined ? "absent" : "present",
    });
  }
  const root = snapshotValue(value, 1, { value: false });
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const info = queue[cursor];
    const properties = [];
    let arrayLength = null;
    let keys;
    if (entries >= MAX_ENTRIES) {
      properties.push(inspectionError("ownKeys"));
      appendNode(info, arrayLength, properties);
      continue;
    }
    try {
      keys = Reflect.ownKeys(info.source);
    } catch {
      properties.push(inspectionError("ownKeys"));
      appendNode(info, arrayLength, properties);
      continue;
    }
    for (let index = 0; index < keys.length; index += 1) {
      if (entries >= MAX_ENTRIES) {
        properties.push(inspectionError("ownKeys"));
        break;
      }
      const key = keys[index];
      const keySnapshot = snapshotKey(key);
      let descriptor;
      try {
        descriptor = Reflect.getOwnPropertyDescriptor(info.source, key);
      } catch {
        properties.push(
          freeze({ key: keySnapshot, descriptor: inspectionError("getOwnPropertyDescriptor") }),
        );
        entries += 1;
        continue;
      }
      if (!validDescriptor(descriptor)) {
        properties.push(
          freeze({ key: keySnapshot, descriptor: inspectionError("getOwnPropertyDescriptor") }),
        );
        entries += 1;
        continue;
      }
      const blocked = { value: false };
      const snapDescriptor = snapshotDescriptor(descriptor, info.depth, blocked);
      if (blocked.value) {
        properties.push(inspectionError("ownKeys"));
        break;
      }
      if (key === "length" && hasOwn.call(descriptor, "value")) {
        const length = descriptor.value;
        if (Number.isInteger(length) && length >= 0 && length <= 4294967295) arrayLength = length;
      }
      properties.push(freeze({ key: keySnapshot, descriptor: snapDescriptor }));
      entries += 1;
    }
    appendNode(info, arrayLength, properties);
  }
  return freeze({ version: 1, root, nodes: freeze(nodes) });
}
module.exports = Object.freeze({
  cloneWithDescriptors: Object.freeze(cloneWithDescriptors),
  snapshotGraph: Object.freeze(snapshotGraph),
});
