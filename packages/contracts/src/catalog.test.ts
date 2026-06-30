import { describe, expect, test } from 'bun:test'

import {
  createLeadRequestSchema,
  excursionDetailSchema,
  leadContactChannelSchema,
  leadSchema,
  leadStatusSchema,
} from './index'

describe('catalog contracts', () => {
  test('validates public excursion detail shape', () => {
    expect(
      excursionDetailSchema.parse({
        id: 'excursion_1',
        slug: 'phi-phi',
        title: 'Острова Пхи-Пхи: день как в мечте',
        categorySlug: 'islands',
        shortEmotion: 'Бирюзовая вода, белый песок и ощущение настоящего отпуска.',
        description: 'День среди островов, ради которого хочется прилететь на Пхукет.',
        route: null,
        duration: '1 день',
        priceFromRub: 3900,
        priceFromThb: 1500,
        rubRate: 2.6,
        rateDate: '2026-06-29T00:00:00.000Z',
        currencyNote:
          'Цена рассчитана по текущему курсу. Из-за изменения курса рубля итоговая сумма может отличаться.',
        included: ['Трансфер', 'Питание'],
        notIncluded: [],
        takeWithYou: ['Купальник', 'Солнцезащитный крем'],
        restrictions: [],
        insurance: 'Страховка включена.',
        guideLanguageNote: null,
        cancellationPolicy: null,
        coverPhotoUrl: '/media/excursions/phi-phi/final/carousel/gallery-01.webp',
        carouselPhotoUrls: [
          '/media/excursions/phi-phi/final/carousel/gallery-01.webp',
        ],
        status: 'published',
        photos: [
          {
            id: 'photo_1',
            url: '/media/excursions/phi-phi/final/carousel/gallery-01.webp',
            storageProvider: 'local',
            imageType: 'real',
            alt: 'Бирюзовая бухта островов Пхи-Пхи',
            isCover: true,
            block: 'carousel',
            role: 'cover_emotion',
            sortOrder: 0,
            needsReview: false,
          },
        ],
      }),
    ).toMatchObject({
      slug: 'phi-phi',
      status: 'published',
      priceFromRub: 3900,
    })
  })

  test('normalizes lead request from public form', () => {
    expect(
      createLeadRequestSchema.parse({
        excursionId: 'excursion_1',
        customerName: ' Даниил ',
        customerPhone: ' +79990000000 ',
        customerTelegram: '',
        contactChannel: 'whatsapp',
        requestedDate: '2026-07-10',
        peopleCount: 2,
        comment: ' Хочу утром ',
        sourcePage: '/excursions/phi-phi',
      }),
    ).toEqual({
      excursionId: 'excursion_1',
      customerName: 'Даниил',
      customerPhone: '+79990000000',
      customerTelegram: undefined,
      contactChannel: 'whatsapp',
      requestedDate: '2026-07-10',
      peopleCount: 2,
      comment: 'Хочу утром',
      source: 'website',
      sourcePage: '/excursions/phi-phi',
    })
  })

  test('keeps requested date optional but rejects malformed dates', () => {
    expect(
      createLeadRequestSchema.parse({
        excursionId: 'excursion_1',
        customerName: 'Даниил',
        customerPhone: '+79990000000',
        requestedDate: '',
      }),
    ).toMatchObject({
      requestedDate: undefined,
    })

    expect(() =>
      createLeadRequestSchema.parse({
        excursionId: 'excursion_1',
        customerName: 'Даниил',
        customerPhone: '+79990000000',
        requestedDate: 'скоро',
      }),
    ).toThrow()
  })

  test('rejects lead requests without required customer fields', () => {
    expect(() =>
      createLeadRequestSchema.parse({
        excursionId: 'excursion_1',
        customerName: 'A',
        customerPhone: '',
      }),
    ).toThrow()
  })

  test('keeps stable lead statuses for admin, partner bot, and user history', () => {
    expect(leadContactChannelSchema.options).toEqual(['telegram', 'whatsapp', 'max'])

    expect(leadStatusSchema.options).toEqual([
      'new',
      'waiting_partner',
      'accepted',
      'declined',
      'completed',
      'cancelled',
    ])

    expect(
      leadSchema.parse({
        id: 'lead_1',
        publicNumber: 'PG-000001',
        status: 'new',
        source: 'website',
        excursionId: 'excursion_1',
        excursionTitle: 'Острова Пхи-Пхи: день как в мечте',
        partnerId: 'partner_1',
        userId: null,
        customerName: 'Даниил',
        customerPhone: '+79990000000',
        customerTelegram: null,
        contactChannel: 'whatsapp',
        requestedDate: null,
        peopleCount: 2,
        comment: null,
        priceRub: 3900,
        priceThb: 1500,
        commissionThb: 100,
        commissionTotal: 200,
        createdAt: '2026-06-29T00:00:00.000Z',
      }),
    ).toMatchObject({
      publicNumber: 'PG-000001',
      status: 'new',
      source: 'website',
      contactChannel: 'whatsapp',
      commissionTotal: 200,
    })
  })
})
