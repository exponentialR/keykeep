# Threat model

Status: experimental beta, no independent audit. This describes current design and assumptions, not a security certification.

## Assets and trust boundaries

- Passwords, usernames, history and deletion records are AES-256-GCM ciphertext outside an unlocked browser session.
- A 16-byte random salt and PBKDF2-SHA-256 with 600,000 iterations derive a non-exportable Web Crypto key from the master password. Each encryption uses a fresh 12-byte random IV.
- Local display indexes contain entry names, IDs and timestamps in plaintext. They are untrusted; unlock authenticates and rebuilds them from ciphertext. Backups may contain the same index.
- Cloud API uploads strip the display index. The database stores ciphertext, version, owner identifier, write ID and update timestamp. The host also sees sign-in/request email addresses and access decisions.
- An email-authenticated session permits retrieval of one account's encrypted vault. Other approved users have distinct vault identities. Explicit owner aliases share one vault. Owner controls do not decrypt member vaults.
- Cookies are HttpOnly, Secure and SameSite=Lax. Mutations check origin and a custom request header. Admission is checked on private requests, including after revocation.
- The public demo uses fresh in-memory sample data, has no real account session and sends no vault data to a service. Reload discards its changes. Host it on a separate origin from the private service.

## What the design addresses

Authenticated encryption detects ciphertext tampering and a wrong master password. Cloud writes check the expected version and a persistent write ID, so a lost response can be retried without an extra version. Cooperating tabs use Web Locks and check storage snapshots. Conflicts require authenticated comparison, preserve encrypted originals, combine disjoint entries and require a decision for different versions of the same ID. Deleted-entry tombstones are preserved.

If a device or network fails during a combined upload, the combined local ciphertext remains pending and originals remain available. A changed cloud/local snapshot rejects a stale comparison. Recovery-storage quota failures abort before replacing the local vault.

## What remains outside those guarantees

- The server delivers the browser code. A malicious or compromised host could change that code to steal an entered master password or unlocked entries. Client-side encryption does not eliminate host trust.
- Browser extensions, malware, developer tools and someone using an unlocked device can access plaintext. JavaScript cannot guarantee memory erasure. Clipboard history and downloaded files are outside the app's control.
- Browser storage may be cleared or evicted. Local storage and an unacknowledged upload are not a durable cross-device backup. Export a separate encrypted backup and verify restoration with its original master password.
- A weak master password permits offline guessing against stolen ciphertext. Email account security protects sign-in, not encryption.
- Changing a master password does not revoke old backups or retained cloud ciphertext versions. Those still require the original master password. Revocation cannot recall downloaded data or mail already in flight.
- OIDC provider availability, DNS, email delivery and hosting account compromise remain external dependencies. A Resend acceptance is not proof of inbox placement.
- Names and dates visible while locked are intentional metadata exposure. Deletion is reversible; historical secrets remain encrypted in backups/history. No permanent-purge or cryptographic erasure guarantee is offered.
- No recovery mechanism can retrieve a forgotten master password. There is no independent review or cross-browser certification yet.

## Review priorities

Cryptographic envelope validation, wrong-password/tampering paths, OIDC claims/PKCE/state/nonce, session isolation, CSRF, CSP/XSS, stale-tab key changes, interrupted sync, conflict reconciliation, tombstones/history, backup import and dependency/build integrity.

See [REVIEW_BRIEF.md](REVIEW_BRIEF.md) and [VERIFICATION.md](VERIFICATION.md).
