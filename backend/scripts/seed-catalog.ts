import { readFile, readdir } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PrismaPg } from '@prisma/adapter-pg'

import {
  ExcursionPhotoImageType,
  ExcursionStatus,
  PrismaClient,
} from '../src/generated/prisma/client'
import { normalizePgConnectionString } from '../src/db'

const backendRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const repositoryRoot = resolve(backendRoot, '..')
const datasetPath = resolve(
  repositoryRoot,
  'docs/03-service-catalog/excursions-site-data-mvp.json',
)
const mediaRoot = resolve(repositoryRoot, 'docs/03-service-catalog/media/excursions')
const excursionDocsRoot = resolve(repositoryRoot, 'docs/03-service-catalog/excursions')
const rubRate = 2.6

type ExcursionDataset = {
  items: ExcursionItem[]
}

type ExcursionItem = {
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
  flags?: {
    diving_separate_executor?: boolean
  }
}

type ExcursionMarkdown = {
  facts: string[]
  routeItems: string[]
  included: string[]
  notIncluded: string[]
  takeWithYou: string[]
  restrictions: string[]
}

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://superuser:superpassword@localhost:54329/phuket_go?schema=public'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: normalizePgConnectionString(databaseUrl) }),
})

try {
  const result = await seedCatalog()
  console.info(
    `Seeded catalog: ${result.categories} categories, ${result.excursions} excursions, ${result.photos} photos.`,
  )
} finally {
  await prisma.$disconnect()
}

async function seedCatalog() {
  const dataset = (await Bun.file(datasetPath).json()) as ExcursionDataset
  const partner =
    (await prisma.partner.findFirst({
      where: { name: 'Phuket Go default executor' },
    })) ??
    (await prisma.partner.create({
      data: {
        name: 'Phuket Go default executor',
        defaultCommissionThb: 100,
        adminNote:
          'Temporary local seed executor. Real partner routing will be configured before publication.',
      },
    }))

  const categoryByTitle = new Map<string, { id: string; slug: string }>()
  let categories = 0
  let excursions = 0
  let photos = 0

  for (const item of dataset.items) {
    const markdown = await markdownFor(item)
    const categoryTitle = categoryTitleFor(item)
    const category = await getOrCreateCategory(categoryTitle, categoryByTitle)
    if (!categoryByTitle.has(categoryTitle)) {
      categoryByTitle.set(categoryTitle, category)
    }
    categories = categoryByTitle.size

    const title = item.h1?.trim() || item.title.trim()
    const priceFromThb = moneyOrFallback(item.price_from_thb, 0)
    const excursion = await prisma.excursion.upsert({
      where: { slug: item.slug },
      update: {
        title,
        categoryId: category.id,
        shortEmotion: shortEmotionFor(item, markdown),
        description: descriptionFor(item, markdown),
        route: routeFor(markdown),
        duration: durationFor(item),
        priceFromThb,
        priceFromRub: Math.round(priceFromThb * rubRate),
        rubRate: String(rubRate),
        rateDate: new Date('2026-06-29T00:00:00.000Z'),
        currencyNote: currencyNoteFor(item),
        included: markdown.included,
        notIncluded: markdown.notIncluded,
        takeWithYou: markdown.takeWithYou,
        restrictions: markdown.restrictions,
        insurance: 'Страховка включена.',
        guideLanguageNote: 'Русский гид.',
        cancellationPolicy: cancellationPolicyFor(markdown),
        partnerId: partner.id,
        status: ExcursionStatus.PUBLISHED,
        seoTitle: seoTitleFor(item),
        seoDescription: seoDescriptionFor(item),
        sourceUrl: item.source_url ?? null,
        adminNote: adminNoteFor(item),
      },
      create: {
        slug: item.slug,
        title,
        categoryId: category.id,
        shortEmotion: shortEmotionFor(item, markdown),
        description: descriptionFor(item, markdown),
        route: routeFor(markdown),
        duration: durationFor(item),
        priceFromThb,
        priceFromRub: Math.round(priceFromThb * rubRate),
        rubRate: String(rubRate),
        rateDate: new Date('2026-06-29T00:00:00.000Z'),
        currencyNote: currencyNoteFor(item),
        included: markdown.included,
        notIncluded: markdown.notIncluded,
        takeWithYou: markdown.takeWithYou,
        restrictions: markdown.restrictions,
        insurance: 'Страховка включена.',
        guideLanguageNote: 'Русский гид.',
        cancellationPolicy: cancellationPolicyFor(markdown),
        partnerId: partner.id,
        status: ExcursionStatus.PUBLISHED,
        seoTitle: seoTitleFor(item),
        seoDescription: seoDescriptionFor(item),
        sourceUrl: item.source_url ?? null,
        adminNote: adminNoteFor(item),
      },
    })
    excursions += 1

    await prisma.excursionPhoto.deleteMany({
      where: { excursionId: excursion.id },
    })

    const itemPhotos = await photosFor(item)
    if (itemPhotos.length > 0) {
      await prisma.excursionPhoto.createMany({
        data: itemPhotos.map((photo, index) => ({
          excursionId: excursion.id,
          url: photo.url,
          storageProvider: 'local',
          imageType: ExcursionPhotoImageType.REAL,
          alt: `${title}: фото ${index + 1}`,
          isCover: index === 0,
          block: 'carousel',
          role: index === 0 ? 'cover' : 'carousel',
          sortOrder: index,
          sourceUrl: item.source_url ?? null,
          sourceType: 'prepared_local_media',
          usageAllowed: true,
          needsReview: true,
        })),
      })
      photos += itemPhotos.length
    }
  }

  return { categories, excursions, photos }
}

async function getOrCreateCategory(
  title: string,
  categoryByTitle: Map<string, { id: string; slug: string }>,
) {
  const cached = categoryByTitle.get(title)
  if (cached) return cached

  const category = await prisma.excursionCategory.upsert({
    where: { slug: categorySlug(title) },
    update: {
      title,
      status: ExcursionStatus.PUBLISHED,
    },
    create: {
      slug: categorySlug(title),
      title,
      status: ExcursionStatus.PUBLISHED,
      sortOrder: categorySortOrder(title),
    },
    select: {
      id: true,
      slug: true,
    },
  })
  categoryByTitle.set(title, category)
  return category
}

async function photosFor(item: ExcursionItem) {
  const folder = item.media?.folder
  if (!folder) return []

  const carouselFolder = resolve(mediaRoot, folder, 'final/carousel')
  const files = await readdir(carouselFolder).catch(() => [])
  return files
    .filter((file) => ['.jpg', '.jpeg', '.png', '.webp'].includes(extname(file).toLowerCase()))
    .sort((left, right) => left.localeCompare(right, 'ru'))
    .map((file) => ({
      url: `/media/excursions/${relative(mediaRoot, join(carouselFolder, file))}`,
    }))
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

function categorySortOrder(title: string) {
  const order: Record<string, number> = {
    'Морские экскурсии': 10,
    'Наземные экскурсии': 20,
    'Активный отдых': 30,
    'Шоу и развлечения': 40,
    'Водный транспорт': 50,
    Экскурсии: 100,
  }
  return order[title] ?? 100
}

async function markdownFor(item: ExcursionItem): Promise<ExcursionMarkdown> {
  const filePath = await markdownPathFor(item.slug)
  if (!filePath) {
    return emptyMarkdown()
  }

  const markdown = await readFile(filePath, 'utf8')
  const facts = bulletItems(sectionText(markdown, 'Коротко'))
  const routeItems = bulletItems(sectionText(markdown, 'Маршрут'))
  const included = bulletItems(sectionText(markdown, 'Что включено'))
  const notIncluded = bulletItems(sectionText(markdown, 'Что оплачивается отдельно'))
  const takeWithYou = bulletItems(sectionText(markdown, 'Что взять с собой'))
  const restrictionFacts = facts.filter(isRestrictionLike)
  const restrictions = [
    ...bulletItems(sectionText(markdown, 'Важные условия')),
    ...restrictionFacts,
  ]

  return {
    facts: facts.filter((item) => !isOperationalNote(item)),
    routeItems,
    included,
    notIncluded,
    takeWithYou,
    restrictions: uniqueItems(restrictions),
  }
}

async function markdownPathFor(slug: string) {
  const files = await readdir(excursionDocsRoot)
  const fileNamePattern = new RegExp(`^\\d+-${escapeRegex(slug)}\\.md$`)
  return (
    files
      .filter((file) => file.endsWith('.md'))
      .map((file) => join(excursionDocsRoot, file))
      .find((filePath) => fileNamePattern.test(filePath.split('/').at(-1) ?? '')) ?? null
  )
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
  if (item.toLowerCase().includes('англоязычный гид')) {
    return 'Русский гид'
  }

  return item
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

function isOperationalNote(item: string) {
  const normalized = item.toLowerCase()
  return (
    normalized.includes('стоимость:') ||
    normalized.includes('бат') ||
    normalized.includes('платный трансфер') ||
    isRestrictionLike(item)
  )
}

function uniqueItems(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))]
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function shortEmotionFor(item: ExcursionItem, markdown: ExcursionMarkdown) {
  const firstFact = markdown.facts[0]
  if (firstFact) return trimToSentence(publicSiteText(firstFact), 180)
  if (item.seo_description) return trimToSentence(publicSiteText(item.seo_description), 160)
  return 'Маршрут для тех, кто хочет забрать с Пхукета не просто фото, а настоящее воспоминание.'
}

function descriptionFor(item: ExcursionItem, markdown: ExcursionMarkdown) {
  const facts = markdown.facts.slice(0, 3)
  if (facts.length > 0) {
    return facts.map(publicSiteText).join('\n\n')
  }

  return item.seo_description
    ? publicSiteText(item.seo_description)
    : 'День на Пхукете, который хочется выбрать не только по маршруту, но и по ощущению.'
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

function seoTitleFor(item: ExcursionItem) {
  return item.seo_title?.trim() || `${item.title.trim()} - Phuket Go`
}

function seoDescriptionFor(item: ExcursionItem) {
  return (
    (item.seo_description ? publicSiteText(item.seo_description) : null) ||
    `Экскурсия ${item.title.trim()} на Пхукете. Можно бесплатно забронировать место и уточнить детали программы.`
  )
}

function publicSiteText(value: string) {
  return value.trim()
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

function adminNoteFor(item: ExcursionItem) {
  const notes = ['Seeded from docs/03-service-catalog/excursions-site-data-mvp.json.']
  if (item.flags?.diving_separate_executor) {
    notes.push('Diving route: assign a separate executor before publication.')
  }
  return notes.join(' ')
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
