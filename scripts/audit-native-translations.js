/* Enumerate candidate UI literals without executing source or copying upstream assets. */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = path.join(__dirname, '..', 'src');
const english = new Set();
function visit(node, callback) {
  callback(node);
  ts.forEachChild(node, child => visit(child, callback));
}
for (const filename of ['catalog.ts', 'nativeCatalog.ts']) {
  const file = ts.createSourceFile(filename, fs.readFileSync(path.join(root, 'i18n', filename), 'utf8'), ts.ScriptTarget.Latest, true);
  visit(file, node => {
    if (ts.isVariableDeclaration(node) && ['english', 'labels'].includes(node.name.getText(file)) && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      for (const property of node.initializer.properties) {
        if (ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer)) english.add(property.initializer.text);
      }
    }
    if (ts.isVariableDeclaration(node) && ['navRows', 'moreRows'].includes(node.name.getText(file)) && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      for (const property of node.initializer.properties) {
        if (ts.isPropertyAssignment(property) && property.name.getText(file) === 'en' && ts.isStringLiteral(property.initializer)) {
          for (const value of property.initializer.text.split('|')) english.add(value);
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
      if (ts.isCallExpression(node) && node.expression.getText(file) === 't' && node.arguments[1] && ts.isObjectLiteralExpression(node.arguments[1])) {
        const fallback = node.arguments[1].properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(file) === 'defaultValue');
        if (fallback && ts.isPropertyAssignment(fallback) && ts.isStringLiteral(fallback.initializer)) report(node, fallback.initializer.text, 'translation-default');
      }
    });
  }
}
walk(root);
console.log(JSON.stringify({ knownEnglishLabels: english.size, uncoveredCandidates: output.length, candidates: output }, null, 2));
