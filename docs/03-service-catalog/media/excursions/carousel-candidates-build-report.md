# Carousel Candidates Build Report

Статус: [x] кандидаты для карусели собраны по папкам направлений

Дата: 2026-06-28

## Правило

- Фото должны лежать внутри папки конкретного направления.
- В `original/photo-base/` сохраняются все доступные фото из базы фото по этому направлению.
- В `carousel-candidates/` попадают все горизонтальные фото хорошего качества: ширина от 1000 px и ширина больше высоты.
- Если таких фото нет, карусель не оставляем пустой: временно берем все доступные фото из `original/photo-base/` и помечаем их как требующие будущей замены или улучшения.
- Ручную чистку неподходящих фото пользователь сделает позже.
- Если подходящих фото много, берем все.

## Итог

- `directions_seen`: 55
- `directions_processed`: 54
- `directions_skipped_no_folder`: 1
- `images_seen`: 576
- `original_copied`: 576
- `carousel_copied`: 491
- `carousel_skipped_quality_or_vertical`: 85

## По направлениям

| Направление | Статус | Фото найдено | Скопировано в original/photo-base | Скопировано в carousel-candidates | Не попало в карусель |
| --- | --- | ---: | ---: | ---: | ---: |
| `001-slon-mantra-spa-samet-nangshe` | `processed` | 5 | 5 | 5 | 0 |
| `002-avatar-plus` | `processed` | 12 | 12 | 12 | 0 |
| `003-avatar-world` | `processed` | 8 | 8 | 8 | 0 |
| `004-siyanie-planktona` | `processed` | 12 | 12 | 12 | 0 |
| `005-siyanie-planktona-2` | `processed` | 12 | 12 | 12 | 0 |
| `006-rassvetnoe-puteshestvie` | `processed` | 8 | 8 | 8 | 0 |
| `007-racha-koral-rassvet-privatnyy-plyazh-rybalka` | `processed` | 30 | 30 | 30 | 0 |
| `008-cirkovoe-shou` | `processed` | 6 | 6 | 1 | 5 |
| `009-rayskie-ostrova` | `processed` | 13 | 13 | 13 | 0 |
| `010-parom-na-phi-phi` | `processed` | 2 | 2 | 2 | 0 |
| `011-phangna` | `processed` | 13 | 13 | 13 | 0 |
| `012-similany` | `processed` | 7 | 7 | 7 | 0 |
| `013-similany-premium` | `processed` | 7 | 7 | 7 | 0 |
| `014-similany-2-dnya` | `processed` | 7 | 7 | 7 | 0 |
| `015-surin` | `processed` | 1 | 1 | 0 | 1 |
| `016-11-ostrovov` | `processed` | 9 | 9 | 9 | 0 |
| `017-ranniy-phi-phi` | `processed` | 13 | 13 | 13 | 0 |
| `018-phi-phi` | `processed` | 26 | 26 | 26 | 0 |
| `019-phi-phi-premium` | `processed` | 26 | 26 | 26 | 0 |
| `020-phi-phi-2-dnya` | `processed` | 8 | 8 | 4 | 4 |
| `021-4-zhemchuzhiny` | `processed` | 10 | 10 | 10 | 0 |
| `022-5-zhemchuzhin` | `processed` | 12 | 12 | 12 | 0 |
| `023-dzheyms-bond` | `processed` | 13 | 13 | 13 | 0 |
| `024-racha-koral` | `processed` | 10 | 10 | 0 | 10 |
| `025-rok-ha` | `processed` | 1 | 1 | 0 | 1 |
| `026-racha-koral-mayton` | `processed` | 7 | 7 | 0 | 7 |
| `027-koral-1-den` | `processed` | 6 | 6 | 0 | 6 |
| `028-krabi-ostrova-bez-voln-i-zakat` | `processed` | 19 | 19 | 19 | 0 |
| `029-phi-phi-bambu-rang-yay-s-rybalkoy` | `processed` | 14 | 14 | 14 | 0 |
| `030-gidrocikly` | `processed` | 5 | 5 | 5 | 0 |
| `031-rybalka` | `processed` | 9 | 9 | 0 | 9 |
| `032-dayving` | `processed` | 6 | 6 | 0 | 6 |
| `033-premium-katamaran-phi-phi-racha-i-zakatnaya-vecherinka` | `processed` | 22 | 22 | 22 | 0 |
| `034-ozernaya-rybalka` | `processed` | 15 | 15 | 15 | 0 |
| `035-park-slonov` | `processed` | 1 | 1 | 1 | 0 |
| `036-tury-v-drugie-goroda-i-strany` | `processed` | 10 | 10 | 0 | 10 |
| `037-kaolak` | `processed` | 16 | 16 | 16 | 0 |
| `038-phan-nga-put-avatara` | `processed` | 12 | 12 | 12 | 0 |
| `039-rafting` | `processed` | 15 | 15 | 12 | 3 |
| `040-cheolan-1-den` | `processed` | 17 | 17 | 17 | 0 |
| `041-krabi` | `processed` | 19 | 19 | 19 | 0 |
| `042-cheolan-2-dnya-standart` | `processed` | 17 | 17 | 17 | 0 |
| `043-cheolan-2-dnya-deluxe` | `processed` | 18 | 18 | 18 | 0 |
| `044-vechernie-shou` | `processed` | 4 | 4 | 2 | 2 |
| `045-kvadrocikly` | `processed` | 7 | 7 | 7 | 0 |
| `046-siti-tur` | `processed` | 13 | 13 | 13 | 0 |
| `047-polet-hanumana` | `processed` | 12 | 12 | 11 | 1 |
| `048-akvapark` | `processed` | 5 | 5 | 5 | 0 |
| `049-delfinariy` | `processed` | 1 | 1 | 1 | 0 |
| `050-bangla-boxing` | `processed` | 5 | 5 | 4 | 1 |
| `051-katamarany` | `processed` | 8 | 8 | 0 | 8 |
| `052-yahty-lodki-katera` | `processed` | 14 | 14 | 6 | 8 |
| `053-hype-yacht` | `processed` | 4 | 4 | 1 | 3 |
| `054-yona-beach-club` | `processed` | 4 | 4 | 4 | 0 |
| `phi-phi` | `skipped_no_direction_folder` | 0 | 0 | 0 | 0 |

## Следующий шаг

Открыть общую страницу просмотра:

- `docs/03-service-catalog/media/excursions/carousel-candidates-review.html`

На этом этапе неподходящие фото не отмечаем. Пользователь сделает ручную чистку позже.

Fallback для направлений без горизонтальных фото сохранен отдельно:

- `docs/03-service-catalog/media/excursions/carousel-fallback-fill-report.md`
