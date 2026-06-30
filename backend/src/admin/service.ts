import type {
  AdminLeadAdminNoteRequest,
  AdminLeadBulkStatusActionRequest,
  AdminLeadBulkStatusActionResponse,
  AdminLeadDetailResponse,
  AdminLeadDto,
  AdminLeadExportQuery,
  AdminLeadListQuery,
  AdminLeadSheetsSyncResponse,
  AdminLeadStatusActionRequest,
  AdminLeadStatusHistoryItemDto,
  AdminPartnerListResponse,
} from '@phuket-go/contracts'

import type { DbClient } from '../db'
import {
  LeadActorType,
  LeadContactChannel,
  LeadServiceType,
  LeadSource,
  LeadStatus,
  Prisma,
} from '../generated/prisma/client'
import { AppError } from '../http/errors'
import {
  NoopLeadSheetsSink,
  type LeadSheetsRowInput,
  type LeadSheetsSink,
} from '../leads/google-sheets-sink'

const adminLeadCsvExportLimit = 5000
const adminLeadCsvColumns = [
  ['lead_id', (lead: AdminLeadDto) => lead.id],
  ['public_number', (lead: AdminLeadDto) => lead.publicNumber],
  ['status', (lead: AdminLeadDto) => lead.status],
  ['service_type', (lead: AdminLeadDto) => lead.serviceType],
  ['source', (lead: AdminLeadDto) => lead.source],
  ['source_page', (lead: AdminLeadDto) => lead.sourcePage],
  ['created_at', (lead: AdminLeadDto) => lead.createdAt],
  ['updated_at', (lead: AdminLeadDto) => lead.updatedAt],
  ['customer_name', (lead: AdminLeadDto) => lead.customerName],
  ['customer_phone', (lead: AdminLeadDto) => lead.customerPhone],
  ['customer_telegram', (lead: AdminLeadDto) => lead.customerTelegram],
  ['contact_channel', (lead: AdminLeadDto) => lead.contactChannel],
  ['requested_date', (lead: AdminLeadDto) => lead.requestedDate],
  ['people_count', (lead: AdminLeadDto) => lead.peopleCount],
  ['comment', (lead: AdminLeadDto) => lead.comment],
  ['excursion_id', (lead: AdminLeadDto) => lead.excursionId],
  ['excursion_title', (lead: AdminLeadDto) => lead.excursionTitle],
  ['partner_id', (lead: AdminLeadDto) => lead.partnerId],
  ['partner_name', (lead: AdminLeadDto) => lead.partnerName],
  ['partner_telegram', (lead: AdminLeadDto) => lead.partnerTelegram],
  ['partner_note', (lead: AdminLeadDto) => lead.partnerNote],
  ['admin_note', (lead: AdminLeadDto) => lead.adminNote],
  ['price_rub', (lead: AdminLeadDto) => lead.priceRub],
  ['price_thb', (lead: AdminLeadDto) => lead.priceThb],
  ['commission_thb', (lead: AdminLeadDto) => lead.commissionThb],
  ['commission_total_thb', (lead: AdminLeadDto) => lead.commissionTotal],
] as const
type AdminLeadQueryFilters = AdminLeadListQuery | AdminLeadExportQuery

export class AdminService {
  constructor(
    private readonly db: DbClient,
    private readonly leadSheetsSink: LeadSheetsSink = new NoopLeadSheetsSink(),
  ) {}

  async listLeads(query: AdminLeadListQuery) {
    const staleSince = adminLeadAttentionCutoff()
    const where = adminLeadWhere(query, staleSince)
    const [leads, total, summaryTotal, summaryNew, summaryRequiresAttention, summaryWaitingPartner] =
      await this.db.$transaction([
        this.db.lead.findMany({
          where,
          include: adminLeadInclude,
          orderBy: adminLeadOrderBy(query),
          take: query.limit,
          skip: query.offset,
        }),
        this.db.lead.count({ where }),
        this.db.lead.count(),
        this.db.lead.count({ where: { status: LeadStatus.NEW } }),
        this.db.lead.count({ where: adminLeadRequiresAttentionWhere(staleSince) }),
        this.db.lead.count({ where: { status: LeadStatus.WAITING_PARTNER } }),
      ])

    return {
      leads: leads.map(toAdminLeadDto),
      summary: {
        total: summaryTotal,
        new: summaryNew,
        requiresAttention: summaryRequiresAttention,
        waitingPartner: summaryWaitingPartner,
      },
      total,
      limit: query.limit,
      offset: query.offset,
    }
  }

  async listPartners(): Promise<AdminPartnerListResponse> {
    const partners = await this.db.partner.findMany({
      select: {
        id: true,
        name: true,
        telegramUsername: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    })

    return {
      partners: partners.map((partner) => ({
        id: partner.id,
        name: partner.name,
        telegram: partner.telegramUsername,
      })),
    }
  }

  async getLeadDetail(id: string): Promise<AdminLeadDetailResponse> {
    const lead = await this.db.lead.findUnique({
      where: { id },
      include: adminLeadDetailInclude,
    })

    if (!lead) {
      throw new AppError(404, 'NOT_FOUND', 'Lead not found')
    }

    return toAdminLeadDetailResponse(lead)
  }

  async exportLeadsCsv(query: AdminLeadExportQuery): Promise<string> {
    const staleSince = adminLeadAttentionCutoff()
    const leads = await this.db.lead.findMany({
      where: adminLeadWhere(query, staleSince),
      include: adminLeadInclude,
      orderBy: adminLeadOrderBy(query),
      take: adminLeadCsvExportLimit,
    })

    return buildAdminLeadsCsv(leads.map(toAdminLeadDto))
  }

  async syncLeadToGoogleSheets(id: string): Promise<AdminLeadSheetsSyncResponse> {
    const lead = await this.db.lead.findUnique({
      where: { id },
      include: adminLeadSheetsSyncInclude,
    })

    if (!lead) {
      throw new AppError(404, 'NOT_FOUND', 'Lead not found')
    }

    try {
      const result = await this.leadSheetsSink.syncLeadSnapshot(toLeadSheetsRowInput(lead))
      return {
        synced: result.mode !== 'disabled',
        mode: result.mode,
      }
    } catch (error) {
      console.error('Manual Google Sheets lead sync failed', {
        leadId: id,
        message: error instanceof Error ? error.message : 'Unknown Google Sheets error',
      })
      throw new AppError(502, 'INTERNAL_ERROR', 'Google Sheets sync failed')
    }
  }

  async updateLeadStatus(
    id: string,
    input: AdminLeadStatusActionRequest,
    adminUserId: string,
  ): Promise<AdminLeadDetailResponse> {
    const nextStatus = toLeadStatusRecord(input.status)

    await this.db.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          adminNote: true,
        },
      })

      if (!lead) {
        throw new AppError(404, 'NOT_FOUND', 'Lead not found')
      }

      const statusChanged = lead.status !== nextStatus
      const adminNoteChanged = input.adminNote !== undefined && input.adminNote !== lead.adminNote
      const shouldWriteHistory = statusChanged || input.comment !== undefined

      if (statusChanged || adminNoteChanged) {
        await tx.lead.update({
          where: { id },
          data: {
            ...(statusChanged ? { status: nextStatus } : {}),
            ...(input.adminNote !== undefined
              ? {
                  adminNote: input.adminNote,
                  ...(adminNoteChanged
                    ? {
                        adminNoteUpdatedAt: new Date(),
                        adminNoteUpdatedById: adminUserId,
                      }
                    : {}),
                }
              : {}),
          },
        })
      }

      if (shouldWriteHistory) {
        await tx.leadStatusHistory.create({
          data: {
            leadId: id,
            fromStatus: lead.status,
            toStatus: nextStatus,
            actorType: LeadActorType.ADMIN,
            actorId: adminUserId,
            comment:
              input.comment ??
              `Admin changed lead status from ${toLeadStatus(lead.status)} to ${input.status}`,
          },
        })
      }
    })

    return this.getLeadDetail(id)
  }

  async bulkUpdateLeadStatus(
    input: AdminLeadBulkStatusActionRequest,
    adminUserId: string,
  ): Promise<AdminLeadBulkStatusActionResponse> {
    const nextStatus = toLeadStatusRecord(input.status)
    const leadIds = [...new Set(input.leadIds)]

    return this.db.$transaction(async (tx) => {
      const leads = await tx.lead.findMany({
        where: {
          id: {
            in: leadIds,
          },
        },
        select: {
          id: true,
          status: true,
        },
      })

      if (leads.length !== leadIds.length) {
        throw new AppError(404, 'NOT_FOUND', 'One or more leads not found')
      }

      let updatedCount = 0
      let historyCount = 0

      for (const lead of leads) {
        const statusChanged = lead.status !== nextStatus
        const shouldWriteHistory = statusChanged || input.comment !== undefined

        if (statusChanged) {
          await tx.lead.update({
            where: { id: lead.id },
            data: {
              status: nextStatus,
            },
          })
          updatedCount += 1
        }

        if (shouldWriteHistory) {
          await tx.leadStatusHistory.create({
            data: {
              leadId: lead.id,
              fromStatus: lead.status,
              toStatus: nextStatus,
              actorType: LeadActorType.ADMIN,
              actorId: adminUserId,
              comment:
                input.comment ??
                `Admin changed lead status from ${toLeadStatus(lead.status)} to ${input.status}`,
            },
          })
          historyCount += 1
        }
      }

      return {
        requestedCount: leadIds.length,
        updatedCount,
        historyCount,
      }
    })
  }

  async updateLeadAdminNote(
    id: string,
    input: AdminLeadAdminNoteRequest,
    adminUserId: string,
  ): Promise<AdminLeadDetailResponse> {
    const lead = await this.db.lead.findUnique({
      where: { id },
      select: {
        id: true,
        adminNote: true,
      },
    })

    if (!lead) {
      throw new AppError(404, 'NOT_FOUND', 'Lead not found')
    }

    const nextAdminNote = input.adminNote ?? null

    if (nextAdminNote !== lead.adminNote) {
      await this.db.lead.update({
        where: { id },
        data: {
          adminNote: nextAdminNote,
          adminNoteUpdatedAt: new Date(),
          adminNoteUpdatedById: adminUserId,
        },
      })
    }

    return this.getLeadDetail(id)
  }
}

function adminLeadWhere(query: AdminLeadQueryFilters, staleSince: Date): Prisma.LeadWhereInput {
  return {
    ...(query.status ? { status: toLeadStatusRecord(query.status) } : {}),
    ...(query.serviceType ? { serviceType: toLeadServiceTypeRecord(query.serviceType) } : {}),
    ...(query.partnerId ? { partnerId: query.partnerId } : {}),
    ...(query.search ? { OR: adminLeadSearchWhere(query.search) } : {}),
    ...(query.requiresAttention ? { AND: [adminLeadRequiresAttentionWhere(staleSince)] } : {}),
    createdAt: {
      ...(query.createdFrom ? { gte: startOfUtcDay(query.createdFrom) } : {}),
      ...(query.createdTo ? { lt: nextUtcDay(query.createdTo) } : {}),
    },
  }
}

function adminLeadAttentionCutoff() {
  return new Date(Date.now() - 15 * 60 * 1000)
}

function adminLeadRequiresAttentionWhere(staleSince: Date): Prisma.LeadWhereInput {
  return {
    status: {
      in: [LeadStatus.NEW, LeadStatus.WAITING_PARTNER],
    },
    createdAt: {
      lte: staleSince,
    },
  }
}

function adminLeadOrderBy(query: AdminLeadQueryFilters): Prisma.LeadOrderByWithRelationInput[] {
  const direction = query.sortDirection
  const primary: Prisma.LeadOrderByWithRelationInput =
    query.sortBy === 'updated_at'
      ? { updatedAt: direction }
      : { createdAt: direction }

  return [primary, { id: direction }]
}

function adminLeadSearchWhere(search: string): Prisma.LeadWhereInput[] {
  const contains = {
    contains: search,
    mode: Prisma.QueryMode.insensitive,
  }

  return [
    { publicNumber: contains },
    { customerName: contains },
    { customerPhone: contains },
    { customerTelegram: contains },
    { excursionTitle: contains },
    {
      partner: {
        name: contains,
      },
    },
  ]
}

type AdminLeadRecord = Prisma.LeadGetPayload<{
  include: typeof adminLeadInclude
}>

const adminLeadInclude = {
  partner: {
    select: {
      name: true,
      telegramUsername: true,
    },
  },
  adminNoteUpdatedBy: {
    select: {
      id: true,
      email: true,
      displayName: true,
    },
  },
} satisfies Prisma.LeadInclude

const adminLeadDetailInclude = {
  ...adminLeadInclude,
  statusHistory: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.LeadInclude

type AdminLeadDetailRecord = Prisma.LeadGetPayload<{
  include: typeof adminLeadDetailInclude
}>

const adminLeadSheetsSyncInclude = {
  partner: true,
  excursion: {
    include: {
      category: true,
    },
  },
} satisfies Prisma.LeadInclude

type AdminLeadSheetsSyncRecord = Prisma.LeadGetPayload<{
  include: typeof adminLeadSheetsSyncInclude
}>

function toAdminLeadDto(lead: AdminLeadRecord): AdminLeadDto {
  return {
    id: lead.id,
    publicNumber: lead.publicNumber,
    status: toLeadStatus(lead.status),
    source: toLeadSource(lead.source),
    serviceType: toLeadServiceType(lead.serviceType),
    sourcePage: lead.sourcePage,
    excursionId: lead.excursionId,
    excursionTitle: lead.excursionTitle,
    partnerId: lead.partnerId,
    partnerName: lead.partner.name,
    partnerTelegram: lead.partner.telegramUsername,
    userId: lead.userId,
    customerName: lead.customerName,
    customerPhone: lead.customerPhone,
    customerTelegram: lead.customerTelegram,
    contactChannel: lead.contactChannel ? toLeadContactChannel(lead.contactChannel) : null,
    requestedDate: lead.requestedDate?.toISOString() ?? null,
    peopleCount: lead.peopleCount,
    comment: lead.comment,
    partnerNote: lead.partnerNote,
    adminNote: lead.adminNote,
    adminNoteUpdatedAt: lead.adminNoteUpdatedAt?.toISOString() ?? null,
    adminNoteUpdatedById: lead.adminNoteUpdatedById,
    adminNoteUpdatedByEmail: lead.adminNoteUpdatedBy?.email ?? null,
    adminNoteUpdatedByDisplayName: lead.adminNoteUpdatedBy?.displayName ?? null,
    priceRub: lead.priceRub,
    priceThb: lead.priceThb,
    commissionThb: lead.commissionThb,
    commissionTotal: lead.commissionTotal,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  }
}

function toLeadSheetsRowInput(lead: AdminLeadSheetsSyncRecord): LeadSheetsRowInput {
  return {
    lead,
    excursion: {
      slug: lead.excursion.slug,
      categoryTitle: lead.excursion.category.title,
      rubRate: Number(lead.excursion.rubRate),
      rateDate: lead.excursion.rateDate,
    },
    partner: {
      name: lead.partner.name,
      telegramUsername: lead.partner.telegramUsername,
    },
  }
}

function toAdminLeadDetailResponse(lead: AdminLeadDetailRecord): AdminLeadDetailResponse {
  return {
    lead: toAdminLeadDto(lead),
    statusHistory: lead.statusHistory.map(toAdminLeadStatusHistoryItemDto),
  }
}

function toAdminLeadStatusHistoryItemDto(
  history: AdminLeadDetailRecord['statusHistory'][number],
): AdminLeadStatusHistoryItemDto {
  return {
    id: history.id,
    fromStatus: history.fromStatus ? toLeadStatus(history.fromStatus) : null,
    toStatus: toLeadStatus(history.toStatus),
    actorType: history.actorType.toLowerCase() as AdminLeadStatusHistoryItemDto['actorType'],
    actorId: history.actorId,
    comment: history.comment,
    createdAt: history.createdAt.toISOString(),
  }
}

function buildAdminLeadsCsv(leads: AdminLeadDto[]) {
  const rows = [
    adminLeadCsvColumns.map(([header]) => header),
    ...leads.map((lead) => adminLeadCsvColumns.map(([, getValue]) => csvCell(getValue(lead)))),
  ]

  return `${rows.map((row) => row.join(',')).join('\r\n')}\r\n`
}

function csvCell(value: string | number | null) {
  if (value === null) return ''

  const text = String(value)
  if (!/[",\r\n]/.test(text)) return text

  return `"${text.replace(/"/g, '""')}"`
}

function startOfUtcDay(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

function nextUtcDay(value: string) {
  const date = startOfUtcDay(value)
  date.setUTCDate(date.getUTCDate() + 1)
  return date
}

function toLeadStatusRecord(status: string) {
  if (status === 'waiting_partner') return LeadStatus.WAITING_PARTNER
  if (status === 'accepted') return LeadStatus.ACCEPTED
  if (status === 'declined') return LeadStatus.DECLINED
  if (status === 'completed') return LeadStatus.COMPLETED
  if (status === 'cancelled') return LeadStatus.CANCELLED
  return LeadStatus.NEW
}

function toLeadStatus(status: LeadStatus) {
  if (status === LeadStatus.WAITING_PARTNER) return 'waiting_partner'
  return status.toLowerCase() as AdminLeadDto['status']
}

function toLeadServiceTypeRecord(serviceType: string) {
  if (serviceType === 'bike_rental') return LeadServiceType.BIKE_RENTAL
  if (serviceType === 'car_rental') return LeadServiceType.CAR_RENTAL
  if (serviceType === 'visa') return LeadServiceType.VISA
  if (serviceType === 'border_run') return LeadServiceType.BORDER_RUN
  if (serviceType === 'money_exchange') return LeadServiceType.MONEY_EXCHANGE
  return LeadServiceType.EXCURSION
}

function toLeadServiceType(serviceType: LeadServiceType) {
  if (serviceType === LeadServiceType.BIKE_RENTAL) return 'bike_rental'
  if (serviceType === LeadServiceType.CAR_RENTAL) return 'car_rental'
  if (serviceType === LeadServiceType.VISA) return 'visa'
  if (serviceType === LeadServiceType.BORDER_RUN) return 'border_run'
  if (serviceType === LeadServiceType.MONEY_EXCHANGE) return 'money_exchange'
  return 'excursion'
}

function toLeadSource(source: LeadSource) {
  return source.toLowerCase() as AdminLeadDto['source']
}

function toLeadContactChannel(channel: LeadContactChannel) {
  return channel.toLowerCase() as NonNullable<AdminLeadDto['contactChannel']>
}
