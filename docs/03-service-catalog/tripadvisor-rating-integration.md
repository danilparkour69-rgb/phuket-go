# Tripadvisor Rating Integration

Статус: [x] Базовая интеграция реализована в backend

Дата: 2026-06-29

## Что уже работает

- Добавлены поля в БД для хранения `TripAdvisor`-данных по каждой экскурсии:
  - `tripadvisorLocationId`
  - `tripadvisorLocationName`
  - `tripadvisorRating`
  - `tripadvisorReviewCount`
  - `tripadvisorRanking`
  - `tripadvisorWebUrl`
  - `tripadvisorRatingImageUrl`
  - `tripadvisorLastSyncedAt`
  - `tripadvisorMatchStatus`
  - `tripadvisorSyncStatus`
  - `tripadvisorSyncMessage`
  - `tripadvisorDisplayAllowed`
- Добавлены таблицы для хранения интеграционных данных:
  - `integration_credentials` (с ключом `tripadvisor`)
  - `integration_api_usage` (для ежедневного учета лимитов)
- Реализован backend синк: `TripAdvisorClient -> syncTripadvisorRatings`
- Рейтинг из БД уже показывается в API каталога:
  - карточки и карточка экскурсии получают `externalRating`
  - веб-сайт читает это поле и показывает блок Tripadvisor
- Добавлена команда для сохранения ключа в БД и задача cron для синка:
  - `tripadvisor:save-key`
  - `tripadvisor:sync`

## Как работать с API ключом

**Важно по безопасности:** ключ хранится только в `.env` при вводе и в `integration_credentials` в БД. Не кладём его в frontend/JS.

1. После оплаты и выдачи ключа, добавьте в окружение (локально):

```bash
cd backend
TRIPADVISOR_API_KEY=ваш_ключ bun run tripadvisor:save-key
```

2. Убедитесь, что ключ сохранился (например, в базе проверкой через Prisma/RR):

```bash
cd backend
bun run prisma:generate
bun -e "import { createPrisma } from './src/db.ts'; const p=createPrisma(process.env.DATABASE_URL!); console.log(await p.integrationCredential.findMany()); await p.$disconnect();"
```

3. Запускайте разовый синк вручную (без автоперезапроса):

```bash
cd backend
TRIPADVISOR_ALLOW_REFRESH="false" bun run tripadvisor:sync
```

4. Для планового режима: добавьте задачу в ваш cron/воркер на `bun src/cron.ts -- tripadvisor:sync-ratings`.
   - Для периодических обновлений только по вашему указанию временно включайте:

```bash
TRIPADVISOR_ALLOW_REFRESH="true" bun run tripadvisor:sync
```

   - При этом синк будет выбирать записи с устаревшим `tripadvisorLastSyncedAt`.

## Ограничение расходов

Интеграция уже лимитирует расход API:
- `TRIPADVISOR_MAX_REQUESTS_PER_RUN` (по умолчанию `10`) — сколько запросов в одном запуске.
- `TRIPADVISOR_DAILY_MAX_REQUESTS` (по умолчанию `200`) — суточный лимит (в БД через `integration_api_usage`).
- `TRIPADVISOR_ALLOW_REFRESH` (по умолчанию `false`) — если `true`, позволяет повторно обновлять уже синкнутые записи по устареванию; если `false`, синк обновляет только пока неуспешные/неполные записи.
- `TRIPADVISOR_SYNC_STALE_HOURS` (по умолчанию `24`) — окно устаревания для обновлений при `TRIPADVISOR_ALLOW_REFRESH=true`.

Смысл: пока ключ не подтверждён и не стабилизировались бесплатные/фиксированные лимиты, можно держать эти лимиты минимальными и запускать задачу вручную.

## Правила показа на сайте

Рейтинг выводится только если:
- `tripadvisorDisplayAllowed = true`
- `tripadvisorMatchStatus = approved`
- `tripadvisorSyncStatus = success`
- есть `tripadvisorRating` и `tripadvisorWebUrl`

## Миграция БД

Добавлена миграция: `backend/prisma/migrations/20260629130000_add_tripadvisor_rating_integration/migration.sql`.

Если нужно применить в чистой базе:

```bash
cd backend
bun run prisma:migrate
```

Если вы применяете вручную в проде через миграции, используйте нормальный пайплайн Prisma migrate.
