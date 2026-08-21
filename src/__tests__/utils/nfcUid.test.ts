import { canonicalizeNfcUid } from '@/utils/nfcUid';

describe('canonicalizeNfcUid', () => {
  it.each([
    ['04:a1-b2 c3:d4:e5:f6', '04A1B2C3D4E5F6'],
    ['1234abcd', '1234ABCD'],
    ['CDAB3412', 'CDAB3412'],
    [' 12 34 AB CD ', '1234ABCD'],
  ])('canonicalizes %p without changing byte order', (input, expected) => {
    expect(canonicalizeNfcUid(input)).toEqual({
      ok: true,
      uid: expected,
    });
  });

  it.each(['', '123', '12:3G', '12.34'])(
    'rejects invalid UID %p without returning tag data',
    (input) => {
      const result = canonicalizeNfcUid(input);

      expect(result).toEqual({ ok: false, error: 'invalid_uid' });
      expect(result).not.toHaveProperty('uid');
    },
  );

  it('removes only ASCII whitespace, colon, and hyphen', () => {
    expect(canonicalizeNfcUid('\t12\n34\vAB\fCD\r')).toEqual({
      ok: true,
      uid: '1234ABCD',
    });
    expect(canonicalizeNfcUid('12\u00A034')).toEqual({
      ok: false,
      error: 'invalid_uid',
    });
    expect(canonicalizeNfcUid('12_34')).toEqual({
      ok: false,
      error: 'invalid_uid',
    });
  });
});
