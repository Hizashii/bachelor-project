# Slinkert & Aarøe Freight Desk architecture

This document records the architecture baseline for the existing Freight Desk
application and the boundaries required for the Microsoft 365 integration. It
describes the current `origin/main` checkout and does not imply that future
services or adapters already exist.

## Current system audit

| Concern | Current implementation | Finding |
| --- | --- | --- |
| Public site | Astro static site in `apps/site` | Independent presentation surface; no product data access |
| Product UI | React 19, Vite and React Router in `apps/app` | `/tenders` is the role-aware landing route; `/upload`, `/compare`, `/files` and `/carriers` remain supporting routes |
| Client data | Component state and same-origin API calls | Freight data is not stored in browser storage; the tender landing is empty until tender services exist |
| API | Fastify routes in `apps/api/src` | Auth, freight, file and admin routes run behind session, CSRF, Origin and role checks |
| Authentication | E-mail/password service in `apps/api/src/auth` | Argon2id password hashes, PostgreSQL sessions, invitations, resets and lockout are implemented |
| Persistence | PostgreSQL metadata plus storage adapters | PostgreSQL stores identity and organisation metadata only; local and SharePoint adapters store files |
| Microsoft 365 | Server-side Graph client and SharePoint adapter | Browser never receives Graph credentials; SharePoint access stays behind `apps/api/src/storage` |
| Tests | Vitest unit tests and Playwright examples | Unit coverage exists for shared validation; browser tests still exercise demo screens |

The existing carrier screen contains rate editing and a local file input. The
compare screen uses the existing freight services. Upload and file screens use
the storage and import routes. Invoice and calculator destinations are not
implemented and are not shown in primary navigation. TanStack Query is installed
for the future API boundary but is not currently used.

No duplicated production service was found. The next tender work must connect
the empty `/tenders` screen to a read-only tender service before adding create
or invitation actions. Shared schemas remain data contracts; they are not
implemented tender services.

## Target runtime boundary

```text
React UI
  -> same-origin BFF/API
       -> authentication and organisation membership
       -> freight domain services using shared schemas
       -> server-side SharePoint/Graph adapter
       -> PostgreSQL metadata connection
       -> bounded temporary file-processing stream
```

The browser must never receive Microsoft Graph or SharePoint access tokens. The
BFF authenticates the user, derives the role and organisation membership from
trusted server-side data, and performs the resource authorization check before
a freight file or normalized value is read.

### Authentication boundary

Users log in with e-mail and password handled by the API (see
`docs/AUTHENTICATION.md`). The API establishes a secure server-side session;
UI state is not an authority for roles, company IDs or access. Microsoft 365 is
used only as the file store, with the server's own application credentials.

### User and organisation boundary

The PostgreSQL metadata schema contains user accounts (with password hashes), organisations
and memberships. A carrier membership must reference a carrier organisation.
Consultant and master memberships do not receive a carrier company ID. Changes
to membership status and role are administrative metadata changes and must be
audited by the eventual authorization service. That service must require both
the membership and its organisation to be active on every access check; the
metadata migration cannot enforce a cross-row status change by itself.

### Microsoft Graph and SharePoint boundary

Only the API process may call Microsoft Graph. The adapter is scoped to the
approved SharePoint site and document library, using least-privilege application
permissions such as `Sites.Selected` after tenant approval. The implemented local
and SharePoint adapters keep tenant, site and drive configuration on the server.
The scoped store checks organisation and folder permissions on upload, read and
remove before delegating to Graph or local development storage.

### Freight domain boundary

`packages/shared/src/schemas` is the canonical validation layer and
`packages/shared/src/types` is the public type layer. Tender, shipment, zone,
rate, bid, award and template values remain domain data. API modules will
orchestrate these schemas and business rules; React components will render
view models and will not calculate authorization or persist freight state.

### Large-file processing boundary

Uploads are accepted through bounded server routes, validated for metadata and
size, and processed temporarily when normalization is needed. PostgreSQL must
not contain Excel rows, tariffs, freight records or invoice contents. Local and
SharePoint adapters implement the same storage interface; the running app uses
the configured adapter through the API.

### UI boundary

`apps/app` owns routes, loading/error/empty presentation and user interaction.
It may use TanStack Query for API state, but it must not hold Graph credentials
or make authorization decisions based on local storage. The tender landing
remains empty until a tender API is connected. Synthetic records stay isolated
to automated fixtures.

## Data residency and migration boundary

The reversible migration in `database/migrations` creates only:

- `organizations`
- `user_accounts`
- `organization_memberships`

It does not create shipment, tender, rate, bid, award, invoice or file-content
tables. The migration is intentionally plain SQL and has no application-side
repository abstraction. A deployment may apply it with the organization's
approved PostgreSQL migration process; the application must not silently create
tables at startup. The down migration is available for a controlled rollback
before production records exist.

SharePoint remains the intended source for freight workbooks and normalized
freight documents. Temporary processing storage must have a documented
retention limit and must be cleaned up after successful or failed processing.
The retention period and audit-log destination are customer approval items.

## Foundation checks

The API validates its environment at startup, serves health and static-app
routes, and serializes errors without leaking internal messages. Authentication,
CSRF, Origin and role hooks protect active file, import, tariff, compare and
admin routes. SharePoint mode requires its configured site and drive.

The existing CI commands remain the source of truth:

```text
npm run check
npm test
npm run build
```

The repository currently requires Node 24 in CI. The local Node runtime must
meet the Astro version's minimum before the full build can pass.

## Next implementation sequence

1. Confirm the SharePoint tenant/app registration and `Sites.Selected` scope.
2. Add read-only tender queries with invitation filtering from the session.
3. Add validated import/export jobs for the approved Excel templates.
4. Implement calculator and invoice checking only after their data contracts
   and retention rules are approved.
