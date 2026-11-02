const fs = require('fs');
const path = require('path');
const { extractInventory, digest } = require('./native-translation-inventory');
const root = path.resolve(__dirname, '../src/i18n/resources');
const manifestPath = path.join(root, 'delta-manifest.json');
const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { chunks: [], resourceCount: 0 };
const known = new Set(fs.readdirSync(path.join(root, 'en')).flatMap(file => Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'en', file), 'utf8')))));
const inventory = extractInventory();
const additions = inventory.entries.filter(entry => !entry.existingCatalogKey && !known.has(entry.key));
if (!additions.length) {
  console.log('No new English delta keys.');
  process.exit(0);
}
const chunks = [...previous.chunks];
for (let offset = 0; offset < additions.length; offset += 150) {
  const chunk = `delta-${String(chunks.length + 1).padStart(4, '0')}`;
  const entries = additions.slice(offset, offset + 150);
  fs.writeFileSync(path.join(root, 'en', `${chunk}.json`), JSON.stringify(Object.fromEntries(entries.map(entry => [entry.key, entry.english])), null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'contexts', `${chunk}.json`), JSON.stringify(Object.fromEntries(entries.map(entry => [entry.key, {
    english: entry.english, context: entry.context, placeholders: entry.placeholders,
    occurrences: entry.occurrences.map(({ file, line, kind, owner, source, existingKey }) => ({
      file, line, kind, owner, ...(existingKey ? { existingKey } : {}), source,
    })),
  }])), null, 2) + '\n');
  chunks.push(chunk);
}
const canonical = chunks.flatMap(chunk => Object.entries(JSON.parse(fs.readFileSync(path.join(root, 'en', `${chunk}.json`), 'utf8'))).map(([key, english]) => ({
  key, english, context: 'shared',
  placeholders: [...new Set([...english.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]))].sort(), chunk,
}))).sort((a, b) => a.key.localeCompare(b.key));
const manifest = { schemaVersion: 1, sourceCommit: inventory.sourceCommit, resourceDigest: digest(JSON.stringify(canonical)), resourceCount: canonical.length, chunks };
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ newKeys: additions.length, ...manifest }, null, 2));
