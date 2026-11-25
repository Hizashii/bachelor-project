# Authentication and access

Freight Desk has its own accounts. People log in with e-mail and password. Microsoft 365 is used
only as the place where files are saved; nobody needs a Microsoft account to use the platform.

## How it works

- **Accounts** live in PostgreSQL: users, carrier companies, roles and sessions. No freight data.
- **Passwords** are hashed with Argon2id (`@node-rs/argon2`). The password itself is never stored.
  Passwords must be 12 to 128 characters and must not contain the e-mail name.
- **Login** is `POST /auth/login`. A wrong e-mail, a wrong password and a locked account all give
  the same answer, and checking takes the same time. After 5 wrong passwords in a row the account
  is locked for 15 minutes. Each address may try `LOGIN_ATTEMPTS_PER_MINUTE` times a minute
  (default 10); more gets a 429.
- **Sessions** are an opaque cookie (`HttpOnly`, `SameSite=Strict`, `Secure` in production). The
  database holds only a hash of it. A suspended user, membership or company loses access on the
  very next request. Changing or resetting a password ends all sessions of that user.
- **CSRF:** every request that changes data needs the `x-csrf-token` header from `GET /api/csrf`
  and an `Origin` equal to `APP_ORIGIN`. Login, invitation and reset requests check `Origin`.
- **Roles:** `carrier` (one carrier company), `consultant` and `master` (consultancy staff).
  Role and company come only from the database, never from the request. Carriers can edit,
  submit and read their own company's tariffs and nothing else; see
  `apps/api/src/auth/permissions.ts`.

## Adding people

There is no public sign-up. A master creates users:

1. `POST /api/admin/carriers` creates a carrier company.
2. `POST /api/admin/users` creates a user (`role` and, for carriers, `carrierId`). The answer
   contains an `invitationLink` valid for 7 days. The master gives it to the person, who opens it
   and chooses a password. The link works once.
3. `POST /api/admin/users/:id/invitation` makes a new invitation link.
   `POST /api/admin/users/:id/password-reset` makes a reset link valid for 2 hours.
4. `PATCH /api/admin/users/:id` with `{"status":"suspended"}` or `"active"` switches a user off
   or on. Nobody can suspend themselves or the last active master.

Links are shown once and are not sent by e-mail yet; the master passes them on. Sending them by
e-mail needs a mail service and is not built.

The first master is made on the server: `npm run admin:create -w @freight-desk/api -- name@example.com "Full Name"`
prints an invitation link for that person.

## Microsoft 365 and file storage

The server talks to SharePoint with its own application credentials (`SHAREPOINT_*`, client
credentials and the Graph permission `Sites.Selected`). That is separate from user login and does not
involve user accounts. The browser never receives those credentials or talks to Microsoft Graph.
