# Slinkert & Aarøe Freight Desk architecture

This document records the architecture baseline for the existing Freight Desk
application and the boundaries required for the Microsoft 365 integration. It
describes the current `origin/main` checkout and does not imply that future
services or adapters already exist.

## Current system audit

| Concern | Current implementation | Finding |
| --- | --- | --- |
| Public site | Astro static site in `apps/site` | Independent presentation surface; no product data access |
| Product UI | React 19, Vite and React Router in `apps/app` | Browser routes are `/compare` and `/carriers`; `BrowserRouter` is mounted in `main.tsx` |
| Client data | Local fixtures in `apps/app/src/data.ts` and component state | Demo-only; no API calls or durable freight writes |
| API | Fastify dependency with an empty `apps/api/src/index.ts` | No runtime server, route guards or storage adapter are present on main |
| Authentication | No login route or identity service on main | Authentication is a prerequisite for production access and remains a separate boundary |
| Persistence | No database client or migration runner | Shared Zod models describe freight data, but do not persist it |
| Microsoft 365 | No Graph or SharePoint client in the current tree | Access must be server-side and least-privilege; browser tokens are out of scope |
| Tests | Vitest unit tests and Playwright examples | Unit coverage exists for shared validation; browser tests still exercise demo screens |

The existing carrier screen contains local postcode/rate editing and a local
Excel file input. The compare screen ranks fictional offers locally. The
navigation labels for upload, invoices and calculator are presentation-only;
there is no invoice module or production upload workflow yet. TanStack Query is
installed for the future API boundary but is not currently used.

No duplicated production service was found. The main technical debt relevant to
the next stages is the split between demo state and domain schemas, the empty
API entry point, disabled navigation items that look actionable, and tests
named as placeholders. These should be addressed when each production workflow
is connected, rather than by adding a second UI or a generic repository layer.

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

Authentication will be implemented behind an API module. Microsoft Entra ID is
the identity provider and Conditional Access is responsible for MFA. The API
will establish a secure server-side session; UI state is not an authority for
roles, company IDs or access. The current branch only establishes the hosting
and configuration boundaries; it does not add a second authentication flow.

### User and organisation boundary

The PostgreSQL metadata schema contains Entra subject records, organisations
and memberships. A carrier membership must reference a carrier organisation.
Consultant and master memberships do not receive a carrier company ID. Changes
to membership status and role are administrative metadata changes and must be
audited by the eventual authorization service. That service must require both
the membership and its organisation to be active on every access check; the
metadata migration cannot enforce a cross-row status change by itself.

### Microsoft Graph and SharePoint boundary

Only the API process may call Microsoft Graph. The adapter will be scoped to the
approved SharePoint site and document library, using least-privilege application
permissions such as `Sites.Selected` after tenant approval. The domain layer
deals in validated Freight Desk resources and file references; it does not know
about Graph request details. The branch adds the `SharePointDocumentStore`
port with an immutable tenant/site/drive and organisation scope. A document
reference contains its owning organisation and an item path; the eventual
adapter supplies the configured tenant/site/drive rather than accepting those
identifiers from a request. The branch intentionally does not add a fake Graph
implementation or credentials. The scoped store wrapper checks the organisation
on upload, read and remove before delegating to a Graph adapter.

### Freight domain boundary

`packages/shared/src/schemas` is the canonical validation layer and
`packages/shared/src/types` is the public type layer. Tender, shipment, zone,
rate, bid, award and template values remain domain data. API modules will
orchestrate these schemas and business rules; React components will render
view models and will not calculate authorization or persist freight state.

### Large-file processing boundary

Uploads are accepted as bounded streams, validated for metadata and size before
being sent to SharePoint, and processed temporarily when normalization is
needed. The PostgreSQL database must not contain Excel rows, tariffs, freight
records or invoice contents. A browser-reported size is only an early rejection
hint; the server-side stream helper counts bytes, aborts at the configured
limit, and computes SHA-256. A declared checksum can be compared with that
server result before persistence. The branch adds these policies and a staging
service that writes to a generated temporary path, returning a disposable
SharePoint upload only after validation. It does not yet expose a production
upload route.

### UI boundary

`apps/app` owns routes, loading/error/empty presentation and user interaction.
It may use TanStack Query for API state, but it must not hold Graph credentials
or make authorization decisions based on local storage. Demo fixtures remain
clearly temporary until a production API is connected.

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

The API now validates its environment at startup. It rejects malformed origins,
invalid ports and upload limits, and requires a SharePoint site and drive when
SharePoint mode is enabled. Fastify has one error serialization boundary that
returns stable public error codes without leaking internal messages. A health
route and security headers make the server boundary observable without adding a
freight API prematurely.

The existing CI commands remain the source of truth:

```text
npm run check
npm test
npm run build
```

The repository currently requires Node 24 in CI. The local Node runtime must
meet the Astro version's minimum before the full build can pass.

## Next implementation sequence

1. Confirm Entra tenant/app registration, Conditional Access MFA and B2B
   invitation policy.
2. Add server-side sessions and membership-backed authorization using the
   metadata schema.
3. Implement the SharePoint adapter with tenant-approved site scoping and
   streamed file handling.
4. Replace demo fixtures with read-only tender and carrier API queries.
5. Add validated import/export jobs for the approved Excel templates.
6. Implement calculator and invoice checking only after their data contracts
   and retention rules are approved.
