CREATE TABLE IF NOT EXISTS login_attempts (state_hash TEXT PRIMARY KEY, verifier TEXT NOT NULL, nonce TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, subject TEXT NOT NULL, email TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS vaults (owner TEXT PRIMARY KEY, version INTEGER NOT NULL, envelope TEXT NOT NULL, write_id TEXT NOT NULL, updated TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS vault_history (owner TEXT NOT NULL, version INTEGER NOT NULL, envelope TEXT NOT NULL, updated TEXT NOT NULL, PRIMARY KEY(owner, version));
CREATE TRIGGER IF NOT EXISTS retain_vault BEFORE UPDATE ON vaults BEGIN
  INSERT OR IGNORE INTO vault_history(owner,version,envelope,updated) VALUES(OLD.owner,OLD.version,OLD.envelope,OLD.updated);
END;

CREATE TABLE IF NOT EXISTS access_requests (email TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('pending','approved','declined')), requested TEXT NOT NULL, reviewed TEXT, reviewer TEXT);
CREATE TABLE IF NOT EXISTS request_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS approval_emails (
 id TEXT PRIMARY KEY, email TEXT NOT NULL, created TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending', payload TEXT, first_attempt INTEGER,
 lease_until INTEGER NOT NULL DEFAULT 0, claim TEXT, provider_id TEXT, detail TEXT
);
CREATE INDEX IF NOT EXISTS approval_emails_recipient ON approval_emails(email);
CREATE TRIGGER IF NOT EXISTS queue_approval_email AFTER UPDATE OF status ON access_requests
WHEN NEW.status='approved' AND OLD.status!='approved' BEGIN
 INSERT INTO approval_emails(id,email,created) VALUES(lower(hex(randomblob(16))),NEW.email,NEW.reviewed);
END;
-- Earlier approvals are available for an explicit owner-triggered email retry.
INSERT INTO approval_emails(id,email,created)
 SELECT lower(hex(randomblob(16))),email,COALESCE(reviewed,requested) FROM access_requests
 WHERE status='approved' AND NOT EXISTS(SELECT 1 FROM approval_emails WHERE approval_emails.email=access_requests.email);
