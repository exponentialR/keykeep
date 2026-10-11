# Independent security review brief

This is a reusable scope for a possible future review. No review is scheduled; the owner declined organising one for this preview.

## Possible outcome

Review the public release candidate independently of its implementing agent. Produce reproducible findings, severity, recommended remediation and a follow-up assessment against the exact corrected commit. A source scan alone is not an independent audit.

## Scope

Browser generation/encryption/decryption and vault validation (`crypto.js`); account-scoped storage and migration (`account.js`); entry/history/deletion model; backup import/export; concurrency, sync and conflict recovery (`sync.js`, `reconcile.js`, `app.js`); Cloudflare Worker OIDC/session/admission/vault APIs; D1 schema/history/outbox; Resend retry semantics; public demo isolation; hosting/build configuration and dependencies.

## Important questions

1. Can any unauthorised account retrieve or overwrite another account's ciphertext? Can an alias be confused with a member identity?
2. Do PKCE, state, nonce, issuer/audience/signature/expiry validation and CSRF checks fail closed?
3. Can a stale tab, a lost response, a network partition, key rotation or a cloud rollback lose a pending local change?
4. Are conflicting edits, deletion tombstones and historical versions preserved and clearly presented?
5. Can malformed imports, excessive sizes or storage quota failures replace a valid vault?
6. Does any plaintext or master password reach logs, URLs, the API, email or persisted browser state?
7. Are the demo, private app and deployment credentials separated correctly?

## Evidence to provide

Exact repository commit, lockfile, build output, CI run, source-review notes, synthetic reproduction instructions and a test deployment owned by the reviewer. Use synthetic accounts/vaults. Access to Samuel's personal production vault is excluded. No real user credentials or vaults should be requested.

## Deliverables and gates

Findings report with explicit limitations; remediation issues privately for vulnerabilities; verified fixes; an agreed public summary. No reviewer, payment or engagement has been arranged. Any future review would require a separate decision.
