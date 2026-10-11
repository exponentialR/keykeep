# Launch drafts

These drafts are not published. Use the experimental wording while no independent review is available. Version 1.0 is not ready solely because CI passes.

## Short beta announcement

I've open-sourced Keykeep: a small encrypted password vault with a flat interface, local operation and optional Cloudflare sync.

The sample demo resets on reload, so you can try generating, saving, editing and restoring fictional passwords without an account. The repository includes the threat model, tests and self-hosting instructions.

It's an experimental beta, not independently audited yet. I'd welcome feedback on usability, sync/recovery and the security design.

Repository: https://github.com/exponentialR/keykeep
Demo: https://keykeep-demo.pages.dev

## Technical write-up draft

Title: Building a small encrypted vault: the difficult part was keeping both copies

Keykeep began as a password generator with named saves. Adding multi-PC use changed the hard problem: a browser can say a password is saved while its cloud upload is still pending, and two devices can edit the same vault while disconnected.

The app encrypts entries in the browser and uploads ciphertext with an expected server version and a persistent write ID. A lost response can be retried. A version conflict keeps the local copy intact. Authenticated comparison combines entries unique to either side and asks the user what to keep when an entry differs; encrypted originals remain downloadable.

The demo uses fictional accounts in memory and resets on reload. The local app can run without a cloud service. Self-hosted sync adds email sign-in, account isolation, approval controls and an optional approval-email outbox.

Client-side encryption has limits: the host delivers the JavaScript, browser malware can read an unlocked vault, names are locally visible while locked, old backups retain old secrets, and a forgotten master password cannot be recovered. Those limits are documented alongside the tests.

This beta is an invitation to review and improve the implementation. No independent review or organised beta is scheduled. This publication is an experimental preview, with no stable-release security claim.

## Walkthrough storyboard

1. Generate a sample password and choose its strength.
2. Open Saved passwords; unlock using the displayed demo password.
3. Edit a fictional entry and inspect its history.
4. Lock again and show the sample-only/reset notice.

Show only the public demo. Do not film a personal vault, owner email or hosting dashboard.
