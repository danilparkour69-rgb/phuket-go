import { afterAll, beforeEach, describe, expect, test } from 'bun:test'

import { createApp } from '../app'
import { createPrisma } from '../db'
import type { AppEnv } from '../env'
import {
  ExcursionStatus,
  LeadActorType,
  LeadServiceType,
  LeadStatus,
} from '../generated/prisma/client'

const databaseUrl = process.env.TEST_DATABASE_URL

const maybeDescribe = databaseUrl ? describe : describe.skip

maybeDescribe('admin API integration', () => {
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
  }
  const prisma = createPrisma(databaseUrl!)
  const app = createApp({ env, prisma })

  beforeEach(async () => {
    await prisma.leadStatusHistory.deleteMany()
    await prisma.lead.deleteMany()
    await prisma.excursion.deleteMany()
    await prisma.excursionCategory.deleteMany()
    await prisma.partner.deleteMany()
    await prisma.authSession.deleteMany()
    await prisma.user.deleteMany()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  test('requires admin access for lead list', async () => {
    const nonAdminToken = await registerAccessToken('user@example.com')

    const noToken = await app.request('/api/admin/leads')
    expect(noToken.status).toBe(401)

    const forbidden = await app.request('/api/admin/leads', {
      headers: {
        Authorization: `Bearer ${nonAdminToken}`,
      },
    })
    const forbiddenBody = await forbidden.json()

    expect(forbidden.status).toBe(403)
    expect(forbiddenBody.error.code).toBe('FORBIDDEN')
  })

  test('lists partner options for admin filters', async () => {
    const adminToken = await registerAccessToken('partners-admin@example.com')
    await prisma.user.update({
      where: { email: 'partners-admin@example.com' },
      data: { isAdmin: true },
    })
    await prisma.partner.createMany({
      data: [
        {
          name: 'Zeta Travel',
        },
        {
          name: 'Alpha Travel',
          telegramUsername: '@alpha',
        },
      ],
    })

    const response = await app.request('/api/admin/partners', {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.partners).toEqual([
      expect.objectContaining({
        name: 'Alpha Travel',
        telegram: '@alpha',
      }),
      expect.objectContaining({
        name: 'Zeta Travel',
        telegram: null,
      }),
    ])
  })

  test('lists leads with status, partner, and created date filters', async () => {
    const adminToken = await registerAccessToken('admin@example.com')
    await prisma.user.update({
      where: { email: 'admin@example.com' },
      data: { isAdmin: true },
    })
    const { firstPartner, secondPartner, firstExcursion, secondExcursion } =
      await seedAdminLeadCatalog()
    await prisma.lead.createMany({
      data: [
        {
          publicNumber: 'PG-20260630-OLD',
          status: LeadStatus.NEW,
          customerName: 'Old',
          customerPhone: '+111',
          excursionId: secondExcursion.id,
          excursionTitle: secondExcursion.title,
          partnerId: secondPartner.id,
          commissionThb: 100,
          createdAt: new Date('2026-06-29T10:00:00.000Z'),
        },
        {
          publicNumber: 'PG-20260630-ACCEPTED',
          status: LeadStatus.ACCEPTED,
          serviceType: LeadServiceType.EXCURSION,
          customerName: 'Даниил',
          customerPhone: '+79990000000',
          customerTelegram: '@danil',
          peopleCount: 2,
          comment: 'Хочу утром',
          partnerNote: 'Клиент не отвечает',
          excursionId: firstExcursion.id,
          excursionTitle: firstExcursion.title,
          partnerId: firstPartner.id,
          priceRub: 3900,
          priceThb: 1500,
          commissionThb: 100,
          commissionTotal: 200,
          createdAt: new Date('2026-06-30T10:00:00.000Z'),
        },
        {
          publicNumber: 'PG-20260701-DECLINED',
          status: LeadStatus.DECLINED,
          customerName: 'Tomorrow',
          customerPhone: '+222',
          excursionId: firstExcursion.id,
          excursionTitle: firstExcursion.title,
          partnerId: firstPartner.id,
          commissionThb: 100,
          createdAt: new Date('2026-07-01T10:00:00.000Z'),
        },
      ],
    })

    const response = await app.request(
      `/api/admin/leads?status=accepted&serviceType=excursion&search=${encodeURIComponent('marusya')}&partnerId=${firstPartner.id}&createdFrom=2026-06-30&createdTo=2026-06-30`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.total).toBe(1)
    expect(body.limit).toBe(50)
    expect(body.offset).toBe(0)
    expect(body.leads).toHaveLength(1)
    expect(body.leads[0]).toMatchObject({
      publicNumber: 'PG-20260630-ACCEPTED',
      status: 'accepted',
      serviceType: 'excursion',
      partnerId: firstPartner.id,
      partnerName: 'Marusya Travel',
      partnerTelegram: '@marusya',
      customerName: 'Даниил',
      partnerNote: 'Клиент не отвечает',
      commissionTotal: 200,
    })

    const phoneSearchResponse = await app.request('/api/admin/leads?search=9990000000', {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    })
    const phoneSearchBody = await phoneSearchResponse.json()

    expect(phoneSearchResponse.status).toBe(200)
    expect(phoneSearchBody.total).toBe(1)
    expect(phoneSearchBody.leads[0]).toMatchObject({
      publicNumber: 'PG-20260630-ACCEPTED',
    })

    const createdAscResponse = await app.request('/api/admin/leads?sortBy=created_at&sortDirection=asc', {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    })
    const createdAscBody = await createdAscResponse.json()

    expect(createdAscResponse.status).toBe(200)
    expect(createdAscBody.leads.map((lead: { publicNumber: string }) => lead.publicNumber)).toEqual([
      'PG-20260630-OLD',
      'PG-20260630-ACCEPTED',
      'PG-20260701-DECLINED',
    ])

    await prisma.lead.update({
      where: { publicNumber: 'PG-20260630-OLD' },
      data: { adminNote: 'Touched for updated_at sort' },
    })

    const updatedDescResponse = await app.request('/api/admin/leads?sortBy=updated_at&sortDirection=desc', {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    })
    const updatedDescBody = await updatedDescResponse.json()

    expect(updatedDescResponse.status).toBe(200)
    expect(updatedDescBody.leads[0]).toMatchObject({
      publicNumber: 'PG-20260630-OLD',
      adminNote: 'Touched for updated_at sort',
    })
  })

  test('returns lead detail with chronological status history', async () => {
    const adminToken = await registerAccessToken('detail-admin@example.com')
    await prisma.user.update({
      where: { email: 'detail-admin@example.com' },
      data: { isAdmin: true },
    })
    const { firstPartner, firstExcursion } = await seedAdminLeadCatalog()
    const lead = await prisma.lead.create({
      data: {
        publicNumber: 'PG-20260630-DETAIL',
        status: LeadStatus.ACCEPTED,
        customerName: 'Даниил',
        customerPhone: '+79990000000',
        customerTelegram: '@danil',
        peopleCount: 2,
        comment: 'Хочу утром',
        partnerNote: 'Клиент не отвечает',
        excursionId: firstExcursion.id,
        excursionTitle: firstExcursion.title,
        partnerId: firstPartner.id,
        priceRub: 3900,
        priceThb: 1500,
        commissionThb: 100,
        commissionTotal: 200,
        createdAt: new Date('2026-06-30T10:00:00.000Z'),
      },
    })
    await prisma.leadStatusHistory.createMany({
      data: [
        {
          leadId: lead.id,
          fromStatus: null,
          toStatus: LeadStatus.NEW,
          actorType: LeadActorType.SYSTEM,
          comment: 'Lead created',
          createdAt: new Date('2026-06-30T10:00:00.000Z'),
        },
        {
          leadId: lead.id,
          fromStatus: LeadStatus.NEW,
          toStatus: LeadStatus.ACCEPTED,
          actorType: LeadActorType.PARTNER,
          comment: 'Partner accepted lead',
          createdAt: new Date('2026-06-30T10:05:00.000Z'),
        },
      ],
    })

    const response = await app.request(`/api/admin/leads/${lead.id}`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.lead).toMatchObject({
      id: lead.id,
      publicNumber: 'PG-20260630-DETAIL',
      status: 'accepted',
      partnerName: 'Marusya Travel',
      partnerNote: 'Клиент не отвечает',
      commissionTotal: 200,
    })
    expect(body.statusHistory.map((item: { toStatus: string }) => item.toStatus)).toEqual([
      'new',
      'accepted',
    ])
    expect(body.statusHistory[0]).toMatchObject({
      fromStatus: null,
      actorType: 'system',
      comment: 'Lead created',
    })
  })

  test('filters leads that require admin attention', async () => {
    const adminToken = await registerAccessToken('attention-admin@example.com')
    await prisma.user.update({
      where: { email: 'attention-admin@example.com' },
      data: { isAdmin: true },
    })
    const { firstPartner, firstExcursion } = await seedAdminLeadCatalog()
    const staleCreatedAt = new Date(Date.now() - 20 * 60 * 1000)
    const freshCreatedAt = new Date()

    await prisma.lead.createMany({
      data: [
        {
          publicNumber: 'PG-ATTENTION-NEW-OLD',
          status: LeadStatus.NEW,
          customerName: 'Old new',
          customerPhone: '+111',
          excursionId: firstExcursion.id,
          excursionTitle: firstExcursion.title,
          partnerId: firstPartner.id,
          commissionThb: 100,
          createdAt: staleCreatedAt,
        },
        {
          publicNumber: 'PG-ATTENTION-WAITING',
          status: LeadStatus.WAITING_PARTNER,
          customerName: 'Waiting',
          customerPhone: '+222',
          excursionId: firstExcursion.id,
          excursionTitle: firstExcursion.title,
          partnerId: firstPartner.id,
          commissionThb: 100,
          createdAt: staleCreatedAt,
        },
        {
          publicNumber: 'PG-ATTENTION-FRESH',
          status: LeadStatus.NEW,
          customerName: 'Fresh',
          customerPhone: '+333',
          excursionId: firstExcursion.id,
          excursionTitle: firstExcursion.title,
          partnerId: firstPartner.id,
          commissionThb: 100,
          createdAt: freshCreatedAt,
        },
        {
          publicNumber: 'PG-ATTENTION-ACCEPTED',
          status: LeadStatus.ACCEPTED,
          customerName: 'Accepted',
          customerPhone: '+444',
          excursionId: firstExcursion.id,
          excursionTitle: firstExcursion.title,
          partnerId: firstPartner.id,
          commissionThb: 100,
          createdAt: staleCreatedAt,
        },
      ],
    })

    const response = await app.request('/api/admin/leads?requiresAttention=true&sortDirection=asc', {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.summary).toEqual({
      total: 4,
      new: 2,
      requiresAttention: 2,
      waitingPartner: 1,
    })
    expect(body.leads.map((lead: { publicNumber: string }) => lead.publicNumber)).toEqual([
      'PG-ATTENTION-NEW-OLD',
      'PG-ATTENTION-WAITING',
    ])
  })

  test('exports filtered admin lead queue to CSV', async () => {
    const adminToken = await registerAccessToken('csv-admin@example.com')
    await prisma.user.update({
      where: { email: 'csv-admin@example.com' },
      data: { isAdmin: true },
    })
    const { firstPartner, secondPartner, firstExcursion, secondExcursion } =
      await seedAdminLeadCatalog()

    await prisma.lead.createMany({
      data: [
        {
          publicNumber: 'PG-CSV-SECOND',
          status: LeadStatus.NEW,
          customerName: 'CSV Two',
          customerPhone: '+222',
          comment: 'Без запятых',
          excursionId: secondExcursion.id,
          excursionTitle: secondExcursion.title,
          partnerId: secondPartner.id,
          commissionThb: 100,
          createdAt: new Date('2026-06-30T10:00:00.000Z'),
        },
        {
          publicNumber: 'PG-CSV-FIRST',
          status: LeadStatus.ACCEPTED,
          customerName: 'CSV One',
          customerPhone: '+111',
          customerTelegram: '@csv_one',
          peopleCount: 3,
          comment: 'Комментарий, "важно"',
          excursionId: firstExcursion.id,
          excursionTitle: firstExcursion.title,
          partnerId: firstPartner.id,
          commissionThb: 100,
          commissionTotal: 300,
          createdAt: new Date('2026-06-30T09:00:00.000Z'),
        },
      ],
    })

    const response = await app.request('/api/admin/leads/export.csv?search=marusya&sortDirection=asc', {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    })
    const csv = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/csv')
    expect(response.headers.get('content-disposition')).toMatch(/admin-leads-\d{4}-\d{2}-\d{2}\.csv/)
    expect(csv.split('\r\n')[0]).toBe(
      'lead_id,public_number,status,service_type,source,source_page,created_at,updated_at,customer_name,customer_phone,customer_telegram,contact_channel,requested_date,people_count,comment,excursion_id,excursion_title,partner_id,partner_name,partner_telegram,partner_note,admin_note,price_rub,price_thb,commission_thb,commission_total_thb',
    )
    expect(csv).toContain('PG-CSV-FIRST,accepted,excursion,website')
    expect(csv).toContain('PG-CSV-FIRST')
    expect(csv).not.toContain('PG-CSV-SECOND')
    expect(csv).toContain('"Комментарий, ""важно"""')
    expect(csv).toContain(',300\r\n')
  })

  test('manually syncs a lead to Google Sheets as disabled no-op when integration is off', async () => {
    const adminToken = await registerAccessToken('sheets-sync-admin@example.com')
    await prisma.user.update({
      where: { email: 'sheets-sync-admin@example.com' },
      data: { isAdmin: true },
    })
    const { firstPartner, firstExcursion } = await seedAdminLeadCatalog()
    const lead = await prisma.lead.create({
      data: {
        publicNumber: 'PG-20260630-SHEETS-SYNC',
        status: LeadStatus.NEW,
        customerName: 'Sheets Sync',
        customerPhone: '+79990000003',
        excursionId: firstExcursion.id,
        excursionTitle: firstExcursion.title,
        partnerId: firstPartner.id,
        commissionThb: 100,
      },
    })

    const response = await app.request(`/api/admin/leads/${lead.id}/google-sheets-sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      synced: false,
      mode: 'disabled',
    })
  })

  test('updates lead status from admin quick action and writes history', async () => {
    const adminToken = await registerAccessToken('action-admin@example.com')
    const adminUser = await prisma.user.update({
      where: { email: 'action-admin@example.com' },
      data: { isAdmin: true },
    })
    const { firstPartner, firstExcursion } = await seedAdminLeadCatalog()
    const lead = await prisma.lead.create({
      data: {
        publicNumber: 'PG-20260630-ACTION',
        status: LeadStatus.ACCEPTED,
        customerName: 'Даниил',
        customerPhone: '+79990000000',
        excursionId: firstExcursion.id,
        excursionTitle: firstExcursion.title,
        partnerId: firstPartner.id,
        commissionThb: 100,
        createdAt: new Date('2026-06-30T10:00:00.000Z'),
      },
    })

    const response = await app.request(`/api/admin/leads/${lead.id}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'cancelled',
        adminNote: '  Вернули деньги  ',
        comment: 'Клиент отменил',
      }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.lead).toMatchObject({
      id: lead.id,
      status: 'cancelled',
      adminNote: 'Вернули деньги',
      adminNoteUpdatedById: adminUser.id,
      adminNoteUpdatedByEmail: 'action-admin@example.com',
    })
    expect(body.lead.adminNoteUpdatedAt).toEqual(expect.any(String))
    expect(body.statusHistory).toHaveLength(1)
    expect(body.statusHistory[0]).toMatchObject({
      fromStatus: 'accepted',
      toStatus: 'cancelled',
      actorType: 'admin',
      actorId: adminUser.id,
      comment: 'Клиент отменил',
    })

    const persisted = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })
    expect(persisted.status).toBe(LeadStatus.CANCELLED)
    expect(persisted.adminNote).toBe('Вернули деньги')
    expect(persisted.adminNoteUpdatedById).toBe(adminUser.id)
    expect(persisted.adminNoteUpdatedAt).toBeInstanceOf(Date)
  })

  test('bulk updates lead statuses from admin queue and writes history per lead', async () => {
    const adminToken = await registerAccessToken('bulk-action-admin@example.com')
    const adminUser = await prisma.user.update({
      where: { email: 'bulk-action-admin@example.com' },
      data: { isAdmin: true },
    })
    const { firstPartner, firstExcursion } = await seedAdminLeadCatalog()
    const firstLead = await prisma.lead.create({
      data: {
        publicNumber: 'PG-20260630-BULK-1',
        status: LeadStatus.NEW,
        customerName: 'Bulk One',
        customerPhone: '+79990000001',
        excursionId: firstExcursion.id,
        excursionTitle: firstExcursion.title,
        partnerId: firstPartner.id,
        commissionThb: 100,
      },
    })
    const secondLead = await prisma.lead.create({
      data: {
        publicNumber: 'PG-20260630-BULK-2',
        status: LeadStatus.WAITING_PARTNER,
        customerName: 'Bulk Two',
        customerPhone: '+79990000002',
        excursionId: firstExcursion.id,
        excursionTitle: firstExcursion.title,
        partnerId: firstPartner.id,
        commissionThb: 100,
      },
    })

    const response = await app.request('/api/admin/leads/bulk/status', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        leadIds: [firstLead.id, secondLead.id],
        status: 'accepted',
        comment: 'Массово приняли заявки',
      }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      requestedCount: 2,
      updatedCount: 2,
      historyCount: 2,
    })

    const persisted = await prisma.lead.findMany({
      where: {
        id: {
          in: [firstLead.id, secondLead.id],
        },
      },
      include: {
        statusHistory: true,
      },
      orderBy: {
        publicNumber: 'asc',
      },
    })

    expect(persisted.map((lead) => lead.status)).toEqual([
      LeadStatus.ACCEPTED,
      LeadStatus.ACCEPTED,
    ])
    expect(persisted.flatMap((lead) => lead.statusHistory)).toHaveLength(2)
    for (const lead of persisted) {
      expect(lead.statusHistory[0]).toMatchObject({
        leadId: lead.id,
        toStatus: LeadStatus.ACCEPTED,
        actorType: LeadActorType.ADMIN,
        actorId: adminUser.id,
        comment: 'Массово приняли заявки',
      })
    }
  })

  test('updates admin note without writing status history', async () => {
    const adminToken = await registerAccessToken('note-admin@example.com')
    const adminUser = await prisma.user.update({
      where: { email: 'note-admin@example.com' },
      data: {
        displayName: 'Note Admin',
        isAdmin: true,
      },
    })
    const { firstPartner, firstExcursion } = await seedAdminLeadCatalog()
    const lead = await prisma.lead.create({
      data: {
        publicNumber: 'PG-20260630-NOTE',
        status: LeadStatus.NEW,
        customerName: 'Даниил',
        customerPhone: '+79990000000',
        excursionId: firstExcursion.id,
        excursionTitle: firstExcursion.title,
        partnerId: firstPartner.id,
        commissionThb: 100,
        createdAt: new Date('2026-06-30T10:00:00.000Z'),
      },
    })

    const response = await app.request(`/api/admin/leads/${lead.id}/admin-note`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        adminNote: '  Проверить оплату  ',
      }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.lead).toMatchObject({
      id: lead.id,
      status: 'new',
      adminNote: 'Проверить оплату',
      adminNoteUpdatedById: adminUser.id,
      adminNoteUpdatedByEmail: 'note-admin@example.com',
      adminNoteUpdatedByDisplayName: 'Note Admin',
    })
    expect(body.lead.adminNoteUpdatedAt).toEqual(expect.any(String))
    expect(body.statusHistory).toHaveLength(0)

    const persisted = await prisma.lead.findUniqueOrThrow({
      where: { id: lead.id },
      include: { statusHistory: true },
    })
    expect(persisted.adminNote).toBe('Проверить оплату')
    expect(persisted.adminNoteUpdatedById).toBe(adminUser.id)
    expect(persisted.adminNoteUpdatedAt).toBeInstanceOf(Date)
    expect(persisted.statusHistory).toHaveLength(0)
  })

  async function registerAccessToken(email: string) {
    const response = await app.request('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Platform': 'mobile',
      },
      body: JSON.stringify({
        email,
        password: 'password123',
      }),
    })
    const body = await response.json()
    return body.accessToken as string
  }

  async function seedAdminLeadCatalog() {
    const firstPartner = await prisma.partner.create({
      data: {
        name: 'Marusya Travel',
        telegramUsername: '@marusya',
      },
    })
    const secondPartner = await prisma.partner.create({
      data: {
        name: 'Other Travel',
      },
    })
    const category = await prisma.excursionCategory.create({
      data: {
        slug: 'islands',
        title: 'Острова',
      },
    })
    const firstExcursion = await prisma.excursion.create({
      data: excursionData({
        slug: 'phi-phi-dream-day',
        title: 'Острова Пхи-Пхи',
        categoryId: category.id,
        partnerId: firstPartner.id,
      }),
    })
    const secondExcursion = await prisma.excursion.create({
      data: excursionData({
        slug: 'james-bond',
        title: 'Остров Джеймса Бонда',
        categoryId: category.id,
        partnerId: secondPartner.id,
      }),
    })

    return { firstPartner, secondPartner, firstExcursion, secondExcursion }
  }

  function excursionData(input: {
    slug: string
    title: string
    categoryId: string
    partnerId: string
  }) {
    return {
      slug: input.slug,
      title: input.title,
      categoryId: input.categoryId,
      shortEmotion: 'Бирюзовая вода и белый песок.',
      description: 'День среди островов.',
      priceFromThb: 1500,
      priceFromRub: 3900,
      rubRate: '2.6',
      rateDate: new Date('2026-06-29T00:00:00.000Z'),
      currencyNote: 'Цена рассчитана по текущему курсу.',
      insurance: 'Страховка включена.',
      partnerId: input.partnerId,
      status: ExcursionStatus.PUBLISHED,
      seoTitle: input.title,
      seoDescription: input.title,
    }
  }
})
