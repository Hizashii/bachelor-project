# Freight Desk

Freight Desk is a TypeScript monorepo for a logistics consultancy's tender
workspace. The current branch contains a responsive B2B application shell and
fictional demo data only. It is not connected to customer files, SharePoint,
authentication, or a production database.

## Requirements

- Node.js 22 or newer.
- Corepack with pnpm enabled, or pnpm 12 installed directly.

## Run locally

```bash
corepack enable
pnpm install
copy .env.example .env.local
pnpm dev
```

Open `http://localhost:5173`. The web workspace runs on port 5173 and the
demo-only Fastify health shell runs on port 3000.

The application visibly labels all local fixture content as **Demo data**.
Never replace the example environment values with customer credentials in the
repository.

## Commands

| Command             | Purpose                                            |
| ------------------- | -------------------------------------------------- |
| `pnpm dev`          | Run the web and API development processes together |
| `pnpm dev:web`      | Run only the React/Vite application                |
| `pnpm dev:api`      | Run only the Fastify health shell                  |
| `pnpm build`        | Build every declared workspace                     |
| `pnpm lint`         | Run ESLint                                         |
| `pnpm format`       | Format supported files with Prettier               |
| `pnpm format:check` | Check formatting without changing files            |
| `pnpm typecheck`    | Run strict TypeScript project builds               |
| `pnpm test`         | Run Vitest unit tests                              |
| `pnpm check`        | Run lint, formatting and type checks               |

## Workspace layout

```text
apps/web         React, Vite, React Router and TanStack Query shell
apps/api         Fastify shell with validated environment and /health
packages/shared  Schemas, public types and lifecycle business rules
packages/storage SharePoint contracts plus an in-memory test implementation
packages/pricing Reserved package; intentionally empty for now
```

SharePoint access is represented by interfaces and an adapter boundary in
`packages/storage`. No Graph client, database, ORM, calculator, invoice
checker, or production data backend is included yet.

Business decisions and domain documentation belong in `docs/`. Keep customer
approval points there before implementing workflows.
