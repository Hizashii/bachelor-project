DROP TABLE IF EXISTS user_sessions;
DROP TABLE IF EXISTS user_tokens;
ALTER TABLE user_accounts
  DROP COLUMN IF EXISTS last_login_at,
  DROP COLUMN IF EXISTS locked_until,
  DROP COLUMN IF EXISTS failed_logins,
  DROP COLUMN IF EXISTS password_hash;
DROP INDEX IF EXISTS user_accounts_email_key;
ALTER TABLE user_accounts ALTER COLUMN email DROP NOT NULL;
