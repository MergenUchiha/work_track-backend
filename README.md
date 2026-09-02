# WorkTrack Backend API

Order and task management service with role-based access, state-machine-guarded status transitions and a full audit trail.

[![NestJS](https://img.shields.io/badge/NestJS-10.x-E0234E?logo=nestjs)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5.x-2D3748?logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql)](https://www.postgresql.org/)
[![Swagger](https://img.shields.io/badge/Swagger-OpenAPI-85EA2D?logo=swagger)](https://swagger.io/)

---

## Contents

- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Docker](#docker)
- [Environment variables](#environment-variables)
- [Database](#database)
- [API reference](#api-reference)
- [Authentication](#authentication)
- [Roles (RBAC)](#roles-rbac)
- [Order status machine](#order-status-machine)
- [Rate limiting](#rate-limiting)
- [Telegram bot](#telegram-bot)
- [Testing](#testing)
- [Request examples](#request-examples)
- [Response format](#response-format)
- [Audit actions](#audit-actions)

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                         Client (HTTP)                           │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NestJS Application                           │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐    │
│  │ Middleware  │  │   Guards     │  │    Interceptors      │    │
│  │             │  │              │  │                      │    │
│  │ RequestId   │  │ JwtAuthGuard │  │ LoggingInterceptor   │    │
│  │ AuditMw     │  │ RolesGuard   │  │ TransformInterceptor │    │
│  └──────┬──────┘  │ ThrottlerGrd │  └──────────────────────┘    │
│         │         └──────────────┘                              │
│         ▼                                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      Controllers                         │   │
│  │  AuthController  UsersController  OrdersController       │   │
│  │  AuditsController  HealthController                      │   │
│  └──────────────────────┬───────────────────────────────────┘   │
│                         │                                       │
│                         ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                       Services                           │   │
│  │  AuthService   UsersService   OrdersService              │   │
│  │  AuditsService                                           │   │
│  └──────────────────────┬───────────────────────────────────┘   │
│                         │                                       │
│                         ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   PrismaService                          │   │
│  │              (database abstraction layer)                │   │
│  └──────────────────────┬───────────────────────────────────┘   │
└─────────────────────────┼───────────────────────────────────────┘
                          │
                          ▼
           ┌──────────────────────────┐
           │      PostgreSQL DB       │
           │                          │
           │  users                   │
           │  orders                  │
           │  refresh_tokens          │
           │  order_audit_logs        │
           └──────────────────────────┘
```

### Design notes

**Modular structure** — each area (`auth`, `users`, `orders`, `audits`) is a self-contained NestJS module with its own controller, service and DTOs.

**Layered request handling** — a request passes through middleware (request id, audit) → guards (JWT, roles, throttler) → interceptors (logging, transform) → controller → service → database.

**State machine for statuses** — order transitions are validated against an explicit table, so invalid transitions are rejected in the domain layer rather than relying on callers to behave.

**Audit trail** — every order change is written to `order_audit_logs` with the old value, the new value, the acting user and a timestamp.

**RBAC** — the ADMIN / MANAGER / WORKER model is enforced by `JwtAuthGuard` + `RolesGuard` + the `@Roles()` decorator.

**Fail-fast configuration** — environment variables are validated at startup (`src/config/env.validation.ts`); a missing secret stops the process with a readable message.

---

## Tech stack

| Component     | Technology              | Version |
| ------------- | ----------------------- | ------- |
| Framework     | NestJS                  | 10.x    |
| Language      | TypeScript              | 5.x     |
| ORM           | Prisma                  | 5.x     |
| Database      | PostgreSQL              | 16      |
| Auth          | JWT (passport-jwt)      | —       |
| Validation    | class-validator         | 0.14.x  |
| Documentation | Swagger / OpenAPI       | 7.x     |
| Logging       | Winston                 | 3.x     |
| Security      | Helmet, Throttler       | —       |
| Bot           | Telegraf (optional)     | 4.x     |
| Testing       | Jest                    | 29.x    |
| Container     | Docker + docker compose | —       |

---

## Project structure

```text
worktrack-backend/
├── prisma/
│   ├── schemas/              # Prisma schema, split per entity
│   │   ├── schema.prisma     # datasource, generator, enums
│   │   ├── user.prisma
│   │   ├── orders.prisma
│   │   ├── refreshToken.prisma
│   │   └── orderAuditLogs.prisma
│   ├── migrations/           # SQL migrations (committed on purpose)
│   ├── seeds/                # seed scripts (faker + fixed accounts)
│   └── seed.ts
│
├── src/
│   ├── app.module.ts         # root module
│   ├── main.ts               # bootstrap: Helmet, CORS, Swagger, validation
│   │
│   ├── config/
│   │   └── env.validation.ts # startup validation of environment variables
│   │
│   ├── common/
│   │   ├── config/           # throttler, cors, helmet
│   │   ├── decorators/       # ThrottleCustom, SkipThrottle
│   │   ├── filters/          # AllExceptionsFilter (HTTP + Prisma errors)
│   │   ├── guards/           # CustomThrottlerGuard
│   │   ├── health/           # health endpoints (Terminus)
│   │   ├── interceptors/     # logging, response envelope
│   │   ├── logger/           # CustomLoggerService (Winston)
│   │   └── middleware/       # RequestIdMiddleware
│   │
│   ├── bot/                  # optional Telegram bot (Telegraf)
│   │
│   └── modules/
│       ├── auth/             # register, login, refresh, logout, JWT strategies
│       ├── users/            # user CRUD, role changes, blocking
│       ├── orders/           # order CRUD, status machine, assignment
│       ├── audits/           # change log, statistics, cleanup
│       └── prisma/           # PrismaService (global module)
│
├── test/
│   └── jest-e2e.json
│
├── .env.example
├── docker-compose.yml
├── Dockerfile
├── docker-entrypoint.sh
└── package.json
```

---

## Getting started

### Requirements

- Node.js 20+
- PostgreSQL 16+
- npm 10+

### Setup

```bash
# 1. Clone
git clone https://github.com/MergenUchiha/work_track-backend.git
cd work_track-backend

# 2. Install dependencies
npm ci

# 3. Configure the environment
cp .env.example .env
# edit .env: database credentials and JWT secrets

# 4. Apply migrations and generate the Prisma client
npm run prisma:migrate
npm run prisma:generate

# 5. Optional: fill the database with demo data
npm run prisma:seed

# 6. Run
npm run start:dev
```

Once running:

- API: `http://localhost:3000/api`
- Swagger UI: `http://localhost:3000/api/docs`
- Health check: `http://localhost:3000/health`

---

## Docker

### Full stack with docker compose

```bash
# PostgreSQL + application
docker compose up -d

# Follow the application logs
docker compose logs -f app

# Stop
docker compose down

# Stop and delete the database volume
docker compose down -v
```

`POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` have no defaults: compose refuses to start rather than bringing production up with a password published in this repository.

The database port is bound to `127.0.0.1`. Remove the mapping entirely when deploying.

Migrations run from `docker-entrypoint.sh` before the application starts.

### Application only, against an external database

```bash
docker build -t worktrack-backend .
docker run -p 3000:3000 --env-file .env worktrack-backend
```

---

## Environment variables

Copy `.env.example` to `.env` and fill it in. Every variable is validated at startup — see [`src/config/env.validation.ts`](src/config/env.validation.ts).

| Variable                                       | Required | Description                                                     |
| ---------------------------------------------- | -------- | --------------------------------------------------------------- |
| `NODE_ENV`                                     | no       | `development` \| `production` \| `test`                          |
| `PORT`                                         | no       | HTTP port, default 3000                                          |
| `SWAGGER_ENABLED`                              | no       | Forces the docs on or off. Unset: on in dev, off in production   |
| `DATABASE_URL`                                 | **yes**  | PostgreSQL connection string                                     |
| `JWT_ACCESS_SECRET`                            | **yes**  | At least 32 characters                                           |
| `JWT_REFRESH_SECRET`                           | **yes**  | At least 32 characters, different from the access secret         |
| `JWT_ACCESS_EXPIRES_IN`                        | no       | Access token lifetime, default `15m`                             |
| `JWT_REFRESH_EXPIRES_IN`                       | no       | Refresh token lifetime, default `7d`                             |
| `BCRYPT_ROUNDS`                                | no       | Cost factor, 10–15, default 10                                   |
| `CORS_ORIGINS`                                 | no       | Comma-separated list of allowed origins                          |
| `LOG_LEVEL`                                    | no       | `error` \| `warn` \| `info` \| `debug` \| `verbose`              |
| `TELEGRAM_BOT_ENABLED`                         | no       | Enables the bot, default false                                   |
| `TELEGRAM_BOT_TOKEN`                           | if bot   | Required when the bot is enabled                                 |
| `TELEGRAM_USE_WEBHOOK`, `TELEGRAM_WEBHOOK_*`   | no       | Webhook mode instead of long polling                             |

Durations accept any format `jsonwebtoken` understands: `15m`, `12h`, `7d`.

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Database

### Schema

```text
users
  id            UUID PK
  email         VARCHAR(255) UNIQUE
  name          VARCHAR(255)
  password_hash VARCHAR(255)
  role          user_role (ADMIN | MANAGER | WORKER)
  is_active     BOOLEAN DEFAULT true
  telegram_id   BIGINT? UNIQUE
  created_at    TIMESTAMPTZ
  updated_at    TIMESTAMPTZ

orders
  id             UUID PK
  title          VARCHAR(255)
  description    TEXT?
  status         order_status (NEW | IN_PROGRESS | DONE | CANCELLED)
  priority       order_priority (LOW | MEDIUM | HIGH)
  deadline       TIMESTAMPTZ?
  created_at     TIMESTAMPTZ
  updated_at     TIMESTAMPTZ
  created_by_id  UUID FK → users
  assigned_to_id UUID? FK → users

refresh_tokens
  id            UUID PK
  token_hash    VARCHAR(255)     -- SHA-256 hash, never the raw token
  expires_at    TIMESTAMPTZ
  revoked       BOOLEAN DEFAULT false
  created_at    TIMESTAMPTZ
  user_id       UUID FK → users

order_audit_logs
  id            UUID PK
  action        VARCHAR(100)     -- ORDER_CREATED, STATUS_CHANGED, ...
  old_value     JSONB?
  new_value     JSONB?
  created_at    TIMESTAMPTZ
  order_id      UUID FK → orders
  changed_by_id UUID FK → users
```

### Prisma commands

```bash
npm run prisma:migrate    # create and apply a migration (development)
npm run prisma:deploy     # apply migrations (production)
npm run prisma:generate   # generate the Prisma client
npm run prisma:seed       # seed demo data
npm run prisma:studio     # open Prisma Studio
```

### Seeded accounts

| Email               | Password   | Role    |
| ------------------- | ---------- | ------- |
| admin@example.com   | admin123   | ADMIN   |
| manager@example.com | manager123 | MANAGER |
| worker@example.com  | worker123  | WORKER  |

These exist only in seed data — never deploy them.

---

## API reference

Interactive documentation lives in Swagger UI at `/api/docs`.

### Authentication — `/api/auth`

| Method | Path          | Description                     | Auth |
| ------ | ------------- | ------------------------------- | ---- |
| POST   | `/register`   | Register (always role WORKER)   | —    |
| POST   | `/login`      | Sign in, returns a token pair   | —    |
| POST   | `/refresh`    | Rotate the token pair           | —    |
| POST   | `/logout`     | Revoke one refresh token        | —    |
| POST   | `/logout-all` | End every session               | JWT  |
| GET    | `/profile`    | Profile from the JWT payload    | JWT  |

### Users — `/api/users`

| Method | Path               | Description                    | Roles                            |
| ------ | ------------------ | ------------------------------ | -------------------------------- |
| GET    | `/profile`         | Own profile from the database  | any                              |
| PUT    | `/profile`         | Update own profile             | any                              |
| GET    | `/`                | List users, paginated          | ADMIN, MANAGER                   |
| GET    | `/:id`             | User by id                     | ADMIN, MANAGER, or the user      |
| PATCH  | `/:id/role`        | Change a role                  | ADMIN                            |
| PATCH  | `/:id/active`      | Block or unblock               | ADMIN                            |
| GET    | `/stats/overview`  | User statistics                | ADMIN                            |
| DELETE | `/:id`             | Soft delete (deactivate)       | ADMIN                            |

### Orders — `/api/orders`

| Method | Path              | Description                        | Roles                         |
| ------ | ----------------- | ---------------------------------- | ----------------------------- |
| POST   | `/`               | Create an order                    | ADMIN, MANAGER                |
| GET    | `/`               | List with filters and pagination   | any (workers see their own)   |
| GET    | `/stats/overview` | Order statistics                   | any (workers see their own)   |
| GET    | `/:id`            | Order by id                        | any (workers see their own)   |
| PUT    | `/:id`            | Update an order                    | ADMIN, MANAGER, creator       |
| PATCH  | `/:id/assign`     | Assign or unassign a worker        | ADMIN, MANAGER                |
| PATCH  | `/:id/status`     | Change status (state machine)      | role-dependent                |
| POST   | `/:id/cancel`     | Cancel with a reason               | ADMIN, MANAGER, creator       |
| DELETE | `/:id`            | Delete an order                    | ADMIN                         |

### Audit — `/api/audit`

| Method | Path                                | Description                | Roles          |
| ------ | ----------------------------------- | -------------------------- | -------------- |
| GET    | `/logs`                             | All entries, filterable    | ADMIN          |
| GET    | `/logs/order/:orderId`              | Entries for one order      | ADMIN, MANAGER |
| GET    | `/logs/user/:userId`                | Entries for one user       | ADMIN          |
| GET    | `/logs/my-activity`                 | Your own activity          | any            |
| GET    | `/logs/recent`                      | Most recent actions        | ADMIN, MANAGER |
| GET    | `/logs/order/:orderId/field/:field` | History of a single field  | ADMIN, MANAGER |
| GET    | `/stats`                            | Action statistics          | ADMIN          |
| DELETE | `/logs/cleanup`                     | Drop entries past retention| ADMIN          |

### Health — `/health`

| Method | Path                | Description                        |
| ------ | ------------------- | ---------------------------------- |
| GET    | `/health`           | Database, memory and disk checks   |
| GET    | `/health/live`      | Liveness probe                     |
| GET    | `/health/ready`     | Readiness probe (database only)    |
| GET    | `/health/detailed`  | Detailed report                    |

Health endpoints are exempt from rate limiting and are served outside the `/api` prefix.

---

## Authentication

Two tokens, deliberately different in lifetime and storage:

- **Access token** — short-lived (15 minutes by default), sent as `Authorization: Bearer <token>`.
- **Refresh token** — long-lived (7 days by default), single use. Only its SHA-256 hash is stored, so a database leak does not hand over usable sessions.

Rotating a refresh token deletes the old row. Blocking a user revokes every refresh token they hold.

```text
1. POST /api/auth/login    → { accessToken, refreshToken, user }
2. Send accessToken as: Authorization: Bearer <accessToken>
3. On expiry: POST /api/auth/refresh → a new pair
4. To end the session: POST /api/auth/logout (refreshToken in the body)
```

---

## Roles (RBAC)

| Action                              | ADMIN | MANAGER  | WORKER       |
| ----------------------------------- | :---: | :------: | :----------: |
| Create orders                       |  ✅   |    ✅    |      ❌      |
| View all orders                     |  ✅   |    ✅    |      ❌      |
| View own orders                     |  ✅   |    ✅    |      ✅      |
| Assign workers                      |  ✅   |    ✅    |      ❌      |
| Move to IN_PROGRESS / DONE          |  ✅   |    ✅    | assignee only|
| Manage users                        |  ✅   | read only|      ❌      |
| Change roles                        |  ✅   |    ❌    |      ❌      |
| Block users                         |  ✅   |    ❌    |      ❌      |
| Read all audit entries              |  ✅   |    ❌    |      ❌      |
| Read own activity                   |  ✅   |    ✅    |      ✅      |

---

## Order status machine

```text
         ┌──────────────┐
         │     NEW      │
         └──────┬───────┘
                │
        ┌───────┴────────┐
        ▼                ▼
 ┌─────────────┐   ┌───────────┐
 │ IN_PROGRESS │   │ CANCELLED │
 └──────┬──────┘   └───────────┘
        │
    ┌───┴────┐
    ▼        ▼
 ┌──────┐ ┌───────────┐
 │ DONE │ │ CANCELLED │
 └──────┘ └───────────┘
```

| From \ To   | NEW | IN_PROGRESS | DONE | CANCELLED |
| ----------- | :-: | :---------: | :--: | :-------: |
| NEW         |  —  |     ✅      |  ❌  |    ✅     |
| IN_PROGRESS |  ❌ |      —      |  ✅  |    ✅     |
| DONE        |  ❌ |     ❌      |  —   |    ❌     |
| CANCELLED   |  ❌ |     ❌      |  ❌  |     —     |

Only the assignee, an ADMIN or a MANAGER may move an order to `IN_PROGRESS` or `DONE`.

---

## Rate limiting

| Window | Limit         | Period   |
| ------ | ------------- | -------- |
| Short  | 10 requests   | 1 second |
| Medium | 100 requests  | 1 minute |
| Long   | 1000 requests | 1 hour   |

Authentication endpoints are stricter (5 login attempts per 15 minutes, 3 registrations per hour). Admins bypass throttling and health endpoints are exempt.

---

## Telegram bot

The service ships with an optional Telegram bot: browse and create orders, pick them up, complete or cancel them, and receive notifications. It is disabled unless `TELEGRAM_BOT_ENABLED=true`, and the API runs perfectly well without it.

See [TELEGRAM_BOT_README.md](TELEGRAM_BOT_README.md) for setup and the command list.

---

## Testing

```bash
npm run test         # unit tests
npm run test:watch   # watch mode
npm run test:cov     # with coverage
npm run test:e2e     # end-to-end (configuration only, no specs yet)
```

Unit tests cover:

- `UsersService` — CRUD, role rules, blocking
- `OrdersService` — creation, status transitions, assignment, cancellation
- `AuditsService` — writing entries, filtering, statistics, cleanup

---

## Request examples

### Register

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "name": "John Doe",
    "password": "Secret123"
  }'
```

Response (201):

```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "email": "newuser@example.com",
      "name": "John Doe",
      "role": "WORKER",
      "isActive": true,
      "createdAt": "2026-02-14T10:00:00.000Z",
      "updatedAt": "2026-02-14T10:00:00.000Z"
    }
  },
  "statusCode": 201,
  "timestamp": "2026-02-14T10:00:00.000Z",
  "path": "/api/auth/register"
}
```

### Sign in

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "admin@example.com", "password": "admin123" }'
```

### Rotate tokens

```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{ "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }'
```

### Create an order (ADMIN / MANAGER)

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Build the authentication module",
    "description": "Implement JWT with refresh tokens",
    "priority": "HIGH",
    "deadline": "2026-03-31T23:59:59.000Z",
    "assignedToId": "550e8400-e29b-41d4-a716-446655440003"
  }'
```

### List orders with filters

```bash
# High-priority work in progress, page 2
curl "http://localhost:3000/api/orders?status=IN_PROGRESS&priority=HIGH&page=2&limit=5&sortBy=deadline&sortOrder=asc" \
  -H "Authorization: Bearer <accessToken>"

# Overdue orders
curl "http://localhost:3000/api/orders?overdue=true&page=1&limit=10" \
  -H "Authorization: Bearer <accessToken>"

# Full-text search
curl "http://localhost:3000/api/orders?search=authentication" \
  -H "Authorization: Bearer <accessToken>"
```

### Change status

```bash
curl -X PATCH http://localhost:3000/api/orders/660e8400-e29b-41d4-a716-446655440001/status \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{ "status": "IN_PROGRESS" }'
```

### Cancel with a reason

```bash
curl -X POST http://localhost:3000/api/orders/660e8400-e29b-41d4-a716-446655440001/cancel \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "Requirements withdrawn by the client" }'
```

### Assign and unassign

```bash
# Assign
curl -X PATCH http://localhost:3000/api/orders/660e8400-e29b-41d4-a716-446655440001/assign \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{ "assignedToId": "550e8400-e29b-41d4-a716-446655440003" }'

# Unassign
curl -X PATCH http://localhost:3000/api/orders/660e8400-e29b-41d4-a716-446655440001/assign \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{ "assignedToId": null }'
```

### Change a role (ADMIN)

```bash
curl -X PATCH http://localhost:3000/api/users/550e8400-e29b-41d4-a716-446655440003/role \
  -H "Authorization: Bearer <adminAccessToken>" \
  -H "Content-Type: application/json" \
  -d '{ "role": "MANAGER" }'
```

### Audit trail of an order

```bash
curl http://localhost:3000/api/audit/logs/order/660e8400-e29b-41d4-a716-446655440001 \
  -H "Authorization: Bearer <accessToken>"
```

```json
{
  "data": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440001",
      "action": "STATUS_CHANGED",
      "oldValue": { "status": "NEW" },
      "newValue": { "status": "IN_PROGRESS" },
      "createdAt": "2026-02-14T11:00:00.000Z",
      "orderId": "660e8400-e29b-41d4-a716-446655440001",
      "changedById": "550e8400-e29b-41d4-a716-446655440003",
      "changedBy": {
        "id": "550e8400-e29b-41d4-a716-446655440003",
        "email": "worker@example.com",
        "name": "Worker User",
        "role": "WORKER"
      }
    }
  ],
  "statusCode": 200,
  "timestamp": "2026-02-14T12:00:00.000Z",
  "path": "/api/audit/logs/order/660e8400..."
}
```

### Health check

```bash
curl http://localhost:3000/health
```

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "memory_heap": { "status": "up" },
    "memory_rss": { "status": "up" },
    "storage": { "status": "up" }
  },
  "error": {},
  "details": {}
}
```

---

## Response format

Successful responses are wrapped by `TransformInterceptor`:

```json
{
  "data": {},
  "statusCode": 200,
  "timestamp": "2026-02-14T12:00:00.000Z",
  "path": "/api/orders"
}
```

Errors are normalised by `AllExceptionsFilter`:

```json
{
  "statusCode": 404,
  "timestamp": "2026-02-14T12:00:00.000Z",
  "path": "/api/orders/non-existent-id",
  "method": "GET",
  "error": "Not Found",
  "message": "Order not found"
}
```

Stack traces are included outside production only. Request bodies written to the log have credential fields redacted.

---

## Audit actions

| Action            | Meaning                                          |
| ----------------- | ------------------------------------------------ |
| `ORDER_CREATED`   | A new order was created                          |
| `ORDER_UPDATED`   | Order fields were changed                        |
| `ORDER_CANCELLED` | Order cancelled; `newValue` holds `cancelReason` |
| `STATUS_CHANGED`  | Status transition                                |
| `ASSIGNED`        | A worker was assigned                            |
| `UNASSIGNED`      | The assignee was removed                         |

---

## License

UNLICENSED — private project.
