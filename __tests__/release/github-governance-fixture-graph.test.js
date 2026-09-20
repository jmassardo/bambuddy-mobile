"use strict";
const fileSystem = require("fs");
const path = require("path");
const fixture = require("../../test-support/release/github-governance-fixture-graph");
const { cloneWithDescriptors, snapshotGraph } = fixture;
function deeplyFrozen(value) {
  expect(Object.isFrozen(value)).toBe(true);
  if (value && typeof value === "object") {
    for (const key of Reflect.ownKeys(value)) deeplyFrozen(value[key]);
  }
}
function property(node, name) {
  return node.properties.find((entry) => entry.key && entry.key.value === name);
}
function productionText() {
  const root = path.resolve(__dirname, "../..");
  const files = ["App.tsx", "index.js"];
  const sourceRoot = path.join(root, "src");
  for (const name of fileSystem.readdirSync(sourceRoot, { recursive: true })) {
    const file = path.join(sourceRoot, name);
    if (fileSystem.statSync(file).isFile()) files.push(path.relative(root, file));
  }
  return files.map((file) => fileSystem.readFileSync(path.join(root, file), "utf8")).join("\n");
}
describe("github governance fixture graph", () => {
  test("exports only the frozen functions in contract order", () => {
    expect(Reflect.ownKeys(fixture)).toEqual(["cloneWithDescriptors", "snapshotGraph"]);
    expect(Object.isFrozen(fixture)).toBe(true);
    expect(Object.isFrozen(cloneWithDescriptors)).toBe(true);
    expect(Object.isFrozen(snapshotGraph)).toBe(true);
    expect([cloneWithDescriptors.length, snapshotGraph.length]).toEqual([1, 1]);
    expect(fixture.default).toBeUndefined();
  });
  test("preserves GraphSnapshotV1 root and recursive record key order", () => {
    const primitive = snapshotGraph(undefined);
    const callable = snapshotGraph(function fixtureFunction() {});
    const nested = snapshotGraph({ child: { value: 1 } });
    const rootEntry = nested.nodes[0].properties[0];
    const childEntry = nested.nodes[1].properties[0];
    expect(primitive).toEqual({
      version: 1,
      root: { kind: "primitive", type: "undefined", value: null },
      nodes: [],
    });
    expect(callable.root).toEqual({ kind: "ref", id: 0 });
    expect([Reflect.ownKeys(primitive), Reflect.ownKeys(primitive.root), Reflect.ownKeys(callable.nodes[0]), Reflect.ownKeys(nested), Reflect.ownKeys(nested.root), Reflect.ownKeys(nested.nodes[0]), Reflect.ownKeys(rootEntry), Reflect.ownKeys(rootEntry.key), Reflect.ownKeys(rootEntry.descriptor), Reflect.ownKeys(nested.nodes[1]), Reflect.ownKeys(childEntry), Reflect.ownKeys(childEntry.descriptor.value)]).toEqual([
      ["version", "root", "nodes"], ["kind", "type", "value"], ["id", "kind", "properties"], ["version", "root", "nodes"],
      ["kind", "id"], ["id", "kind", "properties"], ["key", "descriptor"], ["kind", "value"],
      ["kind", "enumerable", "configurable", "writable", "value"], ["id", "kind", "properties"], ["key", "descriptor"], ["kind", "type", "value"],
    ]);
  });
  test("encodes every primitive and symbol identity without coercion", () => {
    const local = Symbol("local");
    const global = Symbol.for("global");
    const keyBeforeValue = Symbol("key-before-value");
    const valueAfterKey = Symbol("value-after-key");
    const input = {
      null: null,
      undefined: undefined,
      boolean: true,
      finite: 12.5,
      negativeZero: -0,
      nan: Number.NaN,
      positive: Infinity,
      negative: -Infinity,
      string: "text",
      bigint: -42n,
      local,
      global,
    };
    Object.defineProperty(input, local, { value: local, enumerable: true });
    Object.defineProperty(input, global, { value: global, enumerable: true });
    Object.defineProperty(input, keyBeforeValue, { value: valueAfterKey, enumerable: true });
    const snapshot = snapshotGraph(input);
    expect(snapshotGraph(Symbol()).root.value).toEqual({ symbolId: 0, globalKey: null, description: null });
    const values = Object.fromEntries(
      snapshot.nodes[0].properties
        .filter((entry) => entry.key.kind === "string")
        .map((entry) => [entry.key.value, entry.descriptor.value]),
    );
    expect(values).toMatchObject({
      null: { type: "null", value: null }, undefined: { type: "undefined", value: null },
      boolean: { type: "boolean", value: true }, finite: { type: "number", value: "12.5" },
      negativeZero: { type: "number", value: "-0" }, nan: { type: "number", value: "NaN" },
      positive: { type: "number", value: "Infinity" }, negative: { type: "number", value: "-Infinity" },
      string: { type: "string", value: "text" }, bigint: { type: "bigint", value: "-42" },
    });
    const localValue = values.local.value;
    const globalValue = values.global.value;
    const symbols = snapshot.nodes[0].properties.filter((entry) => entry.key.kind === "symbol");
    expect(localValue).toEqual({ symbolId: 0, globalKey: null, description: "local" });
    expect(globalValue).toEqual({ symbolId: 1, globalKey: "global", description: "global" });
    expect(symbols.slice(0, 2)).toMatchObject([
      { key: { symbolId: 0, globalKey: null, description: "local" }, descriptor: { value: { value: localValue } } },
      { key: { symbolId: 1, globalKey: "global", description: "global" }, descriptor: { value: { value: globalValue } } },
    ]);
    expect(symbols[2]).toMatchObject({
      key: { symbolId: 2, globalKey: null, description: "key-before-value" },
      descriptor: { value: { value: { symbolId: 3, globalKey: null, description: "value-after-key" } } },
    });
  });
  test("preserves own-key order, key unions, array length, and holes", () => {
    const symbol = Symbol("key");
    const array = [];
    array[2] = "two";
    array[0] = "zero";
    array["00"] = "double";
    array["-0"] = "minus";
    array["4294967295"] = "maximum";
    array.extra = "extra";
    array[symbol] = "symbol";
    const node = snapshotGraph(array).nodes[0];
    expect(node).toMatchObject({ kind: "array", arrayLength: 3 });
    expect(node.properties.map((entry) => entry.key)).toEqual([
      { kind: "index", value: "0", index: 0 }, { kind: "index", value: "2", index: 2 },
      { kind: "string", value: "length" }, { kind: "string", value: "00" },
      { kind: "string", value: "-0" }, { kind: "string", value: "4294967295" },
      { kind: "string", value: "extra" }, { kind: "symbol", symbolId: 0, globalKey: null, description: "key" },
    ]);
    expect(node.properties.some((entry) => entry.key.value === "1")).toBe(false);
  });
  test("records descriptor forms and recursively freezes the exact grammar", () => {
    const input = {};
    Object.defineProperty(input, "data", {
      value: "value",
      enumerable: false,
      configurable: false,
      writable: false,
    });
    Object.defineProperty(input, "accessor", {
      enumerable: true,
      configurable: true,
      get() {
        return "not invoked";
      },
      set() {},
    });
    Object.defineProperty(input, "getterOnly", { get() {} });
    Object.defineProperty(input, "setterOnly", { set() {} });
    const snapshot = snapshotGraph(input);
    expect(property(snapshot.nodes[0], "data").descriptor).toEqual({
      kind: "data",
      enumerable: false,
      configurable: false,
      writable: false,
      value: { kind: "primitive", type: "string", value: "value" },
    });
    expect(property(snapshot.nodes[0], "accessor").descriptor).toEqual({
      kind: "accessor",
      enumerable: true,
      configurable: true,
      get: "present",
      set: "present",
    });
    const getterOnly = property(snapshot.nodes[0], "getterOnly").descriptor;
    const setterOnly = property(snapshot.nodes[0], "setterOnly").descriptor;
    expect([getterOnly.get, getterOnly.set, setterOnly.get, setterOnly.set])
      .toEqual(["present", "absent", "absent", "present"]);
    expect([
      Reflect.ownKeys(property(snapshot.nodes[0], "accessor").descriptor),
      Reflect.ownKeys(getterOnly), Reflect.ownKeys(setterOnly),
    ]).toEqual([
      ["kind", "enumerable", "configurable", "get", "set"],
      ["kind", "enumerable", "configurable", "get", "set"],
      ["kind", "enumerable", "configurable", "get", "set"],
    ]);
    deeplyFrozen(snapshot);
  });
  test("uses breadth-first IDs for aliases, self-cycles, and two-node cycles", () => {
    const left = {};
    const right = {};
    const root = { left, right };
    root.alias = left;
    root.self = root;
    left.peer = right;
    right.peer = left;
    const snapshot = snapshotGraph(root);
    expect(snapshot.nodes.map((node) => node.id)).toEqual([0, 1, 2]);
    expect(property(snapshot.nodes[0], "left").descriptor.value).toEqual({ kind: "ref", id: 1 });
    expect(property(snapshot.nodes[0], "right").descriptor.value).toEqual({ kind: "ref", id: 2 });
    expect(property(snapshot.nodes[0], "alias").descriptor.value).toEqual({ kind: "ref", id: 1 });
    expect(property(snapshot.nodes[0], "self").descriptor.value).toEqual({ kind: "ref", id: 0 });
    expect(property(snapshot.nodes[1], "peer").descriptor.value).toEqual({ kind: "ref", id: 2 });
    expect(property(snapshot.nodes[2], "peer").descriptor.value).toEqual({ kind: "ref", id: 1 });
  });
  test("clones descriptors, arrays, unsafe keys, and fresh inert accessors", () => {
    const child = { mutable: true };
    const input = [];
    let sourceCalls = 0;
    function sourceGet() {
      sourceCalls += 1;
      return child;
    }
    function sourceSet() {}
    Object.defineProperty(input, "__proto__", {
      value: child,
      enumerable: true,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(input, "locked", {
      value: child,
      enumerable: false,
      configurable: false,
      writable: false,
    });
    Object.defineProperty(input, "access", {
      enumerable: true,
      configurable: true,
      get: sourceGet,
      set: sourceSet,
    });
    input.alias = child;
    input.self = input;
    const copy = cloneWithDescriptors(input);
    const second = cloneWithDescriptors(input);
    const proto = Object.getOwnPropertyDescriptor(copy, "__proto__");
    const locked = Object.getOwnPropertyDescriptor(copy, "locked");
    const access = Object.getOwnPropertyDescriptor(copy, "access");
    expect(Array.isArray(copy)).toBe(true);
    expect(Object.getPrototypeOf(copy)).toBe(Array.prototype);
    expect(Object.getPrototypeOf(proto.value)).toBe(null);
    expect(proto.value).toBe(locked.value);
    expect(copy.alias).toBe(proto.value);
    expect(copy.self).toBe(copy);
    expect(proto.value).not.toBe(child);
    expect(proto.value).not.toBe(Object.getOwnPropertyDescriptor(second, "__proto__").value);
    expect(locked).toMatchObject({ enumerable: false, configurable: false, writable: false });
    expect(access.get).not.toBe(sourceGet);
    expect(access.set).not.toBe(sourceSet);
    expect(access.get).not.toBe(access.set);
    expect(access.get).not.toBe(Object.getOwnPropertyDescriptor(second, "access").get);
    expect(sourceCalls).toBe(0);
    expect(() => access.get()).toThrow("Fixture accessor invoked.");
    expect(() => access.set()).toThrow("Fixture accessor invoked.");
    expect(sourceCalls).toBe(0);
    expect(Object.getPrototypeOf(cloneWithDescriptors(function sourceFunction() {}))).toBe(null);
  });
  test("uses only bounded allowed reflection operations on sources", () => {
    const counts = { ownKeys: 0, descriptor: 0, get: 0, set: 0, has: 0, proto: 0, define: 0 };
    const target = { value: 1 };
    const source = new Proxy(target, {
      ownKeys(value) {
        counts.ownKeys += 1;
        return Reflect.ownKeys(value);
      },
      getOwnPropertyDescriptor(value, key) {
        counts.descriptor += 1;
        return Reflect.getOwnPropertyDescriptor(value, key);
      },
      get() {
        counts.get += 1;
        return undefined;
      },
      set() {
        counts.set += 1;
        return true;
      },
      has() {
        counts.has += 1;
        return false;
      },
      getPrototypeOf() {
        counts.proto += 1;
        return null;
      },
      defineProperty() {
        counts.define += 1;
        return false;
      },
    });
    snapshotGraph(source);
    expect(counts).toEqual({ ownKeys: 1, descriptor: 1, get: 0, set: 0, has: 0, proto: 0, define: 0 });
    counts.ownKeys = 0;
    counts.descriptor = 0;
    cloneWithDescriptors(source);
    expect(counts).toEqual({ ownKeys: 1, descriptor: 1, get: 0, set: 0, has: 0, proto: 0, define: 0 });
  });
  test("sanitizes throwing and malformed reflection without caller details", () => {
    const ownKeysFailure = new Proxy({}, {
      ownKeys() {
        throw "private detail";
      },
    });
    const descriptorFailure = new Proxy({ first: 1, second: 2 }, {
      getOwnPropertyDescriptor(target, key) {
        if (key === "first") throw "private detail";
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    const malformed = new Proxy({ value: 1 }, {
      getOwnPropertyDescriptor() {
        return undefined;
      },
    });
    const malformedOwnKeys = new Proxy(Object.freeze({ locked: 1 }), {
      ownKeys() {
        return [];
      },
    });
    const ownKeysGraph = snapshotGraph(ownKeysFailure);
    const ownKeysSnapshot = ownKeysGraph.nodes[0].properties;
    expect(ownKeysSnapshot).toEqual([
      { kind: "inspection-error", operation: "ownKeys", errorName: "Error" },
    ]);
    expect(Reflect.ownKeys(ownKeysSnapshot[0])).toEqual(["kind", "operation", "errorName"]);
    const malformedOwnKeysGraph = snapshotGraph(malformedOwnKeys);
    expect(malformedOwnKeysGraph.nodes[0].properties).toEqual([
      { kind: "inspection-error", operation: "ownKeys", errorName: "Error" },
    ]);
    const descriptorGraph = snapshotGraph(descriptorFailure);
    const descriptorSnapshot = descriptorGraph.nodes[0].properties;
    expect(Reflect.ownKeys(descriptorSnapshot[0].descriptor))
      .toEqual(["kind", "operation", "errorName"]);
    expect(descriptorSnapshot).toEqual([
      {
        key: { kind: "string", value: "first" },
        descriptor: {
          kind: "inspection-error",
          operation: "getOwnPropertyDescriptor",
          errorName: "Error",
        },
      },
      expect.objectContaining({ key: { kind: "string", value: "second" } }),
    ]);
    const malformedGraph = snapshotGraph(malformed);
    expect(malformedGraph.nodes[0].properties[0].descriptor).toEqual({
      kind: "inspection-error",
      operation: "getOwnPropertyDescriptor",
      errorName: "Error",
    });
    [ownKeysGraph, malformedOwnKeysGraph, descriptorGraph, malformedGraph].forEach(deeplyFrozen);
    for (const input of [ownKeysFailure, descriptorFailure, malformed, malformedOwnKeys]) {
      expect(() => cloneWithDescriptors(input)).toThrow(TypeError);
      expect(() => cloneWithDescriptors(input)).toThrow(/^Fixture graph is not inspectable\.$/);
    }
  });
  test("accepts depth 64 and sanitizes depth 65 with bounded repeated graphs", () => {
    let accepted = {};
    for (let index = 1; index < 64; index += 1) accepted = { child: accepted };
    let rejected = { child: accepted };
    const acceptedSnapshot = snapshotGraph(accepted);
    const rejectedSnapshot = snapshotGraph(rejected);
    expect(acceptedSnapshot.nodes).toHaveLength(64);
    expect(cloneWithDescriptors(accepted)).not.toBe(accepted);
    expect(rejectedSnapshot.nodes).toHaveLength(64);
    expect(rejectedSnapshot.nodes[63].properties).toEqual([{ kind: "inspection-error", operation: "ownKeys", errorName: "Error" }]);
    expect(() => cloneWithDescriptors(rejected)).toThrow("Fixture graph is not inspectable.");
    const originalPush = Array.prototype.push; let queue;
    Array.prototype.push = function boundedPush(...items) { const result = originalPush.apply(this, items); const item = items[0];
      if (item && Object.prototype.hasOwnProperty.call(item, "source")) queue = this;
      if (item && item.kind === "inspection-error" && queue) queue.length = 1; return result; };
    try {
      const synthetic = new Proxy({ later: {} }, { getOwnPropertyDescriptor(target, key) {
        if (key === "later") queue.length = 600000;
        return Reflect.getOwnPropertyDescriptor(target, key);
      } });
      expect(snapshotGraph(synthetic).nodes[0].properties).toEqual([
        { kind: "inspection-error", operation: "ownKeys", errorName: "Error" },
      ]);
    } finally { if (queue) queue.length = 1; Array.prototype.push = originalPush; }
    const originalOwnKeys = Reflect.ownKeys; const originalDescriptor = Reflect.getOwnPropertyDescriptor;
    const repeatedEntries = {};
    const keys = new Proxy({}, { get(_, key) { return key === "length" ? 3000001 : "entry"; } });
    const descriptor = { value: 1, enumerable: true, configurable: true, writable: true };
    Reflect.ownKeys = (input) => input === repeatedEntries ? keys : originalOwnKeys(input);
    Reflect.getOwnPropertyDescriptor = (input, key) => input === repeatedEntries && key === "entry" ? descriptor : originalDescriptor(input, key);
    Array.prototype.push = function retainLimitError(...items) {
      if (items[0] && Object.prototype.hasOwnProperty.call(items[0], "key")) return this.length;
      return originalPush.apply(this, items);
    };
    try {
      expect(snapshotGraph(repeatedEntries).nodes[0].properties).toEqual([{ kind: "inspection-error", operation: "ownKeys", errorName: "Error" }]);
      expect(() => cloneWithDescriptors(repeatedEntries)).toThrow("Fixture graph is not inspectable.");
    } finally { Array.prototype.push = originalPush; Reflect.ownKeys = originalOwnKeys; Reflect.getOwnPropertyDescriptor = originalDescriptor; }
  });
  test("has a cold import and source free of prohibited material", () => {
    const modulePath = require.resolve("../../test-support/release/github-governance-fixture-graph");
    const original = { console: global.console, random: Math.random, now: Date.now, env: process.env };
    const activity = [];
    global.console = new Proxy(original.console, {
      get() {
        activity.push("console");
        return () => undefined;
      },
    });
    Math.random = () => {
      activity.push("random");
      return 0;
    };
    Date.now = () => {
      activity.push("time");
      return 0;
    };
    process.env = new Proxy(original.env, {
      get() {
        activity.push("environment");
        return undefined;
      },
    });
    try {
      delete require.cache[modulePath];
      require(modulePath);
    } finally {
      global.console = original.console;
      Math.random = original.random;
      Date.now = original.now;
      process.env = original.env;
    }
    const source = fileSystem.readFileSync(modulePath, "utf8");
    const production = productionText();
    expect(activity).toEqual([]);
    expect(source).not.toMatch(/\b(?:credential|token|jwt|pem|base64|authorization|curl)\b/i);
    expect(source).not.toMatch(/\b(?:exec|spawn|child_process|fs|net|dns|http|https)\b/i);
    expect(source).not.toMatch(/process\.|require\(|console\.|Math\.random|Date\.now/);
    expect(source.match(/new Error\(/g)).toEqual(["new Error("]);
    expect(production).not.toContain("test-support/");
    expect(production).not.toContain("github-governance-fixture-graph");
  });
});
