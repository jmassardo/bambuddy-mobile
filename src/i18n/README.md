# Native localization

Mount `LocalizationProvider` above the native shell (including toast/dialog providers).
It detects the device locale, supports the same 15 language choices as the server,
and persists the **display** language in AsyncStorage. Notification language remains
a separate server setting. No upstream translation assets are copied: the bundled
catalog is authored for this mobile application. Upstream assets are AGPL-3.0;
the mobile repository does not currently declare a compatible distribution license.

```tsx
import { useTranslation } from '@/i18n';

const { t, language, setLanguage } = useTranslation();
<Button title={t('common.save')} onPress={save} />;
<Text>{t('inventory.spoolCount', {
  defaultValue: '{{count}} spools',
  count: spools.length,
})}</Text>;
await setLanguage('zh-TW');
```

`t` looks up the current language, optional CLDR plural suffix
(`_one`, `_other`, `_few`, etc.), then English, then `defaultValue`, then the key.
Before English fallback, an exact matching English `defaultValue` is resolved
against the multilingual catalog. Thus `t('newDomain.save', {defaultValue: 'Save'})`
still translates in every supported locale. `{{name}}` interpolation is supported;
React Native renders results as text, never as HTML.

`useTranslation().text('Save')` applies that English-value lookup to existing shared
UI labels. It does **not** translate arbitrary prose or user-provided data. Do not
pass file names, printer names, spool labels, API error bodies, or server contents
through this compatibility lookup. Prefer explicit keys for newly authored UI.
`createTranslator(language)` is available for pure functions/tests; use the hook
inside components so language changes trigger a re-render.

Add English keys to `catalog.ts` / `nativeCatalog.ts` and corresponding strings in
**all** supported language rows. Plural strings use the locale's CLDR categories.
All bundled keys are tested for nonempty translations. English fallback is a
safety mechanism, **not** evidence that an uncatalogued screen has been translated.

Run `node scripts/audit-native-translations.js` after integrating feature lanes to
list uncovered literal JSX labels and untranslated `t(..., {defaultValue})` calls.
Pass an alternate source directory to inspect a read-only integration worktree:
`node scripts/audit-native-translations.js /path/to/integration/src`.
The audit also inventories object-defined UI labels, missing explicit keys and
literal toast/alert messages. The inventory is heuristic; review strings before
migration (especially user data, computed strings and dynamically built keys).
Use the strict source gate below for the completed native migration; this older
heuristic audit is only an exploratory inventory.

# Formatting

Mount `ServerPreferencesSync` under auth/query/theme providers. It loads date/time
from `/settings/ui-preferences` and currency from `/settings/ui-flags` without
requiring `settings:read`. Full `['settings', serverUrl]`/server palette sync runs only when
that permission is available. Saved announcement-policy changes refresh the inbox.
Both existing `utils/data` and `utils/formatters` consume the shared preference state.
`utils/preferences` additionally exposes `formatDateInput`, `parseDateInput`,
`formatTimeInput`, `parseTimeInput`, and placeholder helpers for editable controls.
Zone-less server timestamps are UTC; calendar-only values retain their calendar day.
Dates/times are displayed in the device timezone. Currency values are **never**
converted. Unknown codes remain visible instead of being relabelled USD.

# UI preferences and announcements

`useUiPreferencesStore` persists a local landing page. The navigator must wait for
`loaded`, then apply `landingNavigationState(landingPage, allowedVisibleIds)` once
on launch/sign-in. Do not reset a browsing user's stack after each preference edit.
Use `resetRevision` as an authenticated-shell remount key after the explicit UI
reset to clear mounted screen-local sorting state. Reset leaves server settings,
custom links, biometric credentials, account tokens and server connection intact.

Register `Announcements: {id?: string} | undefined` with `AnnouncementsScreen`.
Mount `AnnouncementsEntry` in More and `AnnouncementBanner` in the authenticated
shell. The server's `visible` response is authoritative, including for non-admins;
do not replace it with a client permission guess. Unread counts exclude archived
messages. Read acknowledgements remain unread until the server confirms success.
External links are HTTPS-only and limited to GitHub/BambuBuddy hosts.
## Frozen completion resources

The staged completion inventory is **not** a claim that UI localization is done.
`resources/manifest.json` identifies the immutable English source/digest/chunks.
`resources/en/0001.json` etc. contain exact English labels/templates under stable
`native.<digest>` keys; `resources/contexts/0001.json` supplies source locations,
component/helper names, original expressions and placeholder names for authors.
Existing fully translated catalog entries are reused and are not reassigned.

Resource authors own only their assigned `resources/<locale>/` directories.
For every English chunk, author a flat JSON object with the identical base keys,
nonempty native translations and exactly the same `{{placeholder}}` names.
Do not translate placeholder contents, IDs, filenames, user input, brand/protocol
identifiers, URLs or units. Do not copy upstream translation assets or change
licenses. Translate full grammatical messages, not individual English word order.
Counted messages may use a count-neutral grammatical formulation, or add CLDR
`_one`, `_few`, `_many`, `_other` etc. variants; preserve the base key too.
Legitimate translations identical to English are allowed, but an English fallback
is not an authored resource entry. No runtime/source/English/context edits belong
in a resource-author branch.

Validate one chunk or a complete locale without installs:

```sh
node scripts/validate-native-translations.js --locale de --chunk 0001
node scripts/validate-native-translations.js --locale de
node scripts/validate-native-translations.js
```

The last command intentionally fails until all 15 locales have every resource.
It checks real entries, key coverage, interpolation and the frozen English digest,
not whether the runtime can fall back to English. AST/source migration, runtime
imports/aliases and review of indirect/dynamic UI cases are separate completion
steps owned by the global lane. Source-coordinate metadata refers to the frozen
source commit, not later rewritten line numbers.

## Completed source migration and additive resources

The immutable base remains 5,667 resource keys in 38 chunks. Twelve append-only
`delta-0001`–`delta-0012` chunks add 946 keys, giving **6,613 keys / 50 files per
locale**. This includes display labels, help text and enum captions from the
existing checked-in slicer schema/tree; canonical metadata, wire values, option
identifiers and original English search anchors are not rewritten.

Source/runtime migration is separate from resource authoring. Every non-English
locale must contain all twelve deltas; fallback does not satisfy this requirement.
After integrating resource authors, regenerate Metro's explicit static imports:

```sh
node scripts/generate-native-resources.js
node scripts/validate-native-translations.js
node scripts/validate-native-source.js
```

The final registry contains 750 files (15 locales × 50). Resource validation uses
`--locale de`, **not** `--locale=de`, and also verifies runtime import coverage.
Never renumber or edit the assigned English/context chunks.

### Reactive source interfaces

* `useTranslation()` subscribes to language and formatting preferences. Prefer
  `t('explicit.key', {defaultValue: 'Authored English', ...values})` for new UI.
  Only exact app-authored English defaults may use the compatibility alias lookup.
* `translateNative(key, values)` is the non-hook equivalent for explicit keys or
  closed source-owned caption factories. It is **not** a user-data translator.
* `useNativeLocale()` subscribes a component to display-language and late
  currency/date/time updates. `useLocalizedMemo(factory, originalDependencies)`
  adds that external snapshot to existing memo dependencies. Subscribe the parent
  that computes formatted props, not just its memoized child.
* `nativeLabelTuple(['wire-id', 'native.catalogKey', ...] as const)` makes only
  the display slot lazy. Keep the **key**, never an eagerly translated value, so
  modules first loaded in a non-English locale can switch languages correctly.
* `<NativeTranslation id="native.template" values={{name: <Text>{name}</Text>}} />`
  translates/reorders full templates without translating React-node contents.
  Pass `count={n}` for CLDR variants; English `s`/`es` fragments are not carried
  into foreign sentences.
* `useNativeMessageState` stores `nativeMessage(key, values)` descriptors rather
  than translated snapshots. A lazy options factory re-evaluates nested caption
  getters/formatters on language changes. Set a raw string for backend errors:
  raw strings remain raw, even when they equal an English catalog value.

Shared text/buttons/inputs/options/toasts do not intercept arbitrary strings.
Translate authored labels at their source. Keep printer/project names, filenames,
URLs, input values, server messages, custom links, route names and protocol IDs
unchanged. Display-only enum helpers accept explicit bounded caption tables and
leave unknown values untouched; never use their output for payloads/comparisons.
OS permission dialogs and opaque server prose are not native catalog resources.

### Source provenance gate

`source-review.json` records resolutions for all 96 original dynamic cases and
the current private facades/metadata boundaries. Source fingerprints plus
non-reserved file digests force re-review when those data flows change. The gate
also rejects missing concrete keys, uncatalogued factory fallbacks, direct
unwrapped UI literals, eager tuple captions and translations in wire lookups or
comparisons. Review records are provenance evidence, not proof by themselves:
behavioral tests exercise real foreign catalogs, language changes without remount,
module options, templates/accessibility and colliding user/server text.

When adding UI, inventory genuine static prose, append resource chunks, author
all locales, and explicitly re-audit any changed dynamic facade before updating
its approval. Do not blanket-approve new reviews or translate arbitrary runtime
strings to make the gate pass.
