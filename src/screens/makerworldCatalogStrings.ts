// Strings for the native MakerWorld catalog / one-tap print feature.
// English text is the default value; translations for every supported language live in
// src/i18n/resources/<locale>/delta-*.json. After adding or changing a string, run
// `node scripts/update-native-translation-delta.js`, add the new keys to every locale,
// then `node scripts/generate-native-resources.js` (see docs/MAKERWORLD_CATALOG.md).
import { useMemo } from 'react';
import { useTranslation } from '@/i18n';

function buildStrings(t: ReturnType<typeof useTranslation>['t']) {
  return {
    tab: t('makerworldCatalog.tab', { defaultValue: 'Catalog' }),
    title: t('makerworldCatalog.title', { defaultValue: 'MakerWorld' }),
    openCatalog: t('makerworldCatalog.openCatalog', { defaultValue: 'Open MakerWorld catalog' }),
    openCatalogHint: t('makerworldCatalog.openCatalogHint', { defaultValue: 'Browse MakerWorld models and print them with one tap.' }),
    searchPlaceholder: t('makerworldCatalog.searchPlaceholder', { defaultValue: 'Search models' }),
    feedTrending: t('makerworldCatalog.feedTrending', { defaultValue: 'Trending' }),
    feedPopular: t('makerworldCatalog.feedPopular', { defaultValue: 'Popular' }),
    feedTop: t('makerworldCatalog.feedTop', { defaultValue: 'Most liked' }),
    feedNewest: t('makerworldCatalog.feedNewest', { defaultValue: 'New' }),
    feedFavorites: t('makerworldCatalog.feedFavorites', { defaultValue: 'Favorites' }),
    addFavorite: t('makerworldCatalog.addFavorite', { defaultValue: 'Add to favorites' }),
    inFavorites: t('makerworldCatalog.inFavorites', { defaultValue: 'In favorites' }),
    addedFavorite: t('makerworldCatalog.addedFavorite', { defaultValue: 'Added to favorites' }),
    removedFavorite: t('makerworldCatalog.removedFavorite', { defaultValue: 'Removed from favorites' }),
    noFavorites: t('makerworldCatalog.noFavorites', { defaultValue: 'No favorites yet' }),
    noFavoritesHint: t('makerworldCatalog.noFavoritesHint', { defaultValue: 'Open a model and tap “Add to favorites”.' }),
    nothingFound: t('makerworldCatalog.nothingFound', { defaultValue: 'Nothing found' }),
    nothingFoundHint: t('makerworldCatalog.nothingFoundHint', { defaultValue: 'Try another search.' }),
    loadFailed: t('makerworldCatalog.loadFailed', { defaultValue: 'Could not load MakerWorld' }),
    retry: t('makerworldCatalog.retry', { defaultValue: 'Retry' }),
    by: t('makerworldCatalog.by', { defaultValue: 'by {{name}}' }),
    profiles: t('makerworldCatalog.profiles', { defaultValue: 'Print profiles' }),
    profilesCount: t('makerworldCatalog.profilesCount', { defaultValue: '{{count}} profiles' }),
    description: t('makerworldCatalog.description', { defaultValue: 'Description' }),
    showMore: t('makerworldCatalog.showMore', { defaultValue: 'Show more' }),
    showLess: t('makerworldCatalog.showLess', { defaultValue: 'Show less' }),
    tags: t('makerworldCatalog.tags', { defaultValue: 'Tags' }),
    license: t('makerworldCatalog.license', { defaultValue: 'License' }),
    needAms: t('makerworldCatalog.needAms', { defaultValue: 'AMS' }),
    colors: t('makerworldCatalog.colors', { defaultValue: '{{count}} colors' }),
    hoursShort: t('makerworldCatalog.hoursShort', { defaultValue: 'h' }),
    minutesShort: t('makerworldCatalog.minutesShort', { defaultValue: 'min' }),
    grams: t('makerworldCatalog.grams', { defaultValue: 'g' }),
    printers: t('makerworldCatalog.printers', { defaultValue: 'Printers' }),
    openOnSite: t('makerworldCatalog.openOnSite', { defaultValue: 'Open on MakerWorld' }),
    print: t('makerworldCatalog.print', { defaultValue: 'Print' }),
    printing: t('makerworldCatalog.printing', { defaultValue: 'Working…' }),
    pipeline: t('makerworldCatalog.pipeline', { defaultValue: 'Pipeline' }),
    choose: t('makerworldCatalog.choose', { defaultValue: 'Choose' }),
    change: t('makerworldCatalog.change', { defaultValue: 'Change' }),
    noPipeline: t('makerworldCatalog.noPipeline', { defaultValue: 'Not selected' }),
    choosePipeline: t('makerworldCatalog.choosePipeline', { defaultValue: 'Pipeline for one-tap print' }),
    choosePipelineHint: t('makerworldCatalog.choosePipelineHint', { defaultValue: 'The pipeline decides which printer, slicer profiles and filament are used. It is remembered for next prints.' }),
    noPipelines: t('makerworldCatalog.noPipelines', { defaultValue: 'No pipelines yet. Create one in More → Slicer Pipelines (printer + profiles), then come back.' }),
    openPipelines: t('makerworldCatalog.openPipelines', { defaultValue: 'Open Slicer Pipelines' }),
    noTarget: t('makerworldCatalog.noTarget', { defaultValue: 'no printer set' }),
    anyOf: t('makerworldCatalog.anyOf', { defaultValue: 'any' }),
    close: t('makerworldCatalog.close', { defaultValue: 'Close' }),
    stepImport: t('makerworldCatalog.stepImport', { defaultValue: 'Downloading the model to the library…' }),
    stepCheck: t('makerworldCatalog.stepCheck', { defaultValue: 'Checking printer and filament…' }),
    stepStart: t('makerworldCatalog.stepStart', { defaultValue: 'Starting slicing…' }),
    stepSlicing: t('makerworldCatalog.stepSlicing', { defaultValue: 'Slicing…' }),
    stepDispatching: t('makerworldCatalog.stepDispatching', { defaultValue: 'Sending to the printer…' }),
    stepQueued: t('makerworldCatalog.stepQueued', { defaultValue: 'Waiting in the pipeline queue…' }),
    done: t('makerworldCatalog.done', { defaultValue: 'Sent to the printer!' }),
    failed: t('makerworldCatalog.failed', { defaultValue: 'Print failed' }),
    cancelled: t('makerworldCatalog.cancelled', { defaultValue: 'Cancelled' }),
    noProfiles: t('makerworldCatalog.noProfiles', { defaultValue: 'This model has no printable profiles.' }),
    cloudRequired: t('makerworldCatalog.cloudRequired', { defaultValue: 'To download models the Bambuddy server must be signed in to Bambu Cloud.' }),
    openProfiles: t('makerworldCatalog.openProfiles', { defaultValue: 'Open Profiles' }),
    noPermission: t('makerworldCatalog.noPermission', { defaultValue: 'Your account is not allowed to import MakerWorld models or run pipelines.' }),
    issuesTitle: t('makerworldCatalog.issuesTitle', { defaultValue: 'Printer check found issues' }),
    printAnyway: t('makerworldCatalog.printAnyway', { defaultValue: 'Print anyway' }),
    cancel: t('makerworldCatalog.cancel', { defaultValue: 'Cancel' }),
    showRuns: t('makerworldCatalog.showRuns', { defaultValue: 'Pipeline runs' }),
  };
}

export type CatalogStrings = ReturnType<typeof buildStrings>;

/** Catalog strings translated into the current app language. */
export function useCatalogStrings(): CatalogStrings {
  const { t } = useTranslation();
  return useMemo(() => buildStrings(t), [t]);
}

export function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(values[key] ?? ''));
}
