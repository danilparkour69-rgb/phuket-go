import { Prisma } from '../generated/prisma/client'

import type { DbClient } from '../db'
import type { AppEnv } from '../env'

const INTEGRATION_PROVIDER = 'tripadvisor'

export async function getTripadvisorApiKey(db: DbClient, env: AppEnv) {
  if (env.TRIPADVISOR_API_KEY) {
    return env.TRIPADVISOR_API_KEY
  }

  const storedCredential = await db.integrationCredential.findUnique({
    where: { provider: INTEGRATION_PROVIDER },
    select: { apiKey: true },
  })

  return storedCredential?.apiKey ?? null
}

export async function saveTripadvisorApiKey(db: DbClient, apiKey: string) {
  return db.integrationCredential.upsert({
    where: { provider: INTEGRATION_PROVIDER },
    create: {
      provider: INTEGRATION_PROVIDER,
      apiKey,
      isActive: true,
    },
    update: {
      apiKey,
      isActive: true,
    },
  })
}

export async function markTripadvisorCredentialUsed(db: DbClient) {
  try {
    await db.integrationCredential.update({
      where: { provider: INTEGRATION_PROVIDER },
      data: { lastUsedAt: new Date() },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return
    }

    throw error
  }
}

export function isTripadvisorKeyConfigured(env: AppEnv) {
  return Boolean(env.TRIPADVISOR_API_KEY)
}
