# Final Media Folder Structure - Step 51

Статус: [x] финальная структура папок фото описана

Дата: 2026-06-28

## Цель

Описать, как хранить финальные фото экскурсий, чтобы будущий сайт мог автоматически подгружать:

- карусель 4-5 презентационных фото;
- фото по блокам текста;
- источники;
- права;
- тип фото: `real`, `ai_enhanced`, `ai_generated`.

Код проекта пока не пишем. Это архитектурное правило для будущей разработки.

## Текущая структура

Сейчас используется рабочая структура MVP-подготовки:

```text
docs/03-service-catalog/media/excursions/{id}-{slug}/
  cover.jpg
  gallery-01.jpg
  gallery-02.jpg
  gallery-03.jpg
  source.txt
```

Эта структура подходит для подготовки и просмотра, но недостаточна для финального сайта, потому что не разделяет:

- карусель;
- фото по тексту;
- права;
- источник;
- роль фото;
- статус проверки.

## Финальная структура папки экскурсии

Для финального набора фото используем такую структуру:

```text
docs/03-service-catalog/media/excursions/{id}-{slug}/
  original/
    source-001.jpg
    source-002.jpg
  final/
    carousel/
      01-cover-emotion.jpg
      02-route-place.jpg
      03-transport-or-format.jpg
      04-activity.jpg
      05-detail-or-trust.jpg
    content/
      route-main-place.jpg
      format-transport.jpg
      impression-emotion.jpg
      included-food-or-equipment.jpg
      safety-equipment.jpg
    social/
      story-cover.jpg
      square-cover.jpg
  photo-brief.md
  media-manifest.json
  source.txt
```

## Что значит каждая папка

| Папка | Что хранит | Зачем |
| --- | --- | --- |
| `original/` | Исходники от партнера, фотографа, стока или AI | Чтобы не потерять первоисточник |
| `final/carousel/` | 4-5 финальных фото верхней карусели | Первый экран страницы экскурсии |
| `final/content/` | Фото по смысловым блокам текста | Маршрут, транспорт, активность, включения, безопасность |
| `final/social/` | Будущие обложки для соцсетей и рекламы | Не обязательно для MVP |
| `photo-brief.md` | Фотосценарий конкретной экскурсии | Что нужно показать и почему |
| `media-manifest.json` | Машиночитаемый список фото | Чтобы сайт подгружал фото автоматически |
| `source.txt` | Человеческое описание источников и прав | Быстро проверить происхождение фото |

## Имена файлов

Имена должны описывать роль фото, а не просто номер.

Правильно:

- `01-cover-emotion.jpg`
- `02-route-place.jpg`
- `03-transport-or-format.jpg`
- `04-activity.jpg`
- `05-detail-or-trust.jpg`
- `route-main-place.jpg`
- `format-transport.jpg`
- `included-food-or-equipment.jpg`
- `safety-equipment.jpg`

Не использовать в финале:

- `image1.jpg`
- `photo.jpg`
- `telegram-file.jpg`
- `gallery-final-new-2.jpg`

## Структура `media-manifest.json`

Будущий манифест экскурсии должен хранить не только путь к файлу, но и смысл фото.

Пример:

```json
{
  "excursion_id": "018",
  "slug": "phi-phi",
  "status": "needs_visual_review",
  "storage_provider": "local",
  "base_path": "docs/03-service-catalog/media/excursions/018-phi-phi",
  "carousel": [
    {
      "file": "final/carousel/01-cover-emotion.jpg",
      "role": "cover_emotion",
      "alt": "Бирюзовая лагуна Пхи-Пхи и белый песок",
      "image_type": "real",
      "source_type": "partner_permission",
      "usage_allowed": true,
      "needs_review": false,
      "sort_order": 1
    }
  ],
  "content": [
    {
      "file": "final/content/format-transport.jpg",
      "block": "format_day",
      "role": "transport",
      "alt": "Катер для морской экскурсии к островам",
      "image_type": "real",
      "source_type": "partner_permission",
      "usage_allowed": true,
      "needs_review": false,
      "sort_order": 1
    }
  ]
}
```

## Обязательные поля для каждого фото

| Поле | Зачем |
| --- | --- |
| `file` | Где лежит фото |
| `role` | Что фото показывает |
| `block` | Где фото стоит на странице |
| `alt` | Описание для сайта и SEO |
| `image_type` | `real`, `ai_enhanced`, `ai_generated` |
| `source_type` | `partner_permission`, `own`, `stock_license`, `pexels`, `ai_generated`, другое |
| `source_url` | Ссылка на источник, если есть |
| `usage_allowed` | Можно ли использовать |
| `needs_review` | Нужно ли проверить перед публикацией |
| `sort_order` | Порядок показа |

## Статусы фото

| Статус | Значение |
| --- | --- |
| `draft` | Фото добавлено, но не проверено |
| `needs_source_check` | Нужно проверить источник и права |
| `needs_visual_review` | Нужно проверить смысл, качество и обещания |
| `needs_replace` | Нужно заменить |
| `needs_upscale` | Нужно улучшить качество |
| `ready_for_site` | Можно использовать на сайте |

## Правило переноса в Cloudinary/Yandex/S3

Сейчас `storage_provider = local`.

Позже можно заменить на:

- `cloudinary`;
- `yandex_object_storage`;
- `s3`;
- другое хранилище.

Важно: карточки экскурсий не должны хранить жесткие пути к локальным файлам. Они должны ссылаться на манифест или записи `ExcursionPhoto`.

## Связь с будущей базой

В Postgres сущность `ExcursionPhoto` должна уметь хранить:

- `excursion_id`;
- `url`;
- `storage_provider`;
- `block`;
- `role`;
- `image_type`;
- `source_type`;
- `source_url`;
- `usage_allowed`;
- `needs_review`;
- `sort_order`;
- `alt`;
- `status`.

Так мы сможем показывать:

- фото в карусели;
- фото внутри страницы;
- фото в админке;
- статус проверки;
- источник и права.

## Что делать с текущими `cover/gallery`

Текущие файлы не удаляем.

Они остаются как рабочий минимум до финального подбора.

При финальной подготовке:

1. Создаем `photo-brief.md` для конкретной экскурсии.
2. Кладем исходники в `original/`.
3. Отбираем 4-5 фото в `final/carousel/`.
4. Отбираем фото по тексту в `final/content/`.
5. Создаем `media-manifest.json`.
6. Обновляем `source.txt`.
7. Только после проверки ставим статус `ready_for_site`.

## Definition of Done

- [x] Описана структура папки экскурсии.
- [x] Описана структура карусели.
- [x] Описана структура фото по тексту.
- [x] Описан `media-manifest.json`.
- [x] Описана связь с будущей базой.
- [x] Описан порядок переноса во внешнее хранилище.

## Следующий шаг

Пункт 52: правила источников, прав и AI-обработки фото перед публикацией.

Дополнительно зафиксирован пример по Пхи-Пхи:

- `phi-phi-competitor-photo-reference.md`
