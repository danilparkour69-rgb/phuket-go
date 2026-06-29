import {
  TripAdvisorMatchStatus,
  TripAdvisorSyncStatus,
} from '../generated/prisma/client'

import { AppError } from '../http/errors'
import type { DbClient } from '../db'
import type { AppEnv } from '../env'
import {
  getTripadvisorApiKey,
  markTripadvisorCredentialUsed,
} from './credential'
import { TripAdvisorClient, TripAdvisorClientConfig } from './client'

type SyncResult = {
  status: 'ok' | 'skipped' | 'blocked'
  checkedCount: number
  syncedCount: number
  skippedCount: number
  failedCount: number
  reason?: string
}

const PROVIDER = 'tripadvisor'

export async function syncTripadvisorRatings(db: DbClient, env: AppEnv): Promise<SyncResult> {
  const apiKey = await getTripadvisorApiKey(db, env)
  if (!apiKey) {
    return {
      status: 'blocked',
      checkedCount: 0,
      syncedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      reason: 'NO_API_KEY',
    }
  }

  const client = new TripAdvisorClient(createClientConfig(env, apiKey))
  const budget = new ApiCallBudget(db, env)
  const candidateLimit = env.TRIPADVISOR_MAX_REQUESTS_PER_RUN
  const allowRefresh = env.TRIPADVISOR_ALLOW_REFRESH
  const staleHours = env.TRIPADVISOR_SYNC_STALE_HOURS
  const staleDate = allowRefresh ? new Date(Date.now() - staleHours * 60 * 60 * 1000) : null

  const syncWhere = createSyncWhere({
    allowRefresh,
    staleDate,
  })

  const candidates = await db.excursion.findMany({
    where: syncWhere,
    orderBy: {
      tripadvisorLastSyncedAt: 'asc',
    },
    select: {
      id: true,
      slug: true,
      tripadvisorLocationId: true,
      tripadvisorRating: true,
      tripadvisorReviewCount: true,
      tripadvisorRanking: true,
      tripadvisorWebUrl: true,
      tripadvisorRatingImageUrl: true,
      tripadvisorLastSyncedAt: true,
      tripadvisorSyncStatus: true,
      tripadvisorSyncMessage: true,
      tripadvisorDisplayAllowed: true,
      tripadvisorMatchStatus: true,
    },
    take: candidateLimit,
  })

  if (candidates.length === 0) {
    return {
      status: 'skipped',
      checkedCount: 0,
      syncedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      reason: 'NO_DUE_EXCURSIONS',
    }
  }

  let syncedCount = 0
  let skippedCount = 0
  let failedCount = 0

  for (const candidate of candidates) {
    const canCall = await budget.tryTakeCall()
    if (!canCall) {
      skippedCount += 1
      continue
    }

    try {
      const snapshot = await client.getLocationRating(candidate.tripadvisorLocationId as string)

      await markTripadvisorCredentialUsed(db)

      await db.excursion.update({
        where: { id: candidate.id },
        data: {
          tripadvisorLocationName: snapshot.name,
          tripadvisorRating: snapshot.rating,
          tripadvisorReviewCount: snapshot.reviewCount,
          tripadvisorRanking: snapshot.ranking,
          tripadvisorWebUrl: snapshot.webUrl,
          tripadvisorRatingImageUrl: snapshot.ratingImageUrl,
          tripadvisorLastSyncedAt: new Date(),
          tripadvisorSyncStatus: TripAdvisorSyncStatus.SUCCESS,
          tripadvisorSyncMessage: null,
        },
      })
      syncedCount += 1
    } catch (error) {
      failedCount += 1
      await db.excursion.update({
        where: { id: candidate.id },
        data: {
          tripadvisorSyncStatus: TripAdvisorSyncStatus.ERROR,
          tripadvisorSyncMessage: error instanceof Error ? error.message : 'Unknown sync error',
          tripadvisorLastSyncedAt: candidate.tripadvisorLastSyncedAt ?? new Date(),
        },
      }).catch((syncError) => {
        throw new AppError(
          500,
          'INTERNAL_ERROR',
          `Unable to persist TripAdvisor sync result for ${candidate.slug}`,
          syncError,
        )
      })
    }
  }

  return {
    status: 'ok',
    checkedCount: candidates.length,
    syncedCount,
    skippedCount,
    failedCount,
    reason:
      syncedCount === 0 && skippedCount > 0
        ? 'DAILY_REQUEST_BUDGET_EXCEEDED'
        : undefined,
  }
}

function createSyncWhere({
  allowRefresh,
  staleDate,
}: {
  allowRefresh: boolean
  staleDate: Date | null
}) {
  if (allowRefresh) {
    return {
      tripadvisorLocationId: { not: null },
      tripadvisorDisplayAllowed: true,
      tripadvisorMatchStatus: {
        in: [TripAdvisorMatchStatus.APPROVED, TripAdvisorMatchStatus.MATCHED],
      },
      OR: [
        { tripadvisorLastSyncedAt: null },
        ...(staleDate === null ? [] : [{ tripadvisorLastSyncedAt: { lt: staleDate } }]),
      ],
    }
  }

  return {
    tripadvisorLocationId: { not: null },
    tripadvisorDisplayAllowed: true,
    tripadvisorMatchStatus: {
      in: [TripAdvisorMatchStatus.APPROVED, TripAdvisorMatchStatus.MATCHED],
    },
    OR: [
      { tripadvisorLastSyncedAt: null },
      { tripadvisorSyncStatus: { not: TripAdvisorSyncStatus.SUCCESS } },
      { tripadvisorRating: null },
      { tripadvisorWebUrl: null },
    ],
  }
}

function createClientConfig(env: AppEnv, apiKey: string): TripAdvisorClientConfig {
  return {
    apiKey,
    timeoutMs: env.TRIPADVISOR_REQUEST_TIMEOUT_MS,
    baseUrl: env.TRIPADVISOR_API_BASE_URL.replace(/\/$/, ''),
  }
}

class ApiCallBudget {
  constructor(
    private readonly db: DbClient,
    private readonly env: AppEnv,
  ) {}

  async tryTakeCall() {
    const today = startOfDayUtc(new Date())

    const result = await this.db.$transaction(async (tx) => {
      await tx.integrationApiUsage.upsert({
        where: {
          provider_budgetDate: {
            provider: PROVIDER,
            budgetDate: today,
          },
        },
        create: {
          provider: PROVIDER,
          budgetDate: today,
          requestCount: 0,
        },
        update: {},
      })

      const budgetRow = await tx.integrationApiUsage.findUnique({
        where: {
          provider_budgetDate: {
            provider: PROVIDER,
            budgetDate: today,
          },
        },
        select: { requestCount: true },
      })

      if (!budgetRow || budgetRow.requestCount >= this.env.TRIPADVISOR_DAILY_MAX_REQUESTS) {
        return false
      }

      await tx.integrationApiUsage.update({
        where: {
          provider_budgetDate: {
            provider: PROVIDER,
            budgetDate: today,
          },
        },
        data: {
          requestCount: {
            increment: 1,
          },
        },
      })

      return true
    })

    return result
  }
}

function startOfDayUtc(date: Date) {
  const value = new Date(date.toISOString())
  value.setUTCHours(0, 0, 0, 0)
  return value
}

export function isTripadvisorApiKeyMissingReason(result: SyncResult) {
  return result.status === 'blocked' && result.reason === 'NO_API_KEY'
}
