# Backend

The backend owns the API, authentication, integrations, persistence, and server-side business logic. Web and mobile clients rely on the shared data contract in `packages/contracts`.

## Stack

- Bun
- Hono
- Prisma 7
- PostgreSQL
- Zod
- jose JWT
- TypeScript

## Commands

Run these from the repository root:

```bash
docker compose version
docker info
docker compose pull postgres
docker compose up -d postgres
cp backend/.env.example backend/.env
bun run --cwd backend dev
bun run --cwd backend typecheck
bun run --cwd backend test
bun run --cwd backend test:unit
bun run --cwd backend test:integration
bun run --cwd backend start:api
bun run --cwd backend start:worker
bun run --cwd backend start:cron -- noop
bun run --cwd backend smoke:docker
bun run --cwd backend prisma:validate
bun run --cwd backend prisma:generate
bun run --cwd backend prisma:migrate
bun run --cwd backend prisma:deploy
bun run --cwd backend seed:catalog
```

On Windows PowerShell, use `Copy-Item backend/.env.example backend/.env` instead of `cp`. Workspace aliases are also available from the repository root: `bun run dev:backend`, `bun run build:backend`, `bun run typecheck:backend`, and `bun run test:backend`.

`bun run test:integration` starts `postgres_test` from `../docker-compose.yml`, applies Prisma migrations to `phuket_go_test`, and runs DB-backed auth API tests. If Docker is managed separately, set `TEST_SKIP_DOCKER=1` and `TEST_DATABASE_URL`. The test database name must end with `_test` unless `TEST_ALLOW_NON_TEST_DATABASE=1` is set intentionally.

`bun run smoke:docker` builds the backend Docker image, starts it against `postgres_test`, waits for `/health`, and removes only the smoke container it created.

`bun run seed:catalog` loads the prepared Phuket Go excursion dataset from `docs/03-service-catalog/excursions-site-data-mvp.json` into the local database. It creates the default local executor, public categories, published excursion cards, and all available local carousel photos from `docs/03-service-catalog/media/excursions/*/final/carousel`. Photos are stored as `/media/excursions/...` URLs and served by the backend from the prepared local media folder, so website development does not duplicate the same files into `website/public`. This is for local MVP development data, not final publication data.

## Env

Copy `backend/.env.example` to `backend/.env` for local development. The example `DATABASE_URL` matches the Docker Compose `postgres` service documented in [../docs/LOCAL_DATABASE.md](../docs/LOCAL_DATABASE.md): database `phuket_go`, user `superuser`, password `superpassword`, host port `54329`.

The example `TEST_DATABASE_URL` matches the Docker Compose `postgres_test` service: database `phuket_go_test`, user `superuser`, password `superpassword`, manual host port `54330`. Automated runners may replace the port with a repository-derived value so parallel checkouts do not collide.

Keep an explicit username and password in Prisma connection URLs even on local native PostgreSQL installs. Peer-auth style URLs without a user can make Prisma schema-engine commands such as `migrate dev`, `migrate deploy`, and `db push` fail with an unhelpful generic engine error.

`JWT_SECRET` must be at least 32 characters. For production, generate it with `openssl rand -hex 32`; this creates 32 random bytes encoded as 64 hex characters. Do not use the `.env.example` placeholder, repeated characters, or human phrases.

`COOKIE_SECURE=false` is appropriate for local HTTP; production should use `COOKIE_SECURE=true` with exact HTTPS origins in `CORS_ORIGINS`. Production browser auth uses `SameSite=None; Secure` refresh cookies, so wildcard, empty, or path-bearing CORS origins are invalid. Cookie-backed `refresh` and `logout` requests also require a trusted `Origin` in production cookie mode.

DigitalOcean Spaces env is optional. Leave `SPACES_*` blank until the product needs uploads, media, exports, or downloads. When storage is active, configure the complete Spaces group in `backend/.env` and follow [../docs/STORAGE.md](../docs/STORAGE.md).

Google Sheets lead export is optional and disabled by default. Leave
`GOOGLE_SHEETS_ENABLED=false` for local development without Google credentials. When
MVP lead export is needed, create a Google service account with access to the
spreadsheet, set `GOOGLE_SHEETS_ENABLED=true`, and configure
`GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_LEADS_SHEET_NAME`,
`GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`.
Private keys may use escaped `\n` newlines in `.env`; the backend normalizes
them before signing OAuth JWTs. Lead creation appends a row, and partner Telegram
callbacks update status columns in the existing row when it can be found by
`lead_id`. Do not commit service account credentials.

Telegram lead notifications are optional and disabled by default. Leave
`TELEGRAM_NOTIFICATIONS_ENABLED=false` for local development without a bot token.
When MVP notifications are needed, set `TELEGRAM_NOTIFICATIONS_ENABLED=true`,
`TELEGRAM_BOT_TOKEN`, and `TELEGRAM_ADMIN_CHAT_ID`. The admin chat receives every
new lead. Partner notifications are sent only when the selected partner has a
stored `telegram_chat_id`; `telegram_username` is informational and is not enough
for a direct bot message. Do not commit bot tokens or chat identifiers from real
accounts.

Recommended manager binding flow: ask the manager to send `/start` to the bot,
then open the admin lead queue and bind the recorded Telegram contact to the
partner. The backend only treats a contact as a manager after this admin action.
On the first binding for a partner, the backend creates an `is_test=true` lead,
sends it to that manager, and asks them to click `Взять в работу` and then
`Оплата получена`. Test leads are marked in the admin UI and are skipped by Google
Sheets sync, so the onboarding check does not pollute operational exports.

Use `bun run telegram:smoke` from `backend/` after configuring the bot token and
admin chat id. It sends a neutral test message to the admin chat without creating
a lead or printing secrets. To also test partner delivery, set
`TELEGRAM_SMOKE_PARTNER_CHAT_ID` locally before running the command; this value is
only read by the smoke script, not by the running backend.

To discover chat ids, ask the admin and partner to send `/start` to the bot, then
run `bun run telegram:updates` from `backend/`. The command prints recent update
metadata and chat ids without printing the bot token. If a webhook is already set
for the bot, Telegram may block `getUpdates`; use it before enabling the webhook
or temporarily clear the webhook through Telegram Bot API.

To save the partner chat id locally, set `TELEGRAM_PARTNER_CHAT_ID` and run
`bun run telegram:save-partner-chat` from `backend/`. If the database has more
than one partner, also set one selector: `TELEGRAM_PARTNER_ID`,
`TELEGRAM_PARTNER_USERNAME`, or `TELEGRAM_PARTNER_NAME`.

Telegram partner callbacks are accepted at `POST /api/telegram/webhook`. Configure
Telegram's webhook secret token and set the same value in `TELEGRAM_WEBHOOK_SECRET`;
the backend checks it through the `X-Telegram-Bot-Api-Secret-Token` header before
processing callback buttons. The MVP callback handler supports partner
`lead:<id>:accept`, `lead:<id>:paid`, legacy `lead:<id>:complete`,
`lead:<id>:decline`, and `lead:<id>:problem` actions. Status callbacks update
lead status and write lead status history. `paid` and legacy `complete` are
accepted only after the lead is already `accepted`. `decline` and `problem`
first show reason buttons. Choosing a reason stores `partner_note`; decline also
changes the lead to `declined`, while problem writes a partner history entry
without changing status. Choosing `Другая причина` stores a pending Telegram
contact state, and the next partner message becomes the custom reason. After a
successful callback, the bot answers the partner, sends a short confirmation
message, and updates the original inline keyboard. When a customer selects a
preferred contact channel after submitting the public form, the backend saves it
and sends a follow-up Telegram notification to the admin and linked partner.

## Runtime Entrypoints

The backend is one workspace with one Prisma schema and one Dockerfile, but it has separate runtime entrypoints:

- API: `bun run start:api`, backed by `src/index.ts`.
- Worker: `bun run start:worker`, backed by `src/worker.ts`. It is intentionally empty until a real long-running background handler is added, and deployment generation refuses to deploy this placeholder command as an App Platform worker.
- Cron: `bun run start:cron -- <task>`, backed by `src/cron.ts`. Available tasks: `noop`, `db:ping`, `tripadvisor:sync-ratings`.

- Tripadvisor key and sync helpers:
  - `bun run tripadvisor:save-key` — saves `TRIPADVISOR_API_KEY` from env into `integration_credentials`.
  - `bun run tripadvisor:sync` — запускает `tripadvisor:sync-ratings` и обновляет рейтинги в БД.
    - По умолчанию (`TRIPADVISOR_ALLOW_REFRESH=false`) это разовый режим: синк берёт только ещё неуспешно заполненные/неполные записи.
    - Для повторного обновления в явном виде задайте `TRIPADVISOR_ALLOW_REFRESH=true`.

All entrypoints use `src/runtime.ts` for env loading, Prisma creation, and cleanup, so backend services can be shared without duplicating Prisma schema or database setup.

Primary keys use database-generated UUIDv7 values in PostgreSQL (`@default(dbgenerated("uuidv7()")) @db.Uuid`). Use UUIDv7 consistently for new primary keys and foreign-key references that point at them; do not introduce new `cuid()`, `uuid()`, `serial`, or `bigserial` IDs into this template. PostgreSQL 18+ is required anywhere the backend schema is applied so IDs are generated consistently through Prisma, raw SQL, imports, and future non-Prisma writers.

## Deployment

Production deployment for the backend uses DigitalOcean App Platform with DigitalOcean Managed PostgreSQL by default. Follow the shared runbook in [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) instead of duplicating provider-specific steps here. The root `bun run deploy:do:specs` command generates concrete App Platform specs safely under `.scratch/deploy`; do not hand-substitute secrets or URLs into specs. If the user explicitly chooses Yandex Cloud, use [../docs/YANDEX_CLOUD.md](../docs/YANDEX_CLOUD.md).

## Auth API

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /openapi.json`
- `GET /health`

## Catalog API

- `GET /api/catalog/excursions`
- `GET /api/catalog/excursions/{slug}`
- `POST /api/catalog/leads`
- `PATCH /api/catalog/leads/{id}/contact-channel`
- `GET /media/excursions/*`

## Admin API

- `GET /api/admin/leads`
- `GET /api/admin/leads/{id}`
- `PATCH /api/admin/leads/{id}/status`
- `PATCH /api/admin/leads/{id}/admin-note`

Admin API routes require a valid bearer access token for a user with `is_admin=true`.
The lead list supports filters by `status`, `search`, `partnerId`,
`createdFrom`, and `createdTo`, plus `limit` and `offset` pagination. Responses include lead
snapshots for admin operations, including `partnerNote`. The lead detail endpoint
returns the same lead snapshot plus chronological status history. The status
quick action updates the lead status, can save an `adminNote`, and writes an
admin status-history entry with an optional comment. The admin note endpoint
updates only `adminNote` and does not write status history.

For local development, create or promote an admin user without manual SQL:

```bash
bun run --cwd backend seed:admin
```

The command reads `LOCAL_ADMIN_EMAIL`, `LOCAL_ADMIN_PASSWORD`,
`LOCAL_ADMIN_DISPLAY_NAME`, and `LOCAL_ADMIN_RESET_PASSWORD` from `.env`. If the
user already exists, the command sets `is_admin=true` and preserves the existing
password unless `LOCAL_ADMIN_RESET_PASSWORD=true`.

The public lead flow is two-step: first the customer sends name and phone through the form, then chooses where to continue communication: Telegram, WhatsApp, or Max. The lead stores excursion title, prices, commission, and selected contact channel snapshots so later catalog edits do not rewrite historical requests.

Passwords are hashed through `Bun.password` with Argon2id. Access tokens are short-lived JWTs through `jose`. Refresh tokens are opaque random tokens; only a SHA-256 hash is stored in the database. Refresh rotates the token and revokes the previous session.

## Architecture

`src/index.ts` only starts the API server. `src/runtime.ts` loads env and creates the Prisma client for API, worker, and cron entrypoints. The Hono app is created in `src/app.ts`. The auth feature lives in `src/auth`: routes validate and delegate, the service owns session/user logic, and token helpers isolate JWT and refresh-token mechanics. `src/db.ts` normalizes DigitalOcean Managed PostgreSQL URLs that use `sslmode=require` so the Prisma PostgreSQL adapter uses libpq-compatible TLS handling.

The storage service lives in `src/storage` and wraps DigitalOcean Spaces through S3-compatible SDK calls. Product-specific upload routes should validate ownership and permissions, then delegate object key generation, presigned upload/download URLs, public CDN URL construction, and deletion to that service.

Prisma migration SQL is not written by hand. Change `prisma/schema.prisma`, then run `bun run prisma:migrate`.

## Current Upstream Documentation

For backend framework, ORM, auth, validation, and runtime questions, consult the current upstream documentation linked here first. This README describes this backend's conventions; upstream docs are authoritative for API behavior.

- [Bun docs](https://bun.sh/docs)
- [Hono docs](https://hono.dev/docs)
- [Hono Zod OpenAPI example](https://hono.dev/examples/zod-openapi)
- [Prisma docs](https://www.prisma.io/docs)
- [Prisma migrations](https://www.prisma.io/docs/orm/prisma-migrate)
- [PostgreSQL docs](https://www.postgresql.org/docs/)
- [Zod docs](https://zod.dev/)
- [jose documentation](https://github.com/panva/jose)
- [Docker Compose docs](https://docs.docker.com/compose/)
- [PostgreSQL Docker Official Image](https://hub.docker.com/_/postgres)
- [DigitalOcean Spaces docs](https://docs.digitalocean.com/products/spaces/)
- [DigitalOcean Spaces CDN docs](https://docs.digitalocean.com/products/spaces/how-to/enable-cdn/)
