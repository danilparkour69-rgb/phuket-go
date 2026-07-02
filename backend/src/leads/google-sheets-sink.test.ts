import { describe, expect, test } from 'bun:test'
import { exportPKCS8, generateKeyPair } from 'jose'

import {
  buildLeadSheetsPartnerNoteUpdateRanges,
  buildLeadSheetsRow,
  buildLeadSheetsStatusUpdateRanges,
  GoogleSheetsLeadSink,
  leadSheetsConfigFromEnv,
  NoopLeadSheetsSink,
  type LeadSheetsPartnerNoteUpdateInput,
  type LeadSheetsRowInput,
  type LeadSheetsStatusUpdateInput,
} from './google-sheets-sink'

describe('buildLeadSheetsRow', () => {
  test('maps a complete lead snapshot to the Google Sheets column order', () => {
    const row = buildLeadSheetsRow(fullLeadInput())

    expect(row).toHaveLength(51)
    expect(row.slice(0, 18)).toEqual([
      'lead-1',
      'PG-20260630-ABC12345',
      '2026-06-30T07:00:00.000Z',
      '2026-06-30T07:01:00.000Z',
      'new',
      'website',
      '/excursions/phi-phi',
      'Thailand',
      'Phuket',
      'ru',
      'excursion',
      'Морские туры',
      'excursion-1',
      'phi-phi',
      'Острова Пхи-Пхи',
      'partner-1',
      'Marusya Travel',
      '@partner',
    ])
    expect(row.slice(18, 35)).toEqual([
      'Даниил',
      '+79990000000',
      '@danil',
      '2026-07-10',
      2,
      'Хочу утром',
      'yes',
      '',
      'guest',
      1500,
      3900,
      2.6,
      '2026-06-29',
      'yes',
      100,
      200,
      'not_accrued',
    ])
    expect(row[50]).toBe('not_migrated')
  })

  test('keeps optional fields empty and calculates commission fallback', () => {
    const input = fullLeadInput()
    input.lead.customerTelegram = null
    input.lead.requestedDate = null
    input.lead.comment = null
    input.lead.commissionTotal = null
    input.partner.telegramUsername = null

    const row = buildLeadSheetsRow(input)

    expect(row[17]).toBe('')
    expect(row[20]).toBe('')
    expect(row[21]).toBe('')
    expect(row[23]).toBe('')
    expect(row[33]).toBe(200)
  })

  test('maps non-excursion lead snapshots with empty excursion identifiers', () => {
    const input = fullLeadInput()
    input.lead.serviceType = 'BIKE_RENTAL'
    input.lead.excursionId = null
    input.lead.excursionTitle = 'Аренда байков'
    input.excursion.slug = null
    input.excursion.categoryTitle = 'Аренда байков'
    input.excursion.rubRate = null
    input.excursion.rateDate = null

    const row = buildLeadSheetsRow(input)

    expect(row[10]).toBe('bike_rental')
    expect(row[11]).toBe('Аренда байков')
    expect(row[12]).toBe('')
    expect(row[13]).toBe('')
    expect(row[14]).toBe('Аренда байков')
    expect(row[29]).toBe('')
    expect(row[30]).toBe('')
  })
})

describe('buildLeadSheetsStatusUpdateRanges', () => {
  test('maps accepted status updates to the final Google Sheets status columns', () => {
    expect(buildLeadSheetsStatusUpdateRanges(statusUpdateInput(), 12)).toEqual([
      {
        range: 'D12:E12',
        values: [['2026-06-30T08:01:00.000Z', 'accepted']],
      },
      {
        range: 'AK12:AK12',
        values: [['2026-06-30T08:01:00.000Z']],
      },
      {
        range: 'AP12:AR12',
        values: [['partner', 'partner-1', '2026-06-30T08:01:00.000Z']],
      },
    ])
  })

  test('maps declined status updates to declined_at', () => {
    const input = statusUpdateInput()
    input.status = 'DECLINED'

    const ranges = buildLeadSheetsStatusUpdateRanges(input, 12)

    expect(ranges[1]).toEqual({
      range: 'AL12:AL12',
      values: [['2026-06-30T08:01:00.000Z']],
    })
  })

  test('maps completed status updates to completed_at', () => {
    const input = statusUpdateInput()
    input.status = 'COMPLETED'

    const ranges = buildLeadSheetsStatusUpdateRanges(input, 12)

    expect(ranges[1]).toEqual({
      range: 'AN12:AN12',
      values: [['2026-06-30T08:01:00.000Z']],
    })
  })

  test('maps paid status updates to paid_at', () => {
    const input = statusUpdateInput()
    input.status = 'PAID'

    const ranges = buildLeadSheetsStatusUpdateRanges(input, 12)

    expect(ranges[1]).toEqual({
      range: 'AM12:AM12',
      values: [['2026-06-30T08:01:00.000Z']],
    })
  })
})

describe('buildLeadSheetsPartnerNoteUpdateRanges', () => {
  test('maps partner note updates to final Google Sheets columns', () => {
    expect(buildLeadSheetsPartnerNoteUpdateRanges(partnerNoteUpdateInput(), 12)).toEqual([
      {
        range: 'D12:D12',
        values: [['2026-06-30T08:02:00.000Z']],
      },
      {
        range: 'AP12:AR12',
        values: [['partner', 'partner-1', '2026-06-30T08:02:00.000Z']],
      },
      {
        range: 'AT12:AT12',
        values: [['Клиент не отвечает']],
      },
    ])
  })
})

describe('leadSheetsConfigFromEnv', () => {
  test('returns null when Google Sheets sync is disabled', () => {
    expect(
      leadSheetsConfigFromEnv({
        ...baseEnv(),
        GOOGLE_SHEETS_ENABLED: false,
      }),
    ).toBeNull()
  })
})

describe('GoogleSheetsLeadSink', () => {
  test('requests an OAuth token and appends one lead row', async () => {
    const privateKey = await testPrivateKey()
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      if (calls.length === 1) {
        return jsonResponse({ access_token: 'access-token' })
      }

      return jsonResponse({ updates: { updatedRows: 1 } })
    }
    const sink = new GoogleSheetsLeadSink(
      {
        spreadsheetId: 'spreadsheet-id',
        sheetName: 'Заявки',
        serviceAccountEmail: 'service@example.iam.gserviceaccount.com',
        privateKey,
      },
      fetcher,
      () => new Date('2026-06-30T07:00:00.000Z'),
    )

    await sink.appendLead(fullLeadInput())

    expect(calls).toHaveLength(2)
    expect(calls[0].url).toBe('https://oauth2.googleapis.com/token')
    expect(calls[0].init?.method).toBe('POST')
    expect(String(calls[0].init?.body)).toContain(
      'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer',
    )
    expect(calls[1].url).toContain('/values/%D0%97%D0%B0%D1%8F%D0%B2%D0%BA%D0%B8!A:AY:append')
    expect(calls[1].url).toContain('valueInputOption=USER_ENTERED')
    expect(calls[1].init?.headers).toMatchObject({
      Authorization: 'Bearer access-token',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(calls[1].init?.body)).values[0][0]).toBe('lead-1')
  })

  test('looks up a lead row and updates status columns', async () => {
    const privateKey = await testPrivateKey()
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      if (calls.length === 1) {
        return jsonResponse({ access_token: 'access-token' })
      }
      if (calls.length === 2) {
        return jsonResponse({ values: [['lead-other'], ['lead-1']] })
      }

      return jsonResponse({ totalUpdatedRows: 1 })
    }
    const sink = new GoogleSheetsLeadSink(
      {
        spreadsheetId: 'spreadsheet-id',
        sheetName: 'Заявки',
        serviceAccountEmail: 'service@example.iam.gserviceaccount.com',
        privateKey,
      },
      fetcher,
      () => new Date('2026-06-30T07:00:00.000Z'),
    )

    await sink.updateLeadStatus(statusUpdateInput())

    expect(calls).toHaveLength(3)
    expect(calls[1].url).toContain('/values/%D0%97%D0%B0%D1%8F%D0%B2%D0%BA%D0%B8!A:A')
    expect(calls[1].init?.headers).toMatchObject({
      Authorization: 'Bearer access-token',
    })
    expect(calls[2].url).toContain('/values:batchUpdate')
    expect(calls[2].init?.headers).toMatchObject({
      Authorization: 'Bearer access-token',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(calls[2].init?.body))).toEqual({
      valueInputOption: 'USER_ENTERED',
      data: buildLeadSheetsStatusUpdateRanges(statusUpdateInput(), 2),
    })
  })

  test('looks up a lead row and replaces the full lead snapshot', async () => {
    const privateKey = await testPrivateKey()
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      if (calls.length === 1) {
        return jsonResponse({ access_token: 'access-token' })
      }
      if (calls.length === 2) {
        return jsonResponse({ values: [['lead-other'], ['lead-1']] })
      }

      return jsonResponse({ totalUpdatedRows: 1 })
    }
    const sink = new GoogleSheetsLeadSink(
      {
        spreadsheetId: 'spreadsheet-id',
        sheetName: 'Заявки',
        serviceAccountEmail: 'service@example.iam.gserviceaccount.com',
        privateKey,
      },
      fetcher,
      () => new Date('2026-06-30T07:00:00.000Z'),
    )

    const result = await sink.syncLeadSnapshot(fullLeadInput())

    expect(result).toEqual({ mode: 'updated' })
    expect(calls).toHaveLength(3)
    expect(calls[1].url).toContain('/values/%D0%97%D0%B0%D1%8F%D0%B2%D0%BA%D0%B8!A:A')
    expect(calls[2].url).toContain('/values:batchUpdate')
    expect(JSON.parse(String(calls[2].init?.body))).toEqual({
      valueInputOption: 'USER_ENTERED',
      data: [
        {
        range: 'A2:AY2',
          values: [buildLeadSheetsRow(fullLeadInput())],
        },
      ],
    })
  })

  test('appends a full lead snapshot when the row is not found', async () => {
    const privateKey = await testPrivateKey()
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      if (calls.length === 1) {
        return jsonResponse({ access_token: 'access-token' })
      }
      if (calls.length === 2) {
        return jsonResponse({ values: [['lead-other']] })
      }

      return jsonResponse({ updates: { updatedRows: 1 } })
    }
    const sink = new GoogleSheetsLeadSink(
      {
        spreadsheetId: 'spreadsheet-id',
        sheetName: 'Заявки',
        serviceAccountEmail: 'service@example.iam.gserviceaccount.com',
        privateKey,
      },
      fetcher,
      () => new Date('2026-06-30T07:00:00.000Z'),
    )

    const result = await sink.syncLeadSnapshot(fullLeadInput())

    expect(result).toEqual({ mode: 'appended' })
    expect(calls).toHaveLength(3)
    expect(calls[2].url).toContain('/values/%D0%97%D0%B0%D1%8F%D0%B2%D0%BA%D0%B8!A:AY:append')
    expect(JSON.parse(String(calls[2].init?.body)).values[0][0]).toBe('lead-1')
  })

  test('looks up a lead row and updates partner note columns', async () => {
    const privateKey = await testPrivateKey()
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      if (calls.length === 1) {
        return jsonResponse({ access_token: 'access-token' })
      }
      if (calls.length === 2) {
        return jsonResponse({ values: [['lead-other'], ['lead-1']] })
      }

      return jsonResponse({ totalUpdatedRows: 1 })
    }
    const sink = new GoogleSheetsLeadSink(
      {
        spreadsheetId: 'spreadsheet-id',
        sheetName: 'Заявки',
        serviceAccountEmail: 'service@example.iam.gserviceaccount.com',
        privateKey,
      },
      fetcher,
      () => new Date('2026-06-30T07:00:00.000Z'),
    )

    await sink.updateLeadPartnerNote(partnerNoteUpdateInput())

    expect(calls).toHaveLength(3)
    expect(calls[1].url).toContain('/values/%D0%97%D0%B0%D1%8F%D0%B2%D0%BA%D0%B8!A:A')
    expect(calls[2].url).toContain('/values:batchUpdate')
    expect(JSON.parse(String(calls[2].init?.body))).toEqual({
      valueInputOption: 'USER_ENTERED',
      data: buildLeadSheetsPartnerNoteUpdateRanges(partnerNoteUpdateInput(), 2),
    })
  })

  test('returns controlled errors without secret material', async () => {
    const privateKey = await testPrivateKey()
    const sink = new GoogleSheetsLeadSink(
      {
        spreadsheetId: 'spreadsheet-id',
        sheetName: 'Заявки',
        serviceAccountEmail: 'service@example.iam.gserviceaccount.com',
        privateKey,
      },
      async () => new Response('secret should not be surfaced', { status: 500 }),
    )

    try {
      await sink.appendLead(fullLeadInput())
      throw new Error('Expected Google Sheets sink to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('Google OAuth token request failed with status 500')
      expect((error as Error).message).not.toContain('secret')
    }
  })

  test('returns controlled status update errors without response body material', async () => {
    const privateKey = await testPrivateKey()
    const sink = new GoogleSheetsLeadSink(
      {
        spreadsheetId: 'spreadsheet-id',
        sheetName: 'Заявки',
        serviceAccountEmail: 'service@example.iam.gserviceaccount.com',
        privateKey,
      },
      async (input) => {
        if (String(input) === 'https://oauth2.googleapis.com/token') {
          return jsonResponse({ access_token: 'access-token' })
        }

        return new Response('secret should not be surfaced', { status: 500 })
      },
    )

    try {
      await sink.updateLeadStatus(statusUpdateInput())
      throw new Error('Expected Google Sheets status update to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('Google Sheets lead lookup failed with status 500')
      expect((error as Error).message).not.toContain('secret')
    }
  })
})

describe('NoopLeadSheetsSink', () => {
  test('reports disabled snapshot sync', async () => {
    await expect(new NoopLeadSheetsSink().syncLeadSnapshot(fullLeadInput())).resolves.toEqual({
      mode: 'disabled',
    })
  })
})

function fullLeadInput(): LeadSheetsRowInput {
  return {
    lead: {
      id: 'lead-1',
      publicNumber: 'PG-20260630-ABC12345',
      createdAt: new Date('2026-06-30T07:00:00.000Z'),
      updatedAt: new Date('2026-06-30T07:01:00.000Z'),
      status: 'NEW',
      source: 'WEBSITE',
      serviceType: 'EXCURSION',
      sourcePage: '/excursions/phi-phi',
      customerName: 'Даниил',
      customerPhone: '+79990000000',
      customerTelegram: '@danil',
      requestedDate: new Date('2026-07-10T00:00:00.000Z'),
      peopleCount: 2,
      comment: 'Хочу утром',
      userId: null,
      excursionId: 'excursion-1',
      excursionTitle: 'Острова Пхи-Пхи',
      partnerId: 'partner-1',
      priceThb: 1500,
      priceRub: 3900,
      commissionThb: 100,
      commissionTotal: 200,
    },
    excursion: {
      slug: 'phi-phi',
      categoryTitle: 'Морские туры',
      rubRate: 2.6,
      rateDate: new Date('2026-06-29T00:00:00.000Z'),
    },
    partner: {
      name: 'Marusya Travel',
      telegramUsername: '@partner',
    },
  }
}

function statusUpdateInput(): LeadSheetsStatusUpdateInput {
  return {
    leadId: 'lead-1',
    status: 'ACCEPTED',
    updatedAt: new Date('2026-06-30T08:01:00.000Z'),
    changedAt: new Date('2026-06-30T08:01:00.000Z'),
    actorType: 'partner',
    actorId: 'partner-1',
  }
}

function partnerNoteUpdateInput(): LeadSheetsPartnerNoteUpdateInput {
  return {
    leadId: 'lead-1',
    partnerNote: 'Клиент не отвечает',
    updatedAt: new Date('2026-06-30T08:02:00.000Z'),
    changedAt: new Date('2026-06-30T08:02:00.000Z'),
    actorType: 'partner',
    actorId: 'partner-1',
  }
}

function baseEnv() {
  return {
    PORT: 3000,
    DATABASE_URL: 'postgresql://superuser:superpassword@localhost:54329/phuket_go',
    JWT_SECRET: '12345678901234567890123456789012',
    CORS_ORIGINS: ['http://localhost:5173'],
    ACCESS_TOKEN_TTL_SECONDS: 900,
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
    GOOGLE_SHEETS_ENABLED: false,
    GOOGLE_SHEETS_LEADS_SHEET_NAME: 'Заявки',
    TELEGRAM_NOTIFICATIONS_ENABLED: false,
  }
}

async function testPrivateKey() {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true })
  return exportPKCS8(privateKey)
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
