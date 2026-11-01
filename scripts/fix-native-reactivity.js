const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { loadExistingCatalogs } = require('./native-translation-inventory');
const root = path.resolve(__dirname, '../src');
const aliases = new Map(Object.entries(loadExistingCatalogs().en).map(([key, value]) => [value, key]));
function walk(node, visit) { visit(node); ts.forEachChild(node, child => walk(child, visit)); }
function directory(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['__tests__', 'i18n', 'navigation'].includes(entry.name)) continue;
    const filename = path.join(dir, entry.name);
    if (entry.isDirectory()) { directory(filename); continue; }
    if (!/\.tsx?$/.test(filename) || entry.name === 'MoreScreen.tsx') continue;
    const source = fs.readFileSync(filename, 'utf8');
    const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
    const edits = [];
    const localeOwners = new Set();
    let needsMessage = false;
    const add = (node, replacement) => edits.push({ start: node.getStart(file), end: node.end, replacement });
    function options(node) {
      let text = node.getText(file);
      const substitutions = [];
      walk(node, child => {
        if (ts.isCallExpression(child) && child.expression.getText(file) === 't') substitutions.push(child.expression);
      });
      for (const child of substitutions.sort((a, b) => b.pos - a.pos)) text = text.slice(0, child.getStart(file) - node.getStart(file)) + 'translateNative' + text.slice(child.end - node.getStart(file));
      return `() => (${text})`;
    }
    function descriptor(node) {
      if (ts.isConditionalExpression(node)) return `${node.condition.getText(file)} ? ${descriptor(node.whenTrue)} : ${descriptor(node.whenFalse)}`;
      if (ts.isBinaryExpression(node) && ['||', '??'].includes(node.operatorToken.getText(file))) return `${node.left.getText(file)} ${node.operatorToken.getText(file)} ${descriptor(node.right)}`;
      if (ts.isStringLiteral(node) && aliases.has(node.text)) {
        needsMessage = true;
        return `nativeMessage(${JSON.stringify(aliases.get(node.text))})`;
      }
      if (!ts.isCallExpression(node)) return node.getText(file);
      const name = node.expression.getText(file);
      if (name === 'getErrorMessage' && node.arguments[1]) return `${name}(${node.arguments[0].getText(file)}, ${descriptor(node.arguments[1])})`;
      if (name === 'pickString' && node.arguments[2]) return `${name}(${node.arguments[0].getText(file)}, ${node.arguments[1].getText(file)}, ${descriptor(node.arguments[2])})`;
      if (['t', 'translateNative'].includes(name)) {
        needsMessage = true;
        return `nativeMessage(${node.arguments[0].getText(file)}${node.arguments[1] ? `, ${options(node.arguments[1])}` : ''})`;
      }
      if (['tr', 'label', 'text'].includes(name)) {
        if (node.arguments[0] && ts.isConditionalExpression(node.arguments[0]) && node.arguments[0].getText(file).includes('translateNative(')) return descriptor(node.arguments[0]);
        const english = [node.arguments[1], node.arguments[0]].find(argument => argument && ts.isStringLiteral(argument) && aliases.has(argument.text));
        if (english) {
          needsMessage = true;
          return `nativeMessage(${JSON.stringify(aliases.get(english.text))})`;
        }
      }
      return node.getText(file);
    }
    walk(file, node => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === 'getErrorMessage' && !node.typeParameters) {
        const fallback = node.parameters.find(parameter => parameter.name.getText(file) === 'fallback');
        if (fallback?.type?.kind === ts.SyntaxKind.StringKeyword) {
          edits.push({ start: node.name.end, end: node.name.end, replacement: "<T extends string | import('@/i18n').NativeMessage>" });
          add(fallback.type, 'T');
        }
      }
      if (!ts.isCallExpression(node)) return;
      if (/(?:^|\.)showToast$/.test(node.expression.getText(file)) && node.arguments[0]) {
        const replacement = descriptor(node.arguments[0]);
        if (replacement !== node.arguments[0].getText(file)) add(node.arguments[0], replacement);
      }
      if (!node.expression.getText(file).endsWith('.setOptions') || !ts.isObjectLiteralExpression(node.arguments[0])) return;
      const title = node.arguments[0].properties.find(property => property.name?.getText(file) === 'title');
      if (!title || !title.getText(file).includes('translateNative(')) return;
      let effect = node.parent;
      while (effect && !(ts.isCallExpression(effect) && /use(?:Layout)?Effect$/.test(effect.expression.getText(file)))) effect = effect.parent;
      if (!effect || !ts.isArrayLiteralExpression(effect.arguments[1])) throw Error(`Unreviewed title effect: ${filename}`);
      if (ts.isGetAccessor(title)) {
        const statement = title.body.statements.find(ts.isReturnStatement);
        add(title, `title: ${statement.expression.getText(file)}`);
      }
      if (effect.arguments[1].elements.some(element => element.getText(file) === 'titleLocale')) return;
      let owner = effect.parent;
      while (owner && !(ts.isFunctionDeclaration(owner) || ts.isFunctionExpression(owner) || ts.isArrowFunction(owner))) owner = owner.parent;
      if (!owner || !ts.isBlock(owner.body)) throw Error(`Unreviewed title owner: ${filename}`);
      if (!localeOwners.has(owner)) {
        const subscription = owner.body.statements.find(statement => ts.isExpressionStatement(statement) && statement.expression.getText(file) === 'useNativeLocale()');
        if (!subscription) throw Error(`Missing locale subscription: ${filename}`);
        add(subscription, 'const titleLocale = useNativeLocale();');
        localeOwners.add(owner);
      }
      add(effect.arguments[1], `[${effect.arguments[1].elements.map(element => element.getText(file)).join(', ')}, titleLocale]`);
    });
    if (!edits.length) continue;
    let output = source;
    for (const edit of edits.sort((a, b) => b.start - a.start)) output = output.slice(0, edit.start) + edit.replacement + output.slice(edit.end);
    if (needsMessage) output = `import { nativeMessage, translateNative } from '@/i18n';\n` + output;
    const updated = ts.createSourceFile(filename, output, ts.ScriptTarget.Latest, true);
    const imports = updated.statements.filter(statement => ts.isImportDeclaration(statement) && statement.moduleSpecifier.text === '@/i18n');
    if (imports.length > 1) {
      const names = new Map();
      for (const statement of imports) for (const name of statement.importClause.namedBindings.elements) names.set(name.name.text, name.getText(updated));
      for (let index = imports.length - 1; index >= 0; index--) {
        const statement = imports[index];
        output = output.slice(0, statement.getStart(updated)) + (index ? '' : `import { ${[...names.values()].sort().join(', ')} } from '@/i18n';`) + output.slice(statement.end);
      }
    }
    const gap = source.match(/^import[^\n]+from '@\/i18n';(\n+)/)?.[1];
    if (gap) output = output.replace(/^(import[^\n]+from '@\/i18n';)\n+/, `$1${gap}`);
    fs.writeFileSync(filename, output);
  }
}
directory(root);
