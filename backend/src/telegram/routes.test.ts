import { describe, expect, spyOn, test } from 'bun:test'
import { OpenAPIHono } from '@hono/zod-openapi'

import type { CatalogService } from '../catalog/service'
import type { AppEnv } from '../env'
import { handleError } from '../http/errors'
import type {
  LeadTelegramCallbackConfirmationInput,
  LeadTelegramNotifier,
} from '../leads/telegram-notifier'
import type { TelegramContactService } from './contacts'
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
    expect(parseLeadCallbackData('lead:lead-1:paid')).toEqual({
      leadId: 'lead-1',
      action: 'paid',
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
    expect(parseLeadCallbackData('lead:lead-1:decline:spam')).toEqual({
      leadId: 'lead-1',
      action: 'decline_reason',
      reason: 'spam',
    })
    expect(parseLeadCallbackData('lead:lead-1:problem:no_slots')).toEqual({
      leadId: 'lead-1',
      action: 'problem_reason',
      reason: 'no_slots',
    })
  })

  test('ignores unsupported callback payloads', () => {
    expect(parseLeadCallbackData('lead:lead-1:contact')).toBeNull()
    expect(parseLeadCallbackData('lead:lead-1:accept:unexpected')).toBeNull()
    expect(parseLeadCallbackData('lead:lead-1:paid:unexpected')).toBeNull()
    expect(parseLeadCallbackData('lead:lead-1:complete:unexpected')).toBeNull()
    expect(parseLeadCallbackData('lead:lead-1:decline:spam:unexpected')).toBeNull()
    expect(parseLeadCallbackData('lead:lead-1:problem:unsupported')).toBeNull()
    expect(parseLeadCallbackData('lead:lead-1:decline:unsupported')).toBeNull()
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

  test('records regular Telegram messages as contacts without granting partner access', async () => {
    const contacts: Array<Parameters<TelegramContactService['recordContactSeen']>[0]> = []
    const app = testApp({
      telegramContactService: {
        recordContactSeen: async (
          input: Parameters<TelegramContactService['recordContactSeen']>[0],
        ) => {
          contacts.push(input)
        },
        getPendingCustomReason: async () => null,
      } as unknown as TelegramContactService,
    })

    const response = await app.request('/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'secret',
      },
      body: JSON.stringify(messageUpdate()),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true, ignored: true })
    expect(contacts).toEqual([
      {
        chatId: '123456',
        telegramUserId: '123456',
        username: 'manager',
        firstName: 'Manager',
        lastName: 'One',
        chatType: 'private',
        lastMessageText: '/start',
      },
    ])
  })

  test('updates a lead from a supported callback action', async () => {
    const calls: Array<{
      leadId: string
      action: 'accept' | 'decline' | 'paid' | 'complete' | 'problem'
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
        notifyLeadCustomerFollowUp: async () => {},
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
        customerContactUrl: 'https://t.me/danil',
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
        notifyLeadCustomerFollowUp: async () => {},
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

  test('confirms partner decline prompt through Telegram notifier', async () => {
    const confirmations: LeadTelegramCallbackConfirmationInput[] = []
    const app = testApp({
      catalogService: {
        handleTelegramLeadDeclinePrompt: async (input) => ({
          leadId: input.leadId,
          publicNumber: 'PG-20260630-ABC12345',
          status: 'new',
          changed: false,
          declinePrompt: true,
        }),
      } as CatalogService,
      leadTelegramNotifier: {
        notifyLeadCreated: async () => {},
        notifyLeadCustomerFollowUp: async () => {},
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
      body: JSON.stringify(callbackUpdate({ data: 'lead:lead-1:decline' })),
    })

    expect(response.status).toBe(200)
    expect(confirmations).toEqual([
      {
        callbackQueryId: 'callback-1',
        chatId: 'partner-chat',
        messageId: 10,
        leadId: 'lead-1',
        publicNumber: 'PG-20260630-ABC12345',
        status: 'new',
        changed: false,
        declinePrompt: true,
      },
    ])
  })

  test('confirms partner decline reason through Telegram notifier', async () => {
    const confirmations: LeadTelegramCallbackConfirmationInput[] = []
    const app = testApp({
      catalogService: {
        handleTelegramLeadDeclineReason: async (input) => ({
          leadId: input.leadId,
          publicNumber: 'PG-20260630-ABC12345',
          status: 'declined',
          changed: true,
          declineNote: input.reason === 'spam' ? 'Спам' : 'Другая причина',
        }),
      } as CatalogService,
      leadTelegramNotifier: {
        notifyLeadCreated: async () => {},
        notifyLeadCustomerFollowUp: async () => {},
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
      body: JSON.stringify(callbackUpdate({ data: 'lead:lead-1:decline:spam' })),
    })

    expect(response.status).toBe(200)
    expect(confirmations).toEqual([
      {
        callbackQueryId: 'callback-1',
        chatId: 'partner-chat',
        messageId: 10,
        leadId: 'lead-1',
        publicNumber: 'PG-20260630-ABC12345',
        status: 'declined',
        changed: true,
        declineNote: 'Спам',
      },
    ])
  })

  test('requests a custom partner reason after other decline reason callback', async () => {
    const confirmations: LeadTelegramCallbackConfirmationInput[] = []
    const pendingRequests: Array<Parameters<TelegramContactService['requestCustomReason']>[0]> = []
    const app = testApp({
      catalogService: {
        handleTelegramLeadCustomReasonPrompt: async (input) => ({
          leadId: input.leadId,
          publicNumber: 'PG-20260630-ABC12345',
          status: 'new',
          changed: false,
          customReasonPrompt: true,
          customReasonAction: input.action,
        }),
      } as CatalogService,
      telegramContactService: {
        recordContactSeen: async () => {},
        requestCustomReason: async (
          input: Parameters<TelegramContactService['requestCustomReason']>[0],
        ) => {
          pendingRequests.push(input)
        },
        getPendingCustomReason: async () => null,
        clearPendingCustomReason: async () => {},
      } as unknown as TelegramContactService,
      leadTelegramNotifier: {
        notifyLeadCreated: async () => {},
        notifyLeadCustomerFollowUp: async () => {},
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
      body: JSON.stringify(callbackUpdate({ data: 'lead:lead-1:decline:other' })),
    })

    expect(response.status).toBe(200)
    expect(pendingRequests).toEqual([
      {
        chatId: 'partner-chat',
        telegramUserId: '123456',
        leadId: 'lead-1',
        action: 'decline',
        messageId: 10,
      },
    ])
    expect(confirmations[0]).toMatchObject({
      leadId: 'lead-1',
      status: 'new',
      changed: false,
      customReasonPrompt: true,
      customReasonAction: 'decline',
    })
  })

  test('uses the next partner text message as a pending custom reason', async () => {
    const customReasonInputs: Array<Parameters<CatalogService['handleTelegramLeadCustomReason']>[0]> = []
    const confirmations: Array<
      Parameters<NonNullable<LeadTelegramNotifier['confirmPartnerCustomReason']>>[0]
    > = []
    const clearedChatIds: string[] = []
    const app = testApp({
      catalogService: {
        handleTelegramLeadCustomReason: async (input) => {
          customReasonInputs.push(input)
          return {
            leadId: input.leadId,
            publicNumber: 'PG-20260630-ABC12345',
            status: 'declined',
            changed: true,
            declineNote: input.reasonText,
          }
        },
      } as CatalogService,
      telegramContactService: {
        recordContactSeen: async () => {},
        requestCustomReason: async () => {},
        getPendingCustomReason: async () => ({
          leadId: 'lead-1',
          action: 'decline',
          messageId: 10,
        }),
        clearPendingCustomReason: async (chatId: string) => {
          clearedChatIds.push(chatId)
        },
      } as unknown as TelegramContactService,
      leadTelegramNotifier: {
        notifyLeadCreated: async () => {},
        notifyLeadCustomerFollowUp: async () => {},
        notifyLeadStatusChanged: async () => {},
        notifyLeadProblemReported: async () => {},
        confirmPartnerLeadCallback: async () => {},
        confirmPartnerCustomReason: async (input) => {
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
      body: JSON.stringify(messageUpdate({ text: 'Нет свободной машины на эту дату' })),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.result).toMatchObject({
      leadId: 'lead-1',
      status: 'declined',
      declineNote: 'Нет свободной машины на эту дату',
    })
    expect(customReasonInputs).toEqual([
      {
        leadId: 'lead-1',
        action: 'decline',
        reasonText: 'Нет свободной машины на эту дату',
        partnerTelegramChatId: '123456',
      },
    ])
    expect(clearedChatIds).toEqual(['123456'])
    expect(confirmations[0]).toMatchObject({
      chatId: '123456',
      messageId: 10,
      leadId: 'lead-1',
      status: 'declined',
      changed: true,
      action: 'decline',
      declineNote: 'Нет свободной машины на эту дату',
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
        notifyLeadCustomerFollowUp: async () => {},
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
        notifyLeadCustomerFollowUp: async () => {},
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
    telegramContactService?: TelegramContactService
  } = {},
) {
  const app = new OpenAPIHono<{
    Variables: {
      catalogService: CatalogService
      env: AppEnv
      leadTelegramNotifier: LeadTelegramNotifier
      telegramContactService: TelegramContactService
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
            customerContactUrl: 'https://t.me/danil',
          }),
        } as unknown as CatalogService),
    )
    c.set(
      'leadTelegramNotifier',
      options.leadTelegramNotifier ??
        ({
          notifyLeadCreated: async () => {},
          notifyLeadCustomerFollowUp: async () => {},
          notifyLeadStatusChanged: async () => {},
          notifyLeadProblemReported: async () => {},
          confirmPartnerLeadCallback: async () => {},
        } satisfies LeadTelegramNotifier),
    )
    c.set(
      'telegramContactService',
      options.telegramContactService ??
        ({
          recordContactSeen: async () => {},
        } as unknown as TelegramContactService),
    )
    await next()
  })
  app.route('/', createTelegramRoutes())
  app.onError(handleError)

  return app
}

function messageUpdate(options: { text?: string } = {}) {
  return {
    update_id: 1,
    message: {
      message_id: 10,
      text: options.text ?? '/start',
      chat: {
        id: 123456,
        type: 'private',
      },
      from: {
        id: 123456,
        username: 'manager',
        first_name: 'Manager',
        last_name: 'One',
      },
    },
  }
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
