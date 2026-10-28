const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { extractInventory, loadExistingCatalogs, digest, exclusion } = require('./native-translation-inventory');
const root = path.resolve(__dirname, '..');

function scanReferences(source, filename, english) {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const aliases = new Set(Object.values(english));
  const failures = [];
  function check(key, node, fallback, dynamicDefault = false) {
    if (typeof english[key] === 'string' || aliases.has(key)) return;
    if (!key.startsWith('native.') && (dynamicDefault || fallback && (aliases.has(fallback) || exclusion(fallback)))) return;
    failures.push({ file: filename, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, key });
  }
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'nativeLabelTuple') {
      const tuple = node.arguments[0];
      const label = tuple && ts.isArrayLiteralExpression(tuple) && tuple.elements[1];
      if (label && ts.isStringLiteral(label)) check(label.text, label);
      else if (label) failures.push({ file: filename, reason: 'Lazy tuple captions must retain a concrete catalog key, not an eagerly translated value.' });
    }
    if (ts.isCallExpression(node) && ['t', 'translateNative', 'nativeMessage'].includes(node.expression.getText(file))) {
      const parent = node.parent;
      if (node.expression.getText(file) !== 't' && (ts.isElementAccessExpression(parent) && parent.argumentExpression === node || ts.isComputedPropertyName(parent) || ts.isCaseClause(parent) || ts.isBinaryExpression(parent) && /^(===|!==|==|!=)$/.test(parent.operatorToken.getText(file)))) {
        failures.push({ file: filename, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, reason: 'Translated text cannot replace a protocol/comparison/property-lookup value.' });
      }
      const key = node.arguments[0];
      if (key && ts.isStringLiteral(key)) {
        const options = node.arguments[1];
        const defaults = [];
        function findDefaults(part) {
          if (ts.isPropertyAssignment(part) && part.name.getText(file) === 'defaultValue') defaults.push(part.initializer);
          ts.forEachChild(part, findDefaults);
        }
        if (options) findDefaults(options);
        const literals = [];
        function leaves(part) {
          if (ts.isStringLiteral(part)) literals.push(part.text);
          else if (ts.isConditionalExpression(part)) { leaves(part.whenTrue); leaves(part.whenFalse); }
          else if (ts.isBinaryExpression(part) && ['||', '??'].includes(part.operatorToken.getText(file))) { leaves(part.left); leaves(part.right); }
        }
        defaults.forEach(leaves);
        for (const fallback of literals) if (!aliases.has(fallback) && !exclusion(fallback)) failures.push({ file: filename, key: key.text, english: fallback, reason: 'Uncatalogued authored fallback inside a message/translation factory.' });
        check(key.text, key, literals[0], defaults.length > 0 && !literals.length);
      }
    }
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(file) === 'NativeTranslation') {
      const id = node.attributes.properties.find(property => ts.isJsxAttribute(property) && property.name.getText(file) === 'id');
      if (id?.initializer && ts.isStringLiteral(id.initializer)) check(id.initializer.text, id);
      else failures.push({ file: filename, reason: 'NativeTranslation requires a concrete, catalogued id.' });
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return failures;
}

function reviewId(item) { return digest(`${item.file}\0${item.kind}\0${item.source}`); }

function validateSource() {
  const english = loadExistingCatalogs().en;
  const inventory = extractInventory();
  const failures = [];
  const files = [];
  function directory(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['__tests__', 'i18n'].includes(entry.name)) continue;
      const filename = path.join(dir, entry.name);
      if (entry.isDirectory()) directory(filename);
      else if (/\.tsx?$/.test(filename)) files.push(filename);
    }
  }
  directory(path.join(root, 'src'));
  files.push(path.join(root, 'App.tsx'));
  for (const filename of files) failures.push(...scanReferences(fs.readFileSync(filename, 'utf8'), path.relative(root, filename), english));
  for (const entry of inventory.entries) {
    if (typeof english[entry.key] !== 'string') failures.push({ key: entry.key, english: entry.english, reason: 'Missing concrete English resource; fallback is not coverage.' });
    for (const occurrence of entry.occurrences) {
      if (!occurrence.reserved && ['jsx-text', 'jsx-attribute', 'jsx-compound-template', 'ui-object-label', 'ui-label-binding'].includes(occurrence.kind)) failures.push({ ...occurrence, english: entry.english, reason: 'Authored direct UI boundary remains outside a translation call.' });
    }
  }
  const review = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/source-review.json'), 'utf8'));
  for (const item of review.original) {
    if (item.status !== 'resolved' || !item.disposition?.trim()) failures.push({ file: item.file, reason: 'Original dynamic inventory item has no completed provenance resolution.' });
  }
  const approved = new Map(review.current.map(item => [item.id, item]));
  for (const item of inventory.review) {
    if (!approved.has(reviewId(item))) failures.push({ ...item, reason: 'New dynamic source boundary requires a provenance review.' });
    else {
      const approval = approved.get(reviewId(item));
      if (!item.reserved && approval.fileDigest !== digest(fs.readFileSync(path.join(root, item.file), 'utf8'))) failures.push({ file: item.file, reason: 'Reviewed dynamic-label data flow changed; re-audit before updating its file fingerprint.' });
    }
  }
  return {
    files: files.length, inventoriedEnglish: inventory.entries.length,
    originalManualReviews: review.original.length, currentManualReviews: inventory.review.length,
    opaqueOrTechnicalExclusions: inventory.excluded.length, failures,
  };
}
if (require.main === module) {
  const result = validateSource();
  console.log(JSON.stringify(result, null, 2));
  if (result.failures.length) process.exitCode = 1;
}
module.exports = { scanReferences, reviewId, validateSource };
