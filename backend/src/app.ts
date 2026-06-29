import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'

import type { DbClient } from './db'
import type { AppEnv } from './env'
import { createAuthRoutes } from './auth/routes'
import { AuthService } from './auth/service'
import { createCatalogRoutes } from './catalog/routes'
import { CatalogService } from './catalog/service'
import { errorResponse, handleError, validationErrorHook } from './http/errors'
import { createMediaRoutes } from './media/routes'
import { createStorageServiceFromEnv, type StorageService } from './storage/service'
import { TripAdvisorClient } from './tripadvisor/client'

type AppBindings = {
  Variables: {
    authService: AuthService
    catalogService: CatalogService
    env: AppEnv
    storageService: StorageService | null
  }
}

type CreateAppOptions = {
  env: AppEnv
  prisma: DbClient
}

export function createApp({ env, prisma }: CreateAppOptions) {
  const authService = new AuthService(prisma, env)
  const tripAdvisorClient = env.TRIPADVISOR_API_KEY
    ? new TripAdvisorClient({
        apiKey: env.TRIPADVISOR_API_KEY,
        timeoutMs: env.TRIPADVISOR_REQUEST_TIMEOUT_MS,
        baseUrl: env.TRIPADVISOR_API_BASE_URL,
      })
    : null

  const catalogService = new CatalogService(prisma, tripAdvisorClient)
  const storageService = createStorageServiceFromEnv(env)
  const app = new OpenAPIHono<AppBindings>({
    defaultHook: validationErrorHook,
  })

  app.use(secureHeaders({ crossOriginResourcePolicy: 'cross-origin' }))
  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) return env.CORS_ORIGINS[0] ?? null
        return env.CORS_ORIGINS.includes(origin) ? origin : null
      },
      allowHeaders: ['Content-Type', 'Authorization', 'X-Client-Platform'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      credentials: true,
      maxAge: 600,
    }),
  )
  app.use('*', async (c, next) => {
    c.set('authService', authService)
    c.set('catalogService', catalogService)
    c.set('env', env)
    c.set('storageService', storageService)
    await next()
  })

  app.get('/', (c) => {
    return c.json({
      name: 'Phuket Go backend',
      status: 'ok',
    })
  })

  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
    })
  })

  app.route('/api/auth', createAuthRoutes())
  app.route('/api/catalog', createCatalogRoutes())
  app.route('/media', createMediaRoutes())

  app.doc('/openapi.json', {
    openapi: '3.0.0',
    info: {
      title: 'Phuket Go API',
      version: '1.0.0',
    },
  })

  app.notFound((c) => c.json(errorResponse('NOT_FOUND', 'Route not found'), 404))
  app.onError(handleError)

  return app
}

export type AppType = ReturnType<typeof createApp>
