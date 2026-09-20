const fs = require("fs");
const path = require("path");
const fixture = require("../../test-support/release/github-governance-boundary-descriptor-ordering");
const fixtureFile = path.resolve(__dirname, "../../test-support/release/github-governance-boundary-descriptor-ordering.js");
const root = path.resolve(__dirname, "../..");
const dataFlags = { configurable: true, enumerable: true, writable: true };
function expectDataDescriptor(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  expect(descriptor).toEqual(expect.objectContaining(dataFlags));
  expect(descriptor.get).toBeUndefined();
  expect(descriptor.set).toBeUndefined();
  return descriptor;
}

function captureError(action) {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("Expected an error.");
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(entryPath);
    return /\.(?:js|jsx|ts|tsx)$/.test(entry.name) && !/\.(?:test|spec)\./.test(entry.name) ? [entryPath] : [];
  });
}

describe("github governance boundary descriptor ordering fixtures", () => {
  test("has the exact frozen export partition and cold-imports without fixture construction", () => {
    expect(Reflect.ownKeys(fixture)).toEqual(["G7", "G8"]);
    expect(Reflect.ownKeys(fixture.G7)).toEqual(["canonical", "max"]);
    expect(Reflect.ownKeys(fixture.G8)).toEqual(["canonical"]);
    expect(fixture.G7.plusOne).toBeUndefined();
    expect(fixture.G8.max).toBeUndefined();
    expect(fixture.G8.plusOne).toBeUndefined();
    for (const value of [fixture, fixture.G7, fixture.G8, fixture.G7.canonical, fixture.G7.max, fixture.G8.canonical]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    let cold;
    let constructionAttempts = 0;
    expect(() => {
      jest.isolateModules(() => {
        const create = jest.spyOn(Object, "create").mockImplementation(() => {
          constructionAttempts += 1;
          throw new Error("Fixture construction at import.");
        });
        try {
          cold = require("../../test-support/release/github-governance-boundary-descriptor-ordering");
        } finally {
          create.mockRestore();
        }
      });
    }).not.toThrow();
    expect(constructionAttempts).toBe(0);
    expect(Reflect.ownKeys(cold)).toEqual(["G7", "G8"]);
  });

  test("rejects every invalid canonical invocation with fresh fixed TypeErrors", () => {
    const invalidCalls = [
      () => fixture.G7.canonical(),
      () => fixture.G7.canonical("sparse", "extra"),
      () => fixture.G7.canonical("unsupported"),
      () => fixture.G7.canonical(new String("sparse")),
      () => fixture.G8.canonical(),
      () => fixture.G8.canonical("utf16", "extra"),
      () => fixture.G8.canonical("unsupported"),
      () => fixture.G8.canonical(Symbol("utf16")),
    ];
    const errors = invalidCalls.map(captureError);
    for (const error of errors) {
      expect(error).toBeInstanceOf(TypeError);
      expect(error.message).toBe("Unsupported governance fixture option.");
    }
    expect(new Set(errors).size).toBe(errors.length);
    expect(fixture.G7.max.length).toBe(0);
  });

  test("materializes G7 sparse, symbol, and unsafe-key descriptors exactly", () => {
    const sparse = fixture.G7.canonical("sparse");
    expect(Array.isArray(sparse)).toBe(true);
    expect(sparse.length).toBe(4);
    expect(Reflect.ownKeys(sparse)).toEqual(["1", "3", "length"]);
    expect(Object.hasOwn(sparse, "0")).toBe(false);
    expect(Object.hasOwn(sparse, "2")).toBe(false);
    expect(expectDataDescriptor(sparse, "1").value).toBe("x");
    expect(expectDataDescriptor(sparse, "3").value).toBe("y");
    sparse[1] = "changed";
    const freshSparse = fixture.G7.canonical("sparse");
    expect(freshSparse).not.toBe(sparse);
    expect(freshSparse[1]).toBe("x");

    const symbols = fixture.G7.canonical("symbol");
    const symbolKeys = Object.getOwnPropertySymbols(symbols);
    expect(Object.getPrototypeOf(symbols)).toBeNull();
    expect(symbolKeys).toHaveLength(2);
    expect(Reflect.ownKeys(symbols)).toEqual(symbolKeys);
    expect(symbolKeys[0]).toBe(Symbol.for("fixture-symbol"));
    expect(symbolKeys[1]).not.toBe(Symbol("fixture-symbol-local"));
    expect(Symbol.keyFor(symbolKeys[1])).toBeUndefined();
    expect(symbolKeys[1].description).toBe("fixture-symbol-local");
    expect(expectDataDescriptor(symbols, symbolKeys[0]).value).toBe("x");
    expect(expectDataDescriptor(symbols, symbolKeys[1]).value).toBe("y");
    symbols[symbolKeys[0]] = "changed";
    const freshSymbols = fixture.G7.canonical("symbol");
    expect(freshSymbols).not.toBe(symbols);
    expect(Object.getOwnPropertyDescriptor(freshSymbols, symbolKeys[0]).value).toBe("x");
    expect(Object.getOwnPropertySymbols(freshSymbols)[1]).not.toBe(symbolKeys[1]);

    const unsafeKeys = fixture.G7.canonical("unsafeKeys");
    expect(Object.getPrototypeOf(unsafeKeys)).toBeNull();
    expect(Reflect.ownKeys(unsafeKeys)).toEqual(["__proto__", "prototype", "constructor"]);
    for (const key of Reflect.ownKeys(unsafeKeys)) {
      expect(expectDataDescriptor(unsafeKeys, key).value).toBeNull();
    }
    unsafeKeys.__proto__ = "changed";
    expect(Object.getOwnPropertyDescriptor(unsafeKeys, "__proto__").value).toBe("changed");
    expect(fixture.G7.canonical("unsafeKeys")).not.toBe(unsafeKeys);
  });

  test("materializes G7 aliases, cycles, and inert accessors exactly", () => {
    const alias = fixture.G7.canonical("alias");
    const shared = expectDataDescriptor(alias, "left").value;
    expect(Object.getPrototypeOf(alias)).toBe(Object.prototype);
    expect(Reflect.ownKeys(alias)).toEqual(["left", "right"]);
    expect(shared).toBe(expectDataDescriptor(alias, "right").value);
    expect(Object.getPrototypeOf(shared)).toBe(Object.prototype);
    expect(Reflect.ownKeys(shared)).toEqual(["value"]);
    expect(expectDataDescriptor(shared, "value").value).toBe("x");
    shared.value = "changed";
    expect(alias.right.value).toBe("changed");
    const freshAlias = fixture.G7.canonical("alias");
    expect(freshAlias).not.toBe(alias);
    expect(freshAlias.left.value).toBe("x");

    const cycle = fixture.G7.canonical("cycle");
    expect(Object.getPrototypeOf(cycle)).toBe(Object.prototype);
    expect(Reflect.ownKeys(cycle)).toEqual(["self"]);
    expect(expectDataDescriptor(cycle, "self").value).toBe(cycle);
    cycle.self = null;
    expect(cycle.self).toBeNull();
    expect(fixture.G7.canonical("cycle")).not.toBe(cycle);

    const accessor = fixture.G7.canonical("accessor");
    const descriptor = Object.getOwnPropertyDescriptor(accessor, "value");
    expect(Object.getPrototypeOf(accessor)).toBeNull();
    expect(Reflect.ownKeys(accessor)).toEqual(["value"]);
    expect(descriptor).toEqual(expect.objectContaining({ configurable: true, enumerable: true, get: expect.any(Function), set: expect.any(Function) }));
    expect(descriptor.value).toBeUndefined();
    expect(descriptor.writable).toBeUndefined();
    expect(Object.isFrozen(descriptor.get)).toBe(true);
    expect(Object.isFrozen(descriptor.set)).toBe(true);
    for (const action of [() => descriptor.get.call(accessor), () => descriptor.set.call(accessor, "x")]) {
      const error = captureError(action);
      expect(error).toBeInstanceOf(Error);
      expect(error.constructor).toBe(Error);
      expect(error.message).toBe("Fixture accessor invoked.");
    }
    const freshAccessor = fixture.G7.canonical("accessor");
    expect(freshAccessor).not.toBe(accessor);
    const nextDescriptor = Object.getOwnPropertyDescriptor(freshAccessor, "value");
    expect(nextDescriptor.get).not.toBe(descriptor.get);
    expect(nextDescriptor.set).not.toBe(descriptor.set);
  });

  test("materializes a fresh mutable G7 maximum graph with only specified structure", () => {
    const maximum = fixture.G7.max();
    const freshMaximum = fixture.G7.max();
    const rootKeys = Reflect.ownKeys(maximum);
    let propertyCount = rootKeys.length;
    let freshNode = freshMaximum;
    expect(Object.getPrototypeOf(maximum)).toBeNull();
    expect(freshMaximum).not.toBe(maximum);
    expect(rootKeys).toHaveLength(57);
    expect(rootKeys.slice(0, 56)).toEqual(Array.from({ length: 56 }, (_, index) => "p" + String(index).padStart(6, "0")));
    expect(rootKeys[56]).toBe("next");
    for (const key of rootKeys) {
      expectDataDescriptor(maximum, key);
    }

    let node = maximum;
    for (let level = 2; level <= 7; level += 1) {
      node = expectDataDescriptor(node, "next").value;
      freshNode = expectDataDescriptor(freshNode, "next").value;
      expect(freshNode).not.toBe(node);
      expect(Object.getPrototypeOf(node)).toBeNull();
      const keys = Reflect.ownKeys(node);
      propertyCount += keys.length;
      expect(keys).toEqual(["next"]);
      expectDataDescriptor(node, "next");
    }
    const terminal = expectDataDescriptor(node, "next").value;
    const freshTerminal = expectDataDescriptor(freshNode, "next").value;
    expect(freshTerminal).not.toBe(terminal);
    expect(Object.getPrototypeOf(terminal)).toBeNull();
    const terminalKeys = Reflect.ownKeys(terminal);
    propertyCount += terminalKeys.length;
    expect(terminalKeys).toEqual(["value"]);
    expect(expectDataDescriptor(terminal, "value").value).toBeNull();
    expect(propertyCount).toBe(64);
    Object.defineProperty(maximum, "mutable", { ...dataFlags, value: true });
    expect(maximum.mutable).toBe(true);
  });

  test("materializes fresh, mutable G8 arrays in literal order", () => {
    const expected = { utf16: ["A", "\uD800", "\uDC00", "😀"], asciiFoldCollision: ["alpha", "ALPHA"], duplicate: ["fixture-000000", "fixture-000000"], swap: ["fixture-000001", "fixture-000000"] };
    const results = [];
    for (const [preset, values] of Object.entries(expected)) {
      const actual = fixture.G8.canonical(preset);
      const indexKeys = values.map((_, index) => String(index));
      results.push(actual);
      expect(Array.isArray(actual)).toBe(true);
      expect(Object.getPrototypeOf(actual)).toBe(Array.prototype);
      expect(actual).toEqual(values);
      expect(Object.isFrozen(actual)).toBe(false);
      expect(Reflect.ownKeys(actual)).toEqual([...indexKeys, "length"]);
      for (const [index, value] of values.entries()) {
        expect(expectDataDescriptor(actual, String(index)).value).toBe(value);
      }
      expect(Object.getOwnPropertyDescriptor(actual, "length")).toEqual({
        configurable: false, enumerable: false, value: values.length, writable: true,
      });
      actual.push("changed");
      const fresh = fixture.G8.canonical(preset);
      expect(fresh).not.toBe(actual);
      expect(fresh).toEqual(values);
    }
    expect(new Set(results).size).toBe(Object.keys(expected).length);
    expect(fixture.G8.canonical("utf16")).not.toBe(fixture.G7.canonical("sparse"));
  });

  test("contains only canonical literals and pure fixture source", () => {
    const source = fs.readFileSync(fixtureFile, "utf8");
    const allowed = new Set(["use strict", "Unsupported governance fixture option.", "sparse", "symbol", "unsafeKeys", "alias", "cycle", "accessor", "x", "y", "fixture-symbol", "fixture-symbol-local", "__proto__", "prototype", "constructor", "Fixture accessor invoked.", "string", "p", "0", "value", "utf16", "asciiFoldCollision", "duplicate", "swap", "A", "\\uD800", "\\uDC00", "😀", "alpha", "ALPHA", "fixture-000000", "fixture-000001"]);
    const literals = source.match(/"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|`(?:\\.|[^`\\])*`/g) || [];
    expect(new Set(literals.map((literal) => literal.slice(1, -1)))).toEqual(allowed);
    for (const pattern of [
      /\b(?:child_process|cluster|fs|https?|net|dns|tls|dgram|fetch|XMLHttpRequest|WebSocket)\b/i, /\b(?:process|Deno|console|Date|performance|set(?:Timeout|Interval)|queueMicrotask)\b/,
      /\b(?:localStorage|sessionStorage|AsyncStorage|serviceWorker|navigator|location|window|document|globalThis)\b/,
      /Math\s*\.\s*random|require\s*\.\s*cache|Module\s*\.\s*_cache|\b(?:cache|memo(?:ize)?)\b|\.sort\s*\(/,
      /\b(?:Proxy|JSON\s*\.(?:parse|stringify)|eval|Function)\b/, /\b(?:formula|plusOne|derive|generate)\b/i, /\b(?:canonicalG7|canonicalG8|maxG7)\s*\(/, /(?:ghp_|github_pat_|Bearer\s|Basic\s|eyJ[\w-]{10,}\.)/i,
      /-----BEGIN|authorization|:\/\/[^\s/]*@|\/(?:var\/)?tmp\b|(?:[A-Fa-f0-9]{32,}|[A-Za-z0-9+/]{40,}={0,2})/i,
      /\b(?:secret|credential|token|password|api[_-]?key|count|cardinality|cartesian|permutation|pairwise)\b/i,
      /\.(?:message|name|stack|cause|command)\b/,
      /\b(?:TODO|FIXME|XXX|HACK)\b/,
    ]) {
      expect(source).not.toMatch(pattern);
    }
  });

  test("keeps test support out of production imports", () => {
    const productionFiles = [path.join(root, "App.tsx"), path.join(root, "index.js"), ...sourceFiles(path.join(root, "src"))];
    for (const file of productionFiles) {
      expect(fs.readFileSync(file, "utf8")).not.toContain("test-support/");
    }
  });
});
