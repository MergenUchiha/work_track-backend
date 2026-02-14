#!/bin/sh
# =============================================================
# WorkTrack Backend — docker-entrypoint.sh
# Запускается как CMD при старте контейнера.
# Порядок: ждём БД → миграции → старт приложения
# =============================================================

set -e  # Останавливаемся при любой ошибке

# ──────────────────────────────────────────────────────────────
# Цвета для логов
# ──────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info()  { printf "${GREEN}[ENTRYPOINT]${NC} %s\n" "$1"; }
log_warn()  { printf "${YELLOW}[ENTRYPOINT]${NC} %s\n" "$1"; }
log_error() { printf "${RED}[ENTRYPOINT]${NC} %s\n" "$1"; }

# ──────────────────────────────────────────────────────────────
# 1. Ожидание готовности PostgreSQL
# ──────────────────────────────────────────────────────────────
wait_for_db() {
    log_info "Waiting for PostgreSQL to be ready..."

    # Извлекаем хост и порт из DATABASE_URL
    # Формат: postgresql://user:pass@host:port/db
    DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:/]+).*|\1|')
    DB_PORT=$(echo "$DATABASE_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')

    # Дефолтный порт если не указан
    DB_PORT="${DB_PORT:-5432}"

    MAX_RETRIES=30
    RETRY_INTERVAL=2
    attempt=1

    until pg_isready -h "$DB_HOST" -p "$DB_PORT" -q; do
        if [ $attempt -ge $MAX_RETRIES ]; then
            log_error "PostgreSQL is not available after $MAX_RETRIES attempts. Exiting."
            exit 1
        fi
        log_warn "PostgreSQL not ready yet (attempt $attempt/$MAX_RETRIES). Retrying in ${RETRY_INTERVAL}s..."
        sleep $RETRY_INTERVAL
        attempt=$((attempt + 1))
    done

    log_info "PostgreSQL is ready at ${DB_HOST}:${DB_PORT}"
}

# ──────────────────────────────────────────────────────────────
# 2. Применение миграций (prisma migrate deploy)
# ──────────────────────────────────────────────────────────────
run_migrations() {
    log_info "Running database migrations..."

    # --schema указывает на папку (prismaSchemaFolder preview feature)
    if node_modules/.bin/prisma migrate deploy --schema prisma/schemas; then
        log_info "Migrations applied successfully."
    else
        log_error "Migration failed. Exiting."
        exit 1
    fi
}

# ──────────────────────────────────────────────────────────────
# 3. Запуск приложения
# ──────────────────────────────────────────────────────────────
start_app() {
    log_info "Starting WorkTrack Backend (NODE_ENV=${NODE_ENV:-production})..."
    # exec заменяет shell-процесс Node.js → правильный PID для сигналов
    exec node dist/main.js
}

# ──────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────
main() {
    log_info "========================================"
    log_info "  WorkTrack Backend — Container Start  "
    log_info "========================================"

    wait_for_db
    run_migrations
    start_app
}

main