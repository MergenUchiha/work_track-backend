# =============================================================
# WorkTrack Backend — Dockerfile (multi-stage production build)
# =============================================================

# ──────────────────────────────────────────────────────────────
# Stage 1: deps
# Устанавливаем ВСЕ зависимости (включая devDeps для сборки)
# ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

# Инструменты для нативных npm-пакетов (bcrypt)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Копируем только package-файлы — Docker layer cache
COPY package*.json ./

RUN npm ci

# ──────────────────────────────────────────────────────────────
# Stage 2: builder
# Генерируем Prisma Client и собираем TypeScript
# ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Копируем зависимости из предыдущего слоя
COPY --from=deps /app/node_modules ./node_modules

# Копируем весь исходный код
COPY . .

# Генерируем Prisma Client (используем папку со схемами)
RUN npx prisma generate --schema prisma/schemas

# Компилируем TypeScript → dist/
RUN npm run build

# ──────────────────────────────────────────────────────────────
# Stage 3: production
# Минимальный образ только с production-артефактами
# ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS production

# Устанавливаем только runtime-зависимости нативных пакетов
RUN apk add --no-cache \
    libstdc++ \
    # postgresql-client нужен для pg_isready в entrypoint
    postgresql-client \
    # dumb-init — правильный PID 1, корректный SIGTERM
    dumb-init

WORKDIR /app

# Создаём непривилегированного пользователя (best practice)
RUN addgroup -g 1001 -S nodejs && \
    adduser  -u 1001 -S nestjs -G nodejs

# Копируем package.json для мета-информации
COPY --from=builder /app/package*.json ./

# Устанавливаем ТОЛЬКО production-зависимости
# prisma CLI нужен здесь, потому что он в devDependencies —
# он копируется ниже из builder/node_modules напрямую
RUN npm ci --omit=dev --ignore-scripts

# Копируем Prisma Client (сгенерирован в builder)
COPY --from=builder /app/node_modules/.prisma         ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client  ./node_modules/@prisma/client

# Копируем Prisma CLI (нужен для migrate deploy в entrypoint)
COPY --from=builder /app/node_modules/.bin/prisma     ./node_modules/.bin/prisma
COPY --from=builder /app/node_modules/prisma          ./node_modules/prisma

# Копируем скомпилированное приложение
COPY --from=builder /app/dist ./dist

# Копируем схемы Prisma (нужны для migrate deploy)
COPY --from=builder /app/prisma ./prisma

# Копируем entrypoint-скрипт
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Создаём директорию для логов с нужными правами
RUN mkdir -p logs && chown -R nestjs:nodejs /app

# Переключаемся на непривилегированного пользователя
USER nestjs

# Порт приложения
EXPOSE 3000

# ──────────────────────────────────────────────────────────────
# Healthcheck
# Проверяем liveness endpoint — он не требует DB и отвечает быстро
# --interval: каждые 30s
# --timeout:  ответ должен прийти за 5s
# --retries:  3 неудачи подряд = unhealthy
# --start-period: 15s grace period на старт приложения
# ──────────────────────────────────────────────────────────────
HEALTHCHECK \
    --interval=30s \
    --timeout=5s \
    --retries=3 \
    --start-period=15s \
    CMD wget -qO- http://localhost:3000/health/live || exit 1

# dumb-init как PID 1 → корректная обработка сигналов
ENTRYPOINT ["dumb-init", "--"]
CMD ["./docker-entrypoint.sh"]