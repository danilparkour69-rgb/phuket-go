import 'dotenv/config'

import { loadEnv } from '../src/env'
import { TelegramLeadNotifier, leadTelegramConfigFromEnv } from '../src/leads/telegram-notifier'

const partnerChatId = normalizeOptionalText(process.env.TELEGRAM_SMOKE_PARTNER_CHAT_ID)
const env = loadEnv(process.env)
const config = leadTelegramConfigFromEnv(env)

if (!config) {
  console.error(
    'Telegram smoke test skipped: set TELEGRAM_NOTIFICATIONS_ENABLED=true, TELEGRAM_BOT_TOKEN, and TELEGRAM_ADMIN_CHAT_ID.',
  )
  process.exit(1)
}

const notifier = new TelegramLeadNotifier(config)
const smokeId = `SMOKE-${new Date().toISOString()}`
const smokeText = [
  'Phuket Go Telegram smoke test',
  '',
  `Проверка: ${smokeId}`,
  'Если вы видите это сообщение, бот может отправлять уведомления в этот чат.',
  'Реальная заявка не создана.',
].join('\n')

await notifier.sendSmokeMessage(config.adminChatId, smokeText)

if (partnerChatId) {
  await notifier.sendSmokeMessage(partnerChatId, smokeText)
}

console.log(
  partnerChatId
    ? 'Telegram smoke test sent admin and partner messages.'
    : 'Telegram smoke test sent admin message. Set TELEGRAM_SMOKE_PARTNER_CHAT_ID to test partner delivery.',
)

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}
