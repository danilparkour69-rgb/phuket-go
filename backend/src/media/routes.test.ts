import { describe, expect, test } from 'bun:test'

import { createMediaRoutes } from './routes'

describe('media routes', () => {
  test('serves prepared excursion media and blocks traversal', async () => {
    const routes = createMediaRoutes()

    const media = await routes.request(
      '/excursions/001-slon-mantra-spa-samet-nangshe/final/carousel/sputnik8-mantra-spa-elephants-samet-nangshe-gallery-04.webp',
    )
    expect(media.status).toBe(200)
    expect(media.headers.get('content-type')).toBe('image/webp')
    expect(media.headers.get('cross-origin-resource-policy')).toBe('cross-origin')

    const traversal = await routes.request('/excursions/../excursions-site-data-mvp.json')
    expect(traversal.status).not.toBe(200)
  })
})
