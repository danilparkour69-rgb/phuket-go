import type {
  CreateLeadPayload,
  ExcursionCardDto,
  ExcursionDetailDto,
  ExcursionListQuery,
  ExcursionReviewsResponse,
  LeadDto,
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
      })
      .catch((error: unknown) => {
        if (isRecordNotFound(error)) {
          throw new AppError(404, 'NOT_FOUND', 'Lead not found')
        }

        throw error
      })

    return toLeadDto(lead)
  }

  async handleTelegramLeadCallback(input: {
    leadId: string
    action: 'accept' | 'decline' | 'complete'
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
          sheetsUpdate: null,
          adminNotification: null,
        }
      }

      if (input.action === 'complete' && currentLead.status !== LeadStatus.ACCEPTED) {
        throw new AppError(409, 'CONFLICT', 'Lead must be accepted before completion')
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
        sheetsUpdate: {
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
    }
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
      problemPrompt: true,
    }
  }

  async handleTelegramLeadProblemReason(input: {
    leadId: string
    reason: 'no_response' | 'no_seats' | 'need_admin' | 'other'
    partnerTelegramChatId: string
  }) {
    const partnerNote = leadProblemReasonLabel(input.reason)
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
        problemNote: partnerNote,
        sheetsUpdate: {
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

    await this.updateLeadPartnerNoteInSheets(result.sheetsUpdate)
    await this.notifyLeadProblemReported(result.adminNotification)

    return {
      leadId: result.leadId,
      publicNumber: result.publicNumber,
      status: result.status,
      changed: result.changed,
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
    serviceType: toLeadServiceType(lead.serviceType),
    excursionId: lead.excursionId,
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

function toLeadStatusFromTelegramAction(action: 'accept' | 'decline' | 'complete') {
  if (action === 'accept') return LeadStatus.ACCEPTED
  if (action === 'complete') return LeadStatus.COMPLETED
  return LeadStatus.DECLINED
}

function telegramLeadStatusHistoryComment(action: 'accept' | 'decline' | 'complete') {
  if (action === 'accept') return 'Lead accepted from Telegram partner callback.'
  if (action === 'complete') return 'Lead completed from Telegram partner callback.'
  return 'Lead declined from Telegram partner callback.'
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

function leadProblemReasonLabel(reason: 'no_response' | 'no_seats' | 'need_admin' | 'other') {
  if (reason === 'no_response') return 'Клиент не отвечает'
  if (reason === 'no_seats') return 'Нет мест'
  if (reason === 'need_admin') return 'Нужна помощь админа'
  return 'Другая причина'
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
