import { describe, expect, test } from 'bun:test'

import { createApp } from '../app'
import type { DbClient } from '../db'
import type { AppEnv } from '../env'

const env: AppEnv = {
  PORT: 3000,
  DATABASE_URL: 'postgresql://superuser:superpassword@localhost:54329/phuket_go',
  JWT_SECRET: 'test-route-secret-at-least-thirty-two-chars-123',
  CORS_ORIGINS: ['https://web.example.com'],
  ACCESS_TOKEN_TTL_SECONDS: 60,
  REFRESH_TOKEN_TTL_DAYS: 30,
  COOKIE_SECURE: true,
  SPACES_UPLOAD_MAX_BYTES: 10 * 1024 * 1024,
  SPACES_UPLOAD_URL_TTL_SECONDS: 900,
  SPACES_DOWNLOAD_URL_TTL_SECONDS: 300,
  SPACES_PUBLIC_CACHE_CONTROL: 'public, max-age=31536000, immutable',
  TRIPADVISOR_ALLOW_REFRESH: false,
  TRIPADVISOR_API_BASE_URL: 'https://api.content.tripadvisor.com/api/v1',
  TRIPADVISOR_SYNC_STALE_HOURS: 24,
  TRIPADVISOR_MAX_REQUESTS_PER_RUN: 10,
  TRIPADVISOR_DAILY_MAX_REQUESTS: 200,
  TRIPADVISOR_REQUEST_TIMEOUT_MS: 8000,
  GOOGLE_SHEETS_ENABLED: false,
  GOOGLE_SHEETS_LEADS_SHEET_NAME: 'Заявки',
  TELEGRAM_NOTIFICATIONS_ENABLED: false,
}

describe('auth routes', () => {
  test('allows browser preflight for authenticated PATCH routes', async () => {
    const app = createApp({ env, prisma: {} as DbClient })

    const response = await app.request('/api/admin/leads/lead-1/status', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://web.example.com',
        'Access-Control-Request-Method': 'PATCH',
        'Access-Control-Request-Headers': 'content-type,authorization,x-client-platform',
      },
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-methods')).toContain('PATCH')
    expect(response.headers.get('access-control-allow-origin')).toBe('https://web.example.com')
  })

  test('rejects secure cookie refresh and logout requests from untrusted origins before auth service work', async () => {
    const app = createApp({ env, prisma: {} as DbClient })
    const refreshCookie = `phuket_go_refresh=${'r'.repeat(32)}`

    const noOriginRefresh = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: refreshCookie,
        'X-Client-Platform': 'web',
      },
      body: JSON.stringify({}),
    })
    const noOriginRefreshBody = await noOriginRefresh.json()

    expect(noOriginRefresh.status).toBe(403)
    expect(noOriginRefreshBody.error.code).toBe('FORBIDDEN')

    const untrustedLogout = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: refreshCookie,
        Origin: 'https://attacker.example',
        'X-Client-Platform': 'web',
      },
      body: JSON.stringify({}),
    })
    const untrustedLogoutBody = await untrustedLogout.json()

    expect(untrustedLogout.status).toBe(403)
    expect(untrustedLogoutBody.error.code).toBe('FORBIDDEN')
  })
})
