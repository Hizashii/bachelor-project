-- Accounts are created by an administrator and activated through an invitation link, so a
-- user can exist before they have a password. Sign-in is e-mail and password.
ALTER TABLE user_accounts ALTER COLUMN entra_subject DROP NOT NULL;
ALTER TABLE user_accounts ALTER COLUMN email SET NOT NULL;

CREATE UNIQUE INDEX user_accounts_email_key ON user_accounts (lower(email));

ALTER TABLE user_accounts
  ADD COLUMN password_hash text,
  ADD COLUMN failed_logins integer NOT NULL DEFAULT 0,
  ADD COLUMN locked_until timestamptz,
  ADD COLUMN last_login_at timestamptz;

-- One-time links: invitations to set a first password and password resets.
-- Only a hash of the token is stored.
CREATE TABLE user_tokens (
  id uuid PRIMARY KEY,
  user_account_id uuid NOT NULL REFERENCES user_accounts (id),
  kind text NOT NULL CHECK (kind IN ('invitation', 'password_reset')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_tokens_user_account_id_idx ON user_tokens (user_account_id);

-- Server-side sessions. The cookie holds a random value; only its hash is stored.
CREATE TABLE user_sessions (
  token_hash text PRIMARY KEY,
  user_account_id uuid NOT NULL REFERENCES user_accounts (id),
  csrf_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX user_sessions_user_account_id_idx ON user_sessions (user_account_id);
