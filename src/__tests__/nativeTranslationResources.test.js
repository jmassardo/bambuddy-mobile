const { validateChunk, validateResources } = require('../../scripts/validate-native-translations');
const { exclusion, jsxWhitespace } = require('../../scripts/native-translation-inventory');
const { scanReferences, validateSource } = require('../../scripts/validate-native-source');

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
    expect(exclusion('Low')).toBeNull();
    expect(exclusion('100 kg')).toBeTruthy();
    expect(exclusion('Spool {{value0}} is running low.')).toBeNull();
    expect(jsxWhitespace('\n  Save\n  changes\n')).toBe('Save changes');
  });

  it('rejects unknown concrete keys and uncatalogued defaults even when fallback could hide them', () => {
    const english = { 'native.save': 'Save' };
    expect(scanReferences("translateNative('native.absent', {defaultValue: 'Save'})", 'example.tsx', english)).not.toEqual([]);
    expect(scanReferences("nativeMessage('new.error', () => ({defaultValue: 'Uncatalogued message'}))", 'example.tsx', english)).not.toEqual([]);
    expect(scanReferences("<NativeTranslation />", 'example.tsx', english)).not.toEqual([]);
    expect(scanReferences("<NativeTranslation id=\"native.absent\" />", 'example.tsx', english)).not.toEqual([]);
    expect(scanReferences("nativeMessage('new.save', () => ({defaultValue: 'Save'}))", 'example.tsx', english)).toEqual([]);
  });

  it('protects wire lookups and lazy module captions from translated values', () => {
    const english = { 'native.save': 'Save' };
    expect(scanReferences("payload[translateNative('native.save')]", 'example.ts', english)).not.toEqual([]);
    expect(scanReferences("state === translateNative('native.save')", 'example.ts', english)).not.toEqual([]);
    expect(scanReferences("nativeLabelTuple(['wire', translateNative('native.save')])", 'example.ts', english)).not.toEqual([]);
    expect(scanReferences("nativeLabelTuple(['wire', 'native.save'])", 'example.ts', english)).toEqual([]);
  });

  it('rejects eager header getters and pretranslated authored toast strings', () => {
    const english = { 'native.save': 'Save' };
    expect(scanReferences("useLayoutEffect(() => navigation.setOptions({get title() {return translateNative('native.save')}}), [navigation])", 'example.ts', english)).not.toEqual([]);
    expect(scanReferences("useLayoutEffect(() => navigation.setOptions({title: translateNative('native.save')}), [navigation, titleLocale])", 'example.ts', english)).toEqual([]);
    expect(scanReferences("showToast(translateNative('native.save'))", 'example.ts', english)).not.toEqual([]);
    expect(scanReferences("showToast(nativeMessage('native.save'))", 'example.ts', english)).toEqual([]);
    expect(scanReferences("showToast(translateNative('native.save'))", 'src/screens/MoreScreen.tsx', english)).not.toEqual([]);
  });

  it('keeps production authored boundaries catalogued and dynamic provenance reviewed', () => {
    expect(validateSource().failures).toEqual([]);
  });
});
