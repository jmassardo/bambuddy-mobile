import { pickNumber, type ApiRecord } from '@/utils/data';

export type MakerworldModelRef = { modelId: number; profileId: number | null; url: string };

const MODEL_RE = /^https?:\/\/(?:www\.)?makerworld\.com(?:\/[a-z]{2}(?:-[a-z]{2,4})?)?\/models\/(\d+)/i;
const PROFILE_RE = /profileId[-=](\d+)/i;

/** Extracts the MakerWorld model (and optional print profile) from a page URL. */
export function parseMakerworldModelUrl(url: string | null | undefined): MakerworldModelRef | null {
  if (!url) return null;
  const match = MODEL_RE.exec(url.trim());
  if (!match) return null;
  const modelId = Number(match[1]);
  if (!Number.isSafeInteger(modelId) || modelId <= 0) return null;
  const profile = PROFILE_RE.exec(url);
  const profileId = profile ? Number(profile[1]) : null;
  return {
    modelId,
    profileId: profileId !== null && Number.isSafeInteger(profileId) && profileId > 0 ? profileId : null,
    url: url.trim(),
  };
}

/**
 * Picks the print profile to use for a one-tap print: the profile selected on
 * the MakerWorld page when there is one, otherwise the first (default) profile.
 */
export function pickOneTapInstance(instances: ApiRecord[], profileId: number | null): ApiRecord | null {
  if (!instances.length) return null;
  if (profileId !== null) {
    // MakerWorld's `#profileId-N` hash carries the instance id; accept either field.
    const selected = instances.find(item => pickNumber(item, ['id'], NaN) === profileId)
      ?? instances.find(item => pickNumber(item, ['profileId'], NaN) === profileId);
    if (selected) return selected;
  }
  return instances.find(item => item.isDefault === true) ?? instances[0];
}

export const PIPELINE_TERMINAL_STATUSES = ['completed', 'failed', 'partial_failure', 'cancelled'] as const;
export const PIPELINE_BLOCKING_ISSUES = ['printer_not_set', 'printer_not_found', 'class_not_set', 'no_class_matches'];

export function oneTapPipelineStorageKey(serverUrl: string | null | undefined) {
  return `bambuddy.makerworldOneTap.pipeline:${serverUrl ?? ''}`;
}
