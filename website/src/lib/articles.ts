import { readFile, readdir } from 'node:fs/promises'
import { basename, resolve, sep } from 'node:path'
import { cwd } from 'node:process'

const workingDirectory = cwd()
const repositoryRoot = workingDirectory.endsWith(`${sep}website`)
  ? resolve(workingDirectory, '..')
  : workingDirectory
const articlesRoot = resolve(repositoryRoot, 'docs/07-seo-and-content')

export type ArticleSection = {
  heading: string
  paragraphs: string[]
  bullets: string[]
}

export type ArticleSource = {
  label: string
  url: string
}

export type ArticleEntry = {
  slug: string
  title: string
  seoTitle: string
  seoDescription: string
  h1: string
  summary: string
  intro: string[]
  sections: ArticleSection[]
  relatedLinks: string[]
  sources: ArticleSource[]
  readTimeMinutes: number
}

type ParsedSection = {
  heading: string
  body: string
}

export async function loadArticles() {
  const files = await readdir(articlesRoot)
  const articleFiles = files
    .filter((file) => /^article-.*\.md$/.test(file))
    .sort((left, right) => left.localeCompare(right, 'ru'))

  const articles = await Promise.all(
    articleFiles.map(async (file) => {
      const slug = file.replace(/^article-/, '').replace(/\.md$/, '')
      const raw = await readFile(resolve(articlesRoot, file), 'utf8')
      return parseArticle(slug, raw)
    }),
  )

  return articles
}

export async function loadArticleBySlug(slug: string) {
  const articles = await loadArticles()
  return articles.find((article) => article.slug === slug) ?? null
}

function parseArticle(slug: string, raw: string): ArticleEntry {
  const sections = parseSections(raw)
  const seoTitle = firstParagraph(findSectionBody(sections, 'SEO title'))
  const seoDescription = firstParagraph(findSectionBody(sections, 'SEO description'))
  const h1 = firstParagraph(findSectionBody(sections, 'H1'))
  const intro = paragraphsFromBody(findSectionBody(sections, 'Ввод'))

  const contentSections = sections
    .filter(
      (section) =>
        ![
          'SEO title',
          'SEO description',
          'H1',
          'Ввод',
          'Подходящие внутренние ссылки',
          'Источники',
          'Definition of Done',
        ].includes(section.heading),
    )
    .map((section) => ({
      heading: section.heading,
      paragraphs: paragraphsFromBody(section.body),
      bullets: bulletsFromBody(section.body),
    }))
    .filter((section) => section.paragraphs.length > 0 || section.bullets.length > 0)

  const relatedLinks = bulletsFromBody(findSectionBody(sections, 'Подходящие внутренние ссылки'))
  const sources = sourcesFromBody(findSectionBody(sections, 'Источники'))
  const summary = intro[0] ?? firstParagraph(contentSections[0]?.paragraphs.join('\n\n') ?? '')
  const readTimeMinutes = estimateReadTime(raw)

  return {
    slug,
    title: h1 || humanizeSlug(slug),
    seoTitle: seoTitle || h1 || humanizeSlug(slug),
    seoDescription: seoDescription || summary,
    h1: h1 || humanizeSlug(slug),
    summary,
    intro,
    sections: contentSections,
    relatedLinks,
    sources,
    readTimeMinutes,
  }
}

function parseSections(raw: string): ParsedSection[] {
  const matches = [...raw.matchAll(/^##\s+(.+)\s*$/gm)]
  return matches.map((match, index) => {
    const heading = match[1]?.trim() ?? ''
    const start = (match.index ?? 0) + match[0].length
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? raw.length) : raw.length
    const body = raw.slice(start, end).trim()

    return { heading, body }
  })
}

function findSectionBody(sections: ParsedSection[], heading: string) {
  return sections.find((section) => section.heading === heading)?.body ?? ''
}

function firstParagraph(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)[0] ?? ''
}

function paragraphsFromBody(body: string) {
  return body
    .split('\n\n')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .filter((chunk) => !chunk.startsWith('- '))
    .map((chunk) => chunk.replace(/\n+/g, ' ').trim())
}

function bulletsFromBody(body: string) {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
    .filter(Boolean)
}

function sourcesFromBody(body: string) {
  return body
    .split('\n')
    .map((line) => line.trim())
    .map((line) => {
      const match = /^-\s+(.+?)\s+-\s+(https?:\/\/\S+)\s*$/.exec(line)
      if (!match) return null
      return {
        label: match[1].trim(),
        url: match[2].trim(),
      } satisfies ArticleSource
    })
    .filter((item): item is ArticleSource => Boolean(item))
}

function estimateReadTime(raw: string) {
  const wordCount = raw
    .replace(/[#*`\[\]\-]/g, ' ')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean).length

  return Math.max(1, Math.round(wordCount / 180))
}

function humanizeSlug(slug: string) {
  return basename(slug)
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
