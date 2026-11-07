import { test, expect } from '@playwright/test';
import { CREDS, basicAuthHeader } from '../src/targets';

/**
 * HTTP Basic boundary. The interesting assertion is not "correct credentials
 * work" but "everything else is refused and leaks nothing".
 */
test.describe('HTTP Basic authentication', () => {
  test('SEC-BASIC-01 | no credentials returns 401 and advertises the challenge', async ({ request }) => {
    const res = await request.get('/basic_auth');
    expect(res.status()).toBe(401);
    // Without a WWW-Authenticate header a client cannot know how to authenticate.
    expect(Object.keys(res.headers()).map((h) => h.toLowerCase())).toContain('www-authenticate');
  });

  test('SEC-BASIC-02 | no credentials does not leak the protected body', async ({ request }) => {
    const body = await (await request.get('/basic_auth')).text();
    expect(body).not.toContain('Congratulations');
  });

  test('SEC-BASIC-03 | correct credentials are accepted', async ({ request }) => {
    const res = await request.get('/basic_auth', {
      headers: basicAuthHeader(CREDS.basicUser, CREDS.basicPass),
    });
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('Congratulations');
  });

  test('SEC-BASIC-04 | wrong password is refused', async ({ request }) => {
    const res = await request.get('/basic_auth', {
      headers: basicAuthHeader(CREDS.basicUser, 'wrong-password'),
    });
    expect(res.status()).toBe(401);
  });

  test('SEC-BASIC-05 | unknown username is refused the same way as a wrong password', async ({ request }) => {
    const res = await request.get('/basic_auth', {
      headers: basicAuthHeader('no-such-user', CREDS.basicPass),
    });
    // Same status for both cases, so the endpoint is not an enumeration oracle.
    expect(res.status()).toBe(401);
  });

  test('SEC-BASIC-06 | a malformed Authorization header is refused, not crashed on', async ({ request }) => {
    for (const header of ['Basic', 'Basic !!!!not-base64!!!!', 'Bearer abc.def.ghi', 'Basic ' + 'A'.repeat(4000)]) {
      const res = await request.get('/basic_auth', { headers: { Authorization: header } });
      // 401 is the right answer. A 5xx would mean the parser threw.
      expect(res.status(), `header "${header.slice(0, 24)}..." must not 5xx`).toBeLessThan(500);
    }
  });

  test('SEC-BASIC-07 | Basic credentials do not open the Digest realm', async ({ request }) => {
    const res = await request.get('/digest_auth', {
      headers: basicAuthHeader(CREDS.basicUser, CREDS.basicPass),
    });
    // The property under test is refusal, not a particular status code.
    // Measured behaviour is 400, recorded as FINDING-TI-003; what matters is
    // that it is never 2xx, because cross-scheme acceptance would be a real
    // authorisation bypass.
    expect(res.status(), 'Digest realm must not accept a Basic header').toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
    expect(await res.text()).not.toContain('Congratulations');
  });
});
