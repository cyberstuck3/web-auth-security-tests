# Findings: the-internet.herokuapp.com

**Target:** `https://the-internet.herokuapp.com`
**Date:** 2026-11-08
**Method:** Playwright, 34 tests, all passing. HTTP-level plus a browser context
for the session work.
**Summary:** 3 findings (1 Medium, 2 Low), 1 observed inventory, 5 positive observations.

This is a practice application, so nothing here is a production incident. What
is on offer is the analysis: what was measured, what it would cost in a real
system, and a severity that can be defended rather than inflated.

---

## FINDING-TI-001 | The login form is a username-enumeration oracle

**Severity:** Medium
**Reproduced by:** `SEC-FORM-02`, `SEC-FORM-03`, `SEC-FORM-04`

`POST /authenticate` returns different messages depending on which half of the
credential pair was wrong:

| Input | Message |
|---|---|
| unknown username | `Your username is invalid!` |
| valid username, wrong password | `Your password is invalid!` |

### Impact
An attacker can submit a list of candidate usernames with any password and sort
valid accounts from invalid ones by reading the message. That converts a
credential-stuffing attempt from guessing pairs into guessing passwords for
accounts already confirmed to exist, which is a large reduction in work.

### Expected
One message for both cases, for example `Invalid username or password`.

### Actual
Two distinguishable messages.

### Note on the test
`SEC-FORM-04` is a characterisation test: it asserts that the two messages
**differ**, which is the defect. It therefore fails on the day the messages are
unified, which is exactly when this finding should be closed. For comparison,
both other targets in this portfolio get this right, and that is asserted as a
positive observation rather than left implicit.

---

## FINDING-TI-002 | Plain HTTP is served directly instead of redirected

**Severity:** Low (would be High with authentication over the same channel)
**Reproduced by:** `SEC-HDR-01`

### Measured
```
GET http://the-internet.herokuapp.com/login  ->  200, no Location header
```

The login page is served over cleartext HTTP. There is no redirect to HTTPS and
no `Strict-Transport-Security` header (see the inventory below), so a browser
has nothing telling it to upgrade.

### Impact
Low here because the credentials are published on the page itself and the app
holds nothing. In any real system this is the serious one on this list: a login
form reachable over cleartext means credentials can be read in transit, and the
absence of HSTS means even a user who types `https://` can be stripped back down
to HTTP on a hostile network.

### Expected
`301` to the `https://` equivalent, plus HSTS on the HTTPS response.

### Actual
`200` over cleartext, no HSTS.

---

## FINDING-TI-003 | The Digest realm answers a Basic header with `400` and no challenge

**Severity:** Low (contract correctness)
**Reproduced by:** `SEC-BASIC-07`, `SEC-AUTHZ-digest_auth-*`

### Measured
| Request to `/digest_auth` | Status | `WWW-Authenticate` |
|---|---|---|
| no `Authorization` header | `401` | `Digest realm="Protected Area", nonce=..., qop="auth"` |
| `Authorization: Basic <valid-looking>` | `400` | absent |
| `Authorization: Basic <wrong password>` | `400` | absent |
| `Authorization: Basic <unknown user>` | `400` | absent |
| `Authorization: Basic ` (empty) | `400` | absent |

### Assessment
Security-wise this is **correct**: the Digest realm does not accept Basic
credentials, so there is no cross-scheme bypass. The problem is the response.
A `400` with no `WWW-Authenticate` tells a client "your request was malformed"
rather than "authenticate like this", so a client that guessed the wrong scheme
has no machine-readable way to discover the right one.

### Expected
`401` with the Digest challenge, as the no-header case already returns.

### Actual
`400`, no challenge.

---

## OBS-TI-001 | Security response header inventory

**Severity:** Info (recorded, not failed)
**Reproduced by:** `SEC-HDR-03`

| Header | Value |
|---|---|
| `Strict-Transport-Security` | **absent** |
| `Content-Security-Policy` | **absent** |
| `X-Frame-Options` | `SAMEORIGIN` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | **absent** |
| `Permissions-Policy` | **absent** |

Two of six are set. The two that are set are the two that matter most for a
simple page: clickjacking and MIME sniffing are both covered. The absent HSTS
is what makes FINDING-TI-002 worse than it first looks.

Recorded as an inventory rather than six failing assertions. A practice app is
not expected to ship a full header set, and a report of six failures would say
less than one table does.

---

## Positive observations

Worth writing down, because these are the properties a later change quietly
removes, and these tests are what would catch it.

| ID | Observation | Test |
|---|---|---|
| `OBS-TI-002` | The session cookie carries `HttpOnly`, so injected script cannot read it | `SEC-HDR-02` |
| `OBS-TI-003` | The session id is reissued on login rather than carried over from before, so the app is not vulnerable to session fixation | `SEC-FORM-07` |
| `OBS-TI-004` | Logout genuinely invalidates: `/secure` by direct URL afterwards lands back on `/login` | `SEC-FORM-06` |
| `OBS-TI-005` | The server banner reads `Heroku` with no version, and `X-Powered-By` is absent, so no CVE shortlist is handed out for free | `SEC-HDR-04` |
| `OBS-TI-006` | Three path-traversal encodings against the download route return no `/etc/passwd` content, and a `404` carries no stack trace | `SEC-AUTHZ-02`, `SEC-HDR-05` |

`SEC-BASIC-06` also confirms that a bare `Basic`, non-base64 garbage, a `Bearer`
token, and a 4,000-character header are all refused with a `4xx` rather than
throwing a `5xx`, so the header parser handles hostile input without crashing.

---

## Not tested, and why

| Area | Reason |
|---|---|
| Rate limiting, lockout, brute force | Shared public host; testing this would degrade it for other users |
| Digest authentication happy path | Needs a nonce round trip; the refusal path is the security-relevant half |
| XSS and SQL injection payloads | This target has no input that reaches a store or a renderer worth probing |
| TLS cipher and certificate configuration | Belongs to a dedicated scanner, not a functional suite |
