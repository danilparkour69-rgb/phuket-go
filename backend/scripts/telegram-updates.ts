import 'dotenv/config'

import { z } from 'zod'

const telegramApiBaseUrl = 'https://api.telegram.org'

const telegramUpdateResponseSchema = z.object({
  ok: z.boolean(),
  result: z.array(
    z.object({
      update_id: z.number().int(),
      message: z
        .object({
          text: z.string().optional(),
          chat: z.object({
            id: z.union([z.number().int(), z.string()]),
            type: z.string(),
            title: z.string().optional(),
            username: z.string().optional(),
            first_name: z.string().optional(),
            last_name: z.string().optional(),
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
          data: z.string().optional(),
          from: z.object({
            id: z.number().int(),
            username: z.string().optional(),
            first_name: z.string().optional(),
            last_name: z.string().optional(),
          }),
          message: z
            .object({
              chat: z.object({
                id: z.union([z.number().int(), z.string()]),
                type: z.string(),
                title: z.string().optional(),
                username: z.string().optional(),
                first_name: z.string().optional(),
                last_name: z.string().optional(),
              }),
            })
            .optional(),
        })
        .optional(),
    }),
  ),
})

const botToken = normalizeRequiredText(process.env.TELEGRAM_BOT_TOKEN, 'TELEGRAM_BOT_TOKEN')
const response = await fetch(`${telegramApiBaseUrl}/bot${botToken}/getUpdates`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ limit: 20 }),
})

if (!response.ok) {
  console.error(`Telegram getUpdates failed with status ${response.status}.`)
  console.error('Check TELEGRAM_BOT_TOKEN and make sure no webhook is currently blocking getUpdates.')
  process.exit(1)
}

const body = telegramUpdateResponseSchema.parse(await response.json())
if (!body.ok) {
  console.error('Telegram getUpdates returned ok=false.')
  process.exit(1)
}

if (body.result.length === 0) {
  console.info('No Telegram updates found. Ask the admin/partner to send /start to the bot, then run again.')
  process.exit(0)
}

for (const update of body.result) {
  const source = update.message ?? update.callback_query?.message
  const actor = update.message?.from ?? update.callback_query?.from
  const chat = source?.chat
  if (!chat) continue

  console.info(
    [
      `update_id=${update.update_id}`,
      `chat_id=${String(chat.id)}`,
      `chat_type=${chat.type}`,
      `chat_name=${chatName(chat)}`,
      `from=${actorName(actor)}`,
      update.message?.text ? `text=${update.message.text}` : null,
      update.callback_query?.data ? `callback=${update.callback_query.data}` : null,
    ]
      .filter(Boolean)
      .join(' | '),
  )
}

function normalizeRequiredText(value: string | undefined, key: string) {
  const trimmed = value?.trim()
  if (!trimmed) {
    console.error(`${key} is required.`)
    process.exit(1)
  }

  return trimmed
}

function chatName(chat: {
  title?: string
  username?: string
  first_name?: string
  last_name?: string
}) {
  return chat.title ?? actorName(chat)
}

function actorName(actor: { username?: string; first_name?: string; last_name?: string } | undefined) {
  if (!actor) return 'unknown'
  if (actor.username) return `@${actor.username}`
  return [actor.first_name, actor.last_name].filter(Boolean).join(' ') || 'unknown'
}
