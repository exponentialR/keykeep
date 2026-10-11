# Save website logins with Keykeep

This experimental Chrome/Edge extension reads a login **only when you click “Read this login”**. It opens your Keykeep app for a final review and encrypted save. It does not automatically monitor websites or fill passwords.

## Install on this PC

1. Download and extract `keykeep-extension.zip` from the GitHub release. Developers can run `npm run build:extension` instead.
2. Open `chrome://extensions` (or `edge://extensions`). Enable **Developer mode** and choose **Load unpacked**.
3. Select the extracted folder containing `manifest.json`. For a local build, use `.build/keykeep-extension`.
4. Pin Keykeep to the toolbar. Open it and connect your trusted Keykeep address, ending in `/app`.
5. Allow the extension to access that **Keykeep host**. Open Keykeep and sign in there.

Install the extension on each browser you use. It is not yet published in either extension marketplace. Unpacked installations require manual updates: replace the extracted files, then click Reload on the browser's extensions page.

## Save or update a login

1. Enter your username and password in the website's login form. Click the Keykeep toolbar **before submitting**, while the password field is still filled.
2. Click **Read this login**. If several filled password fields exist, choose the correct one.
3. Review the masked password, account, name and website. Click **Continue in Keykeep**.
4. Review again in Keykeep. Enter your vault master password if locked, then click **Save password**.
5. If a saved login matches that website and username, choose **Update …** or **Save as a new login**, then save. Updates preserve the previous version in encrypted history.

If you are redirected to sign in, complete sign-in and read the website login again. The handoff is short-lived and is never saved as plaintext to recover across redirects. Existing entries without a website need that address added through Edit before they can be suggested as matches.

## Privacy and scope

- On other websites, `activeTab` grants temporary access after a toolbar click. There is no automatic background capture and no network interception.
- The chosen Keykeep host receives an optional persistent host permission for the handoff bridge. Changing hosts removes the former host permission. Connect only a host you trust: its code receives the login for review.
- Extension storage contains only app addresses, including a pending address during connection. Login data lives briefly in popup/worker/app memory and is discarded on cancel, lock, timeout or worker restart. Restarting the worker can interrupt a handoff; read the login again.
- The handoff uses a random, one-use token bound to a newly opened app tab and its main frame. Passwords and usernames never appear in URLs. No external network calls, analytics or password logs are included in the extension.
- Website addresses are reduced to their HTTPS origin, dropping paths, query strings and fragments. They and usernames are encrypted inside the vault, omitted from the locked display index and cloud-visible metadata.
- Capturing is limited to visible, filled HTML password inputs in the main frame on HTTPS pages. Embedded frames, closed shadow roots, passkeys, browser-internal pages and the browser's built-in saved-password database are unsupported. One-time-code inputs are excluded.
- The extension has a brief plaintext review stage, as any save feature must. A compromised browser, device or Keykeep host can read it. This feature has not received an independent security audit.

## Validation

Automated tests exercise field selection, origin checking, one-use/expiry/tab/frame restrictions, the real worker with mocked Chrome APIs, bridge messaging, encrypted application saves and explicit duplicate updates with history. A local Chrome UI trial verified masked application review, the required duplicate choice, updating without creating a second entry, retained history and clearing on lock using a fictional handoff. An installed Chrome trial verified the host permission prompt, connection with an older worker, masked fictional capture and opening the configured app. The private app required fresh sign-in; final authenticated handoff/save, freshly reloaded worker behaviour and Edge compatibility remain unverified. No real passwords are used in tests.
