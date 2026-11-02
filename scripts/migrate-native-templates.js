const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { extractInventory } = require('./native-translation-inventory');
const root = path.resolve(__dirname, '..');
const inventory = extractInventory();
const files = new Map();
for (const entry of inventory.entries) for (const reference of entry.occurrences) {
  if (reference.reserved || !reference.bindings?.length || ['translation-default', 'translation-default-template', 'jsx-compound-template'].includes(reference.kind)) continue;
  const list = files.get(reference.file) ?? [];
  list.push({ ...reference, english: entry.english, key: entry.key }); files.set(reference.file, list);
}
let changed = 0;
function walk(node, callback) { callback(node); ts.forEachChild(node, child => walk(child, callback)); }
for (const [filename, candidates] of files) {
  const full = path.join(root, filename);
  const source = fs.readFileSync(full, 'utf8');
  const file = ts.createSourceFile(full, source, ts.ScriptTarget.Latest, true);
  const nodes = new Map();
  walk(file, node => { if (ts.isTemplateExpression(node)) nodes.set(`${node.getStart(file)}:${node.end}`, node); });
  const edits = new Map();
  for (const candidate of candidates) {
    const node = nodes.get(`${candidate.start}:${candidate.end}`);
    if (!node) continue;
    const values = candidate.bindings.map(binding => `${binding.name}: String(${binding.expression})`).join(', ');
    edits.set(node.getStart(file), { start: node.getStart(file), end: node.end, value: `translateNative(${JSON.stringify(candidate.key)}, { ${values} })` });
  }
  const selected = [...edits.values()].filter(edit => ![...edits.values()].some(other => other !== edit && other.start < edit.start && other.end >= edit.end));
  if (!selected.length) continue;
  let output = source;
  for (const edit of selected.sort((a, b) => b.start - a.start)) output = output.slice(0, edit.start) + edit.value + output.slice(edit.end);
  output = "import { translateNative } from '@/i18n';\n" + output;
  fs.writeFileSync(full, output); changed += 1;
}
console.log(`Parameterized authored templates in ${changed} files.`);
