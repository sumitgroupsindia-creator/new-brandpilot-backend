# BrandPilot — Backend

NestJS API + Prisma, plus deployment infra (Docker / nginx).

## Structure

```
apps/api          NestJS API server
packages/shared   Shared types & utilities (@brandpilot/shared)
packages/infra    Docker Compose + nginx configs
```

## Setup

```bash
pnpm install
cp .env.example .env      # fill in real values
pnpm db:generate
pnpm db:migrate:dev       # runs migrations + seed
pnpm api:dev
```

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm api:dev` | Run the API in watch mode |
| `pnpm api:start` | Run the production build |
| `pnpm db:migrate:deploy` | Apply migrations in production |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm test` / `pnpm test:integration` | Test suites |
| `pnpm typecheck` / `pnpm lint` | Static checks |

Requires Node >= 20 and pnpm >= 9. This repo is a pnpm workspace — always
install from the repo root, not from inside `apps/api`.

## Note on `packages/infra`

`packages/infra/docker/docker-compose.yml` came from the original monorepo and
still declares `web` and `admin` services that build from `apps/web` /
`apps/admin` — those apps now live in the frontend and admin repos. Either
comment those services out, or point them at prebuilt images, before running
`docker compose up` from this repo.

## CORS

`WEB_APP_URL` in `.env` is the CORS allowlist origin (`apps/api/src/main.ts`).
When the web app and admin panel are hosted on domains other than the API's,
set it to the app's origin — requests are sent with credentials, so it cannot
be a wildcard. If the frontends are proxied onto the API's own origin
(the nginx config in `packages/infra`), this does not apply.
