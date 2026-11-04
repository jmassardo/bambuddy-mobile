import { buildApiKeyEnrollment } from '@/utils/authSecurity';
import { parseServerEnrollment } from '@/utils/serverEnrollment';

it('reads the native server enrollment format without putting the key in the server URL', () => {
  const payload = buildApiKeyEnrollment('https://farm.example.test/bambuddy/', 'bb_fixture-key_123');
  expect(parseServerEnrollment(` ${payload} `)).toEqual({
    serverUrl: 'https://farm.example.test/bambuddy',
    apiKey: 'bb_fixture-key_123',
  });
  expect(parseServerEnrollment('https://farm.example.test/')).toEqual({
    serverUrl: 'https://farm.example.test',
  });
});

it('decodes enrollment with the partial React Native global URL implementation', () => {
  const original = globalThis.URL;
  globalThis.URL = jest.requireActual<{ URL: typeof URL }>('react-native/Libraries/Blob/URL').URL;
  try {
    expect(parseServerEnrollment(buildApiKeyEnrollment('https://farm.test/proxy', 'bb_fixture'))).toEqual({
      serverUrl: 'https://farm.test/proxy',
      apiKey: 'bb_fixture',
    });
  } finally {
    globalThis.URL = original;
  }
});

it.each([
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://192.168.1.12',
  'http://10.0.0.8',
  'http://172.16.0.8',
  'http://bambuddy.local',
])('retains explicit local HTTP support for %s', server => {
  expect(parseServerEnrollment(buildApiKeyEnrollment(server, 'bb_fixture'))).toEqual({
    serverUrl: server,
    apiKey: 'bb_fixture',
  });
});

it.each([
  'not a URL',
  'bambuddy://config?v=2&url=https%3A%2F%2Ffarm.test&key=bb_fixture',
  'bambuddy://config?v=1&v=1&url=https%3A%2F%2Ffarm.test&key=bb_fixture',
  'bambuddy://config?v=1&url=https%3A%2F%2Ffarm.test&key=bb_one&key=bb_two',
  'bambuddy://config?v=1&url=https%3A%2F%2Ffarm.test',
  'bambuddy://config?v=1&url=https%3A%2F%2Ffarm.test&key=bb_bad%0Aheader',
  'bambuddy://other?v=1&url=https%3A%2F%2Ffarm.test&key=bb_fixture',
  'bambuddy://config/other?v=1&url=https%3A%2F%2Ffarm.test&key=bb_fixture',
  buildApiKeyEnrollment('https://user:password@farm.test', 'bb_fixture'),
  buildApiKeyEnrollment('https://farm.test?key=bb_hidden', 'bb_fixture'),
  buildApiKeyEnrollment('https://farm.test#secret', 'bb_fixture'),
  buildApiKeyEnrollment('http://public.example.test', 'bb_fixture'),
  buildApiKeyEnrollment('http://192.168.1.999', 'bb_fixture'),
])('rejects malformed or unsupported QR input %#', payload => {
  expect(parseServerEnrollment(payload)).toBeNull();
});
