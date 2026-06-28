# All Excursions Media Inventory

Статус: [~] рабочий инвентарь фото по всем экскурсиям

Дата: 2026-06-28

## Результат пункта 47

Проверка текущих фото выполнена и сохранена отдельно:

- `current-media-step-47-result.md`

Исторический итог до удаления временных стоковых фото: у всех 54 экскурсий был локальный минимум `cover + 3 gallery`, всего 216 фото и 54 файла `source.txt`.

Актуальное состояние после удаления временных стоковых фото:

- старых локальных фото осталось: 135;
- временные Pexels-фото удалены: 81;
- направлений с полным старым локальным набором: 30;
- направлений, где нужны партнерские или новые фото: 24;
- пустых папок старого локального слоя: 17;
- публикационная рабочая база базы фото: 700 фото.

Следующий шаг - проверить повторы, слабые фото и слишком случайные визуалы.

## Цель

Зафиксировать, какие фото уже есть локально, каких фото не хватает и как в дальнейшем автоматически связывать фотографии с карточками экскурсий.

## Правило папок

Для каждой экскурсии нужна отдельная папка:

```text
docs/03-service-catalog/media/excursions/{id}-{slug}/
```

Внутри папки:

- `cover.jpg` или `cover.png` - главное фото карточки;
- `gallery-01.jpg`;
- `gallery-02.jpg`;
- `gallery-03.jpg`;
- `source.txt` - источник, права, тип фото и заметки.

## Правило автоматической подгрузки

В будущем сайт не должен вручную искать фото.

Нужно использовать связку:

- `excursion_id`;
- `slug`;
- `media_folder`;
- `cover`;
- `gallery`;
- `source_type`.

Так мы сможем сначала хранить фото локально, а позже перенести их в Cloudinary, Yandex Object Storage или другое хранилище без переделки карточек.

## Статусы

- `local_ready` - папка и фото есть локально.
- `temporary_ready` - фото есть, но источник/локацию нужно финально проверить.
- `needs_folder` - папку и фото еще нужно создать.
- `needs_replace_or_upscale` - фото есть, но качество слабое.
- `needs_partner_photo` - лучше запросить фото у партнера.
- `ai_possible` - можно временно закрыть AI/нейросетевым изображением, если нет реального фото.

## Инвентарь

| ID | Экскурсия | Папка | Фото | Статус | Что сделать |
| --- | --- | --- | --- | --- | --- |
| 001 | Слоны / Mantra Spa / Самет Нангше | `001-slon-mantra-spa-samet-nangshe` | 4/4 | `temporary_complete_needs_visual_review` | Фото есть, нужна проверка актуальности/соответствия |
| 002 | Avatar Plus | `002-avatar-plus` | 4/4 | `temporary_complete_needs_review` | Фото есть, нужна проверка актуальности/соответствия |
| 003 | Avatar World | `003-avatar-world` | 4/4 | `temporary_complete_needs_review` | Фото есть, нужна проверка актуальности/соответствия |
| 004 | Сияние планктона | `004-siyanie-planktona` | 4/4 | `temporary_complete_needs_visual_review` | Фото есть, нужна проверка актуальности/соответствия |
| 005 | Сияние планктона 2 | `005-siyanie-planktona-2` | 4/4 | `temporary_complete_needs_visual_review` | Фото есть, нужна проверка актуальности/соответствия |
| 006 | Рассветное путешествие | `006-rassvetnoe-puteshestvie` | 4/4 | `source_complete_needs_review` | Фото есть, нужна финальная проверка |
| 007 | Рача Корал: рассвет / приватный пляж / рыбалка | `007-racha-koral-rassvet-privatnyy-plyazh-rybalka` | 4/4 | `temporary_complete_needs_review` | Фото есть, нужна проверка актуальности/соответствия |
| 008 | Цирковое шоу | `008-cirkovoe-shou` | 4/4 | `temporary_complete_needs_visual_review` | Фото есть, нужна проверка актуальности/соответствия |
| 009 | Райские острова | `009-rayskie-ostrova` | 4/4 | `temporary_complete_needs_review` | Фото есть, нужна проверка актуальности/соответствия |
| 010 | Паром на Пхи-Пхи | `010-parom-na-phi-phi` | 4/4 | `source_complete_needs_review` | Фото есть, нужна финальная проверка |
| 011 | ПхангНа | `011-phangna` | 4/4 | `source_complete_needs_review` | Фото есть, нужна финальная проверка |
| 012 | Симиланы | `012-similany` | 4/4 | `source_complete_needs_review` | Фото есть, нужна финальная проверка |
| 013 | Симиланы Премиум | `013-similany-premium` | 4/4 | `source_complete_needs_review` | Фото есть, нужна финальная проверка |
| 014 | Симиланы 2 дня | `014-similany-2-dnya` | 4/4 | `temporary_complete_needs_review` | Фото есть, нужна проверка актуальности/соответствия |
| 015 | Сурин | `015-surin` | 4/4 | `source_complete_needs_review` | Фото есть, нужна финальная проверка |
| 016 | 11 островов | `016-11-ostrovov` | 4/4 | `source_complete_needs_review` | Фото есть, нужна финальная проверка |
| 017 | Ранний Пхи-Пхи | `017-ranniy-phi-phi` | 4/4 | `source_complete_needs_review` | Фото есть, нужна финальная проверка |
| 018 | Пхи-Пхи | `018-phi-phi` | 4/4 | `source_complete_needs_review` | Фото есть, нужна финальная проверка |
| 019 | Пхи-Пхи Премиум | `019-phi-phi-premium` | 4/4 | `source_complete_needs_review` | Фото есть, нужна финальная проверка |
| 020 | Пхи-Пхи 2 дня | `020-phi-phi-2-dnya` | 4/4 | `source_complete_needs_review` | Фото есть, нужна финальная проверка |
| 021 | 4 Жемчужины | `021-4-zhemchuzhiny` | 4/4 | `source_complete_needs_review` | Фото есть, нужна финальная проверка |
| 022 | 5 Жемчужин | `022-5-zhemchuzhin` | 4/4 | `temporary_complete_needs_review` | Фото есть, нужна проверка актуальности/соответствия |
| 023 | Джеймс Бонд | `023-dzheyms-bond` | 4/4 | `source_complete_needs_review` | Фото есть, нужна финальная проверка |
| 024 | Рача-Корал | `024-racha-koral` | 4/4 | `source_complete_needs_review` | Фото есть, нужна финальная проверка |
| 025 | Рок-Ха | `025-rok-ha` | 4/4 | `temporary_complete_needs_review` | Фото есть, нужна проверка актуальности/соответствия |
| 026 | Рача-Корал Майтон | `026-racha-koral-mayton` | 4/4 | `temporary_complete_needs_review` | Фото есть, нужна проверка актуальности/соответствия |
| 027 | Корал 1 день | `027-koral-1-den` | 4/4 | `source_complete_needs_review` | Фото есть, нужна финальная проверка |
| 028 | Краби: острова без волн и закат | `028-krabi-ostrova-bez-voln-i-zakat` | 4/4 | `temporary_complete_needs_review` | Фото есть, нужна проверка актуальности/соответствия |
| 029 | Пхи-Пхи / Бамбу / Ранг Яй с рыбалкой | `029-phi-phi-bambu-rang-yay-s-rybalkoy` | 4/4 | `temporary_complete_needs_review` | Фото есть, нужна проверка актуальности/соответствия |
| 030 | Гидроциклы | `030-gidrocikly` | 4/4 | `temporary_complete_needs_visual_review` | Фото есть, нужна проверка актуальности/соответствия |
| 031 | Рыбалка | `031-rybalka` | 4/4 | `temporary_complete_needs_review` | Фото есть, нужна проверка актуальности/соответствия |
| 032 | Дайвинг | `032-dayving` | 4/4 | `source_complete_needs_visual_review` | Фото есть, нужна финальная проверка |
| 033 | Премиум катамаран | `033-premium-katamaran-phi-phi-racha-i-zakatnaya-vecherinka` | 4/4 | `temporary_complete_needs_visual_review` | Фото есть, нужна проверка актуальности/соответствия |
| 034 | Озерная рыбалка | `034-ozernaya-rybalka` | 4/4 | `temporary_complete_needs_review` | Фото есть, нужна проверка актуальности/соответствия |
| 035 | Парк слонов | `035-park-slonov` | 4/4 | `temporary_complete_needs_visual_review` | Фото есть, нужна проверка актуальности/соответствия |
| 036 | Туры в другие города и страны | `036-tury-v-drugie-goroda-i-strany` | 4/4 | `source_complete_needs_review` | Фото есть, нужна финальная проверка |
| 037 | Каолак | `037-kaolak` | 4/4 | `source_complete_needs_review` | Фото есть, нужна финальная проверка |
| 038 | Пхан-Нга: путь Аватара | `038-phan-nga-put-avatara` | 4/4 | `source_complete_needs_review` | Фото есть, нужна финальная проверка |
| 039 | Рафтинг | `039-rafting` | 4/4 | `source_complete_needs_visual_review` | Фото есть, нужна финальная проверка |
| 040 | Чеолан 1 день | `040-cheolan-1-den` | 4/4 | `source_complete_needs_review` | Фото есть, нужна финальная проверка |
| 041 | Краби | `041-krabi` | 4/4 | `source_complete_needs_review` | Фото есть, нужна финальная проверка |
| 042 | Чеолан 2 дня Стандарт | `042-cheolan-2-dnya-standart` | 4/4 | `source_complete_needs_review` | Фото есть, нужна финальная проверка |
| 043 | Чеолан 2 дня Deluxe | `043-cheolan-2-dnya-deluxe` | 4/4 | `source_complete_needs_review` | Фото есть, нужна финальная проверка |
| 044 | Вечерние шоу | `044-vechernie-shou` | 4/4 | `source_complete_needs_visual_review` | Фото есть, нужна финальная проверка |
| 045 | Квадроциклы | `045-kvadrocikly` | 4/4 | `source_complete_needs_visual_review` | Фото есть, нужна финальная проверка |
| 046 | Сити Тур | `046-siti-tur` | 4/4 | `source_complete_needs_review` | Фото есть, нужна финальная проверка |
| 047 | Полет Ханумана | `047-polet-hanumana` | 4/4 | `temporary_complete_needs_visual_review` | Фото есть, нужна проверка актуальности/соответствия |
| 048 | Аквапарк | `048-akvapark` | 4/4 | `source_complete_needs_visual_review` | Фото есть, нужна финальная проверка |
| 049 | Дельфинарий | `049-delfinariy` | 4/4 | `temporary_complete_needs_visual_review` | Фото есть, нужна проверка актуальности/соответствия |
| 050 | Bangla Boxing | `050-bangla-boxing` | 4/4 | `temporary_complete_needs_visual_review` | Фото есть, нужна проверка актуальности/соответствия |
| 051 | Катамараны | `051-katamarany` | 4/4 | `temporary_complete_needs_visual_review` | Фото есть, нужна проверка актуальности/соответствия |
| 052 | Яхты, лодки, катера | `052-yahty-lodki-katera` | 4/4 | `temporary_complete_needs_visual_review` | Фото есть, нужна проверка актуальности/соответствия |
| 053 | HYPE YACHT | `053-hype-yacht` | 4/4 | `source_complete_needs_visual_review` | Фото есть, нужна финальная проверка |
| 054 | YONA Beach Club | `054-yona-beach-club` | 4/4 | `source_complete_needs_visual_review` | Фото есть, нужна финальная проверка |

## Итог

| Показатель | Количество |
| --- | ---: |
| Всего экскурсий | 54 |
| Локальные папки с фото уже есть | 54 |
| Фото отсутствуют полностью | 0 |
| Нужно заменить или апскейлить | 2 |
| Временно закрыто фото, нужна финальная проверка | 24 |

## Следующий шаг

- [x] Создать недостающие папки для всех 54 экскурсий.
- [x] Для каждой папки добавить `source.txt`.
- [x] Сформировать общий `all-excursions-media-manifest.json`.
- [x] Добрать первичный рабочий слой фото.
- [x] Удалить временные Pexels-фото после решения не использовать их в публикационной базе.
- [x] Подготовить отдельный запрос фото у исполнителя дайвинга.
- [x] Подготовить запросы фото по группам исполнителей.
- [x] Проверить текущий инвентарь фото по всем 54 экскурсиям.
- [ ] Проверить повторы фото, слабые изображения и случайные визуалы.
