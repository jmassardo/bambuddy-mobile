const ReactTestRenderer = require('react-test-renderer');

function queryAll(root, predicate, options = {}) {
  const results = [];

  function visit(node) {
    if (!node || typeof node === 'string') return false;

    let childMatched = false;
    for (const child of node.children ?? []) {
      childMatched = visit(child) || childMatched;
    }

    const matched = predicate(node);
    if (matched && (!options.matchDeepestOnly || !childMatched)) {
      results.push(node);
    }

    return matched || childMatched;
  }

  visit(root);
  return results;
}

function createRoot() {
  let renderer = null;
  let currentRoot = null;
  const getCurrentRoot = () => {
    if (!renderer) return currentRoot;
    try {
      currentRoot = renderer.root;
    } catch {
      // Keep the last accessible root for query operations during cleanup.
    }
    return currentRoot;
  };

  return {
    render(element) {
      if (renderer) {
        renderer.update(element);
        return;
      }

      renderer = ReactTestRenderer.create(element);
    },
    unmount() {
      renderer?.unmount();
    },
    get container() {
      return new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === 'queryAll') {
              return (predicate, options) =>
                queryAll(getCurrentRoot(), predicate, options);
            }

            if (prop === 'toJSON') return renderer?.toJSON.bind(renderer);
            const root = getCurrentRoot();
            const value = root?.[prop];
            return typeof value === 'function' ? value.bind(root) : value;
          },
        },
      );
    },
  };
}

module.exports = {
  createRoot,
};
