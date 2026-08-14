"use strict";

const WALK_POLICY_VERSION = 1;

const {DECLARED_PATH_GROUPS, COLLECTION_LIMIT_ROWS, ROOT_POLICIES} = (() => {
  const path = (...segments) => Object.freeze(segments);
  const group = (prefix, fields) =>
    Object.freeze([path(...prefix), Object.freeze(fields)]);
  const groups = (...values) => Object.freeze(values);
  const expand = values =>
    Object.freeze(
      values.flatMap(([prefix, fields]) =>
        fields.map(field => path(...prefix, field)),
      ),
    );
  const row = (segments, maxLength) =>
    Object.freeze({path: path(...segments), maxLength});
  const rows = (...values) => Object.freeze(values);

  const finding = prefix =>
    groups(
      group(prefix, [
        "schemaVersion",
        "kind",
        "code",
        "severity",
        "scope",
        "subject",
        "message",
        "remediation",
        "path",
        "location",
        "evidence",
      ]),
      group([...prefix, "location"], ["line", "column"]),
      group([...prefix, "evidence"], ["expected", "observed", "related"]),
      group([...prefix, "evidence", "expected", "*"], ["type", "namespace", "value"]),
      group([...prefix, "evidence", "observed", "*"], ["type", "namespace", "value"]),
      group([...prefix, "evidence", "related", "*"], ["type", "namespace", "value"]),
    );
  const ruleset = prefix =>
    groups(
      group(prefix, [
        "id",
        "name",
        "enforcement",
        "target",
        "conditions",
        "bypassActors",
        "rules",
      ]),
      group([...prefix, "conditions"], ["refName"]),
      group([...prefix, "conditions", "refName"], ["include", "exclude"]),
      group([...prefix, "bypassActors", "*"], ["actorId", "actorType", "bypassMode"]),
      group([...prefix, "rules", "*"], ["type", "parameters"]),
      group([...prefix, "rules", "*", "parameters"], [
        "required_approving_review_count",
        "dismiss_stale_reviews_on_push",
        "require_last_push_approval",
        "required_review_thread_resolution",
        "require_code_owner_review",
        "required_status_checks",
        "strict_required_status_checks_policy",
      ]),
      group(
        [
          ...prefix,
          "rules",
          "*",
          "parameters",
          "required_status_checks",
          "*",
        ],
        ["context", "integration_id"],
      ),
    );
  const environment = prefix =>
    groups(
      group(prefix, [
        "name",
        "canAdminsBypass",
        "preventSelfReview",
        "reviewers",
        "deploymentBranchPolicy",
        "branchPolicies",
        "secretNames",
        "variableNames",
      ]),
      group([...prefix, "reviewers", "*"], ["type", "id", "login"]),
      group([...prefix, "deploymentBranchPolicy"], [
        "protectedBranches",
        "customBranchPolicies",
      ]),
      group([...prefix, "branchPolicies", "*"], ["name", "type"]),
    );

  const contractGroups = [
    group([], [
      "contractVersion",
      "findingSchema",
      "normalizedStateSchema",
      "repository",
      "requiredChecks",
      "repositoryVariableNames",
      "allowedRepositoryDemoSecretNames",
      "releaseCredentialSecretNames",
      "copilotForbiddenSecretNames",
      "evidence",
      "actionsPolicy",
      "automationApp",
      "productionApproval",
      "rulesets",
      "environments",
    ]),
    group(["findingSchema"], ["id", "version"]),
    group(["normalizedStateSchema"], ["id", "version"]),
    group(["repository"], ["nameWithOwner", "defaultBranch", "allowMergeCommit"]),
    group(["evidence"], [
      "nameNamespaces",
      "identifierNamespaces",
      "stateValues",
    ]),
    group(["actionsPolicy"], [
      "defaultWorkflowPermissions",
      "canApprovePullRequestReviews",
      "shaPinningRequired",
      "allowedActions",
      "allowMergeCommit",
    ]),
    group(["automationApp"], [
      "installationScope",
      "repository",
      "permissions",
      "personalTokenFallback",
      "administrationPermission",
      "approvalPermission",
    ]),
    group(["automationApp", "permissions"], [
      "metadata",
      "contents",
      "pullRequests",
    ]),
    group(["productionApproval"], [
      "stateWithCurrentParticipants",
      "eligibleHumanPermissions",
      "minimumDistinctEligibleHumans",
      "reviewerMayInitiate",
      "eligibleTriggerAppIds",
    ]),
    group(["rulesets"], ["protect-dev", "protect-main"]),
  ];
  for (const name of ["protect-dev", "protect-main"]) {
    contractGroups.push(
      group(["rulesets", name], [
        "name",
        "enforcement",
        "target",
        "conditions",
        "bypassActors",
        "rules",
      ]),
      group(["rulesets", name, "conditions"], ["refName"]),
      group(["rulesets", name, "conditions", "refName"], [
        "include",
        "exclude",
      ]),
      group(["rulesets", name, "rules", "*"], ["type", "parameters"]),
      group(["rulesets", name, "rules", "2", "parameters"], [
        "required_approving_review_count",
        "dismiss_stale_reviews_on_push",
        "require_last_push_approval",
        "required_review_thread_resolution",
        "require_code_owner_review",
      ]),
      group(["rulesets", name, "rules", "3", "parameters"], [
        "required_status_checks",
        "strict_required_status_checks_policy",
      ]),
      group(
        [
          "rulesets",
          name,
          "rules",
          "3",
          "parameters",
          "required_status_checks",
          "*",
        ],
        ["context", "integration_id"],
      ),
    );
  }
  const environmentNames = [
    "release-query", "release-ios", "release-android",
    "production-ios", "production-android",
  ];
  contractGroups.push(group(["environments"], environmentNames));
  for (const name of environmentNames) {
    contractGroups.push(...environment(["environments", name]));
  }

  const normalizedGroups = [
    group([], [
      "schemaVersion",
      "repository",
      "rulesets",
      "legacyBranchProtection",
      "environments",
      "repositorySecretNames",
      "repositoryVariableNames",
      "actions",
      "collaborators",
      "branches",
      "workflowScan",
    ]),
    group(["repository"], ["nameWithOwner", "defaultBranch", "allowMergeCommit"]),
    ...ruleset(["rulesets", "*"]),
    group(["legacyBranchProtection"], ["dev", "main"]),
    group(["legacyBranchProtection", "dev"], ["exists", "protected"]),
    group(["legacyBranchProtection", "main"], ["exists", "protected"]),
    ...environment(["environments", "*"]),
    group(["actions"], [
      "defaultWorkflowPermissions",
      "canApprovePullRequestReviews",
      "shaPinningRequired",
      "allowedActions",
    ]),
    group(["collaborators", "*"], ["id", "login", "permissions"]),
    group(["collaborators", "*", "permissions"], [
      "admin",
      "maintain",
      "push",
      "triage",
      "pull",
    ]),
    group(["branches"], ["dev", "main"]),
    group(["branches", "dev"], ["name", "protected"]),
    group(["branches", "main"], ["name", "protected"]),
    group(["workflowScan"], ["schemaVersion", "scannedFiles", "findings"]),
    ...finding(["workflowScan", "findings", "*"]),
  ];

  const declaredPathGroups = Object.freeze({
    contract: groups(...contractGroups),
    finding: finding([]),
    workflow: groups(
      group([], ["schemaVersion", "scannedFiles", "findings"]),
      ...finding(["findings", "*"]),
    ),
    normalized: groups(...normalizedGroups),
  });

  const contractRows = [
    row(["requiredChecks"], 1000),
    row(["repositoryVariableNames"], 1000),
    row(["allowedRepositoryDemoSecretNames"], 1000),
    row(["releaseCredentialSecretNames"], 1000),
    row(["copilotForbiddenSecretNames"], 1000),
    row(["evidence", "nameNamespaces"], 1000),
    row(["evidence", "identifierNamespaces"], 1000),
    row(["evidence", "stateValues"], 1000),
    row(["productionApproval", "eligibleHumanPermissions"], 1000),
    row(["productionApproval", "eligibleTriggerAppIds"], 1000),
  ];
  for (const name of ["protect-dev", "protect-main"]) {
    contractRows.push(
      row(["rulesets", name, "conditions", "refName", "include"], 1000),
      row(["rulesets", name, "conditions", "refName", "exclude"], 1000),
      row(["rulesets", name, "bypassActors"], 100),
      row(["rulesets", name, "rules"], 100),
      row(
        [
          "rulesets",
          name,
          "rules",
          "3",
          "parameters",
          "required_status_checks",
        ],
        100,
      ),
    );
  }
  for (const name of environmentNames) {
    contractRows.push(
      row(["environments", name, "reviewers"], 100),
      row(["environments", name, "branchPolicies"], 100),
      row(["environments", name, "secretNames"], 1000),
      row(["environments", name, "variableNames"], 1000),
    );
  }

  const collectionLimitRows = Object.freeze({
    contract: rows(...contractRows),
    finding: rows(
      row(["evidence", "expected"], 32),
      row(["evidence", "observed"], 32),
      row(["evidence", "related"], 32),
    ),
    workflow: rows(
      row(["scannedFiles"], 10000),
      row(["findings"], 5000),
      row(["findings", "*", "evidence", "expected"], 32),
      row(["findings", "*", "evidence", "observed"], 32),
      row(["findings", "*", "evidence", "related"], 32),
    ),
    normalized: rows(
      row(["rulesets"], 100),
      row(["rulesets", "*", "conditions", "refName", "include"], 1000),
      row(["rulesets", "*", "conditions", "refName", "exclude"], 1000),
      row(["rulesets", "*", "bypassActors"], 100),
      row(["rulesets", "*", "rules"], 100),
      row(
        [
          "rulesets",
          "*",
          "rules",
          "*",
          "parameters",
          "required_status_checks",
        ],
        100,
      ),
      row(["environments"], 100),
      row(["environments", "*", "reviewers"], 100),
      row(["environments", "*", "branchPolicies"], 100),
      row(["environments", "*", "secretNames"], 1000),
      row(["environments", "*", "variableNames"], 1000),
      row(["repositorySecretNames"], 1000),
      row(["repositoryVariableNames"], 1000),
      row(["collaborators"], 500),
      row(["workflowScan", "scannedFiles"], 10000),
      row(["workflowScan", "findings"], 5000),
      row(["workflowScan", "findings", "*", "evidence", "expected"], 32),
      row(["workflowScan", "findings", "*", "evidence", "observed"], 32),
      row(["workflowScan", "findings", "*", "evidence", "related"], 32),
    ),
  });

  const policy = (ownKeySlotBudget, name) => {
    const maxEntries = ownKeySlotBudget + 1;
    return Object.freeze({
      policyVersion: WALK_POLICY_VERSION,
      ownKeySlotBudget,
      limits: Object.freeze({
        maxDepth: 32,
        maxEntries,
        maxStringCodeUnits: 16777216,
        maxOwnKeysCalls: maxEntries,
        maxDescriptorCalls: 2 * maxEntries - 1,
        maxPrototypeCalls: maxEntries,
        maxDiagnostics: 100,
        declaredPaths: expand(declaredPathGroups[name]),
        collectionLimits: collectionLimitRows[name],
      }),
    });
  };

  return Object.freeze({
    DECLARED_PATH_GROUPS: declaredPathGroups,
    COLLECTION_LIMIT_ROWS: collectionLimitRows,
    ROOT_POLICIES: Object.freeze({
      contract: policy(311, "contract"),
      finding: policy(400, "finding"),
      workflow: policy(2015003, "workflow"),
      normalized: policy(2594433, "normalized"),
    }),
  });
})();

function selectRootPolicy(ownKeySlotBudget) {
  switch (ownKeySlotBudget) {
    case 311:
      return ROOT_POLICIES.contract;
    case 400:
      return ROOT_POLICIES.finding;
    case 2015003:
      return ROOT_POLICIES.workflow;
    case 2594433:
      return ROOT_POLICIES.normalized;
    default:
      return null;
  }
}

Object.freeze(selectRootPolicy);
module.exports = Object.freeze(
  (DECLARED_PATH_GROUPS, COLLECTION_LIMIT_ROWS, {selectRootPolicy}),
);
