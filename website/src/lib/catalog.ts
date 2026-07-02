import { readFile, readdir } from 'node:fs/promises'
import { extname, join, relative, resolve, sep } from 'node:path'
import { cwd } from 'node:process'

import {
  excursionDetailResponseSchema,
  excursionListResponseSchema,
  excursionReviewsResponseSchema,
  type ExcursionCardDto,
  type ExcursionDetailDto,
  type ExcursionReviewsResponse,
} from '@phuket-go/contracts'
import { sitePath } from './paths'

const defaultApiUrl = 'http://127.0.0.1:3000'
const workingDirectory = cwd()
const repositoryRoot = workingDirectory.endsWith(`${sep}website`)
  ? resolve(workingDirectory, '..')
  : workingDirectory
const datasetPath = resolve(
  repositoryRoot,
  'docs/03-service-catalog/excursions-site-data-mvp.json',
)
const excursionDocsRoot = resolve(repositoryRoot, 'docs/03-service-catalog/excursions')
const mediaRoot = resolve(repositoryRoot, 'docs/03-service-catalog/media/excursions')
const rubRate = 2.6

type ExcursionDataset = {
  items: ExcursionItem[]
}

type ExcursionItem = {
  id?: number
  slug: string
  title: string
  direction?: string
  source_url?: string
  h1?: string
  seo_title?: string
  seo_description?: string
  duration?: string
  price_from_thb?: number
  currency_note?: string
  media?: {
    folder?: string
  }
}

type MediaManifest = {
  assets?: MediaManifestAsset[]
}

type MediaManifestAsset = {
  file?: string
  role?: string
  status?: string
}

type ExcursionMarkdown = {
  facts: string[]
  routeItems: string[]
  included: string[]
  notIncluded: string[]
  takeWithYou: string[]
  restrictions: string[]
}

export type CatalogLoadResult =
  | {
      status: 'ready'
      apiUrl: string
      excursions: ExcursionCardDto[]
      categories: CategoryFilter[]
    }
  | {
      status: 'error'
      apiUrl: string
      excursions: []
      categories: []
      message: string
    }

export type CategoryFilter = {
  slug: string
  title: string
  count: number
}

export const categoryTitles: Record<string, string> = {
  active: 'Активный отдых',
  excursions: 'Экскурсии',
  'land-tours': 'Наземные экскурсии',
  'sea-tours': 'Морские туры',
  shows: 'Шоу и развлечения',
  'water-transport': 'Водный транспорт',
}

export function apiBaseUrl() {
  return import.meta.env.PUBLIC_API_URL ?? defaultApiUrl
}

export async function loadCatalog(): Promise<CatalogLoadResult> {
  const apiUrl = apiBaseUrl()
  const url = new URL('/api/catalog/excursions', apiUrl)

  try {
    const response = await fetch(url)
    if (!response.ok) {
      return await loadFallbackCatalog(apiUrl)
    }

    const payload = excursionListResponseSchema.parse(await response.json())
    return {
      status: 'ready',
      apiUrl,
      excursions: payload.excursions,
      categories: buildCategories(payload.excursions),
    }
  } catch (error) {
    try {
      return await loadFallbackCatalog(apiUrl)
    } catch {
      return {
        status: 'error',
        apiUrl,
        excursions: [],
        categories: [],
        message: error instanceof Error ? error.message : 'Backend API is unavailable',
      }
    }
  }
}

export async function loadExcursion(slug: string) {
  const apiUrl = apiBaseUrl()
  const url = new URL(`/api/catalog/excursions/${slug}`, apiUrl)

  try {
    const response = await fetch(url)

    if (!response.ok) {
      return await loadFallbackExcursion(slug, apiUrl)
    }

    const payload = excursionDetailResponseSchema.parse(await response.json())
    return {
      apiUrl,
      excursion: payload.excursion,
    }
  } catch {
    return await loadFallbackExcursion(slug, apiUrl)
  }
}

export async function loadExcursionReviews(slug: string) {
  const apiUrl = apiBaseUrl()
  const url = new URL(`/api/catalog/excursions/${slug}/reviews`, apiUrl)

  try {
    const response = await fetch(url)
    if (!response.ok) {
      return { apiUrl, reviews: null as null | ExcursionReviewsResponse }
    }

    const payload = excursionReviewsResponseSchema.parse(await response.json())
    return { apiUrl, reviews: payload }
  } catch {
    return { apiUrl, reviews: null as null | ExcursionReviewsResponse }
  }
}

export function mediaUrl(value: string | null, _apiUrl: string) {
  if (!value) return null
  if (value.startsWith('/media/')) return sitePath(value)
  return value
}

export function formatRub(value: number) {
  return new Intl.NumberFormat('ru-RU').format(value) + ' ₽'
}

export function formatThb(value: number) {
  return new Intl.NumberFormat('ru-RU').format(value) + ' THB'
}

export function categoryTitle(slug: string) {
  return categoryTitles[slug] ?? slug
}

export function galleryImages(excursion: ExcursionDetailDto, apiUrl: string) {
  return excursion.photos
    .map((photo) => ({
      ...photo,
      absoluteUrl: mediaUrl(photo.url, apiUrl),
    }))
    .filter((photo): photo is typeof photo & { absoluteUrl: string } =>
      Boolean(photo.absoluteUrl),
    )
}

export function cardImageUrls(excursion: ExcursionCardDto, apiUrl: string) {
  const urls = excursion.carouselPhotoUrls.length
    ? excursion.carouselPhotoUrls
    : excursion.coverPhotoUrl
      ? [excursion.coverPhotoUrl]
      : []

  return [...new Set(urls.map((url) => mediaUrl(url, apiUrl)).filter(Boolean))]
}

function buildCategories(excursions: ExcursionCardDto[]) {
  const counts = new Map<string, number>()
  for (const excursion of excursions) {
    counts.set(excursion.categorySlug, (counts.get(excursion.categorySlug) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([slug, count]) => ({
      slug,
      title: categoryTitles[slug] ?? slug,
      count,
    }))
    .sort((left, right) => left.title.localeCompare(right.title, 'ru'))
}

async function loadFallbackCatalog(apiUrl: string): Promise<CatalogLoadResult> {
  const dataset = await loadFallbackDataset()
  const excursions = await Promise.all(dataset.items.map((item) => toFallbackCard(item)))
  return {
    status: 'ready',
    apiUrl,
    excursions,
    categories: buildCategories(excursions),
  }
}

async function loadFallbackExcursion(slug: string, apiUrl: string) {
  const dataset = await loadFallbackDataset()
  const item = dataset.items.find((candidate) => candidate.slug === slug)
  if (!item) {
    throw new Error(`Excursion ${slug} not found in local catalog fallback`)
  }

  const markdown = await markdownFor(item)
  const card = await toFallbackCard(item)
  const photos = await photosFor(item)
  const excursion: ExcursionDetailDto = {
    ...card,
    description: descriptionFor(item, markdown),
    route: routeFor(markdown),
    rubRate,
    rateDate: new Date('2026-06-29T00:00:00.000Z').toISOString(),
    included: markdown.included,
    notIncluded: markdown.notIncluded,
    takeWithYou: markdown.takeWithYou,
    restrictions: markdown.restrictions,
    insurance: 'Страховка включена.',
    guideLanguageNote: 'Русский гид.',
    cancellationPolicy: cancellationPolicyFor(markdown),
    photos: photos.map((photo, index) => ({
      id: `${item.slug}-photo-${index + 1}`,
      url: photo.url,
      storageProvider: 'local',
      imageType: 'real',
      alt: `${titleFor(item)}: фото ${index + 1}`,
      isCover: index === 0,
      block: 'carousel',
      role: index === 0 ? 'cover' : 'carousel',
      sortOrder: index,
      needsReview: true,
    })),
  }

  return { apiUrl, excursion }
}

async function loadFallbackDataset() {
  return JSON.parse(await readFile(datasetPath, 'utf8')) as ExcursionDataset
}

async function toFallbackCard(item: ExcursionItem): Promise<ExcursionCardDto> {
  const photos = await photosFor(item)
  const priceFromThb = moneyOrFallback(item.price_from_thb, 0)
  const title = titleFor(item)
  return {
    id: String(item.id ?? item.slug),
    slug: item.slug,
    title,
    categorySlug: categorySlug(categoryTitleFor(item)),
    shortEmotion: shortEmotionFor(item),
    priceFromRub: Math.round(priceFromThb * rubRate),
    priceFromThb,
    currencyNote: currencyNoteFor(item),
    duration: durationFor(item),
    coverPhotoUrl: photos[0]?.url ?? null,
    carouselPhotoUrls: photos.map((photo) => photo.url),
    externalRating: null,
    status: 'published',
  }
}

async function photosFor(item: ExcursionItem) {
  const folder = item.media?.folder
  if (!folder) return []

  const manifestPhotos = await manifestPhotosFor(folder)
  if (manifestPhotos.length > 0) return manifestPhotos

  const carouselFolder = resolve(mediaRoot, folder, 'final/carousel')
  const files = await readdir(carouselFolder).catch(() => [])
  return files
    .filter((file) => ['.jpg', '.jpeg', '.png', '.webp'].includes(extname(file).toLowerCase()))
    .sort((left, right) => left.localeCompare(right, 'ru'))
    .map((file) => ({
      url: `/media/excursions/${relative(mediaRoot, join(carouselFolder, file))}`,
    }))
}

async function manifestPhotosFor(folder: string) {
  const manifestPath = resolve(mediaRoot, folder, 'media-manifest.json')
  const manifest = await readFile(manifestPath, 'utf8')
    .then((value) => JSON.parse(value) as MediaManifest)
    .catch(() => null)
  if (!manifest?.assets?.length) return []

  const files = uniqueItems(
    manifest.assets
      .filter((asset) => asset.role === 'carousel')
      .map((asset) => asset.file?.trim() ?? '')
      .filter(isSafeManifestCarouselFile),
  )

  return files.map((file) => ({
    url: `/media/excursions/${folder}/${file}`,
  }))
}

function isSafeManifestCarouselFile(file: string) {
  return (
    file.startsWith('final/carousel/') &&
    !file.startsWith('/') &&
    !file.includes('\0') &&
    !file.split('/').includes('..') &&
    ['.jpg', '.jpeg', '.png', '.webp'].includes(extname(file).toLowerCase())
  )
}

async function markdownFor(item: ExcursionItem): Promise<ExcursionMarkdown> {
  const filePath = await markdownPathFor(item.slug)
  if (!filePath) return emptyMarkdown()

  const markdown = await readFile(filePath, 'utf8')
  const facts = bulletItems(sectionText(markdown, 'Коротко'))
  const routeItems = bulletItems(sectionText(markdown, 'Маршрут'))
  const included = [
    ...bulletItems(sectionText(markdown, 'Что включено')),
    ...facts.filter(isIncludedLike).flatMap(splitCommaItems),
  ]
  const notIncluded = [
    ...bulletItems(sectionText(markdown, 'Что оплачивается отдельно')),
    ...facts.filter(isNotIncludedLike).map(cleanNotIncludedItem),
  ]
  const takeWithYou = bulletItems(sectionText(markdown, 'Что взять с собой'))
  const restrictions = [
    ...bulletItems(sectionText(markdown, 'Важные условия')),
    ...facts.filter(isRestrictionLike),
  ]

  return {
    facts: facts.filter((fact) => !isOperationalNote(fact)),
    routeItems,
    included: uniqueItems(included),
    notIncluded: uniqueItems(notIncluded),
    takeWithYou,
    restrictions: uniqueItems(restrictions),
  }
}

async function markdownPathFor(slug: string) {
  const files = await readdir(excursionDocsRoot)
  const fileNamePattern = new RegExp(`^\\d+-${escapeRegex(slug)}\\.md$`)
  return files.find((file) => fileNamePattern.test(file))
    ? join(excursionDocsRoot, files.find((file) => fileNamePattern.test(file)) as string)
    : null
}

function emptyMarkdown(): ExcursionMarkdown {
  return {
    facts: [],
    routeItems: [],
    included: [],
    notIncluded: [],
    takeWithYou: [],
    restrictions: [],
  }
}

function sectionText(markdown: string, heading: string) {
  const headingPattern = new RegExp(`^## ${escapeRegex(heading)}\\s*$`, 'm')
  const match = headingPattern.exec(markdown)
  if (!match) return ''

  const sectionStart = match.index + match[0].length
  const rest = markdown.slice(sectionStart)
  const nextHeading = rest.search(/^## /m)
  const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading)
  return section
    .split(/\nНужно (?:дополнительно )?уточнить[^:\n]*:/)[0]
    .split(/\nПеред публикацией:/)[0]
}

function bulletItems(markdown: string) {
  return uniqueItems(
    markdown
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2).trim())
      .map(normalizePublicItem)
      .filter((item) => item.length > 0)
      .filter((item) => !isPlaceholderItem(item)),
  )
}

function normalizePublicItem(item: string) {
  if (item.toLowerCase().includes('англоязычный гид')) return 'Русский гид'
  return item
}

function splitCommaItems(item: string) {
  return item
    .split(/,\s*/)
    .map((part) => normalizePublicItem(part.trim()))
    .filter(Boolean)
}

function isPlaceholderItem(item: string) {
  const normalized = item.toLowerCase()
  return (
    normalized.startsWith('блок не найден') ||
    normalized.startsWith('отдельные доплаты не выделены') ||
    normalized.includes('уточнить у партнера') ||
    normalized.includes('уточнить по источнику')
  )
}

function isRestrictionLike(item: string) {
  const normalized = item.toLowerCase()
  return (
    normalized.includes('беременн') ||
    normalized.includes('запрещается') ||
    normalized.includes('хроническ') ||
    normalized.includes('погод') ||
    normalized.includes('программа может меняться')
  )
}

function isIncludedLike(item: string) {
  const normalized = item.toLowerCase()
  return (
    normalized.includes('трансфер') &&
    normalized.includes('страховка') &&
    normalized.includes('русский гид')
  )
}

function isNotIncludedLike(item: string) {
  return item.toLowerCase().includes('не включен')
}

function cleanNotIncludedItem(item: string) {
  return item.replace(/^В тур не включены\s*/i, '').trim()
}

function isOperationalNote(item: string) {
  const normalized = item.toLowerCase()
  return (
    normalized.includes('стоимость:') ||
    normalized.startsWith('standart') ||
    normalized.startsWith('comfort') ||
    normalized.includes('взрослый/') ||
    normalized.includes('бат') ||
    normalized.includes('платный трансфер') ||
    isIncludedLike(item) ||
    isNotIncludedLike(item) ||
    isRestrictionLike(item)
  )
}

function titleFor(item: ExcursionItem) {
  return item.h1?.trim() || item.title.trim()
}

function shortEmotionFor(item: ExcursionItem) {
  if (item.seo_description) return trimToSentence(item.seo_description, 160)
  return 'Маршрут для тех, кто хочет забрать с Пхукета не просто фото, а настоящее воспоминание.'
}

function descriptionFor(item: ExcursionItem, markdown: ExcursionMarkdown) {
  const facts = markdown.facts.slice(0, 3)
  if (facts.length > 0) return facts.join('\n\n')
  return item.seo_description || shortEmotionFor(item)
}

function routeFor(markdown: ExcursionMarkdown) {
  if (markdown.routeItems.length === 0) return null
  return markdown.routeItems.map((item) => `- ${item}`).join('\n')
}

function cancellationPolicyFor(markdown: ExcursionMarkdown) {
  const weatherNote = markdown.restrictions.find((item) =>
    item.toLowerCase().includes('погод'),
  )
  return weatherNote ?? 'При плохой погоде возможен перенос или возврат.'
}

function categoryTitleFor(item: ExcursionItem) {
  const overrides: Record<string, string> = {
    akvapark: 'Шоу и развлечения',
    dayving: 'Активный отдых',
    delfinariy: 'Шоу и развлечения',
    kaolak: 'Наземные экскурсии',
    'polet-hanumana': 'Активный отдых',
    'siti-tur': 'Наземные экскурсии',
    'tury-v-drugie-goroda-i-strany': 'Наземные экскурсии',
    'vechernie-shou': 'Шоу и развлечения',
  }
  return overrides[item.slug] ?? normalizeCategoryTitle(item.direction)
}

function normalizeCategoryTitle(direction: string | undefined) {
  const value = direction?.trim()
  if (!value) return 'Экскурсии'
  if (value.includes('Морская')) return 'Морские экскурсии'
  if (value.includes('Шоу')) return 'Шоу и развлечения'
  if (value.includes('Водный транспорт')) return 'Водный транспорт'
  if (value.includes('Актив')) return 'Активный отдых'
  if (value.includes('Наземная')) return 'Наземные экскурсии'
  return value
}

function categorySlug(title: string) {
  const known: Record<string, string> = {
    'Активный отдых': 'active',
    'Водный транспорт': 'water-transport',
    'Морские экскурсии': 'sea-tours',
    'Наземные экскурсии': 'land-tours',
    'Шоу и развлечения': 'shows',
    Экскурсии: 'excursions',
  }
  return known[title] ?? 'excursions'
}

function currencyNoteFor(item: ExcursionItem) {
  return (
    item.currency_note?.trim() ||
    'Цена рассчитана по текущему курсу. Из-за изменения курса рубля итоговая сумма может отличаться.'
  )
}

function durationFor(item: ExcursionItem) {
  const duration = item.duration?.trim()
  return duration ? duration : null
}

function moneyOrFallback(value: number | undefined, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback
  return Math.round(value)
}

function trimToSentence(value: string, maxLength: number) {
  const normalized = value.trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1).trim()}…`
}

function uniqueItems(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))]
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
