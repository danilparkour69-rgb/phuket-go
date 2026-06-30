import { z } from 'zod'

import {
  leadContactChannelSchema,
  leadServiceTypeSchema,
  leadSourceSchema,
  leadStatusSchema,
} from './catalog'

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
const optionalBooleanString = z
  .union([z.boolean(), z.enum(['true', 'false']), z.literal('')])
  .optional()
  .transform((value) => {
    if (value === '' || value === undefined) return undefined
    if (typeof value === 'boolean') return value
    return value === 'true'
  })

const adminLeadBaseQuerySchema = z.object({
  status: leadStatusSchema.optional(),
  serviceType: leadServiceTypeSchema.optional(),
  search: optionalTrimmedString,
  partnerId: optionalTrimmedString,
  createdFrom: optionalDateString,
  createdTo: optionalDateString,
  requiresAttention: optionalBooleanString,
  sortBy: z.enum(['created_at', 'updated_at']).default('created_at'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
})

export const adminLeadListQuerySchema = adminLeadBaseQuerySchema.extend({
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
})

export const adminLeadExportQuerySchema = adminLeadBaseQuerySchema

export const adminLeadIdParamsSchema = z.object({
  id: trimmedString.min(1),
})

export const adminLeadActorTypeSchema = z.enum(['system', 'user', 'admin', 'partner'])

export const adminLeadStatusActionRequestSchema = z.object({
  status: leadStatusSchema,
  adminNote: optionalTrimmedString,
  comment: optionalTrimmedString,
})

export const adminLeadBulkStatusActionRequestSchema = z.object({
  leadIds: z.array(trimmedString.min(1)).min(1).max(100),
  status: leadStatusSchema,
  comment: optionalTrimmedString,
})

export const adminLeadAdminNoteRequestSchema = z.object({
  adminNote: optionalTrimmedString,
})

export const adminLeadSchema = z.object({
  id: z.string(),
  publicNumber: trimmedString.min(1),
  status: leadStatusSchema,
  source: leadSourceSchema,
  serviceType: leadServiceTypeSchema,
  sourcePage: z.string().nullable(),
  excursionId: z.string(),
  excursionTitle: trimmedString.min(1),
  partnerId: z.string(),
  partnerName: trimmedString.min(1),
  partnerTelegram: z.string().nullable(),
  userId: z.string().nullable(),
  customerName: trimmedString.min(1),
  customerPhone: trimmedString.min(1),
  customerTelegram: z.string().nullable(),
  contactChannel: leadContactChannelSchema.nullable(),
  requestedDate: z.string().datetime().nullable(),
  peopleCount: z.number().int().positive().nullable(),
  comment: z.string().nullable(),
  partnerNote: z.string().nullable(),
  adminNote: z.string().nullable(),
  adminNoteUpdatedAt: z.string().datetime().nullable(),
  adminNoteUpdatedById: z.string().nullable(),
  adminNoteUpdatedByEmail: z.string().nullable(),
  adminNoteUpdatedByDisplayName: z.string().nullable(),
  priceRub: z.number().int().nonnegative().nullable(),
  priceThb: z.number().int().nonnegative().nullable(),
  commissionThb: z.number().int().nonnegative(),
  commissionTotal: z.number().int().nonnegative().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const adminLeadStatusHistoryItemSchema = z.object({
  id: z.string(),
  fromStatus: leadStatusSchema.nullable(),
  toStatus: leadStatusSchema,
  actorType: adminLeadActorTypeSchema,
  actorId: z.string().nullable(),
  comment: z.string().nullable(),
  createdAt: z.string().datetime(),
})

export const adminLeadQueueSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  new: z.number().int().nonnegative(),
  requiresAttention: z.number().int().nonnegative(),
  waitingPartner: z.number().int().nonnegative(),
})

export const adminLeadListResponseSchema = z.object({
  leads: z.array(adminLeadSchema),
  summary: adminLeadQueueSummarySchema,
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
})

export const adminLeadDetailResponseSchema = z.object({
  lead: adminLeadSchema,
  statusHistory: z.array(adminLeadStatusHistoryItemSchema),
})

export const adminLeadBulkStatusActionResponseSchema = z.object({
  requestedCount: z.number().int().nonnegative(),
  updatedCount: z.number().int().nonnegative(),
  historyCount: z.number().int().nonnegative(),
})

export const adminLeadSheetsSyncResponseSchema = z.object({
  synced: z.boolean(),
  mode: z.enum(['disabled', 'updated', 'appended']),
})

export const adminPartnerOptionSchema = z.object({
  id: z.string(),
  name: trimmedString.min(1),
  telegram: z.string().nullable(),
})

export const adminPartnerListResponseSchema = z.object({
  partners: z.array(adminPartnerOptionSchema),
})

export type AdminLeadListQuery = z.output<typeof adminLeadListQuerySchema>
export type AdminLeadExportQuery = z.output<typeof adminLeadExportQuerySchema>
export type AdminLeadStatusActionRequest = z.output<typeof adminLeadStatusActionRequestSchema>
export type AdminLeadBulkStatusActionRequest = z.output<typeof adminLeadBulkStatusActionRequestSchema>
export type AdminLeadBulkStatusActionResponse = z.infer<typeof adminLeadBulkStatusActionResponseSchema>
export type AdminLeadSheetsSyncResponse = z.infer<typeof adminLeadSheetsSyncResponseSchema>
export type AdminLeadAdminNoteRequest = z.output<typeof adminLeadAdminNoteRequestSchema>
export type AdminLeadDto = z.infer<typeof adminLeadSchema>
export type AdminLeadStatusHistoryItemDto = z.infer<typeof adminLeadStatusHistoryItemSchema>
export type AdminLeadQueueSummaryDto = z.infer<typeof adminLeadQueueSummarySchema>
export type AdminLeadListResponse = z.infer<typeof adminLeadListResponseSchema>
export type AdminLeadDetailResponse = z.infer<typeof adminLeadDetailResponseSchema>
export type AdminPartnerOptionDto = z.infer<typeof adminPartnerOptionSchema>
export type AdminPartnerListResponse = z.infer<typeof adminPartnerListResponseSchema>
