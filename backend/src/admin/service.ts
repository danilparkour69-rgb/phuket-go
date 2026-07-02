import type {
  AdminCreateLeadRequest,
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
  AdminBindPartnerTelegramContactRequest,
  AdminBindPartnerTelegramContactResponse,
  AdminPartnerListResponse,
  AdminServiceTypeListResponse,
  AdminTelegramContactDto,
  AdminTelegramContactListResponse,
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
import {
  NoopLeadTelegramNotifier,
  type LeadTelegramNotifier,
} from '../leads/telegram-notifier'

const adminLeadCsvExportLimit = 5000
const adminServiceTypeOptions = [
  { value: 'excursion', label: 'Экскурсии', isActive: true, sortOrder: 10 },
  { value: 'bike_rental', label: 'Аренда байков', isActive: true, sortOrder: 20 },
  { value: 'visa', label: 'Визы', isActive: true, sortOrder: 30 },
  { value: 'border_run', label: 'Border run', isActive: true, sortOrder: 40 },
  { value: 'car_rental', label: 'Аренда машин', isActive: true, sortOrder: 50 },
  { value: 'money_exchange', label: 'Обмен денег', isActive: true, sortOrder: 60 },
] as const
const adminLeadCsvColumns = [
  ['lead_id', (lead: AdminLeadDto) => lead.id],
  ['public_number', (lead: AdminLeadDto) => lead.publicNumber],
  ['is_test', (lead: AdminLeadDto) => String(lead.isTest)],
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
    private readonly leadTelegramNotifier: LeadTelegramNotifier = new NoopLeadTelegramNotifier(),
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
        telegramChatId: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    })

    return {
      partners: partners.map((partner) => ({
        id: partner.id,
        name: partner.name,
        telegram: partner.telegramUsername,
        telegramChatId: partner.telegramChatId,
      })),
    }
  }

  async listTelegramContacts(): Promise<AdminTelegramContactListResponse> {
    const contacts = await this.db.telegramContact.findMany({
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      take: 50,
    })
    const partners = await this.db.partner.findMany({
      where: {
        telegramChatId: {
          in: contacts.map((contact) => contact.chatId),
        },
      },
      select: {
        id: true,
        name: true,
        telegramChatId: true,
      },
    })
    const partnerByChatId = new Map(
      partners
        .filter((partner) => partner.telegramChatId)
        .map((partner) => [partner.telegramChatId as string, partner]),
    )

    return {
      contacts: contacts.map((contact) =>
        toAdminTelegramContactDto(contact, partnerByChatId.get(contact.chatId) ?? null),
      ),
    }
  }

  async bindPartnerTelegramContact(
    partnerId: string,
    input: AdminBindPartnerTelegramContactRequest,
    adminUserId: string,
  ): Promise<AdminBindPartnerTelegramContactResponse> {
    const contact = await this.db.telegramContact.findUnique({
      where: { id: input.contactId },
    })
    if (!contact) {
      throw new AppError(404, 'NOT_FOUND', 'Telegram contact not found')
    }

    const existingPartner = await this.db.partner.findUnique({
      where: { id: partnerId },
      select: {
        id: true,
        name: true,
        telegramUsername: true,
        telegramChatId: true,
        defaultCommissionThb: true,
      },
    })
    if (!existingPartner) {
      throw new AppError(404, 'NOT_FOUND', 'Partner not found')
    }

    const conflictingPartner = await this.db.partner.findFirst({
      where: {
        telegramChatId: contact.chatId,
        id: { not: partnerId },
      },
      select: { id: true },
    })
    if (conflictingPartner) {
      throw new AppError(409, 'CONFLICT', 'Telegram contact is already linked to another partner')
    }

    const shouldSendTestLead = !existingPartner.telegramChatId
    const partner = await this.db.partner.update({
      where: { id: partnerId },
      data: {
        telegramChatId: contact.chatId,
        ...(contact.username ? { telegramUsername: `@${contact.username}` } : {}),
      },
      select: {
        id: true,
        name: true,
        telegramUsername: true,
        telegramChatId: true,
        defaultCommissionThb: true,
      },
    })
    const testLead = shouldSendTestLead
      ? await this.createPartnerTelegramTestLead({
          partner,
          adminUserId,
        })
      : null
    const testNotificationSent = testLead
      ? await this.notifyTelegramTestLeadCreated({ lead: testLead, partner })
      : false

    return {
      partner: {
        id: partner.id,
        name: partner.name,
        telegram: partner.telegramUsername,
        telegramChatId: partner.telegramChatId,
      },
      contact: toAdminTelegramContactDto(contact, {
        id: partner.id,
        name: partner.name,
        telegramChatId: partner.telegramChatId,
      }),
      testLead: testLead ? toAdminLeadDto(testLead) : null,
      testNotificationSent,
    }
  }

  private async createPartnerTelegramTestLead({
    partner,
    adminUserId,
  }: {
    partner: {
      id: string
      defaultCommissionThb: number
    }
    adminUserId: string
  }) {
    return this.db.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          publicNumber: adminTestLeadNumber(),
          source: LeadSource.ADMIN,
          isTest: true,
          serviceType: LeadServiceType.EXCURSION,
          status: LeadStatus.NEW,
          customerName: 'Тестовый клиент Phuket Go',
          customerPhone: '+66000000000',
          customerTelegram: '@test_customer',
          contactChannel: LeadContactChannel.TELEGRAM,
          peopleCount: 2,
          comment:
            'Тестовая заявка для проверки Telegram-кнопок менеджера. Нажмите «Взять в работу», затем «Оплата получена».',
          excursionTitle: 'Тестовая заявка Telegram',
          partnerId: partner.id,
          commissionThb: partner.defaultCommissionThb,
          commissionTotal: partner.defaultCommissionThb * 2,
        },
        include: adminLeadInclude,
      })

      await tx.leadStatusHistory.create({
        data: {
          leadId: lead.id,
          toStatus: LeadStatus.NEW,
          actorType: LeadActorType.ADMIN,
          actorId: adminUserId,
          comment: 'Telegram manager onboarding test lead created.',
        },
      })

      return lead
    })
  }

  private async notifyTelegramTestLeadCreated({
    lead,
    partner,
  }: {
    lead: AdminLeadRecord
    partner: {
      name: string
      telegramUsername: string | null
      telegramChatId: string | null
    }
  }) {
    try {
      await this.leadTelegramNotifier.notifyLeadCreated({
        lead: {
          id: lead.id,
          publicNumber: lead.publicNumber,
          status: lead.status,
          isTest: lead.isTest,
          customerName: lead.customerName,
          customerPhone: lead.customerPhone,
          customerTelegram: lead.customerTelegram,
          contactChannel: lead.contactChannel,
          requestedDate: lead.requestedDate,
          peopleCount: lead.peopleCount,
          comment: lead.comment,
          excursionTitle: lead.excursionTitle,
        },
        partner: {
          name: partner.name,
          telegramUsername: partner.telegramUsername,
          telegramChatId: partner.telegramChatId,
        },
      })
      return true
    } catch (error) {
      console.error('Telegram manager test lead notification failed', {
        leadId: lead.id,
        message: error instanceof Error ? error.message : 'Unknown Telegram notification error',
      })
      return false
    }
  }

  listServiceTypes(): AdminServiceTypeListResponse {
    return {
      serviceTypes: adminServiceTypeOptions.map((option) => ({ ...option })),
    }
  }

  async createLead(
    input: AdminCreateLeadRequest,
    adminUserId: string,
  ): Promise<AdminLeadDetailResponse> {
    const serviceType = toLeadServiceTypeRecord(input.serviceType)
    const serviceTypeLabel = serviceTypeLabelFor(input.serviceType)
    const partner = await this.db.partner.findUnique({
      where: { id: input.partnerId },
    })

    if (!partner) {
      throw new AppError(404, 'NOT_FOUND', 'Partner not found')
    }

    const excursion =
      input.serviceType === 'excursion'
        ? await this.db.excursion.findUnique({
            where: { id: input.excursionId ?? '' },
            include: {
              category: true,
            },
          })
        : null

    if (input.serviceType === 'excursion' && !excursion) {
      throw new AppError(404, 'NOT_FOUND', 'Excursion not found')
    }

    const peopleCount = input.peopleCount ?? null
    const commissionThb = partner.defaultCommissionThb
    const commissionTotal = peopleCount === null ? null : commissionThb * peopleCount
    const excursionTitle = excursion?.title ?? serviceTypeLabel

    const lead = await this.db.$transaction(async (tx) => {
      const createdLead = await tx.lead.create({
        data: {
          publicNumber: adminLeadNumber(),
          source: LeadSource.ADMIN,
          serviceType,
          status: LeadStatus.NEW,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          customerTelegram: input.customerTelegram,
          contactChannel: input.contactChannel ? toLeadContactChannelRecord(input.contactChannel) : undefined,
          requestedDate: input.requestedDate ? new Date(input.requestedDate) : undefined,
          peopleCount,
          comment: input.comment,
          excursionId: excursion?.id,
          excursionTitle,
          partnerId: partner.id,
          priceRub: excursion?.priceFromRub,
          priceThb: excursion?.priceFromThb,
          commissionThb,
          commissionTotal,
        },
        include: adminLeadSheetsSyncInclude,
      })

      await tx.leadStatusHistory.create({
        data: {
          leadId: createdLead.id,
          toStatus: LeadStatus.NEW,
          actorType: LeadActorType.ADMIN,
          actorId: adminUserId,
          comment: 'Lead created manually by admin.',
        },
      })

      return createdLead
    })

    await this.appendLeadToSheets(toLeadSheetsRowInput(lead))
    await this.notifyLeadCreated({
      lead,
      partner: {
        name: partner.name,
        telegramUsername: partner.telegramUsername,
        telegramChatId: partner.telegramChatId,
      },
    })

    return this.getLeadDetail(lead.id)
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

    if (lead.isTest) {
      return {
        synced: false,
        mode: 'disabled',
      }
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

  private async appendLeadToSheets(input: LeadSheetsRowInput) {
    try {
      await this.leadSheetsSink.appendLead(input)
    } catch (error) {
      console.error('Google Sheets lead sync failed', {
        leadId: input.lead.id,
        message: error instanceof Error ? error.message : 'Unknown Google Sheets error',
      })
    }
  }

  private async notifyLeadCreated(
    input: Parameters<LeadTelegramNotifier['notifyLeadCreated']>[0],
  ) {
    try {
      await this.leadTelegramNotifier.notifyLeadCreated(input)
    } catch (error) {
      console.error('Telegram lead notification failed', {
        leadId: input.lead.id,
        message: error instanceof Error ? error.message : 'Unknown Telegram notification error',
      })
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
  followUpAnswers: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
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
type TelegramContactRecord = Prisma.TelegramContactGetPayload<Record<string, never>>
type TelegramContactLinkedPartner = {
  id: string
  name: string
  telegramChatId: string | null
}

function toAdminLeadDto(lead: AdminLeadRecord): AdminLeadDto {
  return {
    id: lead.id,
    publicNumber: lead.publicNumber,
    status: toLeadStatus(lead.status),
    source: toLeadSource(lead.source),
    isTest: lead.isTest,
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

function toAdminTelegramContactDto(
  contact: TelegramContactRecord,
  linkedPartner: TelegramContactLinkedPartner | null,
): AdminTelegramContactDto {
  return {
    id: contact.id,
    chatId: contact.chatId,
    telegramUserId: contact.telegramUserId,
    username: contact.username ? `@${contact.username}` : null,
    displayName: telegramContactDisplayName(contact),
    firstName: contact.firstName,
    lastName: contact.lastName,
    chatType: contact.chatType,
    lastMessageText: contact.lastMessageText,
    lastSeenAt: contact.lastSeenAt.toISOString(),
    linkedPartnerId: linkedPartner?.id ?? null,
    linkedPartnerName: linkedPartner?.name ?? null,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  }
}

function telegramContactDisplayName(contact: TelegramContactRecord) {
  if (contact.username) return `@${contact.username}`
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim()
  return name || `chat ${contact.chatId}`
}

function toLeadSheetsRowInput(lead: AdminLeadSheetsSyncRecord): LeadSheetsRowInput {
  return {
    lead,
    excursion: {
      slug: lead.excursion?.slug ?? null,
      categoryTitle: lead.excursion?.category.title ?? serviceTypeLabelFor(toLeadServiceType(lead.serviceType)),
      rubRate: lead.excursion ? Number(lead.excursion.rubRate) : null,
      rateDate: lead.excursion?.rateDate ?? null,
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
    followUpAnswers: lead.followUpAnswers.map((answer) => ({
      id: answer.id,
      questionKey: answer.questionKey,
      questionPrompt: answer.questionPrompt,
      answer: answer.answer,
      sortOrder: answer.sortOrder,
      createdAt: answer.createdAt.toISOString(),
      updatedAt: answer.updatedAt.toISOString(),
    })),
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
  if (status === 'paid') return LeadStatus.PAID
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

function serviceTypeLabelFor(serviceType: AdminLeadDto['serviceType']) {
  return adminServiceTypeOptions.find((option) => option.value === serviceType)?.label ?? 'Экскурсии'
}

function toLeadSource(source: LeadSource) {
  return source.toLowerCase() as AdminLeadDto['source']
}

function toLeadContactChannel(channel: LeadContactChannel) {
  return channel.toLowerCase() as NonNullable<AdminLeadDto['contactChannel']>
}

function toLeadContactChannelRecord(channel: string) {
  if (channel === 'whatsapp') return LeadContactChannel.WHATSAPP
  if (channel === 'max') return LeadContactChannel.MAX
  return LeadContactChannel.TELEGRAM
}

function adminLeadNumber() {
  const date = new Date()
  const day = date.toISOString().slice(0, 10).replaceAll('-', '')
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase()
  return `PG-${day}-${suffix}`
}

function adminTestLeadNumber() {
  const date = new Date()
  const day = date.toISOString().slice(0, 10).replaceAll('-', '')
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase()
  return `TEST-${day}-${suffix}`
}

function isRecordNotFound(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  )
}
