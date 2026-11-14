# Freight Desk

Freight Desk is the Slinkert & Aarøe logistics platform. The current product
shell contains a public Astro site, a React/Vite application with demo compare
and carrier screens, and a Fastify API foundation.

## Run it in 15 minutes

1. Install Node.js 24 or newer.
2. Copy `.env.example` to `.env.local`; keep SharePoint mode disabled locally.
3. Run `npm install`.
4. Run `npm run check`, `npm test` and `npm run build`.
5. Run `npm run dev` to start the local workspaces.

On Windows PowerShell, use `npm.cmd` if the execution policy blocks
`npm.ps1`.

The API health check is available at `http://127.0.0.1:3000/health` after the
development processes start.

## Architecture

Read [`docs/slinkert_aaroe_microsoft365_architecture.md`](docs/slinkert_aaroe_microsoft365_architecture.md)
for the repository audit, Microsoft 365 boundaries and data-residency rules.
The PostgreSQL migration in `database/migrations` is metadata-only. Freight
files, rows, tariffs and invoice contents must not be added to it.

The compare and carrier screens still use clearly fictional local fixture data.
Do not treat those fixtures or local component state as a production data
source. Add each new feature in its workspace and keep validated shared data
shapes in `packages/shared`.
