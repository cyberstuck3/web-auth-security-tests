# Web authentication and authorisation security tests

Security boundary tests against
[the-internet.herokuapp.com](https://the-internet.herokuapp.com), an application
published by Elemental Selenium specifically for automation practice.

**34 tests, 34 passing** in 43.6 seconds.

```
34 passed (43.6s)
```

## Scope and authorisation

This suite only touches a target that exists to be automated against. It does
not scan, fuzz at volume, or attempt denial of service. Rate-limit and
brute-force testing are deliberately out of scope, because the host is shared
with other people practising on it.

Everything here is the kind of check that belongs in a regression suite: does
the boundary hold, and does a refusal leak anything.

## Running it

```bash
npm install
npx playwright install chromium
npm test
npm run test:authz       # just the authorisation matrix
npm run test:headers     # just transport and header hygiene
npm run report
```

## What is covered

| Spec | Test IDs | Focus |
|---|---|---|
| `01-basic-auth.spec.ts` | `SEC-BASIC-01` to `07` | challenge header, body leakage, wrong password, unknown user, malformed and oversized `Authorization`, cross-scheme refusal |
| `02-authz-matrix.spec.ts` | `SEC-AUTHZ-*` | three protected paths crossed with four credential states, plus path traversal |
| `03-form-login-session.spec.ts` | `SEC-FORM-01` to `08` | form login, session guard, logout invalidation, session fixation, field masking |
| `04-transport-and-headers.spec.ts` | `SEC-HDR-01` to `05` | plain HTTP, cookie flags, security headers, server banner, error-page leakage |

Findings are in [`docs/BUG-REPORT.md`](docs/BUG-REPORT.md).

## Four decisions worth explaining

**The assertion is the security property, not a status code.**
`/basic_auth` refuses with `401`. `/digest_auth` refuses a Basic header with
`400`. Both are correct refusals. An earlier version of this suite asserted
`401` everywhere and reported three correct refusals as defects. The tests now
assert that the response is a `4xx`, is not a `5xx`, and does not contain the
protected content, and the real status code is logged so the matrix documents
what actually happens.

That mistake is left in the git history on purpose. Choosing the wrong
assertion is how false positives get filed, and the fix was to ask what the
requirement really was.

**Traversal is judged on content, not status.**
`SEC-AUTHZ-02` fires three traversal encodings at the download route and asserts
the body never matches a `/etc/passwd` shadow line. A status-only assertion
would pass happily on a `200` that returned the file.

**A rejected request is checked for side effects.**
`SEC-AUTHZ-01` asserts the `401` and also that no `Content-Disposition` header
came back, so a refusal that still attaches the file would be caught.

**Header hygiene is inventoried, not failed.**
`SEC-HDR-03` records which security headers are present and which are absent,
and logs the result. A practice app is not expected to ship a full header set,
so failing on each absence would produce noise. The inventory is the finding,
and it lives in the report.

## Honest scope

- Rate limiting, account lockout, and brute-force protection: not tested, by
  choice. Testing them on a shared public host would degrade it for others.
- No authenticated session is reused across specs. Each one establishes what it
  needs, because session carry-over is part of what is under test here.
- Retries are 1 locally and 2 in CI. The host is a free dyno and cold-starts;
  that is flake, not a defect, and it should not be reported as one.
