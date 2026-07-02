import { describe, expect, test } from 'bun:test'

import type { DbClient } from '../db'
import { TelegramContactService } from './contacts'

describe('TelegramContactService', () => {
  test('records seen Telegram contacts and normalizes usernames', async () => {
    const upserts: unknown[] = []
    const service = new TelegramContactService(
      telegramContactDb({
        upsert: async (input) => {
          upserts.push(input)
        },
      }),
    )

    await service.recordContactSeen({
      chatId: '123456',
      telegramUserId: '123456',
      username: '@manager',
      firstName: 'Manager',
      lastName: 'One',
      chatType: 'private',
      lastMessageText: '/start',
    })

    expect(upserts).toHaveLength(1)
    expect(upserts[0]).toMatchObject({
      where: { chatId: '123456' },
      create: {
        chatId: '123456',
        telegramUserId: '123456',
        username: 'manager',
        firstName: 'Manager',
        lastName: 'One',
        chatType: 'private',
        lastMessageText: '/start',
        lastSeenAt: expect.any(Date),
      },
      update: {
        telegramUserId: '123456',
        username: 'manager',
        firstName: 'Manager',
        lastName: 'One',
        chatType: 'private',
        lastMessageText: '/start',
        lastSeenAt: expect.any(Date),
      },
    })
  })

  test('stores, reads, and clears pending custom reason state', async () => {
    const upserts: unknown[] = []
    const updates: unknown[] = []
    const service = new TelegramContactService(
      telegramContactDb({
        upsert: async (input) => {
          upserts.push(input)
        },
        findUnique: async () => ({
          pendingReasonLeadId: 'lead-1',
          pendingReasonAction: 'decline',
          pendingReasonMessageId: 10,
        }),
        update: async (input) => {
          updates.push(input)
        },
      }),
    )

    await service.requestCustomReason({
      chatId: '123456',
      telegramUserId: '123456',
      leadId: 'lead-1',
      action: 'decline',
      messageId: 10,
    })
    const pending = await service.getPendingCustomReason('123456')
    await service.clearPendingCustomReason('123456')

    expect(upserts[0]).toMatchObject({
      where: { chatId: '123456' },
      create: {
        chatId: '123456',
        telegramUserId: '123456',
        chatType: 'private',
        pendingReasonLeadId: 'lead-1',
        pendingReasonAction: 'decline',
        pendingReasonMessageId: 10,
        pendingReasonRequestedAt: expect.any(Date),
      },
      update: {
        telegramUserId: '123456',
        pendingReasonLeadId: 'lead-1',
        pendingReasonAction: 'decline',
        pendingReasonMessageId: 10,
        pendingReasonRequestedAt: expect.any(Date),
      },
    })
    expect(pending).toEqual({
      leadId: 'lead-1',
      action: 'decline',
      messageId: 10,
    })
    expect(updates[0]).toEqual({
      where: { chatId: '123456' },
      data: {
        pendingReasonLeadId: null,
        pendingReasonAction: null,
        pendingReasonMessageId: null,
        pendingReasonRequestedAt: null,
      },
    })
  })

  test('ignores missing or unsupported pending custom reason state', async () => {
    const service = new TelegramContactService(
      telegramContactDb({
        findUnique: async () => ({
          pendingReasonLeadId: 'lead-1',
          pendingReasonAction: 'unsupported',
          pendingReasonMessageId: 10,
        }),
      }),
    )

    await expect(service.getPendingCustomReason('123456')).resolves.toBeNull()
  })

  test('clears pending custom reason as idempotent no-op when contact is missing', async () => {
    const service = new TelegramContactService(
      telegramContactDb({
        update: async () => {
          throw { code: 'P2025' }
        },
      }),
    )

    await expect(service.clearPendingCustomReason('missing-chat')).resolves.toBeUndefined()
  })
})

function telegramContactDb(overrides: {
  upsert?: (input: unknown) => Promise<void>
  findUnique?: (input: unknown) => Promise<unknown>
  update?: (input: unknown) => Promise<void>
}): DbClient {
  return {
    telegramContact: {
      upsert: overrides.upsert ?? (async () => {}),
      findUnique: overrides.findUnique ?? (async () => null),
      update: overrides.update ?? (async () => {}),
    },
  } as unknown as DbClient
}
