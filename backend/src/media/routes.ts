import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Hono } from 'hono'

import { errorResponse } from '../http/errors'

const repositoryRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..')
const mediaRoot = resolve(repositoryRoot, 'docs/03-service-catalog/media/excursions')

const contentTypes: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export function createMediaRoutes() {
  const routes = new Hono()

  routes.get('/excursions/*', async (c) => {
    const relativePath = decodeURIComponent(mediaRelativePath(c.req.path))
    if (!isSafeRelativePath(relativePath)) {
      return c.json(errorResponse('BAD_REQUEST', 'Invalid media path'), 400)
    }

    const filePath = resolve(mediaRoot, relativePath)
    if (!isInsideMediaRoot(filePath)) {
      return c.json(errorResponse('BAD_REQUEST', 'Invalid media path'), 400)
    }

    const file = Bun.file(filePath)
    if (!(await file.exists())) {
      return c.json(errorResponse('NOT_FOUND', 'Media file not found'), 404)
    }

    return new Response(file, {
      headers: {
        'Cache-Control': 'public, max-age=3600',
        'Content-Type': contentTypeFor(filePath),
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    })
  })

  return routes
}

function mediaRelativePath(path: string) {
  if (path.startsWith('/media/excursions/')) return path.slice('/media/excursions/'.length)
  if (path.startsWith('/excursions/')) return path.slice('/excursions/'.length)
  return ''
}

function isSafeRelativePath(value: string) {
  if (!value || value.startsWith('/') || value.includes('\0')) return false
  return !value.split('/').includes('..')
}

function isInsideMediaRoot(filePath: string) {
  return filePath === mediaRoot || filePath.startsWith(`${mediaRoot}${sep}`)
}

function contentTypeFor(filePath: string) {
  const extension = filePath.split('.').at(-1)?.toLowerCase() ?? ''
  return contentTypes[extension] ?? 'application/octet-stream'
}
