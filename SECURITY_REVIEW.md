# Implementation review and verification

Updated 11 October 2026. This is an implementing-agent source review and functional verification record. **It is not an independent security audit or penetration test.**

## Safeguards implemented

- Secure unbiased generation with required character groups; AES-256-GCM encryption and PBKDF2-derived non-exportable keys.
- Validated envelopes and authenticated entry schemas, including unique IDs and bounded revision history.
- Exclusive Web Locks and stored-snapshot checks for cooperating tabs; stale writes fail closed.
- Backup authentication before replacement, fresh salt/key on master-password rotation, and secret-bearing field clearance on lock.
- Ciphertext-only cloud writes, account-scoped storage, server admission, conditional versions and retry IDs.
- Conflict comparison after unlocking both authenticated copies. Disjoint entries and deleted-entry tombstones are retained; competing edits require an explicit choice. Both encrypted originals are preserved before replacement. Quota failure aborts replacement; network failure keeps the combined local copy pending.
- Approved members use separate vaults. Owner aliases are explicitly configured; stale account tabs must present the correct vault identifier.
- Durable email outbox, cross-worker reservation and immutable idempotent retry payloads. Approval and email delivery are distinct.
- Loopback-only development server, explicit asset routes, restrictive CSP, no analytics or remote fonts/scripts.
- Hosted private app files are not cached for offline reopening. The service worker retires earlier app-shell caches. Historical offline-opening results from earlier versions do not describe this release.
- Public demo uses fresh memory-only synthetic vaults and has no cloud connection or persistent browser storage.

See [docs/VERIFICATION.md](docs/VERIFICATION.md) for current commands, browser observations and limitations. See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for metadata disclosure, hosting trust, retained copies, clipboard/device risks and recovery limits.

No independent reviewer or organised beta group is scheduled. This release stays experimental; automated tests and dependency advisory checks do not establish production security.
