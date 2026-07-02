import { OpenAPIHono } from '@hono/zod-openapi'
import { z } from 'zod'

import type { CatalogService } from '../catalog/service'
import type { AppEnv } from '../env'
import { AppError } from '../http/errors'
import type { LeadTelegramNotifier } from '../leads/telegram-notifier'
import type { TelegramContactService } from './contacts'

type TelegramRouteEnv = {
  Variables: {
    catalogService: CatalogService
    env: AppEnv
    leadTelegramNotifier: LeadTelegramNotifier
    telegramContactService: TelegramContactService
  }
}

const telegramUpdateSchema = z.object({
  message: z
    .object({
      text: z.string().optional(),
      chat: z.object({
        id: z.union([z.number().int(), z.string().min(1)]),
        type: z.string().min(1),
      }),
      from: z
        .object({
          id: z.number().int(),
          username: z.string().optional(),
          first_name: z.string().optional(),
          last_name: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
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
    if (update.message) {
      const messageChatId = String(update.message.chat.id)
      await c.get('telegramContactService').recordContactSeen({
        chatId: messageChatId,
        telegramUserId: update.message.from ? String(update.message.from.id) : null,
        username: update.message.from?.username ?? null,
        firstName: update.message.from?.first_name ?? null,
        lastName: update.message.from?.last_name ?? null,
        chatType: update.message.chat.type,
        lastMessageText: update.message.text ?? null,
      })

      const pendingResult = await handlePendingCustomReasonMessage({
        catalog: c.get('catalogService'),
        contactService: c.get('telegramContactService'),
        notifier: c.get('leadTelegramNotifier'),
        chatId: messageChatId,
        partnerTelegramChatId: update.message.from ? String(update.message.from.id) : messageChatId,
        text: update.message.text ?? null,
      })

      if (pendingResult) {
        return c.json({ ok: true, result: pendingResult }, 200)
      }
    }

    if (!update.callback_query?.data) {
      return c.json({ ok: true, ignored: true }, 200)
    }

    const callback = parseLeadCallbackData(update.callback_query.data)
    if (!callback) {
      return c.json({ ok: true, ignored: true }, 200)
    }

    const catalog = c.get('catalogService')
    const partnerTelegramChatId = String(update.callback_query.from.id)
    const callbackChatId = String(update.callback_query.message?.chat.id ?? update.callback_query.from.id)
    const callbackMessageId = update.callback_query.message?.message_id ?? null
    let result: TelegramLeadCallbackResult
    if (callback.action === 'decline') {
      result = await catalog.handleTelegramLeadDeclinePrompt({
        leadId: callback.leadId,
        partnerTelegramChatId,
      })
    } else if (callback.action === 'decline_reason') {
      if (callback.reason === 'other') {
        result = await catalog.handleTelegramLeadCustomReasonPrompt({
          leadId: callback.leadId,
          action: 'decline',
          partnerTelegramChatId,
        })
        if (result.customReasonPrompt) {
          await c.get('telegramContactService').requestCustomReason({
            chatId: callbackChatId,
            telegramUserId: String(update.callback_query.from.id),
            leadId: callback.leadId,
            action: 'decline',
            messageId: callbackMessageId,
          })
        }
      } else {
        result = await catalog.handleTelegramLeadDeclineReason({
          leadId: callback.leadId,
          reason: callback.reason,
          partnerTelegramChatId,
        })
      }
    } else if (callback.action === 'problem') {
      result = await catalog.handleTelegramLeadProblemPrompt({
        leadId: callback.leadId,
        partnerTelegramChatId,
      })
    } else if (callback.action === 'problem_reason') {
      if (callback.reason === 'other') {
        result = await catalog.handleTelegramLeadCustomReasonPrompt({
          leadId: callback.leadId,
          action: 'problem',
          partnerTelegramChatId,
        })
        if (result.customReasonPrompt) {
          await c.get('telegramContactService').requestCustomReason({
            chatId: callbackChatId,
            telegramUserId: String(update.callback_query.from.id),
            leadId: callback.leadId,
            action: 'problem',
            messageId: callbackMessageId,
          })
        }
      } else {
        result = await catalog.handleTelegramLeadProblemReason({
          leadId: callback.leadId,
          reason: callback.reason,
          partnerTelegramChatId,
        })
      }
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
      ...(result.customerContactUrl ? { customerContactUrl: result.customerContactUrl } : {}),
      declinePrompt: result.declinePrompt,
      declineNote: result.declineNote,
      problemPrompt: result.problemPrompt,
      problemNote: result.problemNote,
      customReasonPrompt: result.customReasonPrompt,
      customReasonAction: result.customReasonAction,
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
  customerContactUrl?: string | null
  declinePrompt?: boolean
  declineNote?: string | null
  problemPrompt?: boolean
  problemNote?: string | null
  customReasonPrompt?: boolean
  customReasonAction?: 'decline' | 'problem'
}

export function parseLeadCallbackData(
  value: string,
):
  | { leadId: string; action: 'accept' | 'paid' | 'complete' }
  | { leadId: string; action: 'decline' }
  | { leadId: string; action: 'decline_reason'; reason: LeadCallbackReason }
  | { leadId: string; action: 'problem' }
  | { leadId: string; action: 'problem_reason'; reason: LeadCallbackReason }
  | null {
  const [entity, leadId, action, reason, ...extra] = value.split(':')
  if (entity !== 'lead') return null
  if (!leadId) return null
  if (extra.length > 0) return null
  if (
    action !== 'accept' &&
    action !== 'decline' &&
    action !== 'paid' &&
    action !== 'complete' &&
    action !== 'problem'
  ) {
    return null
  }
  if (action !== 'decline' && action !== 'problem' && reason !== undefined) {
    return null
  }
  if (action === 'problem' && reason !== undefined) {
    if (!isLeadCallbackReason(reason)) return null
    return { leadId, action: 'problem_reason', reason }
  }
  if (action === 'decline' && reason !== undefined) {
    if (!isLeadCallbackReason(reason)) return null
    return { leadId, action: 'decline_reason', reason }
  }

  return { leadId, action }
}

type LeadCallbackReason =
  | 'no_response'
  | 'no_slots'
  | 'no_seats'
  | 'rude'
  | 'spam'
  | 'competitor'
  | 'need_admin'
  | 'other'

function isLeadCallbackReason(value: string): value is LeadCallbackReason {
  return (
    value === 'no_response' ||
    value === 'no_slots' ||
    value === 'no_seats' ||
    value === 'rude' ||
    value === 'spam' ||
    value === 'competitor' ||
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

async function handlePendingCustomReasonMessage(input: {
  catalog: CatalogService
  contactService: TelegramContactService
  notifier: LeadTelegramNotifier
  chatId: string
  partnerTelegramChatId: string
  text: string | null
}) {
  const text = input.text?.trim()
  if (!text) return null

  const pending = await input.contactService.getPendingCustomReason(input.chatId)
  if (!pending) return null

  const result = await input.catalog.handleTelegramLeadCustomReason({
    leadId: pending.leadId,
    action: pending.action,
    reasonText: text,
    partnerTelegramChatId: input.partnerTelegramChatId,
  })

  await input.contactService.clearPendingCustomReason(input.chatId)
  await confirmPartnerCustomReason(input.notifier, {
    chatId: input.chatId,
    messageId: pending.messageId,
    leadId: result.leadId,
    publicNumber: result.publicNumber,
    status: result.status,
    changed: result.changed,
    ...(result.customerContactUrl ? { customerContactUrl: result.customerContactUrl } : {}),
    action: pending.action,
    declineNote: 'declineNote' in result ? result.declineNote : undefined,
    problemNote: 'problemNote' in result ? result.problemNote : undefined,
  })

  return result
}

async function confirmPartnerCustomReason(
  notifier: LeadTelegramNotifier,
  input: Parameters<NonNullable<LeadTelegramNotifier['confirmPartnerCustomReason']>>[0],
) {
  if (!notifier.confirmPartnerCustomReason) return

  try {
    await notifier.confirmPartnerCustomReason(input)
  } catch (error) {
    console.error('Telegram partner custom reason confirmation failed', {
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
