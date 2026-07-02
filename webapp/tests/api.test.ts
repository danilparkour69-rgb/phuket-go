import { afterEach, expect, test } from 'bun:test'
import type { AdminLeadDto } from '@phuket-go/contracts'

import { ApiClient } from '../src/lib/api'
import { bootstrapAuthSession } from '../src/lib/bootstrap-auth'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('ApiClient refreshes and retries authenticated requests with the new access token', async () => {
  let accessToken: string | null = 'expired-access-token'
  const calls: Array<{ path: string; authorization: string | null }> = []

  globalThis.fetch = async (input, init) => {
    const url = String(input)
    const path = new URL(url).pathname
    const headers = new Headers(init?.headers)
    calls.push({ path, authorization: headers.get('Authorization') })

    const meCallCount = calls.filter((call) => call.path === '/api/auth/me').length

    if (path === '/api/auth/me' && meCallCount === 1) {
      return json({ error: { code: 'UNAUTHORIZED', message: 'Expired access token' } }, 401)
    }

    if (path === '/api/auth/refresh') {
      return json({ accessToken: 'fresh-access-token' }, 200)
    }

    if (path === '/api/auth/me') {
      return json(
        {
          user: {
            id: 'user_1',
            email: 'user@example.com',
            displayName: null,
            createdAt: '2026-05-11T00:00:00.000Z',
          },
        },
        200,
      )
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404)
  }

  const client = new ApiClient({
    getAccessToken: () => accessToken,
    setAccessToken: (nextAccessToken) => {
      accessToken = nextAccessToken
    },
  })

  const response = await client.me()
  const meCalls = calls.filter((call) => call.path === '/api/auth/me')

  expect(response.user.email).toBe('user@example.com')
  expect(meCalls).toHaveLength(2)
  expect(meCalls[0]?.authorization).toBe('Bearer expired-access-token')
  expect(meCalls[1]?.authorization).toBe('Bearer fresh-access-token')
})

test('ApiClient shares one refresh across concurrent unauthorized requests', async () => {
  let accessToken: string | null = 'expired-access-token'
  const calls: Array<{ path: string; authorization: string | null; credentials: RequestCredentials | undefined }> = []

  globalThis.fetch = async (input, init) => {
    const url = String(input)
    const path = new URL(url).pathname
    const headers = new Headers(init?.headers)
    const authorization = headers.get('Authorization')
    calls.push({ path, authorization, credentials: init?.credentials })

    if (path === '/api/auth/refresh') {
      await new Promise((resolve) => setTimeout(resolve, 0))
      return json({ accessToken: 'fresh-access-token' }, 200)
    }

    if (path === '/api/auth/me' && authorization === 'Bearer fresh-access-token') {
      return json(
        {
          user: {
            id: 'user_1',
            email: 'user@example.com',
            displayName: null,
            createdAt: '2026-05-11T00:00:00.000Z',
          },
        },
        200,
      )
    }

    if (path === '/api/auth/me') {
      return json({ error: { code: 'UNAUTHORIZED', message: 'Expired access token' } }, 401)
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404)
  }

  const client = new ApiClient({
    getAccessToken: () => accessToken,
    setAccessToken: (nextAccessToken) => {
      accessToken = nextAccessToken
    },
  })

  const [first, second] = await Promise.all([client.me(), client.me()])
  const refreshCalls = calls.filter((call) => call.path === '/api/auth/refresh')
  const meCalls = calls.filter((call) => call.path === '/api/auth/me')

  expect(first.user.email).toBe('user@example.com')
  expect(second.user.email).toBe('user@example.com')
  expect(refreshCalls).toHaveLength(1)
  expect(meCalls).toHaveLength(4)
  expect(meCalls.filter((call) => call.authorization === 'Bearer expired-access-token')).toHaveLength(2)
  expect(meCalls.filter((call) => call.authorization === 'Bearer fresh-access-token')).toHaveLength(2)
  expect(calls.every((call) => call.credentials === 'include')).toBe(true)
})

test('ApiClient clears session when refresh fails during an authenticated request', async () => {
  let accessToken: string | null = 'expired-access-token'
  let authExpiredCalls = 0
  const calls: Array<{ path: string; authorization: string | null }> = []

  globalThis.fetch = async (input, init) => {
    const url = String(input)
    const path = new URL(url).pathname
    const headers = new Headers(init?.headers)
    calls.push({ path, authorization: headers.get('Authorization') })

    if (path === '/api/auth/me') {
      return json({ error: { code: 'UNAUTHORIZED', message: 'Expired access token' } }, 401)
    }

    if (path === '/api/auth/refresh') {
      return json({ error: { code: 'UNAUTHORIZED', message: 'Invalid refresh token' } }, 401)
    }

    if (path === '/api/auth/logout') {
      return new Response(null, { status: 204 })
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404)
  }

  const client = new ApiClient({
    getAccessToken: () => accessToken,
    setAccessToken: (nextAccessToken) => {
      accessToken = nextAccessToken
    },
    onAuthExpired: () => {
      authExpiredCalls += 1
    },
  })

  await expect(client.me()).rejects.toMatchObject({
    status: 401,
    code: 'UNAUTHORIZED',
  })

  expect(accessToken).toBeNull()
  expect(authExpiredCalls).toBe(1)
  expect(calls.map((call) => call.path)).toEqual([
    '/api/auth/me',
    '/api/auth/refresh',
    '/api/auth/logout',
  ])
})

test('ApiClient preserves backend error status, code, and message', async () => {
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname

    if (path === '/api/auth/register') {
      return json(
        {
          error: {
            code: 'CONFLICT',
            message: 'User with this email already exists',
          },
        },
        409,
      )
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404)
  }

  const client = new ApiClient({
    getAccessToken: () => null,
    setAccessToken: () => undefined,
  })

  await expect(
    client.register({
      email: 'dupe@example.com',
      password: 'password123',
    }),
  ).rejects.toMatchObject({
    status: 409,
    code: 'CONFLICT',
    message: 'User with this email already exists',
  })
})

test('ApiClient expireSession clears stale web session cookie through logout', async () => {
  let accessToken: string | null = 'stale-access-token'
  let authExpiredCalls = 0
  const calls: Array<{ path: string; method: string | undefined }> = []

  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname
    calls.push({ path, method: init?.method })

    if (path === '/api/auth/logout') {
      return new Response(null, { status: 204 })
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404)
  }

  const client = new ApiClient({
    getAccessToken: () => accessToken,
    setAccessToken: (nextAccessToken) => {
      accessToken = nextAccessToken
    },
    onAuthExpired: () => {
      authExpiredCalls += 1
    },
  })

  await client.expireSession()

  expect(accessToken).toBeNull()
  expect(authExpiredCalls).toBe(1)
  expect(calls).toEqual([{ path: '/api/auth/logout', method: 'POST' }])
})

test('ApiClient calls admin lead list and detail endpoints with auth', async () => {
  const calls: Array<{ path: string; search: string; authorization: string | null }> = []

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    calls.push({
      path: url.pathname,
      search: url.search,
      authorization: headers.get('Authorization'),
    })

    if (url.pathname === '/api/admin/leads') {
      return json(
        {
          leads: [adminLeadFixture()],
          summary: {
            total: 4,
            new: 2,
            requiresAttention: 1,
            waitingPartner: 1,
          },
          total: 1,
          limit: 50,
          offset: 0,
        },
        200,
      )
    }

    if (url.pathname === '/api/admin/leads/lead-1') {
      return json(adminLeadDetailFixture(), 200)
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404)
  }

  const client = new ApiClient({
    getAccessToken: () => 'admin-access-token',
    setAccessToken: () => undefined,
  })

  const list = await client.listAdminLeads({
    status: 'accepted',
    serviceType: 'excursion',
    search: '  Даниил  ',
    partnerId: 'partner-1',
    createdFrom: '2026-06-30',
    requiresAttention: true,
  })
  const detail = await client.getAdminLead('lead-1')

  expect(list.leads[0]?.publicNumber).toBe('PG-20260630-ABC12345')
  expect(detail.statusHistory[0]?.actorType).toBe('system')
  expect(calls).toEqual([
    {
      path: '/api/admin/leads',
      search:
        '?status=accepted&serviceType=excursion&search=%D0%94%D0%B0%D0%BD%D0%B8%D0%B8%D0%BB&partnerId=partner-1&createdFrom=2026-06-30&requiresAttention=true&sortBy=created_at&sortDirection=desc&limit=50&offset=0',
      authorization: 'Bearer admin-access-token',
    },
    {
      path: '/api/admin/leads/lead-1',
      search: '',
      authorization: 'Bearer admin-access-token',
    },
  ])
})

test('ApiClient sends admin lead status quick action payload', async () => {
  let body: unknown

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    body = init?.body ? JSON.parse(String(init.body)) : undefined

    if (url.pathname === '/api/admin/leads/lead-1/status') {
      return json(adminLeadDetailFixture({ status: 'cancelled', adminNote: 'Вернули деньги' }), 200)
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404)
  }

  const client = new ApiClient({
    getAccessToken: () => 'admin-access-token',
    setAccessToken: () => undefined,
  })

  const response = await client.updateAdminLeadStatus('lead-1', {
    status: 'cancelled',
    adminNote: '  Вернули деньги  ',
    comment: 'Клиент отменил',
  })

  expect(response.lead.status).toBe('cancelled')
  expect(body).toEqual({
    status: 'cancelled',
    adminNote: 'Вернули деньги',
    comment: 'Клиент отменил',
  })
})

test('ApiClient calls admin partner options endpoint with auth', async () => {
  const calls: Array<{ path: string; authorization: string | null }> = []

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    calls.push({
      path: url.pathname,
      authorization: headers.get('Authorization'),
    })

    if (url.pathname === '/api/admin/partners') {
      return json(
        {
          partners: [
            {
              id: 'partner-1',
              name: 'Marusya Travel',
              telegram: '@marusya',
              telegramChatId: '123456',
            },
          ],
        },
        200,
      )
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404)
  }

  const client = new ApiClient({
    getAccessToken: () => 'admin-access-token',
    setAccessToken: () => undefined,
  })

  const response = await client.listAdminPartners()

  expect(response.partners).toEqual([
    {
      id: 'partner-1',
      name: 'Marusya Travel',
      telegram: '@marusya',
      telegramChatId: '123456',
    },
  ])
  expect(calls).toEqual([
    {
      path: '/api/admin/partners',
      authorization: 'Bearer admin-access-token',
    },
  ])
})

test('ApiClient calls admin Telegram contact binding endpoints with auth', async () => {
  const calls: Array<{
    path: string
    method: string | undefined
    authorization: string | null
    body: unknown
  }> = []

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    calls.push({
      path: url.pathname,
      method: init?.method,
      authorization: headers.get('Authorization'),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    })

    if (url.pathname === '/api/admin/telegram/contacts') {
      return json(
        {
          contacts: [
            {
              id: 'contact-1',
              chatId: '123456',
              telegramUserId: '123456',
              username: '@manager',
              displayName: '@manager',
              firstName: 'Manager',
              lastName: null,
              chatType: 'private',
              lastMessageText: '/start',
              lastSeenAt: '2026-07-02T08:00:00.000Z',
              linkedPartnerId: null,
              linkedPartnerName: null,
              createdAt: '2026-07-02T08:00:00.000Z',
              updatedAt: '2026-07-02T08:00:00.000Z',
            },
          ],
        },
        200,
      )
    }

    if (url.pathname === '/api/admin/partners/partner-1/telegram-contact') {
      return json(
        {
          partner: {
            id: 'partner-1',
            name: 'Marusya Travel',
            telegram: '@manager',
            telegramChatId: '123456',
          },
          contact: {
            id: 'contact-1',
            chatId: '123456',
            telegramUserId: '123456',
            username: '@manager',
            displayName: '@manager',
            firstName: 'Manager',
            lastName: null,
            chatType: 'private',
            lastMessageText: '/start',
            lastSeenAt: '2026-07-02T08:00:00.000Z',
            linkedPartnerId: 'partner-1',
            linkedPartnerName: 'Marusya Travel',
            createdAt: '2026-07-02T08:00:00.000Z',
            updatedAt: '2026-07-02T08:00:00.000Z',
          },
          testLead: adminLeadFixture({
            id: 'lead-test-1',
            publicNumber: 'TEST-20260702-ABC12345',
            source: 'admin',
            isTest: true,
            excursionId: null,
            excursionTitle: 'Тестовая заявка Telegram',
            customerName: 'Тестовый клиент Phuket Go',
            customerPhone: '+66000000000',
            customerTelegram: '@test_customer',
            comment: 'Тестовая заявка',
          }),
          testNotificationSent: true,
        },
        200,
      )
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404)
  }

  const client = new ApiClient({
    getAccessToken: () => 'admin-access-token',
    setAccessToken: () => undefined,
  })

  const contacts = await client.listAdminTelegramContacts()
  const binding = await client.bindAdminPartnerTelegramContact('partner-1', {
    contactId: ' contact-1 ',
  })

  expect(contacts.contacts[0]).toMatchObject({
    id: 'contact-1',
    username: '@manager',
  })
  expect(binding.partner.telegramChatId).toBe('123456')
  expect(binding.testLead?.isTest).toBe(true)
  expect(binding.testNotificationSent).toBe(true)
  expect(calls).toEqual([
    {
      path: '/api/admin/telegram/contacts',
      method: 'GET',
      authorization: 'Bearer admin-access-token',
      body: undefined,
    },
    {
      path: '/api/admin/partners/partner-1/telegram-contact',
      method: 'PATCH',
      authorization: 'Bearer admin-access-token',
      body: { contactId: 'contact-1' },
    },
  ])
})

test('ApiClient calls admin service type options endpoint with auth', async () => {
  const calls: Array<{ path: string; authorization: string | null }> = []

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    calls.push({
      path: url.pathname,
      authorization: headers.get('Authorization'),
    })

    if (url.pathname === '/api/admin/service-types') {
      return json(
        {
          serviceTypes: [
            { value: 'excursion', label: 'Экскурсии', isActive: true, sortOrder: 10 },
            { value: 'bike_rental', label: 'Аренда байков', isActive: true, sortOrder: 20 },
          ],
        },
        200,
      )
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404)
  }

  const client = new ApiClient({
    getAccessToken: () => 'admin-access-token',
    setAccessToken: () => undefined,
  })

  const response = await client.listAdminServiceTypes()

  expect(response.serviceTypes[1]).toEqual({
    value: 'bike_rental',
    label: 'Аренда байков',
    isActive: true,
    sortOrder: 20,
  })
  expect(calls).toEqual([
    {
      path: '/api/admin/service-types',
      authorization: 'Bearer admin-access-token',
    },
  ])
})

test('ApiClient creates an admin lead with normalized payload', async () => {
  let body: unknown
  let method: string | undefined

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    body = init?.body ? JSON.parse(String(init.body)) : undefined
    method = init?.method

    if (url.pathname === '/api/admin/leads') {
      return json(
        adminLeadDetailFixture({
          status: 'new',
          source: 'admin',
          serviceType: 'bike_rental',
          excursionId: null,
          excursionTitle: 'Аренда байков',
        }),
        201,
      )
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404)
  }

  const client = new ApiClient({
    getAccessToken: () => 'admin-access-token',
    setAccessToken: () => undefined,
  })

  const response = await client.createAdminLead({
    serviceType: 'bike_rental',
    partnerId: ' partner-1 ',
    customerName: ' Даниил ',
    customerPhone: ' +66990000000 ',
    customerTelegram: '',
    contactChannel: 'telegram',
    requestedDate: '',
    peopleCount: 1,
    comment: ' Нужен байк ',
  })

  expect(method).toBe('POST')
  expect(response.lead.excursionId).toBeNull()
  expect(response.lead.serviceType).toBe('bike_rental')
  expect(body).toEqual({
    serviceType: 'bike_rental',
    partnerId: 'partner-1',
    customerName: 'Даниил',
    customerPhone: '+66990000000',
    contactChannel: 'telegram',
    peopleCount: 1,
    comment: 'Нужен байк',
  })
})

test('ApiClient lists public excursions for admin lead creation', async () => {
  const calls: Array<{ path: string; search: string }> = []

  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    calls.push({ path: url.pathname, search: url.search })

    if (url.pathname === '/api/catalog/excursions') {
      return json(
        {
          excursions: [
            {
              id: 'excursion-1',
              slug: 'phi-phi',
              title: 'Острова Пхи-Пхи',
              categorySlug: 'islands',
              shortEmotion: 'Море',
              priceFromRub: 3900,
              priceFromThb: 1500,
              currencyNote: 'Цена рассчитана по текущему курсу.',
              duration: null,
              coverPhotoUrl: null,
              carouselPhotoUrls: [],
              externalRating: null,
              status: 'published',
            },
          ],
        },
        200,
      )
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404)
  }

  const client = new ApiClient({
    getAccessToken: () => null,
    setAccessToken: () => undefined,
  })

  const response = await client.listExcursions()

  expect(response.excursions[0]?.title).toBe('Острова Пхи-Пхи')
  expect(calls).toEqual([{ path: '/api/catalog/excursions', search: '' }])
})

test('ApiClient sends customer lead follow-up details without auth', async () => {
  let body: unknown
  let method: string | undefined
  let authorization: string | null = null

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    method = init?.method
    authorization = headers.get('Authorization')
    body = init?.body ? JSON.parse(String(init.body)) : undefined

    if (url.pathname === '/api/catalog/leads/lead-1/follow-up') {
      return json(
        {
          lead: adminLeadFixture({
            requestedDate: null,
            comment: 'Подойдут 12 или 13 июля, утром',
          }),
        },
        200,
      )
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404)
  }

  const client = new ApiClient({
    getAccessToken: () => 'ignored-access-token',
    setAccessToken: () => undefined,
  })

  const response = await client.updateLeadFollowUp('lead-1', {
    requestedDate: '',
    comment: ' Подойдут 12 или 13 июля, утром ',
    answers: [
      {
        questionKey: 'desired_dates',
        questionPrompt: ' Какие даты вам удобны? ',
        answer: ' 12 или 13 июля ',
        sortOrder: 10,
      },
    ],
  })

  expect(method).toBe('PATCH')
  expect(authorization).toBeNull()
  expect(response.lead.comment).toBe('Подойдут 12 или 13 июля, утром')
  expect(body).toEqual({
    comment: 'Подойдут 12 или 13 июля, утром',
    answers: [
      {
        questionKey: 'desired_dates',
        questionPrompt: 'Какие даты вам удобны?',
        answer: '12 или 13 июля',
        sortOrder: 10,
      },
    ],
  })
})

test('ApiClient gets customer lead follow-up flow without auth', async () => {
  let authorization: string | null = null

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    authorization = headers.get('Authorization')

    if (url.pathname === '/api/catalog/leads/lead-1/follow-up-flow') {
      return json(
        {
          leadId: 'lead-1',
          publicNumber: 'PG-20260630-ABC12345',
          serviceType: 'excursion',
          serviceTitle: 'Квадроциклы',
          questions: [
            {
              key: 'desired_dates',
              kind: 'text',
              prompt: 'Какие даты вам удобны?',
              placeholder: 'Например: 12 или 13 июля, лучше утром',
              isRequired: false,
              sortOrder: 10,
            },
            {
              key: 'prepare_passport',
              kind: 'instruction',
              prompt: 'Пожалуйста, подготовьте паспорт. Он может понадобиться менеджеру для оформления.',
              placeholder: null,
              isRequired: false,
              sortOrder: 90,
            },
          ],
          finalMessage: 'Все отлично, в ближайшее время менеджер с вами свяжется.',
        },
        200,
      )
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404)
  }

  const client = new ApiClient({
    getAccessToken: () => 'ignored-access-token',
    setAccessToken: () => undefined,
  })

  const response = await client.getLeadFollowUpFlow('lead-1')

  expect(authorization).toBeNull()
  expect(response.serviceTitle).toBe('Квадроциклы')
  expect(response.questions.at(-1)).toMatchObject({
    key: 'prepare_passport',
    kind: 'instruction',
  })
  expect(response.finalMessage).toContain('менеджер')
})

test('ApiClient downloads admin lead CSV export with filters', async () => {
  const calls: Array<{ path: string; search: string; authorization: string | null }> = []

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    calls.push({
      path: url.pathname,
      search: url.search,
      authorization: headers.get('Authorization'),
    })

    if (url.pathname === '/api/admin/leads/export.csv') {
      return new Response('public_number,status\r\nPG-1,new\r\n', {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
        },
      })
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404)
  }

  const client = new ApiClient({
    getAccessToken: () => 'admin-access-token',
    setAccessToken: () => undefined,
  })

  const csv = await client.exportAdminLeadsCsv({
    serviceType: 'excursion',
    search: '  Marusya  ',
    requiresAttention: true,
    sortBy: 'updated_at',
    sortDirection: 'asc',
  })

  expect(await csv.text()).toBe('public_number,status\r\nPG-1,new\r\n')
  expect(calls).toEqual([
    {
      path: '/api/admin/leads/export.csv',
      search: '?serviceType=excursion&search=Marusya&requiresAttention=true&sortBy=updated_at&sortDirection=asc',
      authorization: 'Bearer admin-access-token',
    },
  ])
})

test('ApiClient sends admin lead bulk status payload', async () => {
  let body: unknown
  let path: string | undefined

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    path = url.pathname
    body = init?.body ? JSON.parse(String(init.body)) : undefined

    if (url.pathname === '/api/admin/leads/bulk/status') {
      return json(
        {
          requestedCount: 2,
          updatedCount: 2,
          historyCount: 2,
        },
        200,
      )
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404)
  }

  const client = new ApiClient({
    getAccessToken: () => 'admin-access-token',
    setAccessToken: () => undefined,
  })

  const response = await client.bulkUpdateAdminLeadStatus({
    leadIds: [' lead-1 ', 'lead-2'],
    status: 'waiting_partner',
    comment: '  Передали партнеру  ',
  })

  expect(response).toEqual({
    requestedCount: 2,
    updatedCount: 2,
    historyCount: 2,
  })
  expect(path).toBe('/api/admin/leads/bulk/status')
  expect(body).toEqual({
    leadIds: ['lead-1', 'lead-2'],
    status: 'waiting_partner',
    comment: 'Передали партнеру',
  })
})

test('ApiClient sends admin lead Google Sheets sync request', async () => {
  let path: string | undefined
  let method: string | undefined

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    path = url.pathname
    method = init?.method

    if (url.pathname === '/api/admin/leads/lead-1/google-sheets-sync') {
      return json(
        {
          synced: true,
          mode: 'updated',
        },
        200,
      )
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404)
  }

  const client = new ApiClient({
    getAccessToken: () => 'admin-access-token',
    setAccessToken: () => undefined,
  })

  const response = await client.syncAdminLeadGoogleSheets('lead-1')

  expect(response).toEqual({
    synced: true,
    mode: 'updated',
  })
  expect(path).toBe('/api/admin/leads/lead-1/google-sheets-sync')
  expect(method).toBe('POST')
})

test('ApiClient sends admin lead note payload without status action', async () => {
  let body: unknown
  let path: string | undefined

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    path = url.pathname
    body = init?.body ? JSON.parse(String(init.body)) : undefined

    if (url.pathname === '/api/admin/leads/lead-1/admin-note') {
      return json(adminLeadDetailFixture({ adminNote: 'Проверить оплату' }), 200)
    }

    return json({ error: { code: 'NOT_FOUND', message: 'Unexpected request' } }, 404)
  }

  const client = new ApiClient({
    getAccessToken: () => 'admin-access-token',
    setAccessToken: () => undefined,
  })

  const response = await client.updateAdminLeadAdminNote('lead-1', {
    adminNote: '  Проверить оплату  ',
  })

  expect(response.lead.adminNote).toBe('Проверить оплату')
  expect(path).toBe('/api/admin/leads/lead-1/admin-note')
  expect(body).toEqual({
    adminNote: 'Проверить оплату',
  })
})

test('bootstrapAuthSession waits for stale-cookie cleanup before completing', async () => {
  const events: string[] = []
  let completed = false
  let finishCleanup!: () => void
  const cleanupFinished = new Promise<void>((resolve) => {
    finishCleanup = resolve
  })

  const bootstrap = bootstrapAuthSession({
    api: {
      refresh: async () => {
        events.push('refresh')
        throw new Error('Invalid refresh token')
      },
      expireSession: async () => {
        events.push('cleanup:start')
        await cleanupFinished
        events.push('cleanup:done')
      },
    },
    shouldApply: () => true,
    setAccessToken: () => {
      events.push('setAccessToken')
    },
  }).then(() => {
    completed = true
  })

  await waitForEvent(events, 'cleanup:start')

  expect(completed).toBe(false)
  expect(events).toEqual(['refresh', 'cleanup:start'])

  finishCleanup()
  await bootstrap

  expect(completed).toBe(true)
  expect(events).toEqual(['refresh', 'cleanup:start', 'cleanup:done'])
})

async function waitForEvent(events: string[], event: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (events.includes(event)) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  throw new Error(`Timed out waiting for event: ${event}`)
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

function adminLeadFixture(overrides: Partial<AdminLeadDto> = {}): AdminLeadDto {
  return {
    id: 'lead-1',
    publicNumber: 'PG-20260630-ABC12345',
    status: 'accepted',
    source: 'website',
    isTest: false,
    serviceType: 'excursion',
    sourcePage: '/excursions/phi-phi',
    excursionId: 'excursion-1',
    excursionTitle: 'Острова Пхи-Пхи',
    partnerId: 'partner-1',
    partnerName: 'Marusya Travel',
    partnerTelegram: '@partner',
    userId: null,
    customerName: 'Даниил',
    customerPhone: '+79990000000',
    customerTelegram: '@danil',
    contactChannel: 'telegram',
    requestedDate: null,
    peopleCount: 2,
    comment: 'Хочу утром',
    partnerNote: null,
    adminNote: null,
    adminNoteUpdatedAt: null,
    adminNoteUpdatedById: null,
    adminNoteUpdatedByEmail: null,
    adminNoteUpdatedByDisplayName: null,
    priceRub: 3900,
    priceThb: 1500,
    commissionThb: 100,
    commissionTotal: 200,
    createdAt: '2026-06-30T07:00:00.000Z',
    updatedAt: '2026-06-30T08:00:00.000Z',
    ...overrides,
  }
}

function adminLeadDetailFixture(overrides: Partial<ReturnType<typeof adminLeadFixture>> = {}) {
  return {
    lead: adminLeadFixture(overrides),
    statusHistory: [
      {
        id: 'history-1',
        fromStatus: null,
        toStatus: 'new',
        actorType: 'system',
        actorId: null,
        comment: 'Lead created',
        createdAt: '2026-06-30T07:00:00.000Z',
      },
    ],
  }
}
