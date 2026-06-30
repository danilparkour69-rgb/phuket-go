import { describe, expect, test } from 'bun:test'

import {
  adminLeadAdminNoteRequestSchema,
  adminLeadBulkStatusActionRequestSchema,
  adminLeadBulkStatusActionResponseSchema,
  adminLeadDetailResponseSchema,
  adminLeadExportQuerySchema,
  adminLeadListQuerySchema,
  adminLeadListResponseSchema,
  adminLeadSheetsSyncResponseSchema,
  adminLeadStatusActionRequestSchema,
  adminPartnerListResponseSchema,
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
    ).toEqual({
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
    ).toEqual({
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
    ).toEqual({
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
          },
          {
            id: 'partner-2',
            name: 'Other Travel',
            telegram: null,
          },
        ],
      }),
    ).toEqual({
      partners: [
        {
          id: 'partner-1',
          name: 'Marusya Travel',
          telegram: '@marusya',
        },
        {
          id: 'partner-2',
          name: 'Other Travel',
          telegram: null,
        },
      ],
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
    })

    expect(response.statusHistory[1]).toMatchObject({
      fromStatus: 'accepted',
      toStatus: 'cancelled',
      actorType: 'admin',
    })
  })
})
