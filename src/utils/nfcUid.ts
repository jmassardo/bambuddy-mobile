export type NfcUidResult =
  | { ok: true; uid: string }
  | { ok: false; error: 'invalid_uid' };

const REMOVABLE_CHARACTERS = ' \t\n\v\f\r:-';
const HEXADECIMAL = /^[0-9A-Fa-f]+$/;

/**
 * Converts the platform-provided NFC tag identifier to its canonical form
 * without changing the byte order reported by the native NFC provider.
 */
export function canonicalizeNfcUid(value: string): NfcUidResult {
  const uid = Array.from(value)
    .filter((character) => !REMOVABLE_CHARACTERS.includes(character))
    .join('');

  if (uid.length === 0 || uid.length % 2 !== 0 || !HEXADECIMAL.test(uid)) {
    return { ok: false, error: 'invalid_uid' };
  }

  return { ok: true, uid: uid.toUpperCase() };
}
