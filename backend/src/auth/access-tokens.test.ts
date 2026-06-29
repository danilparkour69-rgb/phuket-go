import { describe, expect, test } from 'bun:test'

import type { AppEnv } from '../env'
import { signAccessToken, verifyAccessToken } from './access-tokens'

const env: AppEnv = {
  PORT: 3000,
  DATABASE_URL: 'postgresql://superuser:superpassword@localhost:54329/phuket_go',
  JWT_SECRET: '12345678901234567890123456789012',
  CORS_ORIGINS: ['http://localhost:5173'],
  ACCESS_TOKEN_TTL_SECONDS: 60,
  REFRESH_TOKEN_TTL_DAYS: 30,
  COOKIE_SECURE: false,
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
}

describe('access tokens', () => {
  test('signs and verifies session-scoped JWT payloads', async () => {
    const token = await signAccessToken(
      {
        sub: 'user_1',
        sessionId: 'session_1',
        email: 'user@example.com',
      },
      env,
    )

    await expect(verifyAccessToken(token, env)).resolves.toEqual({
      sub: 'user_1',
      sessionId: 'session_1',
      email: 'user@example.com',
    })
  })
})
