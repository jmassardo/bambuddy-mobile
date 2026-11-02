const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { exclusion, loadExistingCatalogs } = require('./native-translation-inventory');
const root = path.resolve(__dirname, '../src');
const english = loadExistingCatalogs().en;
const aliases = new Map(Object.entries(english).map(([key, value]) => [value, key]));
let changed = 0;
function walk(node, fn) { fn(node); ts.forEachChild(node, child => walk(child, fn)); }
function directory(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['i18n', '__tests__', 'navigation'].includes(entry.name)) continue;
    const filename = path.join(dir, entry.name);
    if (entry.isDirectory()) { directory(filename); continue; }
    if (!/\.tsx?$/.test(filename) || entry.name === 'MoreScreen.tsx') continue;
    const source = fs.readFileSync(filename, 'utf8');
    const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
    const edits = [];
    const setters = new Set();
    const editable = new Set();
    const imports = new Set();
    walk(file, node => {
      if (ts.isJsxAttribute(node) && node.name.getText(file) === 'value' && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression && ts.isIdentifier(node.initializer.expression)) editable.add(node.initializer.expression.text);
    });
    function add(node, replacement) { edits.push({ start: node.getStart(file), end: node.end, replacement }); }
    function reactiveOptions(node) {
      let value = node.getText(file);
      const substitutions = [];
      walk(node, child => {
        if (ts.isCallExpression(child) && child.expression.getText(file) === 't') {
          substitutions.push({ start: child.expression.getStart(file) - node.getStart(file), end: child.expression.end - node.getStart(file) });
        }
      });
      for (const edit of substitutions.sort((a, b) => b.start - a.start)) value = value.slice(0, edit.start) + 'translateNative' + value.slice(edit.end);
      if (substitutions.length) imports.add('translateNative');
      return `() => (${value})`;
    }
    function message(node) {
      if (!node) return '';
      if (ts.isBinaryExpression(node) && ['||', '??'].includes(node.operatorToken.getText(file))) return `${node.left.getText(file)} ${node.operatorToken.getText(file)} ${message(node.right)}`;
      if (ts.isConditionalExpression(node)) return `${node.condition.getText(file)} ? ${message(node.whenTrue)} : ${message(node.whenFalse)}`;
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !exclusion(node.text) && aliases.has(node.text)) {
        imports.add('nativeMessage');
        return `nativeMessage(${JSON.stringify(aliases.get(node.text))})`;
      }
      if (ts.isCallExpression(node) && ['t', 'translateNative', 'nativeMessage', 'tr', 'label'].includes(node.expression.getText(file)) && node.arguments[0]) {
        const key = node.arguments[0];
        if (!ts.isStringLiteral(key) && node.expression.getText(file) !== 't' && node.expression.getText(file) !== 'translateNative') return node.getText(file);
        imports.add('nativeMessage');
        const options = node.arguments[1];
        if (options && (ts.isArrowFunction(options) || ts.isFunctionExpression(options))) return node.getText(file);
        const tail = node.arguments[2] ? `, ...${node.arguments[2].getText(file)}` : '';
        return `nativeMessage(${key.getText(file)}${options ? `, ${ts.isStringLiteral(options) ? `() => ({ defaultValue: ${options.getText(file)}${tail} })` : reactiveOptions(options)}` : ''})`;
      }
      return node.getText(file);
    }
    walk(file, node => {
      if (!ts.isVariableDeclaration(node) || !ts.isArrayBindingPattern(node.name) || !node.initializer || !ts.isCallExpression(node.initializer)) return;
      const call = node.initializer;
      if (!['useState', 'React.useState', 'useNativeMessageState'].includes(call.expression.getText(file))) return;
      const [value, setter] = node.name.elements;
      if (!value || !setter || !/error|message|feedback|warning|validation/i.test(value.getText(file))) return;
      if (editable.has(value.getText(file))) {
        if (call.expression.getText(file) === 'useNativeMessageState') throw new Error(`Editable data must not be a native message: ${filename}:${value.getText(file)}`);
        return;
      }
      const type = call.typeArguments?.[0]?.getText(file);
      if (type ? /[^stringnuldefi| \n]/.test(type) : !call.arguments[0] || !(ts.isStringLiteral(call.arguments[0]) || call.arguments[0].kind === ts.SyntaxKind.NullKeyword)) return;
      setters.add(setter.getText(file));
      if (call.expression.getText(file) !== 'useNativeMessageState') {
        add(call.expression, 'useNativeMessageState');
        imports.add('useNativeMessageState');
      }
      if (call.arguments[0]) {
        const replacement = message(call.arguments[0]);
        if (replacement !== call.arguments[0].getText(file)) add(call.arguments[0], replacement);
      }
    });
    walk(file, node => {
      if (!ts.isCallExpression(node) || !setters.has(node.expression.getText(file)) || !node.arguments[0]) return;
      const replacement = message(node.arguments[0]);
      if (replacement !== node.arguments[0].getText(file)) add(node.arguments[0], replacement);
    });
    if (!edits.length) continue;
    let result = source;
    for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
    if (imports.size) result = `import { ${[...imports].sort().join(', ')} } from '@/i18n';\n` + result;
    fs.writeFileSync(filename, result);
    changed += 1;
  }
}
directory(root);
console.log(`Made native message state locale-reactive in ${changed} files.`);
