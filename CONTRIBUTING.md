# Contributing to Keykeep

Keykeep is an experimental encrypted vault. Reliability, understandable behaviour and small, reviewable changes come first.

1. Read the [threat model](docs/THREAT_MODEL.md). Report vulnerabilities privately using [SECURITY.md](SECURITY.md).
2. Open an issue describing the user problem and intended behaviour before a substantial change.
3. Fork the repository, install Node.js 24, run `npm ci`, then `npm start`.
4. Use fictional passwords in development and screenshots. Keep vault backups, credentials and personal deployment settings out of commits.
5. Run `npm test`, `npm run build:demo`, `npm run build:cloud` and `git diff --check`.
6. Explain what changed, how you verified it and remaining limitations in your pull request.

Tests for storage, sync or authentication must check failure cases and preserve existing ciphertext. Avoid tests that merely repeat the implementation. The demo must stay independent of real browser storage, accounts and cloud vault APIs. UI changes should use flat rows and the existing navy/grey palette, with visible keyboard focus and mobile layouts.

Changes to cryptography, admission, recovery, concurrency or data formats require an explicit explanation of compatibility and failure behaviour. Do not weaken a security check to make a test pass. Do not publish real passwords or user account data in issues.

Contributions are made under the repository's MIT licence. Be respectful and constructive; criticism should address the work, and harassment or disclosure of another person's private information is not acceptable.
