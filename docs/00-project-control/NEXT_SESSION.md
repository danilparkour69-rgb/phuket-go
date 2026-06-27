# Next Session

Дата обновления: 2026-06-27

## Текущее состояние

Проект: Phuket Go.

Код проекта еще не пишем. Сейчас идет подготовка документации, структуры MVP и базы данных экскурсий.

## Главные решения

- MVP только по Пхукету.
- Аудитория MVP: русскоязычные туристы.
- MVP-категория: экскурсии.
- Все экскурсии из источника Marusya Travel берем в первичную базу MVP.
- Каждая экскурсия будет отдельной SEO-страницей.
- Оплаты на сайте нет.
- Монетизация: обратная комиссия от партнера после оказания услуги.
- Комиссия по экскурсиям: 100 THB за человека.
- Публичная цена для русскоязычного MVP показывается в рублях.
- Под ценой нужен мелкий текст: "Цена рассчитана по текущему курсу. Из-за изменения курса рубля итоговая сумма может отличаться."
- Внутри базы и для партнера цена хранится в THB.
- Временное хранение заявок: Google Sheets.
- Целевая база: Postgres.
- Первый запуск: локально на компьютере.
- Публикация позже: Yandex Cloud.
- Фото MVP: Cloudinary.
- Авторизация MVP: Telegram, Google, email. Телефон через SMS не используем.
- Партнерский кабинет в MVP не нужен.
- Партнер работает через Telegram-бот.
- Будущий партнерский доступ нужно заложить в архитектуру: партнер сможет дополнять свои экскурсии в своем разделе, но только через модерацию админа.
- Админка нужна в MVP.
- Если решения GitHub-шаблона `vibe` конфликтуют с ранними решениями Phuket Go, за основу берем `vibe`, а продуктовые решения адаптируем под него.

## Где смотреть документы

- Главный план: `docs/00-project-control/master-plan.md`
- Решения: `docs/00-project-control/decision-log.md`
- Product Vision: `docs/01-product-vision/product-vision.md`
- Каталог: `docs/03-service-catalog/`
- Источник экскурсий: `docs/03-service-catalog/initial-excursions-source-marusya.md`
- Ссылки на подробные экскурсии: `docs/03-service-catalog/initial-excursions-links-marusya.md`
- Структура базы экскурсий: `docs/03-service-catalog/excursions-database-structure.md`
- Заявки: `docs/05-lead-processing/`
- Монетизация: `docs/06-monetization/`
- SEO: `docs/07-seo-and-content/`
- Геймификация: `docs/08-gamification/`
- Архитектура: `docs/09-platforms-and-architecture/`
- MVP Roadmap: `docs/10-mvp-roadmap/`
- Открытые вопросы: `docs/11-open-questions/answers.md`
- Skill для текстов: `docs/12-skills/pishi-sokrashchai/SKILL.md`

## Последнее действие

Создана структура данных MVP:

- `docs/09-platforms-and-architecture/data-structure-mvp.md`

Перед этим созданы пользовательские сценарии MVP:

- `docs/10-mvp-roadmap/user-scenarios-mvp.md`

Перед этим создано техническое задание MVP:

- `docs/10-mvp-roadmap/technical-requirements-mvp.md`

Перед этим подключен GitHub-репозиторий:

- `https://github.com/danilparkour69-rgb/phuket-go`

Шаблон `vibe` объединен с документацией Phuket Go.

Перед этим создана структура MVP-сайта:

- `docs/10-mvp-roadmap/site-structure.md`

Перед этим:

Созданы рабочие карточки по всем экскурсиям из источника Marusya Travel.

- Всего экскурсий в источнике: 54.
- Создано документов: 54.
- Ошибок загрузки: 0.
- Нормализовано карточек: 54 из 54.

Главный индекс:

- `docs/03-service-catalog/excursions/README.md`

Прогресс ручной проверки:

- `docs/03-service-catalog/excursions/manual-review-progress.md`

Лог пакетной обработки:

- `docs/03-service-catalog/excursions/batch-generation-log.md`

Лог пакетной нормализации:

- `docs/03-service-catalog/excursions/manual-review-batch-log.md`

Вопросы партнеру:

- `docs/03-service-catalog/partner-questions.md`

Ответы партнера частично получены и сохранены в этом файле.

В карточке сохранено:

- факты из Telegra.ph;
- цена и варианты;
- маршрут;
- что включено;
- что оплачивается отдельно;
- что взять с собой;
- SEO-черновик;
- поля для базы;
- список уточнений у партнера.

Перед этим создан шаблон SEO-страницы экскурсии:

- `docs/07-seo-and-content/excursion-seo-page-template.md`

Перед этим пользователь дал Telegram-пост:

https://t.me/marusyatravel/2206

Из него извлечены:

- список экскурсий;
- цены "от";
- Telegra.ph-ссылки на подробные описания, фото и цены.

Созданы:

- `initial-excursions-source-marusya.md`
- `initial-excursions-links-marusya.md`
- `excursions-database-structure.md`
- `docs/12-skills/pishi-sokrashchai/SKILL.md`

## С чего продолжить

Следующий логичный шаг:

1. Открыть структуру данных: `docs/09-platforms-and-architecture/data-structure-mvp.md`.
2. Открыть пользовательские сценарии: `docs/10-mvp-roadmap/user-scenarios-mvp.md`.
3. Следующий шаг - подготовить API-карту MVP.
4. Потом писать публичные SEO-тексты по оригинальному skill `pishi-sokrashchai`.
5. Код проекта пока не писать.

## Что важно помнить

- Тексты из источников не копируем.
- Используем источники как фактуру.
- Главный принцип подачи: продаем эмоции, а не экскурсии.
- Экскурсии с катанием на слонах не продаем. Для программ со слонами оставляем только кормление, купание/уход или наблюдение без катания.
- Цена для пользователя показывается в рублях, THB остается внутренней валютой партнера.
- Skill `pishi-sokrashchai` сохранен. Использовать именно оригинальный файл `docs/12-skills/pishi-sokrashchai/SKILL.md`, а не краткое описание. Он нужен для переписывания текстов:
  - интересно;
  - вовлекающе;
  - продает идею поездки;
  - без давления;
  - с сокращением лишнего.
- Позже пользователь может дать книгу, чтобы расширить или уточнить этот skill.

## Если контекст переполнится

Начать новую сессию с фразы:

`Продолжаем Phuket Go. Открой docs/00-project-control/NEXT_SESSION.md и продолжи с API-карты MVP. Код не писать.`
