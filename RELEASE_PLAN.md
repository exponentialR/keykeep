# Keykeep release plan

Started 11 October 2026. Positioning: a small, self-hostable encrypted password vault with optional cloud sync.

## Current scope

1. Reliability: preserve sync conflicts and encrypted recovery copies; distinguish local saves from cloud acknowledgement; verify restore, rekey and simulated two-device reconciliation.
2. Product polish: compact flat navy/grey UI, mobile layout, keyboard access and clear unlock/save states.
3. Open source: generic configuration, MIT licence, contribution/security guidance, threat model, CI and a clean public repository without private deployment history.
4. Public preview: separate sample-only demo, screenshots, walkthrough and an experimental prerelease.
5. Launch preparation: technical write-up and announcement drafts. No community messages are sent without a concrete destination and instruction.

## Owner decision

The owner declined organising a beta group or security reviewer. No paid review, reviewer recruitment or invitations are planned. The release remains explicitly experimental and unaudited. A stable 1.0 security claim is not part of this launch.

## Verification boundaries

Actual evidence and remaining limitations are tracked in [docs/VERIFICATION.md](docs/VERIFICATION.md). Personal sync conflicts require the owner's master password and decisions; deployments do not authorise reading or choosing between their private passwords. GitHub Trending is an aspiration, not a guaranteed result or release criterion.
