import { readFile } from 'node:fs/promises'
import { PrismaPg } from '@prisma/adapter-pg'

import { normalizePgConnectionString } from '../../../backend/src/db'
import {
  ExcursionStatus,
  LeadActorType,
  LeadContactChannel,
  LeadServiceType,
  LeadStatus,
  PrismaClient,
} from '../../../backend/src/generated/prisma/client'
import { e2ePassword, expect, test, uniqueEmail } from '../helpers/test'

test('admin can open a lead and change its status from the UI', async ({ page }) => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: normalizePgConnectionString(requiredDatabaseUrl()),
    }),
  })
  const email = uniqueEmail('admin-e2e')
  const leadGroup = `PG-E2E-${Date.now()}`
  const publicNumber = `${leadGroup}-MAIN`

  try {
    await seedAdminLead(prisma, {
      email,
      leadGroup,
      publicNumber,
    })

    await page.goto('/')
    await page.getByRole('tab', { name: 'Login' }).click()
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(e2ePassword)
    await page.getByRole('button', { name: 'Login' }).click()

    await expect(page.getByRole('heading', { name: 'Session is active' })).toBeVisible()
    await page.getByRole('link', { name: 'Admin' }).click()

    await expect(page.getByRole('heading', { name: 'Заявки' })).toBeVisible()
    await page.getByLabel('Поиск').fill(leadGroup)
    await page.getByRole('button', { name: 'Применить' }).click()
    await expect(page.getByText('1-13 из 13')).toBeVisible()
    await page.getByRole('combobox', { name: 'Партнер' }).click()
    await page.getByRole('option', { name: new RegExp(`E2E Partner ${publicNumber}`) }).click()
    await page.getByRole('button', { name: 'Применить' }).click()
    await expect(page.getByText('1-13 из 13')).toBeVisible()
    await page.getByRole('combobox', { name: 'Направление' }).click()
    await page.getByRole('option', { name: 'Экскурсии' }).click()
    await page.getByRole('button', { name: 'Применить' }).click()
    await expect(page.getByText('1-13 из 13')).toBeVisible()
    const csvDownloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Экспорт CSV' }).click()
    const csvDownload = await csvDownloadPromise
    expect(csvDownload.suggestedFilename()).toMatch(/^admin-leads-\d{4}-\d{2}-\d{2}\.csv$/)
    const csvPath = await csvDownload.path()
    expect(csvPath).not.toBeNull()
    const csvContent = await readFile(csvPath ?? '', 'utf8')
    expect(csvContent).toContain('lead_id,public_number,status')
    expect(csvContent).toContain(publicNumber)
    expect(csvContent).toContain(`${leadGroup}-PAGE-10`)
    await expect(page.getByLabel(/Всего: \d+/)).toBeVisible()
    await expect(page.getByLabel(/Новые: \d+/)).toBeVisible()
    await expect(page.getByLabel(/Требуют внимания: \d+/)).toBeVisible()
    await expect(page.getByLabel(/Ждут партнера: \d+/)).toBeVisible()
    await page.getByLabel(/Требуют внимания: \d+/).click()
    await expect(page.getByText('1-12 из 12')).toBeVisible()
    await expect(page.getByLabel('Фокус')).toContainText('Требуют внимания')
    await expect(page.getByRole('columnheader', { name: 'SLA' })).toBeVisible()

    const firstBulkPublicNumber = `${leadGroup}-PAGE-0`
    const secondBulkPublicNumber = `${leadGroup}-PAGE-1`
    await page.getByLabel(`Выбрать заявку ${firstBulkPublicNumber}`, { exact: true }).click()
    await page.getByLabel(`Выбрать заявку ${secondBulkPublicNumber}`, { exact: true }).click()
    await expect(page.getByText('Выбрано: 2')).toBeVisible()
    await page.getByLabel('Комментарий', { exact: true }).fill('E2E: массово передали партнеру')
    await page.getByRole('button', { name: 'Применить к выбранным' }).click()
    await expect(page.getByText('Выбрано: 2')).toBeHidden()
    await expect(
      page.getByRole('row', { name: `Заявка ${firstBulkPublicNumber}`, exact: true }),
    ).toContainText('Ждет партнера')
    await expect(
      page.getByRole('row', { name: `Заявка ${secondBulkPublicNumber}`, exact: true }),
    ).toContainText('Ждет партнера')

    const bulkUpdatedLeads = await prisma.lead.findMany({
      where: {
        publicNumber: {
          in: [firstBulkPublicNumber, secondBulkPublicNumber],
        },
      },
      include: {
        statusHistory: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: {
        publicNumber: 'asc',
      },
    })
    expect(bulkUpdatedLeads).toHaveLength(2)
    for (const bulkLead of bulkUpdatedLeads) {
      expect(bulkLead.status).toBe(LeadStatus.WAITING_PARTNER)
      expect(bulkLead.statusHistory[0]).toMatchObject({
        toStatus: LeadStatus.WAITING_PARTNER,
        actorType: LeadActorType.ADMIN,
        comment: 'E2E: массово передали партнеру',
      })
    }

    await page.getByLabel('Порядок').click()
    await page.getByRole('option', { name: 'Сначала старые' }).click()
    await page.getByRole('button', { name: 'Применить' }).click()
    await expect(page.locator('tbody tr').first()).toContainText(`${leadGroup}-PAGE-0`)
    await page.getByLabel('На странице').click()
    await page.getByRole('option', { name: '10', exact: true }).click()
    await expect(page.getByText('1-10 из 12')).toBeVisible()
    await page.getByRole('button', { name: 'Вперед' }).click()
    await expect(page.getByText('11-12 из 12')).toBeVisible()
    await page.getByRole('button', { name: 'Назад' }).click()
    await expect(page.getByText('1-10 из 12')).toBeVisible()

    await page.getByRole('button', { name: 'Сбросить' }).click()
    await page.getByLabel('Поиск').fill(publicNumber)
    await page.getByLabel('С даты').fill('2026-06-30')
    await page.getByLabel('По дату').fill('2026-06-30')
    await page.getByRole('button', { name: 'Применить' }).click()

    const leadRow = page.getByRole('row', { name: new RegExp(publicNumber) })
    await expect(leadRow).toBeVisible()
    await expect(leadRow.getByText('Новая')).toBeVisible()

    await leadRow.click()
    await expect(page.getByText(/Свежая|Нужен ответ|Просрочена/).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Контакты клиента' })).toBeVisible()
    await expect(page.getByText('Предпочтительно: Telegram')).toBeVisible()
    await expect(page.getByText('@e2e_client')).toBeVisible()
    await page.getByRole('button', { name: 'Синхронизировать в Sheets' }).click()
    await expect(page.getByText('Google Sheets выключен')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Позвонить' })).toHaveAttribute(
      'href',
      'tel:+79990001122',
    )
    await expect(page.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/79990001122',
    )
    await expect(page.getByRole('link', { name: 'Telegram' })).toHaveAttribute(
      'href',
      'https://t.me/e2e_client',
    )

    await page.getByLabel('Заметка админа').fill('E2E: клиент подтвердил бронь')
    await page.getByRole('button', { name: 'Сохранить заметку' }).click()
    await expect(page.getByLabel('Заметка админа')).toHaveValue('E2E: клиент подтвердил бронь')
    await expect(page.getByText(/Последнее изменение: Admin E2E/)).toBeVisible()

    const noteOnlyLead = await prisma.lead.findUniqueOrThrow({
      where: { publicNumber },
      include: { statusHistory: true },
    })
    expect(noteOnlyLead.adminNote).toBe('E2E: клиент подтвердил бронь')
    expect(noteOnlyLead.adminNoteUpdatedAt).toBeInstanceOf(Date)
    expect(noteOnlyLead.adminNoteUpdatedById).not.toBeNull()
    expect(noteOnlyLead.status).toBe(LeadStatus.NEW)
    expect(noteOnlyLead.statusHistory).toHaveLength(1)

    await expect(page.getByText('Шаблоны комментариев')).toBeVisible()
    await page.getByRole('button', { name: 'Клиент подтвердил' }).click()
    await expect(page.getByLabel('Комментарий в историю')).toHaveValue(
      'Клиент подтвердил детали, передали партнеру.',
    )
    await page.getByRole('button', { name: 'Принять' }).click()

    await expect(leadRow.getByText('Принята')).toBeVisible()
    await expect(page.getByLabel('Заметка админа')).toHaveValue('E2E: клиент подтвердил бронь')
    await expect(page.getByText('Клиент подтвердил детали, передали партнеру.')).toBeVisible()

    const updatedLead = await prisma.lead.findUniqueOrThrow({
      where: { publicNumber },
      include: {
        statusHistory: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })

    expect(updatedLead.status).toBe(LeadStatus.ACCEPTED)
    expect(updatedLead.adminNote).toBe('E2E: клиент подтвердил бронь')
    expect(updatedLead.statusHistory[0]).toMatchObject({
      fromStatus: LeadStatus.NEW,
      toStatus: LeadStatus.ACCEPTED,
      actorType: LeadActorType.ADMIN,
      comment: 'Клиент подтвердил детали, передали партнеру.',
    })
  } finally {
    await prisma.$disconnect()
  }
})

async function seedAdminLead(
  prisma: PrismaClient,
  input: {
    email: string
    leadGroup: string
    publicNumber: string
  },
) {
  await registerAdminUser(input.email)
  await prisma.user.update({
    where: { email: input.email },
    data: { isAdmin: true },
  })

  const partner = await prisma.partner.create({
    data: {
      name: `E2E Partner ${input.publicNumber}`,
      telegramUsername: '@e2e_partner',
    },
  })
  const category = await prisma.excursionCategory.create({
    data: {
      slug: `e2e-category-${input.publicNumber.toLowerCase()}`,
      title: `E2E Category ${input.publicNumber}`,
    },
  })
  const excursion = await prisma.excursion.create({
    data: {
      slug: `e2e-excursion-${input.publicNumber.toLowerCase()}`,
      title: 'E2E острова Пхи-Пхи',
      categoryId: category.id,
      shortEmotion: 'Бирюзовая вода и белый песок.',
      description: 'День среди островов.',
      priceFromThb: 1500,
      priceFromRub: 3900,
      rubRate: '2.6',
      rateDate: new Date('2026-06-29T00:00:00.000Z'),
      currencyNote: 'Цена рассчитана по текущему курсу.',
      insurance: 'Страховка включена.',
      partnerId: partner.id,
      status: ExcursionStatus.PUBLISHED,
      seoTitle: 'E2E острова Пхи-Пхи',
      seoDescription: 'E2E острова Пхи-Пхи',
    },
  })
  const lead = await prisma.lead.create({
    data: {
      publicNumber: input.publicNumber,
      status: LeadStatus.NEW,
      serviceType: LeadServiceType.EXCURSION,
      customerName: 'E2E Клиент',
      customerPhone: '+79990001122',
      customerTelegram: '@e2e_client',
      contactChannel: LeadContactChannel.TELEGRAM,
      excursionId: excursion.id,
      excursionTitle: excursion.title,
      partnerId: partner.id,
      peopleCount: 2,
      commissionThb: 100,
      commissionTotal: 200,
      createdAt: new Date('2026-06-30T10:00:00.000Z'),
    },
  })

  await prisma.leadStatusHistory.create({
    data: {
      leadId: lead.id,
      fromStatus: null,
      toStatus: LeadStatus.NEW,
      actorType: LeadActorType.SYSTEM,
      comment: 'E2E lead created',
      createdAt: new Date('2026-06-30T10:00:00.000Z'),
    },
  })

  await prisma.lead.createMany({
    data: [
      ...Array.from({ length: 11 }, (_, index) => ({
        publicNumber: `${input.leadGroup}-PAGE-${index}`,
        status: LeadStatus.NEW,
        serviceType: LeadServiceType.EXCURSION,
        customerName: `E2E Клиент ${index + 1}`,
        customerPhone: `+7999000${String(index + 2000).padStart(4, '0')}`,
        excursionId: excursion.id,
        excursionTitle: excursion.title,
        partnerId: partner.id,
        commissionThb: 100,
        createdAt: new Date(`2026-06-30T09:${String(index).padStart(2, '0')}:00.000Z`),
      })),
      {
        publicNumber: `${input.leadGroup}-FRESH`,
        status: LeadStatus.NEW,
        serviceType: LeadServiceType.EXCURSION,
        customerName: 'E2E Свежий клиент',
        customerPhone: '+79990009999',
        excursionId: excursion.id,
        excursionTitle: excursion.title,
        partnerId: partner.id,
        commissionThb: 100,
        createdAt: new Date(),
      },
    ],
  })
}

async function registerAdminUser(email: string) {
  const response = await fetch(`${requiredBackendUrl()}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Platform': 'web',
    },
    body: JSON.stringify({
      email,
      password: e2ePassword,
      displayName: 'Admin E2E',
    }),
  })

  if (!response.ok) {
    throw new Error(`Admin E2E user registration failed: ${response.status} ${await response.text()}`)
  }
}

function requiredBackendUrl() {
  const backendUrl = process.env.E2E_BACKEND_URL
  if (!backendUrl) {
    throw new Error('E2E_BACKEND_URL is required for admin E2E')
  }

  return backendUrl
}

function requiredDatabaseUrl() {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('TEST_DATABASE_URL or DATABASE_URL is required for admin E2E')
  }

  return databaseUrl
}
