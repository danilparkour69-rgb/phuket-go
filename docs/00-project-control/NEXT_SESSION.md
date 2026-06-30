# Next Session

Дата обновления: 2026-06-30

## Текущее состояние

Проект: Phuket Go.

Локальная разработка уже начата. Сейчас продолжаем MVP по актуальным документам, структуре `vibe` и подготовленной базе экскурсий.

## Главные решения

- MVP только по Пхукету.
- Аудитория MVP: русскоязычные туристы.
- MVP-категория: экскурсии.
- Все экскурсии из источника Marusya Travel берем в первичную базу MVP.
- Каждая экскурсия будет отдельной SEO-страницей.
- Оплаты на сайте нет.
- Монетизация: обратная комиссия от партнера после оказания услуги.
- Phuket Go не продает экскурсии напрямую и не принимает оплату за них на сайте. Мы приводим заявки на партнерские экскурсии через свои каналы.
- Комиссия по экскурсиям: 100 THB за человека.
- Публичная цена в MVP показывается в батах крупно.
- Для русской версии под ценой нужен мелкий ориентир в рублях: "примерно {price_rub} ₽ по текущему курсу".
- Для будущей английской версии рядом нужен мелкий ориентир в долларах.
- Внутри базы, для партнера и оплаты основная цена хранится в THB.
- Временное хранение заявок: Google Sheets.
- Целевая база: Postgres.
- Первый запуск: локально на компьютере.
- Публикация позже: Yandex Cloud.
- Фото на этапе подготовки: локально в проектной папке. Постоянное хранилище выберем позже.
- Фото позже можно перенести в Cloudinary.
- Нейросетевые изображения можно использовать для улучшения или генерации визуалов, но их нужно отличать от реальных фото: `real`, `ai_enhanced`, `ai_generated`.
- Авторизация MVP: Telegram, Google, email. Телефон через SMS не используем.
- Партнерский кабинет в MVP не нужен.
- Партнер работает через Telegram-бот.
- Маршрутизация заявок: все обычные экскурсии идут основному исполнителю, дайвинг идет отдельному исполнителю; владелец проекта получает копию всех заявок.
- Будущий партнерский доступ нужно заложить в архитектуру: партнер сможет дополнять свои экскурсии в своем разделе, но только через модерацию админа.
- В будущем партнерском кабинете партнер не может удалить карточку экскурсии, только скрыть или отправить запрос админу.
- Админка нужна в MVP.
- Если решения GitHub-шаблона `vibe` конфликтуют с ранними решениями Phuket Go, за основу берем `vibe`, а продуктовые решения адаптируем под него.
- Инструкция Codex от владельца проекта сохранена в `docs/00-project-control/project-instructions-for-codex.md`.
- Сразу проектируем с заделом на масштабирование: Phuket Go -> Bangkok Go -> Pattaya Go -> Thailand Go -> Vietnam Go -> Asia Go -> World Go.
- Для будущих категорий создан общий шаблон карточек: байки, авто, трансферы, права, документы, визы, недвижимость.

## Где смотреть документы

- Главный план: `docs/00-project-control/master-plan.md`
- Решения: `docs/00-project-control/decision-log.md`
- Инструкция Codex от владельца проекта: `docs/00-project-control/project-instructions-for-codex.md`
- Product Vision: `docs/01-product-vision/product-vision.md`
- Каталог: `docs/03-service-catalog/`
- Карточки будущих услуг: `docs/03-service-catalog/future-service-card-spec.md`
- Микротексты интерфейса: `docs/10-mvp-roadmap/interface-microcopy-mvp.md`
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

2026-06-29: начата локальная разработка публичного каталога в `website` по шаблону `vibe`.

Собран рабочий слой каталога:

- backend/API отдает 54 экскурсии;
- карточки каталога выводятся из API;
- фото берутся из `final/carousel`;
- карточки используют настоящую карусель с точками, стрелками, hover zoom и мобильным поведением;
- длительность экскурсий подтянута из подготовленной базы;
- под каталогом добавлены рабочие блоки направлений, популярных экскурсий и подборок.

Важно: этап визуального соответствия референсам оставлен незавершенным. Не добивать сейчас пиксельную верстку каталога, фильтры, даты, сортировку, финальные hover/focus-состояния и реальные TripAdvisor-рейтинги. Это отдельный будущий этап верстки/дизайн-системы.

Закрыты пункты 39-51 подготовки базы экскурсий перед разработкой:

- `39. Финальная чистка базы экскурсий`
- `40. Проверка цен и валют`
- `41. Проверка условий экскурсий`
- `42. Проверка слонов и этики`
- `43. Проверка дайвинга`
- `44. Проверка названий карточек`
- `45. Проверка эмоционального текста`
- `46. Индекс готовности экскурсий`
- `47. Проверка текущих фото`
- `48. Проверка повторов фото`
- `49. Список недостающих и заменяемых фото`
- `50. Фото-сценарии экскурсий`
- `51. Финальная структура папок фото`

Созданы итоговые документы:

- `docs/03-service-catalog/excursions/final-cleanup-step-39-result.md`
- `docs/03-service-catalog/excursions/price-and-currency-step-40-result.md`
- `docs/03-service-catalog/excursions/conditions-step-41-result.md`
- `docs/03-service-catalog/excursions/elephants-ethics-step-42-result.md`
- `docs/03-service-catalog/excursions/diving-routing-step-43-result.md`
- `docs/03-service-catalog/excursions/title-check-step-44-result.md`
- `docs/03-service-catalog/excursions/emotional-copy-step-45-result.md`
- `docs/03-service-catalog/excursions/readiness-index-step-46-result.md`
- `docs/03-service-catalog/media/excursions/current-media-step-47-result.md`
- `docs/03-service-catalog/media/excursions/duplicate-and-weak-media-step-48-result.md`
- `docs/03-service-catalog/media/excursions/missing-and-replacement-media-step-49-result.md`
- `docs/03-service-catalog/media/excursions/photo-scenarios-step-50-result.md`
- `docs/03-service-catalog/media/excursions/final-media-folder-structure-step-51-result.md`

Текущий индекс готовности:

- всего карточек: 54;
- `copy_draft_ready`: 47;
- `temporary_media_ready`: 5;
- `needs_price_check`: 0;
- `needs_partner`: 0;
- `needs_upscale_or_replace`: 2;
- `ready_for_site`: 0.

Текущий инвентарь фото:

- старый минимальный слой фото удален из актуального процесса;
- рабочий слой: папки направлений, `final/carousel` и `media-manifest.json`;
- направлений: 54;
- `media-manifest.json`: 54;
- фото в `final/carousel`: 569;
- фото с пометкой `needs_replacement_later`: 58;
- AI-сгенерированные фото: 0;
- ручную чистку неподходящих фото пока не делаем;
- если хороших горизонтальных фото нет, временно берем доступные фото и отмечаем их для будущей замены;
- перед публикацией проверяем лица людей, слабые фото, повторы, соответствие карточке и фото из отзывов;
- фотосценарии приоритетных карточек: составлены;
- финальная структура фото: `original`, `final/carousel`, `final/content`, `media-manifest.json`;
- будущая модель: одно физическое фото хранится один раз и используется через общий `asset_id`;
- рафтинг: блокер исполнителя снят, публикуем только формат без катания на слонах;
- слабые фото `012` и `023`: проверены, результат сохранен в `docs/03-service-catalog/media/excursions/weak-media-012-023-step-result.md`;
- фото для направления должны лежать внутри папки самого направления; для `012` и `023` создана папка `carousel-candidates`, туда перенесены все горизонтальные фото хорошего качества под карусель.
- для всех направлений создана структура `original/photo-base` и `carousel-candidates` по правилу: в `original/photo-base` кладем все доступные фото направления, в `carousel-candidates` - все горизонтальные фото хорошего качества;
- если горизонтальных фото хорошего качества нет, карусель не оставляем пустой: временно берем доступные фото и помечаем для будущей замены;
- отчет сборки: `docs/03-service-catalog/media/excursions/carousel-candidates-build-report.md`;
- отчет fallback: `docs/03-service-catalog/media/excursions/carousel-fallback-fill-report.md`;
- страница общего просмотра: `docs/03-service-catalog/media/excursions/carousel-candidates-review.html`;
- сейчас не отмечаем неподходящие фото: пользователь сделает ручную чистку позже.
- временные финальные карусели собраны по всем 54 направлениям: `final/carousel` создан внутри каждой папки направления;
- `media-manifest.json` создан для всех 54 направлений;
- в `final/carousel` сейчас 569 фото;
- 58 фото помечены как `needs_replacement_later`, потому что они взяты как fallback и требуют будущей замены;
- отчет временной финальной сборки: `docs/03-service-catalog/media/excursions/temporary-final-carousel-build-report.md`;
- правило, как будущий сайт берет фото из `media-manifest.json`, сохранено в `docs/03-service-catalog/media/excursions/media-manifest-site-loading-rules.md`;
- список направлений с временными фото на замену сохранен в `docs/03-service-catalog/media/excursions/directions-with-replacement-media.md`;
- решение по фото: больше не зависаем на подборе идеальных изображений; берем доступные фото из папки конкретного направления, если они соответствуют карточке экскурсии; красоту, замену слабых фото и ручную чистку переносим на этап перед публикацией;
- карта передачи фото в будущую разработку сохранена в `docs/03-service-catalog/media/excursions/media-developer-handoff-map.md`;
- карта передачи MVP в будущую разработку сохранена в `docs/10-mvp-roadmap/development-handoff-map.md`;
- `docs/10-mvp-roadmap/codex-development-brief.md` обновлен свежими правилами по фото;
- открытые вопросы разделены по влиянию в `docs/11-open-questions/open-questions-triage.md`;
- для локальной разработки MVP критичных блокеров сейчас нет;
- дорожная карта релиза обновлена: фото не блокируют локальную разработку, финальная чистка фото переносится на этап перед публикацией;
- короткий список перед стартом кодинга сохранен в `docs/10-mvp-roadmap/immediate-pre-coding-actions.md`;
- `docs/10-mvp-roadmap/final-pre-coding-checklist.md` обновлен: фото и контент больше не указаны как блокер локальной разработки;
- промпт для будущего старта разработки сохранен в `docs/10-mvp-roadmap/start-development-prompt.md`;
- финальная сверка pre-coding документов сохранена в `docs/10-mvp-roadmap/pre-coding-docs-consistency-review.md`;
- сжатый контекст для переноса в новое окно сохранен в `docs/00-project-control/context-compression.md`;
- инструкция Codex от владельца проекта сохранена в `docs/00-project-control/project-instructions-for-codex.md`;
- ASO для будущего мобильного приложения зафиксировано как задача не-MVP этапа;
- устаревший промпт продолжения про ручной выбор фото `012/023` заменен;
- правило карусели обновлено: используем все подходящие фото направления;
- устаревшие медиа-отчеты и старые служебные файлы фото удалены из актуального процесса;
- в индексе готовности пункт 47 обновлен: текущий рабочий слой фото - `final/carousel`, 569 фото и 54 `media-manifest.json`;

Следующий пункт: продолжать локальную разработку MVP по `docs/10-mvp-roadmap/development-handoff-map.md`, сохраненной инструкции владельца проекта и текущему состоянию `website`/`backend`.

---

## История прошлых действий

Создан FAQ для MVP:

- `docs/07-seo-and-content/faq-mvp.md`

Созданы условия бронирования:

- `docs/07-seo-and-content/booking-terms-mvp.md`

Создана страница контактов:

- `docs/07-seo-and-content/contacts-mvp.md`

Начата финальная чистка базы экскурсий:

- `docs/03-service-catalog/excursions/final-cleanup-audit.md`
- `docs/03-service-catalog/excursions/publication-readiness-index.md`

Перед этим добавлены отдельные SEO-статьи:

- `docs/07-seo-and-content/article-deportation-phuket.md`
- `docs/07-seo-and-content/article-what-not-to-do-thailand.md`
- `docs/07-seo-and-content/article-what-not-to-do-phuket-airport.md`
- `docs/07-seo-and-content/article-hotel-tour-guides-scams.md`
- `docs/07-seo-and-content/article-tourist-scams-thailand.md`

Создана первая партия SEO-статей:

- `docs/07-seo-and-content/articles-copy-mvp.md`

Перед этим создан шаблон и первые тексты страниц экскурсий:

- `docs/07-seo-and-content/excursion-pages-copy-mvp.md`

Перед этим создан первый текст каталога:

- `docs/07-seo-and-content/catalog-copy-mvp.md`

Перед этим создан первый текст главной страницы:

- `docs/07-seo-and-content/homepage-copy-mvp.md`

Перед этим создана контентная стратегия MVP:

- `docs/07-seo-and-content/content-strategy-mvp.md`

Перед этим создан финальный список требований перед кодингом:

- `docs/10-mvp-roadmap/final-pre-coding-checklist.md`

Перед этим создана карта личного кабинета:

- `docs/04-users-and-roles/account-screens-map.md`

Перед этим создана карта Telegram-ботов:

- `docs/09-platforms-and-architecture/telegram-bots-map.md`

Перед этим создана карта экранов админки:

- `docs/09-platforms-and-architecture/admin-screens-map.md`

Перед этим создана финальная карта Google Sheets:

- `docs/05-lead-processing/google-sheets-final-map.md`

Перед этим создана API-карта MVP:

- `docs/09-platforms-and-architecture/api-map-mvp.md`

Перед этим создана структура данных MVP:

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

1. Открыть главный план: `docs/00-project-control/master-plan.md`.
2. Открыть карту передачи в разработку: `docs/10-mvp-roadmap/development-handoff-map.md`.
3. Открыть список перед стартом кодинга: `docs/10-mvp-roadmap/immediate-pre-coding-actions.md`.
4. Фото больше не блокируют работу: берем доступные фото из папки направления, финальную чистку делаем перед публикацией.
5. Финальная сверка pre-coding документов выполнена: `docs/10-mvp-roadmap/pre-coding-docs-consistency-review.md`.
6. Сжатый контекст для нового окна: `docs/00-project-control/context-compression.md`.
7. Инструкция Codex от владельца проекта сохранена: `docs/00-project-control/project-instructions-for-codex.md`.
8. Если пользователь просит разработку, сначала прочитать сохраненную инструкцию и применить ее с учетом приоритета `AGENTS.md`, шаблона `vibe` и актуальных документов `docs/`.
9. Код проекта вести с учетом сохраненной инструкции.

## Что важно помнить

- Тексты из источников не копируем.
- Используем источники как фактуру.
- Главный принцип подачи: продаем эмоции, а не экскурсии.
- Экскурсии с катанием на слонах не продаем. Для программ со слонами оставляем только кормление, купание/уход или наблюдение без катания.
- Цена для пользователя показывается в батах крупно; рубли для русской версии показываются мелко как ориентир.
- Skill `pishi-sokrashchai` сохранен. Использовать именно оригинальный файл `docs/12-skills/pishi-sokrashchai/SKILL.md`, а не краткое описание. Он нужен для переписывания текстов:
  - интересно;
  - вовлекающе;
  - продает идею поездки;
  - без давления;
  - с сокращением лишнего.
- Позже пользователь может дать книгу, чтобы расширить или уточнить этот skill.

## Если контекст переполнится

Начать новую сессию с фразы:

`Продолжаем Phuket Go. Локальная разработка уже начата. Сначала открой docs/00-project-control/context-compression.md, затем docs/00-project-control/project-instructions-for-codex.md, docs/00-project-control/NEXT_SESSION.md, docs/00-project-control/master-plan.md, docs/10-mvp-roadmap/development-handoff-map.md, docs/10-mvp-roadmap/immediate-pre-coding-actions.md и docs/10-mvp-roadmap/pre-coding-docs-consistency-review.md. Финальная сверка pre-coding документов выполнена. Фото не блокируют локальную разработку. ASO зафиксировано как будущая задача мобильного приложения. При разработке используй сохраненную инструкцию Codex с учетом приоритета AGENTS.md, шаблона vibe и актуальных документов docs/.`
