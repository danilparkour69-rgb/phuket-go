import type { DbClient } from '../db'

export type TelegramContactSeenInput = {
  chatId: string
  telegramUserId: string | null
  username: string | null
  firstName: string | null
  lastName: string | null
  chatType: string
  lastMessageText: string | null
}

export type TelegramPendingCustomReasonAction = 'decline' | 'problem'

export type TelegramPendingCustomReason = {
  leadId: string
  action: TelegramPendingCustomReasonAction
  messageId: number | null
}

export class TelegramContactService {
  constructor(private readonly db: DbClient) {}

  async recordContactSeen(input: TelegramContactSeenInput) {
    await this.db.telegramContact.upsert({
      where: { chatId: input.chatId },
      create: {
        chatId: input.chatId,
        telegramUserId: input.telegramUserId,
        username: normalizeTelegramUsername(input.username),
        firstName: input.firstName,
        lastName: input.lastName,
        chatType: input.chatType,
        lastMessageText: input.lastMessageText,
        lastSeenAt: new Date(),
      },
      update: {
        telegramUserId: input.telegramUserId,
        username: normalizeTelegramUsername(input.username),
        firstName: input.firstName,
        lastName: input.lastName,
        chatType: input.chatType,
        lastMessageText: input.lastMessageText,
        lastSeenAt: new Date(),
      },
    })
  }

  async requestCustomReason(input: {
    chatId: string
    telegramUserId: string | null
    leadId: string
    action: TelegramPendingCustomReasonAction
    messageId: number | null
  }) {
    await this.db.telegramContact.upsert({
      where: { chatId: input.chatId },
      create: {
        chatId: input.chatId,
        telegramUserId: input.telegramUserId,
        chatType: 'private',
        pendingReasonLeadId: input.leadId,
        pendingReasonAction: input.action,
        pendingReasonMessageId: input.messageId,
        pendingReasonRequestedAt: new Date(),
      },
      update: {
        telegramUserId: input.telegramUserId,
        pendingReasonLeadId: input.leadId,
        pendingReasonAction: input.action,
        pendingReasonMessageId: input.messageId,
        pendingReasonRequestedAt: new Date(),
      },
    })
  }

  async getPendingCustomReason(chatId: string): Promise<TelegramPendingCustomReason | null> {
    const contact = await this.db.telegramContact.findUnique({
      where: { chatId },
      select: {
        pendingReasonLeadId: true,
        pendingReasonAction: true,
        pendingReasonMessageId: true,
      },
    })

    if (
      !contact?.pendingReasonLeadId ||
      (contact.pendingReasonAction !== 'decline' && contact.pendingReasonAction !== 'problem')
    ) {
      return null
    }

    return {
      leadId: contact.pendingReasonLeadId,
      action: contact.pendingReasonAction,
      messageId: contact.pendingReasonMessageId,
    }
  }

  async clearPendingCustomReason(chatId: string) {
    await this.db.telegramContact
      .update({
        where: { chatId },
        data: {
          pendingReasonLeadId: null,
          pendingReasonAction: null,
          pendingReasonMessageId: null,
          pendingReasonRequestedAt: null,
        },
      })
      .catch((error: unknown) => {
        if (isRecordNotFound(error)) return
        throw error
      })
  }
}

function normalizeTelegramUsername(value: string | null) {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed
}

function isRecordNotFound(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2025'
  )
}
