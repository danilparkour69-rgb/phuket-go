import { describe, expect, test } from 'bun:test'
import type { AdminLeadDto } from '@phuket-go/contracts'

import { getLeadSlaInfo } from '../src/lib/admin-leads'

describe('admin lead SLA indicator', () => {
  const now = new Date('2026-06-30T12:00:00.000Z')

  test('labels new lead age buckets', () => {
    expect(slaLabel({ status: 'new', createdAt: '2026-06-30T11:50:00.000Z' })).toBe('Свежая')
    expect(slaLabel({ status: 'new', createdAt: '2026-06-30T11:30:00.000Z' })).toBe('Нужен ответ')
    expect(slaLabel({ status: 'new', createdAt: '2026-06-30T10:30:00.000Z' })).toBe('Просрочена')
  })

  test('labels non-new operational statuses', () => {
    expect(slaLabel({ status: 'waiting_partner', createdAt: '2026-06-30T10:30:00.000Z' })).toBe(
      'Ждет партнера',
    )
    expect(slaLabel({ status: 'accepted', createdAt: '2026-06-30T10:30:00.000Z' })).toBe(
      'В работе',
    )
    expect(slaLabel({ status: 'completed', createdAt: '2026-06-30T10:30:00.000Z' })).toBe(
      'Закрыта',
    )
  })

  function slaLabel(input: Pick<AdminLeadDto, 'createdAt' | 'status'>) {
    return getLeadSlaInfo(input, now).label
  }
})
