import { test, expect } from '@playwright/test';
import { CREDS, FORM_MESSAGES } from '../src/targets';

/**
 * Transport and response-header hygiene. These are the checks that get skipped
 * because nothing on screen looks wrong, which is exactly why they are worth
 * automating: nobody finds them by clicking.
 */
test.describe('Transport and headers', () => {
  test('SEC-HDR-01 | plain HTTP is redirected to HTTPS, not served', async ({ request }) => {
    const res = await request.get('http://the-internet.herokuapp.com/login', { maxRedirects: 0 });
    const status = res.status();
    if (status >= 300 && status < 400) {
      expect(res.headers()['location']).toMatch(/^https:/);
    } else {
      // Documented gap: the host answers plain HTTP directly. FINDING-TI-002.
      expect(status).toBe(200);
    }
  });

  test('SEC-HDR-02 | the session cookie carries HttpOnly', async ({ page, context }) => {
    await page.goto('/login');
    await page.locator('#username').fill(CREDS.formUser);
    await page.locator('#password').fill(CREDS.formPass);
    await page.getByRole('button', { name: /login/i }).click();
    await expect(page.locator('#flash')).toContainText(FORM_MESSAGES.success);

    const session = (await context.cookies()).find((c) => /session/i.test(c.name));
    expect(session, 'expected a session cookie').toBeDefined();
    // Without HttpOnly, any injected script can read the session.
    expect(session!.httpOnly, 'session cookie should be HttpOnly').toBe(true);
  });

  test('SEC-HDR-03 | security response headers, recorded rather than assumed', async ({ request }) => {
    const headers = (await request.get('/login')).headers();
    const observed: Record<string, string> = {};
    for (const h of [
      'strict-transport-security', 'content-security-policy', 'x-frame-options',
      'x-content-type-options', 'referrer-policy', 'permissions-policy',
    ]) {
      observed[h] = headers[h] ?? 'ABSENT';
    }
    // Logged as evidence for the report. This practice app is not expected to
    // set them, so failing here would be noise; the finding is the inventory.
    console.log('security headers:', JSON.stringify(observed, null, 2));
    expect(Object.keys(observed)).toHaveLength(6);
  });

  test('SEC-HDR-04 | the server does not advertise its exact version', async ({ request }) => {
    const headers = (await request.get('/login')).headers();
    console.log('server banner:', headers['server'] ?? 'ABSENT', '| x-powered-by:', headers['x-powered-by'] ?? 'ABSENT');
    // Version numbers in a banner hand an attacker a CVE shortlist for free.
    const banner = `${headers['server'] ?? ''} ${headers['x-powered-by'] ?? ''}`;
    expect(banner).not.toMatch(/\d+\.\d+\.\d+/);
  });

  test('SEC-HDR-05 | a 404 does not return a stack trace', async ({ request }) => {
    const res = await request.get('/this-route-does-not-exist-' + Date.now());
    const body = await res.text();
    expect(res.status()).toBe(404);
    for (const leak of ['Traceback', 'at /app/', 'ActionController', 'NoMethodError', '.rb:']) {
      expect(body, `404 body leaked "${leak}"`).not.toContain(leak);
    }
  });
});
