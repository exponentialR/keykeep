# Host Keykeep with optional cloud sync

The cloud build serves a public homepage at `/`, a separate request form at `/request-access`, an admitted-user app at `/app`, and an owner page at `/admin`. Each approved member has a separate encrypted vault. Optional owner aliases share one fixed owner vault.

This guide describes an experimental deployment, not a security certification. Read the [threat model](docs/THREAT_MODEL.md) first. Start with synthetic entries and retain encrypted backups.

## Requirements

- Node.js 24+, a Cloudflare account, Pages project and D1 database.
- A canonical HTTPS address such as `https://vault.example.com`.
- An OIDC provider supporting confidential-client authorisation-code flow with PKCE, verified email claims and JWKS. Cloudflare Access SaaS OIDC is the implemented deployment path.
- Optionally, a verified Resend sending domain and a sending-only API key.

A Pages subdomain works without a custom domain. For a custom subdomain, keep your existing registrar and DNS provider: add only the CNAME required by Pages after attaching that hostname to the Pages project. There is no need to migrate all DNS or change nameservers. Follow [Cloudflare's custom-domain instructions](https://developers.cloudflare.com/pages/configuration/custom-domains/).

## Configure and deploy

1. Run `npm ci`, then `npx wrangler login` with your own Cloudflare account.
2. Create a Pages project: `npx wrangler pages project create YOUR_PROJECT --production-branch main`.
3. Create D1: `npx wrangler d1 create YOUR_DATABASE`.
4. Copy `wrangler.jsonc` into ignored `.local/wrangler.jsonc`. Set `pages_build_output_dir` to `../dist`; set project name and your D1 database name/ID.
5. Set `ORIGIN` to the exact canonical HTTPS origin. Set `ALLOWED_EMAILS` to comma-separated owner/admin email addresses and `VAULT_OWNER` to the stable original owner address. Other users require approval in `/admin`. Changing `VAULT_OWNER` changes the owner vault lookup; do not rename it casually.
6. Set `OIDC_CLIENT_ID` and `OIDC_ISSUER`. Register the exact callback `https://vault.example.com/auth/callback` with your provider. Configure `openid email` scopes and PKCE. See [Cloudflare's SaaS OIDC guide](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/saas-apps/generic-oidc-saas/). For its email PIN path, the provider verifies the email; Keykeep still checks current approval for each private request.
7. Apply `cloud/schema.sql` to your D1 database. From `.local`, run `npx wrangler d1 execute YOUR_DATABASE --remote --file ../cloud/schema.sql`. Do not point this command at an unrelated database.
8. From `.local`, run `npx wrangler pages secret put OIDC_CLIENT_SECRET --project-name YOUR_PROJECT` and enter the provider secret directly into the CLI prompt. Never put it in source, chat, frontend code or screenshots.
9. Return to the repo root. Run `npm test`, `npm run build:cloud`, then `npm run deploy:personal`. The deployment script reads only the ignored private configuration.
10. Attach your custom domain if applicable. Verify sign-in, approval, sign-out, isolated user vaults and two-device sync using fictional credentials before storing real passwords.

The build uses an explicit file allowlist and bundled Pages Worker. Keep `.local`, `.env`, `.dev.vars`, vault backups and build outputs out of Git. A committed template still requires all placeholders to be replaced in your private configuration.

## Approval emails (optional)

Verify a sending domain with Resend using the records it provides at your existing DNS provider. Prefer a dedicated subdomain such as `notify.example.com`. Keep unrelated website/mail records unchanged.

Set `EMAIL_FROM` in `.local/wrangler.jsonc`, for example `Keykeep <access@notify.example.com>`. From `.local`, run `npx wrangler pages secret put RESEND_API_KEY --project-name YOUR_PROJECT` and enter a sending-only key, then redeploy. Approval remains valid if email delivery fails.

Approvals enqueue a durable D1 outbox record. A cross-worker lease, persisted payload and stable provider idempotency key protect retry. Pending/failed sends are retried explicitly from `/admin`; there is no scheduler. After 23 hours from the first attempt, an uncertain result requires provider-log review. The UI distinguishes provider acceptance from inbox delivery. Use the owner-only test control only for an authorised owner recipient. Disable sender open/click tracking.

## Sync, conflicts and recovery

The browser sends only the encrypted envelope, not its local name/date index, plaintext or master password. Sessions are established through checked OIDC state, nonce, PKCE and signed claims. Vault writes require the matching account vault identifier, same-origin request checks, a conditional server version and persistent write ID.

Pending offline writes remain local. Conflicts do not silently overwrite either side. Compare both copies using their master passwords, choose between competing edits, and preserve both encrypted originals before saving the combined vault. Recovery copies remain downloadable. Export before resolving a conflict and before clearing browser storage.

D1 retains previous encrypted versions through a trigger. There is currently no server-history restore UI or retention pruning. Old versions still use their old master password after rotation. Changing a password or revoking access cannot recall previously downloaded copies.

The hosted app requires online admission when opened. Private files are not cached for offline reopening. An already-open session can continue local saves offline. Reload old app tabs after deployment; confirm pending local changes are safely backed up first.

### Deliberate owner vault reset

For an authorised fresh start, first export the owner's encrypted `vaults` row and `vault_history` rows into an ignored recovery file. Keep the old `VAULT_OWNER` value with that backup. Set `VAULT_OWNER` to a new unique value and `MIGRATE_LEGACY_OWNER` to `"0"` in the private deployment configuration, then deploy. Owner aliases share the new empty vault; member identities and admission remain unchanged. Check the fresh vault before deleting only the old owner's database rows and revisions.

The changed identity rejects old tabs' vault reads/writes and puts refreshed owner browsers in a fresh storage namespace. Disabling legacy migration prevents an old unscoped browser vault from filling it. Old browser copies and downloaded backups remain encrypted and inactive; this is a fresh active vault, not secure erasure of every device or file. Keep `MIGRATE_LEGACY_OWNER` disabled after the reset. Creating the first new entry requires a new master password chosen in the app.

## Separate public demo

`npm run build:demo` creates `demo-dist`: a standalone static sample app with memory-only fictional data. It has no Worker, D1 binding, sign-in or sync. Never deploy it over your private service.

Create a separate Pages project for the demo. Then run:

```sh
KEYKEEP_DEMO_PROJECT=YOUR_SEPARATE_DEMO_PROJECT npm run deploy:demo
```

The script runs Wrangler from a separate temporary directory so it cannot discover the private service configuration. Update the sample-demo link in `welcome.html` to your demo address.
