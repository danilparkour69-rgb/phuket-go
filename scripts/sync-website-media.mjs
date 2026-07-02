import { cp, mkdir, readdir, stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import process, { cwd } from 'node:process'

const repositoryRoot = cwd().endsWith(`${sep}website`) ? resolve(cwd(), '..') : cwd()
const sourceRoot = resolve(repositoryRoot, 'docs/03-service-catalog/media/excursions')
const targetRoot = resolve(repositoryRoot, 'website/public/media/excursions')
const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp'])

let copied = 0
let skipped = 0
let folders = 0

try {
  await mkdir(targetRoot, { recursive: true })

  const directionEntries = await readdir(sourceRoot, { withFileTypes: true })
  for (const directionEntry of directionEntries) {
    if (!directionEntry.isDirectory()) continue

    const sourceCarousel = join(sourceRoot, directionEntry.name, 'final/carousel')
    const targetCarousel = join(targetRoot, directionEntry.name, 'final/carousel')
    const mediaEntries = await readdir(sourceCarousel, { withFileTypes: true }).catch(() => [])
    const mediaFiles = mediaEntries.filter((entry) => {
      return entry.isFile() && allowedExtensions.has(extname(entry.name).toLowerCase())
    })

    if (mediaFiles.length === 0) continue

    folders += 1
    await mkdir(targetCarousel, { recursive: true })

    for (const mediaFile of mediaFiles) {
      const sourcePath = join(sourceCarousel, mediaFile.name)
      const targetPath = join(targetCarousel, mediaFile.name)

      if (await isCurrentCopy(sourcePath, targetPath)) {
        skipped += 1
        continue
      }

      await cp(sourcePath, targetPath, {
        force: true,
        preserveTimestamps: true,
      })
      copied += 1
    }
  }

  console.log(
    `Synced website media: ${copied} copied, ${skipped} up to date, ${folders} folders.`,
  )
} catch (error) {
  process.exitCode = 1
  console.error(error instanceof Error ? error.message : error)
}

async function isCurrentCopy(sourcePath, targetPath) {
  const [sourceStats, targetStats] = await Promise.all([
    stat(sourcePath),
    stat(targetPath).catch(() => null),
  ])

  if (!targetStats) return false
  return (
    sourceStats.size === targetStats.size &&
    Math.floor(sourceStats.mtimeMs) <= Math.floor(targetStats.mtimeMs)
  )
}
