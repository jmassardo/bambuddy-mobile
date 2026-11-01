import { translateNative } from '@/i18n';
import {
  errorCodes,
  isErrorWithCode,
  pick,
  types,
} from '@react-native-documents/picker';
import { parsePresetJson } from './profilePresets';
import { shareBlob } from './share';

export async function pickProfileJson(
  allowProfileArray = false,
): Promise<Record<string, unknown> | null> {
  try {
    const [file] = await pick({ type: [types.allFiles] });
    const response = await fetch(file.uri);
    const blob = await response.blob();
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () =>
        reject(new Error(translateNative('native.61f61df044ab4d4a')));
      reader.readAsText(blob);
    });
    if (allowProfileArray) {
      const value: unknown = JSON.parse(text);
      if (Array.isArray(value)) return { profiles: value };
    }
    return parsePresetJson(text);
  } catch (error) {
    if (isErrorWithCode(error) && error.code === errorCodes.OPERATION_CANCELED)
      return null;
    throw error;
  }
}

export function shareProfileJson(value: unknown, name: string) {
  return shareBlob(
    new Blob([JSON.stringify(value, null, 2)], {
      type: 'application/json',
      lastModified: Date.now(),
    }),
    `${name.replace(/[^a-z0-9._-]/gi, '_')}.json`,
  );
}
