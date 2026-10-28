/* Enumerate candidate UI literals without executing source or copying upstream assets. */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const catalogRoot = path.join(__dirname, '..', 'src');
const root = process.argv[2] ? path.resolve(process.argv[2]) : catalogRoot;
const english = new Set();
const knownKeys = new Set();
function visit(node, callback) {
  callback(node);
  ts.forEachChild(node, child => visit(child, callback));
}
for (const filename of ['catalog.ts', 'nativeCatalog.ts']) {
  const file = ts.createSourceFile(filename, fs.readFileSync(path.join(catalogRoot, 'i18n', filename), 'utf8'), ts.ScriptTarget.Latest, true);
  visit(file, node => {
    if (ts.isVariableDeclaration(node) && ['english', 'labels'].includes(node.name.getText(file)) && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      for (const property of node.initializer.properties) {
        if (ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer)) {
          english.add(property.initializer.text);
          knownKeys.add(ts.isStringLiteral(property.name) ? property.name.text : property.name.getText(file));
        }
      }
    }
    if (ts.isVariableDeclaration(node) && ['navRows', 'moreRows', 'rootRows'].includes(node.name.getText(file)) && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      for (const property of node.initializer.properties) {
        if (ts.isPropertyAssignment(property) && property.name.getText(file) === 'en' && ts.isStringLiteral(property.initializer)) {
          for (const value of property.initializer.text.split('|')) english.add(value);
        }
      }
    }
    if (ts.isVariableDeclaration(node) && ['navKeys', 'moreKeys', 'messageKeys', 'rootKeys'].includes(node.name.getText(file)) && node.initializer) {
      let initializer = node.initializer;
      while (ts.isAsExpression(initializer)) initializer = initializer.expression;
      if (ts.isArrayLiteralExpression(initializer)) {
        for (const element of initializer.elements) {
          if (ts.isStringLiteral(element)) knownKeys.add(node.name.getText(file) === 'navKeys' ? `nav.${element.text}` : element.text);
        }
      }
    }
  });
}
const output = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!['__tests__', 'i18n'].includes(entry.name)) walk(filename);
      continue;
    }
    if (!/\.tsx?$/.test(filename)) continue;
    const file = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
    function report(node, value, kind) {
      const text = value.trim();
      if (text.length < 2 || !/[a-zA-Z]/.test(text) || english.has(text)) return;
      output.push({ file: path.relative(root, filename), line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, kind, text });
    }
    visit(file, node => {
      if (ts.isJsxText(node)) report(node, node.text, 'jsx-text');
      if (ts.isJsxAttribute(node) && /^(title|label|subtitle|placeholder|message|accessibilityLabel|description|confirmLabel|cancelLabel)$/.test(node.name.getText(file)) &&
          node.initializer && ts.isStringLiteral(node.initializer)) report(node, node.initializer.text, 'jsx-attribute');
      if (ts.isPropertyAssignment(node) && /^(title|label|subtitle|placeholder|message|description|helper|error|confirmLabel|cancelLabel)$/.test(node.name.getText(file)) &&
          ts.isStringLiteral(node.initializer)) report(node, node.initializer.text, 'ui-object-label');
      if (ts.isCallExpression(node) && ['showToast', 'Alert.alert', 'showError'].includes(node.expression.getText(file))) {
        const messages = node.arguments.slice(0, node.expression.getText(file) === 'Alert.alert' ? 2 : 1);
        for (const argument of messages) if (ts.isStringLiteral(argument)) report(argument, argument.text, 'feedback-literal');
      }
      if (ts.isCallExpression(node) && node.expression.getText(file) === 't') {
        const key = node.arguments[0];
        if (key && ts.isStringLiteral(key) && knownKeys.has(key.text)) return;
        const options = node.arguments[1];
        const fallback = options && ts.isObjectLiteralExpression(options) && options.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(file) === 'defaultValue');
        if (fallback && ts.isPropertyAssignment(fallback) && ts.isStringLiteral(fallback.initializer)) {
          report(node, fallback.initializer.text, 'translation-default');
        } else if (fallback && ts.isPropertyAssignment(fallback) && key && ts.isStringLiteral(key)) {
          report(node, key.text, 'dynamic-translation-default');
          visit(fallback.initializer, child => {
            if (ts.isStringLiteral(child)) report(child, child.text, 'translation-default-branch');
          });
        } else if (key && ts.isStringLiteral(key)) report(node, key.text, 'missing-translation-key');
      }
    });
  }
}
walk(root);
console.log(JSON.stringify({ sourceRoot: root, knownEnglishLabels: english.size, knownKeys: knownKeys.size, uncoveredCandidates: output.length, candidates: output }, null, 2));
