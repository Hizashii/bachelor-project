# Freight workflows: how they fit the platform

This describes how file imports, carrier tariffs and price comparison use the sign-in
and SharePoint storage. Code lives in `apps/api/src` and `packages/shared/src`.

## Sign-in and permissions

- Sign-in is e-mail and password in `apps/api/src/auth`. Every freight route runs behind
  `requireAuth`, and every route that changes data also checks the CSRF token and the
  `Origin` header (`requireCsrfOnWrites`).
- `accessContextOf(user)` (`auth/principal.ts`) turns the signed-in user into the
  `AccessContext` the workflows use. Carriers belong to their company id; staff belong to
  Slinkert & Aarøe (`CONSULTANCY_ORGANISATION_ID`).
- `permissions` (`auth/permissions.ts`) decides what each role may do:
  - carriers: edit, submit and read the tariffs of their own company only;
  - consultants and masters: everything, including approving tariffs, shipment imports
    and price comparison.
- Carriers can never read another carrier's tariff or price, and cannot use shipment
  imports.

## Storage

All durable freight data goes through the SharePoint adapter in `apps/api/src/storage`.
`Documents` (`storage/documents.ts`) adds whole-file and JSON saving on top of it.

- Files are never overwritten. A name that already exists is a conflict. Changed data is
  saved as a new numbered file (`...-r2.json`), which also detects two people editing at
  once.
- Workflow files are stored as Slinkert & Aarøe's own data (`workflowPrincipalOf`), so
  staff can read what carriers submit. Who may touch which carrier's data is decided by
  `permissions` before storage is called. The file browser (`/api/files`) still uses the
  user's own principal and folder list.

| What | Folder | File names |
|---|---|---|
| Uploaded shipment file | `inbound/shipments` | `<importId>-original.xlsx` |
| Processed file, mapping, report, manifest | `datasets/shipments` | `<importId>-processed.xlsx`, `-mapping.json`, `-validation-report.json`, `-manifest.json` |
| Remembered column setups | `imports/mappings` | `<layout>-v<N>.json` |
| Import drafts | `imports/drafts` | `<draftId>-original.*`, `<draftId>-r<N>.json` |
| Carrier tariffs | `carriers/<companyId>/tariffs` | `<tariffId>-v<version>-r<revision>.json` |

Download-only results stay in a temporary server folder and are removed after
`IMPORT_RETENTION_MINUTES`. Nothing about them is stored in the cloud.

## Settings (all optional)

`IMPORT_MAX_FILE_MB` (100), `IMPORT_MAX_ROWS` (500000), `IMPORT_MAX_COLUMNS` (200),
`IMPORT_MAX_CONCURRENT_JOBS` (2), `IMPORT_MAX_ATTEMPTS` (3), `IMPORT_RETENTION_MINUTES` (30).
Uploads are also capped by `MAX_UPLOAD_BYTES`.

## Still open

- The user directory (`auth/directory.ts`) is in memory with a fixed list of carrier
  companies. The comparison shows the company id as the carrier name until the
  organisation data has names.
- `modules/files` and `infrastructure/microsoft365` from the platform foundation are not
  used by the running app; the storage adapter replaced that design.
- Nothing has been tested against a real Microsoft 365 tenant.

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
8. A carrier with several tariffs is priced with the cheapest one that fits the shipment.
