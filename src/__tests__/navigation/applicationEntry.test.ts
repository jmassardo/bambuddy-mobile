import { applicationLandingState, parseConnectAuthorizeLink } from '@/navigation/applicationEntry';
import { BUILT_IN_NAV_ITEMS } from '@/navigation/navigationConfig';

describe('application entry', () => {
  const consent = 'bambuddy://connect/authorize?client_id=client&redirect_uri=myapp%3A%2F%2Fcallback&code_challenge=challenge&code_challenge_method=S256&state=state';

  it('preserves registered consent parameters without accepting a server switch', () => {
    expect(parseConnectAuthorizeLink(`${consent}&server=https://untrusted.test`)).toEqual({
      client_id: 'client', redirect_uri: 'myapp://callback', code_challenge: 'challenge', code_challenge_method: 'S256', state: 'state',
    });
  });

  it('handles custom-scheme consent on the native URL runtime and retains encoded callback/state data', () => {
      const originalURL = globalThis.URL;
      try {
        globalThis.URL = class extends originalURL {
          get hostname() { return ''; }
          get pathname() { return '/'; }
        };
        const url = `${consent.replace('state=state', 'state=a%3Db%2Bc+d')}&ignored=value`;
        expect(parseConnectAuthorizeLink(url)).toEqual(expect.objectContaining({
          redirect_uri: 'myapp://callback', state: 'a=b+c d',
        }));
      } finally {
        globalThis.URL = originalURL;
      }
  });

  it.each([
    consent.replace('S256', 'plain'),
    consent.replace('bambuddy:', 'https:'),
    consent.replace('/authorize', '/other'),
    consent.replace('client_id=client', 'client_id='),
    `${consent}&client_id=other`,
    `${consent}&state=other`,
    consent.replace('state=state', 'state=%invalid'),
    'bambuddy://oidc/callback?token=other',
    'invalid',
  ])('does not route malformed or unrelated links: %s', url => {
    expect(parseConnectAuthorizeLink(url)).toBeNull();
  });

  it('constructs stack landings with the permitted main tab underneath', () => {
    const items = BUILT_IN_NAV_ITEMS.filter(item => ['queue', 'more', 'slicer-pipelines'].includes(item.id));
    expect(applicationLandingState('slicer-pipelines', items)).toEqual({
      index: 1,
      routes: [{ name: 'Main', params: { screen: 'Queue' } }, { name: 'SlicerPipelines' }],
    });
  });

  it('falls back to a visible, permitted tab when the saved destination is removed', () => {
    const items = BUILT_IN_NAV_ITEMS.filter(item => ['files', 'more'].includes(item.id));
    expect(applicationLandingState('finance', items)).toEqual({
      index: 0, routes: [{ name: 'Main', params: { screen: 'Files' } }],
    });
    expect(applicationLandingState('queue', BUILT_IN_NAV_ITEMS)).toEqual({
      index: 0, routes: [{ name: 'Main', params: { screen: 'Queue' } }],
    });
  });
});
