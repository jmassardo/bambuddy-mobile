import { useSyncExternalStore } from 'react';
import { getFormattingPreferences, subscribeFormattingPreferences } from '@/utils/preferences';

/** Subscribe where formatted values (including props/memoized rows) are produced. */
export function useFormattingPreferences() {
  return useSyncExternalStore(subscribeFormattingPreferences, getFormattingPreferences, getFormattingPreferences);
}
