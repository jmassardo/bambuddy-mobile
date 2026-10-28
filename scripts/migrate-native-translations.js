/* Position-based, app-authored UI edits only. Review findings are never guessed. */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { extractInventory } = require('./native-translation-inventory');
const project = path.resolve(__dirname, '..');
const inventory = extractInventory();
const byFile = new Map();
for (const entry of inventory.entries) for (const occurrence of entry.occurrences) {
  if (occurrence.reserved || occurrence.kind === 'coordinated-source-addition') continue;
  const entries = byFile.get(occurrence.file) ?? [];
  entries.push({ ...occurrence, key: entry.key, english: entry.english });
  byFile.set(occurrence.file, entries);
}
const skipped = [];
const counts = { files: 0, literals: 0, templates: 0, getters: 0, subscriptions: 0, memoized: 0 };
const allowed = new Set([
  'jsx-text', 'jsx-attribute', 'jsx-attribute-expression', 'jsx-expression',
  'ui-object-label', 'ui-label-dictionary', 'ui-helper-return', 'ui-label-binding',
  'feedback-message', 'app-error-fallback', 'ui-default-prop', 'embedded-template-choice',
]);
function functionName(node, file) {
  if (node.name) return node.name.getText(file);
  let parent = node.parent;
  while (parent && (ts.isCallExpression(parent) || ts.isParenthesizedExpression(parent))) parent = parent.parent;
  return parent && ts.isVariableDeclaration(parent) ? parent.name.getText(file) : '';
}
function isFunction(node) {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node);
}
function walk(node, callback) {
  callback(node); ts.forEachChild(node, child => walk(child, callback));
}
for (const [filename, candidates] of byFile) {
  if (filename.startsWith('src/api/') || filename.startsWith('src/types/') || filename.startsWith('src/store/')) {
    candidates.forEach(candidate => skipped.push({ ...candidate, reason: 'API/schema/persistent-state boundary: review before touching wire or stored values.' }));
    continue;
  }
  const full = path.join(project, filename);
  const source = fs.readFileSync(full, 'utf8');
  const file = ts.createSourceFile(full, source, ts.ScriptTarget.Latest, true);
  const nodes = new Map();
  walk(file, node => { nodes.set(`${node.getStart(file)}:${node.end}`, node); });
  const edits = [];
  const imports = new Set();
  const consumed = new Set();
  const messageSetters = new Set();
  function add(start, end, value) {
    if (edits.some(edit => start < edit.end && end > edit.start)) return false;
    edits.push({ start, end, value }); return true;
  }
  function translate(candidate, descriptor = false) {
    const args = candidate.bindings?.length ? `, { ${candidate.bindings.map(binding => `${binding.name}: String(${binding.expression})`).join(', ')} }` : '';
    imports.add(descriptor ? 'nativeMessage' : 'translateNative');
    return `${descriptor ? 'nativeMessage' : 'translateNative'}(${JSON.stringify(candidate.key)}${args})`;
  }
  walk(file, node => {
    if (!ts.isVariableDeclaration(node) || !ts.isArrayBindingPattern(node.name) || !node.initializer || !ts.isCallExpression(node.initializer)) return;
    const call = node.initializer;
    if (!['useState', 'React.useState'].includes(call.expression.getText(file))) return;
    const [value, setter] = node.name.elements;
    if (!value || !setter || !/error|message|feedback|warning/i.test(value.getText(file))) return;
    const type = call.typeArguments?.[0]?.getText(file);
    if (type && /[^stringnuldefi| \n]/.test(type)) return;
    if (!candidates.some(candidate => {
      const target = nodes.get(`${candidate.start}:${candidate.end}`);
      return target && ts.isCallExpression(target.parent) && target.parent.expression.getText(file) === setter.getText(file);
    })) return;
    messageSetters.add(setter.getText(file));
    add(call.expression.getStart(file), call.expression.end, 'useNativeMessageState');
    imports.add('useNativeMessageState');
  });
  // Whole JSX templates preserve node-valued interpolations and allow word reordering.
  for (const candidate of candidates.filter(item => item.kind === 'jsx-compound-template')) {
    const node = nodes.get(`${candidate.start}:${candidate.end}`);
    if (!node || !ts.isJsxElement(node)) continue;
    let safe = true;
    for (const child of node.children) {
      if (ts.isJsxExpression(child) && child.expression) {
        walk(child.expression, descendant => {
          if (ts.isConditionalExpression(descendant) && [descendant.whenTrue, descendant.whenFalse].some(branch => ts.isStringLiteral(branch) && /[A-Za-z]/.test(branch.text))) safe = false;
        });
      }
    }
    if (!safe) continue;
    const values = candidate.bindings.map(binding => `${binding.name}: (${binding.expression})`).join(', ');
    if (add(candidate.childrenStart, candidate.childrenEnd, `<NativeTranslation id=${JSON.stringify(candidate.key)} values={{ ${values} }} />`)) {
      imports.add('NativeTranslation'); counts.templates += 1;
    }
  }
  for (const candidate of candidates) {
    const position = `${candidate.start}:${candidate.end}`;
    if (consumed.has(position)) continue;
    const node = nodes.get(position);
    if (!node) continue;
    if (!allowed.has(candidate.kind)) {
      if (!['translation-default', 'existing-translation-key', 'wrapped-translation-default', 'ui-entry-dictionary', 'jsx-compound-template'].includes(candidate.kind)) skipped.push({ ...candidate, reason: 'Explicit source review required; no broad literal or user-data substitution.' });
      continue;
    }
    if (candidate.kind === 'ui-helper-return' && /(?:parse|normalize|toApi|toServer|mime|extension|protocol|path|key|model)/i.test(candidate.helper ?? '')) {
      skipped.push({ ...candidate, reason: 'Helper may return protocol/state values rather than UI labels.' }); continue;
    }
    if (candidate.kind === 'ui-helper-return' && candidate.helper === 'plugPowerState') continue;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node) || ts.isBinaryExpression(node)) {
      const parent = node.parent;
      const descriptor = ts.isCallExpression(parent) && messageSetters.has(parent.expression.getText(file));
      const value = translate(candidate, descriptor);
      if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
        if (parent.getText(file).includes('defaultValue:')) continue;
        if (add(parent.getStart(file), parent.end, `get ${parent.name.getText(file)}() { return ${value}; }`)) counts.getters += 1;
      } else if (ts.isJsxAttribute(parent)) {
        if (add(candidate.start, candidate.end, `{${value}}`)) counts.literals += 1;
      } else {
        // Never translate module constants at import time: locale changes must be live.
        let insideFunction = false;
        for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) if (isFunction(ancestor)) insideFunction = true;
        if (!insideFunction) { skipped.push({ ...candidate, reason: 'Module-level scalar/tuple requires a reactive factory or explicit lazy accessor.' }); continue; }
        if (add(candidate.start, candidate.end, value)) counts.literals += 1;
      }
      consumed.add(position);
    } else if (ts.isJsxText(node)) {
      if (add(candidate.start, candidate.end, `{${translate(candidate)}}`)) counts.literals += 1;
      consumed.add(position);
    }
  }
  if (!edits.length && !source.includes('useTranslation') && !/format(?:Preferred|Currency|Date|Time|Cost)/.test(source)) continue;
  // Components subscribe before early returns, including parents producing formatted props.
  walk(file, node => {
    if (!isFunction(node) || !node.body) return;
    const name = functionName(node, file);
    if (!/^[A-Z]/.test(name)) return;
    if (node.body.getText(file).includes('useNativeLocale()')) return;
    let jsx = false;
    walk(node.body, child => { if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) jsx = true; });
    if (!jsx) return;
    if (ts.isBlock(node.body)) add(node.body.getStart(file) + 1, node.body.getStart(file) + 1, '\n  useNativeLocale();');
    else {
      add(node.body.getStart(file), node.body.getStart(file), '{ useNativeLocale(); return (');
      add(node.body.end, node.body.end, '); }');
    }
    imports.add('useNativeLocale'); counts.subscriptions += 1;
  });
  walk(file, node => {
    if (!ts.isCallExpression(node) || !['useMemo', 'React.useMemo'].includes(node.expression.getText(file))) return;
    add(node.expression.getStart(file), node.expression.end, 'useLocalizedMemo');
    imports.add('useLocalizedMemo'); counts.memoized += 1;
  });
  let result = source;
  for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end)) result = result.slice(0, edit.start) + edit.value + result.slice(edit.end);
  if (imports.has('useLocalizedMemo')) result = result.replace(/import\s*\{([^}]+)\}\s*from\s*(['"])react\2;/g, (match, names, quote) => {
    const kept = names.split(',').filter(name => name.trim() !== 'useMemo');
    return kept.some(name => name.trim()) ? `import {${kept.join(',')}} from ${quote}react${quote};` : '';
  }).replace(/import React,\s*\{([^}]+)\}\s*from\s*(['"])react\2;/g, (match, names, quote) => {
    const kept = names.split(',').filter(name => name.trim() !== 'useMemo');
    return kept.some(name => name.trim()) ? `import React, {${kept.join(',')}} from ${quote}react${quote};` : `import React from ${quote}react${quote};`;
  });
  if (imports.size) result = `import { ${[...imports].sort().join(', ')} } from '@/i18n';\n` + result;
  if (result !== source) {
    if (process.argv.includes('--write')) fs.writeFileSync(full, result);
    counts.files += 1;
  }
}
const report = { sourceCommit: inventory.sourceCommit, counts, review: inventory.review, skipped };
const reportArgument = process.argv.indexOf('--report');
if (reportArgument >= 0) fs.writeFileSync(path.resolve(process.argv[reportArgument + 1]), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ counts, review: inventory.review.length, skipped: skipped.length, write: process.argv.includes('--write') }, null, 2));
