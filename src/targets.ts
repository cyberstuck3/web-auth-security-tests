export const CREDS = {
  basicUser: process.env.BASIC_USER ?? 'admin',
  basicPass: process.env.BASIC_PASS ?? 'admin',
  formUser: process.env.FORM_USER ?? 'tomsmith',
  formPass: process.env.FORM_PASS ?? 'SuperSecretPassword!',
};

/** Paths that must not serve their content without credentials. */
export const PROTECTED_PATHS = ['/basic_auth', '/digest_auth', '/download_secure'] as const;

export const FORM_MESSAGES = {
  success: 'You logged into a secure area!',
  badUser: 'Your username is invalid!',
  badPass: 'Your password is invalid!',
  loggedOut: 'You logged out of the secure area!',
} as const;

/** Builds an HTTP Basic header without leaking the value into a log line. */
export function basicAuthHeader(user: string, pass: string): Record<string, string> {
  return { Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64') };
}
