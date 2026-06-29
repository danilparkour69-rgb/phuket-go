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
  LeadSource,
  LeadStatus,
  TripAdvisorMatchStatus,
  TripAdvisorSyncStatus,
  Prisma,
} from '../generated/prisma/client'
import { AppError } from '../http/errors'
import { TripAdvisorClient } from '../tripadvisor/client'
import type { TripAdvisorRatingSnapshot, TripAdvisorReviewItemSnapshot } from '../tripadvisor/client'

export class CatalogService {
  constructor(
    private readonly db: DbClient,
    private readonly tripAdvisorClient: TripAdvisorClient | null,
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

    return toLeadDto(lead)
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

function normalizeNumberFromPrisma(value: string | null) {
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

function toLeadSource(source: string) {
  if (source === 'article') return LeadSource.ARTICLE
  if (source === 'admin') return LeadSource.ADMIN
  if (source === 'telegram') return LeadSource.TELEGRAM
  return LeadSource.WEBSITE
}

function toLeadSourceDto(source: LeadSource) {
  return source.toLowerCase() as LeadDto['source']
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
