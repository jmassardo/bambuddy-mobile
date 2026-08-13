'use strict';

const {
  GOVERNANCE_CONTRACT,
  GOVERNANCE_FINDING_SCHEMA_VERSION,
  SCANNER_FINDING_CODES,
} = require('../../scripts/release/github-governance-contract.js');

const EVIDENCE_NAMESPACE = GOVERNANCE_CONTRACT.evidence.nameNamespaces[0];
const EVIDENCE_STATE = GOVERNANCE_CONTRACT.evidence.stateValues[10];
const DEFAULT_G2_SHAPE = 'three-key';
const UNSUPPORTED_G2_OPTION_MESSAGE = 'Unsupported governance fixture option.';

function clonePlainData(value) {
  if (Array.isArray(value)) {
    return value.map(clonePlainData);
  }

  if (value && typeof value === 'object') {
    const copy = {};
    for (const key of Object.keys(value)) {
      copy[key] = clonePlainData(value[key]);
    }
    return copy;
  }

  return value;
}

function cloneGovernanceContract() {
  return clonePlainData(GOVERNANCE_CONTRACT);
}

function createFindingShape(argumentsLike) {
  if (argumentsLike.length === 0) {
    return Object.freeze({
      shape: DEFAULT_G2_SHAPE,
    });
  }

  const [shape] = argumentsLike;
  if (
    argumentsLike.length !== 1 ||
    typeof shape !== 'string' ||
    (shape !== 'two-key' && shape !== DEFAULT_G2_SHAPE)
  ) {
    throw new TypeError(UNSUPPORTED_G2_OPTION_MESSAGE);
  }

  return Object.freeze({
    shape,
  });
}

function createFindingFormula(argumentsLike, threeKeyCounts, twoKeyCounts) {
  const {shape} = createFindingShape(argumentsLike);
  const counts = shape === DEFAULT_G2_SHAPE ? threeKeyCounts : twoKeyCounts;

  return Object.freeze({
    shape,
    expectedCount: counts[0],
    observedCount: counts[1],
    relatedCount: counts[2],
  });
}

function createFixtureName(prefix, index) {
  return `fixture-${String(prefix + index).padStart(6, '0')}`;
}

function createEvidenceItem(shape, name) {
  const item = {
    namespace: EVIDENCE_NAMESPACE,
    name,
  };

  if (shape === DEFAULT_G2_SHAPE) {
    item.state = EVIDENCE_STATE;
  }

  return item;
}

function createEvidenceItems(shape, prefix, count) {
  const items = [];
  for (let index = 0; index < count; index += 1) {
    items.push(createEvidenceItem(shape, createFixtureName(prefix, index)));
  }
  return items;
}

function createFinding(shape) {
  return {
    schemaVersion: GOVERNANCE_FINDING_SCHEMA_VERSION,
    kind: 'scanner',
    code: SCANNER_FINDING_CODES[0],
    severity: 'error',
    scope: 'workflow',
    subject: 'fixture-subject',
    message: 'STRUCTURAL_FIXTURE_MESSAGE',
    remediation: 'STRUCTURAL_FIXTURE_REMEDIATION',
    path: '.github/workflows/fixture.yml',
    location: {
      line: 1,
      column: 1,
    },
    evidence: {
      expected: createEvidenceItems(shape.shape, 0, shape.expectedCount),
      observed: createEvidenceItems(shape.shape, 100000, shape.observedCount),
      related: createEvidenceItems(shape.shape, 200000, shape.relatedCount),
    },
  };
}

const G1 = Object.freeze({
  canonical: Object.freeze(function canonical() {
    return cloneGovernanceContract();
  }),
  max: Object.freeze(function max() {
    return cloneGovernanceContract();
  }),
  maxPlusOne: Object.freeze(function maxPlusOne() {
    const finding = cloneGovernanceContract();
    finding.fixtureBoundary = null;
    return finding;
  }),
});

const G2 = Object.freeze({
  canonical: Object.freeze(function canonical() {
    return createFinding(createFindingFormula(arguments, [1, 1, 1], [1, 1, 1]));
  }),
  max: Object.freeze(function max() {
    return createFinding(createFindingFormula(arguments, [32, 32, 32], [43, 43, 42]));
  }),
  maxPlusOne: Object.freeze(function maxPlusOne() {
    return createFinding(createFindingFormula(arguments, [32, 32, 33], [43, 43, 43]));
  }),
});

module.exports = Object.freeze({
  G1,
  G2,
});
