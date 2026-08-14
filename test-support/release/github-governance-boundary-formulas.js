function familyRecord(group, preset, expectedVisits, counts, formula) {
  return Object.freeze({
    group,
    preset,
    expectedVisits,
    counts: Object.freeze(counts),
    formula,
  });
}

const g3Canonical = () =>
  familyRecord(
    'G3',
    'canonical',
    3,
    {scannedPaths: 0, findings: 0, evidencePerFinding: 0, evidenceItems: 0, repositoryPaths: 0, extraOwnKeys: 0},
    '3',
  );
const g3Max = () =>
  familyRecord(
    'G3',
    'max',
    2015003,
    {scannedPaths: 10000, findings: 5000, evidencePerFinding: 96, evidenceItems: 480000, repositoryPaths: 15000, extraOwnKeys: 0},
    '3 + 10000 + 5000 + (5000 * 400) = 2015003',
  );
const g3MaxPlusOne = () =>
  familyRecord(
    'G3',
    'maxPlusOne',
    2015004,
    {scannedPaths: 10000, findings: 5000, evidencePerFinding: 96, evidenceItems: 480000, repositoryPaths: 15000, extraOwnKeys: 1},
    '3 + 10000 + 5000 + (5000 * 400) + 1 = 2015004',
  );

const g4Canonical = () =>
  familyRecord(
    'G4',
    'canonical',
    11,
    {root: 11, repository: 0, rulesets: 0, legacyBranchProtection: 0, environments: 0, inventories: 0, actions: 0, collaborators: 0, branches: 0, workflow: 0, rulesetEntries: 0, rulesPerRuleset: 0, knownRulesPerRuleset: 0, unknownRulesPerRuleset: 0, conditionVisitsPerRuleset: 0, bypassVisitsPerRuleset: 0, ruleVisitsPerRuleset: 0, environmentEntries: 0, extraOwnKeys: 0},
    '11',
  );
const g4Max = () =>
  familyRecord(
    'G4',
    'max',
    2592031,
    {root: 11, repository: 3, rulesets: 301800, legacyBranchProtection: 6, environments: 271200, inventories: 2000, actions: 4, collaborators: 2000, branches: 4, workflow: 2015003, rulesetEntries: 100, rulesPerRuleset: 100, knownRulesPerRuleset: 4, unknownRulesPerRuleset: 96, conditionVisitsPerRuleset: 2003, bypassVisitsPerRuleset: 400, ruleVisitsPerRuleset: 607, environmentEntries: 100, extraOwnKeys: 0},
    '11 + 3 + 301800 + 6 + 271200 + 2000 + 4 + 2000 + 4 + 2015003 = 2592031',
  );
const g4MaxPlusOne = () =>
  familyRecord(
    'G4',
    'maxPlusOne',
    2592032,
    {root: 11, repository: 3, rulesets: 301800, legacyBranchProtection: 6, environments: 271200, inventories: 2000, actions: 4, collaborators: 2000, branches: 4, workflow: 2015003, rulesetEntries: 100, rulesPerRuleset: 100, knownRulesPerRuleset: 4, unknownRulesPerRuleset: 96, conditionVisitsPerRuleset: 2003, bypassVisitsPerRuleset: 400, ruleVisitsPerRuleset: 607, environmentEntries: 100, extraOwnKeys: 1},
    '11 + 3 + 301800 + 6 + 271200 + 2000 + 4 + 2000 + 4 + 2015003 + 1 = 2592032',
  );

function g9Record(preset, axis, expectedVisits, errors, stringUnits, formula) {
  return Object.freeze({
    group: 'G9',
    preset,
    axis,
    expectedVisits,
    counts: Object.freeze({errors, stringUnits}),
    formula,
  });
}

function validAxis(axis, argumentCount) {
  return argumentCount === 1 && (axis === 'errors' || axis === 'stringUnits');
}

function g9Canonical(axis) {
  if (!validAxis(axis, arguments.length)) {
    throw new TypeError('Unsupported governance fixture option.');
  }
  return axis === 'errors'
    ? g9Record('canonical', axis, 0, 0, 0, '0')
    : g9Record('canonical', axis, 1, 0, 1, '1 string unit');
}

function g9Max(axis) {
  if (!validAxis(axis, arguments.length)) {
    throw new TypeError('Unsupported governance fixture option.');
  }
  return axis === 'errors'
    ? g9Record('max', axis, 100, 100, 0, '100 errors')
    : g9Record('max', axis, 16777216, 0, 16777216, '16777216 string units');
}

function g9MaxPlusOne(axis) {
  if (!validAxis(axis, arguments.length)) {
    throw new TypeError('Unsupported governance fixture option.');
  }
  return axis === 'errors'
    ? g9Record('maxPlusOne', axis, 101, 101, 0, '101 errors')
    : g9Record('maxPlusOne', axis, 16777217, 0, 16777217, '16777217 string units');
}

Object.freeze(g9Canonical.prototype);
Object.freeze(g9Max.prototype);
Object.freeze(g9MaxPlusOne.prototype);

const G3 = Object.freeze({
  canonical: Object.freeze(g3Canonical),
  max: Object.freeze(g3Max),
  maxPlusOne: Object.freeze(g3MaxPlusOne),
});
const G4 = Object.freeze({
  canonical: Object.freeze(g4Canonical),
  max: Object.freeze(g4Max),
  maxPlusOne: Object.freeze(g4MaxPlusOne),
});
const G9 = Object.freeze({
  canonical: Object.freeze(g9Canonical),
  max: Object.freeze(g9Max),
  maxPlusOne: Object.freeze(g9MaxPlusOne),
});

module.exports = Object.freeze({G3, G4, G9});
