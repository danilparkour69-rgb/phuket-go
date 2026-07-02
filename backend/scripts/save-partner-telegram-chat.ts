import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'

import { normalizePgConnectionString } from '../src/db'
import { PrismaClient } from '../src/generated/prisma/client'

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://superuser:superpassword@localhost:54329/phuket_go?schema=public'
const partnerChatId = normalizeRequiredText(
  process.env.TELEGRAM_PARTNER_CHAT_ID,
  'TELEGRAM_PARTNER_CHAT_ID',
)
const partnerId = normalizeOptionalText(process.env.TELEGRAM_PARTNER_ID)
const partnerUsername = normalizeTelegramUsername(process.env.TELEGRAM_PARTNER_USERNAME)
const partnerName = normalizeOptionalText(process.env.TELEGRAM_PARTNER_NAME)

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: normalizePgConnectionString(databaseUrl) }),
})

try {
  const partner = await findPartner()
  const updated = await prisma.partner.update({
    where: { id: partner.id },
    data: { telegramChatId: partnerChatId },
    select: {
      id: true,
      name: true,
      telegramUsername: true,
      telegramChatId: true,
    },
  })

  console.info(
    [
      'Partner Telegram chat id saved.',
      `partner_id=${updated.id}`,
      `partner_name=${updated.name}`,
      `partner_username=${updated.telegramUsername ?? '-'}`,
      `telegram_chat_id=${updated.telegramChatId}`,
    ].join(' '),
  )
} finally {
  await prisma.$disconnect()
}

async function findPartner() {
  if (partnerId) {
    return prisma.partner.findUniqueOrThrow({
      where: { id: partnerId },
      select: { id: true },
    })
  }

  if (partnerUsername) {
    return prisma.partner.findFirstOrThrow({
      where: { telegramUsername: partnerUsername },
      select: { id: true },
    })
  }

  if (partnerName) {
    return prisma.partner.findFirstOrThrow({
      where: { name: partnerName },
      select: { id: true },
    })
  }

  const partners = await prisma.partner.findMany({
    select: { id: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 2,
  })

  if (partners.length === 1) {
    return partners[0]
  }

  throw new Error(
    'Set TELEGRAM_PARTNER_ID, TELEGRAM_PARTNER_USERNAME, or TELEGRAM_PARTNER_NAME when there is not exactly one partner.',
  )
}

function normalizeRequiredText(value: string | undefined, key: string) {
  const trimmed = value?.trim()
  if (!trimmed) {
    throw new Error(`${key} is required`)
  }

  return trimmed
}

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function normalizeTelegramUsername(value: string | undefined) {
  const trimmed = normalizeOptionalText(value)
  if (!trimmed) return undefined
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`
}
