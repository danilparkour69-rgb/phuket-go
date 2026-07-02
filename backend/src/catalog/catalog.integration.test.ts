import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test'

import { createApp } from '../app'
import { createPrisma } from '../db'
import type { AppEnv } from '../env'
import {
  ExcursionPhotoImageType,
  ExcursionStatus,
  TripAdvisorMatchStatus,
  TripAdvisorSyncStatus,
  LeadContactChannel,
  LeadActorType,
  LeadServiceType,
  LeadSource,
  LeadStatus,
} from '../generated/prisma/client'
import type {
  LeadSheetsPartnerNoteUpdateInput,
  LeadSheetsSink,
  LeadSheetsStatusUpdateInput,
} from '../leads/google-sheets-sink'
import type {
  LeadTelegramContactChannelUpdatedInput,
  LeadTelegramCustomerFollowUpInput,
  LeadTelegramNotifier,
  LeadTelegramProblemReportedInput,
  LeadTelegramStatusChangedInput,
} from '../leads/telegram-notifier'
import { CatalogService } from './service'

const databaseUrl = process.env.TEST_DATABASE_URL

const maybeDescribe = databaseUrl ? describe : describe.skip

maybeDescribe('catalog API integration', () => {
  const env: AppEnv = {
    PORT: 3000,
    DATABASE_URL: databaseUrl!,
    JWT_SECRET: '12345678901234567890123456789012',
    CORS_ORIGINS: ['http://localhost:5173'],
    ACCESS_TOKEN_TTL_SECONDS: 60,
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
    TELEGRAM_WEBHOOK_SECRET: 'telegram-secret',
  }
  const prisma = createPrisma(databaseUrl!)
  const app = createApp({ env, prisma })

  beforeEach(async () => {
    await prisma.leadStatusHistory.deleteMany()
    await prisma.lead.deleteMany()
    await prisma.telegramContact.deleteMany()
    await prisma.excursionPhoto.deleteMany()
    await prisma.excursion.deleteMany()
    await prisma.excursionCategory.deleteMany()
    await prisma.partner.deleteMany()
    await prisma.authSession.deleteMany()
    await prisma.user.deleteMany()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  test('lists excursions, returns detail, creates lead, and saves contact channel', async () => {
    const { excursion } = await seedPublishedExcursion()
    await setTripadvisorPreviewData({
      excursionId: excursion.id,
    })

    const list = await app.request('/api/catalog/excursions?category=islands')
    const listBody = await list.json()

    expect(list.status).toBe(200)
    expect(listBody.excursions).toHaveLength(1)
    expect(listBody.excursions[0]).toMatchObject({
      slug: 'phi-phi-dream-day',
      categorySlug: 'islands',
      coverPhotoUrl: '/media/excursions/phi-phi/final/carousel/gallery-01.webp',
      carouselPhotoUrls: [
        '/media/excursions/phi-phi/final/carousel/gallery-01.webp',
        '/media/excursions/phi-phi/final/carousel/gallery-02.webp',
      ],
      externalRating: {
        source: 'tripadvisor',
        label: 'TripAdvisor',
        score: 4.7,
        reviewCount: 128,
        url: 'https://www.tripadvisor.com/Attraction_Review',
      },
      status: 'published',
    })

    const detail = await app.request('/api/catalog/excursions/phi-phi-dream-day')
    const detailBody = await detail.json()

    expect(detail.status).toBe(200)
    expect(detailBody.excursion).toMatchObject({
      id: excursion.id,
      slug: 'phi-phi-dream-day',
      priceFromRub: 3900,
      priceFromThb: 1500,
      included: ['Трансфер', 'Питание'],
    })
    expect(detailBody.excursion.externalRating).toMatchObject({
      source: 'tripadvisor',
      label: 'TripAdvisor',
      score: 4.7,
      reviewCount: 128,
      url: 'https://www.tripadvisor.com/Attraction_Review',
    })
    expect(detailBody.excursion.photos).toHaveLength(2)

    const createLead = await app.request('/api/catalog/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        excursionId: excursion.id,
        customerName: 'Даниил',
        customerPhone: '+79990000000',
        peopleCount: 2,
        comment: 'Хочу утром',
        sourcePage: '/excursions/phi-phi-dream-day',
      }),
    })
    const createLeadBody = await createLead.json()

    expect(createLead.status).toBe(201)
    expect(createLeadBody.lead).toMatchObject({
      status: 'new',
      source: 'website',
      excursionId: excursion.id,
      excursionTitle: 'Острова Пхи-Пхи: день как в мечте',
      contactChannel: null,
      priceRub: 3900,
      priceThb: 1500,
      commissionThb: 100,
      commissionTotal: 200,
    })

    const historyCount = await prisma.leadStatusHistory.count({
      where: { leadId: createLeadBody.lead.id },
    })
    expect(historyCount).toBe(1)

    const updateContactChannel = await app.request(
      `/api/catalog/leads/${createLeadBody.lead.id}/contact-channel`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactChannel: 'whatsapp' }),
      },
    )
    const updateContactChannelBody = await updateContactChannel.json()

    expect(updateContactChannel.status).toBe(200)
    expect(updateContactChannelBody.lead.contactChannel).toBe('whatsapp')

    const storedLead = await prisma.lead.findUniqueOrThrow({
      where: { id: createLeadBody.lead.id },
    })
    expect(storedLead.contactChannel).toBe(LeadContactChannel.WHATSAPP)
  })

  test('notifies Telegram after customer selects contact channel post-submit', async () => {
    const { excursion } = await seedPublishedExcursion({
      partnerTelegramChatId: '123456',
    })
    const createLead = await app.request('/api/catalog/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        excursionId: excursion.id,
        customerName: 'Даниил',
        customerPhone: '+79990000000',
        customerTelegram: '@danil',
      }),
    })
    const createLeadBody = await createLead.json()
    const contactNotifications: LeadTelegramContactChannelUpdatedInput[] = []
    const catalog = new CatalogService(
      prisma,
      null,
      undefined,
      {
        notifyLeadCreated: async () => {},
        notifyLeadContactChannelUpdated: async (input) => {
          contactNotifications.push(input)
        },
        notifyLeadCustomerFollowUp: async () => {},
        notifyLeadStatusChanged: async () => {},
        notifyLeadProblemReported: async () => {},
        confirmPartnerLeadCallback: async () => {},
      } satisfies LeadTelegramNotifier,
    )

    const lead = await catalog.updateLeadContactChannel(createLeadBody.lead.id, {
      contactChannel: 'whatsapp',
    })

    expect(lead.contactChannel).toBe('whatsapp')
    expect(contactNotifications).toEqual([
      {
        lead: {
          id: createLeadBody.lead.id,
          publicNumber: createLeadBody.lead.publicNumber,
          excursionTitle: 'Острова Пхи-Пхи: день как в мечте',
          customerName: 'Даниил',
          customerPhone: '+79990000000',
          customerTelegram: '@danil',
          contactChannel: LeadContactChannel.WHATSAPP,
        },
        partner: {
          name: 'Marusya Travel',
          telegramUsername: null,
          telegramChatId: '123456',
        },
      },
    ])
  })

  test('keeps contact channel update when Telegram contact notification fails', async () => {
    const consoleError = spyOn(console, 'error').mockImplementation(() => {})
    const { excursion } = await seedPublishedExcursion({
      partnerTelegramChatId: '123456',
    })
    const createLead = await app.request('/api/catalog/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        excursionId: excursion.id,
        customerName: 'Даниил',
        customerPhone: '+79990000000',
      }),
    })
    const createLeadBody = await createLead.json()
    const catalog = new CatalogService(
      prisma,
      null,
      undefined,
      {
        notifyLeadCreated: async () => {},
        notifyLeadContactChannelUpdated: async () => {
          throw new Error('Telegram unavailable')
        },
        notifyLeadCustomerFollowUp: async () => {},
        notifyLeadStatusChanged: async () => {},
        notifyLeadProblemReported: async () => {},
        confirmPartnerLeadCallback: async () => {},
      } satisfies LeadTelegramNotifier,
    )

    try {
      const lead = await catalog.updateLeadContactChannel(createLeadBody.lead.id, {
        contactChannel: 'max',
      })

      expect(lead.contactChannel).toBe('max')
      const storedLead = await prisma.lead.findUniqueOrThrow({
        where: { id: createLeadBody.lead.id },
      })
      expect(storedLead.contactChannel).toBe(LeadContactChannel.MAX)
      expect(consoleError).toHaveBeenCalledWith(
        'Telegram lead contact channel notification failed',
        {
          leadId: createLeadBody.lead.id,
          message: 'Telegram unavailable',
        },
      )
    } finally {
      consoleError.mockRestore()
    }
  })

  test('updates customer follow-up details from the public lead flow', async () => {
    const { excursion } = await seedPublishedExcursion()
    const createLead = await app.request('/api/catalog/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        excursionId: excursion.id,
        customerName: 'Даниил',
        customerPhone: '+79990000000',
      }),
    })
    const createLeadBody = await createLead.json()

    const followUp = await app.request(
      `/api/catalog/leads/${createLeadBody.lead.id}/follow-up`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestedDate: '2026-07-12',
          comment: 'Подойдут 12 или 13 июля, утром',
          answers: [
            {
              questionKey: 'desired_dates',
              questionPrompt: 'Какие даты вам удобны?',
              answer: '12 или 13 июля',
              sortOrder: 10,
            },
          ],
        }),
      },
    )
    const followUpBody = await followUp.json()

    expect(followUp.status).toBe(200)
    expect(followUpBody.lead).toMatchObject({
      id: createLeadBody.lead.id,
      requestedDate: '2026-07-12T00:00:00.000Z',
      comment: 'Подойдут 12 или 13 июля, утром',
    })

    const storedLead = await prisma.lead.findUniqueOrThrow({
      where: { id: createLeadBody.lead.id },
    })
    expect(storedLead.requestedDate?.toISOString()).toBe('2026-07-12T00:00:00.000Z')
    expect(storedLead.comment).toBe('Подойдут 12 или 13 июля, утром')
    const storedAnswers = await prisma.leadFollowUpAnswer.findMany({
      where: { leadId: createLeadBody.lead.id },
      orderBy: { sortOrder: 'asc' },
    })
    expect(storedAnswers).toHaveLength(1)
    expect(storedAnswers[0]).toMatchObject({
      questionKey: 'desired_dates',
      questionPrompt: 'Какие даты вам удобны?',
      answer: '12 или 13 июля',
      sortOrder: 10,
    })
  })

  test('returns customer follow-up question flow with passport preparation last', async () => {
    const { excursion } = await seedPublishedExcursion({
      excursionTitle: 'Квадроциклы',
    })
    const createLead = await app.request('/api/catalog/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        excursionId: excursion.id,
        customerName: 'Даниил',
        customerPhone: '+79990000000',
      }),
    })
    const createLeadBody = await createLead.json()

    const flow = await app.request(`/api/catalog/leads/${createLeadBody.lead.id}/follow-up-flow`)
    const flowBody = await flow.json()

    expect(flow.status).toBe(200)
    expect(flowBody).toMatchObject({
      leadId: createLeadBody.lead.id,
      publicNumber: createLeadBody.lead.publicNumber,
      serviceType: 'excursion',
      serviceTitle: 'Квадроциклы',
      finalMessage: 'Все отлично, в ближайшее время менеджер с вами свяжется.',
    })
    expect(flowBody.questions.at(-1)).toMatchObject({
      key: 'prepare_passport',
      kind: 'instruction',
      placeholder: null,
    })
    expect(flowBody.questions.at(-1).prompt).toContain('подготовьте паспорт')
  })

  test('returns service-specific customer follow-up questions for bike rental leads', async () => {
    const { partner } = await seedPublishedExcursion()
    const lead = await prisma.lead.create({
      data: {
        publicNumber: 'PG-20260702-BIKEFLOW',
        source: LeadSource.ADMIN,
        serviceType: LeadServiceType.BIKE_RENTAL,
        customerName: 'Даниил',
        customerPhone: '+79990000000',
        excursionTitle: 'Аренда байков',
        partnerId: partner.id,
      },
    })

    const flow = await app.request(`/api/catalog/leads/${lead.id}/follow-up-flow`)
    const flowBody = await flow.json()

    expect(flow.status).toBe(200)
    expect(flowBody).toMatchObject({
      leadId: lead.id,
      serviceType: 'bike_rental',
      serviceTitle: 'Аренда байков',
    })
    expect(flowBody.questions.map((question: { key: string }) => question.key)).toEqual([
      'desired_dates',
      'rental_duration',
      'bike_preference',
      'pickup_location',
      'service_details',
      'prepare_passport',
    ])
    expect(flowBody.questions[2]).toMatchObject({
      key: 'bike_preference',
      prompt: 'Какой байк вам интересен?',
    })
    expect(flowBody.questions.at(-1)).toMatchObject({
      key: 'prepare_passport',
      kind: 'instruction',
    })
  })

  test('notifies admin when customer adds follow-up details', async () => {
    const { excursion } = await seedPublishedExcursion()
    const createLead = await app.request('/api/catalog/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        excursionId: excursion.id,
        customerName: 'Даниил',
        customerPhone: '+79990000000',
        customerTelegram: '@danil',
      }),
    })
    const createLeadBody = await createLead.json()
    const followUpNotifications: LeadTelegramCustomerFollowUpInput[] = []
    const catalog = new CatalogService(
      prisma,
      null,
      undefined,
      {
        notifyLeadCreated: async () => {},
        notifyLeadCustomerFollowUp: async (input) => {
          followUpNotifications.push(input)
        },
        notifyLeadStatusChanged: async () => {},
        notifyLeadProblemReported: async () => {},
        confirmPartnerLeadCallback: async () => {},
      } satisfies LeadTelegramNotifier,
    )

    const lead = await catalog.updateLeadFollowUp(createLeadBody.lead.id, {
      requestedDate: '2026-07-12',
      comment: 'Подойдут 12 или 13 июля, утром',
    })

    expect(lead.comment).toBe('Подойдут 12 или 13 июля, утром')
    expect(followUpNotifications).toHaveLength(1)
    expect(followUpNotifications[0]).toMatchObject({
      lead: {
        id: createLeadBody.lead.id,
        publicNumber: createLeadBody.lead.publicNumber,
        excursionTitle: 'Острова Пхи-Пхи: день как в мечте',
        customerName: 'Даниил',
        customerPhone: '+79990000000',
        customerTelegram: '@danil',
        comment: 'Подойдут 12 или 13 июля, утром',
      },
    })
    expect(followUpNotifications[0]?.lead.requestedDate?.toISOString()).toBe(
      '2026-07-12T00:00:00.000Z',
    )
  })

  test('keeps customer follow-up details when Telegram notification fails', async () => {
    const consoleError = spyOn(console, 'error').mockImplementation(() => {})
    const { excursion } = await seedPublishedExcursion()
    const createLead = await app.request('/api/catalog/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        excursionId: excursion.id,
        customerName: 'Даниил',
        customerPhone: '+79990000000',
      }),
    })
    const createLeadBody = await createLead.json()
    const catalog = new CatalogService(
      prisma,
      null,
      undefined,
      {
        notifyLeadCreated: async () => {},
        notifyLeadCustomerFollowUp: async () => {
          throw new Error('Telegram unavailable')
        },
        notifyLeadStatusChanged: async () => {},
        notifyLeadProblemReported: async () => {},
        confirmPartnerLeadCallback: async () => {},
      } satisfies LeadTelegramNotifier,
    )

    try {
      const lead = await catalog.updateLeadFollowUp(createLeadBody.lead.id, {
        requestedDate: undefined,
        comment: 'Можно в любые даты после 15 июля',
      })

      expect(lead.comment).toBe('Можно в любые даты после 15 июля')
      const storedLead = await prisma.lead.findUniqueOrThrow({
        where: { id: createLeadBody.lead.id },
      })
      expect(storedLead.comment).toBe('Можно в любые даты после 15 июля')
      expect(consoleError).toHaveBeenCalledWith('Telegram lead follow-up notification failed', {
        leadId: createLeadBody.lead.id,
        message: 'Telegram unavailable',
      })
    } finally {
      consoleError.mockRestore()
    }
  })

  test('does not expose hidden excursions or accept leads for them', async () => {
    const { excursion } = await seedPublishedExcursion({ status: ExcursionStatus.HIDDEN })

    const detail = await app.request('/api/catalog/excursions/phi-phi-dream-day')
    expect(detail.status).toBe(404)

    const createLead = await app.request('/api/catalog/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        excursionId: excursion.id,
        customerName: 'Даниил',
        customerPhone: '+79990000000',
      }),
    })
    expect(createLead.status).toBe(404)
  })

  test('accepts partner Telegram callbacks and records lead status history', async () => {
    const { excursion, partner } = await seedPublishedExcursion({
      partnerTelegramChatId: '123456',
    })
    const createLead = await app.request('/api/catalog/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        excursionId: excursion.id,
        customerName: 'Даниил',
        customerPhone: '+79990000000',
      }),
    })
    const createLeadBody = await createLead.json()

    const wrongPartner = await app.request('/api/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'telegram-secret',
      },
      body: JSON.stringify(telegramCallbackUpdate({
        data: `lead:${createLeadBody.lead.id}:accept`,
        fromId: 999,
      })),
    })
    expect(wrongPartner.status).toBe(403)

    const accept = await app.request('/api/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'telegram-secret',
      },
      body: JSON.stringify(telegramCallbackUpdate({
        data: `lead:${createLeadBody.lead.id}:accept`,
        fromId: 123456,
      })),
    })
    const acceptBody = await accept.json()

    expect(accept.status).toBe(200)
    expect(acceptBody.result).toMatchObject({
      leadId: createLeadBody.lead.id,
      status: 'accepted',
      changed: true,
    })

    const storedLead = await prisma.lead.findUniqueOrThrow({
      where: { id: createLeadBody.lead.id },
    })
    expect(storedLead.status).toBe(LeadStatus.ACCEPTED)

    const history = await prisma.leadStatusHistory.findMany({
      where: { leadId: createLeadBody.lead.id },
      orderBy: { createdAt: 'asc' },
    })
    expect(history).toHaveLength(2)
    expect(history[1]).toMatchObject({
      fromStatus: LeadStatus.NEW,
      toStatus: LeadStatus.ACCEPTED,
      actorType: LeadActorType.PARTNER,
      actorId: partner.id,
    })
  })

  test('asks for a Telegram decline reason before declining a lead', async () => {
    const { excursion, partner } = await seedPublishedExcursion({
      partnerTelegramChatId: '123456',
    })
    const createLead = await app.request('/api/catalog/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        excursionId: excursion.id,
        customerName: 'Даниил',
        customerPhone: '+79990000000',
      }),
    })
    const createLeadBody = await createLead.json()

    const prompt = await app.request('/api/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'telegram-secret',
      },
      body: JSON.stringify(telegramCallbackUpdate({
        data: `lead:${createLeadBody.lead.id}:decline`,
        fromId: 123456,
      })),
    })
    const promptBody = await prompt.json()

    expect(prompt.status).toBe(200)
    expect(promptBody.result).toMatchObject({
      leadId: createLeadBody.lead.id,
      status: 'new',
      changed: false,
      declinePrompt: true,
    })
    const promptedLead = await prisma.lead.findUniqueOrThrow({
      where: { id: createLeadBody.lead.id },
    })
    expect(promptedLead).toMatchObject({
      status: LeadStatus.NEW,
      partnerNote: null,
    })

    const decline = await app.request('/api/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'telegram-secret',
      },
      body: JSON.stringify(telegramCallbackUpdate({
        data: `lead:${createLeadBody.lead.id}:decline:spam`,
        fromId: 123456,
      })),
    })
    const declineBody = await decline.json()

    expect(decline.status).toBe(200)
    expect(declineBody.result).toMatchObject({
      leadId: createLeadBody.lead.id,
      status: 'declined',
      changed: true,
      declineNote: 'Спам',
    })

    const storedLead = await prisma.lead.findUniqueOrThrow({
      where: { id: createLeadBody.lead.id },
    })
    expect(storedLead).toMatchObject({
      status: LeadStatus.DECLINED,
      partnerNote: 'Спам',
    })

    const history = await prisma.leadStatusHistory.findMany({
      where: { leadId: createLeadBody.lead.id },
      orderBy: { createdAt: 'asc' },
    })
    expect(history).toHaveLength(2)
    expect(history[1]).toMatchObject({
      fromStatus: LeadStatus.NEW,
      toStatus: LeadStatus.DECLINED,
      actorType: LeadActorType.PARTNER,
      actorId: partner.id,
      comment: 'Lead declined from Telegram partner callback: Спам.',
    })
  })

  test('uses the next Telegram text message as a custom decline reason', async () => {
    const { excursion, partner } = await seedPublishedExcursion({
      partnerTelegramChatId: '123456',
    })
    const createLead = await app.request('/api/catalog/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        excursionId: excursion.id,
        customerName: 'Даниил',
        customerPhone: '+79990000000',
      }),
    })
    const createLeadBody = await createLead.json()

    const prompt = await app.request('/api/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'telegram-secret',
      },
      body: JSON.stringify(telegramCallbackUpdate({
        data: `lead:${createLeadBody.lead.id}:decline:other`,
        fromId: 123456,
      })),
    })
    const promptBody = await prompt.json()

    expect(prompt.status).toBe(200)
    expect(promptBody.result).toMatchObject({
      leadId: createLeadBody.lead.id,
      status: 'new',
      changed: false,
      customReasonPrompt: true,
      customReasonAction: 'decline',
    })

    const promptedContact = await prisma.telegramContact.findUniqueOrThrow({
      where: { chatId: '123456' },
    })
    expect(promptedContact).toMatchObject({
      pendingReasonLeadId: createLeadBody.lead.id,
      pendingReasonAction: 'decline',
      pendingReasonMessageId: 10,
    })

    const customReason = 'Клиент просит дату, на которую нет мест'
    const decline = await app.request('/api/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'telegram-secret',
      },
      body: JSON.stringify(telegramMessageUpdate({
        text: customReason,
        fromId: 123456,
      })),
    })
    const declineBody = await decline.json()

    expect(decline.status).toBe(200)
    expect(declineBody.result).toMatchObject({
      leadId: createLeadBody.lead.id,
      status: 'declined',
      changed: true,
      declineNote: customReason,
    })

    const storedLead = await prisma.lead.findUniqueOrThrow({
      where: { id: createLeadBody.lead.id },
    })
    expect(storedLead).toMatchObject({
      status: LeadStatus.DECLINED,
      partnerNote: customReason,
    })

    const clearedContact = await prisma.telegramContact.findUniqueOrThrow({
      where: { chatId: '123456' },
    })
    expect(clearedContact.pendingReasonLeadId).toBeNull()
    expect(clearedContact.pendingReasonAction).toBeNull()
    expect(clearedContact.pendingReasonMessageId).toBeNull()

    const history = await prisma.leadStatusHistory.findMany({
      where: { leadId: createLeadBody.lead.id },
      orderBy: { createdAt: 'asc' },
    })
    expect(history).toHaveLength(2)
    expect(history[1]).toMatchObject({
      fromStatus: LeadStatus.NEW,
      toStatus: LeadStatus.DECLINED,
      actorType: LeadActorType.PARTNER,
      actorId: partner.id,
      comment: `Lead declined from Telegram partner callback: ${customReason}.`,
    })
  })

  test('notifies admin after a partner Telegram status callback is persisted', async () => {
    const { excursion } = await seedPublishedExcursion({
      partnerTelegramChatId: '123456',
    })
    const createLead = await app.request('/api/catalog/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        excursionId: excursion.id,
        customerName: 'Даниил',
        customerPhone: '+79990000000',
      }),
    })
    const createLeadBody = await createLead.json()
    const statusNotifications: LeadTelegramStatusChangedInput[] = []
    const catalog = new CatalogService(
      prisma,
      null,
      undefined,
      {
        notifyLeadCreated: async () => {},
        notifyLeadCustomerFollowUp: async () => {},
        notifyLeadStatusChanged: async (input) => {
          statusNotifications.push(input)
        },
        notifyLeadProblemReported: async () => {},
        confirmPartnerLeadCallback: async () => {},
      } satisfies LeadTelegramNotifier,
    )

    const result = await catalog.handleTelegramLeadCallback({
      leadId: createLeadBody.lead.id,
      action: 'decline',
      partnerTelegramChatId: '123456',
    })

    expect(result).toMatchObject({
      leadId: createLeadBody.lead.id,
      status: 'declined',
      changed: true,
    })
    expect(statusNotifications).toHaveLength(1)
    expect(statusNotifications[0]).toMatchObject({
      lead: {
        id: createLeadBody.lead.id,
        publicNumber: createLeadBody.lead.publicNumber,
        status: LeadStatus.DECLINED,
        excursionTitle: 'Острова Пхи-Пхи: день как в мечте',
      },
      partner: {
        name: 'Marusya Travel',
      },
    })
  })

  test('updates Google Sheets after a partner Telegram status callback is persisted', async () => {
    const { excursion, partner } = await seedPublishedExcursion({
      partnerTelegramChatId: '123456',
    })
    const createLead = await app.request('/api/catalog/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        excursionId: excursion.id,
        customerName: 'Даниил',
        customerPhone: '+79990000000',
      }),
    })
    const createLeadBody = await createLead.json()
    const sheetsUpdates: LeadSheetsStatusUpdateInput[] = []
    const catalog = new CatalogService(
      prisma,
      null,
      {
        appendLead: async () => {},
        syncLeadSnapshot: async () => ({ mode: 'disabled' }),
        updateLeadStatus: async (input) => {
          sheetsUpdates.push(input)
        },
        updateLeadPartnerNote: async () => {},
      } satisfies LeadSheetsSink,
      {
        notifyLeadCreated: async () => {},
        notifyLeadCustomerFollowUp: async () => {},
        notifyLeadStatusChanged: async () => {},
        notifyLeadProblemReported: async () => {},
        confirmPartnerLeadCallback: async () => {},
      } satisfies LeadTelegramNotifier,
    )

    const result = await catalog.handleTelegramLeadCallback({
      leadId: createLeadBody.lead.id,
      action: 'accept',
      partnerTelegramChatId: '123456',
    })

    expect(result).toMatchObject({
      leadId: createLeadBody.lead.id,
      status: 'accepted',
      changed: true,
    })
    expect(sheetsUpdates).toHaveLength(1)
    expect(sheetsUpdates[0]).toMatchObject({
      leadId: createLeadBody.lead.id,
      status: LeadStatus.ACCEPTED,
      actorType: 'partner',
      actorId: partner.id,
    })
    expect(sheetsUpdates[0].updatedAt).toBeInstanceOf(Date)
    expect(sheetsUpdates[0].changedAt).toBeInstanceOf(Date)
  })

  test('updates test leads from partner Telegram callbacks without Google Sheets sync', async () => {
    const { partner } = await seedPublishedExcursion({
      partnerTelegramChatId: '123456',
    })
    const testLead = await prisma.lead.create({
      data: {
        publicNumber: 'TEST-20260702-CALLBACK',
        source: LeadSource.ADMIN,
        isTest: true,
        serviceType: LeadServiceType.EXCURSION,
        status: LeadStatus.NEW,
        customerName: 'Тестовый клиент Phuket Go',
        customerPhone: '+66000000000',
        customerTelegram: '@test_customer',
        contactChannel: LeadContactChannel.TELEGRAM,
        peopleCount: 2,
        comment: 'Проверка кнопок менеджера',
        excursionTitle: 'Тестовая заявка Telegram',
        partnerId: partner.id,
        commissionThb: partner.defaultCommissionThb,
        commissionTotal: partner.defaultCommissionThb * 2,
      },
    })
    const sheetsUpdates: LeadSheetsStatusUpdateInput[] = []
    const statusNotifications: LeadTelegramStatusChangedInput[] = []
    const catalog = new CatalogService(
      prisma,
      null,
      {
        appendLead: async () => {},
        syncLeadSnapshot: async () => ({ mode: 'disabled' }),
        updateLeadStatus: async (input) => {
          sheetsUpdates.push(input)
        },
        updateLeadPartnerNote: async () => {},
      } satisfies LeadSheetsSink,
      {
        notifyLeadCreated: async () => {},
        notifyLeadCustomerFollowUp: async () => {},
        notifyLeadStatusChanged: async (input) => {
          statusNotifications.push(input)
        },
        notifyLeadProblemReported: async () => {},
        confirmPartnerLeadCallback: async () => {},
      } satisfies LeadTelegramNotifier,
    )

    const accept = await catalog.handleTelegramLeadCallback({
      leadId: testLead.id,
      action: 'accept',
      partnerTelegramChatId: '123456',
    })
    const paid = await catalog.handleTelegramLeadCallback({
      leadId: testLead.id,
      action: 'paid',
      partnerTelegramChatId: '123456',
    })

    expect(accept).toMatchObject({
      leadId: testLead.id,
      status: 'accepted',
      changed: true,
    })
    expect(paid).toMatchObject({
      leadId: testLead.id,
      status: 'paid',
      changed: true,
    })
    expect(sheetsUpdates).toHaveLength(0)
    expect(statusNotifications).toHaveLength(2)
    expect(statusNotifications[0]).toMatchObject({
      lead: {
        id: testLead.id,
        publicNumber: 'TEST-20260702-CALLBACK',
        isTest: true,
        status: LeadStatus.ACCEPTED,
      },
    })
    expect(statusNotifications[1]).toMatchObject({
      lead: {
        id: testLead.id,
        isTest: true,
        status: LeadStatus.PAID,
      },
    })

    const storedLead = await prisma.lead.findUniqueOrThrow({
      where: { id: testLead.id },
    })
    expect(storedLead.status).toBe(LeadStatus.PAID)

    const history = await prisma.leadStatusHistory.findMany({
      where: { leadId: testLead.id },
      orderBy: { createdAt: 'asc' },
    })
    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({
      fromStatus: LeadStatus.NEW,
      toStatus: LeadStatus.ACCEPTED,
      actorType: LeadActorType.PARTNER,
      actorId: partner.id,
    })
    expect(history[1]).toMatchObject({
      fromStatus: LeadStatus.ACCEPTED,
      toStatus: LeadStatus.PAID,
      actorType: LeadActorType.PARTNER,
      actorId: partner.id,
    })
  })

  test('marks an accepted lead as paid from partner Telegram callback', async () => {
    const { excursion, partner } = await seedPublishedExcursion({
      partnerTelegramChatId: '123456',
    })
    const createLead = await app.request('/api/catalog/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        excursionId: excursion.id,
        customerName: 'Даниил',
        customerPhone: '+79990000000',
      }),
    })
    const createLeadBody = await createLead.json()
    const sheetsUpdates: LeadSheetsStatusUpdateInput[] = []
    const statusNotifications: LeadTelegramStatusChangedInput[] = []
    const catalog = new CatalogService(
      prisma,
      null,
      {
        appendLead: async () => {},
        syncLeadSnapshot: async () => ({ mode: 'disabled' }),
        updateLeadStatus: async (input) => {
          sheetsUpdates.push(input)
        },
        updateLeadPartnerNote: async () => {},
      } satisfies LeadSheetsSink,
      {
        notifyLeadCreated: async () => {},
        notifyLeadCustomerFollowUp: async () => {},
        notifyLeadStatusChanged: async (input) => {
          statusNotifications.push(input)
        },
        notifyLeadProblemReported: async () => {},
        confirmPartnerLeadCallback: async () => {},
      } satisfies LeadTelegramNotifier,
    )

    await catalog.handleTelegramLeadCallback({
      leadId: createLeadBody.lead.id,
      action: 'accept',
      partnerTelegramChatId: '123456',
    })
    const paid = await catalog.handleTelegramLeadCallback({
      leadId: createLeadBody.lead.id,
      action: 'paid',
      partnerTelegramChatId: '123456',
    })

    expect(paid).toMatchObject({
      leadId: createLeadBody.lead.id,
      status: 'paid',
      changed: true,
    })

    const storedLead = await prisma.lead.findUniqueOrThrow({
      where: { id: createLeadBody.lead.id },
    })
    expect(storedLead.status).toBe(LeadStatus.PAID)

    const history = await prisma.leadStatusHistory.findMany({
      where: { leadId: createLeadBody.lead.id },
      orderBy: { createdAt: 'asc' },
    })
    expect(history).toHaveLength(3)
    expect(history[2]).toMatchObject({
      fromStatus: LeadStatus.ACCEPTED,
      toStatus: LeadStatus.PAID,
      actorType: LeadActorType.PARTNER,
      actorId: partner.id,
    })
    expect(sheetsUpdates[1]).toMatchObject({
      leadId: createLeadBody.lead.id,
      status: LeadStatus.PAID,
      actorType: 'partner',
      actorId: partner.id,
    })
    expect(statusNotifications[1]).toMatchObject({
      lead: {
        id: createLeadBody.lead.id,
        status: LeadStatus.PAID,
      },
      partner: {
        name: 'Marusya Travel',
      },
    })
  })

  test('rejects paid callback before a lead is accepted', async () => {
    const { excursion } = await seedPublishedExcursion({
      partnerTelegramChatId: '123456',
    })
    const createLead = await app.request('/api/catalog/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        excursionId: excursion.id,
        customerName: 'Даниил',
        customerPhone: '+79990000000',
      }),
    })
    const createLeadBody = await createLead.json()

    const paid = await app.request('/api/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'telegram-secret',
      },
      body: JSON.stringify(telegramCallbackUpdate({
        data: `lead:${createLeadBody.lead.id}:paid`,
        fromId: 123456,
      })),
    })
    const paidBody = await paid.json()

    expect(paid.status).toBe(409)
    expect(paidBody.error.code).toBe('CONFLICT')
  })

  test('saves partner problem note from Telegram callback and notifies admin', async () => {
    const { excursion, partner } = await seedPublishedExcursion({
      partnerTelegramChatId: '123456',
    })
    const createLead = await app.request('/api/catalog/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        excursionId: excursion.id,
        customerName: 'Даниил',
        customerPhone: '+79990000000',
      }),
    })
    const createLeadBody = await createLead.json()
    const sheetsPartnerNotes: LeadSheetsPartnerNoteUpdateInput[] = []
    const problemNotifications: LeadTelegramProblemReportedInput[] = []
    const catalog = new CatalogService(
      prisma,
      null,
      {
        appendLead: async () => {},
        syncLeadSnapshot: async () => ({ mode: 'disabled' }),
        updateLeadStatus: async () => {},
        updateLeadPartnerNote: async (input) => {
          sheetsPartnerNotes.push(input)
        },
      } satisfies LeadSheetsSink,
      {
        notifyLeadCreated: async () => {},
        notifyLeadCustomerFollowUp: async () => {},
        notifyLeadStatusChanged: async () => {},
        notifyLeadProblemReported: async (input) => {
          problemNotifications.push(input)
        },
        confirmPartnerLeadCallback: async () => {},
      } satisfies LeadTelegramNotifier,
    )

    await catalog.handleTelegramLeadCallback({
      leadId: createLeadBody.lead.id,
      action: 'accept',
      partnerTelegramChatId: '123456',
    })
    const prompt = await catalog.handleTelegramLeadProblemPrompt({
      leadId: createLeadBody.lead.id,
      partnerTelegramChatId: '123456',
    })
    const problem = await catalog.handleTelegramLeadProblemReason({
      leadId: createLeadBody.lead.id,
      reason: 'no_response',
      partnerTelegramChatId: '123456',
    })

    expect(prompt).toMatchObject({
      leadId: createLeadBody.lead.id,
      status: 'accepted',
      changed: false,
      problemPrompt: true,
    })
    expect(problem).toMatchObject({
      leadId: createLeadBody.lead.id,
      status: 'accepted',
      changed: false,
      problemNote: 'Клиент не отвечает',
    })

    const storedLead = await prisma.lead.findUniqueOrThrow({
      where: { id: createLeadBody.lead.id },
    })
    expect(storedLead.status).toBe(LeadStatus.ACCEPTED)
    expect(storedLead.partnerNote).toBe('Клиент не отвечает')

    const history = await prisma.leadStatusHistory.findMany({
      where: { leadId: createLeadBody.lead.id },
      orderBy: { createdAt: 'asc' },
    })
    expect(history).toHaveLength(3)
    expect(history[2]).toMatchObject({
      fromStatus: LeadStatus.ACCEPTED,
      toStatus: LeadStatus.ACCEPTED,
      actorType: LeadActorType.PARTNER,
      actorId: partner.id,
      comment: 'Partner reported problem: Клиент не отвечает',
    })
    expect(sheetsPartnerNotes).toHaveLength(1)
    expect(sheetsPartnerNotes[0]).toMatchObject({
      leadId: createLeadBody.lead.id,
      partnerNote: 'Клиент не отвечает',
      actorType: 'partner',
      actorId: partner.id,
    })
    expect(problemNotifications).toHaveLength(1)
    expect(problemNotifications[0]).toMatchObject({
      lead: {
        id: createLeadBody.lead.id,
        status: LeadStatus.ACCEPTED,
        partnerNote: 'Клиент не отвечает',
      },
      partner: {
        name: 'Marusya Travel',
      },
    })
  })

  test('rejects problem callback before a lead is accepted', async () => {
    const { excursion } = await seedPublishedExcursion({
      partnerTelegramChatId: '123456',
    })
    const createLead = await app.request('/api/catalog/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        excursionId: excursion.id,
        customerName: 'Даниил',
        customerPhone: '+79990000000',
      }),
    })
    const createLeadBody = await createLead.json()

    const problem = await app.request('/api/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'telegram-secret',
      },
      body: JSON.stringify(telegramCallbackUpdate({
        data: `lead:${createLeadBody.lead.id}:problem`,
        fromId: 123456,
      })),
    })
    const problemBody = await problem.json()

    expect(problem.status).toBe(409)
    expect(problemBody.error.code).toBe('CONFLICT')
  })

  test('continues admin notification when Google Sheets status sync fails', async () => {
    const consoleError = spyOn(console, 'error').mockImplementation(() => {})
    const { excursion } = await seedPublishedExcursion({
      partnerTelegramChatId: '123456',
    })
    const createLead = await app.request('/api/catalog/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        excursionId: excursion.id,
        customerName: 'Даниил',
        customerPhone: '+79990000000',
      }),
    })
    const createLeadBody = await createLead.json()
    const statusNotifications: LeadTelegramStatusChangedInput[] = []
    const catalog = new CatalogService(
      prisma,
      null,
      {
        appendLead: async () => {},
        syncLeadSnapshot: async () => ({ mode: 'disabled' }),
        updateLeadStatus: async () => {
          throw new Error('Sheets unavailable')
        },
        updateLeadPartnerNote: async () => {},
      } satisfies LeadSheetsSink,
      {
        notifyLeadCreated: async () => {},
        notifyLeadCustomerFollowUp: async () => {},
        notifyLeadStatusChanged: async (input) => {
          statusNotifications.push(input)
        },
        notifyLeadProblemReported: async () => {},
        confirmPartnerLeadCallback: async () => {},
      } satisfies LeadTelegramNotifier,
    )

    const result = await catalog.handleTelegramLeadCallback({
      leadId: createLeadBody.lead.id,
      action: 'decline',
      partnerTelegramChatId: '123456',
    })

    expect(result).toMatchObject({
      leadId: createLeadBody.lead.id,
      status: 'declined',
      changed: true,
    })
    expect(statusNotifications).toHaveLength(1)
    expect(consoleError).toHaveBeenCalledWith('Google Sheets lead status sync failed', {
      leadId: createLeadBody.lead.id,
      message: 'Sheets unavailable',
    })
    consoleError.mockRestore()
  })

  async function seedPublishedExcursion(
    options: {
      status?: ExcursionStatus
      partnerTelegramChatId?: string
      excursionTitle?: string
    } = {},
  ) {
    const partner = await prisma.partner.create({
      data: {
        name: 'Marusya Travel',
        defaultCommissionThb: 100,
        telegramChatId: options.partnerTelegramChatId,
      },
    })
    const category = await prisma.excursionCategory.create({
      data: {
        slug: 'islands',
        title: 'Острова',
      },
    })
    const excursion = await prisma.excursion.create({
      data: {
        slug: 'phi-phi-dream-day',
        title: options.excursionTitle ?? 'Острова Пхи-Пхи: день как в мечте',
        categoryId: category.id,
        shortEmotion: 'Бирюзовая вода, белый песок и ощущение настоящего отпуска.',
        description: 'День среди островов, ради которого хочется прилететь на Пхукет.',
        duration: '1 день',
        priceFromThb: 1500,
        priceFromRub: 3900,
        rubRate: '2.6',
        rateDate: new Date('2026-06-29T00:00:00.000Z'),
        currencyNote:
          'Цена рассчитана по текущему курсу. Из-за изменения курса рубля итоговая сумма может отличаться.',
        included: ['Трансфер', 'Питание'],
        notIncluded: [],
        takeWithYou: ['Купальник'],
        restrictions: [],
        insurance: 'Страховка включена.',
        partnerId: partner.id,
        status: options.status ?? ExcursionStatus.PUBLISHED,
        seoTitle: 'Пхи-Пхи с Пхукета',
        seoDescription: 'Экскурсия на Пхи-Пхи с Пхукета без оплаты на сайте.',
      },
    })

    await prisma.excursionPhoto.createMany({
      data: [
        {
          excursionId: excursion.id,
          url: '/media/excursions/phi-phi/final/carousel/gallery-01.webp',
          storageProvider: 'local',
          imageType: ExcursionPhotoImageType.REAL,
          alt: 'Бирюзовая бухта островов Пхи-Пхи',
          isCover: true,
          block: 'carousel',
          role: 'cover_emotion',
          sortOrder: 0,
        },
        {
          excursionId: excursion.id,
          url: '/media/excursions/phi-phi/final/carousel/gallery-02.webp',
          storageProvider: 'local',
          imageType: ExcursionPhotoImageType.REAL,
          alt: 'Лодка у островов Пхи-Пхи',
          block: 'carousel',
          role: 'boat',
          sortOrder: 1,
        },
      ],
    })

    return { partner, category, excursion }
  }

  function telegramCallbackUpdate(options: { data: string; fromId: number }) {
    return {
      update_id: 1,
      callback_query: {
        id: 'callback-1',
        data: options.data,
        from: {
          id: options.fromId,
        },
        message: {
          message_id: 10,
          chat: {
            id: options.fromId,
          },
        },
      },
    }
  }

  function telegramMessageUpdate(options: { text: string; fromId: number }) {
    return {
      update_id: 2,
      message: {
        message_id: 11,
        text: options.text,
        chat: {
          id: options.fromId,
          type: 'private',
        },
        from: {
          id: options.fromId,
          username: 'manager',
          first_name: 'Manager',
        },
      },
    }
  }

  async function setTripadvisorPreviewData({ excursionId }: { excursionId: string }) {
    await prisma.excursion.update({
      where: { id: excursionId },
      data: {
        tripadvisorLocationId: '123456',
        tripadvisorLocationName: 'Phi Phi Dreams',
        tripadvisorRating: 4.7,
        tripadvisorReviewCount: 128,
        tripadvisorWebUrl: 'https://www.tripadvisor.com/Attraction_Review',
        tripadvisorDisplayAllowed: true,
        tripadvisorMatchStatus: TripAdvisorMatchStatus.APPROVED,
        tripadvisorSyncStatus: TripAdvisorSyncStatus.SUCCESS,
      },
    })
  }
})
