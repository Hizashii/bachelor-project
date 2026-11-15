# Going live: set-up guide

Users log in with e-mail and password (stored in PostgreSQL). Microsoft 365 is used only for
saving files in SharePoint. Nothing here has been run against a real Microsoft tenant; the code is
tested with a stand-in for SharePoint and a real PostgreSQL. `npm run check:setup` tells you which
part of the real set-up is still missing.

## 1. What you create in Microsoft Entra (the client's tenant)

One **app registration** for storage:
1. App registrations, New registration, any name (for example "Freight Desk storage"). No redirect URI.
2. Certificates and secrets: new client secret. Copy the **Value** now (`SHAREPOINT_CLIENT_SECRET`).
3. API permissions, Microsoft Graph, **Application permissions**: `Sites.Selected` only.
4. Copy the Application (client) ID (`SHAREPOINT_CLIENT_ID`) and the Directory (tenant) ID
   (`SHAREPOINT_TENANT_ID`).

Users need no Microsoft account and no other app registration.

## 2. What the client's IT administrator must approve

1. **Admin consent** for `Sites.Selected` on the storage app.
2. **Grant the app access to the one SharePoint site** (`Sites.Selected` gives nothing until this is
   done). As a SharePoint administrator, in Graph Explorer or PowerShell:
   `POST https://graph.microsoft.com/v1.0/sites/{siteId}/permissions` with
   `{"roles":["write"],"grantedToIdentities":[{"application":{"id":"<storage client ID>","displayName":"Freight Desk"}}]}`
3. A DNS name and HTTPS certificate for the application address.

## 3. SharePoint identifiers and library set-up

In the approved site's document library:
1. Create a folder, for example `Freight Desk`. The app only works inside it.
2. Add these **columns** (names exactly as written, no spaces): `FreightOrganisationId`,
   `FreightOwnerId`, `FreightFileId`, `FreightDestination`, `FreightProcessingStatus` (all single
   line of text), `FreightRetentionHold` (Yes/No), `FreightRetentionUntil` (date and time).
3. Find the IDs with Graph Explorer (signed in as an administrator):
   - Site: `GET /sites/{host}:/sites/{site-name}` gives `id` (`SHAREPOINT_SITE_ID`).
   - Library: `GET /sites/{site-id}/drives` gives the library `id` (`SHAREPOINT_DRIVE_ID`).
   - Folder: `GET /drives/{drive-id}/root:/Freight Desk` gives `id` (`SHAREPOINT_ROOT_ITEM_ID`).

## 4. Where PostgreSQL runs

Use the existing architecture: **Azure Database for PostgreSQL (flexible server), EU region**, or any
PostgreSQL 14+ the client approves. It holds users, carrier companies, roles and sessions only; never
freight data. Create an empty database and a user that owns it. Require TLS: end the URL with
`?sslmode=require`. Allow connections only from where the app runs.

## 5. Environment variables

Copy `.env.example`. Keep real values in the host's secret store (Azure Key Vault with Container Apps
secrets), never in git. For the first live test:

```
NODE_ENV=production
APP_ORIGIN=https://<your-address>
API_ORIGIN=https://<your-address>
COOKIE_SECURE=true
TRUST_PROXY=true
DATABASE_URL=postgresql://user:password@host:5432/freight?sslmode=require
SHAREPOINT_MODE=graph
SHAREPOINT_TENANT_ID=...  SHAREPOINT_SITE_ID=...  SHAREPOINT_DRIVE_ID=...
SHAREPOINT_ROOT_ITEM_ID=...  SHAREPOINT_CLIENT_ID=...  SHAREPOINT_CLIENT_SECRET=...
STORAGE_CURSOR_SECRET=<random, 16+ characters>
```

In production the app refuses to start with an address that is not HTTPS, insecure cookies, a missing
database or SharePoint turned off, and says which setting is wrong.

## 6. Commands

```
npm ci
npm run build                      # builds the web app into apps/app/dist
npm run db:migrate                 # creates the tables (safe to repeat)
npm run admin:create -w @freight-desk/api -- boss@client.com "Full Name"   # prints a link to choose a password
npm run check:setup                # every line should start with a tick
npm run start -w @freight-desk/api # serves the API and the web app on one address
```

Put the app behind HTTPS (Azure Container Apps ingress does this). In production the API serves the
built web app itself, so the browser uses a single address.

## 7. How to verify it works

1. `npm run check:setup` passes (PostgreSQL and the SharePoint folder and columns).
2. Open the printed link, choose a password, then log in at `https://<your-address>`.
3. **Persistence:** add a carrier company and a carrier user (`POST /api/admin/carriers`,
   `POST /api/admin/users`, needs the master's session and CSRF token). Give the invitation link to
   the carrier, who chooses a password and logs in. Restart the app: both accounts are still there.
   Suspend the carrier (`PATCH /api/admin/users/<id>` with `{"status":"suspended"}`): their next
   request is refused.
4. **File saving:** as staff upload a small .xlsx, process it, press "Gem i Microsoft 365". In
   SharePoint the files appear in `inbound/shipments` and `datasets/shipments` inside the folder, with
   the `Freight...` columns filled in.
5. **Tariffs:** as the carrier save a tariff draft. In SharePoint see
   `carriers/<company id>/tariffs/...-r1.json`. Submit it, approve and activate it as staff, then
   compare prices.
6. **Isolation:** the carrier cannot open the upload or compare pages and cannot see another
   carrier's files or prices.

## Manual smoke-test checklist (real tenant)

- [ ] check:setup all green
- [ ] First master chooses a password through the link and logs in
- [ ] Carrier company and user created; invitation link works once
- [ ] Wrong password five times locks the account; the right one is then refused for a while
- [ ] Suspended user is refused immediately; reactivated user can log in again
- [ ] Excel upload, processing, download only (no file in SharePoint)
- [ ] Excel upload, processing, save (files and columns in SharePoint)
- [ ] Tariff saved, submitted, approved, activated; comparison shows the company name
- [ ] Log out works and the old session cookie no longer works
