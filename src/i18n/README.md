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
Navigation and existing feature-screen literals still require integration migration.

# Formatting

Mount `ServerPreferencesSync` under auth/query/theme providers. It loads date/time
from `/settings/ui-preferences` and currency from `/settings/ui-flags` without
requiring `settings:read`. Full `['settings']`/server palette sync runs only when
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
