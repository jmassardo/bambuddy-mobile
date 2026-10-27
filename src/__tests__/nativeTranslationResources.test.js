const { validateChunk, validateResources } = require('../../scripts/validate-native-translations');
const { exclusion, jsxWhitespace } = require('../../scripts/native-translation-inventory');

describe('native translation resource contract', () => {
  it('rejects fallback-only coverage, extra keys and changed interpolation names', () => {
    const english = { 'native.example': 'Delete {{name}}?' };
    expect(validateChunk(english, {}, 'de')).toEqual(expect.arrayContaining([expect.stringContaining('missing')]));
    expect(validateChunk(english, { 'native.example': 'Löschen {{user}}?' }, 'de')).toEqual(expect.arrayContaining([expect.stringContaining('placeholder mismatch')]));
    expect(validateChunk(english, { 'native.example': 'Löschen {{name}}?', extra: 'Extra' }, 'de')).toEqual(expect.arrayContaining([expect.stringContaining('unknown key')]));
  });

  it('allows grammatical locale-specific plural variants without losing bindings', () => {
    expect(validateChunk({ 'native.example': '{{count}} files' }, {
      'native.example': 'Dateien: {{count}}',
      'native.example_one': '{{count}} Datei',
      'native.example_other': '{{count}} Dateien',
    }, 'de')).toEqual([]);
  });

  it('checks English integrity independently while foreign resource authoring is in progress', () => {
    expect(validateResources({ locale: 'en' })).toEqual([]);
  });

  it('distinguishes authored prose from user-value-only templates and identifiers', () => {
    expect(exclusion('{{value0}} · {{value1}}')).toBeTruthy();
    expect(exclusion('https://printer.local')).toBeTruthy();
    expect(exclusion('USD')).toBeTruthy();
    expect(exclusion('Spool {{value0}} is running low.')).toBeNull();
    expect(jsxWhitespace('\n  Save\n  changes\n')).toBe('Save changes');
  });
});
