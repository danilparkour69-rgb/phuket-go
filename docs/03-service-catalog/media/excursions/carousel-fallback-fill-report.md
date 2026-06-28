# Carousel Fallback Fill Report

Статус: [x] fallback для пустых каруселей выполнен

Дата: 2026-06-28

## Правило

- Если по направлению нет горизонтальных фото хорошего качества, карусель не оставляем пустой.
- В `carousel-candidates/` копируем те фото, которые есть в `original/photo-base/`.
- Такие фото считаются временными и требуют будущей замены или улучшения.

## Направления с fallback

| Направление | Доступно фото | Скопировано в carousel-candidates |
| --- | ---: | ---: |
| `015-surin` | 1 | 1 |
| `024-racha-koral` | 10 | 10 |
| `025-rok-ha` | 1 | 1 |
| `026-racha-koral-mayton` | 7 | 7 |
| `027-koral-1-den` | 6 | 6 |
| `031-rybalka` | 9 | 9 |
| `032-dayving` | 6 | 6 |
| `036-tury-v-drugie-goroda-i-strany` | 10 | 10 |
| `051-katamarany` | 8 | 8 |
