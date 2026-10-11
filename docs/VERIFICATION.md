# Verification record

Release candidate: 0.2.0-beta.2. Recorded 11 October 2026.

## Automated checks

- `npm test`: 31 passed, zero failures.
- `npm audit --omit=dev`: no known advisories at the recorded run. This is a dependency check, not a source audit.
- `npm run build:demo`: creates the isolated static demonstration.
- `npm run build:cloud`: bundles the Pages Worker and private application assets.
- `git diff --check`: formatting check.

Tests cover generation; wrong-password/tamper rejection; large encryption; application save/unlock/edit/history/delete/restore/rekey; account isolation and legacy migration; Worker admission, conditional writes and encrypted history; durable approval email retries; and sync/recovery failures.

The two-client integration test runs actual encryption, isolated in-memory client storage, the Worker and SQLite. It verifies offline writes, competing device versions, disjoint reconciliation, recovery originals and master-password rotation. Sessions are synthetic. This is **not** a real two-PC OIDC/email-code trial.

## Browser observations

Chrome sample-only demo: inspected generator, three unlocked fictional entries, edit/history, lock and reset on reload. Keyboard Enter opened Saved passwords and submitted the sample unlock form. The public deployed demo saved a fourth fictional entry, then reloaded to the original three locked entries, with cloud controls hidden and no console errors. Inspected the 390px layout and checked document width equals viewport width. Screenshots and walkthrough use synthetic entries only.

The private hosted rollout retained the cloud ciphertext hash and locally listed entries across deployment/reload. This is deployment-persistence evidence, not a claim that previously missing unsynced passwords were recovered. Existing conflicts still require their owner to unlock and review both copies.

### Browser sync fixture

On two isolated loopback origins in Chrome, a disposable SQLite-backed fixture used the real Worker and production UI with synthetic sessions. The fixture adapted HTTP test origins to the cloud startup path; no production authentication was changed or exercised. One client saved conflicting and disjoint edits while its test transport was paused; the other edited the same entry and deleted a second one. After reconnection, the comparison required explicit choices. Keeping both competing versions and the cloud deletion produced three active entries and one recoverable deletion on the second client. Both encrypted originals were listed for download, and the combined vault locked after upload.

The comparison UI was updated to show usernames, creation/deletion dates and expandable masked history, so differences in those fields can be reviewed before choosing a copy. Current and historical password fields were masked until explicitly revealed. Cancelling removed comparison fields and locked the vault. A second combination retained all four encrypted original copies from both resolutions. A cooperating tab on the same origin locked immediately after an edit in its sibling, removing its rendered password inputs. This remains a synthetic local UI trial, not real multi-PC email authentication.

## Explicit limits

- No independent security audit or penetration test.
- No organised external beta or acceptance result.
- No completed real newly approved member, two-PC email-code/sync/conflict/rekey trial.
- No Safari/Firefox/mobile-device certification or OS installation verification.
- Hosted offline reopening is unsupported. Browser installation support varies.
- Public demo reset is intentional; it cannot preserve passwords across reloads.

The release is experimental. Version 1.0 is not claimed.
