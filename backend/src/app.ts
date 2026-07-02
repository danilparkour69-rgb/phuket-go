import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'

import type { DbClient } from './db'
import type { AppEnv } from './env'
import { createAdminRoutes } from './admin/routes'
import { AdminService } from './admin/service'
import { createAuthRoutes } from './auth/routes'
import { AuthService } from './auth/service'
import { createCatalogRoutes } from './catalog/routes'
import { CatalogService } from './catalog/service'
import { errorResponse, handleError, validationErrorHook } from './http/errors'
import { createLeadSheetsSinkFromEnv, type LeadSheetsSink } from './leads/google-sheets-sink'
import {
  createLeadTelegramNotifierFromEnv,
  type LeadTelegramNotifier,
} from './leads/telegram-notifier'
import { createMediaRoutes } from './media/routes'
import { createStorageServiceFromEnv, type StorageService } from './storage/service'
import { createTelegramRoutes } from './telegram/routes'
import { TelegramContactService } from './telegram/contacts'
import { TripAdvisorClient } from './tripadvisor/client'

type AppBindings = {
  Variables: {
    adminService: AdminService
    authService: AuthService
    catalogService: CatalogService
    env: AppEnv
    leadSheetsSink: LeadSheetsSink
    leadTelegramNotifier: LeadTelegramNotifier
    storageService: StorageService | null
    telegramContactService: TelegramContactService
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

  const leadSheetsSink = createLeadSheetsSinkFromEnv(env)
  const leadTelegramNotifier = createLeadTelegramNotifierFromEnv(env)
  const adminService = new AdminService(prisma, leadSheetsSink, leadTelegramNotifier)
  const telegramContactService = new TelegramContactService(prisma)
  const catalogService = new CatalogService(
    prisma,
    tripAdvisorClient,
    leadSheetsSink,
    leadTelegramNotifier,
  )
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
      allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
      credentials: true,
      maxAge: 600,
    }),
  )
  app.use('*', async (c, next) => {
    c.set('adminService', adminService)
    c.set('authService', authService)
    c.set('catalogService', catalogService)
    c.set('env', env)
    c.set('leadSheetsSink', leadSheetsSink)
    c.set('leadTelegramNotifier', leadTelegramNotifier)
    c.set('storageService', storageService)
    c.set('telegramContactService', telegramContactService)
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

  app.route('/api/admin', createAdminRoutes())
  app.route('/api/auth', createAuthRoutes())
  app.route('/api/catalog', createCatalogRoutes())
  app.route('/api/telegram', createTelegramRoutes())
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
