"use strict";
const policyModule = require("../../scripts/release/github-governance-validation-runtime-policy");
const {selectRootPolicy} = policyModule;
const {walkBoundedData} = require("../../scripts/release/github-governance-validation-walk");
const fixtures = require("../../test-support/release/github-governance-validation-fixtures");
const g = (prefix, fields) => fields.map(field => [...prefix, field]);
const f = prefix => [
  ...g(prefix, [
    "schemaVersion", "kind", "code", "severity", "scope", "subject",
    "message", "remediation", "path", "location", "evidence",
  ]),
  ...g([...prefix, "location"], ["line", "column"]),
  ...g([...prefix, "evidence"], ["expected", "observed", "related"]),
  ...g([...prefix, "evidence", "expected", "*"], ["namespace", "name", "state"]),
  ...g([...prefix, "evidence", "observed", "*"], ["namespace", "name", "state"]),
  ...g([...prefix, "evidence", "related", "*"], ["namespace", "name", "state"]),
];
const r = prefix => [
  ...g(prefix, ["id", "name", "enforcement", "target", "conditions", "bypassActors", "rules"]),
  ...g([...prefix, "conditions"], ["refName"]),
  ...g([...prefix, "conditions", "refName"], ["include", "exclude"]),
  ...g([...prefix, "bypassActors", "*"], ["actor_id", "actor_type", "bypass_mode"]),
  ...g([...prefix, "rules", "*"], ["type", "parameters"]),
  ...g([...prefix, "rules", "*", "parameters"], [
    "required_approving_review_count", "dismiss_stale_reviews_on_push",
    "require_last_push_approval", "required_review_thread_resolution",
    "require_code_owner_review", "required_status_checks",
    "strict_required_status_checks_policy",
  ]),
  ...g(
    [...prefix, "rules", "*", "parameters", "required_status_checks", "*"],
    ["context", "integration_id"],
  ),
];
const contractEnvironment = prefix => [
  ...g(prefix, [
    "name", "canAdminsBypass", "preventSelfReview", "reviewers",
    "deploymentBranchPolicy", "branchPolicies", "secretNames", "variableNames",
  ]),
  ...g([...prefix, "reviewers", "*"], ["type", "id", "login"]),
  ...g([...prefix, "deploymentBranchPolicy"], [
    "protectedBranches",
    "customBranchPolicies",
  ]),
  ...g([...prefix, "branchPolicies", "*"], ["name", "type"]),
];
const normalizedEnvironment = prefix => [
  ...g(prefix, [
    "id", "name", "canAdminsBypass", "preventSelfReview", "reviewers",
    "deploymentBranchPolicy", "branchPolicies", "secretNames", "variableNames",
  ]),
  ...g([...prefix, "reviewers", "*"], ["type", "login", "id"]),
  ...g([...prefix, "deploymentBranchPolicy"], [
    "protectedBranches",
    "customBranchPolicies",
  ]),
  ...g([...prefix, "branchPolicies", "*"], ["type", "name"]),
];
const c = (path, maxLength) => ({path, maxLength});
const environmentNames = [
  "release-query", "release-ios", "release-android",
  "production-ios", "production-android",
];
const contractPaths = [
  ...g([], [
    "contractVersion", "findingSchema", "normalizedStateSchema", "repository",
    "requiredChecks", "repositoryVariableNames", "allowedRepositoryDemoSecretNames",
    "releaseCredentialSecretNames", "copilotForbiddenSecretNames", "evidence",
    "actionsPolicy", "automationApp", "productionApproval", "rulesets", "environments",
  ]),
  ...g(["findingSchema"], ["id", "version"]),
  ...g(["normalizedStateSchema"], ["id", "version"]),
  ...g(["repository"], ["nameWithOwner", "defaultBranch", "allowMergeCommit"]),
  ...g(["evidence"], ["nameNamespaces", "identifierNamespaces", "stateValues"]),
  ...g(["actionsPolicy"], [
    "defaultWorkflowPermissions", "canApprovePullRequestReviews",
    "shaPinningRequired", "allowedActions", "allowMergeCommit",
  ]),
  ...g(["automationApp"], [
    "installationScope", "repository", "permissions", "personalTokenFallback",
    "administrationPermission", "approvalPermission",
  ]),
  ...g(["automationApp", "permissions"], ["metadata", "contents", "pullRequests"]),
  ...g(["productionApproval"], [
    "stateWithCurrentParticipants", "eligibleHumanPermissions",
    "minimumDistinctEligibleHumans", "reviewerMayInitiate", "eligibleTriggerAppIds",
  ]),
  ...g(["rulesets"], ["protect-dev", "protect-main"]),
];
for (const name of ["protect-dev", "protect-main"]) {
  contractPaths.push(
    ...g(["rulesets", name], ["name", "enforcement", "target", "conditions", "bypassActors", "rules"]),
    ...g(["rulesets", name, "conditions"], ["refName"]),
    ...g(["rulesets", name, "conditions", "refName"], ["include", "exclude"]),
    ...g(["rulesets", name, "rules", "*"], ["type", "parameters"]),
    ...g(["rulesets", name, "rules", "2", "parameters"], [
      "required_approving_review_count", "dismiss_stale_reviews_on_push",
      "require_last_push_approval", "required_review_thread_resolution",
      "require_code_owner_review",
    ]),
    ...g(["rulesets", name, "rules", "3", "parameters"], [
      "required_status_checks",
      "strict_required_status_checks_policy",
    ]),
    ...g(["rulesets", name, "rules", "3", "parameters", "required_status_checks", "*"], ["context", "integration_id"]),
  );
}
contractPaths.push(...g(["environments"], environmentNames));
for (const name of environmentNames) {
  contractPaths.push(...contractEnvironment(["environments", name]));
}

const contractCollections = [
  c(["requiredChecks"], 1000),
  c(["repositoryVariableNames"], 1000),
  c(["allowedRepositoryDemoSecretNames"], 1000),
  c(["releaseCredentialSecretNames"], 1000),
  c(["copilotForbiddenSecretNames"], 1000),
  c(["evidence", "nameNamespaces"], 1000),
  c(["evidence", "identifierNamespaces"], 1000),
  c(["evidence", "stateValues"], 1000),
  c(["productionApproval", "eligibleHumanPermissions"], 1000),
  c(["productionApproval", "eligibleTriggerAppIds"], 1000),
];
for (const name of ["protect-dev", "protect-main"]) {
  contractCollections.push(
    c(["rulesets", name, "conditions", "refName", "include"], 1000),
    c(["rulesets", name, "conditions", "refName", "exclude"], 1000),
    c(["rulesets", name, "bypassActors"], 100),
    c(["rulesets", name, "rules"], 100),
    c(["rulesets", name, "rules", "3", "parameters", "required_status_checks"], 100),
  );
}
for (const name of environmentNames) {
  contractCollections.push(
    c(["environments", name, "reviewers"], 100),
    c(["environments", name, "branchPolicies"], 100),
    c(["environments", name, "secretNames"], 1000),
    c(["environments", name, "variableNames"], 1000),
  );
}

const normalizedPaths = [
  ...g([], [
    "schemaVersion", "repository", "rulesets", "legacyBranchProtection",
    "environments", "repositorySecretNames", "repositoryVariableNames",
    "actions", "collaborators", "branches", "workflowScan",
  ]),
  ...g(["repository"], ["nameWithOwner", "defaultBranch", "allowMergeCommit"]),
  ...r(["rulesets", "*"]),
  ...g(["legacyBranchProtection"], ["dev", "main"]),
  ...g(["legacyBranchProtection", "dev"], ["exists", "protected"]),
  ...g(["legacyBranchProtection", "main"], ["exists", "protected"]),
  ...normalizedEnvironment(["environments", "*"]),
  ...g(["actions"], [
    "defaultWorkflowPermissions", "canApprovePullRequestReviews",
    "shaPinningRequired", "allowedActions",
  ]),
  ...g(["collaborators", "*"], ["login", "id", "permission"]),
  ...g(["branches"], ["dev", "main"]),
  ...g(["branches", "dev"], ["name"]),
  ...g(["branches", "main"], ["name"]),
  ...g(["workflowScan"], ["schemaVersion", "scannedFiles", "findings"]),
  ...f(["workflowScan", "findings", "*"]),
];

const expectedPolicies = [
  [311, 312, 623, contractPaths, contractCollections],
  [
    400, 401, 801, f([]),
    [
      c(["evidence", "expected"], 32),
      c(["evidence", "observed"], 32),
      c(["evidence", "related"], 32),
    ],
  ],
  [
    2015003, 2015004, 4030007,
    [...g([], ["schemaVersion", "scannedFiles", "findings"]), ...f(["findings", "*"])],
    [
      c(["scannedFiles"], 10000),
      c(["findings"], 5000),
      c(["findings", "*", "evidence", "expected"], 32),
      c(["findings", "*", "evidence", "observed"], 32),
      c(["findings", "*", "evidence", "related"], 32),
    ],
  ],
  [
    2592031, 2592032, 5184063, normalizedPaths,
    [
      c(["rulesets"], 100),
      c(["rulesets", "*", "conditions", "refName", "include"], 1000),
      c(["rulesets", "*", "conditions", "refName", "exclude"], 1000),
      c(["rulesets", "*", "bypassActors"], 100),
      c(["rulesets", "*", "rules"], 100),
      c(["rulesets", "*", "rules", "*", "parameters", "required_status_checks"], 100),
      c(["environments"], 100),
      c(["environments", "*", "reviewers"], 100),
      c(["environments", "*", "branchPolicies"], 100),
      c(["environments", "*", "secretNames"], 1000),
      c(["environments", "*", "variableNames"], 1000),
      c(["repositorySecretNames"], 1000),
      c(["repositoryVariableNames"], 1000),
      c(["collaborators"], 500),
      c(["workflowScan", "scannedFiles"], 10000),
      c(["workflowScan", "findings"], 5000),
      c(["workflowScan", "findings", "*", "evidence", "expected"], 32),
      c(["workflowScan", "findings", "*", "evidence", "observed"], 32),
      c(["workflowScan", "findings", "*", "evidence", "related"], 32),
    ],
  ],
];
describe("governance validation runtime policy", () => {
  test("exports only the frozen selector", () => {
    expect(Object.keys(policyModule)).toEqual(["selectRootPolicy"]);
    expect(Object.isFrozen(policyModule)).toBe(true);
    expect(Object.isFrozen(selectRootPolicy)).toBe(true);
  });

  test.each(expectedPolicies)(
    "selects exact recursively frozen policy for budget %i",
    (budget, maxEntries, maxDescriptorCalls, declaredPaths, collectionLimits) => {
      const policy = selectRootPolicy(budget);
      expect(policy).toEqual({
        policyVersion: 1,
        ownKeySlotBudget: budget,
        limits: {
          maxDepth: 32,
          maxEntries,
          maxStringCodeUnits: 16777216,
          maxOwnKeysCalls: maxEntries,
          maxDescriptorCalls,
          maxPrototypeCalls: maxEntries,
          maxDiagnostics: 100,
          declaredPaths,
          collectionLimits,
        },
      });
      expect(Object.keys(policy)).toEqual(["policyVersion", "ownKeySlotBudget", "limits"]);
      expect(Object.keys(policy.limits)).toEqual([
        "maxDepth",
        "maxEntries",
        "maxStringCodeUnits",
        "maxOwnKeysCalls",
        "maxDescriptorCalls",
        "maxPrototypeCalls",
        "maxDiagnostics",
        "declaredPaths",
        "collectionLimits",
      ]);
      const pending = [policy];
      while (pending.length > 0) {
        const value = pending.pop();
        expect(Object.isFrozen(value)).toBe(true);
        for (const child of Object.values(value))
          if (child !== null && typeof child === "object") pending.push(child);
      }
      expect(policy.limits.declaredPaths.flat().every(segment => typeof segment === "string")).toBe(true);
      policy.limits.collectionLimits.forEach((record, ordinal) => {
        expect(Object.keys(record)).toEqual(["path", "maxLength"]);
        expect(record).toEqual(collectionLimits[ordinal]);
        expect({maximum: record.maxLength, plusOne: record.maxLength + 1}).toEqual({
          maximum: collectionLimits[ordinal].maxLength,
          plusOne: collectionLimits[ordinal].maxLength + 1,
        });
        expect(record.path.every(segment => typeof segment === "string")).toBe(true);
      });
      expect(selectRootPolicy(budget)).toBe(policy);
    },
  );

  test("returns null for every unsupported value without touching it", () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("must not read");
        },
        getOwnPropertyDescriptor() {
          throw new Error("must not reflect");
        },
      },
    );
    for (const value of [
      undefined, null, false, "311", 310, 312, 2594433, 2592032,
      NaN, Infinity, 311n,
      Symbol("311"), hostile,
    ]) {
      expect(selectRootPolicy(value)).toBeNull();
    }
  });
  test("retains written order, string numeric segments, and immutable identity", () => {
    const contract = selectRootPolicy(311);
    expect(contract.limits.declaredPaths).toEqual(contractPaths);
    expect(contract.limits.declaredPaths).toContainEqual([
      "rulesets",
      "protect-dev",
      "rules",
      "2",
      "parameters",
      "require_code_owner_review",
    ]);
    expect(contract.limits.declaredPaths).toContainEqual([
      "rulesets",
      "protect-main",
      "rules",
      "3",
      "parameters",
      "required_status_checks",
    ]);
    expect(() => contract.limits.declaredPaths.push(["changed"])).toThrow();
    expect(selectRootPolicy(311).limits.declaredPaths).toBe(contract.limits.declaredPaths);
  });

  test("declares exact unique ordered paths for every root family", () => {
    for (const [budget, expectedPaths, expectedCount] of [
      [311, contractPaths, 166],
      [400, f([]), 25],
      [2015003, [...g([], ["schemaVersion", "scannedFiles", "findings"]), ...f(["findings", "*"])], 28],
      [2592031, normalizedPaths, 99],
    ]) {
      const paths = selectRootPolicy(budget).limits.declaredPaths;
      expect(paths).toEqual(expectedPaths);
      expect(paths).toHaveLength(expectedCount);
      expect(new Set(paths.map(path => JSON.stringify(path))).size).toBe(expectedCount);
    }
  });

  test("walks canonical contract and normalized fixtures with both evidence shapes", () => {
    const cases = [
      [311, fixtures.buildContract()],
      [400, fixtures.buildFinding({evidenceShape: "two-key"})],
      [400, fixtures.buildFinding({evidenceShape: "three-key"})],
      [2015003, fixtures.buildWorkflowScan()],
      [2592031, fixtures.buildNormalizedGovernanceState()],
    ];
    for (const [budget, fixture] of cases) {
      const output = walkBoundedData(fixture, selectRootPolicy(budget).limits);
      expect(output).toMatchObject({status: "ok", diagnostics: [], error: null});
    }
  });
});
