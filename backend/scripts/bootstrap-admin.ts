import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'

import { normalizePgConnectionString } from '../src/db'
import { PrismaClient } from '../src/generated/prisma/client'
import { hashPassword } from '../src/auth/passwords'

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://superuser:superpassword@localhost:54329/phuket_go?schema=public'

const adminEmail = normalizeEmail(process.env.LOCAL_ADMIN_EMAIL ?? 'admin@phuket-go.local')
const adminPassword = process.env.LOCAL_ADMIN_PASSWORD ?? 'admin12345'
const adminDisplayName = normalizeOptionalText(process.env.LOCAL_ADMIN_DISPLAY_NAME) ?? 'Phuket Go Admin'
const shouldResetPassword = process.env.LOCAL_ADMIN_RESET_PASSWORD === 'true'

if (adminPassword.length < 8) {
  throw new Error('LOCAL_ADMIN_PASSWORD must be at least 8 characters')
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: normalizePgConnectionString(databaseUrl) }),
})

try {
  const result = await bootstrapAdmin()
  const passwordMode = result.passwordReset
    ? 'password reset'
    : result.created
      ? 'password set'
      : 'password preserved'

  console.info(`Admin user ready: ${result.email} (${passwordMode}).`)
} finally {
  await prisma.$disconnect()
}

async function bootstrapAdmin() {
  const existingUser = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: {
      id: true,
      email: true,
      passwordHash: true,
    },
  })

  if (!existingUser) {
    const user = await prisma.user.create({
      data: {
        email: adminEmail,
        displayName: adminDisplayName,
        passwordHash: await hashPassword(adminPassword),
        isAdmin: true,
      },
      select: {
        email: true,
      },
    })

    return {
      email: user.email,
      created: true,
      passwordReset: false,
    }
  }

  await prisma.user.update({
    where: { id: existingUser.id },
    data: {
      isAdmin: true,
      displayName: adminDisplayName,
      ...(shouldResetPassword ? { passwordHash: await hashPassword(adminPassword) } : {}),
    },
  })

  return {
    email: existingUser.email,
    created: false,
    passwordReset: shouldResetPassword,
  }
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase()
  if (!email.includes('@')) {
    throw new Error('LOCAL_ADMIN_EMAIL must be a valid email address')
  }

  return email
}

function normalizeOptionalText(value: string | undefined) {
  const text = value?.trim()
  return text ? text : undefined
}
