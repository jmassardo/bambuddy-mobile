"use strict";

const unsupportedOption = () => {
  throw new TypeError("Unsupported governance fixture option.");
};

const canonicalG7 = function canonical(preset) {
  if (arguments.length !== 1 || typeof preset !== "string") {
    return unsupportedOption();
  }

  switch (preset) {
    case "sparse": {
      const value = new Array(4);
      value[1] = "x";
      value[3] = "y";
      return value;
    }
    case "symbol": {
      const value = Object.create(null);
      value[Symbol.for("fixture-symbol")] = "x";
      value[Symbol("fixture-symbol-local")] = "y";
      return value;
    }
    case "unsafeKeys": {
      const value = Object.create(null);
      for (const key of ["__proto__", "prototype", "constructor"]) {
        Object.defineProperty(value, key, {
          configurable: true,
          enumerable: true,
          value: null,
          writable: true,
        });
      }
      return value;
    }
    case "alias": {
      const shared = { value: "x" };
      return { left: shared, right: shared };
    }
    case "cycle": {
      const value = {};
      value.self = value;
      return value;
    }
    case "accessor": {
      const value = Object.create(null);
      const getter = Object.freeze(() => {
        throw new Error("Fixture accessor invoked.");
      });
      const setter = Object.freeze(() => {
        throw new Error("Fixture accessor invoked.");
      });
      Object.defineProperty(value, "value", {
        configurable: true,
        enumerable: true,
        get: getter,
        set: setter,
      });
      return value;
    }
    default:
      return unsupportedOption();
  }
};

const maxG7 = function max() {
  const root = Object.create(null);
  for (let index = 0; index < 56; index += 1) {
    root["p" + String(index).padStart(6, "0")] = null;
  }

  let current = root;
  for (let level = 2; level <= 7; level += 1) {
    const next = Object.create(null);
    current.next = next;
    current = next;
  }
  const final = Object.create(null);
  current.next = final;
  final.value = null;
  return root;
};

const canonicalG8 = function canonical(preset) {
  if (arguments.length !== 1 || typeof preset !== "string") {
    return unsupportedOption();
  }

  switch (preset) {
    case "utf16":
      return ["A", "\uD800", "\uDC00", "😀"];
    case "asciiFoldCollision":
      return ["alpha", "ALPHA"];
    case "duplicate":
      return ["fixture-000000", "fixture-000000"];
    case "swap":
      return ["fixture-000001", "fixture-000000"];
    default:
      return unsupportedOption();
  }
};

const G7 = Object.freeze({
  canonical: Object.freeze(canonicalG7),
  max: Object.freeze(maxG7),
});
const G8 = Object.freeze({
  canonical: Object.freeze(canonicalG8),
});

module.exports = Object.freeze({ G7, G8 });
