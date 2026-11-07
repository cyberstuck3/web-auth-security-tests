import { test, expect } from '@playwright/test';
import { CREDS, FORM_MESSAGES } from '../src/targets';

/**
 * Form login and session lifecycle. Needs a real browser context because the
 * subject is the cookie the browser is handed and what it still opens later.
 */
test.describe('Form login and session lifecycle', () => {
  async function login(page: import('@playwright/test').Page, user: string, pass: string) {
    await page.goto('/login');
    await page.locator('#username').fill(user);
    await page.locator('#password').fill(pass);
    await page.getByRole('button', { name: /login/i }).click();
  }

  test('SEC-FORM-01 | valid credentials reach the secure area', async ({ page }) => {
    await login(page, CREDS.formUser, CREDS.formPass);
    await expect(page.locator('#flash')).toContainText(FORM_MESSAGES.success);
    expect(new URL(page.url()).pathname).toBe('/secure');
  });

  test('SEC-FORM-02 | an unknown username is rejected', async ({ page }) => {
    await login(page, 'not-a-user', CREDS.formPass);
    await expect(page.locator('#flash')).toContainText(FORM_MESSAGES.badUser);
    expect(new URL(page.url()).pathname).not.toBe('/secure');
  });

  test('SEC-FORM-03 | a wrong password is rejected', async ({ page }) => {
    await login(page, CREDS.formUser, 'wrong-password');
    await expect(page.locator('#flash')).toContainText(FORM_MESSAGES.badPass);
  });

  test('SEC-FORM-04 | the error wording distinguishes a bad user from a bad password', async ({ page }) => {
    // Characterisation, not approval. Distinct messages confirm a valid
    // username, which is a username-enumeration oracle. Written up as
    // FINDING-TI-001 rather than asserted as correct behaviour.
    await login(page, 'not-a-user', CREDS.formPass);
    const unknownUser = await page.locator('#flash').textContent();

    await login(page, CREDS.formUser, 'wrong-password');
    const wrongPass = await page.locator('#flash').textContent();

    expect(unknownUser).not.toBe(wrongPass);
  });

  test('SEC-FORM-05 | /secure is not reachable without logging in', async ({ page }) => {
    await page.goto('/secure');
    await expect(page.locator('#flash')).toContainText(/you must login/i);
    expect(new URL(page.url()).pathname).toBe('/login');
  });

  test('SEC-FORM-06 | logging out invalidates the session for a direct URL', async ({ page }) => {
    await login(page, CREDS.formUser, CREDS.formPass);
    await page.getByRole('link', { name: /logout/i }).click();
    await expect(page.locator('#flash')).toContainText(FORM_MESSAGES.loggedOut);

    // The real test of a logout: does the old route still open?
    await page.goto('/secure');
    expect(new URL(page.url()).pathname).toBe('/login');
  });

  test('SEC-FORM-07 | the session id is reissued on login, not carried over', async ({ page, context }) => {
    await page.goto('/login');
    const before = (await context.cookies()).find((c) => /session/i.test(c.name))?.value;

    await page.locator('#username').fill(CREDS.formUser);
    await page.locator('#password').fill(CREDS.formPass);
    await page.getByRole('button', { name: /login/i }).click();
    await expect(page.locator('#flash')).toContainText(FORM_MESSAGES.success);

    const after = (await context.cookies()).find((c) => /session/i.test(c.name))?.value;
    // A pre-login session id that survives authentication unchanged is session
    // fixation: an attacker who planted the id is now inside the account.
    expect(after, 'expected a session cookie after login').toBeTruthy();
    if (before) expect(after).not.toBe(before);
  });

  test('SEC-FORM-08 | the password field is masked and the typed value is not serialised into the DOM', async ({ page }) => {
    await page.goto('/login');
    const field = page.locator('#password');
    await expect(field).toHaveAttribute('type', 'password');

    await field.fill(CREDS.formPass);

    // The value must live in the element's property, not in the markup. A typed
    // password that appears in outerHTML ends up in any DOM snapshot, error
    // report, or session replay recording.
    expect(await field.evaluate((el) => (el as HTMLInputElement).value)).toBe(CREDS.formPass);
    expect(await field.evaluate((el) => el.outerHTML)).not.toContain(CREDS.formPass);

    // Note: this page prints its own demo credentials in the instructions, so
    // the whole-page text cannot be asserted here. That is the practice site
    // documenting itself, not a leak.
  });
});
