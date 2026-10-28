const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { exclusion } = require('./native-translation-inventory');
const root = path.resolve(__dirname, '../src');
function walk(node, callback) { callback(node); ts.forEachChild(node, child => walk(child, callback)); }
function insideMenu(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isFunctionDeclaration(parent) && parent.name?.text === 'MenuItem') return true;
  }
  return false;
}
function directory(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['__tests__', 'i18n', 'navigation'].includes(entry.name)) continue;
    const filename = path.join(dir, entry.name);
    if (entry.isDirectory()) { directory(filename); continue; }
    if (!/\.tsx?$/.test(filename) || entry.name === 'MoreScreen.tsx') continue;
    let source = fs.readFileSync(filename, 'utf8');
    let file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
    const subscriptions = [];
    let needsSubscription = false;
    let needsStatus = false;
    let needsSuffix = false;
    let needsTranslation = false;
    function functionName(node) {
      if (node.name) return node.name.getText(file);
      let parent = node.parent;
      while (parent && (ts.isCallExpression(parent) || ts.isParenthesizedExpression(parent))) parent = parent.parent;
      return parent && ts.isVariableDeclaration(parent) ? parent.name.getText(file) : '';
    }
    walk(file, node => {
      if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(file) === 'NativeTranslation' && !node.attributes.properties.some(attr => ts.isJsxAttribute(attr) && attr.name.getText(file) === 'count')) {
        const values = node.attributes.properties.find(attr => ts.isJsxAttribute(attr) && attr.name.getText(file) === 'values');
        const counts = new Set();
        if (values) walk(values, child => {
          if (!ts.isCallExpression(child) || child.expression.getText(file) !== 'nativeEnglishSuffix' || !child.arguments[0] || !ts.isConditionalExpression(child.arguments[0])) return;
          const condition = child.arguments[0].condition;
          if (!ts.isBinaryExpression(condition)) return;
          const counter = condition.right.getText(file) === '1' ? condition.left : condition.left.getText(file) === '1' ? condition.right : null;
          if (!counter) return;
          let pure = true;
          walk(counter, expression => { if (ts.isCallExpression(expression)) pure = false; });
          if (pure) counts.add(counter.getText(file));
        });
        if (counts.size === 1) subscriptions.push({ start: node.tagName.end, end: node.tagName.end, replacement: ` count={${[...counts][0]}}` });
      }
      if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(file) === 'CameraChoices') {
        const attrs = node.attributes.properties;
        const options = attrs.find(attr => ts.isJsxAttribute(attr) && attr.name.getText(file) === 'options');
        if (options?.initializer && ts.isJsxExpression(options.initializer) && options.initializer.expression && ts.isArrayLiteralExpression(options.initializer.expression) && !attrs.some(attr => ts.isJsxAttribute(attr) && attr.name.getText(file) === 'optionLabel')) {
          subscriptions.push({ start: node.tagName.end, end: node.tagName.end, replacement: ' optionLabel={option => translateNative(String(option))}' });
          needsTranslation = true;
        }
      }
      if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
        if (!node.body || !/^[A-Z]/.test(functionName(node))) return;
        if (node.body.getText(file).includes('useNativeLocale()')) return;
        let jsx = false;
        walk(node.body, child => { if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) jsx = true; });
        if (!jsx) return;
        if (ts.isBlock(node.body)) subscriptions.push({ start: node.body.getStart(file) + 1, end: node.body.getStart(file) + 1, replacement: '\n  useNativeLocale();' });
        else {
          subscriptions.push({ start: node.body.getStart(file), end: node.body.getStart(file), replacement: '{ useNativeLocale(); return (' });
          subscriptions.push({ start: node.body.end, end: node.body.end, replacement: '); }' });
        }
        needsSubscription = true;
      }
      if (!ts.isJsxExpression(node) || !node.expression) return;
      if (ts.isJsxAttribute(node.parent) && !/^(?:label|title|subtitle|accessibilityLabel)$/.test(node.parent.name.getText(file))) return;
      if (!ts.isJsxAttribute(node.parent) && !ts.isJsxElement(node.parent) && !ts.isJsxFragment(node.parent)) return;
      const expression = node.expression;
      const status = ts.isIdentifier(expression) ? expression.text : ts.isPropertyAccessExpression(expression) ? expression.name.text : '';
      if (!/^(?:status|state|priority|role)$/.test(status)) return;
      subscriptions.push({ start: expression.getStart(file), end: expression.end, replacement: `localizedStatus(${expression.getText(file)})` });
      needsStatus = true;
    });
    walk(file, node => {
      if (ts.isCallExpression(node) && node.expression.getText(file) === 'translateNative' && node.arguments.length === 2) {
        const key = node.arguments[0];
        const options = node.arguments[1];
        if (ts.isStringLiteral(key) && key.text.startsWith('native.') && ts.isObjectLiteralExpression(options) && options.properties.length === 1) {
          const fallback = options.properties[0];
          if (ts.isPropertyAssignment(fallback) && fallback.name.getText(file) === 'defaultValue' && ts.isStringLiteral(fallback.initializer) && exclusion(fallback.initializer.text)) {
            subscriptions.push({ start: node.getStart(file), end: node.end, replacement: JSON.stringify(fallback.initializer.text) });
          }
        }
      }
      if (ts.isConditionalExpression(node)) {
        const branches = [node.whenTrue, node.whenFalse];
        if (branches.every(branch => ts.isStringLiteral(branch)) && branches.some(branch => /^s$|^es$/.test(branch.text)) && branches.some(branch => branch.text === '')) {
          if (ts.isCallExpression(node.parent) && node.parent.expression.getText(file) === 'nativeEnglishSuffix') return;
          subscriptions.push({ start: node.getStart(file), end: node.end, replacement: `nativeEnglishSuffix(${node.getText(file)})` });
          needsSuffix = true;
        }
      }
      if (!ts.isPropertyAssignment(node) || !/^(?:label|title|subtitle|message|description|hint|accessibilityLabel|confirmLabel|cancelLabel)$/.test(node.name.getText(file))) return;
      if (!ts.isCallExpression(node.initializer) || !['t', 'translateNative'].includes(node.initializer.expression.getText(file))) return;
      const args = node.initializer.arguments.map(argument => argument.getText(file)).join(', ');
      subscriptions.push({ start: node.getStart(file), end: node.end, replacement: `get ${node.name.getText(file)}() { return translateNative(${args}); }` });
      needsTranslation = true;
    });
    const selected = subscriptions.filter(edit => !subscriptions.some(other => other !== edit && other.start < other.end && other.start <= edit.start && other.end >= edit.end));
    for (const edit of selected.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.replacement + source.slice(edit.end);
    if (needsSubscription) source = `import { useNativeLocale } from '@/i18n';\n` + source;
    if (needsSuffix) source = `import { nativeEnglishSuffix } from '@/i18n';\n` + source;
    if (needsTranslation) source = `import { translateNative } from '@/i18n';\n` + source;
    if (needsStatus) source = `import { localizedStatus } from '@/utils/statusLabel';\n` + source;
    if (subscriptions.length) file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
    if (['AppUI.tsx', 'StateScreens.tsx'].includes(entry.name)) {
      const edits = [];
      walk(file, node => {
        if (insideMenu(node)) return;
        if (ts.isCallExpression(node) && node.expression.getText(file) === 'text' && node.arguments.length === 1) {
          edits.push({ start: node.getStart(file), end: node.end, replacement: node.arguments[0].getText(file) });
        }
        if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer?.getText(file) === 'useTranslation()' && node.name.elements.some(item => item.name.getText(file) === 'text')) {
          const names = node.name.elements.filter(item => item.name.getText(file) !== 'text').map(item => item.getText(file));
          if (names.length) edits.push({ start: node.name.getStart(file), end: node.name.end, replacement: `{ ${names.join(', ')} }` });
          else if (ts.isVariableDeclarationList(node.parent) && ts.isVariableStatement(node.parent.parent)) edits.push({ start: node.parent.parent.getStart(file), end: node.parent.parent.end, replacement: 'useTranslation();' });
        }
      });
      for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.replacement + source.slice(edit.end);
      file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
    }
    const declarations = file.statements.filter(node => ts.isImportDeclaration(node) && node.moduleSpecifier.text === '@/i18n');
    if (declarations.length > 1) {
      const names = new Map();
      for (const declaration of declarations) {
        const clause = declaration.importClause;
        if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) throw new Error('Review non-named localization import');
        for (const item of clause.namedBindings.elements) names.set(item.name.text, `${clause.isTypeOnly && !item.isTypeOnly ? 'type ' : ''}${item.getText(file)}`);
      }
      const changes = declarations.map((node, index) => ({ start: node.getStart(file), end: node.end, replacement: index ? '' : `import { ${[...names.values()].sort().join(', ')} } from '@/i18n';` }));
      for (const edit of changes.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.replacement + source.slice(edit.end);
    }
    source = source.replace(/\n{3,}/g, '\n\n');
    const quotes = [];
    const quotedFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
    walk(quotedFile, node => {
      if (!ts.isStringLiteral(node) || source[node.getStart(quotedFile)] !== '"' || ts.isJsxAttribute(node.parent)) return;
      const parent = node.parent;
      const key = ts.isCallExpression(parent) && parent.arguments[0] === node && ['t', 'translateNative', 'nativeMessage'].includes(parent.expression.getText(quotedFile));
      const fallback = ts.isPropertyAssignment(parent) && parent.name.getText(quotedFile) === 'defaultValue';
      if (key || fallback) quotes.push({ start: node.getStart(quotedFile), end: node.end, replacement: ts.createPrinter().printNode(ts.EmitHint.Expression, ts.factory.createStringLiteral(node.text, true), quotedFile) });
    });
    for (const edit of quotes.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.replacement + source.slice(edit.end);
    if (source !== fs.readFileSync(filename, 'utf8')) fs.writeFileSync(filename, source);
  }
}
directory(root);
