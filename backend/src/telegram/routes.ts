import { OpenAPIHono } from '@hono/zod-openapi'
import { z } from 'zod'

import type { CatalogService } from '../catalog/service'
import type { AppEnv } from '../env'
import { AppError } from '../http/errors'
import type { LeadTelegramNotifier } from '../leads/telegram-notifier'

type TelegramRouteEnv = {
  Variables: {
    catalogService: CatalogService
    env: AppEnv
    leadTelegramNotifier: LeadTelegramNotifier
  }
}

const telegramUpdateSchema = z.object({
  callback_query: z
    .object({
      id: z.string().min(1),
      data: z.string().min(1).optional(),
      from: z.object({
        id: z.number().int(),
      }),
      message: z
        .object({
          message_id: z.number().int(),
          chat: z.object({
            id: z.union([z.number().int(), z.string().min(1)]),
          }),
        })
        .optional(),
    })
    .optional(),
})

export function createTelegramRoutes() {
  const routes = new OpenAPIHono<TelegramRouteEnv>()

  routes.post('/webhook', async (c) => {
    const env = c.get('env')
    assertTelegramWebhookSecret(env, c.req.header('X-Telegram-Bot-Api-Secret-Token'))

    const update = telegramUpdateSchema.parse(await c.req.json())
    if (!update.callback_query?.data) {
      return c.json({ ok: true, ignored: true }, 200)
    }

    const callback = parseLeadCallbackData(update.callback_query.data)
    if (!callback) {
      return c.json({ ok: true, ignored: true }, 200)
    }

    const catalog = c.get('catalogService')
    const partnerTelegramChatId = String(update.callback_query.from.id)
    let result: TelegramLeadCallbackResult
    if (callback.action === 'problem') {
      result = await catalog.handleTelegramLeadProblemPrompt({
        leadId: callback.leadId,
        partnerTelegramChatId,
      })
    } else if (callback.action === 'problem_reason') {
      result = await catalog.handleTelegramLeadProblemReason({
        leadId: callback.leadId,
        reason: callback.reason,
        partnerTelegramChatId,
      })
    } else {
      result = await catalog.handleTelegramLeadCallback({
        ...callback,
        partnerTelegramChatId,
      })
    }
    await confirmPartnerLeadCallback(c.get('leadTelegramNotifier'), {
      callbackQueryId: update.callback_query.id,
      chatId: String(update.callback_query.message?.chat.id ?? update.callback_query.from.id),
      messageId: update.callback_query.message?.message_id ?? null,
      leadId: result.leadId,
      publicNumber: result.publicNumber,
      status: result.status,
      changed: result.changed,
      problemPrompt: result.problemPrompt,
      problemNote: result.problemNote,
    })

    return c.json({ ok: true, result }, 200)
  })

  return routes
}

type TelegramLeadCallbackResult = {
  leadId: string
  publicNumber: string
  status: string
  changed: boolean
  problemPrompt?: boolean
  problemNote?: string | null
}

export function parseLeadCallbackData(
  value: string,
):
  | { leadId: string; action: 'accept' | 'decline' | 'complete' }
  | { leadId: string; action: 'problem' }
  | { leadId: string; action: 'problem_reason'; reason: LeadProblemReason }
  | null {
  const [entity, leadId, action, reason] = value.split(':')
  if (entity !== 'lead') return null
  if (!leadId) return null
  if (
    action !== 'accept' &&
    action !== 'decline' &&
    action !== 'complete' &&
    action !== 'problem'
  ) {
    return null
  }
  if (action === 'problem' && reason !== undefined) {
    if (!isLeadProblemReason(reason)) return null
    return { leadId, action: 'problem_reason', reason }
  }

  return { leadId, action }
}

type LeadProblemReason = 'no_response' | 'no_seats' | 'need_admin' | 'other'

function isLeadProblemReason(value: string): value is LeadProblemReason {
  return (
    value === 'no_response' ||
    value === 'no_seats' ||
    value === 'need_admin' ||
    value === 'other'
  )
}

async function confirmPartnerLeadCallback(
  notifier: LeadTelegramNotifier,
  input: Parameters<LeadTelegramNotifier['confirmPartnerLeadCallback']>[0],
) {
  try {
    await notifier.confirmPartnerLeadCallback(input)
  } catch (error) {
    console.error('Telegram partner callback confirmation failed', {
      leadId: input.leadId,
      message: error instanceof Error ? error.message : 'Unknown Telegram notification error',
    })
  }
}

function assertTelegramWebhookSecret(env: AppEnv, headerValue: string | undefined) {
  if (!env.TELEGRAM_WEBHOOK_SECRET) {
    throw new AppError(404, 'NOT_FOUND', 'Telegram webhook is not configured')
  }

  if (headerValue !== env.TELEGRAM_WEBHOOK_SECRET) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid Telegram webhook secret')
  }
}
