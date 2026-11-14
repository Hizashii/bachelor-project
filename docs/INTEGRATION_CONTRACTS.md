# Integration contracts: file processing, tariffs and pricing

This describes what the freight processing and tariff code needs from the sign-in and
SharePoint work, and what it gives back. Code lives in `apps/api/src` and
`packages/shared/src`.

## What this code needs (provided by other work)

| Contract | Where | Provided by |
|---|---|---|
| `AccessContext` (`userId`, `organisationId`, `role`) | `apps/api/src/contracts/access.ts` | Sign-in work. Must come from the session, never from a request body. |
| `PermissionChecker.can(context, action, { organisationId })` | same file | Sign-in work. Actions: `import:upload`, `import:read`, `tariff:edit`, `tariff:submit`, `tariff:approve`, `tariff:read`, `price:calculate`. |
| `FileStore` (`putFile`, `putJson`, `getJson`, `getFile`, `list`) | `apps/api/src/contracts/fileStore.ts` | SharePoint work. Must apply the ETag check when `ifMatch` is given and throw `StorageConflictError` on a mismatch. |
| `getContext(request)` | `registerFreightRoutes` in `apps/api/src/freight/routes.ts` | Sign-in work. Returning `null` gives a 401. |
| `GET /api/session` | used by `apps/app/src/features/carriers/useSession.ts` | Sign-in work. Returns `{ userId, organisationId, role }`. |
| `GET /api/carriers` | used by `apps/app/src/features/compare/compareApi.ts` | Organisation work. Returns `[{ organisationId, name, tariffId }]`. |

Nothing here hardcodes an organisation, carrier or SharePoint path. Logical paths are
passed to `FileStore`; it decides where they live.

## Logical storage paths

```
imports/<importId>/original.(xlsx|csv)         saved import (original)
imports/<importId>/processed.(xlsx|csv)        saved import (result)
imports/<importId>/mapping.json                column choices used
imports/<importId>/validation-report.json      counts and first issues
imports/<importId>/manifest.json               written last: a folder without it is unfinished
mappings/<organisationId>/<layout>/v<N>.json   remembered column setup, one file per version
drafts/<organisationId>/<draftId>/original.*   draft file
drafts/<organisationId>/<draftId>/draft.json   draft choices; status "open" or "discarded"
tariffs/<carrierOrganisationId>/<tariffId>/v<N>.json   one immutable file per version once published
```

Downloaded results are not stored here. They stay in a temporary server folder and are
removed after `IMPORT_RETENTION_MINUTES`.

## What this code gives back

| Need | Provided by |
|---|---|
| Import use cases | `ImportService`, `ImportLibrary` |
| Background job state | `JobRunner` (pending, processing, completed, failed, cancelled) |
| Tariff save, submit, approve, activate, read | `TariffService` |
| Shipment price for one or many carriers | `PricingService.priceCarriers`; pure calculation in `calculatePrice` |
| Delivery reliability for the comparison | `ReliabilityProvider` in `apps/app/src/features/compare/reliability.ts`. No provider exists yet; the screen shows "not available". |

## Settings (environment variables, all optional)

`IMPORT_MAX_FILE_MB` (100), `IMPORT_MAX_ROWS` (500000), `IMPORT_MAX_COLUMNS` (200),
`IMPORT_MAX_CONCURRENT_JOBS` (2), `IMPORT_MAX_ATTEMPTS` (3), `IMPORT_RETENTION_MINUTES` (30).

## Pricing rules that need customer approval

The calculation follows only what `docs/BUSINESS_RULES.md` and the workbook description
state. These choices were not given and must be checked against S&A's workbook before
production use:

1. A quantity bracket holds values above its lower limit and up to and including its upper
   limit. The bracket rate applies to the whole quantity, not in steps.
2. Order of steps: base price, minimum charge, rounding, discounts, surcharges.
   A percentage surcharge is taken on the price after discounts.
3. Quantity can be rounded up to a step (for example 0.1 LDM) when the tariff sets one.
4. Price per 100 kg is `rate x kg / 100`, rounded half up to a whole øre.
5. A tariff is valid on the collection date. Superseded versions still price old dates.
6. The rate sheet reader (`importRateMatrix`) expects zones across the top and brackets
   down the side. It is a general layout, not S&A's template, and has not been checked
   against a real carrier workbook. Blank or unreadable cells are returned as questions
   and leave the tariff incomplete.
7. Tariff approval roles: carriers submit; consultants and masters approve and activate.
