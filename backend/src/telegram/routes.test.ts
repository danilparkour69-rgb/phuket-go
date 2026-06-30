import { describe, expect, spyOn, test } from 'bun:test'
import { OpenAPIHono } from '@hono/zod-openapi'

import type { CatalogService } from '../catalog/service'
import type { AppEnv } from '../env'
import { handleError } from '../http/errors'
import type {
  LeadTelegramCallbackConfirmationInput,
  LeadTelegramNotifier,
} from '../leads/telegram-notifier'
import { createTelegramRoutes, parseLeadCallbackData } from './routes'

describe('parseLeadCallbackData', () => {
  test('parses supported lead status actions', () => {
    expect(parseLeadCallbackData('lead:lead-1:accept')).toEqual({
      leadId: 'lead-1',
      action: 'accept',
    })
    expect(parseLeadCallbackData('lead:lead-1:decline')).toEqual({
      leadId: 'lead-1',
      action: 'decline',
    })
    expect(parseLeadCallbackData('lead:lead-1:complete')).toEqual({
      leadId: 'lead-1',
      action: 'complete',
    })
    expect(parseLeadCallbackData('lead:lead-1:problem')).toEqual({
      leadId: 'lead-1',
      action: 'problem',
    })
    expect(parseLeadCallbackData('lead:lead-1:problem:no_response')).toEqual({
      leadId: 'lead-1',
      action: 'problem_reason',
      reason: 'no_response',
    })
  })

  test('ignores unsupported callback payloads', () => {
    expect(parseLeadCallbackData('lead:lead-1:contact')).toBeNull()
    expect(parseLeadCallbackData('lead:lead-1:problem:unsupported')).toBeNull()
    expect(parseLeadCallbackData('other:lead-1:accept')).toBeNull()
    expect(parseLeadCallbackData('lead::accept')).toBeNull()
  })
})

describe('Telegram webhook routes', () => {
  test('rejects requests when webhook secret is not configured', async () => {
    const app = testApp({
      env: {
        ...baseEnv(),
        TELEGRAM_WEBHOOK_SECRET: undefined,
      },
    })

    const response = await app.request('/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'secret',
      },
      body: JSON.stringify(callbackUpdate()),
    })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('NOT_FOUND')
  })

  test('rejects requests with an invalid webhook secret', async () => {
    const app = testApp()

    const response = await app.request('/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'wrong',
      },
      body: JSON.stringify(callbackUpdate()),
    })
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  test('updates a lead from a supported callback action', async () => {
    const calls: Array<{
      leadId: string
      action: 'accept' | 'decline' | 'complete' | 'problem'
      reason?: 'no_response' | 'no_seats' | 'need_admin' | 'other'
      partnerTelegramChatId: string
    }> = []
    const app = testApp({
      catalogService: {
        handleTelegramLeadCallback: async (input) => {
          calls.push(input)
          return {
            leadId: input.leadId,
            publicNumber: 'PG-20260630-ABC12345',
            status: 'accepted',
            changed: true,
          }
        },
      } as CatalogService,
    })

    const response = await app.request('/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'secret',
      },
      body: JSON.stringify(callbackUpdate()),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.result).toMatchObject({
      leadId: 'lead-1',
      publicNumber: 'PG-20260630-ABC12345',
      status: 'accepted',
      changed: true,
    })
    expect(calls).toEqual([
      {
        leadId: 'lead-1',
        action: 'accept',
        partnerTelegramChatId: '123456',
      },
    ])
  })

  test('confirms partner callback through Telegram notifier', async () => {
    const confirmations: LeadTelegramCallbackConfirmationInput[] = []
    const app = testApp({
      leadTelegramNotifier: {
        notifyLeadCreated: async () => {},
        notifyLeadStatusChanged: async () => {},
        notifyLeadProblemReported: async () => {},
        confirmPartnerLeadCallback: async (input) => {
          confirmations.push(input)
        },
      },
    })

    const response = await app.request('/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'secret',
      },
      body: JSON.stringify(callbackUpdate()),
    })

    expect(response.status).toBe(200)
    expect(confirmations).toEqual([
      {
        callbackQueryId: 'callback-1',
        chatId: 'partner-chat',
        messageId: 10,
        leadId: 'lead-1',
        publicNumber: 'PG-20260630-ABC12345',
        status: 'accepted',
        changed: true,
      },
    ])
  })

  test('confirms partner problem prompt through Telegram notifier', async () => {
    const confirmations: LeadTelegramCallbackConfirmationInput[] = []
    const app = testApp({
      catalogService: {
        handleTelegramLeadProblemPrompt: async (input) => ({
          leadId: input.leadId,
          publicNumber: 'PG-20260630-ABC12345',
          status: 'accepted',
          changed: false,
          problemPrompt: true,
        }),
      } as CatalogService,
      leadTelegramNotifier: {
        notifyLeadCreated: async () => {},
        notifyLeadStatusChanged: async () => {},
        notifyLeadProblemReported: async () => {},
        confirmPartnerLeadCallback: async (input) => {
          confirmations.push(input)
        },
      },
    })

    const response = await app.request('/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'secret',
      },
      body: JSON.stringify(callbackUpdate({ data: 'lead:lead-1:problem' })),
    })

    expect(response.status).toBe(200)
    expect(confirmations[0]).toMatchObject({
      leadId: 'lead-1',
      status: 'accepted',
      changed: false,
      problemPrompt: true,
    })
  })

  test('confirms partner problem reason through Telegram notifier', async () => {
    const confirmations: LeadTelegramCallbackConfirmationInput[] = []
    const app = testApp({
      catalogService: {
        handleTelegramLeadProblemReason: async (input) => ({
          leadId: input.leadId,
          publicNumber: 'PG-20260630-ABC12345',
          status: 'accepted',
          changed: false,
          problemNote: input.reason === 'no_response' ? 'Клиент не отвечает' : 'Другая причина',
        }),
      } as CatalogService,
      leadTelegramNotifier: {
        notifyLeadCreated: async () => {},
        notifyLeadStatusChanged: async () => {},
        notifyLeadProblemReported: async () => {},
        confirmPartnerLeadCallback: async (input) => {
          confirmations.push(input)
        },
      },
    })

    const response = await app.request('/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'secret',
      },
      body: JSON.stringify(callbackUpdate({ data: 'lead:lead-1:problem:no_response' })),
    })

    expect(response.status).toBe(200)
    expect(confirmations[0]).toMatchObject({
      leadId: 'lead-1',
      status: 'accepted',
      changed: false,
      problemNote: 'Клиент не отвечает',
    })
  })

  test('keeps webhook successful when partner confirmation fails', async () => {
    const consoleError = spyOn(console, 'error').mockImplementation(() => {})
    const app = testApp({
      leadTelegramNotifier: {
        notifyLeadCreated: async () => {},
        notifyLeadStatusChanged: async () => {},
        notifyLeadProblemReported: async () => {},
        confirmPartnerLeadCallback: async () => {
          throw new Error('Telegram unavailable')
        },
      },
    })

    const response = await app.request('/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'secret',
      },
      body: JSON.stringify(callbackUpdate()),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(consoleError).toHaveBeenCalledWith('Telegram partner callback confirmation failed', {
      leadId: 'lead-1',
      message: 'Telegram unavailable',
    })
    consoleError.mockRestore()
  })

  test('ignores unrelated callback payloads', async () => {
    const app = testApp({
      catalogService: {
        handleTelegramLeadCallback: async () => {
          throw new Error('Should not call catalog service')
        },
      } as unknown as CatalogService,
    })

    const response = await app.request('/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'secret',
      },
      body: JSON.stringify(callbackUpdate({ data: 'lead:lead-1:contact' })),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true, ignored: true })
  })
})

function testApp(
  options: {
    env?: AppEnv
    catalogService?: CatalogService
    leadTelegramNotifier?: LeadTelegramNotifier
  } = {},
) {
  const app = new OpenAPIHono<{
    Variables: {
      catalogService: CatalogService
      env: AppEnv
      leadTelegramNotifier: LeadTelegramNotifier
    }
  }>()
  app.use('*', async (c, next) => {
    c.set('env', options.env ?? baseEnv())
    c.set(
      'catalogService',
      options.catalogService ??
        ({
          handleTelegramLeadCallback: async () => ({
            leadId: 'lead-1',
            publicNumber: 'PG-20260630-ABC12345',
            status: 'accepted',
            changed: true,
          }),
        } as unknown as CatalogService),
    )
    c.set(
      'leadTelegramNotifier',
      options.leadTelegramNotifier ??
        ({
          notifyLeadCreated: async () => {},
          notifyLeadStatusChanged: async () => {},
          notifyLeadProblemReported: async () => {},
          confirmPartnerLeadCallback: async () => {},
        } satisfies LeadTelegramNotifier),
    )
    await next()
  })
  app.route('/', createTelegramRoutes())
  app.onError(handleError)

  return app
}

function callbackUpdate(options: { data?: string } = {}) {
  return {
    update_id: 1,
    callback_query: {
      id: 'callback-1',
      data: options.data ?? 'lead:lead-1:accept',
      from: {
        id: 123456,
      },
      message: {
        message_id: 10,
        chat: {
          id: 'partner-chat',
        },
      },
    },
  }
}

function baseEnv(): AppEnv {
  return {
    PORT: 3000,
    DATABASE_URL: 'postgresql://superuser:superpassword@localhost:54329/phuket_go',
    JWT_SECRET: '12345678901234567890123456789012',
    CORS_ORIGINS: ['http://localhost:5173'],
    ACCESS_TOKEN_TTL_SECONDS: 900,
    REFRESH_TOKEN_TTL_DAYS: 30,
    COOKIE_SECURE: false,
    SPACES_UPLOAD_MAX_BYTES: 10 * 1024 * 1024,
    SPACES_UPLOAD_URL_TTL_SECONDS: 900,
    SPACES_DOWNLOAD_URL_TTL_SECONDS: 300,
    SPACES_PUBLIC_CACHE_CONTROL: 'public, max-age=31536000, immutable',
    TRIPADVISOR_ALLOW_REFRESH: false,
    TRIPADVISOR_API_BASE_URL: 'https://api.content.tripadvisor.com/api/v1',
    TRIPADVISOR_SYNC_STALE_HOURS: 24,
    TRIPADVISOR_MAX_REQUESTS_PER_RUN: 10,
    TRIPADVISOR_DAILY_MAX_REQUESTS: 200,
    TRIPADVISOR_REQUEST_TIMEOUT_MS: 8000,
    GOOGLE_SHEETS_ENABLED: false,
    GOOGLE_SHEETS_LEADS_SHEET_NAME: 'Заявки',
    TELEGRAM_NOTIFICATIONS_ENABLED: false,
    TELEGRAM_WEBHOOK_SECRET: 'secret',
  }
}
