'use strict';

const parser = require('@babel/parser');
const {
  GOVERNANCE_FINDING_SCHEMA_VERSION,
  compareGovernanceFindings,
} = require('./github-governance-contract');

const CREDENTIAL_NAME_NAMESPACE = 'credential-name';

function buildFinding(args) {
  const finding = {
    schemaVersion: args.schemaVersion,
    kind: args.kind,
    code: args.code,
    severity: args.severity,
    scope: args.scope,
    subject: args.subject,
    message: args.message,
    remediation: args.remediation,
    path: args.path,
    location: args.location,
    evidence: args.evidence,
  };
  return Object.freeze(finding);
}

function analyzeExpressionForCredentials(node, credentialNameset) {
  if (!node || typeof node !== 'object') return null;

  if (node.type === 'MemberExpression') {
    if (node.object.type === 'MemberExpression' &&
        node.object.object.type === 'Identifier' &&
        node.object.object.name === 'process' &&
        node.object.property.type === 'Identifier' &&
        node.object.property.name === 'env') {
      if (node.computed && node.property.type === 'Literal' && typeof node.property.value === 'string') {
        const envName = node.property.value;
        if (credentialNameset.has(envName)) {
          return { names: [envName] };
        }
      } else if (!node.computed && node.property.type === 'Identifier') {
        const envName = node.property.name;
        if (credentialNameset.has(envName)) {
          return { names: [envName] };
        }
      }
    }

    return null;
  }

  if (node.type === 'TemplateLiteral') {
    for (const quasi of node.quasis || []) {
      const value = quasi.value.cooked || quasi.value.raw;
      if (value && typeof value === 'string') {
        for (const name of credentialNameset) {
          if (value.includes(name)) {
            return { names: [name] };
          }
        }
      }
    }
    for (const expr of node.expressions || []) {
      const result = analyzeExpressionForCredentials(expr, credentialNameset);
      if (result) return result;
    }
    return null;
  }

  return null;
}

function collectCleanupIdsFromBody(body) {
  const ids = new Set();
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression') {
      const callee = node.callee;
      if (callee.type === 'MemberExpression') {
        if (callee.object.type === 'Identifier' &&
            callee.object.name === 'fs' &&
            callee.property.type === 'Identifier' &&
            ['rmSync', 'unlinkSync', 'rm', 'unlink'].includes(callee.property.name)) {
          for (const arg of node.arguments || []) {
            if (arg.type === 'Identifier') {
              ids.add(arg.name);
            }
          }
        } else if (callee.object.type === 'MemberExpression' &&
                   callee.object.object.type === 'Identifier' &&
                   callee.object.object.name === 'fs' &&
                   callee.object.property.type === 'Identifier' &&
                   callee.object.property.name === 'promises' &&
                   callee.property.type === 'Identifier' &&
                   ['rm', 'unlink'].includes(callee.property.name)) {
          for (const arg of node.arguments || []) {
            if (arg.type === 'Identifier') {
              ids.add(arg.name);
            }
          }
        }
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'loc' || key === 'start' || key === 'end') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) visit(item);
      } else if (child && typeof child === 'object') {
        visit(child);
      }
    }
  }
  for (const stmt of (body || [])) {
    visit(stmt);
  }
  return ids;
}

function analyzeFileProgram(program, credentialNameset, filePath) {
  const findings = [];

  function visit(node, finallyBlock) {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'TryStatement') {
      const tryBlock = node.block;
      const finalizer = node.finalizer;
      const handler = node.handler;

      if (tryBlock) {
        visitBlock(tryBlock.body, finalizer);
      }

      if (handler && handler.body) {
        visitBlock(handler.body.body, null);
      }

      if (finalizer) {
        visitBlock(finalizer.body.body, null);
      }

      for (const consequent of (node.consequent || [])) {
        visit(consequent, finalizer);
      }
      return;
    }

    if (node.type === 'ExpressionStatement') {
      let expression = node.expression;
      if (expression.type === 'AwaitExpression') {
        expression = expression.argument;
      }
      if (expression.type === 'CallExpression') {
        analyzeWriteCall(expression, finallyBlock);
        return;
      }
    }

    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'loc' || key === 'start' || key === 'end') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) visit(item, finallyBlock);
      } else if (child && typeof child === 'object') {
        visit(child, finallyBlock);
      }
    }
  }

  function visitBlock(body, finallyBlock) {
    if (!body) return;
    for (const stmt of body) {
      visitStatement(stmt, finallyBlock);
    }
  }

  function visitStatement(stmt, finallyBlock) {
    if (!stmt || typeof stmt !== 'object') return;

    if (stmt.type === 'VariableDeclaration') {
      for (const decl of stmt.declarations || []) {
        visit(decl, finallyBlock);
      }
      return;
    }

    if (stmt.type === 'ExpressionStatement') {
      let expression = stmt.expression;
      if (expression.type === 'AwaitExpression') {
        expression = expression.argument;
      }
      if (expression.type === 'CallExpression') {
        analyzeWriteCall(expression, finallyBlock);
        return;
      }
    }

    visit(stmt, finallyBlock);
  }

  function analyzeWriteCall(node, finallyBlock) {
    if (node.type !== 'CallExpression') return;

    const callee = node.callee;
    let funcName = null;

    if (callee.type === 'MemberExpression') {
      if (callee.object.type === 'Identifier' && callee.object.name === 'fs' &&
          callee.property.type === 'Identifier') {
        if (callee.property.name === 'writeFileSync') {
          funcName = 'writeFileSync';
        } else if (callee.property.name === 'rmSync' || callee.property.name === 'unlinkSync') {
          funcName = callee.property.name;
        }
      } else if (callee.object.type === 'MemberExpression' &&
                 callee.object.object.type === 'Identifier' &&
                 callee.object.object.name === 'fs' &&
                 callee.object.property.type === 'Identifier' &&
                 callee.object.property.name === 'promises' &&
                 callee.property.type === 'Identifier') {
        funcName = callee.property.name;
      }
    }

    if (funcName !== 'writeFileSync' && funcName !== 'writeFile') return;

    const args = node.arguments;
    if (args.length < 2 || args[0].type !== 'Identifier') return;

    const destIdentifier = args[0].name;
    const destArg = args[0];
    const valueResult = analyzeExpressionForCredentials(args[1], credentialNameset);

    if (!valueResult) return;

    const expectedEvidence = Object.freeze(valueResult.names.map(name => ({ namespace: CREDENTIAL_NAME_NAMESPACE, name, state: 'present' })));
    const observedEvidence = Object.freeze([{ namespace: 'destination-binding', name: destIdentifier, state: 'present' }]);
    const relatedEvidence = Object.freeze(valueResult.names.map(name => ({ namespace: CREDENTIAL_NAME_NAMESPACE, name, state: 'present' })));

    if (!finallyBlock) {
      findings.push(buildFinding({
        schemaVersion: GOVERNANCE_FINDING_SCHEMA_VERSION,
        kind: 'scanner',
        code: 'CREDENTIAL_CLEANUP_UNPROVEN',
        severity: 'error',
        scope: 'workflow-file',
        subject: `${filePath}: ${destIdentifier}`,
        message: `A credential secret is materialized to a file without cleanup in the enclosing finally block.`,
        remediation: 'Add a matching fs.rmSync or fs.unlinkSync call in the finally block to clean up the credential file.',
        path: filePath,
        location: { line: destArg.loc.start.line, column: destArg.loc.start.column },
        evidence: {
          expected: Object.freeze(expectedEvidence),
          observed: Object.freeze(observedEvidence),
          related: Object.freeze(relatedEvidence),
        },
      }));
      return;
    }

    const cleanupIds = collectCleanupIdsFromBody(finallyBlock.body);
    if (cleanupIds.has(destIdentifier)) {
      return;
    }

    findings.push(buildFinding({
      schemaVersion: GOVERNANCE_FINDING_SCHEMA_VERSION,
      kind: 'scanner',
      code: 'CREDENTIAL_CLEANUP_UNPROVEN',
      severity: 'error',
      scope: 'workflow-file',
      subject: `${filePath}: ${destIdentifier}`,
      message: `A credential secret is materialized to a file without cleanup in the enclosing finally block.`,
      remediation: 'Add a matching fs.rmSync or fs.unlinkSync call in the finally block to clean up the credential file.',
      path: filePath,
      location: { line: destArg.loc.start.line, column: destArg.loc.start.column },
      evidence: {
        expected: Object.freeze(expectedEvidence),
        observed: Object.freeze(observedEvidence),
        related: Object.freeze(relatedEvidence),
      },
    }));
  }

  for (const node of program.body) {
    visit(node, null);
  }
  return findings;
}

function analyzeJavaScriptCredentialCleanup({ filePath, source, credentialNames }) {
  if (!credentialNames || !Array.isArray(credentialNames)) {
    return [];
  }

  const credentialNameset = new Set(credentialNames);

  let ast;
  try {
    ast = parser.parse(source, {
      sourceType: 'unambiguous',
      plugins: [],
    });
  } catch (error) {
    return [buildFinding({
      schemaVersion: GOVERNANCE_FINDING_SCHEMA_VERSION,
      kind: 'scanner',
      code: 'UNSUPPORTED_SOURCE_SYNTAX',
      severity: 'error',
      scope: 'workflow-file',
      subject: filePath,
      message: 'Source file could not be parsed.',
      remediation: 'Ensure the source file is valid JavaScript.',
      path: filePath,
      evidence: {
        expected: Object.freeze([]),
        observed: Object.freeze([]),
        related: Object.freeze([]),
      },
    })];
  }

  const program = ast.program;

  const findings = analyzeFileProgram(program, credentialNameset, filePath);

  findings.sort(compareGovernanceFindings);
  return Object.freeze(findings);
}

module.exports = {
  analyzeJavaScriptCredentialCleanup,
};
