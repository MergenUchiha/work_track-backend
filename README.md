ПОЛНЫЙ СПИСОК ЗАДАЧ (ничего не упущено)
🧱 Этап 0 - Инициализация

 создать NestJS проект

 установить Prisma

 настроить PostgreSQL

 .env + .env.example

 ESLint + Prettier

 Husky (опционально, плюс)

🗄 Этап 1 - База данных

 prisma/schema.prisma

 enums (roles, status, priority)

 миграция

 seed:

admin

manager

worker

🔐 Этап 2 - Auth

 регистрация

 логин

 refresh

 logout

 hash паролей (bcrypt)

 hash refresh tokens

 guards

 decorators (@Roles())

👤 Этап 3 - Users

 получить профиль

 список пользователей (admin)

 блокировка пользователя

 смена роли (admin)

 soft-logic isActive

📦 Этап 4 - Orders

 создание задачи

 обновление

 назначение исполнителя

 смена статуса (FSM)

 cancel с причиной

 фильтрация

 пагинация

 проверка прав доступа

🧾 Этап 5 - Audit

 middleware / service для логов

 запись old/new values

 привязка к пользователю

 endpoint просмотра логов (admin)

🛡 Этап 6 - Безопасность и стабильность

 global validation pipe

 rate limit

 exception filter

 logging

 helmet

 CORS

📄 Этап 7 - Документация

 Swagger

 README

 примеры запросов

 описание архитектуры

🐳 Этап 8 - Продакшен

 Dockerfile

 docker-compose

 healthcheck

 prisma migrate deploy