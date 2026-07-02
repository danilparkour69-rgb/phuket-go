import { PrismaPg } from '@prisma/adapter-pg'

import { normalizePgConnectionString } from '../../../backend/src/db'
import {
  ExcursionStatus,
  LeadActorType,
  LeadContactChannel,
  LeadSource,
  LeadStatus,
  PrismaClient,
} from '../../../backend/src/generated/prisma/client'
import { expect, test } from '../helpers/test'

test('public website excursion page creates a lead, saves contact channel, and sends follow-up answers', async ({
  page,
}) => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: normalizePgConnectionString(requiredDatabaseUrl()),
    }),
  })
  const slug = 'phi-phi'
  const customerName = `E2E Public Client ${Date.now()}`

  try {
    await seedPublicExcursion(prisma, slug)

    await page.goto(`${requiredWebsiteUrl()}/excursions/${slug}`)
    await expect(page.getByRole('heading', { name: 'E2E публичная экскурсия' })).toBeVisible()

    const leadForm = page.locator('#lead-form')
    await leadForm.getByLabel('Гостей').fill('3')
    await leadForm.getByLabel('Ваше имя').fill(customerName)
    await leadForm.getByLabel('Телефон').fill('+66991234567')
    await leadForm.getByLabel('Контакт в Telegram/WhatsApp/Max').fill('@public_e2e')
    await leadForm.getByLabel('Комментарий').fill('E2E публичная заявка с сайта')
    await leadForm.getByRole('button', { name: 'Отправить заявку' }).click()

    await expect(page.locator('#lead-form-result')).toContainText(
      'Спасибо! Заявка отправлена менеджеру.',
    )
    await expect(page.getByText('Выберите удобный канал связи')).toBeVisible()
    await expect(page.locator('#lead-followup-answer-label')).toHaveText('Какие даты вам удобны?')

    await page.getByRole('button', { name: 'WhatsApp' }).click()
    await expect(page.locator('#lead-contact-step-result')).toContainText('Канал связи сохранён')

    await page.locator('#lead-followup-answer').fill('12 или 13 июля, лучше утром')
    await page.locator('#lead-followup-submit').click()
    await expect(page.locator('#lead-followup-answer-label')).toHaveText(
      'Сколько человек планирует поехать?',
    )

    const lead = await prisma.lead.findFirstOrThrow({
      where: { customerName },
      include: {
        followUpAnswers: {
          orderBy: { sortOrder: 'asc' },
        },
        statusHistory: true,
      },
    })

    expect(lead.source).toBe(LeadSource.WEBSITE)
    expect(lead.status).toBe(LeadStatus.NEW)
    expect(lead.contactChannel).toBe(LeadContactChannel.WHATSAPP)
    expect(lead.customerPhone).toBe('+66991234567')
    expect(lead.customerTelegram).toBe('@public_e2e')
    expect(lead.peopleCount).toBe(3)
    expect(lead.commissionTotal).toBe(300)
    expect(lead.sourcePage).toBe(`/excursions/${slug}`)
    expect(lead.followUpAnswers).toHaveLength(1)
    expect(lead.followUpAnswers[0]).toMatchObject({
      questionKey: 'desired_dates',
      questionPrompt: 'Какие даты вам удобны?',
      answer: '12 или 13 июля, лучше утром',
      sortOrder: 10,
    })
    expect(lead.comment).toContain('Какие даты вам удобны?: 12 или 13 июля, лучше утром')
    expect(lead.statusHistory).toEqual([
      expect.objectContaining({
        fromStatus: null,
        toStatus: LeadStatus.NEW,
        actorType: LeadActorType.SYSTEM,
      }),
    ])
  } finally {
    await prisma.$disconnect()
  }
})

async function seedPublicExcursion(prisma: PrismaClient, slug: string) {
  const partner = await prisma.partner.create({
    data: {
      name: 'E2E Public Partner',
      telegramUsername: '@e2e_public_partner',
    },
  })
  const category = await prisma.excursionCategory.upsert({
    where: { slug: 'sea-tours' },
    update: {
      title: 'Морские туры',
    },
    create: {
      slug: 'sea-tours',
      title: 'Морские туры',
    },
  })

  await prisma.excursion.upsert({
    where: { slug },
    update: {
      title: 'E2E публичная экскурсия',
      categoryId: category.id,
      partnerId: partner.id,
      status: ExcursionStatus.PUBLISHED,
    },
    create: {
      slug,
      title: 'E2E публичная экскурсия',
      categoryId: category.id,
      shortEmotion: 'Проверяем публичный путь заявки.',
      description: 'E2E описание публичной экскурсии.',
      priceFromThb: 1500,
      priceFromRub: 3900,
      rubRate: '2.6',
      rateDate: new Date('2026-06-29T00:00:00.000Z'),
      currencyNote: 'Цена рассчитана по текущему курсу.',
      insurance: 'Страховка включена.',
      partnerId: partner.id,
      status: ExcursionStatus.PUBLISHED,
      seoTitle: 'E2E публичная экскурсия',
      seoDescription: 'E2E публичная экскурсия',
    },
  })
}

function requiredWebsiteUrl() {
  const websiteUrl = process.env.E2E_WEBSITE_URL
  if (!websiteUrl) {
    throw new Error('E2E_WEBSITE_URL is required for public website E2E')
  }

  return websiteUrl
}

function requiredDatabaseUrl() {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('TEST_DATABASE_URL or DATABASE_URL is required for public website E2E')
  }

  return databaseUrl
}
