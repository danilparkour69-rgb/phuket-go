import { z } from 'zod'

const trimmedString = z.string().trim()
const optionalTrimmedString = z
  .union([trimmedString.min(1), z.literal('')])
  .optional()
  .transform((value) => {
    if (value === '' || value === undefined) return undefined
    return value
  })
const optionalDateString = z
  .union([
    trimmedString.regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
      const parsed = new Date(`${value}T00:00:00.000Z`)
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    }, 'Expected a valid YYYY-MM-DD date'),
    z.literal(''),
  ])
  .optional()
  .transform((value) => {
    if (value === '' || value === undefined) return undefined
    return value
  })

export const excursionStatusSchema = z.enum(['draft', 'published', 'hidden'])
export const leadStatusSchema = z.enum([
  'new',
  'waiting_partner',
  'accepted',
  'declined',
  'completed',
  'cancelled',
])
export const leadSourceSchema = z.enum(['website', 'article', 'admin', 'telegram'])
export const leadContactChannelSchema = z.enum(['telegram', 'whatsapp', 'max'])
export const photoImageTypeSchema = z.enum(['real', 'ai_enhanced', 'ai_generated'])
export const leadIdParamsSchema = z.object({
  id: trimmedString.min(1),
})
export const excursionSlugParamsSchema = z.object({
  slug: trimmedString.min(1),
})
export const excursionListQuerySchema = z.object({
  category: optionalTrimmedString,
  minPriceRub: z.coerce.number().int().nonnegative().optional(),
  maxPriceRub: z.coerce.number().int().nonnegative().optional(),
})

export const excursionCategorySchema = z.object({
  id: z.string(),
  slug: trimmedString.min(1),
  title: trimmedString.min(1),
  description: z.string().nullable(),
  sortOrder: z.number().int().nonnegative(),
  status: excursionStatusSchema,
})

export const excursionPhotoSchema = z.object({
  id: z.string(),
  url: trimmedString.min(1),
  storageProvider: trimmedString.min(1),
  imageType: photoImageTypeSchema,
  alt: z.string().nullable(),
  isCover: z.boolean(),
  block: z.string().nullable(),
  role: z.string().nullable(),
  sortOrder: z.number().int().nonnegative(),
  needsReview: z.boolean(),
})

export const externalRatingSchema = z.object({
  source: z.enum(['tripadvisor']),
  label: trimmedString.min(1),
  score: z.number().min(0).max(5).nullable(),
  reviewCount: z.number().int().nonnegative().nullable(),
  url: trimmedString.min(1).nullable(),
})

export const excursionCardSchema = z.object({
  id: z.string(),
  slug: trimmedString.min(1),
  title: trimmedString.min(1),
  categorySlug: trimmedString.min(1),
  shortEmotion: trimmedString.min(1),
  priceFromRub: z.number().int().nonnegative(),
  priceFromThb: z.number().int().nonnegative(),
  currencyNote: trimmedString.min(1),
  duration: z.string().nullable(),
  coverPhotoUrl: z.string().nullable(),
  carouselPhotoUrls: z.array(trimmedString.min(1)).default([]),
  externalRating: externalRatingSchema.nullable().default(null),
  status: excursionStatusSchema,
})

export const excursionDetailSchema = excursionCardSchema.extend({
  description: trimmedString.min(1),
  route: z.string().nullable(),
  rubRate: z.number().positive(),
  rateDate: z.string().datetime(),
  included: z.array(z.string()).default([]),
  notIncluded: z.array(z.string()).default([]),
  takeWithYou: z.array(z.string()).default([]),
  restrictions: z.array(z.string()).default([]),
  insurance: trimmedString.min(1),
  guideLanguageNote: z.string().nullable(),
  cancellationPolicy: z.string().nullable(),
  photos: z.array(excursionPhotoSchema),
})

export const tripAdvisorReviewItemSchema = z.object({
  title: z.string().nullable(),
  text: z.string().min(1),
  rating: z.number().min(0).max(5).nullable(),
  author: z.string().nullable(),
  date: z.string().nullable(),
  location: z.string().nullable(),
})

export const excursionReviewsResponseSchema = z.object({
  excursionSlug: trimmedString.min(1),
  source: z.enum(['tripadvisor']).default('tripadvisor'),
  sourceUrl: z.string().url().nullable(),
  score: z.number().min(0).max(5).nullable(),
  reviewCount: z.number().int().nonnegative().nullable(),
  items: z.array(tripAdvisorReviewItemSchema),
})

export const createLeadRequestSchema = z.object({
  excursionId: trimmedString.min(1),
  customerName: trimmedString.min(2).max(120),
  customerPhone: trimmedString.min(5).max(40),
  customerTelegram: optionalTrimmedString,
  contactChannel: leadContactChannelSchema.optional(),
  requestedDate: optionalDateString,
  peopleCount: z.number().int().positive().max(100).optional(),
  comment: optionalTrimmedString,
  source: leadSourceSchema.default('website'),
  sourcePage: optionalTrimmedString,
})

export const updateLeadContactChannelRequestSchema = z.object({
  contactChannel: leadContactChannelSchema,
})

export const leadSchema = z.object({
  id: z.string(),
  publicNumber: trimmedString.min(1),
  status: leadStatusSchema,
  source: leadSourceSchema,
  excursionId: z.string(),
  excursionTitle: trimmedString.min(1),
  partnerId: z.string(),
  userId: z.string().nullable(),
  customerName: trimmedString.min(1),
  customerPhone: trimmedString.min(1),
  customerTelegram: z.string().nullable(),
  contactChannel: leadContactChannelSchema.nullable(),
  requestedDate: z.string().datetime().nullable(),
  peopleCount: z.number().int().positive().nullable(),
  comment: z.string().nullable(),
  priceRub: z.number().int().nonnegative().nullable(),
  priceThb: z.number().int().nonnegative().nullable(),
  commissionThb: z.number().int().nonnegative(),
  commissionTotal: z.number().int().nonnegative().nullable(),
  createdAt: z.string().datetime(),
})

export const excursionListResponseSchema = z.object({
  excursions: z.array(excursionCardSchema),
})

export const excursionDetailResponseSchema = z.object({
  excursion: excursionDetailSchema,
})

export const leadResponseSchema = z.object({
  lead: leadSchema,
})

export type TripAdvisorReviewItem = z.infer<typeof tripAdvisorReviewItemSchema>
export type ExcursionReviewsResponse = z.infer<typeof excursionReviewsResponseSchema>

export type ExcursionStatus = z.infer<typeof excursionStatusSchema>
export type LeadStatus = z.infer<typeof leadStatusSchema>
export type LeadSource = z.infer<typeof leadSourceSchema>
export type LeadContactChannel = z.infer<typeof leadContactChannelSchema>
export type PhotoImageType = z.infer<typeof photoImageTypeSchema>
export type LeadIdParams = z.infer<typeof leadIdParamsSchema>
export type ExcursionSlugParams = z.infer<typeof excursionSlugParamsSchema>
export type ExcursionListQuery = z.output<typeof excursionListQuerySchema>
export type ExcursionCategoryDto = z.infer<typeof excursionCategorySchema>
export type ExcursionPhotoDto = z.infer<typeof excursionPhotoSchema>
export type ExternalRatingDto = z.infer<typeof externalRatingSchema>
export type ExcursionCardDto = z.infer<typeof excursionCardSchema>
export type ExcursionDetailDto = z.infer<typeof excursionDetailSchema>
export type CreateLeadRequest = z.input<typeof createLeadRequestSchema>
export type CreateLeadPayload = z.output<typeof createLeadRequestSchema>
export type UpdateLeadContactChannelRequest = z.infer<
  typeof updateLeadContactChannelRequestSchema
>
export type LeadDto = z.infer<typeof leadSchema>
export type ExcursionListResponse = z.infer<typeof excursionListResponseSchema>
export type ExcursionDetailResponse = z.infer<typeof excursionDetailResponseSchema>
export type LeadResponse = z.infer<typeof leadResponseSchema>
