import type { AppEnv } from '../env'

const telegramApiBaseUrl = 'https://api.telegram.org'

export type LeadTelegramNotifier = {
  notifyLeadCreated(input: LeadTelegramInput): Promise<void>
  notifyLeadContactChannelUpdated?(input: LeadTelegramContactChannelUpdatedInput): Promise<void>
  notifyLeadCustomerFollowUp(input: LeadTelegramCustomerFollowUpInput): Promise<void>
  notifyLeadStatusChanged(input: LeadTelegramStatusChangedInput): Promise<void>
  notifyLeadProblemReported(input: LeadTelegramProblemReportedInput): Promise<void>
  confirmPartnerLeadCallback(input: LeadTelegramCallbackConfirmationInput): Promise<void>
  confirmPartnerCustomReason?(input: LeadTelegramCustomReasonConfirmationInput): Promise<void>
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
    isTest?: boolean
    customerName: string
    customerPhone: string
    customerTelegram: string | null
    contactChannel: string | null
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
    isTest?: boolean
    excursionTitle: string
    partnerNote?: string | null
  }
  partner: {
    name: string
    telegramUsername: string | null
  }
}

export type LeadTelegramContactChannelUpdatedInput = {
  lead: {
    id: string
    publicNumber: string
    excursionTitle: string
    customerName: string
    customerPhone: string
    customerTelegram: string | null
    contactChannel: string | null
  }
  partner: {
    name: string
    telegramUsername: string | null
    telegramChatId: string | null
  }
}

export type LeadTelegramCustomerFollowUpInput = {
  lead: {
    id: string
    publicNumber: string
    excursionTitle: string
    customerName: string
    customerPhone: string
    customerTelegram: string | null
    requestedDate: Date | null
    comment: string | null
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
  customerContactUrl?: string | null
  declinePrompt?: boolean
  declineNote?: string | null
  problemPrompt?: boolean
  problemNote?: string | null
  customReasonPrompt?: boolean
  customReasonAction?: 'decline' | 'problem'
}

export type LeadTelegramCustomReasonConfirmationInput = {
  chatId: string
  messageId: number | null
  leadId: string
  publicNumber: string
  status: string
  changed: boolean
  customerContactUrl?: string | null
  action: 'decline' | 'problem'
  declineNote?: string | null
  problemNote?: string | null
}

export type LeadTelegramProblemReportedInput = {
  lead: {
    id: string
    publicNumber: string
    status: string
    isTest?: boolean
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
    inline_keyboard: TelegramInlineKeyboard
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
    inline_keyboard: TelegramInlineKeyboard
  }
}

type TelegramInlineKeyboard = Array<Array<{ text: string; callback_data?: string; url?: string }>>

export class NoopLeadTelegramNotifier implements LeadTelegramNotifier {
  async notifyLeadCreated(_input: LeadTelegramInput) {}
  async notifyLeadContactChannelUpdated(_input: LeadTelegramContactChannelUpdatedInput) {}
  async notifyLeadCustomerFollowUp(_input: LeadTelegramCustomerFollowUpInput) {}
  async notifyLeadStatusChanged(_input: LeadTelegramStatusChangedInput) {}
  async notifyLeadProblemReported(_input: LeadTelegramProblemReportedInput) {}
  async confirmPartnerLeadCallback(_input: LeadTelegramCallbackConfirmationInput) {}
  async confirmPartnerCustomReason(_input: LeadTelegramCustomReasonConfirmationInput) {}
}

export class TelegramLeadNotifier implements LeadTelegramNotifier {
  constructor(
    private readonly config: LeadTelegramConfig,
    private readonly fetcher: LeadTelegramFetch = fetch,
  ) {}

  async sendSmokeMessage(chatId: string, text: string) {
    await this.sendMessage({
      chat_id: chatId,
      text,
    })
  }

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
        inline_keyboard: partnerNewLeadKeyboard(input),
      },
    })
  }

  async notifyLeadContactChannelUpdated(input: LeadTelegramContactChannelUpdatedInput) {
    const messages = buildLeadContactChannelUpdatedTelegramMessages(input)
    const contactUrl = customerContactUrl(input.lead)

    await this.sendMessage({
      chat_id: this.config.adminChatId,
      text: messages.adminText,
    })

    if (!input.partner.telegramChatId) return

    await this.sendMessage({
      chat_id: input.partner.telegramChatId,
      text: messages.partnerText,
      ...(contactUrl
        ? {
            reply_markup: {
              inline_keyboard: [
                [{ text: '📞 Связаться с клиентом', url: contactUrl }],
              ],
            },
          }
        : {}),
    })
  }

  async notifyLeadStatusChanged(input: LeadTelegramStatusChangedInput) {
    const message = buildLeadStatusChangedTelegramMessage(input)

    await this.sendMessage({
      chat_id: this.config.adminChatId,
      text: message.adminText,
    })
  }

  async notifyLeadCustomerFollowUp(input: LeadTelegramCustomerFollowUpInput) {
    const message = buildLeadCustomerFollowUpTelegramMessage(input)

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

    await this.answerCallbackQuery({
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

  async confirmPartnerCustomReason(input: LeadTelegramCustomReasonConfirmationInput) {
    const message = buildPartnerCustomReasonConfirmation(input)

    if (input.messageId !== null) {
      await this.editMessageReplyMarkup({
        chat_id: input.chatId,
        message_id: input.messageId,
        reply_markup: {
          inline_keyboard: partnerStatusKeyboard({
            callbackQueryId: '',
            chatId: input.chatId,
            messageId: input.messageId,
            leadId: input.leadId,
            publicNumber: input.publicNumber,
            status: input.status,
            changed: input.changed,
            customerContactUrl: input.customerContactUrl,
            declineNote: input.declineNote,
            problemNote: input.problemNote,
          }),
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

  private async answerCallbackQuery(body: TelegramAnswerCallbackQueryBody) {
    try {
      await this.requestTelegram('answerCallbackQuery', body)
    } catch (error) {
      console.error('Telegram callback toast confirmation failed', {
        message: error instanceof Error ? error.message : 'Unknown Telegram notification error',
      })
    }
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

export function buildLeadContactChannelUpdatedTelegramMessages(
  input: LeadTelegramContactChannelUpdatedInput,
) {
  const fields = {
    publicNumber: input.lead.publicNumber,
    excursionTitle: input.lead.excursionTitle,
    partnerName: input.partner.name,
    customerName: input.lead.customerName,
    customerPhone: input.lead.customerPhone,
    customerTelegram: valueOrDash(input.lead.customerTelegram),
    contactChannel: contactChannelLabel(input.lead.contactChannel),
  }

  return {
    adminText: [
      'Клиент выбрал канал связи',
      '',
      `Заявка: #${fields.publicNumber}`,
      `Услуга: ${fields.excursionTitle}`,
      `Партнер: ${fields.partnerName}`,
      '',
      `Клиент: ${fields.customerName}`,
      `Телефон: ${fields.customerPhone}`,
      `Telegram: ${fields.customerTelegram}`,
      `Канал связи: ${fields.contactChannel}`,
    ].join('\n'),
    partnerText: [
      'Клиент выбрал канал связи',
      '',
      `Заявка: #${fields.publicNumber}`,
      `Услуга: ${fields.excursionTitle}`,
      '',
      `Клиент: ${fields.customerName}`,
      `Телефон: ${fields.customerPhone}`,
      `Telegram: ${fields.customerTelegram}`,
      `Канал связи: ${fields.contactChannel}`,
    ].join('\n'),
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
    contactChannel: contactChannelLabel(lead.contactChannel),
    requestedDate: dateOnly(lead.requestedDate),
    peopleCount: lead.peopleCount === null ? '—' : String(lead.peopleCount),
    comment: valueOrDash(lead.comment),
  }

  return {
    adminText: [
      lead.isTest ? 'Тестовая заявка Phuket Go' : 'Новая заявка Phuket Go',
      '',
      ...(lead.isTest
        ? ['Это тестовая заявка для проверки Telegram-кнопок менеджера.', '']
        : []),
      `Заявка: #${fields.publicNumber}`,
      `Статус: ${fields.status}`,
      `Услуга: ${fields.excursionTitle}`,
      `Партнер: ${fields.partnerName}`,
      '',
      `Клиент: ${fields.customerName}`,
      `Телефон: ${fields.customerPhone}`,
      `Telegram: ${fields.customerTelegram}`,
      `Канал связи: ${fields.contactChannel}`,
      `Дата: ${fields.requestedDate}`,
      `Людей: ${fields.peopleCount}`,
      '',
      `Комментарий: ${fields.comment}`,
    ].join('\n'),
    partnerText: [
      lead.isTest ? 'Тестовая заявка Phuket Go' : 'Новая заявка Phuket Go',
      '',
      ...(lead.isTest
        ? ['Проверьте кнопки: сначала «Принять заявку», затем рабочие действия.', '']
        : []),
      `Заявка: #${fields.publicNumber}`,
      `Услуга: ${fields.excursionTitle}`,
      `Дата: ${fields.requestedDate}`,
      `Количество людей: ${fields.peopleCount}`,
      '',
      `Клиент: ${fields.customerName}`,
      `Телефон: ${fields.customerPhone}`,
      `Telegram: ${fields.customerTelegram}`,
      `Канал связи: ${fields.contactChannel}`,
      '',
      `Комментарий: ${fields.comment}`,
    ].join('\n'),
  }
}

export function buildLeadStatusChangedTelegramMessage(input: LeadTelegramStatusChangedInput) {
  const status = enumValue(input.lead.status)

  return {
    adminText: [
      input.lead.isTest ? 'Статус тестовой заявки изменен' : 'Статус заявки изменен',
      '',
      `Заявка: #${input.lead.publicNumber}`,
      `Статус: ${status} (${leadStatusLabel(status)})`,
      `Услуга: ${input.lead.excursionTitle}`,
      `Партнер: ${input.partner.name}`,
      `Telegram партнера: ${valueOrDash(input.partner.telegramUsername)}`,
      ...(input.lead.partnerNote ? [`Причина: ${input.lead.partnerNote}`] : []),
    ].join('\n'),
  }
}

export function buildLeadCustomerFollowUpTelegramMessage(
  input: LeadTelegramCustomerFollowUpInput,
) {
  return {
    adminText: [
      'Клиент уточнил детали заявки',
      '',
      `Заявка: #${input.lead.publicNumber}`,
      `Услуга: ${input.lead.excursionTitle}`,
      '',
      `Клиент: ${input.lead.customerName}`,
      `Телефон: ${input.lead.customerPhone}`,
      `Telegram: ${valueOrDash(input.lead.customerTelegram)}`,
      `Желаемая дата: ${dateOnly(input.lead.requestedDate)}`,
      '',
      `Сообщение: ${valueOrDash(input.lead.comment)}`,
    ].join('\n'),
  }
}

export function buildPartnerLeadCallbackConfirmation(
  input: LeadTelegramCallbackConfirmationInput,
) {
  const status = enumValue(input.status)

  if (input.declinePrompt) {
    return {
      toastText: 'Выберите причину отказа',
      partnerText: `Почему отклоняем заявку #${input.publicNumber}? Выберите причину ниже.`,
    }
  }

  if (input.customReasonPrompt) {
    return {
      toastText: 'Напишите причину',
      partnerText:
        input.customReasonAction === 'decline'
          ? `Напишите, пожалуйста, причину отказа по заявке #${input.publicNumber} одним сообщением. Я передам ее администратору.`
          : `Напишите, пожалуйста, что случилось по заявке #${input.publicNumber} одним сообщением. Я передам это администратору.`,
    }
  }

  if (input.declineNote) {
    return {
      toastText: 'Заявка отклонена',
      partnerText: `Заявка #${input.publicNumber} отклонена. Причина: ${input.declineNote}.`,
    }
  }

  if (input.problemPrompt) {
    return {
      toastText: 'Выберите, что мешает',
      partnerText: `Что мешает выполнить заявку #${input.publicNumber}? Выберите вариант ниже.`,
    }
  }

  if (input.problemNote) {
    return {
      toastText: 'Запрос помощи отправлен',
      partnerText: `Запрос помощи по заявке #${input.publicNumber} отправлен администратору: ${input.problemNote}.`,
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

  if (status === 'paid') {
    return {
      toastText: 'Оплата получена',
      partnerText: [
        `По заявке #${input.publicNumber} оплата получена.`,
        'Спасибо большое за вашу работу, мы вас любим и ценим.',
        'Комиссия будет учтена в месячном расчете.',
      ].join('\n'),
    }
  }

  if (status === 'completed') {
    return {
      toastText: 'Услуга оказана',
      partnerText: `Заявка #${input.publicNumber}: услуга отмечена как оказанная.`,
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

export function buildPartnerCustomReasonConfirmation(input: LeadTelegramCustomReasonConfirmationInput) {
  if (input.action === 'decline') {
    return {
      partnerText: `Спасибо, причина сохранена. Заявка #${input.publicNumber} отклонена. Причина: ${input.declineNote ?? '—'}.`,
    }
  }

  return {
    partnerText: `Спасибо, передали администратору. Причина по заявке #${input.publicNumber}: ${input.problemNote ?? '—'}.`,
  }
}

function partnerNewLeadKeyboard(input: LeadTelegramInput): TelegramInlineKeyboard {
  const keyboard: TelegramInlineKeyboard = [
    [{ text: '✅ Принять заявку', callback_data: `lead:${input.lead.id}:accept` }],
  ]
  const contactUrl = customerContactUrl(input.lead)
  keyboard.push([
    contactUrl
      ? { text: '📞 Связаться с клиентом', url: contactUrl }
      : { text: '📞 Связаться с клиентом', callback_data: `lead:${input.lead.id}:contact` },
  ])
  return keyboard
}

function partnerStatusKeyboard(input: LeadTelegramCallbackConfirmationInput): TelegramInlineKeyboard {
  const status = enumValue(input.status)
  if (input.declinePrompt) {
    return partnerReasonKeyboard(input, 'decline')
  }
  if (input.problemPrompt) {
    return partnerReasonKeyboard(input, 'problem')
  }
  if (input.customReasonPrompt) {
    return [
      [
        {
          text: '✏️ Ждем причину сообщением',
          callback_data: `lead:${input.leadId}:${input.customReasonAction ?? 'problem'}:other`,
        },
      ],
    ]
  }
  if (status === 'accepted') {
    const keyboard: TelegramInlineKeyboard = [
      [
        {
          text: input.problemNote ? '🆘 Помощь запрошена' : '✅ В работе',
          callback_data: input.problemNote
            ? `lead:${input.leadId}:problem`
            : `lead:${input.leadId}:accept`,
        },
      ],
    ]
    if (input.customerContactUrl) {
      keyboard.push([{ text: '📞 Связаться с клиентом', url: input.customerContactUrl }])
    }
    keyboard.push([
      { text: '💰 Оплата получена', callback_data: `lead:${input.leadId}:paid` },
      { text: '🆘 Нужна помощь', callback_data: `lead:${input.leadId}:problem` },
    ])
    keyboard.push([{ text: '❌ Отклонить', callback_data: `lead:${input.leadId}:decline` }])
    return keyboard
  }
  if (status === 'paid') {
    return [[{ text: '💰 Оплачена', callback_data: `lead:${input.leadId}:paid` }]]
  }
  if (status === 'completed') {
    return [[{ text: '✅ Услуга оказана', callback_data: `lead:${input.leadId}:complete` }]]
  }
  if (status === 'declined') {
    const keyboard: TelegramInlineKeyboard = [
      [{ text: '❌ Отклонена', callback_data: `lead:${input.leadId}:decline` }],
    ]
    if (input.declineNote) {
      keyboard.push([
        {
          text: `Причина: ${input.declineNote}`,
          callback_data: `lead:${input.leadId}:decline`,
        },
      ])
    }
    return keyboard
  }

  return []
}

function partnerReasonKeyboard(
  input: LeadTelegramCallbackConfirmationInput,
  action: 'decline' | 'problem',
): TelegramInlineKeyboard {
  const reasons: Array<{ key: string; text: string }> = [
    { key: 'no_response', text: '📵 Клиент не отвечает' },
    { key: 'no_slots', text: '📅 Нет вариантов на дату' },
    { key: 'rude', text: '🙅 Некорректное общение' },
    { key: 'spam', text: '🛑 Спам' },
    { key: 'competitor', text: '🕵️ Конкурент/проверка' },
    ...(action === 'problem' ? [{ key: 'need_admin', text: '🛟 Нужна помощь админа' }] : []),
    { key: 'other', text: '✏️ Другая причина' },
  ]

  return [
    [
      {
        text: action === 'decline' ? '❌ Почему отклоняем?' : '🆘 Что мешает выполнить?',
        callback_data: `lead:${input.leadId}:${action}`,
      },
    ],
    ...reasons.map((reason) => [
      {
        text: reason.text,
        callback_data: `lead:${input.leadId}:${action}:${reason.key}`,
      },
    ]),
  ]
}

export function buildLeadProblemReportedTelegramMessage(input: LeadTelegramProblemReportedInput) {
  const status = enumValue(input.lead.status)

  return {
    adminText: [
      input.lead.isTest ? 'Нужна помощь по тестовой заявке' : 'Партнер попросил помощь',
      '',
      `Заявка: #${input.lead.publicNumber}`,
      `Статус: ${status} (${leadStatusLabel(status)})`,
      `Услуга: ${input.lead.excursionTitle}`,
      `Партнер: ${input.partner.name}`,
      `Telegram партнера: ${valueOrDash(input.partner.telegramUsername)}`,
      '',
      `Причина: ${input.lead.partnerNote}`,
    ].join('\n'),
  }
}

function leadStatusLabel(status: string) {
  if (status === 'accepted') return 'Взята в работу'
  if (status === 'paid') return 'Оплачена'
  if (status === 'completed') return 'Услуга оказана'
  return 'Отклонена'
}

function valueOrDash(value: string | null) {
  return value && value.trim().length > 0 ? value : '—'
}

function dateOnly(value: Date | null) {
  if (!value) return '—'
  return value.toISOString().slice(0, 10)
}

function contactChannelLabel(value: string | null) {
  const channel = value ? enumValue(value) : null
  if (channel === 'telegram') return 'Telegram'
  if (channel === 'whatsapp') return 'WhatsApp'
  if (channel === 'max') return 'Max'
  return '—'
}

function enumValue(value: string) {
  return value.toLowerCase()
}

function customerContactUrl(lead: {
  customerTelegram: string | null
  contactChannel: string | null
  customerPhone: string
}) {
  const channel = enumValue(lead.contactChannel ?? '')
  if (channel === 'telegram') {
    return telegramUsernameUrl(lead.customerTelegram)
  }

  if (channel === 'whatsapp') {
    const phone = lead.customerPhone.replace(/\D/g, '')
    return phone ? `https://wa.me/${phone}` : null
  }

  const telegram = telegramUsernameUrl(lead.customerTelegram)
  if (telegram) return telegram

  return null
}

function telegramUsernameUrl(value: string | null) {
  const username = value?.trim().replace(/^@/, '')
  if (!username) return null
  return `https://t.me/${username}`
}
