import { SignJWT, importPKCS8 } from 'jose'

import type { AppEnv } from '../env'

const googleSheetsScope = 'https://www.googleapis.com/auth/spreadsheets'
const googleOauthTokenUrl = 'https://oauth2.googleapis.com/token'
const googleSheetsApiBaseUrl = 'https://sheets.googleapis.com/v4/spreadsheets'

export type LeadSheetsSink = {
  appendLead(input: LeadSheetsRowInput): Promise<void>
  syncLeadSnapshot(input: LeadSheetsRowInput): Promise<LeadSheetsSyncResult>
  updateLeadStatus(input: LeadSheetsStatusUpdateInput): Promise<void>
  updateLeadPartnerNote(input: LeadSheetsPartnerNoteUpdateInput): Promise<void>
}

export type LeadSheetsSyncResult = {
  mode: 'disabled' | 'updated' | 'appended'
}

export type LeadSheetsConfig = {
  spreadsheetId: string
  sheetName: string
  serviceAccountEmail: string
  privateKey: string
}

type LeadSheetsFetch = (input: string | URL, init?: RequestInit) => Promise<Response>

class LeadSheetsRowNotFoundError extends Error {
  constructor() {
    super('Google Sheets lead row was not found')
  }
}

export type LeadSheetsRowInput = {
  lead: {
    id: string
    publicNumber: string
    createdAt: Date
    updatedAt: Date
    status: string
    source: string
    serviceType: string
    sourcePage: string | null
    customerName: string
    customerPhone: string
    customerTelegram: string | null
    requestedDate: Date | null
    peopleCount: number | null
    comment: string | null
    userId: string | null
    excursionId: string | null
    excursionTitle: string
    partnerId: string
    priceThb: number | null
    priceRub: number | null
    commissionThb: number
    commissionTotal: number | null
  }
  excursion: {
    slug: string | null
    categoryTitle: string
    rubRate: number | string | null
    rateDate: Date | null
  }
  partner: {
    name: string
    telegramUsername: string | null
  }
}

export type LeadSheetsStatusUpdateInput = {
  leadId: string
  status: string
  updatedAt: Date
  changedAt: Date
  actorType: 'partner' | 'admin' | 'system'
  actorId: string | null
}

export type LeadSheetsPartnerNoteUpdateInput = {
  leadId: string
  partnerNote: string
  updatedAt: Date
  changedAt: Date
  actorType: 'partner' | 'admin' | 'system'
  actorId: string | null
}

export class NoopLeadSheetsSink implements LeadSheetsSink {
  async appendLead(_input: LeadSheetsRowInput) {}
  async syncLeadSnapshot(_input: LeadSheetsRowInput) {
    return { mode: 'disabled' } satisfies LeadSheetsSyncResult
  }
  async updateLeadStatus(_input: LeadSheetsStatusUpdateInput) {}
  async updateLeadPartnerNote(_input: LeadSheetsPartnerNoteUpdateInput) {}
}

export class GoogleSheetsLeadSink implements LeadSheetsSink {
  constructor(
    private readonly config: LeadSheetsConfig,
    private readonly fetcher: LeadSheetsFetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async appendLead(input: LeadSheetsRowInput) {
    const token = await this.fetchAccessToken()
    await this.appendLeadWithToken(input, token)
  }

  async syncLeadSnapshot(input: LeadSheetsRowInput) {
    const token = await this.fetchAccessToken()
    const rowNumber = await this.findLeadRowNumber(input.lead.id, token).catch((error: unknown) => {
      if (error instanceof LeadSheetsRowNotFoundError) return null
      throw error
    })

    if (rowNumber === null) {
      await this.appendLeadWithToken(input, token)
      return { mode: 'appended' } satisfies LeadSheetsSyncResult
    }

    const response = await this.fetcher(this.batchUpdateUrl(), {
      method: 'POST',
      headers: this.authJsonHeaders(token),
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: rowNumberRange('A:AY', rowNumber),
            values: [buildLeadSheetsRow(input)],
          },
        ],
      }),
    })

    if (!response.ok) {
      throw new Error(`Google Sheets snapshot sync failed with status ${response.status}`)
    }

    return { mode: 'updated' } satisfies LeadSheetsSyncResult
  }

  async updateLeadStatus(input: LeadSheetsStatusUpdateInput) {
    const token = await this.fetchAccessToken()
    const rowNumber = await this.findLeadRowNumber(input.leadId, token)
    const response = await this.fetcher(this.batchUpdateUrl(), {
      method: 'POST',
      headers: this.authJsonHeaders(token),
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: buildLeadSheetsStatusUpdateRanges(input, rowNumber),
      }),
    })

    if (!response.ok) {
      throw new Error(`Google Sheets status update failed with status ${response.status}`)
    }
  }

  async updateLeadPartnerNote(input: LeadSheetsPartnerNoteUpdateInput) {
    const token = await this.fetchAccessToken()
    const rowNumber = await this.findLeadRowNumber(input.leadId, token)
    const response = await this.fetcher(this.batchUpdateUrl(), {
      method: 'POST',
      headers: this.authJsonHeaders(token),
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: buildLeadSheetsPartnerNoteUpdateRanges(input, rowNumber),
      }),
    })

    if (!response.ok) {
      throw new Error(`Google Sheets partner note update failed with status ${response.status}`)
    }
  }

  private async findLeadRowNumber(leadId: string, token: string) {
    const response = await this.fetcher(this.valuesUrl('A:A'), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Google Sheets lead lookup failed with status ${response.status}`)
    }

    const body = await response.json()
    if (!isValuesResponse(body)) {
      throw new Error('Google Sheets lead lookup response is invalid')
    }

    const rowIndex = body.values.findIndex((row) => row[0] === leadId)
    if (rowIndex < 0) {
      throw new LeadSheetsRowNotFoundError()
    }

    return rowIndex + 1
  }

  private async appendLeadWithToken(input: LeadSheetsRowInput, token: string) {
    const url = this.valuesUrl('A:AY:append')
    url.searchParams.set('valueInputOption', 'USER_ENTERED')
    url.searchParams.set('insertDataOption', 'INSERT_ROWS')

    const response = await this.fetcher(url, {
      method: 'POST',
      headers: this.authJsonHeaders(token),
      body: JSON.stringify({
        values: [buildLeadSheetsRow(input)],
      }),
    })

    if (!response.ok) {
      throw new Error(`Google Sheets append failed with status ${response.status}`)
    }
  }

  private valuesUrl(range: string) {
    return new URL(
      `${googleSheetsApiBaseUrl}/${encodeURIComponent(this.config.spreadsheetId)}/values/${encodeURIComponent(
        this.config.sheetName,
      )}!${range}`,
    )
  }

  private batchUpdateUrl() {
    return new URL(
      `${googleSheetsApiBaseUrl}/${encodeURIComponent(this.config.spreadsheetId)}/values:batchUpdate`,
    )
  }

  private authJsonHeaders(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  }

  private async fetchAccessToken() {
    const now = Math.floor(this.now().getTime() / 1000)
    const privateKey = await importPKCS8(this.config.privateKey, 'RS256')
    const assertion = await new SignJWT({
      iss: this.config.serviceAccountEmail,
      scope: googleSheetsScope,
      aud: googleOauthTokenUrl,
      iat: now,
      exp: now + 3600,
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .sign(privateKey)
    const response = await this.fetcher(googleOauthTokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    })

    if (!response.ok) {
      throw new Error(`Google OAuth token request failed with status ${response.status}`)
    }

    const body = await response.json()
    if (!isAccessTokenResponse(body)) {
      throw new Error('Google OAuth token response is invalid')
    }

    return body.access_token
  }
}

export function createLeadSheetsSinkFromEnv(env: AppEnv): LeadSheetsSink {
  const config = leadSheetsConfigFromEnv(env)
  return config ? new GoogleSheetsLeadSink(config) : new NoopLeadSheetsSink()
}

export function leadSheetsConfigFromEnv(env: AppEnv): LeadSheetsConfig | null {
  if (!env.GOOGLE_SHEETS_ENABLED) return null

  if (
    !env.GOOGLE_SHEETS_SPREADSHEET_ID ||
    !env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    !env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  ) {
    return null
  }

  return {
    spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
    sheetName: env.GOOGLE_SHEETS_LEADS_SHEET_NAME,
    serviceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  }
}

export function buildLeadSheetsRow(input: LeadSheetsRowInput) {
  const lead = input.lead
  const peopleCount = lead.peopleCount
  const commissionTotal =
    lead.commissionTotal ?? (peopleCount === null ? null : lead.commissionThb * peopleCount)

  return [
    lead.id,
    lead.publicNumber,
    iso(lead.createdAt),
    iso(lead.updatedAt),
    enumValue(lead.status),
    enumValue(lead.source),
    lead.sourcePage ?? '',
    'Thailand',
    'Phuket',
    'ru',
    enumValue(lead.serviceType),
    input.excursion.categoryTitle,
    lead.excursionId ?? '',
    input.excursion.slug ?? '',
    lead.excursionTitle,
    lead.partnerId,
    input.partner.name,
    input.partner.telegramUsername ?? '',
    lead.customerName,
    lead.customerPhone,
    lead.customerTelegram ?? '',
    dateOnly(lead.requestedDate),
    peopleCount ?? '',
    lead.comment ?? '',
    lead.userId ? 'no' : 'yes',
    lead.userId ?? '',
    lead.userId ? 'user' : 'guest',
    lead.priceThb ?? '',
    lead.priceRub ?? '',
    input.excursion.rubRate ?? '',
    dateOnly(input.excursion.rateDate),
    lead.priceRub === null ? 'no' : 'yes',
    lead.commissionThb,
    commissionTotal ?? '',
    'not_accrued',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'not_migrated',
  ]
}

export function buildLeadSheetsStatusUpdateRanges(
  input: LeadSheetsStatusUpdateInput,
  rowNumber: number,
) {
  const status = enumValue(input.status)
  const changedAt = iso(input.changedAt)

  return [
    {
      range: `${rowNumberRange('D:E', rowNumber)}`,
      values: [[iso(input.updatedAt), status]],
    },
    {
      range: rowNumberRange(statusTimestampColumn(status), rowNumber),
      values: [[changedAt]],
    },
    {
      range: rowNumberRange('AP:AR', rowNumber),
      values: [[input.actorType, input.actorId ?? '', changedAt]],
    },
  ]
}

export function buildLeadSheetsPartnerNoteUpdateRanges(
  input: LeadSheetsPartnerNoteUpdateInput,
  rowNumber: number,
) {
  const changedAt = iso(input.changedAt)

  return [
    {
      range: rowNumberRange('D:D', rowNumber),
      values: [[iso(input.updatedAt)]],
    },
    {
      range: rowNumberRange('AP:AR', rowNumber),
      values: [[input.actorType, input.actorId ?? '', changedAt]],
    },
    {
      range: rowNumberRange('AT:AT', rowNumber),
      values: [[input.partnerNote]],
    },
  ]
}

function isAccessTokenResponse(value: unknown): value is { access_token: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'access_token' in value &&
    typeof value.access_token === 'string' &&
    value.access_token.length > 0
  )
}

function isValuesResponse(value: unknown): value is { values: string[][] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'values' in value &&
    Array.isArray(value.values) &&
    value.values.every(
      (row) => Array.isArray(row) && row.every((cell) => typeof cell === 'string'),
    )
  )
}

function rowNumberRange(columns: string, rowNumber: number) {
  const [start, end] = columns.split(':')
  return `${start}${rowNumber}:${end}${rowNumber}`
}

function statusTimestampColumn(status: string) {
  if (status === 'accepted') return 'AK:AK'
  if (status === 'paid') return 'AM:AM'
  if (status === 'completed') return 'AN:AN'
  if (status === 'cancelled') return 'AO:AO'
  return 'AL:AL'
}

function iso(value: Date) {
  return value.toISOString()
}

function dateOnly(value: Date | null) {
  if (!value) return ''
  return value.toISOString().slice(0, 10)
}

function enumValue(value: string) {
  return value.toLowerCase()
}
