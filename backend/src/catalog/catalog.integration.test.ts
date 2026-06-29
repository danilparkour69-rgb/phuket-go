import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from '../app'
import { createPrisma } from '../db'
import type { AppEnv } from '../env'
import {
  ExcursionPhotoImageType,
  ExcursionStatus,
  TripAdvisorMatchStatus,
  TripAdvisorSyncStatus,
  LeadContactChannel,
} from '../generated/prisma/client'

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

  async function seedPublishedExcursion(
    options: { status?: ExcursionStatus } = {},
  ) {
    const partner = await prisma.partner.create({
      data: {
        name: 'Marusya Travel',
        defaultCommissionThb: 100,
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
