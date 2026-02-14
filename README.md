# WorkTrack Backend API

Система управления заказами и задачами с поддержкой ролей, FSM-статусов и аудита действий.

[![NestJS](https://img.shields.io/badge/NestJS-10.x-E0234E?logo=nestjs)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5.x-2D3748?logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql)](https://www.postgresql.org/)
[![Swagger](https://img.shields.io/badge/Swagger-OpenAPI-85EA2D?logo=swagger)](http://localhost:3000/api/docs)

---

## Содержание

- [Архитектура](#архитектура)
- [Стек технологий](#стек-технологий)
- [Структура проекта](#структура-проекта)
- [Быстрый старт](#быстрый-старт)
- [Docker](#docker)
- [Переменные окружения](#переменные-окружения)
- [База данных](#база-данных)
- [API Reference](#api-reference)
- [Аутентификация](#аутентификация)
- [Система ролей (RBAC)](#система-ролей-rbac)
- [FSM статусов заказов](#fsm-статусов-заказов)
- [Rate Limiting](#rate-limiting)
- [Тестирование](#тестирование)
- [Примеры запросов](#примеры-запросов)

---

## Архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (HTTP)                           │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NestJS Application                           │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Middleware  │  │   Guards     │  │    Interceptors      │  │
│  │             │  │              │  │                      │  │
│  │ RequestId   │  │ JwtAuthGuard │  │ LoggingInterceptor   │  │
│  │ AuditMw     │  │ RolesGuard   │  │ TransformInterceptor │  │
│  └──────┬──────┘  │ ThrottlerGrd │  └──────────────────────┘  │
│         │         └──────────────┘                             │
│         ▼                                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                      Controllers                         │  │
│  │  AuthController  UsersController  OrdersController       │  │
│  │  AuditsController  HealthController                      │  │
│  └──────────────────────┬───────────────────────────────────┘  │
│                         │                                       │
│                         ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                       Services                           │  │
│  │  AuthService   UsersService   OrdersService              │  │
│  │  AuditsService                                           │  │
│  └──────────────────────┬───────────────────────────────────┘  │
│                         │                                       │
│                         ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   PrismaService                          │  │
│  │              (Database Abstraction Layer)                │  │
│  └──────────────────────┬───────────────────────────────────┘  │
└─────────────────────────┼───────────────────────────────────────┘
                          │
                          ▼
           ┌──────────────────────────┐
           │      PostgreSQL DB       │
           │                         │
           │  users                  │
           │  orders                 │
           │  refresh_tokens         │
           │  order_audit_logs       │
           └──────────────────────────┘
```

### Принципы архитектуры

**Модульная структура** — каждая функциональная область (`auth`, `users`, `orders`, `audits`) инкапсулирована в отдельный NestJS модуль со своими контроллером, сервисом и DTO.

**Слои безопасности** — запрос последовательно проходит через Middleware (RequestId, Audit) → Guards (JWT, Roles, Throttler) → Interceptors (Logging, Transform) → Controller → Service → Database.

**FSM для статусов** — переходы между статусами заказов контролируются конечным автоматом, что исключает невалидные переходы на уровне бизнес-логики.

**Audit trail** — все изменения заказов записываются в `order_audit_logs` с сохранением старого и нового значения, пользователя и временной метки.

**RBAC** — ролевая модель (ADMIN / MANAGER / WORKER) реализована через комбинацию `JwtAuthGuard` + `RolesGuard` + декоратор `@Roles()`.

---

## Стек технологий

| Компонент | Технология | Версия |
|---|---|---|
| Framework | NestJS | 10.x |
| Language | TypeScript | 5.x |
| ORM | Prisma | 5.x |
| Database | PostgreSQL | 16 |
| Auth | JWT (passport-jwt) | — |
| Validation | class-validator | 0.14.x |
| Documentation | Swagger / OpenAPI | 7.x |
| Logging | Winston | 3.x |
| Security | Helmet, Throttler | — |
| Testing | Jest | 29.x |
| Container | Docker + docker-compose | — |

---

## Структура проекта

```
worktrack-backend/
├── prisma/
│   ├── schemas/              # Prisma схемы (разделены по сущностям)
│   │   ├── schema.prisma     # Datasource, generator, enums
│   │   ├── user.prisma
│   │   ├── orders.prisma
│   │   ├── refreshToken.prisma
│   │   └── orderAuditLogs.prisma
│   ├── migrations/           # SQL миграции
│   ├── seeds/                # Seed-скрипты (faker + фиксированные пользователи)
│   └── seed.ts
│
├── src/
│   ├── app.module.ts         # Корневой модуль
│   ├── main.ts               # Bootstrap + Helmet, CORS, Swagger, ValidationPipe
│   │
│   ├── common/
│   │   ├── config/           # throttler.config, cors.config, helmet.config
│   │   ├── decorators/       # ThrottleCustom, SkipThrottle
│   │   ├── filters/          # AllExceptionsFilter (HTTP + Prisma errors)
│   │   ├── guards/           # CustomThrottlerGuard
│   │   ├── health/           # HealthController, HealthModule (/terminus)
│   │   ├── interceptors/     # LoggingInterceptor, TransformInterceptor
│   │   ├── logger/           # CustomLoggerService (Winston)
│   │   └── middleware/       # RequestIdMiddleware
│   │
│   └── modules/
│       ├── auth/             # Регистрация, логин, refresh, logout, JWT-стратегии
│       ├── users/            # CRUD пользователей, смена роли, блокировка
│       ├── orders/           # CRUD заказов, FSM статусов, назначение
│       ├── audits/           # Лог изменений, статистика, очистка
│       └── prisma/           # PrismaService (глобальный модуль)
│
├── test/
│   └── jest-e2e.json
│
├── .env.example
├── docker-compose.yml
├── Dockerfile
└── package.json
```

---

## Быстрый старт

### Предварительные требования

- Node.js 20+
- PostgreSQL 16+
- npm 10+

### Установка

```bash
# 1. Клонировать репозиторий
git clone <repo-url>
cd worktrack-backend

# 2. Установить зависимости
npm install

# 3. Настроить переменные окружения
cp .env.example .env
# Отредактировать .env, указав параметры БД и секреты

# 4. Применить миграции и сгенерировать Prisma Client
npm run prisma:migrate
npm run prisma:generate

# 5. (Опционально) Заполнить БД тестовыми данными
npm run prisma:seed

# 6. Запустить приложение
npm run start:dev
```

Приложение будет доступно:
- API: `http://localhost:3000/api`
- Swagger UI: `http://localhost:3000/api/docs`
- Health check: `http://localhost:3000/health`

---

## Docker

### Запуск через docker-compose (рекомендуется)

```bash
# Запустить всё окружение (PostgreSQL + приложение)
docker-compose up -d

# Посмотреть логи
docker-compose logs -f app

# Остановить
docker-compose down

# Остановить и удалить данные БД
docker-compose down -v
```

### Только приложение (с внешней БД)

```bash
docker build -t worktrack-backend .
docker run -p 3000:3000 --env-file .env worktrack-backend
```

---

## Переменные окружения

Скопируйте `.env.example` в `.env` и заполните значения:

```env
# Приложение
ENVIRONMENT=development     # development | production | test
PORT=3000

# База данных
DATABASE_URL=postgresql://user:password@localhost:5432/worktrack

# JWT — Access Token
JWT_ACCESS_SECRET=your-super-secret-access-key-min-32-chars
JWT_ACCESS_EXPIRES_IN=15m          # Срок действия Access Token

# JWT — Refresh Token
JWT_REFRESH_SECRET=your-super-secret-refresh-key-min-32-chars
JWT_REFRESH_EXPIRES_IN=7d          # Срок действия Refresh Token (в днях: 7d, 30d)

# (Опционально) Bcrypt rounds (default: 10)
BCRYPT_ROUNDS=10

# (Опционально) CORS origins через запятую
CORS_ORIGINS=http://localhost:3001,https://yourdomain.com

# (Опционально) Уровень логирования
LOG_LEVEL=info                     # error | warn | info | debug | verbose
```

> **Важно:** `JWT_ACCESS_EXPIRES_IN` и `JWT_REFRESH_EXPIRES_IN` — именно такие имена переменных.  
> Используйте форматы `15m`, `1h` для минут/часов; `7d`, `30d` — для дней.

---

## База данных

### Схема

```
users
  id            UUID PK
  email         VARCHAR(255) UNIQUE
  name          VARCHAR(255)
  password_hash VARCHAR(255)
  role          user_role (ADMIN | MANAGER | WORKER)
  is_active     BOOLEAN DEFAULT true
  created_at    TIMESTAMPTZ
  updated_at    TIMESTAMPTZ

orders
  id            UUID PK
  title         VARCHAR(255)
  description   TEXT?
  status        order_status (NEW | IN_PROGRESS | DONE | CANCELLED)
  priority      order_priority (LOW | MEDIUM | HIGH)
  deadline      TIMESTAMPTZ?
  created_at    TIMESTAMPTZ
  updated_at    TIMESTAMPTZ
  created_by_id UUID FK → users
  assigned_to_id UUID? FK → users

refresh_tokens
  id            UUID PK
  token_hash    VARCHAR(255)     -- SHA-256 хеш, не raw токен
  expires_at    TIMESTAMPTZ
  revoked       BOOLEAN DEFAULT false
  created_at    TIMESTAMPTZ
  user_id       UUID FK → users

order_audit_logs
  id            UUID PK
  action        VARCHAR(100)     -- ORDER_CREATED, STATUS_CHANGED, etc.
  old_value     JSONB?
  new_value     JSONB?
  created_at    TIMESTAMPTZ
  order_id      UUID FK → orders
  changed_by_id UUID FK → users
```

### Команды Prisma

```bash
# Создать новую миграцию
npm run prisma:migrate

# Применить миграции (продакшен)
npm run prisma:deploy

# Сгенерировать Prisma Client
npm run prisma:generate

# Заполнить БД тестовыми данными
npm run prisma:seed
```

### Тестовые пользователи (после seed)

| Email | Пароль | Роль |
|---|---|---|
| admin@example.com | admin123 | ADMIN |
| manager@example.com | manager123 | MANAGER |
| worker@example.com | worker123 | WORKER |

---

## API Reference

Полная интерактивная документация доступна в Swagger UI: `http://localhost:3000/api/docs`

### Endpoints

#### Authentication — `/api/auth`

| Метод | Путь | Описание | Авторизация |
|---|---|---|---|
| POST | `/register` | Регистрация (роль: WORKER) | Нет |
| POST | `/login` | Вход, получение токенов | Нет |
| POST | `/refresh` | Обновление токенов | Нет |
| POST | `/logout` | Выход (отзыв refresh токена) | Нет |
| POST | `/logout-all` | Завершить все сессии | JWT |
| GET | `/profile` | Профиль из JWT payload | JWT |

#### Users — `/api/users`

| Метод | Путь | Описание | Роли |
|---|---|---|---|
| GET | `/profile` | Свой профиль из БД | Все |
| PUT | `/profile` | Обновить свой профиль | Все |
| GET | `/` | Список пользователей + пагинация | ADMIN, MANAGER |
| GET | `/:id` | Пользователь по ID | ADMIN, MANAGER (или сам пользователь) |
| PATCH | `/:id/role` | Сменить роль | ADMIN |
| PATCH | `/:id/active` | Заблокировать / разблокировать | ADMIN |
| GET | `/stats/overview` | Статистика пользователей | ADMIN |
| DELETE | `/:id` | Мягкое удаление (деактивация) | ADMIN |

#### Orders — `/api/orders`

| Метод | Путь | Описание | Роли |
|---|---|---|---|
| POST | `/` | Создать заказ | ADMIN, MANAGER |
| GET | `/` | Список заказов + фильтры + пагинация | Все (WORKER — только свои) |
| GET | `/stats/overview` | Статистика заказов | Все (WORKER — только свои) |
| GET | `/:id` | Заказ по ID | Все (WORKER — только свои) |
| PUT | `/:id` | Обновить заказ | ADMIN, MANAGER, создатель |
| PATCH | `/:id/assign` | Назначить / снять исполнителя | ADMIN, MANAGER |
| PATCH | `/:id/status` | Изменить статус (FSM) | По ролям |
| POST | `/:id/cancel` | Отменить заказ с причиной | ADMIN, MANAGER, создатель |
| DELETE | `/:id` | Удалить заказ | ADMIN |

#### Audit — `/api/audit`

| Метод | Путь | Описание | Роли |
|---|---|---|---|
| GET | `/logs` | Все логи + фильтры + пагинация | ADMIN |
| GET | `/logs/order/:orderId` | Логи по заказу | ADMIN, MANAGER |
| GET | `/logs/user/:userId` | Логи по пользователю | ADMIN |
| GET | `/logs/my-activity` | Моя активность | Все |
| GET | `/logs/recent` | Последние N действий | ADMIN, MANAGER |
| GET | `/logs/order/:orderId/field/:field` | История изменений поля | ADMIN, MANAGER |
| GET | `/stats` | Статистика действий | ADMIN |
| DELETE | `/logs/cleanup` | Удалить старые логи | ADMIN |

#### Health — `/health`

| Метод | Путь | Описание |
|---|---|---|
| GET | `/health` | Полная проверка (DB, память, диск) |
| GET | `/health/live` | Liveness probe |
| GET | `/health/ready` | Readiness probe (только DB) |
| GET | `/health/detailed` | Детальная проверка |

---

## Аутентификация

API использует **JWT Bearer Token** аутентификацию с двумя токенами:

- **Access Token** — короткоживущий (15 мин), передаётся в `Authorization: Bearer <token>` заголовке
- **Refresh Token** — долгоживущий (7 дней), используется для получения новой пары токенов, хранится в БД как SHA-256 хеш (one-time use)

### Поток аутентификации

```
1. POST /api/auth/login → { accessToken, refreshToken, user }
2. Использовать accessToken в заголовке: Authorization: Bearer <accessToken>
3. При истечении accessToken: POST /api/auth/refresh → { accessToken, refreshToken }
4. При завершении сессии: POST /api/auth/logout (с refreshToken в body)
```

---

## Система ролей (RBAC)

| Действие | ADMIN | MANAGER | WORKER |
|---|:---:|:---:|:---:|
| Создание заказов | ✅ | ✅ | ❌ |
| Просмотр всех заказов | ✅ | ✅ | ❌ |
| Просмотр своих заказов | ✅ | ✅ | ✅ |
| Назначение исполнителей | ✅ | ✅ | ❌ |
| Изменение статуса (IN_PROGRESS/DONE) | ✅ | ✅ | только назначенный |
| Управление пользователями | ✅ | просмотр | ❌ |
| Смена ролей | ✅ | ❌ | ❌ |
| Блокировка пользователей | ✅ | ❌ | ❌ |
| Просмотр всех аудит-логов | ✅ | ❌ | ❌ |
| Своя активность | ✅ | ✅ | ✅ |

---

## FSM статусов заказов

```
         ┌─────────────┐
         │     NEW      │
         └──────┬───────┘
                │
        ┌───────┴────────┐
        ▼                ▼
 ┌────────────┐    ┌───────────┐
 │ IN_PROGRESS │    │ CANCELLED │
 └──────┬──────┘    └───────────┘
        │
    ┌───┴────┐
    ▼        ▼
 ┌──────┐ ┌───────────┐
 │ DONE │ │ CANCELLED │
 └──────┘ └───────────┘
```

| Из \ В | NEW | IN_PROGRESS | DONE | CANCELLED |
|---|:---:|:---:|:---:|:---:|
| NEW | — | ✅ | ❌ | ✅ |
| IN_PROGRESS | ❌ | — | ✅ | ✅ |
| DONE | ❌ | ❌ | — | ❌ |
| CANCELLED | ❌ | ❌ | ❌ | — |

**Важно:** Перевести заказ в `IN_PROGRESS` или `DONE` может только назначенный исполнитель, ADMIN или MANAGER.

---

## Rate Limiting

| Уровень | Лимит | Окно |
|---|---|---|
| Short | 10 запросов | 1 секунда |
| Medium | 100 запросов | 1 минута |
| Long | 1000 запросов | 1 час |

ADMIN-пользователи пропускаются без ограничений. Health-эндпоинты освобождены от лимитов.

---

## Тестирование

```bash
# Unit тесты
npm run test

# Unit тесты с watch-режимом
npm run test:watch

# Тесты с coverage
npm run test:cov

# E2E тесты
npm run test:e2e
```

Покрыты unit-тестами:
- `AuthService` — регистрация, логин, refresh, logout
- `UsersService` — CRUD, RBAC-проверки, блокировка
- `OrdersService` — создание, FSM, назначение, отмена
- `AuditsService` — создание логов, фильтрация, статистика, очистка

---

## Примеры запросов

### 1. Регистрация

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "name": "John Doe",
    "password": "Secret123"
  }'
```

**Ответ (201):**
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

---

### 2. Вход в систему

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "admin123"
  }'
```

---

### 3. Обновление токена

```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

---

### 4. Создание заказа (MANAGER/ADMIN)

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Разработка модуля аутентификации",
    "description": "Реализовать JWT с refresh токенами",
    "priority": "HIGH",
    "deadline": "2026-03-31T23:59:59.000Z",
    "assignedToId": "550e8400-e29b-41d4-a716-446655440003"
  }'
```

---

### 5. Список заказов с фильтрами

```bash
# Активные высокоприоритетные заказы, страница 2
curl "http://localhost:3000/api/orders?status=IN_PROGRESS&priority=HIGH&page=2&limit=5&sortBy=deadline&sortOrder=asc" \
  -H "Authorization: Bearer <accessToken>"

# Просроченные назначенные заказы
curl "http://localhost:3000/api/orders?overdue=true&page=1&limit=10" \
  -H "Authorization: Bearer <accessToken>"

# Поиск по названию
curl "http://localhost:3000/api/orders?search=аутентификация" \
  -H "Authorization: Bearer <accessToken>"
```

---

### 6. Изменение статуса заказа (FSM)

```bash
# Перевести заказ в работу (только назначенный исполнитель)
curl -X PATCH http://localhost:3000/api/orders/660e8400-e29b-41d4-a716-446655440001/status \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{ "status": "IN_PROGRESS" }'

# Завершить заказ
curl -X PATCH http://localhost:3000/api/orders/660e8400-e29b-41d4-a716-446655440001/status \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{ "status": "DONE" }'
```

---

### 7. Отмена заказа с причиной

```bash
curl -X POST http://localhost:3000/api/orders/660e8400-e29b-41d4-a716-446655440001/cancel \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Заказчик изменил требования, задача больше не актуальна"
  }'
```

---

### 8. Назначение исполнителя

```bash
# Назначить
curl -X PATCH http://localhost:3000/api/orders/660e8400-e29b-41d4-a716-446655440001/assign \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{ "assignedToId": "550e8400-e29b-41d4-a716-446655440003" }'

# Снять назначение
curl -X PATCH http://localhost:3000/api/orders/660e8400-e29b-41d4-a716-446655440001/assign \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{ "assignedToId": null }'
```

---

### 9. Смена роли пользователя (ADMIN)

```bash
curl -X PATCH http://localhost:3000/api/users/550e8400-e29b-41d4-a716-446655440003/role \
  -H "Authorization: Bearer <adminAccessToken>" \
  -H "Content-Type: application/json" \
  -d '{ "role": "MANAGER" }'
```

---

### 10. Блокировка пользователя (ADMIN)

```bash
curl -X PATCH http://localhost:3000/api/users/550e8400-e29b-41d4-a716-446655440003/active \
  -H "Authorization: Bearer <adminAccessToken>" \
  -H "Content-Type: application/json" \
  -d '{ "isActive": false }'
```

---

### 11. Аудит-логи заказа

```bash
curl http://localhost:3000/api/audit/logs/order/660e8400-e29b-41d4-a716-446655440001 \
  -H "Authorization: Bearer <accessToken>"
```

**Ответ:**
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

---

### 12. Все аудит-логи с фильтрацией (ADMIN)

```bash
# Логи изменений статуса за конкретный период
curl "http://localhost:3000/api/audit/logs?action=STATUS_CHANGED&dateFrom=2026-02-01&dateTo=2026-02-14&page=1&limit=20" \
  -H "Authorization: Bearer <adminAccessToken>"
```

---

### 13. Health check

```bash
curl http://localhost:3000/health
```

**Ответ (200):**
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
  "details": { ... }
}
```

---

## Формат ответов

Все успешные ответы оборачиваются в единый формат через `TransformInterceptor`:

```json
{
  "data": { ... },
  "statusCode": 200,
  "timestamp": "2026-02-14T12:00:00.000Z",
  "path": "/api/orders"
}
```

Ошибки возвращают стандартный формат через `AllExceptionsFilter`:

```json
{
  "statusCode": 404,
  "timestamp": "2026-02-14T12:00:00.000Z",
  "path": "/api/orders/non-existent-id",
  "method": "GET",
  "error": "Not Found",
  "message": "Заказ не найден"
}
```

---

## Действия аудит-логов

| Действие | Описание |
|---|---|
| `ORDER_CREATED` | Создание нового заказа |
| `ORDER_UPDATED` | Обновление полей заказа |
| `ORDER_CANCELLED` | Отмена заказа (newValue содержит `cancelReason`) |
| `STATUS_CHANGED` | Изменение статуса |
| `ASSIGNED` | Назначение исполнителя |
| `UNASSIGNED` | Снятие исполнителя |

---

## Лицензия

UNLICENSED — private project.