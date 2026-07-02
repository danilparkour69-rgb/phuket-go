import { describe, expect, test } from 'bun:test'

import {
  adminCreateLeadRequestSchema,
  adminLeadAdminNoteRequestSchema,
  adminLeadBulkStatusActionRequestSchema,
  adminLeadBulkStatusActionResponseSchema,
  adminLeadDetailResponseSchema,
  adminLeadExportQuerySchema,
  adminLeadListQuerySchema,
  adminLeadListResponseSchema,
  adminLeadSheetsSyncResponseSchema,
  adminLeadStatusActionRequestSchema,
  adminBindPartnerTelegramContactRequestSchema,
  adminBindPartnerTelegramContactResponseSchema,
  adminPartnerListResponseSchema,
  adminServiceTypeListResponseSchema,
  adminTelegramContactListResponseSchema,
} from './admin'

describe('admin contracts', () => {
  test('normalizes lead list filters and pagination defaults', () => {
    expect(
      adminLeadListQuerySchema.parse({
        status: 'accepted',
        search: '  Даниил  ',
        partnerId: ' partner-1 ',
        createdFrom: '2026-06-30',
        requiresAttention: 'true',
      }),
    ).toMatchObject({
      status: 'accepted',
      search: 'Даниил',
      partnerId: 'partner-1',
      createdFrom: '2026-06-30',
      requiresAttention: true,
      sortBy: 'created_at',
      sortDirection: 'desc',
      limit: 50,
      offset: 0,
    })
  })

  test('normalizes lead export filters without pagination', () => {
    expect(
      adminLeadExportQuerySchema.parse({
        search: '  Marusya  ',
        requiresAttention: 'false',
        sortBy: 'updated_at',
        sortDirection: 'asc',
        limit: '10',
        offset: '20',
      }),
    ).toMatchObject({
      search: 'Marusya',
      requiresAttention: false,
      sortBy: 'updated_at',
      sortDirection: 'asc',
    })
  })

  test('normalizes optional attention filter', () => {
    expect(adminLeadListQuerySchema.parse({ requiresAttention: 'false' })).toMatchObject({
      requiresAttention: false,
    })
    expect(adminLeadListQuerySchema.parse({ requiresAttention: '' }).requiresAttention).toBeUndefined()
  })

  test('normalizes admin lead list sorting', () => {
    expect(
      adminLeadListQuerySchema.parse({
        sortBy: 'updated_at',
        sortDirection: 'asc',
      }),
    ).toMatchObject({
      sortBy: 'updated_at',
      sortDirection: 'asc',
      limit: 50,
      offset: 0,
    })
  })

  test('validates admin lead list response including partner note', () => {
    const response = adminLeadListResponseSchema.parse({
      leads: [
        {
          id: 'lead-1',
          publicNumber: 'PG-20260630-ABC12345',
          status: 'accepted',
          source: 'website',
          isTest: false,
          serviceType: 'excursion',
          sourcePage: '/excursions/phi-phi',
          excursionId: 'excursion-1',
          excursionTitle: 'Острова Пхи-Пхи',
          partnerId: 'partner-1',
          partnerName: 'Marusya Travel',
          partnerTelegram: '@partner',
          userId: null,
          customerName: 'Даниил',
          customerPhone: '+79990000000',
          customerTelegram: '@danil',
          contactChannel: 'telegram',
          requestedDate: null,
          peopleCount: 2,
          comment: 'Хочу утром',
          partnerNote: 'Клиент не отвечает',
          adminNote: null,
          adminNoteUpdatedAt: null,
          adminNoteUpdatedById: null,
          adminNoteUpdatedByEmail: null,
          adminNoteUpdatedByDisplayName: null,
          priceRub: 3900,
          priceThb: 1500,
          commissionThb: 100,
          commissionTotal: 200,
          createdAt: '2026-06-30T07:00:00.000Z',
          updatedAt: '2026-06-30T08:00:00.000Z',
        },
      ],
      summary: {
        total: 4,
        new: 2,
        requiresAttention: 1,
        waitingPartner: 1,
      },
      total: 1,
      limit: 50,
      offset: 0,
    })

    expect(response.leads[0].partnerNote).toBe('Клиент не отвечает')
    expect(response.summary.requiresAttention).toBe(1)
  })

  test('validates admin partner option list response', () => {
    expect(
      adminPartnerListResponseSchema.parse({
        partners: [
          {
            id: 'partner-1',
            name: ' Marusya Travel ',
            telegram: '@marusya',
            telegramChatId: '123456',
          },
          {
            id: 'partner-2',
            name: 'Other Travel',
            telegram: null,
            telegramChatId: null,
          },
        ],
      }),
    ).toEqual({
      partners: [
        {
          id: 'partner-1',
          name: 'Marusya Travel',
          telegram: '@marusya',
          telegramChatId: '123456',
        },
        {
          id: 'partner-2',
          name: 'Other Travel',
          telegram: null,
          telegramChatId: null,
        },
      ],
    })
  })

  test('validates Telegram contacts and partner binding payloads', () => {
    const contacts = adminTelegramContactListResponseSchema.parse({
      contacts: [
        {
          id: 'contact-1',
          chatId: '123456',
          telegramUserId: '123456',
          username: '@manager',
          displayName: 'Manager One',
          firstName: 'Manager',
          lastName: 'One',
          chatType: 'private',
          lastMessageText: '/start',
          lastSeenAt: '2026-07-02T08:00:00.000Z',
          linkedPartnerId: null,
          linkedPartnerName: null,
          createdAt: '2026-07-02T08:00:00.000Z',
          updatedAt: '2026-07-02T08:00:00.000Z',
        },
      ],
    })

    expect(contacts.contacts[0]).toMatchObject({
      chatId: '123456',
      username: '@manager',
      linkedPartnerId: null,
    })
    expect(
      adminBindPartnerTelegramContactRequestSchema.parse({
        contactId: ' contact-1 ',
      }),
    ).toEqual({ contactId: 'contact-1' })
    expect(
      adminBindPartnerTelegramContactResponseSchema.parse({
        partner: {
          id: 'partner-1',
          name: 'Marusya Travel',
          telegram: '@manager',
          telegramChatId: '123456',
        },
        contact: {
          ...contacts.contacts[0],
          linkedPartnerId: 'partner-1',
          linkedPartnerName: 'Marusya Travel',
        },
        testLead: {
          id: 'lead-test-1',
          publicNumber: 'TEST-20260702-ABC12345',
          status: 'new',
          source: 'admin',
          isTest: true,
          serviceType: 'excursion',
          sourcePage: null,
          excursionId: null,
          excursionTitle: 'Тестовая заявка Telegram',
          partnerId: 'partner-1',
          partnerName: 'Marusya Travel',
          partnerTelegram: '@manager',
          userId: null,
          customerName: 'Тестовый клиент Phuket Go',
          customerPhone: '+66000000000',
          customerTelegram: '@test_customer',
          contactChannel: 'telegram',
          requestedDate: null,
          peopleCount: 2,
          comment: 'Тестовая заявка',
          partnerNote: null,
          adminNote: null,
          adminNoteUpdatedAt: null,
          adminNoteUpdatedById: null,
          adminNoteUpdatedByEmail: null,
          adminNoteUpdatedByDisplayName: null,
          priceRub: null,
          priceThb: null,
          commissionThb: 100,
          commissionTotal: 200,
          createdAt: '2026-07-02T08:00:00.000Z',
          updatedAt: '2026-07-02T08:00:00.000Z',
        },
        testNotificationSent: true,
      }).partner,
    ).toMatchObject({
      telegram: '@manager',
      telegramChatId: '123456',
    })
  })

  test('validates admin service type option list response in stable order', () => {
    expect(
      adminServiceTypeListResponseSchema.parse({
        serviceTypes: [
          { value: 'excursion', label: 'Экскурсии', isActive: true, sortOrder: 10 },
          { value: 'bike_rental', label: 'Аренда байков', isActive: true, sortOrder: 20 },
          { value: 'visa', label: 'Визы', isActive: true, sortOrder: 30 },
          { value: 'border_run', label: 'Border run', isActive: true, sortOrder: 40 },
          { value: 'car_rental', label: 'Аренда машин', isActive: true, sortOrder: 50 },
          { value: 'money_exchange', label: 'Обмен денег', isActive: true, sortOrder: 60 },
        ],
      }),
    ).toEqual({
      serviceTypes: [
        { value: 'excursion', label: 'Экскурсии', isActive: true, sortOrder: 10 },
        { value: 'bike_rental', label: 'Аренда байков', isActive: true, sortOrder: 20 },
        { value: 'visa', label: 'Визы', isActive: true, sortOrder: 30 },
        { value: 'border_run', label: 'Border run', isActive: true, sortOrder: 40 },
        { value: 'car_rental', label: 'Аренда машин', isActive: true, sortOrder: 50 },
        { value: 'money_exchange', label: 'Обмен денег', isActive: true, sortOrder: 60 },
      ],
    })
  })

  test('normalizes admin-created non-excursion lead payload without excursion', () => {
    expect(
      adminCreateLeadRequestSchema.parse({
        serviceType: 'bike_rental',
        partnerId: ' partner-1 ',
        excursionId: '',
        customerName: ' Даниил ',
        customerPhone: ' +66990000000 ',
        customerTelegram: '',
        contactChannel: 'telegram',
        requestedDate: '',
        peopleCount: 1,
        comment: ' Нужен байк ',
      }),
    ).toEqual({
      serviceType: 'bike_rental',
      partnerId: 'partner-1',
      excursionId: undefined,
      customerName: 'Даниил',
      customerPhone: '+66990000000',
      customerTelegram: undefined,
      contactChannel: 'telegram',
      requestedDate: undefined,
      peopleCount: 1,
      comment: 'Нужен байк',
    })
  })

  test('requires excursion id for admin-created excursion lead', () => {
    expect(() =>
      adminCreateLeadRequestSchema.parse({
        serviceType: 'excursion',
        partnerId: 'partner-1',
        customerName: 'Даниил',
        customerPhone: '+66990000000',
      }),
    ).toThrow()

    expect(
      adminCreateLeadRequestSchema.parse({
        serviceType: 'excursion',
        partnerId: 'partner-1',
        excursionId: 'excursion-1',
        customerName: 'Даниил',
        customerPhone: '+66990000000',
      }),
    ).toMatchObject({
      serviceType: 'excursion',
      excursionId: 'excursion-1',
    })
  })

  test('normalizes admin lead status quick action payload', () => {
    expect(
      adminLeadStatusActionRequestSchema.parse({
        status: 'cancelled',
        adminNote: '  Вернули деньги  ',
        comment: '',
      }),
    ).toEqual({
      status: 'cancelled',
      adminNote: 'Вернули деньги',
      comment: undefined,
    })
  })

  test('normalizes admin lead bulk status payload and response', () => {
    expect(
      adminLeadBulkStatusActionRequestSchema.parse({
        leadIds: [' lead-1 ', 'lead-2'],
        status: 'waiting_partner',
        comment: '  Передали партнеру  ',
      }),
    ).toEqual({
      leadIds: ['lead-1', 'lead-2'],
      status: 'waiting_partner',
      comment: 'Передали партнеру',
    })

    expect(() =>
      adminLeadBulkStatusActionRequestSchema.parse({
        leadIds: [],
        status: 'accepted',
      }),
    ).toThrow()

    expect(
      adminLeadBulkStatusActionResponseSchema.parse({
        requestedCount: 2,
        updatedCount: 2,
        historyCount: 2,
      }),
    ).toEqual({
      requestedCount: 2,
      updatedCount: 2,
      historyCount: 2,
    })
  })

  test('validates admin lead Google Sheets sync response', () => {
    expect(
      adminLeadSheetsSyncResponseSchema.parse({
        synced: true,
        mode: 'updated',
      }),
    ).toEqual({
      synced: true,
      mode: 'updated',
    })

    expect(
      adminLeadSheetsSyncResponseSchema.parse({
        synced: false,
        mode: 'disabled',
      }),
    ).toEqual({
      synced: false,
      mode: 'disabled',
    })
  })

  test('normalizes admin lead note payload', () => {
    expect(
      adminLeadAdminNoteRequestSchema.parse({
        adminNote: '  Проверить оплату  ',
      }),
    ).toEqual({
      adminNote: 'Проверить оплату',
    })

    expect(adminLeadAdminNoteRequestSchema.parse({ adminNote: '' })).toEqual({
      adminNote: undefined,
    })
  })

  test('validates admin lead detail response with status history', () => {
    const response = adminLeadDetailResponseSchema.parse({
      lead: {
        id: 'lead-1',
        publicNumber: 'PG-20260630-ABC12345',
        status: 'cancelled',
        source: 'website',
        isTest: false,
        serviceType: 'excursion',
        sourcePage: '/excursions/phi-phi',
        excursionId: 'excursion-1',
        excursionTitle: 'Острова Пхи-Пхи',
        partnerId: 'partner-1',
        partnerName: 'Marusya Travel',
        partnerTelegram: '@partner',
        userId: null,
        customerName: 'Даниил',
        customerPhone: '+79990000000',
        customerTelegram: '@danil',
        contactChannel: 'telegram',
        requestedDate: null,
        peopleCount: 2,
        comment: 'Хочу утром',
        partnerNote: 'Клиент не отвечает',
        adminNote: 'Вернули деньги',
        adminNoteUpdatedAt: '2026-06-30T08:00:00.000Z',
        adminNoteUpdatedById: 'admin-1',
        adminNoteUpdatedByEmail: 'admin@example.com',
        adminNoteUpdatedByDisplayName: 'Admin',
        priceRub: 3900,
        priceThb: 1500,
        commissionThb: 100,
        commissionTotal: 200,
        createdAt: '2026-06-30T07:00:00.000Z',
        updatedAt: '2026-06-30T08:00:00.000Z',
      },
      statusHistory: [
        {
          id: 'history-1',
          fromStatus: null,
          toStatus: 'new',
          actorType: 'system',
          actorId: null,
          comment: 'Lead created',
          createdAt: '2026-06-30T07:00:00.000Z',
        },
        {
          id: 'history-2',
          fromStatus: 'accepted',
          toStatus: 'cancelled',
          actorType: 'admin',
          actorId: 'admin-1',
          comment: 'Клиент отменил',
          createdAt: '2026-06-30T08:00:00.000Z',
        },
      ],
      followUpAnswers: [
        {
          id: 'answer-1',
          questionKey: 'desired_dates',
          questionPrompt: 'Какие даты вам удобны?',
          answer: '12 или 13 июля',
          sortOrder: 10,
          createdAt: '2026-06-30T07:10:00.000Z',
          updatedAt: '2026-06-30T07:10:00.000Z',
        },
      ],
    })

    expect(response.statusHistory[1]).toMatchObject({
      fromStatus: 'accepted',
      toStatus: 'cancelled',
      actorType: 'admin',
    })
    expect(response.followUpAnswers[0]).toMatchObject({
      questionKey: 'desired_dates',
      answer: '12 или 13 июля',
    })
  })
})
