import type { AdminLeadDto } from '@phuket-go/contracts'

export function getLeadSlaInfo(
  lead: Pick<AdminLeadDto, 'createdAt' | 'status'>,
  now = new Date(),
): {
  label: string
  title: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
} {
  if (
    lead.status === 'paid' ||
    lead.status === 'completed' ||
    lead.status === 'cancelled' ||
    lead.status === 'declined'
  ) {
    return {
      label: 'Закрыта',
      title: 'Заявка больше не требует SLA-реакции.',
      variant: 'outline',
    }
  }

  if (lead.status === 'accepted') {
    return {
      label: 'В работе',
      title: 'Заявка принята, следующий контроль идет по операционному процессу.',
      variant: 'secondary',
    }
  }

  const ageMinutes = Math.max(0, Math.floor((now.getTime() - new Date(lead.createdAt).getTime()) / 60_000))

  if (ageMinutes < 15) {
    return {
      label: 'Свежая',
      title: 'Заявка создана меньше 15 минут назад.',
      variant: 'outline',
    }
  }

  if (ageMinutes < 60) {
    return {
      label: 'Нужен ответ',
      title: 'Заявка ждет реакции больше 15 минут.',
      variant: 'default',
    }
  }

  if (lead.status === 'waiting_partner') {
    return {
      label: 'Ждет партнера',
      title: 'Партнер не ответил больше часа.',
      variant: 'destructive',
    }
  }

  return {
    label: 'Просрочена',
    title: 'Новая заявка ждет реакции больше часа.',
    variant: 'destructive',
  }
}
