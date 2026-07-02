import type {
  CreateLeadPayload,
  ExcursionCardDto,
  ExcursionDetailDto,
  ExcursionListQuery,
  ExcursionReviewsResponse,
  LeadFollowUpFlowResponse,
  LeadFollowUpQuestion,
  LeadDto,
  UpdateLeadFollowUpRequest,
  UpdateLeadContactChannelRequest,
} from '@phuket-go/contracts'

import type { DbClient } from '../db'
import {
  ExcursionPhotoImageType,
  ExcursionStatus,
  LeadActorType,
  LeadContactChannel,
  LeadServiceType,
  LeadSource,
  LeadStatus,
  TripAdvisorMatchStatus,
  TripAdvisorSyncStatus,
  Prisma,
} from '../generated/prisma/client'
import { AppError } from '../http/errors'
import { NoopLeadSheetsSink, type LeadSheetsSink } from '../leads/google-sheets-sink'
import {
  NoopLeadTelegramNotifier,
  type LeadTelegramContactChannelUpdatedInput,
  type LeadTelegramNotifier,
} from '../leads/telegram-notifier'
import { TripAdvisorClient } from '../tripadvisor/client'
import type { TripAdvisorRatingSnapshot, TripAdvisorReviewItemSnapshot } from '../tripadvisor/client'

export class CatalogService {
  constructor(
    private readonly db: DbClient,
    private readonly tripAdvisorClient: TripAdvisorClient | null,
    private readonly leadSheetsSink: LeadSheetsSink = new NoopLeadSheetsSink(),
    private readonly leadTelegramNotifier: LeadTelegramNotifier = new NoopLeadTelegramNotifier(),
  ) {}

  async listExcursions(query: ExcursionListQuery): Promise<ExcursionCardDto[]> {
    const excursions = await this.db.excursion.findMany({
      where: {
        status: ExcursionStatus.PUBLISHED,
        ...(query.category ? { category: { slug: query.category } } : {}),
        priceFromRub: {
          ...(query.minPriceRub === undefined ? {} : { gte: query.minPriceRub }),
          ...(query.maxPriceRub === undefined ? {} : { lte: query.maxPriceRub }),
        },
      },
      include: {
        category: true,
        photos: {
          where: { block: 'carousel' },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ category: { sortOrder: 'asc' } }, { priceFromRub: 'asc' }],
    })

    return excursions.map(toExcursionCardDto)
  }

  async getExcursionBySlug(slug: string): Promise<ExcursionDetailDto> {
    const excursion = await this.db.excursion.findFirst({
      where: {
        slug,
        status: ExcursionStatus.PUBLISHED,
      },
      include: {
        category: true,
        photos: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    })

    if (!excursion) {
      throw new AppError(404, 'NOT_FOUND', 'Excursion not found')
    }

    return toExcursionDetailDto(excursion)
  }

  async createLead(input: CreateLeadPayload): Promise<LeadDto> {
    const excursion = await this.db.excursion.findFirst({
      where: {
        id: input.excursionId,
        status: ExcursionStatus.PUBLISHED,
      },
      include: {
        category: true,
        partner: true,
      },
    })

    if (!excursion) {
      throw new AppError(404, 'NOT_FOUND', 'Excursion not found')
    }

    const source = toLeadSource(input.source)
    const contactChannel = input.contactChannel
      ? toLeadContactChannel(input.contactChannel)
      : undefined
    const peopleCount = input.peopleCount ?? null
    const commissionThb = excursion.partner.defaultCommissionThb
    const commissionTotal = peopleCount === null ? null : commissionThb * peopleCount

    const lead = await this.db.$transaction(async (tx) => {
      const createdLead = await tx.lead.create({
        data: {
          publicNumber: publicLeadNumber(),
          source,
          serviceType: LeadServiceType.EXCURSION,
          status: LeadStatus.NEW,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          customerTelegram: input.customerTelegram,
          contactChannel,
          requestedDate: input.requestedDate ? new Date(input.requestedDate) : undefined,
          peopleCount,
          comment: input.comment,
          sourcePage: input.sourcePage,
          excursionId: excursion.id,
          excursionTitle: excursion.title,
          partnerId: excursion.partnerId,
          priceRub: excursion.priceFromRub,
          priceThb: excursion.priceFromThb,
          commissionThb,
          commissionTotal,
        },
      })

      await tx.leadStatusHistory.create({
        data: {
          leadId: createdLead.id,
          toStatus: LeadStatus.NEW,
          actorType: LeadActorType.SYSTEM,
          comment: 'Lead created from public request form.',
        },
      })

      return createdLead
    })

    await this.appendLeadToSheets({
      lead,
      excursion: {
        slug: excursion.slug,
        categoryTitle: excursion.category.title,
        rubRate: Number(excursion.rubRate),
        rateDate: excursion.rateDate,
      },
      partner: {
        name: excursion.partner.name,
        telegramUsername: excursion.partner.telegramUsername,
      },
    })
    await this.notifyLeadCreated({
      lead,
      partner: {
        name: excursion.partner.name,
        telegramUsername: excursion.partner.telegramUsername,
        telegramChatId: excursion.partner.telegramChatId,
      },
    })

    return toLeadDto(lead)
  }

  private async appendLeadToSheets(input: Parameters<LeadSheetsSink['appendLead']>[0]) {
    try {
      await this.leadSheetsSink.appendLead(input)
    } catch (error) {
      console.error('Google Sheets lead sync failed', {
        leadId: input.lead.id,
        message: error instanceof Error ? error.message : 'Unknown Google Sheets error',
      })
    }
  }

  private async notifyLeadCreated(input: Parameters<LeadTelegramNotifier['notifyLeadCreated']>[0]) {
    try {
      await this.leadTelegramNotifier.notifyLeadCreated(input)
    } catch (error) {
      console.error('Telegram lead notification failed', {
        leadId: input.lead.id,
        message: error instanceof Error ? error.message : 'Unknown Telegram notification error',
      })
    }
  }

  async updateLeadContactChannel(
    id: string,
    input: UpdateLeadContactChannelRequest,
  ): Promise<LeadDto> {
    const lead = await this.db.lead
      .update({
        where: { id },
        data: {
          contactChannel: toLeadContactChannel(input.contactChannel),
        },
        include: {
          partner: {
            select: {
              name: true,
              telegramUsername: true,
              telegramChatId: true,
            },
          },
        },
      })
      .catch((error: unknown) => {
        if (isRecordNotFound(error)) {
          throw new AppError(404, 'NOT_FOUND', 'Lead not found')
        }

        throw error
      })

    await this.notifyLeadContactChannelUpdated({
      lead: {
        id: lead.id,
        publicNumber: lead.publicNumber,
        excursionTitle: lead.excursionTitle,
        customerName: lead.customerName,
        customerPhone: lead.customerPhone,
        customerTelegram: lead.customerTelegram,
        contactChannel: lead.contactChannel,
      },
      partner: {
        name: lead.partner.name,
        telegramUsername: lead.partner.telegramUsername,
        telegramChatId: lead.partner.telegramChatId,
      },
    })

    return toLeadDto(lead)
  }

  async getLeadFollowUpFlow(id: string): Promise<LeadFollowUpFlowResponse> {
    const lead = await this.db.lead.findUnique({
      where: { id },
      select: {
        id: true,
        publicNumber: true,
        serviceType: true,
        excursionTitle: true,
      },
    })

    if (!lead) {
      throw new AppError(404, 'NOT_FOUND', 'Lead not found')
    }

    const serviceType = toLeadServiceType(lead.serviceType)

    return {
      leadId: lead.id,
      publicNumber: lead.publicNumber,
      serviceType,
      serviceTitle: lead.excursionTitle,
      questions: followUpQuestionsFor(serviceType),
      finalMessage: 'Все отлично, в ближайшее время менеджер с вами свяжется.',
    }
  }

  async updateLeadFollowUp(id: string, input: UpdateLeadFollowUpRequest): Promise<LeadDto> {
    const lead = await this.db
      .$transaction(async (tx) => {
        const updatedLead = await tx.lead.update({
          where: { id },
          data: {
            ...(input.requestedDate !== undefined
              ? { requestedDate: new Date(input.requestedDate) }
              : {}),
            ...(input.comment !== undefined ? { comment: input.comment } : {}),
          },
        })

        for (const answer of input.answers ?? []) {
          await tx.leadFollowUpAnswer.upsert({
            where: {
              leadId_questionKey: {
                leadId: id,
                questionKey: answer.questionKey,
              },
            },
            create: {
              leadId: id,
              questionKey: answer.questionKey,
              questionPrompt: answer.questionPrompt,
              answer: answer.answer,
              sortOrder: answer.sortOrder,
            },
            update: {
              questionPrompt: answer.questionPrompt,
              answer: answer.answer,
              sortOrder: answer.sortOrder,
            },
          })
        }

        return updatedLead
      })
      .catch((error: unknown) => {
        if (isRecordNotFound(error)) {
          throw new AppError(404, 'NOT_FOUND', 'Lead not found')
        }

        throw error
      })

    await this.notifyLeadCustomerFollowUp({
      lead: {
        id: lead.id,
        publicNumber: lead.publicNumber,
        excursionTitle: lead.excursionTitle,
        customerName: lead.customerName,
        customerPhone: lead.customerPhone,
        customerTelegram: lead.customerTelegram,
        requestedDate: lead.requestedDate,
        comment: lead.comment,
      },
    })

    return toLeadDto(lead)
  }

  async handleTelegramLeadCallback(input: {
    leadId: string
    action: 'accept' | 'decline' | 'paid' | 'complete'
    partnerTelegramChatId: string
  }) {
    const toStatus = toLeadStatusFromTelegramAction(input.action)
    const comment = telegramLeadStatusHistoryComment(input.action)

    const result = await this.db.$transaction(async (tx) => {
      const currentLead = await tx.lead.findUnique({
        where: { id: input.leadId },
        include: {
          partner: {
            select: {
              name: true,
              telegramUsername: true,
              telegramChatId: true,
            },
          },
        },
      })

      if (!currentLead) {
        throw new AppError(404, 'NOT_FOUND', 'Lead not found')
      }

      if (!currentLead.partner.telegramChatId) {
        throw new AppError(403, 'FORBIDDEN', 'Lead partner is not linked to Telegram')
      }

      if (currentLead.partner.telegramChatId !== input.partnerTelegramChatId) {
        throw new AppError(403, 'FORBIDDEN', 'Telegram user cannot update this lead')
      }

      if (currentLead.status === toStatus) {
        return {
          leadId: currentLead.id,
          publicNumber: currentLead.publicNumber,
          status: toLeadStatus(currentLead.status),
          changed: false,
          customerContactUrl: leadCustomerContactUrl(currentLead),
          sheetsUpdate: null,
          adminNotification: null,
        }
      }

      if (isTelegramPaymentAction(input.action) && currentLead.status !== LeadStatus.ACCEPTED) {
        throw new AppError(409, 'CONFLICT', 'Lead must be accepted before payment confirmation')
      }

      const updatedLead = await tx.lead.update({
        where: { id: currentLead.id },
        data: {
          status: toStatus,
        },
      })

      await tx.leadStatusHistory.create({
        data: {
          leadId: currentLead.id,
          fromStatus: currentLead.status,
          toStatus,
          actorType: LeadActorType.PARTNER,
          actorId: currentLead.partnerId,
          comment,
        },
      })

      return {
        leadId: updatedLead.id,
        publicNumber: updatedLead.publicNumber,
        status: toLeadStatus(updatedLead.status),
        changed: true,
        customerContactUrl: leadCustomerContactUrl(currentLead),
        sheetsUpdate: currentLead.isTest
          ? null
          : {
              leadId: updatedLead.id,
              status: updatedLead.status,
              updatedAt: updatedLead.updatedAt,
              changedAt: updatedLead.updatedAt,
              actorType: 'partner' as const,
              actorId: currentLead.partnerId,
            },
        adminNotification: {
          lead: {
            id: updatedLead.id,
            publicNumber: updatedLead.publicNumber,
            status: updatedLead.status,
            isTest: updatedLead.isTest,
            excursionTitle: updatedLead.excursionTitle,
          },
          partner: {
            name: currentLead.partner.name,
            telegramUsername: currentLead.partner.telegramUsername,
          },
        },
      }
    })

    if (result.sheetsUpdate) {
      await this.updateLeadStatusInSheets(result.sheetsUpdate)
    }

    if (result.adminNotification) {
      await this.notifyLeadStatusChanged(result.adminNotification)
    }

    return {
      leadId: result.leadId,
      publicNumber: result.publicNumber,
      status: result.status,
      changed: result.changed,
      customerContactUrl: result.customerContactUrl,
    }
  }

  async handleTelegramLeadDeclinePrompt(input: {
    leadId: string
    partnerTelegramChatId: string
  }) {
    const lead = await this.findTelegramPartnerLead(input)

    if (lead.status === LeadStatus.PAID || lead.status === LeadStatus.COMPLETED) {
      throw new AppError(409, 'CONFLICT', 'Paid or completed lead cannot be declined')
    }

    if (lead.status === LeadStatus.DECLINED) {
      return {
        leadId: lead.id,
        publicNumber: lead.publicNumber,
        status: toLeadStatus(lead.status),
        changed: false,
        customerContactUrl: leadCustomerContactUrl(lead),
        declineNote: lead.partnerNote,
      }
    }

    return {
      leadId: lead.id,
      publicNumber: lead.publicNumber,
      status: toLeadStatus(lead.status),
      changed: false,
      customerContactUrl: leadCustomerContactUrl(lead),
      declinePrompt: true,
    }
  }

  async handleTelegramLeadDeclineReason(input: {
    leadId: string
    reason?: LeadTelegramCallbackReason
    partnerNote?: string
    partnerTelegramChatId: string
  }) {
    const partnerNote = input.partnerNote ?? leadCallbackReasonLabel(input.reason ?? 'other')
    const result = await this.db.$transaction(async (tx) => {
      const currentLead = await tx.lead.findUnique({
        where: { id: input.leadId },
        include: {
          partner: {
            select: {
              name: true,
              telegramUsername: true,
              telegramChatId: true,
            },
          },
        },
      })

      if (!currentLead) {
        throw new AppError(404, 'NOT_FOUND', 'Lead not found')
      }

      assertLeadTelegramPartner(currentLead, input.partnerTelegramChatId)

      if (currentLead.status === LeadStatus.PAID || currentLead.status === LeadStatus.COMPLETED) {
        throw new AppError(409, 'CONFLICT', 'Paid or completed lead cannot be declined')
      }

      if (currentLead.status === LeadStatus.DECLINED && currentLead.partnerNote === partnerNote) {
        return {
          leadId: currentLead.id,
          publicNumber: currentLead.publicNumber,
          status: toLeadStatus(currentLead.status),
          changed: false,
          customerContactUrl: leadCustomerContactUrl(currentLead),
          declineNote: partnerNote,
          statusSheetsUpdate: null,
          partnerNoteSheetsUpdate: null,
          adminNotification: null,
        }
      }

      const updatedLead = await tx.lead.update({
        where: { id: currentLead.id },
        data: {
          status: LeadStatus.DECLINED,
          partnerNote,
        },
      })

      await tx.leadStatusHistory.create({
        data: {
          leadId: currentLead.id,
          fromStatus: currentLead.status,
          toStatus: LeadStatus.DECLINED,
          actorType: LeadActorType.PARTNER,
          actorId: currentLead.partnerId,
          comment: `Lead declined from Telegram partner callback: ${partnerNote}.`,
        },
      })

      return {
        leadId: updatedLead.id,
        publicNumber: updatedLead.publicNumber,
        status: toLeadStatus(updatedLead.status),
        changed: true,
        customerContactUrl: leadCustomerContactUrl(currentLead),
        declineNote: partnerNote,
        statusSheetsUpdate: currentLead.isTest
          ? null
          : {
              leadId: updatedLead.id,
              status: updatedLead.status,
              updatedAt: updatedLead.updatedAt,
              changedAt: updatedLead.updatedAt,
              actorType: 'partner' as const,
              actorId: currentLead.partnerId,
            },
        partnerNoteSheetsUpdate: currentLead.isTest
          ? null
          : {
              leadId: updatedLead.id,
              partnerNote,
              updatedAt: updatedLead.updatedAt,
              changedAt: updatedLead.updatedAt,
              actorType: 'partner' as const,
              actorId: currentLead.partnerId,
            },
        adminNotification: {
          lead: {
            id: updatedLead.id,
            publicNumber: updatedLead.publicNumber,
            status: updatedLead.status,
            isTest: updatedLead.isTest,
            excursionTitle: updatedLead.excursionTitle,
            partnerNote,
          },
          partner: {
            name: currentLead.partner.name,
            telegramUsername: currentLead.partner.telegramUsername,
          },
        },
      }
    })

    if (result.statusSheetsUpdate) {
      await this.updateLeadStatusInSheets(result.statusSheetsUpdate)
    }
    if (result.partnerNoteSheetsUpdate) {
      await this.updateLeadPartnerNoteInSheets(result.partnerNoteSheetsUpdate)
    }
    if (result.adminNotification) {
      await this.notifyLeadStatusChanged(result.adminNotification)
    }

    return {
      leadId: result.leadId,
      publicNumber: result.publicNumber,
      status: result.status,
      changed: result.changed,
      customerContactUrl: result.customerContactUrl,
      declineNote: result.declineNote,
    }
  }

  async handleTelegramLeadCustomReasonPrompt(input: {
    leadId: string
    action: 'decline' | 'problem'
    partnerTelegramChatId: string
  }) {
    if (input.action === 'decline') {
      const lead = await this.findTelegramPartnerLead(input)

      if (lead.status === LeadStatus.PAID || lead.status === LeadStatus.COMPLETED) {
        throw new AppError(409, 'CONFLICT', 'Paid or completed lead cannot be declined')
      }

      if (lead.status === LeadStatus.DECLINED) {
        return {
          leadId: lead.id,
          publicNumber: lead.publicNumber,
          status: toLeadStatus(lead.status),
          changed: false,
          customerContactUrl: leadCustomerContactUrl(lead),
          declineNote: lead.partnerNote,
        }
      }

      return {
        leadId: lead.id,
        publicNumber: lead.publicNumber,
        status: toLeadStatus(lead.status),
        changed: false,
        customerContactUrl: leadCustomerContactUrl(lead),
        customReasonPrompt: true,
        customReasonAction: input.action,
      }
    }

    const lead = await this.findTelegramPartnerLead(input)

    if (lead.status !== LeadStatus.ACCEPTED) {
      throw new AppError(409, 'CONFLICT', 'Lead must be accepted before reporting a problem')
    }

    return {
      leadId: lead.id,
      publicNumber: lead.publicNumber,
      status: toLeadStatus(lead.status),
      changed: false,
      customerContactUrl: leadCustomerContactUrl(lead),
      customReasonPrompt: true,
      customReasonAction: input.action,
    }
  }

  async handleTelegramLeadCustomReason(input: {
    leadId: string
    action: 'decline' | 'problem'
    reasonText: string
    partnerTelegramChatId: string
  }) {
    const partnerNote = normalizeTelegramCustomReason(input.reasonText)
    if (input.action === 'decline') {
      return this.handleTelegramLeadDeclineReason({
        leadId: input.leadId,
        partnerNote,
        partnerTelegramChatId: input.partnerTelegramChatId,
      })
    }

    return this.handleTelegramLeadProblemReason({
      leadId: input.leadId,
      partnerNote,
      partnerTelegramChatId: input.partnerTelegramChatId,
    })
  }

  async handleTelegramLeadProblemPrompt(input: {
    leadId: string
    partnerTelegramChatId: string
  }) {
    const lead = await this.findTelegramPartnerLead(input)

    if (lead.status !== LeadStatus.ACCEPTED) {
      throw new AppError(409, 'CONFLICT', 'Lead must be accepted before reporting a problem')
    }

    return {
      leadId: lead.id,
      publicNumber: lead.publicNumber,
      status: toLeadStatus(lead.status),
      changed: false,
      customerContactUrl: leadCustomerContactUrl(lead),
      problemPrompt: true,
    }
  }

  async handleTelegramLeadProblemReason(input: {
    leadId: string
    reason?: LeadTelegramCallbackReason
    partnerNote?: string
    partnerTelegramChatId: string
  }) {
    const partnerNote = input.partnerNote ?? leadCallbackReasonLabel(input.reason ?? 'other')
    const result = await this.db.$transaction(async (tx) => {
      const currentLead = await tx.lead.findUnique({
        where: { id: input.leadId },
        include: {
          partner: {
            select: {
              name: true,
              telegramUsername: true,
              telegramChatId: true,
            },
          },
        },
      })

      if (!currentLead) {
        throw new AppError(404, 'NOT_FOUND', 'Lead not found')
      }

      assertLeadTelegramPartner(currentLead, input.partnerTelegramChatId)

      if (currentLead.status !== LeadStatus.ACCEPTED) {
        throw new AppError(409, 'CONFLICT', 'Lead must be accepted before reporting a problem')
      }

      const updatedLead = await tx.lead.update({
        where: { id: currentLead.id },
        data: {
          partnerNote,
        },
      })

      await tx.leadStatusHistory.create({
        data: {
          leadId: currentLead.id,
          fromStatus: currentLead.status,
          toStatus: currentLead.status,
          actorType: LeadActorType.PARTNER,
          actorId: currentLead.partnerId,
          comment: `Partner reported problem: ${partnerNote}`,
        },
      })

      return {
        leadId: updatedLead.id,
        publicNumber: updatedLead.publicNumber,
        status: toLeadStatus(updatedLead.status),
        changed: false,
        customerContactUrl: leadCustomerContactUrl(currentLead),
        problemNote: partnerNote,
        sheetsUpdate: currentLead.isTest
          ? null
          : {
              leadId: updatedLead.id,
              partnerNote,
              updatedAt: updatedLead.updatedAt,
              changedAt: updatedLead.updatedAt,
              actorType: 'partner' as const,
              actorId: currentLead.partnerId,
            },
        adminNotification: {
          lead: {
            id: updatedLead.id,
            publicNumber: updatedLead.publicNumber,
            status: updatedLead.status,
            isTest: updatedLead.isTest,
            excursionTitle: updatedLead.excursionTitle,
            partnerNote,
          },
          partner: {
            name: currentLead.partner.name,
            telegramUsername: currentLead.partner.telegramUsername,
          },
        },
      }
    })

    if (result.sheetsUpdate) {
      await this.updateLeadPartnerNoteInSheets(result.sheetsUpdate)
    }
    await this.notifyLeadProblemReported(result.adminNotification)

    return {
      leadId: result.leadId,
      publicNumber: result.publicNumber,
      status: result.status,
      changed: result.changed,
      customerContactUrl: result.customerContactUrl,
      problemNote: result.problemNote,
    }
  }

  private async findTelegramPartnerLead(input: {
    leadId: string
    partnerTelegramChatId: string
  }) {
    const lead = await this.db.lead.findUnique({
      where: { id: input.leadId },
      include: {
        partner: {
          select: {
            telegramChatId: true,
          },
        },
      },
    })

    if (!lead) {
      throw new AppError(404, 'NOT_FOUND', 'Lead not found')
    }

    assertLeadTelegramPartner(lead, input.partnerTelegramChatId)
    return lead
  }

  private async updateLeadStatusInSheets(
    input: Parameters<LeadSheetsSink['updateLeadStatus']>[0],
  ) {
    try {
      await this.leadSheetsSink.updateLeadStatus(input)
    } catch (error) {
      console.error('Google Sheets lead status sync failed', {
        leadId: input.leadId,
        message: error instanceof Error ? error.message : 'Unknown Google Sheets error',
      })
    }
  }

  private async updateLeadPartnerNoteInSheets(
    input: Parameters<LeadSheetsSink['updateLeadPartnerNote']>[0],
  ) {
    try {
      await this.leadSheetsSink.updateLeadPartnerNote(input)
    } catch (error) {
      console.error('Google Sheets lead partner note sync failed', {
        leadId: input.leadId,
        message: error instanceof Error ? error.message : 'Unknown Google Sheets error',
      })
    }
  }

  private async notifyLeadStatusChanged(
    input: Parameters<LeadTelegramNotifier['notifyLeadStatusChanged']>[0],
  ) {
    try {
      await this.leadTelegramNotifier.notifyLeadStatusChanged(input)
    } catch (error) {
      console.error('Telegram lead status notification failed', {
        leadId: input.lead.id,
        message: error instanceof Error ? error.message : 'Unknown Telegram notification error',
      })
    }
  }

  private async notifyLeadCustomerFollowUp(
    input: Parameters<LeadTelegramNotifier['notifyLeadCustomerFollowUp']>[0],
  ) {
    try {
      await this.leadTelegramNotifier.notifyLeadCustomerFollowUp(input)
    } catch (error) {
      console.error('Telegram lead follow-up notification failed', {
        leadId: input.lead.id,
        message: error instanceof Error ? error.message : 'Unknown Telegram notification error',
      })
    }
  }

  private async notifyLeadContactChannelUpdated(
    input: LeadTelegramContactChannelUpdatedInput,
  ) {
    if (!this.leadTelegramNotifier.notifyLeadContactChannelUpdated) return

    try {
      await this.leadTelegramNotifier.notifyLeadContactChannelUpdated(input)
    } catch (error) {
      console.error('Telegram lead contact channel notification failed', {
        leadId: input.lead.id,
        message: error instanceof Error ? error.message : 'Unknown Telegram notification error',
      })
    }
  }

  private async notifyLeadProblemReported(
    input: Parameters<LeadTelegramNotifier['notifyLeadProblemReported']>[0],
  ) {
    try {
      await this.leadTelegramNotifier.notifyLeadProblemReported(input)
    } catch (error) {
      console.error('Telegram lead problem notification failed', {
        leadId: input.lead.id,
        message: error instanceof Error ? error.message : 'Unknown Telegram notification error',
      })
    }
  }

  async getReviewsBySlug(slug: string): Promise<ExcursionReviewsResponse> {
    const excursion = await this.db.excursion.findFirst({
      where: {
        slug,
        status: ExcursionStatus.PUBLISHED,
      },
      select: {
        slug: true,
        tripadvisorLocationId: true,
        tripadvisorSyncStatus: true,
        tripadvisorMatchStatus: true,
        tripadvisorWebUrl: true,
        tripadvisorRating: true,
        tripadvisorReviewCount: true,
      },
    })

    if (!excursion) {
      throw new AppError(404, 'NOT_FOUND', 'Excursion not found')
    }

    if (!excursion.tripadvisorLocationId || !this.tripAdvisorClient) {
      return {
        excursionSlug: excursion.slug,
        source: 'tripadvisor',
        sourceUrl: excursion.tripadvisorWebUrl,
        score: normalizeNumberFromPrisma(excursion.tripadvisorRating),
        reviewCount: excursion.tripadvisorReviewCount,
        items: [],
      }
    }

    if (
      excursion.tripadvisorSyncStatus !== TripAdvisorSyncStatus.SUCCESS ||
      excursion.tripadvisorMatchStatus !== TripAdvisorMatchStatus.APPROVED
    ) {
      return {
        excursionSlug: excursion.slug,
        source: 'tripadvisor',
        sourceUrl: excursion.tripadvisorWebUrl,
        score: normalizeNumberFromPrisma(excursion.tripadvisorRating),
        reviewCount: excursion.tripadvisorReviewCount,
        items: [],
      }
    }

    let rating: TripAdvisorRatingSnapshot
    let reviews: TripAdvisorReviewItemSnapshot[]
    try {
      ;[rating, reviews] = await Promise.all([
        this.tripAdvisorClient.getLocationRating(excursion.tripadvisorLocationId),
        this.tripAdvisorClient.getLocationReviews(excursion.tripadvisorLocationId),
      ])
    } catch {
      return {
        excursionSlug: excursion.slug,
        source: 'tripadvisor',
        sourceUrl: excursion.tripadvisorWebUrl,
        score: normalizeNumberFromPrisma(excursion.tripadvisorRating),
        reviewCount: excursion.tripadvisorReviewCount,
        items: [],
      }
    }

    const reviewItems = reviews
      .filter((review) => review.text.length > 0)
      .map((review) => ({
        ...review,
        title: review.title,
      }))

    return {
      excursionSlug: excursion.slug,
      source: 'tripadvisor',
      sourceUrl: rating.webUrl ?? excursion.tripadvisorWebUrl,
      score: rating.rating,
      reviewCount: rating.reviewCount ?? excursion.tripadvisorReviewCount,
      items: reviewItems,
    }
  }
}

function normalizeNumberFromPrisma(value: unknown | null) {
  if (value === null) return null
  const normalized = Number(value)
  if (!Number.isFinite(normalized)) return null

  return Math.min(5, Math.max(0, normalized))
}

type ExcursionWithCategoryAndPhotos = Prisma.ExcursionGetPayload<{
  include: {
    category: true
    photos: true
  }
}>

type LeadRecord = Prisma.LeadGetPayload<Record<string, never>>

function toExcursionCardDto(excursion: ExcursionWithCategoryAndPhotos): ExcursionCardDto {
  const cardPhotos = carouselPhotos(excursion.photos)

  return {
    id: excursion.id,
    slug: excursion.slug,
    title: excursion.title,
    categorySlug: excursion.category.slug,
    shortEmotion: excursion.shortEmotion,
    priceFromRub: excursion.priceFromRub,
    priceFromThb: excursion.priceFromThb,
    currencyNote: excursion.currencyNote,
    duration: excursion.duration,
    coverPhotoUrl: cardPhotos.find((photo) => photo.isCover)?.url ?? cardPhotos[0]?.url ?? null,
    carouselPhotoUrls: cardPhotos.map((photo) => photo.url),
    externalRating: toExternalRating(excursion),
    status: toExcursionStatus(excursion.status),
  }
}

function toExcursionDetailDto(excursion: ExcursionWithCategoryAndPhotos): ExcursionDetailDto {
  return {
    ...toExcursionCardDto(excursion),
    description: excursion.description,
    route: excursion.route,
    priceFromThb: excursion.priceFromThb,
    rubRate: Number(excursion.rubRate),
    rateDate: excursion.rateDate.toISOString(),
    included: jsonStringArray(excursion.included),
    notIncluded: jsonStringArray(excursion.notIncluded),
    takeWithYou: jsonStringArray(excursion.takeWithYou),
    restrictions: jsonStringArray(excursion.restrictions),
    insurance: excursion.insurance,
    guideLanguageNote: excursion.guideLanguageNote,
    cancellationPolicy: excursion.cancellationPolicy,
    photos: excursion.photos.map((photo) => ({
      id: photo.id,
      url: photo.url,
      storageProvider: photo.storageProvider,
      imageType: toPhotoImageType(photo.imageType),
      alt: photo.alt,
      isCover: photo.isCover,
      block: photo.block,
      role: photo.role,
      sortOrder: photo.sortOrder,
      needsReview: photo.needsReview,
    })),
  }
}

function toLeadDto(lead: LeadRecord): LeadDto {
  return {
    id: lead.id,
    publicNumber: lead.publicNumber,
    status: toLeadStatus(lead.status),
    source: toLeadSourceDto(lead.source),
    isTest: lead.isTest,
    serviceType: toLeadServiceType(lead.serviceType),
    excursionId: lead.excursionId ?? '',
    excursionTitle: lead.excursionTitle,
    partnerId: lead.partnerId,
    userId: lead.userId,
    customerName: lead.customerName,
    customerPhone: lead.customerPhone,
    customerTelegram: lead.customerTelegram,
    contactChannel: lead.contactChannel ? toLeadContactChannelDto(lead.contactChannel) : null,
    requestedDate: lead.requestedDate?.toISOString() ?? null,
    peopleCount: lead.peopleCount,
    comment: lead.comment,
    priceRub: lead.priceRub,
    priceThb: lead.priceThb,
    commissionThb: lead.commissionThb,
    commissionTotal: lead.commissionTotal,
    createdAt: lead.createdAt.toISOString(),
  }
}

function publicLeadNumber() {
  const date = new Date()
  const day = date.toISOString().slice(0, 10).replaceAll('-', '')
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase()
  return `PG-${day}-${suffix}`
}

function followUpQuestionsFor(serviceType: LeadDto['serviceType']): LeadFollowUpQuestion[] {
  const passportInstruction: LeadFollowUpQuestion = {
    key: 'prepare_passport',
    kind: 'instruction',
    prompt: 'Пожалуйста, подготовьте паспорт. Он может понадобиться менеджеру для оформления.',
    placeholder: null,
    isRequired: false,
    sortOrder: 90,
  }

  const questionsByServiceType: Record<LeadDto['serviceType'], LeadFollowUpQuestion[]> = {
    excursion: [
      {
        key: 'desired_dates',
        kind: 'text',
        prompt: 'Какие даты вам удобны?',
        placeholder: 'Например: 12 или 13 июля, лучше утром',
        isRequired: false,
        sortOrder: 10,
      },
      {
        key: 'people_count',
        kind: 'number',
        prompt: 'Сколько человек планирует поехать?',
        placeholder: 'Например: 2',
        isRequired: false,
        sortOrder: 20,
      },
      {
        key: 'hotel_or_area',
        kind: 'text',
        prompt: 'В каком отеле или районе вы находитесь?',
        placeholder: 'Например: Patong, The Kee Resort',
        isRequired: false,
        sortOrder: 30,
      },
      {
        key: 'service_details',
        kind: 'text',
        prompt: 'Что хотите уточнить по экскурсии?',
        placeholder: 'Например: трансфер, время старта или условия для детей',
        isRequired: false,
        sortOrder: 40,
      },
    ],
    bike_rental: [
      {
        key: 'desired_dates',
        kind: 'text',
        prompt: 'На какие даты нужен байк?',
        placeholder: 'Например: с 12 по 15 июля',
        isRequired: false,
        sortOrder: 10,
      },
      {
        key: 'rental_duration',
        kind: 'text',
        prompt: 'На сколько дней планируете аренду?',
        placeholder: 'Например: 3 дня или на месяц',
        isRequired: false,
        sortOrder: 20,
      },
      {
        key: 'bike_preference',
        kind: 'text',
        prompt: 'Какой байк вам интересен?',
        placeholder: 'Например: Honda Click, PCX или любой автомат',
        isRequired: false,
        sortOrder: 30,
      },
      {
        key: 'pickup_location',
        kind: 'text',
        prompt: 'Куда удобно подать байк или где вам удобнее забрать?',
        placeholder: 'Например: отель в Patong или район Rawai',
        isRequired: false,
        sortOrder: 40,
      },
      {
        key: 'service_details',
        kind: 'text',
        prompt: 'Есть пожелания по аренде?',
        placeholder: 'Например: второй шлем, держатель телефона или страховка',
        isRequired: false,
        sortOrder: 50,
      },
    ],
    visa: [
      {
        key: 'visa_goal',
        kind: 'text',
        prompt: 'Какой вопрос по визе хотите решить?',
        placeholder: 'Например: продление, новая виза, консультация по документам',
        isRequired: false,
        sortOrder: 10,
      },
      {
        key: 'desired_dates',
        kind: 'text',
        prompt: 'К каким датам желательно успеть?',
        placeholder: 'Например: до 20 июля',
        isRequired: false,
        sortOrder: 20,
      },
      {
        key: 'people_count',
        kind: 'number',
        prompt: 'На сколько человек нужна помощь?',
        placeholder: 'Например: 1',
        isRequired: false,
        sortOrder: 30,
      },
      {
        key: 'hotel_or_area',
        kind: 'text',
        prompt: 'В каком районе вы сейчас находитесь?',
        placeholder: 'Например: Kata, Patong, Phuket Town',
        isRequired: false,
        sortOrder: 40,
      },
      {
        key: 'service_details',
        kind: 'text',
        prompt: 'Что еще важно передать менеджеру?',
        placeholder: 'Например: срок текущего штампа или особая ситуация',
        isRequired: false,
        sortOrder: 50,
      },
    ],
    border_run: [
      {
        key: 'desired_dates',
        kind: 'text',
        prompt: 'Какие даты для border run вам подходят?',
        placeholder: 'Например: 12 или 13 июля',
        isRequired: false,
        sortOrder: 10,
      },
      {
        key: 'people_count',
        kind: 'number',
        prompt: 'Сколько человек поедет?',
        placeholder: 'Например: 2',
        isRequired: false,
        sortOrder: 20,
      },
      {
        key: 'hotel_or_area',
        kind: 'text',
        prompt: 'Откуда вас удобно забрать?',
        placeholder: 'Например: отель в Karon',
        isRequired: false,
        sortOrder: 30,
      },
      {
        key: 'border_run_direction',
        kind: 'text',
        prompt: 'Есть предпочтение по направлению border run?',
        placeholder: 'Например: Малайзия, Ранонг или подберет менеджер',
        isRequired: false,
        sortOrder: 40,
      },
      {
        key: 'service_details',
        kind: 'text',
        prompt: 'Что еще нужно учесть?',
        placeholder: 'Например: дети, багаж, срочность или ограничения по времени',
        isRequired: false,
        sortOrder: 50,
      },
    ],
    car_rental: [
      {
        key: 'desired_dates',
        kind: 'text',
        prompt: 'На какие даты нужна машина?',
        placeholder: 'Например: с 12 по 18 июля',
        isRequired: false,
        sortOrder: 10,
      },
      {
        key: 'rental_duration',
        kind: 'text',
        prompt: 'На сколько дней планируете аренду?',
        placeholder: 'Например: неделя или только выходные',
        isRequired: false,
        sortOrder: 20,
      },
      {
        key: 'car_preference',
        kind: 'text',
        prompt: 'Какая машина вам интересна?',
        placeholder: 'Например: компактная, SUV, 7 мест или любая автомат',
        isRequired: false,
        sortOrder: 30,
      },
      {
        key: 'pickup_location',
        kind: 'text',
        prompt: 'Где удобно получить машину?',
        placeholder: 'Например: аэропорт, отель в Bang Tao или Rawai',
        isRequired: false,
        sortOrder: 40,
      },
      {
        key: 'service_details',
        kind: 'text',
        prompt: 'Есть пожелания по аренде?',
        placeholder: 'Например: детское кресло, страховка или доставка к отелю',
        isRequired: false,
        sortOrder: 50,
      },
    ],
    money_exchange: [
      {
        key: 'exchange_currency',
        kind: 'text',
        prompt: 'Какую валюту хотите обменять?',
        placeholder: 'Например: USD, EUR, RUB или USDT',
        isRequired: false,
        sortOrder: 10,
      },
      {
        key: 'exchange_amount',
        kind: 'text',
        prompt: 'Какая примерно сумма обмена?',
        placeholder: 'Например: 1000 USD или 100 000 RUB',
        isRequired: false,
        sortOrder: 20,
      },
      {
        key: 'hotel_or_area',
        kind: 'text',
        prompt: 'В каком районе вам удобно встретиться?',
        placeholder: 'Например: Patong, Kata, Rawai',
        isRequired: false,
        sortOrder: 30,
      },
      {
        key: 'desired_dates',
        kind: 'text',
        prompt: 'Когда удобно провести обмен?',
        placeholder: 'Например: сегодня после 16:00 или завтра утром',
        isRequired: false,
        sortOrder: 40,
      },
      {
        key: 'service_details',
        kind: 'text',
        prompt: 'Есть детали, которые важно передать менеджеру?',
        placeholder: 'Например: нужна доставка или хотите уточнить курс',
        isRequired: false,
        sortOrder: 50,
      },
    ],
  }

  return [
    ...questionsByServiceType[serviceType],
    {
      ...passportInstruction,
      sortOrder: 90,
    },
  ]
}

function jsonStringArray(value: Prisma.JsonValue | null) {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function carouselPhotos(excursionPhotos: ExcursionWithCategoryAndPhotos['photos']) {
  const carousel = excursionPhotos.filter((photo) => photo.block === 'carousel')
  return carousel.length > 0 ? carousel : excursionPhotos
}

function toExternalRating(excursion: ExcursionWithCategoryAndPhotos) {
  if (
    !excursion.tripadvisorDisplayAllowed ||
    excursion.tripadvisorSyncStatus !== TripAdvisorSyncStatus.SUCCESS ||
    excursion.tripadvisorMatchStatus !== TripAdvisorMatchStatus.APPROVED
  ) {
    return null
  }

  if (excursion.tripadvisorRating === null || excursion.tripadvisorWebUrl === null) {
    return null
  }

  const score = Number(excursion.tripadvisorRating)

  return {
    source: 'tripadvisor' as const,
    label: 'TripAdvisor',
    score: Number.isFinite(score) ? score : null,
    reviewCount: excursion.tripadvisorReviewCount,
    url: excursion.tripadvisorWebUrl,
  }
}

function toExcursionStatus(status: ExcursionStatus) {
  if (status === ExcursionStatus.DRAFT) return 'draft'
  if (status === ExcursionStatus.PUBLISHED) return 'published'
  return 'hidden'
}

function toPhotoImageType(imageType: ExcursionPhotoImageType) {
  if (imageType === ExcursionPhotoImageType.AI_ENHANCED) return 'ai_enhanced'
  if (imageType === ExcursionPhotoImageType.AI_GENERATED) return 'ai_generated'
  return 'real'
}

function toLeadStatus(status: LeadStatus) {
  if (status === LeadStatus.WAITING_PARTNER) return 'waiting_partner'
  return status.toLowerCase() as LeadDto['status']
}

function toLeadStatusFromTelegramAction(action: 'accept' | 'decline' | 'paid' | 'complete') {
  if (action === 'accept') return LeadStatus.ACCEPTED
  if (isTelegramPaymentAction(action)) return LeadStatus.PAID
  return LeadStatus.DECLINED
}

function telegramLeadStatusHistoryComment(action: 'accept' | 'decline' | 'paid' | 'complete') {
  if (action === 'accept') return 'Lead accepted from Telegram partner callback.'
  if (isTelegramPaymentAction(action)) return 'Lead payment received from Telegram partner callback.'
  return 'Lead declined from Telegram partner callback.'
}

function isTelegramPaymentAction(action: 'accept' | 'decline' | 'paid' | 'complete') {
  return action === 'paid' || action === 'complete'
}

function assertLeadTelegramPartner(
  lead: { partner: { telegramChatId: string | null } },
  partnerTelegramChatId: string,
) {
  if (!lead.partner.telegramChatId) {
    throw new AppError(403, 'FORBIDDEN', 'Lead partner is not linked to Telegram')
  }

  if (lead.partner.telegramChatId !== partnerTelegramChatId) {
    throw new AppError(403, 'FORBIDDEN', 'Telegram user cannot update this lead')
  }
}

function leadCustomerContactUrl(lead: {
  customerTelegram: string | null
  contactChannel: LeadContactChannel | null
  customerPhone: string
}) {
  if (lead.contactChannel === LeadContactChannel.TELEGRAM) {
    return telegramUsernameUrl(lead.customerTelegram)
  }

  if (lead.contactChannel === LeadContactChannel.WHATSAPP) {
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

type LeadTelegramCallbackReason =
  | 'no_response'
  | 'no_slots'
  | 'no_seats'
  | 'rude'
  | 'spam'
  | 'competitor'
  | 'need_admin'
  | 'other'

function leadCallbackReasonLabel(reason: LeadTelegramCallbackReason) {
  if (reason === 'no_response') return 'Клиент не отвечает'
  if (reason === 'no_slots' || reason === 'no_seats') return 'Нет вариантов на дату'
  if (reason === 'rude') return 'Некорректное общение'
  if (reason === 'spam') return 'Спам'
  if (reason === 'competitor') return 'Конкурент или проверка'
  if (reason === 'need_admin') return 'Нужна помощь админа'
  return 'Другая причина'
}

function normalizeTelegramCustomReason(value: string) {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Reason text is required')
  }

  return normalized.slice(0, 500)
}

function toLeadSource(source: string) {
  if (source === 'article') return LeadSource.ARTICLE
  if (source === 'admin') return LeadSource.ADMIN
  if (source === 'telegram') return LeadSource.TELEGRAM
  return LeadSource.WEBSITE
}

function toLeadSourceDto(source: LeadSource) {
  return source.toLowerCase() as LeadDto['source']
}

function toLeadServiceType(serviceType: LeadServiceType) {
  if (serviceType === LeadServiceType.BIKE_RENTAL) return 'bike_rental'
  if (serviceType === LeadServiceType.CAR_RENTAL) return 'car_rental'
  if (serviceType === LeadServiceType.BORDER_RUN) return 'border_run'
  if (serviceType === LeadServiceType.MONEY_EXCHANGE) return 'money_exchange'
  if (serviceType === LeadServiceType.VISA) return 'visa'
  return 'excursion'
}

function toLeadContactChannel(channel: string) {
  if (channel === 'whatsapp') return LeadContactChannel.WHATSAPP
  if (channel === 'max') return LeadContactChannel.MAX
  return LeadContactChannel.TELEGRAM
}

function toLeadContactChannelDto(channel: LeadContactChannel) {
  return channel.toLowerCase() as NonNullable<LeadDto['contactChannel']>
}

function isRecordNotFound(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'
}
