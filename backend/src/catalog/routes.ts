import {
  apiErrorSchema,
  createLeadRequestSchema,
  excursionReviewsResponseSchema,
  excursionDetailResponseSchema,
  excursionListQuerySchema,
  excursionListResponseSchema,
  excursionSlugParamsSchema,
  leadIdParamsSchema,
  leadResponseSchema,
  updateLeadContactChannelRequestSchema,
} from '@phuket-go/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'

import { validationErrorHook } from '../http/errors'
import type { CatalogService } from './service'

type CatalogRouteEnv = {
  Variables: {
    catalogService: CatalogService
  }
}

const json = <T>(schema: T) => ({
  'application/json': {
    schema,
  },
})

const errorResponseContent = json(apiErrorSchema)

const listExcursionsRoute = createRoute({
  method: 'get',
  path: '/excursions',
  request: {
    query: excursionListQuerySchema,
  },
  responses: {
    200: {
      content: json(excursionListResponseSchema),
      description: 'Published excursions list',
    },
  },
})

const getExcursionRoute = createRoute({
  method: 'get',
  path: '/excursions/{slug}',
  request: {
    params: excursionSlugParamsSchema,
  },
  responses: {
    200: {
      content: json(excursionDetailResponseSchema),
      description: 'Published excursion detail',
    },
    404: {
      content: errorResponseContent,
      description: 'Excursion not found',
    },
  },
})

const getExcursionReviewsRoute = createRoute({
  method: 'get',
  path: '/excursions/{slug}/reviews',
  request: {
    params: excursionSlugParamsSchema,
  },
  responses: {
    200: {
      content: json(excursionReviewsResponseSchema),
      description: 'Published excursion review data from TripAdvisor',
    },
    404: {
      content: errorResponseContent,
      description: 'Excursion not found',
    },
  },
})

const createLeadRoute = createRoute({
  method: 'post',
  path: '/leads',
  request: {
    body: {
      content: json(createLeadRequestSchema),
    },
  },
  responses: {
    201: {
      content: json(leadResponseSchema),
      description: 'Created public lead',
    },
    400: {
      content: errorResponseContent,
      description: 'Invalid payload',
    },
    404: {
      content: errorResponseContent,
      description: 'Excursion not found',
    },
  },
})

const updateLeadContactChannelRoute = createRoute({
  method: 'patch',
  path: '/leads/{id}/contact-channel',
  request: {
    params: leadIdParamsSchema,
    body: {
      content: json(updateLeadContactChannelRequestSchema),
    },
  },
  responses: {
    200: {
      content: json(leadResponseSchema),
      description: 'Updated preferred customer contact channel',
    },
    400: {
      content: errorResponseContent,
      description: 'Invalid payload',
    },
    404: {
      content: errorResponseContent,
      description: 'Lead not found',
    },
  },
})

export function createCatalogRoutes() {
  const routes = new OpenAPIHono<CatalogRouteEnv>({
    defaultHook: validationErrorHook,
  })

  routes.openapi(listExcursionsRoute, async (c) => {
    const catalog = c.get('catalogService')
    return c.json({ excursions: await catalog.listExcursions(c.req.valid('query')) }, 200)
  })

  routes.openapi(getExcursionRoute, async (c) => {
    const catalog = c.get('catalogService')
    const { slug } = c.req.valid('param')
    return c.json({ excursion: await catalog.getExcursionBySlug(slug) }, 200)
  })

  routes.openapi(getExcursionReviewsRoute, async (c) => {
    const catalog = c.get('catalogService')
    const { slug } = c.req.valid('param')
    return c.json(await catalog.getReviewsBySlug(slug), 200)
  })

  routes.openapi(createLeadRoute, async (c) => {
    const catalog = c.get('catalogService')
    return c.json({ lead: await catalog.createLead(c.req.valid('json')) }, 201)
  })

  routes.openapi(updateLeadContactChannelRoute, async (c) => {
    const catalog = c.get('catalogService')
    const { id } = c.req.valid('param')
    return c.json(
      { lead: await catalog.updateLeadContactChannel(id, c.req.valid('json')) },
      200,
    )
  })

  return routes
}
