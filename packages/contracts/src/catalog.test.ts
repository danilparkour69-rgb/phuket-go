import { describe, expect, test } from 'bun:test'

import {
  createLeadRequestSchema,
  excursionDetailSchema,
  leadContactChannelSchema,
  leadSchema,
  leadServiceTypeSchema,
  leadStatusSchema,
  leadFollowUpFlowResponseSchema,
  leadFollowUpQuestionKeySchema,
  updateLeadFollowUpRequestSchema,
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

  test('normalizes lead follow-up details and requires at least one field', () => {
    expect(
      updateLeadFollowUpRequestSchema.parse({
        requestedDate: '2026-07-12',
        comment: ' Подойдут 12 или 13 июля, утром ',
      }),
    ).toEqual({
      requestedDate: '2026-07-12',
      comment: 'Подойдут 12 или 13 июля, утром',
    })

    expect(
      updateLeadFollowUpRequestSchema.parse({
        requestedDate: '',
        comment: ' Лучше после обеда ',
        answers: [
          {
            questionKey: 'desired_dates',
            questionPrompt: ' Какие даты вам удобны? ',
            answer: ' 12 или 13 июля ',
            sortOrder: 10,
          },
        ],
      }),
    ).toEqual({
      requestedDate: undefined,
      comment: 'Лучше после обеда',
      answers: [
        {
          questionKey: 'desired_dates',
          questionPrompt: 'Какие даты вам удобны?',
          answer: '12 или 13 июля',
          sortOrder: 10,
        },
      ],
    })

    expect(() => updateLeadFollowUpRequestSchema.parse({ requestedDate: '', comment: '' })).toThrow()
  })

  test('validates lead follow-up flow with passport preparation as the final instruction', () => {
    const response = leadFollowUpFlowResponseSchema.parse({
      leadId: 'lead_1',
      publicNumber: 'PG-000001',
      serviceType: 'excursion',
      serviceTitle: 'Квадроциклы',
      questions: [
        {
          key: 'desired_dates',
          kind: 'text',
          prompt: 'Какие даты вам удобны?',
          placeholder: 'Например: 12 или 13 июля, лучше утром',
          isRequired: false,
          sortOrder: 10,
        },
        {
          key: 'prepare_passport',
          kind: 'instruction',
          prompt: 'Пожалуйста, подготовьте паспорт. Он может понадобиться менеджеру для оформления.',
          placeholder: null,
          isRequired: false,
          sortOrder: 90,
        },
      ],
      finalMessage: 'Все отлично, в ближайшее время менеджер с вами свяжется.',
    })

    expect(response.questions.at(-1)).toMatchObject({
      key: 'prepare_passport',
      kind: 'instruction',
      placeholder: null,
    })
    expect(response.finalMessage).toContain('менеджер')
  })

  test('keeps stable follow-up question keys for service-specific flows', () => {
    expect(leadFollowUpQuestionKeySchema.options).toEqual([
      'desired_dates',
      'people_count',
      'hotel_or_area',
      'rental_duration',
      'bike_preference',
      'car_preference',
      'pickup_location',
      'visa_goal',
      'border_run_direction',
      'exchange_currency',
      'exchange_amount',
      'service_details',
      'prepare_passport',
    ])

    expect(
      updateLeadFollowUpRequestSchema.parse({
        answers: [
          {
            questionKey: 'bike_preference',
            questionPrompt: ' Какой байк вам интересен? ',
            answer: ' Honda PCX ',
            sortOrder: 30,
          },
        ],
      }),
    ).toMatchObject({
      answers: [
        {
          questionKey: 'bike_preference',
          questionPrompt: 'Какой байк вам интересен?',
          answer: 'Honda PCX',
          sortOrder: 30,
        },
      ],
    })
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
    expect(leadServiceTypeSchema.options).toEqual([
      'excursion',
      'bike_rental',
      'car_rental',
      'visa',
      'border_run',
      'money_exchange',
    ])

    expect(leadStatusSchema.options).toEqual([
      'new',
      'waiting_partner',
      'accepted',
      'paid',
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
        isTest: false,
        serviceType: 'excursion',
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
      isTest: false,
      serviceType: 'excursion',
      contactChannel: 'whatsapp',
      commissionTotal: 200,
    })
  })
})
