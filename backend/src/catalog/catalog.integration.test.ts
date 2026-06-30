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
  LeadStatus,
} from '../generated/prisma/client'
import type {
  LeadSheetsPartnerNoteUpdateInput,
  LeadSheetsSink,
  LeadSheetsStatusUpdateInput,
} from '../leads/google-sheets-sink'
import type {
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

  test('completes an accepted lead from partner Telegram callback', async () => {
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
    const complete = await catalog.handleTelegramLeadCallback({
      leadId: createLeadBody.lead.id,
      action: 'complete',
      partnerTelegramChatId: '123456',
    })

    expect(complete).toMatchObject({
      leadId: createLeadBody.lead.id,
      status: 'completed',
      changed: true,
    })

    const storedLead = await prisma.lead.findUniqueOrThrow({
      where: { id: createLeadBody.lead.id },
    })
    expect(storedLead.status).toBe(LeadStatus.COMPLETED)

    const history = await prisma.leadStatusHistory.findMany({
      where: { leadId: createLeadBody.lead.id },
      orderBy: { createdAt: 'asc' },
    })
    expect(history).toHaveLength(3)
    expect(history[2]).toMatchObject({
      fromStatus: LeadStatus.ACCEPTED,
      toStatus: LeadStatus.COMPLETED,
      actorType: LeadActorType.PARTNER,
      actorId: partner.id,
    })
    expect(sheetsUpdates[1]).toMatchObject({
      leadId: createLeadBody.lead.id,
      status: LeadStatus.COMPLETED,
      actorType: 'partner',
      actorId: partner.id,
    })
    expect(statusNotifications[1]).toMatchObject({
      lead: {
        id: createLeadBody.lead.id,
        status: LeadStatus.COMPLETED,
      },
      partner: {
        name: 'Marusya Travel',
      },
    })
  })

  test('rejects completed callback before a lead is accepted', async () => {
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

    const complete = await app.request('/api/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'telegram-secret',
      },
      body: JSON.stringify(telegramCallbackUpdate({
        data: `lead:${createLeadBody.lead.id}:complete`,
        fromId: 123456,
      })),
    })
    const completeBody = await complete.json()

    expect(complete.status).toBe(409)
    expect(completeBody.error.code).toBe('CONFLICT')
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
    options: { status?: ExcursionStatus; partnerTelegramChatId?: string } = {},
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
        title: 'Острова Пхи-Пхи: день как в мечте',
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
