import { test, expect } from '@playwright/test';
import { CREDS, PROTECTED_PATHS, basicAuthHeader } from '../src/targets';

/**
 * Every protected path crossed with every credential state. Per-path tests pass
 * while leaving cells unchecked; a matrix turns a gap into a failing cell.
 */
const STATES = [
  { id: 'absent',    label: 'no Authorization header', headers: () => ({}) },
  { id: 'empty',     label: 'empty Basic value',       headers: () => ({ Authorization: 'Basic ' }) },
  { id: 'wrongPass', label: 'valid user, wrong pass',  headers: () => basicAuthHeader(CREDS.basicUser, 'nope') },
  { id: 'wrongUser', label: 'unknown user',            headers: () => basicAuthHeader('ghost', CREDS.basicPass) },
] as const;

test.describe('Authorisation matrix', () => {
  for (const path of PROTECTED_PATHS) {
    for (const state of STATES) {
      test(`SEC-AUTHZ-${path.replace(/\//g, '')}-${state.id} | ${path} with ${state.label} is refused`, async ({ request }) => {
        const res = await request.get(path, { headers: state.headers() });

        // Assert the security property (refused, nothing leaked) rather than one
        // status code. /basic_auth answers 401; /digest_auth answers 400 to a
        // Basic header. Both are refusals, and pinning 401 would have reported a
        // correct refusal as a defect.
        expect(res.status(), `${path} must refuse: ${state.label}`).toBeGreaterThanOrEqual(400);
        expect(res.status(), `${path} must not 5xx on: ${state.label}`).toBeLessThan(500);
        expect(await res.text()).not.toContain('Congratulations');

        // The actual code is recorded so the matrix documents reality.
        console.log(`AUTHZ ${path} | ${state.label} -> ${res.status()}`);
      });
    }
  }

  test('SEC-AUTHZ-01 | the secure download is not reachable unauthenticated', async ({ request }) => {
    const res = await request.get('/download_secure');
    expect(res.status()).toBe(401);
    // A 401 that still attaches the file would be the defect worth finding.
    expect(res.headers()['content-disposition']).toBeUndefined();
  });

  test('SEC-AUTHZ-02 | path traversal in a download parameter does not escape the directory', async ({ request }) => {
    for (const probe of ['../../../../etc/passwd', '..%2f..%2f..%2fetc%2fpasswd', '....//....//etc/passwd']) {
      const res = await request.get(`/download/${probe}`);
      const body = await res.text().catch(() => '');
      // The check is on content, not status: a 200 that returns a shadow file
      // is the finding, and a status-only assertion would miss it.
      expect(body, `traversal probe leaked passwd content: ${probe}`).not.toMatch(/root:.*:0:0:/);
    }
  });
});
