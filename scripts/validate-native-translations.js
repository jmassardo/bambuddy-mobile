const fs = require('fs');
const path = require('path');
const { digest } = require('./native-translation-inventory');
const resources = path.resolve(__dirname, '../src/i18n/resources');
const pluralSuffix = /_(zero|one|two|few|many|other)$/;

function placeholders(value) {
  return [...new Set([...value.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]))].sort();
}
function validateChunk(english, translated, description) {
  const errors = [];
  if (!translated || typeof translated !== 'object' || Array.isArray(translated)) return [`${description}: expected a flat JSON object`];
  for (const [key, value] of Object.entries(english)) {
    if (typeof translated[key] !== 'string' || !translated[key].trim()) errors.push(`${description}: missing/non-string/empty ${key}`);
    else if (JSON.stringify(placeholders(translated[key])) !== JSON.stringify(placeholders(value))) errors.push(`${description}: placeholder mismatch ${key}: expected ${placeholders(value).join(', ')}`);
  }
  for (const [key, value] of Object.entries(translated)) {
    const base = key.replace(pluralSuffix, '');
    if (!(key in english) && !(pluralSuffix.test(key) && base in english)) errors.push(`${description}: unknown key ${key}`);
    else if (typeof value !== 'string' || !value.trim()) errors.push(`${description}: non-string/empty ${key}`);
    else if (JSON.stringify(placeholders(value)) !== JSON.stringify(placeholders(english[key] ?? english[base]))) errors.push(`${description}: placeholder mismatch ${key}`);
  }
  return errors;
}
function validateResources({ locale, chunk } = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(resources, 'manifest.json'), 'utf8'));
  const selectedLocales = locale ? [locale] : manifest.locales;
  const selectedChunks = chunk ? [chunk] : manifest.chunks;
  const errors = [];
  const canonical = [];
  if (selectedLocales.some(value => !manifest.locales.includes(value))) return ['Unsupported locale selection'];
  if (selectedChunks.some(value => !manifest.chunks.includes(value))) return ['Unknown chunk selection'];
  for (const id of manifest.chunks) {
    const english = JSON.parse(fs.readFileSync(path.join(resources, 'en', `${id}.json`), 'utf8'));
    for (const [key, value] of Object.entries(english)) canonical.push({ key, english: value, context: 'shared', placeholders: placeholders(value), chunk: id });
    if (!selectedChunks.includes(id)) continue;
    for (const language of selectedLocales) {
      const filename = path.join(resources, language, `${id}.json`);
      if (!fs.existsSync(filename)) { errors.push(`${language}/${id}.json: missing resource file`); continue; }
      try {
        errors.push(...validateChunk(english, JSON.parse(fs.readFileSync(filename, 'utf8')), `${language}/${id}.json`));
      } catch (error) { errors.push(`${language}/${id}.json: invalid JSON: ${error.message}`); }
    }
  }
  canonical.sort((a, b) => a.key.localeCompare(b.key));
  if (digest(JSON.stringify(canonical)) !== manifest.resourceDigest) errors.push('Frozen English inventory digest mismatch');
  if (canonical.length !== manifest.resourceCount) errors.push('Frozen English resource count mismatch');
  return errors;
}
if (require.main === module) {
  const argument = name => {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : undefined;
  };
  const errors = validateResources({ locale: argument('locale'), chunk: argument('chunk') });
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else console.log('Native translation resource keys, placeholders and immutable English digest pass.');
}
module.exports = { placeholders, validateChunk, validateResources };
