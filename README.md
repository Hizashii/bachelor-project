# Freight Desk

Freight Desk is the Slinkert & Aarøe logistics platform. The current product
shell contains a public Astro site, a React/Vite application for tenders,
carrier bids and comparison, and a Fastify API.

## Run it in 15 minutes

1. Install Node.js 24 or newer.
2. Copy `.env.example` to `.env.local`; keep SharePoint mode disabled locally.
3. Run `npm install`.
4. Run `npm run check`, `npm test` and `npm run build`.
5. Run `npm run start` to start the site, app and API together. (`npm run dev`
   remains an equivalent development alias.)

On Windows PowerShell, use `npm.cmd` if the execution policy blocks
`npm.ps1`.

## Sign in and test with real workbooks

1. Run `npm run db:migrate`, then `npm run seed:users`. This creates an admin
   (`admin@freight.local`), a consultant (`consultant@freight.local`) and three
   carriers (`north@`, `south@`, `east@freight.local`), with a random password
   for each, printed once. To use one password while testing locally, run
   `SEED_PASSWORD=... npm run seed:users` (PowerShell: set `$env:SEED_PASSWORD`
   first). It adds no tenders.
2. As staff, create a tender, invite the carriers and open it.
3. As a carrier, download the price workbook, fill it in and upload it. Ready
   made, filled workbooks are in `tests/fixtures/express/` (three valid, three
   broken). `npm run fixtures:excel` rebuilds them from S&A's real template in
   `database/excel/`; the prices in them are made up.
4. As staff, close the tender, compare the bids and download the result.

The API health check is available at `http://127.0.0.1:3000/health` after the
development processes start.

## Architecture

Read [`docs/slinkert_aaroe_microsoft365_architecture.md`](docs/slinkert_aaroe_microsoft365_architecture.md)
for the repository audit, Microsoft 365 boundaries and data-residency rules.
The PostgreSQL migration in `database/migrations` is metadata-only. Freight
files, rows, tariffs and invoice contents must not be added to it.

Shipment imports, carrier tariffs and price comparison read and write through the
SharePoint storage; see [docs/INTEGRATION_CONTRACTS.md](docs/INTEGRATION_CONTRACTS.md).
Add each new feature in its workspace and keep validated shared data shapes in
`packages/shared`.

People log in with e-mail and password; accounts live in PostgreSQL. Microsoft 365 is used only to
save files in SharePoint. Read [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md) and
[docs/GO_LIVE.md](docs/GO_LIVE.md).
