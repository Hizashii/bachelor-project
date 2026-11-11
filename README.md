# Freight Desk

Freight Desk is a starting point for a simple logistics platform for Slinkert & Aarøe.
The public website, product app, server, shared package, and test folders are ready for
the first feature.

## Run it in 15 minutes

1. Install Node.js 24 or newer.
2. Copy `.env.example` to `.env.local` and keep its fake values for local work.
3. Run `npm install`.
4. Run `npm run check` and `npm test`.
5. Run `npm run dev` to start the local workspaces.

The current API includes an authentication foundation with local mock identities and a
Microsoft Entra ID BFF path. Read [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md) before
enabling `AUTH_MODE=entra`; production secrets and directory data must stay server-side.

The repository remains deliberately empty of new tender, pricing, calculator, and invoice
features. Add each new feature in its workspace and keep shared data shapes in
`packages/shared`.
