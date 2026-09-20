'use strict';

const {CONTRACT_VERSION, GOVERNANCE_FINDING_SCHEMA_ID, GOVERNANCE_FINDING_SCHEMA_VERSION, NORMALIZED_STATE_SCHEMA_ID, NORMALIZED_STATE_SCHEMA_VERSION, GOVERNANCE_CONTRACT, SCANNER_FINDING_CODES, POLICY_FINDING_CODES, compareGovernanceFindings} = require('../../scripts/release/github-governance-contract.js');
const {cloneWithDescriptors, snapshotGraph} = require('./github-governance-fixture-graph');
const {G1, G2, G3, G4, G5, G6, G7, G8, G9} = require('./github-governance-boundary-fixtures');

const BAD_OPTION = 'Unsupported governance fixture option.';
const hasOwn = Object.prototype.hasOwnProperty;
const CONTRACT_CASES = Object.freeze(['C-A01', 'C-A02', 'C-A03', 'C-A04', 'C-A05', 'C-A06', 'C-A07', 'C-A08', 'C-A09', 'C-A10', 'C-A11', 'C-A12', 'C-A13', 'C-A14', 'C-A15', 'C-A16', 'C-A17', 'C-A18', 'C-A19']);
const FINDING_CASES = Object.freeze(['F-A01', 'F-A02', 'F-A03']);
const WORKFLOW_CASES = Object.freeze(['W-A01', 'W-A02']);
const STATE_CASES = Object.freeze(['R-A01', 'R-A02', 'R-A03', 'R-A04', 'R-A05', 'R-A06', 'E-A01', 'E-A02', 'E-A03', 'E-A04', 'E-A05', 'N-A01', 'N-A02', 'N-A03']);
const VARIANTS = Object.freeze(['canonical', 'swap', 'duplicate', 'caseFoldCollision', 'inject']);
const BOUNDARIES = Object.freeze(['canonical', 'max', 'maxPlusOne']);
const GROUPS = Object.freeze(['ruleset', 'environment', 'normalized', 'repositoryPath']);
function fail() { throw new TypeError(BAD_OPTION); }
function dataRecord(argumentsLike, allowed) {
  if (argumentsLike.length === 0) return {};
  if (argumentsLike.length !== 1) fail();
  const input = argumentsLike[0];
  if (input === null || typeof input !== 'object') fail();
  let prototype; let keys;
  try {
    prototype = Object.getPrototypeOf(input);
    keys = Reflect.ownKeys(input);
  } catch { fail(); }
  if (prototype !== Object.prototype && prototype !== null) fail();
  const output = {};
  for (const key of keys) {
    if (typeof key !== 'string' || allowed.indexOf(key) === -1) fail();
    let descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(input, key); } catch { fail(); }
    if (!descriptor || !hasOwn.call(descriptor, 'value')) fail();
    output[key] = descriptor.value;
  }
  return output;
}
function pick(record, key, choices, fallback) {
  if (!hasOwn.call(record, key)) return fallback;
  return choices.indexOf(record[key]) === -1 ? fail() : record[key];
}
function options(argumentsLike, cases, type) {
  const keys = type === 'finding' ? Object.freeze(['arrayCase', 'variant', 'boundary', 'evidenceShape']) : type === 'state' ? Object.freeze(['arrayCase', 'variant', 'boundary', 'boundaryGroup']) : Object.freeze(['arrayCase', 'variant', 'boundary']);
  const record = dataRecord(argumentsLike, keys);
  const result = {
    arrayCase: hasOwn.call(record, 'arrayCase') ? pick(record, 'arrayCase', cases) : undefined,
    variant: pick(record, 'variant', VARIANTS, 'canonical'),
    boundary: pick(record, 'boundary', BOUNDARIES, 'canonical'),
    evidenceShape: type === 'finding' ? pick(record, 'evidenceShape', Object.freeze(['two-key', 'three-key']), 'three-key') : undefined,
    boundaryGroup: type === 'state' && hasOwn.call(record, 'boundaryGroup') ? pick(record, 'boundaryGroup', GROUPS) : undefined,
  };
  if (result.variant !== 'canonical' && result.arrayCase === undefined) fail();
  if (result.boundary !== 'canonical' && result.variant !== 'canonical') fail();
  if (type === 'state' && result.boundary !== 'canonical' && result.boundaryGroup === undefined) fail();
  if (type === 'state' && result.boundaryGroup !== undefined && result.variant !== 'canonical') fail();
  return result;
}
function fold(value) {
  if (typeof value !== 'string' || !/^[\x00-\x7F]*$/.test(value)) fail();
  const next = value === value.toLowerCase() ? value.toUpperCase() : value.toLowerCase();
  return next === value ? fail() : next;
}
function route(array, kind, identity, make, canFold) {
  return {array, kind, identity, make, canFold: canFold === true};
}
function fresh(value) {
  if (!value || typeof value !== 'object') return value;
  const output = Array.isArray(value) ? [] : {};
  for (const key of Object.keys(value)) output[key] = fresh(value[key]);
  return output;
}
function injected(kind) {
  switch (kind) {
    case 'string':
      return 'STRUCTURAL_FIXTURE_VALUE';
    case 'check':
      return {context: 'STRUCTURAL_FIXTURE_CONTEXT', integration_id: null};
    case 'rule':
      return {type: 'STRUCTURAL_FIXTURE_RULE', parameters: null};
    case 'actor': return {actor_id: 0, actor_type: 'STRUCTURAL_FIXTURE_ACTOR', bypass_mode: 'always'};
    case 'reviewer':
      return {type: 'User', login: 'STRUCTURAL_FIXTURE_LOGIN', id: 0};
    case 'policy':
      return {type: 'branch', name: 'STRUCTURAL_FIXTURE_BRANCH'};
    case 'collaborator':
      return {login: 'STRUCTURAL_FIXTURE_LOGIN', id: 0, permission: 'read'};
    case 'ruleset':
      return {id: 'STRUCTURAL_FIXTURE_RULESET', name: 'STRUCTURAL_FIXTURE_RULESET',
        enforcement: 'active', target: 'branch', conditions: {refName: {include: [], exclude: []}},
        bypassActors: [], rules: []};
    case 'environment':
      return {id: 'STRUCTURAL_FIXTURE_ENVIRONMENT', name: 'STRUCTURAL_FIXTURE_ENVIRONMENT',
        canAdminsBypass: false, preventSelfReview: false, reviewers: [], deploymentBranchPolicy:
        {protectedBranches: false, customBranchPolicies: true}, branchPolicies: [], secretNames: [], variableNames: []};
    default: fail();
  }
}
function mutate(routes, variant) {
  if (variant === 'canonical') return;
  for (const current of routes) {
    const {array, identity} = current;
    if ((variant === 'swap' && array.length < 2) ||
      (variant === 'duplicate' && array.length === 0) ||
      (variant === 'caseFoldCollision' && (!current.canFold || array.length === 0))) fail();
  }
  for (const current of routes) {
    const {array, identity, kind, make} = current;
    if (variant === 'swap') [array[0], array[1]] = [array[1], array[0]];
    if (variant === 'duplicate') array.push(cloneWithDescriptors(array[0]));
    if (variant === 'inject') array.push(make ? make() : injected(kind));
    if (variant === 'caseFoldCollision') {
      if (identity === 'value') array.push(fold(array[0]));
      else {
        const copy = cloneWithDescriptors(array[0]);
        copy[identity] = fold(copy[identity]);
        array.push(copy);
      }
    }
  }
}
function contractRoutes(contract, arrayCase) {
  const rulesets = Object.keys(contract.rulesets).map(key => contract.rulesets[key]);
  const environments = Object.keys(contract.environments).map(key => contract.environments[key]);
  const strings = (array, canFold = false) => route(array, 'string', 'value', undefined, canFold);
  switch (arrayCase) {
    case 'C-A01': return [strings(contract.requiredChecks, true)];
    case 'C-A02': return [strings(contract.repositoryVariableNames, true)];
    case 'C-A03': return [strings(contract.allowedRepositoryDemoSecretNames, true)];
    case 'C-A04': return [strings(contract.releaseCredentialSecretNames, true)];
    case 'C-A05': return [strings(contract.copilotForbiddenSecretNames, true)];
    case 'C-A06': return [strings(contract.evidence.nameNamespaces, true)];
    case 'C-A07': return [strings(contract.evidence.identifierNamespaces, true)];
    case 'C-A08': return [strings(contract.evidence.stateValues)];
    case 'C-A09': return [strings(contract.productionApproval.eligibleHumanPermissions)];
    case 'C-A10': return [strings(contract.productionApproval.eligibleTriggerAppIds)];
    case 'C-A11': return rulesets.map(item => strings(item.conditions.refName.include));
    case 'C-A12': return rulesets.map(item => strings(item.conditions.refName.exclude));
    case 'C-A13': return rulesets.map(item => route(item.bypassActors, 'actor', null));
    case 'C-A14': return rulesets.map(item => route(item.rules, 'rule', null));
    case 'C-A15': return rulesets.map(item => route(item.rules[3].parameters.required_status_checks, 'check', 'context', undefined, true));
    case 'C-A16': return environments.map(item => route(item.reviewers, 'reviewer', 'login', undefined, true));
    case 'C-A17': return environments.map(item => route(item.branchPolicies, 'policy', 'name', undefined, true));
    case 'C-A18': return environments.map(item => strings(item.secretNames, true));
    case 'C-A19': return environments.map(item => strings(item.variableNames, true));
    default: return [];
  }
}
function buildContract() {
  const setting = options(arguments, CONTRACT_CASES, 'contract');
  const fixture = G1[setting.boundary]();
  if (setting.arrayCase !== undefined) mutate(contractRoutes(fixture, setting.arrayCase), setting.variant);
  return fixture;
}
function standardFinding(evidenceShape) {
  const evidence = index => ({namespace: GOVERNANCE_CONTRACT.evidence.nameNamespaces[0],
    name: `fixture-${index}00000`, ...(evidenceShape === 'three-key' ? {state: GOVERNANCE_CONTRACT.evidence.stateValues[11]} : {})});
  return {
    schemaVersion: GOVERNANCE_FINDING_SCHEMA_VERSION, kind: 'scanner',
    code: SCANNER_FINDING_CODES[0], severity: 'error', scope: 'workflow',
    subject: 'fixture-subject', message: 'STRUCTURAL_FIXTURE_MESSAGE',
    remediation: 'STRUCTURAL_FIXTURE_REMEDIATION', path: '.github/workflows/fixture.yml', location: {line: 1, column: 1},
    evidence: {expected: [evidence(0)], observed: [evidence(1)], related: [evidence(2)]},
  };
}
function buildFinding() {
  const setting = options(arguments, FINDING_CASES, 'finding');
  const fixture = setting.boundary === 'canonical' ? standardFinding(setting.evidenceShape) :
    G2[setting.boundary](setting.evidenceShape);
  const evidence = fixture.evidence;
  const routes = {
    'F-A01': route(evidence.expected, 'evidence', 'name', () => ({
      namespace: 'action', name: 'STRUCTURAL_FIXTURE_NAME',
      ...(setting.evidenceShape === 'three-key' ? {state: 'present'} : {}),
    }), true),
    'F-A02': route(evidence.observed, 'evidence', 'name', () => ({
      namespace: 'action', name: 'STRUCTURAL_FIXTURE_NAME',
      ...(setting.evidenceShape === 'three-key' ? {state: 'present'} : {}),
    }), true),
    'F-A03': route(evidence.related, 'evidence', 'name', () => ({
      namespace: 'action', name: 'STRUCTURAL_FIXTURE_NAME',
      ...(setting.evidenceShape === 'three-key' ? {state: 'present'} : {}),
    }), true),
  };
  if (setting.arrayCase !== undefined) mutate([routes[setting.arrayCase]], setting.variant);
  return fixture;
}
function buildWorkflowScan() {
  const setting = options(arguments, WORKFLOW_CASES, 'workflow');
  if (setting.boundary !== 'canonical') fail();
  const fixture = {
    schemaVersion: CONTRACT_VERSION,
    scannedFiles: ['.github/workflows/fixture.yml'],
    findings: [standardFinding('three-key')],
  };
  const routes = {
    'W-A01': route(fixture.scannedFiles, 'string', null),
    'W-A02': route(fixture.findings, 'finding', null, () => {
      const finding = buildFinding();
      finding.subject = 'STRUCTURAL_FIXTURE_SUBJECT';
      return finding;
    }),
  };
  if (setting.arrayCase !== undefined) mutate([routes[setting.arrayCase]], setting.variant);
  return fixture;
}

function normalizedRuleset(id, source) {
  return {id, name: source.name, enforcement: source.enforcement, target: source.target,
    conditions: source.conditions, bypassActors: source.bypassActors, rules: source.rules};
}

function normalizedEnvironment(id, source) {
  return {
    id, name: source.name, canAdminsBypass: source.canAdminsBypass,
    preventSelfReview: source.preventSelfReview,
    reviewers: source.reviewers.map(reviewer => ({type: reviewer.type, login: reviewer.login, id: reviewer.id})),
    deploymentBranchPolicy: source.deploymentBranchPolicy,
    branchPolicies: source.branchPolicies.map(policy => ({type: policy.type, name: policy.name})), secretNames: source.secretNames,
    variableNames: source.variableNames,
  };
}

function buildNormalizedGovernanceState() {
  const setting = options(arguments, STATE_CASES, 'state');
  if (setting.boundaryGroup !== undefined && setting.boundaryGroup !== 'repositoryPath') fail();
  const contract = fresh(GOVERNANCE_CONTRACT);
  const rulesets = Object.keys(contract.rulesets).map(key => normalizedRuleset(
    key, contract.rulesets[key],
  ));
  const environments = Object.keys(contract.environments).map(key => normalizedEnvironment(
    key, contract.environments[key],
  ));
  const reviewer = environments[3].reviewers[0];
  const fixture = {
    schemaVersion: NORMALIZED_STATE_SCHEMA_VERSION,
    repository: contract.repository,
    rulesets,
    legacyBranchProtection: null,
    environments,
    repositorySecretNames: contract.copilotForbiddenSecretNames,
    repositoryVariableNames: contract.repositoryVariableNames,
    actions: {
      defaultWorkflowPermissions: contract.actionsPolicy.defaultWorkflowPermissions,
      canApprovePullRequestReviews: contract.actionsPolicy.canApprovePullRequestReviews,
      shaPinningRequired: contract.actionsPolicy.shaPinningRequired,
      allowedActions: contract.actionsPolicy.allowedActions,
    },
    collaborators: [{login: reviewer.login, id: reviewer.id, permission: 'admin'}],
    branches: {dev: {name: 'dev'}, main: {name: 'main'}},
    workflowScan: buildWorkflowScan(),
  };
  const routes = {
    'R-A01': route(rulesets, 'ruleset', 'name'),
    'R-A02': rulesets.map(item => route(item.conditions.refName.include, 'string', 'value')),
    'R-A03': rulesets.map(item => route(item.conditions.refName.exclude, 'string', 'value')),
    'R-A04': rulesets.map(item => route(item.bypassActors, 'actor', null)),
    'R-A05': rulesets.map(item => route(item.rules, 'rule', null)),
    'R-A06': rulesets.map(item => route(item.rules[3].parameters.required_status_checks, 'check', 'context', undefined, true)),
    'E-A01': route(environments, 'environment', 'name', undefined, true),
    'E-A02': environments.map(item => route(item.reviewers, 'reviewer', 'login', undefined, true)),
    'E-A03': environments.map(item => route(item.branchPolicies, 'policy', 'name', undefined, true)),
    'E-A04': environments.map(item => route(item.secretNames, 'string', 'value', undefined, true)),
    'E-A05': environments.map(item => route(item.variableNames, 'string', 'value', undefined, true)),
    'N-A01': route(fixture.repositorySecretNames, 'string', 'value', undefined, true),
    'N-A02': route(fixture.repositoryVariableNames, 'string', 'value', undefined, true),
    'N-A03': route(fixture.collaborators, 'collaborator', 'login', undefined, true),
  };
  if (setting.arrayCase !== undefined) mutate(Array.isArray(routes[setting.arrayCase]) ? routes[setting.arrayCase] : [routes[setting.arrayCase]], setting.variant);
  if (setting.boundaryGroup === 'repositoryPath') fixture.workflowScan.scannedFiles[0] = G5[setting.boundary]('utf16').path;
  return fixture;
}

module.exports = Object.freeze({
  buildContract: Object.freeze(buildContract),
  buildFinding: Object.freeze(buildFinding),
  buildWorkflowScan: Object.freeze(buildWorkflowScan),
  buildNormalizedGovernanceState: Object.freeze(buildNormalizedGovernanceState),
  cloneWithDescriptors,
  snapshotGraph,
});
