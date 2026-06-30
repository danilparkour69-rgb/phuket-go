import { describe, expect, test } from 'bun:test'

import {
  buildLeadProblemReportedTelegramMessage,
  buildLeadStatusChangedTelegramMessage,
  buildLeadTelegramMessages,
  buildPartnerLeadCallbackConfirmation,
  leadTelegramConfigFromEnv,
  TelegramLeadNotifier,
  type LeadTelegramCallbackConfirmationInput,
  type LeadTelegramInput,
  type LeadTelegramProblemReportedInput,
  type LeadTelegramStatusChangedInput,
} from './telegram-notifier'

describe('buildLeadTelegramMessages', () => {
  test('formats admin and partner notifications for a complete lead snapshot', () => {
    const messages = buildLeadTelegramMessages(fullLeadInput())

    expect(messages.adminText).toContain('Новая заявка Phuket Go')
    expect(messages.adminText).toContain('Заявка: #PG-20260630-ABC12345')
    expect(messages.adminText).toContain('Статус: new')
    expect(messages.adminText).toContain('Партнер: Marusya Travel')
    expect(messages.adminText).toContain('Telegram: @danil')
    expect(messages.adminText).toContain('Дата: 2026-07-10')
    expect(messages.partnerText).toContain('Экскурсия: Острова Пхи-Пхи')
    expect(messages.partnerText).toContain('Количество людей: 2')
    expect(messages.partnerText).toContain('Комментарий: Хочу утром')
  })

  test('uses dashes for empty optional fields', () => {
    const input = fullLeadInput()
    input.lead.customerTelegram = null
    input.lead.requestedDate = null
    input.lead.peopleCount = null
    input.lead.comment = null

    const messages = buildLeadTelegramMessages(input)

    expect(messages.adminText).toContain('Telegram: —')
    expect(messages.adminText).toContain('Дата: —')
    expect(messages.adminText).toContain('Людей: —')
    expect(messages.adminText).toContain('Комментарий: —')
  })
})

describe('buildLeadStatusChangedTelegramMessage', () => {
  test('formats admin notification for accepted partner callback', () => {
    const message = buildLeadStatusChangedTelegramMessage(statusChangedInput())

    expect(message.adminText).toContain('Статус заявки изменен')
    expect(message.adminText).toContain('Заявка: #PG-20260630-ABC12345')
    expect(message.adminText).toContain('Статус: accepted (Взята в работу)')
    expect(message.adminText).toContain('Экскурсия: Острова Пхи-Пхи')
    expect(message.adminText).toContain('Партнер: Marusya Travel')
    expect(message.adminText).toContain('Telegram партнера: @partner')
  })

  test('formats admin notification for completed partner callback', () => {
    const input = statusChangedInput()
    input.lead.status = 'COMPLETED'

    const message = buildLeadStatusChangedTelegramMessage(input)

    expect(message.adminText).toContain('Статус: completed (Оказана)')
  })
})

describe('buildPartnerLeadCallbackConfirmation', () => {
  test('formats accepted partner confirmation', () => {
    expect(buildPartnerLeadCallbackConfirmation(callbackConfirmationInput())).toEqual({
      toastText: 'Заявка взята в работу',
      partnerText: [
        'Заявка #PG-20260630-ABC12345 взята в работу.',
        'Свяжитесь с клиентом и подтвердите детали.',
      ].join('\n'),
    })
  })

  test('formats declined partner confirmation', () => {
    const input = callbackConfirmationInput()
    input.status = 'declined'

    expect(buildPartnerLeadCallbackConfirmation(input)).toEqual({
      toastText: 'Заявка отклонена',
      partnerText: [
        'Заявка #PG-20260630-ABC12345 отклонена.',
        'Администратор увидит это и решит, что делать дальше.',
      ].join('\n'),
    })
  })

  test('formats completed partner confirmation', () => {
    const input = callbackConfirmationInput()
    input.status = 'completed'

    expect(buildPartnerLeadCallbackConfirmation(input)).toEqual({
      toastText: 'Заявка отмечена как оказанная',
      partnerText: [
        'Заявка #PG-20260630-ABC12345 отмечена как оказанная.',
        'Комиссия будет учтена в месячном расчете.',
      ].join('\n'),
    })
  })
})

describe('buildLeadProblemReportedTelegramMessage', () => {
  test('formats admin notification for a partner problem report', () => {
    const message = buildLeadProblemReportedTelegramMessage(problemReportedInput())

    expect(message.adminText).toContain('Партнер сообщил о проблеме')
    expect(message.adminText).toContain('Заявка: #PG-20260630-ABC12345')
    expect(message.adminText).toContain('Статус: accepted (Взята в работу)')
    expect(message.adminText).toContain('Партнер: Marusya Travel')
    expect(message.adminText).toContain('Причина: Клиент не отвечает')
  })
})

describe('leadTelegramConfigFromEnv', () => {
  test('returns null when Telegram notifications are disabled', () => {
    expect(
      leadTelegramConfigFromEnv({
        ...baseEnv(),
        TELEGRAM_NOTIFICATIONS_ENABLED: false,
      }),
    ).toBeNull()
  })
})

describe('TelegramLeadNotifier', () => {
  test('sends admin and partner notifications with partner action buttons', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      return jsonResponse({ ok: true })
    }
    const notifier = new TelegramLeadNotifier(
      {
        botToken: 'bot-token',
        adminChatId: 'admin-chat',
      },
      fetcher,
    )

    await notifier.notifyLeadCreated(fullLeadInput())

    expect(calls).toHaveLength(2)
    expect(calls[0].url).toBe('https://api.telegram.org/botbot-token/sendMessage')
    expect(calls[0].init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({
      chat_id: 'admin-chat',
    })
    const partnerBody = JSON.parse(String(calls[1].init?.body))
    expect(partnerBody.chat_id).toBe('partner-chat')
    expect(partnerBody.reply_markup.inline_keyboard[0][0]).toEqual({
      text: 'Взять в работу',
      callback_data: 'lead:lead-1:accept',
    })
    expect(partnerBody.reply_markup.inline_keyboard[0][1]).toEqual({
      text: 'Отклонить',
      callback_data: 'lead:lead-1:decline',
    })
  })

  test('skips partner notification when partner chat id is unknown', async () => {
    const input = fullLeadInput()
    input.partner.telegramChatId = null
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const notifier = new TelegramLeadNotifier(
      {
        botToken: 'bot-token',
        adminChatId: 'admin-chat',
      },
      async (url, init) => {
        calls.push({ url: String(url), init })
        return jsonResponse({ ok: true })
      },
    )

    await notifier.notifyLeadCreated(input)

    expect(calls).toHaveLength(1)
    expect(JSON.parse(String(calls[0].init?.body)).chat_id).toBe('admin-chat')
  })

  test('returns controlled errors without token or response body material', async () => {
    const notifier = new TelegramLeadNotifier(
      {
        botToken: 'bot-token',
        adminChatId: 'admin-chat',
      },
      async () => new Response('secret should not be surfaced', { status: 500 }),
    )

    try {
      await notifier.notifyLeadCreated(fullLeadInput())
      throw new Error('Expected Telegram notifier to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('Telegram sendMessage failed with status 500')
      expect((error as Error).message).not.toContain('bot-token')
      expect((error as Error).message).not.toContain('secret')
    }
  })

  test('wraps low-level fetch errors without leaking the bot token URL', async () => {
    const notifier = new TelegramLeadNotifier(
      {
        botToken: 'bot-token',
        adminChatId: 'admin-chat',
      },
      async () => {
        throw new Error('https://api.telegram.org/botbot-token/sendMessage failed')
      },
    )

    try {
      await notifier.notifyLeadCreated(fullLeadInput())
      throw new Error('Expected Telegram notifier to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('Telegram sendMessage request failed')
      expect((error as Error).message).not.toContain('bot-token')
    }
  })

  test('sends admin notification when partner changes lead status', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const notifier = new TelegramLeadNotifier(
      {
        botToken: 'bot-token',
        adminChatId: 'admin-chat',
      },
      async (url, init) => {
        calls.push({ url: String(url), init })
        return jsonResponse({ ok: true })
      },
    )

    await notifier.notifyLeadStatusChanged(statusChangedInput())

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.telegram.org/botbot-token/sendMessage')
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body.chat_id).toBe('admin-chat')
    expect(body.text).toContain('Статус: accepted (Взята в работу)')
  })

  test('answers partner callback, updates keyboard, and sends confirmation message', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const notifier = new TelegramLeadNotifier(
      {
        botToken: 'bot-token',
        adminChatId: 'admin-chat',
      },
      async (url, init) => {
        calls.push({ url: String(url), init })
        return jsonResponse({ ok: true })
      },
    )

    await notifier.confirmPartnerLeadCallback(callbackConfirmationInput())

    expect(calls.map((call) => call.url)).toEqual([
      'https://api.telegram.org/botbot-token/answerCallbackQuery',
      'https://api.telegram.org/botbot-token/editMessageReplyMarkup',
      'https://api.telegram.org/botbot-token/sendMessage',
    ])
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      callback_query_id: 'callback-1',
      text: 'Заявка взята в работу',
      show_alert: false,
    })
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({
      chat_id: 'partner-chat',
      message_id: 10,
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Оказана', callback_data: 'lead:lead-1:complete' },
            { text: 'Проблема', callback_data: 'lead:lead-1:problem' },
          ],
        ],
      },
    })
    expect(JSON.parse(String(calls[2].init?.body))).toMatchObject({
      chat_id: 'partner-chat',
      text: 'Заявка #PG-20260630-ABC12345 взята в работу.\nСвяжитесь с клиентом и подтвердите детали.',
    })
  })

  test('clears partner keyboard after completed callback', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const notifier = new TelegramLeadNotifier(
      {
        botToken: 'bot-token',
        adminChatId: 'admin-chat',
      },
      async (url, init) => {
        calls.push({ url: String(url), init })
        return jsonResponse({ ok: true })
      },
    )
    const input = callbackConfirmationInput()
    input.status = 'completed'

    await notifier.confirmPartnerLeadCallback(input)

    expect(JSON.parse(String(calls[1].init?.body))).toMatchObject({
      reply_markup: {
        inline_keyboard: [],
      },
    })
    expect(JSON.parse(String(calls[2].init?.body)).text).toBe(
      'Заявка #PG-20260630-ABC12345 отмечена как оказанная.\nКомиссия будет учтена в месячном расчете.',
    )
  })

  test('shows partner problem reason keyboard', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const notifier = new TelegramLeadNotifier(
      {
        botToken: 'bot-token',
        adminChatId: 'admin-chat',
      },
      async (url, init) => {
        calls.push({ url: String(url), init })
        return jsonResponse({ ok: true })
      },
    )
    const input = callbackConfirmationInput()
    input.problemPrompt = true

    await notifier.confirmPartnerLeadCallback(input)

    expect(JSON.parse(String(calls[1].init?.body))).toMatchObject({
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Клиент не отвечает', callback_data: 'lead:lead-1:problem:no_response' }],
          [{ text: 'Нет мест', callback_data: 'lead:lead-1:problem:no_seats' }],
          [{ text: 'Нужна помощь админа', callback_data: 'lead:lead-1:problem:need_admin' }],
          [{ text: 'Другая причина', callback_data: 'lead:lead-1:problem:other' }],
        ],
      },
    })
  })

  test('sends admin notification when partner reports a problem', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const notifier = new TelegramLeadNotifier(
      {
        botToken: 'bot-token',
        adminChatId: 'admin-chat',
      },
      async (url, init) => {
        calls.push({ url: String(url), init })
        return jsonResponse({ ok: true })
      },
    )

    await notifier.notifyLeadProblemReported(problemReportedInput())

    expect(calls).toHaveLength(1)
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body.chat_id).toBe('admin-chat')
    expect(body.text).toContain('Причина: Клиент не отвечает')
  })
})

function fullLeadInput(): LeadTelegramInput {
  return {
    lead: {
      id: 'lead-1',
      publicNumber: 'PG-20260630-ABC12345',
      status: 'NEW',
      customerName: 'Даниил',
      customerPhone: '+79990000000',
      customerTelegram: '@danil',
      requestedDate: new Date('2026-07-10T00:00:00.000Z'),
      peopleCount: 2,
      comment: 'Хочу утром',
      excursionTitle: 'Острова Пхи-Пхи',
    },
    partner: {
      name: 'Marusya Travel',
      telegramUsername: '@partner',
      telegramChatId: 'partner-chat',
    },
  }
}

function statusChangedInput(): LeadTelegramStatusChangedInput {
  return {
    lead: {
      id: 'lead-1',
      publicNumber: 'PG-20260630-ABC12345',
      status: 'ACCEPTED',
      excursionTitle: 'Острова Пхи-Пхи',
    },
    partner: {
      name: 'Marusya Travel',
      telegramUsername: '@partner',
    },
  }
}

function callbackConfirmationInput(): LeadTelegramCallbackConfirmationInput {
  return {
    callbackQueryId: 'callback-1',
    chatId: 'partner-chat',
    messageId: 10,
    leadId: 'lead-1',
    publicNumber: 'PG-20260630-ABC12345',
    status: 'accepted',
    changed: true,
  }
}

function problemReportedInput(): LeadTelegramProblemReportedInput {
  return {
    lead: {
      id: 'lead-1',
      publicNumber: 'PG-20260630-ABC12345',
      status: 'ACCEPTED',
      excursionTitle: 'Острова Пхи-Пхи',
      partnerNote: 'Клиент не отвечает',
    },
    partner: {
      name: 'Marusya Travel',
      telegramUsername: '@partner',
    },
  }
}

function baseEnv() {
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
  }
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
