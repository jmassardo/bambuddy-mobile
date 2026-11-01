// Preserve catalog keys, not a translation captured when a module first loads.
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
function directory(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['__tests__', 'i18n', 'navigation'].includes(entry.name)) continue;
    const filename = path.join(dir, entry.name);
    if (entry.isDirectory()) { directory(filename); continue; }
    if (!/\.tsx?$/.test(filename) || entry.name === 'MoreScreen.tsx') continue;
    let source = fs.readFileSync(filename, 'utf8');
    const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
    const edits = [];
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(file) === 'nativeLabelTuple') {
        const tuple = node.arguments[0];
        const label = tuple && ts.isArrayLiteralExpression(tuple) && tuple.elements[1];
        if (label && ts.isCallExpression(label) && label.expression.getText(file) === 'translateNative' && ts.isStringLiteral(label.arguments[0])) {
          edits.push({ start: label.getStart(file), end: label.end, replacement: label.arguments[0].getText(file) });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
    for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.replacement + source.slice(edit.end);
    if (edits.length) fs.writeFileSync(filename, source);
  }
}
directory(path.resolve(__dirname, '../src'));
