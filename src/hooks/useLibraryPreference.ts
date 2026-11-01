import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function useLibraryPreference<T>(key: string, initial: T) {
  const [value, setValue] = useState(initial);
  const loaded = useRef(false);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(`library.preference.${key}`).then(stored => {
      if (active && stored !== null) {
        try {
          const parsed: unknown = JSON.parse(stored);
          if (typeof parsed === typeof initial) setValue(parsed as T);
        } catch { /* Use the default when an older preference cannot be read. */ }
      }
    }).catch(() => {}).finally(() => { loaded.current = true; });
    return () => { active = false; };
    // The preference key and default are fixed for the lifetime of a control.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (loaded.current) void AsyncStorage.setItem(`library.preference.${key}`, JSON.stringify(value)).catch(() => {});
  }, [key, value]);
  return [value, setValue] as const;
}
