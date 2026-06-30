import type { AppEnv } from '../env'

const telegramApiBaseUrl = 'https://api.telegram.org'

export type LeadTelegramNotifier = {
  notifyLeadCreated(input: LeadTelegramInput): Promise<void>
  notifyLeadStatusChanged(input: LeadTelegramStatusChangedInput): Promise<void>
  notifyLeadProblemReported(input: LeadTelegramProblemReportedInput): Promise<void>
  confirmPartnerLeadCallback(input: LeadTelegramCallbackConfirmationInput): Promise<void>
}

export type LeadTelegramConfig = {
  botToken: string
  adminChatId: string
}

type LeadTelegramFetch = (input: string | URL, init?: RequestInit) => Promise<Response>

export type LeadTelegramInput = {
  lead: {
    id: string
    publicNumber: string
    status: string
    customerName: string
    customerPhone: string
    customerTelegram: string | null
    requestedDate: Date | null
    peopleCount: number | null
    comment: string | null
    excursionTitle: string
  }
  partner: {
    name: string
    telegramUsername: string | null
    telegramChatId: string | null
  }
}

export type LeadTelegramStatusChangedInput = {
  lead: {
    id: string
    publicNumber: string
    status: string
    excursionTitle: string
  }
  partner: {
    name: string
    telegramUsername: string | null
  }
}

export type LeadTelegramCallbackConfirmationInput = {
  callbackQueryId: string
  chatId: string
  messageId: number | null
  leadId: string
  publicNumber: string
  status: string
  changed: boolean
  problemPrompt?: boolean
  problemNote?: string | null
}

export type LeadTelegramProblemReportedInput = {
  lead: {
    id: string
    publicNumber: string
    status: string
    excursionTitle: string
    partnerNote: string
  }
  partner: {
    name: string
    telegramUsername: string | null
  }
}

type TelegramSendMessageBody = {
  chat_id: string
  text: string
  reply_markup?: {
    inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>>
  }
}

type TelegramAnswerCallbackQueryBody = {
  callback_query_id: string
  text: string
  show_alert?: boolean
}

type TelegramEditMessageReplyMarkupBody = {
  chat_id: string
  message_id: number
  reply_markup: {
    inline_keyboard: Array<Array<{ text: string; callback_data: string }>>
  }
}

export class NoopLeadTelegramNotifier implements LeadTelegramNotifier {
  async notifyLeadCreated(_input: LeadTelegramInput) {}
  async notifyLeadStatusChanged(_input: LeadTelegramStatusChangedInput) {}
  async notifyLeadProblemReported(_input: LeadTelegramProblemReportedInput) {}
  async confirmPartnerLeadCallback(_input: LeadTelegramCallbackConfirmationInput) {}
}

export class TelegramLeadNotifier implements LeadTelegramNotifier {
  constructor(
    private readonly config: LeadTelegramConfig,
    private readonly fetcher: LeadTelegramFetch = fetch,
  ) {}

  async notifyLeadCreated(input: LeadTelegramInput) {
    const messages = buildLeadTelegramMessages(input)

    await this.sendMessage({
      chat_id: this.config.adminChatId,
      text: messages.adminText,
    })

    if (!input.partner.telegramChatId) return

    await this.sendMessage({
      chat_id: input.partner.telegramChatId,
      text: messages.partnerText,
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Взять в работу', callback_data: `lead:${input.lead.id}:accept` },
            { text: 'Отклонить', callback_data: `lead:${input.lead.id}:decline` },
          ],
          [{ text: 'Связаться с клиентом', callback_data: `lead:${input.lead.id}:contact` }],
        ],
      },
    })
  }

  async notifyLeadStatusChanged(input: LeadTelegramStatusChangedInput) {
    const message = buildLeadStatusChangedTelegramMessage(input)

    await this.sendMessage({
      chat_id: this.config.adminChatId,
      text: message.adminText,
    })
  }

  async notifyLeadProblemReported(input: LeadTelegramProblemReportedInput) {
    const message = buildLeadProblemReportedTelegramMessage(input)

    await this.sendMessage({
      chat_id: this.config.adminChatId,
      text: message.adminText,
    })
  }

  async confirmPartnerLeadCallback(input: LeadTelegramCallbackConfirmationInput) {
    const message = buildPartnerLeadCallbackConfirmation(input)

    await this.requestTelegram('answerCallbackQuery', {
      callback_query_id: input.callbackQueryId,
      text: message.toastText,
      show_alert: false,
    })

    if (input.messageId !== null) {
      await this.editMessageReplyMarkup({
        chat_id: input.chatId,
        message_id: input.messageId,
        reply_markup: {
          inline_keyboard: partnerStatusKeyboard(input),
        },
      })
    }

    await this.sendMessage({
      chat_id: input.chatId,
      text: message.partnerText,
    })
  }

  private async sendMessage(body: TelegramSendMessageBody) {
    await this.requestTelegram('sendMessage', body)
  }

  private async editMessageReplyMarkup(body: TelegramEditMessageReplyMarkupBody) {
    await this.requestTelegram('editMessageReplyMarkup', body)
  }

  private async requestTelegram(method: string, body: unknown) {
    let response: Response
    try {
      response = await this.fetcher(
        `${telegramApiBaseUrl}/bot${this.config.botToken}/${method}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      )
    } catch {
      throw new Error(`Telegram ${method} request failed`)
    }

    if (!response.ok) {
      throw new Error(`Telegram ${method} failed with status ${response.status}`)
    }
  }
}

export function createLeadTelegramNotifierFromEnv(env: AppEnv): LeadTelegramNotifier {
  const config = leadTelegramConfigFromEnv(env)
  return config ? new TelegramLeadNotifier(config) : new NoopLeadTelegramNotifier()
}

export function leadTelegramConfigFromEnv(env: AppEnv): LeadTelegramConfig | null {
  if (!env.TELEGRAM_NOTIFICATIONS_ENABLED) return null

  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_ADMIN_CHAT_ID) {
    return null
  }

  return {
    botToken: env.TELEGRAM_BOT_TOKEN,
    adminChatId: env.TELEGRAM_ADMIN_CHAT_ID,
  }
}

export function buildLeadTelegramMessages(input: LeadTelegramInput) {
  const lead = input.lead
  const fields = {
    publicNumber: lead.publicNumber,
    status: enumValue(lead.status),
    excursionTitle: lead.excursionTitle,
    partnerName: input.partner.name,
    customerName: lead.customerName,
    customerPhone: lead.customerPhone,
    customerTelegram: valueOrDash(lead.customerTelegram),
    requestedDate: dateOnly(lead.requestedDate),
    peopleCount: lead.peopleCount === null ? '—' : String(lead.peopleCount),
    comment: valueOrDash(lead.comment),
  }

  return {
    adminText: [
      'Новая заявка Phuket Go',
      '',
      `Заявка: #${fields.publicNumber}`,
      `Статус: ${fields.status}`,
      `Экскурсия: ${fields.excursionTitle}`,
      `Партнер: ${fields.partnerName}`,
      '',
      `Клиент: ${fields.customerName}`,
      `Телефон: ${fields.customerPhone}`,
      `Telegram: ${fields.customerTelegram}`,
      `Дата: ${fields.requestedDate}`,
      `Людей: ${fields.peopleCount}`,
      '',
      `Комментарий: ${fields.comment}`,
    ].join('\n'),
    partnerText: [
      'Новая заявка Phuket Go',
      '',
      `Заявка: #${fields.publicNumber}`,
      `Экскурсия: ${fields.excursionTitle}`,
      `Дата: ${fields.requestedDate}`,
      `Количество людей: ${fields.peopleCount}`,
      '',
      `Клиент: ${fields.customerName}`,
      `Телефон: ${fields.customerPhone}`,
      `Telegram: ${fields.customerTelegram}`,
      '',
      `Комментарий: ${fields.comment}`,
    ].join('\n'),
  }
}

export function buildLeadStatusChangedTelegramMessage(input: LeadTelegramStatusChangedInput) {
  const status = enumValue(input.lead.status)

  return {
    adminText: [
      'Статус заявки изменен',
      '',
      `Заявка: #${input.lead.publicNumber}`,
      `Статус: ${status} (${leadStatusLabel(status)})`,
      `Экскурсия: ${input.lead.excursionTitle}`,
      `Партнер: ${input.partner.name}`,
      `Telegram партнера: ${valueOrDash(input.partner.telegramUsername)}`,
    ].join('\n'),
  }
}

export function buildPartnerLeadCallbackConfirmation(
  input: LeadTelegramCallbackConfirmationInput,
) {
  const status = enumValue(input.status)

  if (input.problemPrompt) {
    return {
      toastText: 'Выберите причину проблемы',
      partnerText: `Выберите причину проблемы по заявке #${input.publicNumber}.`,
    }
  }

  if (input.problemNote) {
    return {
      toastText: 'Проблема отправлена админу',
      partnerText: `Проблема по заявке #${input.publicNumber} отправлена администратору: ${input.problemNote}.`,
    }
  }

  if (!input.changed) {
    return {
      toastText: 'Статус уже был обновлен',
      partnerText: `Заявка #${input.publicNumber} уже находится в статусе ${status}.`,
    }
  }

  if (status === 'accepted') {
    return {
      toastText: 'Заявка взята в работу',
      partnerText: [
        `Заявка #${input.publicNumber} взята в работу.`,
        'Свяжитесь с клиентом и подтвердите детали.',
      ].join('\n'),
    }
  }

  if (status === 'completed') {
    return {
      toastText: 'Заявка отмечена как оказанная',
      partnerText: [
        `Заявка #${input.publicNumber} отмечена как оказанная.`,
        'Комиссия будет учтена в месячном расчете.',
      ].join('\n'),
    }
  }

  return {
    toastText: 'Заявка отклонена',
    partnerText: [
      `Заявка #${input.publicNumber} отклонена.`,
      'Администратор увидит это и решит, что делать дальше.',
    ].join('\n'),
  }
}

function partnerStatusKeyboard(input: LeadTelegramCallbackConfirmationInput) {
  const status = enumValue(input.status)
  if (input.problemPrompt) {
    return [
      [
        {
          text: 'Клиент не отвечает',
          callback_data: `lead:${input.leadId}:problem:no_response`,
        },
      ],
      [{ text: 'Нет мест', callback_data: `lead:${input.leadId}:problem:no_seats` }],
      [
        {
          text: 'Нужна помощь админа',
          callback_data: `lead:${input.leadId}:problem:need_admin`,
        },
      ],
      [{ text: 'Другая причина', callback_data: `lead:${input.leadId}:problem:other` }],
    ]
  }
  if (!input.changed) return []
  if (status === 'accepted') {
    return [
      [
        { text: 'Оказана', callback_data: `lead:${input.leadId}:complete` },
        { text: 'Проблема', callback_data: `lead:${input.leadId}:problem` },
      ],
    ]
  }

  return []
}

export function buildLeadProblemReportedTelegramMessage(input: LeadTelegramProblemReportedInput) {
  const status = enumValue(input.lead.status)

  return {
    adminText: [
      'Партнер сообщил о проблеме',
      '',
      `Заявка: #${input.lead.publicNumber}`,
      `Статус: ${status} (${leadStatusLabel(status)})`,
      `Экскурсия: ${input.lead.excursionTitle}`,
      `Партнер: ${input.partner.name}`,
      `Telegram партнера: ${valueOrDash(input.partner.telegramUsername)}`,
      '',
      `Причина: ${input.lead.partnerNote}`,
    ].join('\n'),
  }
}

function leadStatusLabel(status: string) {
  if (status === 'accepted') return 'Взята в работу'
  if (status === 'completed') return 'Оказана'
  return 'Отклонена'
}

function valueOrDash(value: string | null) {
  return value && value.trim().length > 0 ? value : '—'
}

function dateOnly(value: Date | null) {
  if (!value) return '—'
  return value.toISOString().slice(0, 10)
}

function enumValue(value: string) {
  return value.toLowerCase()
}
