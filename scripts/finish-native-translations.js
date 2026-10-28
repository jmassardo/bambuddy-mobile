const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { extractInventory } = require('./native-translation-inventory');
const root = path.resolve(__dirname, '..');
const inventory = extractInventory();
const files = new Map();
for (const entry of inventory.entries) for (const reference of entry.occurrences) {
  if (reference.reserved || !['indirect-app-prose', 'app-error', 'ui-label-tuple', 'finite-display-choice', 'helper-ui-argument', 'ui-object-label', 'ui-label-binding'].includes(reference.kind)) continue;
  const list = files.get(reference.file) ?? [];
  list.push({ ...reference, english: entry.english, key: entry.key });
  files.set(reference.file, list);
}
const reviewed = [];
let changed = 0;
function walk(node, callback) { callback(node); ts.forEachChild(node, child => walk(child, callback)); }
for (const [filename, candidates] of files) {
  const full = path.join(root, filename);
  const source = fs.readFileSync(full, 'utf8');
  const file = ts.createSourceFile(full, source, ts.ScriptTarget.Latest, true);
  const nodes = new Map();
  walk(file, node => { nodes.set(`${node.getStart(file)}:${node.end}`, node); });
  const edits = new Map();
  const imports = new Set();
  function add(node, replacement) { edits.set(`${node.getStart(file)}:${node.end}`, { start: node.getStart(file), end: node.end, replacement }); }
  for (const candidate of candidates) {
    const node = nodes.get(`${candidate.start}:${candidate.end}`);
    if (!node) continue;
    const parent = node.parent;
    if ((ts.isPropertyAssignment(parent) || ts.isGetAccessor(parent)) && parent.name === node) continue;
    const reason = value => reviewed.push({ file: filename, line: candidate.line, english: candidate.english, kind: candidate.kind, reason: value });
    if (candidate.kind === 'ui-label-tuple') {
      if (!ts.isArrayLiteralExpression(parent)) continue;
      add(parent, `nativeLabelTuple(${parent.getText(file)})`);
      imports.add('nativeLabelTuple');
      reason('Source-authored option tuple: lazy display getter; wire key/value unchanged.');
      continue;
    }
    if (filename === 'src/components/settings/settingsSearch.ts' || filename === 'src/utils/notificationProvider.ts' && candidate.kind !== 'app-error') {
      reason('Private source-authored label factories resolve English labels lazily; existing API/default/choice values remain unchanged.');
      continue;
    }
    if (ts.isCaseClause(parent) || ts.isLiteralTypeNode(parent) || ts.isImportDeclaration(parent)) {
      reason('Protocol/type/lookup discriminator, not rendered UI; preserve exactly.'); continue;
    }
    if (ts.isBinaryExpression(parent) && ['==', '===', '!=', '!=='].includes(parent.operatorToken.getText(file))) {
      reason('Comparison against source/server discriminator; preserve exactly.'); continue;
    }
    if (candidate.kind === 'finite-display-choice') {
      // Only label/text uses of the bound finite choice are translated; the array
      // itself remains wire values (filters, mutations and persisted settings).
      const property = parent.parent;
      const call = property?.parent;
      const callback = call && ts.isCallExpression(call) ? call.arguments[0] : null;
      const parameter = callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) ? callback.parameters[0]?.name.getText(file) : null;
      if (parameter) walk(callback.body, child => {
        if (!ts.isJsxExpression(child) || !child.expression || child.expression.getText(file) !== parameter) return;
        if (ts.isJsxAttribute(child.parent) && !/^(label|title|subtitle|description|accessibilityLabel)$/.test(child.parent.name.getText(file))) return;
        add(child.expression, `translateNative(${parameter})`); imports.add('translateNative');
      });
      reason('Finite app enum: only direct UI label uses translated; filter/API values untouched.'); continue;
    }
    if (ts.isCallExpression(parent)) {
      const name = parent.expression.getText(file);
      if (/^(?:tr|t|label|translateLabel)$/.test(name)) {
        reason('Explicit translation wrapper/default already covered by immutable resource English alias.'); continue;
      }
      if (name === 'field' || name === 'group') {
        reason('Private source-authored label factory translates lazily.'); continue;
      }
      if (/\.(?:includes|startsWith|endsWith|replace|match|test|split|indexOf|localeCompare)$/.test(name) ||
          /^(?:console\.|logger\.|log\.)/.test(name) || /(?:\.navigate|\.replace|\.request|\.post|\.put|\.patch)$/.test(name)) {
        reason('Comparison/parsing/navigation/request contract, not display text; preserve exactly.'); continue;
      }
    }
    if (candidate.kind === 'app-error' || filename.startsWith('src/api/')) {
      if (candidate.kind !== 'app-error' && !(filename === 'src/api/inventory.ts' && ['ui-object-label', 'ui-label-binding'].includes(candidate.kind))) { reason('API protocol/payload boundary; preserve exactly.'); continue; }
    }
    if (ts.isPropertyAssignment(parent)) {
      const name = parent.name.getText(file).replace(/^['"]|['"]$/g, '');
      if (['id', 'key', 'code', 'value', 'defaultValue', 'type', 'method', 'pattern', 'format', 'example'].includes(name)) {
        reason('Persistent/form/protocol example or discriminator, not a native label; preserve exactly.'); continue;
      }
      add(parent, `get ${parent.name.getText(file)}() { return translateNative(${JSON.stringify(candidate.key)}); }`);
      imports.add('translateNative'); reason('App-authored explanatory/diagnostic display property, resolved lazily.'); continue;
    }
    let functionScope = false;
    for (let ancestor = parent; ancestor; ancestor = ancestor.parent) {
      if (ts.isFunctionDeclaration(ancestor) || ts.isFunctionExpression(ancestor) || ts.isArrowFunction(ancestor)) functionScope = true;
    }
    if (!functionScope) { reason('Module-level non-UI constant; requires explicit consumer mapping rather than eager translation.'); continue; }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      add(node, `translateNative(${JSON.stringify(candidate.key)})`);
      imports.add('translateNative'); reason('Source-authored display/error fallback, evaluated in render/action scope.');
    } else reason('Nonliteral composition already handled by explicit UI/default template boundaries.');
  }
  if (edits.size) {
    let result = source;
    const selected = [...edits.values()].filter(edit => ![...edits.values()].some(other => other !== edit && other.start <= edit.start && other.end >= edit.end));
    for (const edit of selected.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
    result = `import { ${[...imports].sort().join(', ')} } from '@/i18n';\n` + result;
    if (process.argv.includes('--write')) fs.writeFileSync(full, result);
    changed += 1;
  }
}
const argument = process.argv.indexOf('--report');
if (argument >= 0) fs.writeFileSync(path.resolve(process.argv[argument + 1]), JSON.stringify({ changed, reviewed }, null, 2) + '\n');
console.log(JSON.stringify({ changed, reviewed: reviewed.length, write: process.argv.includes('--write') }));
