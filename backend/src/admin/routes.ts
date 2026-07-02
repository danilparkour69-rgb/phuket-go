import {
  adminCreateLeadRequestSchema,
  adminCreateLeadResponseSchema,
  adminLeadAdminNoteRequestSchema,
  adminLeadBulkStatusActionRequestSchema,
  adminLeadBulkStatusActionResponseSchema,
  adminLeadDetailResponseSchema,
  adminLeadExportQuerySchema,
  adminLeadIdParamsSchema,
  adminLeadListQuerySchema,
  adminLeadListResponseSchema,
  adminLeadSheetsSyncResponseSchema,
  adminLeadStatusActionRequestSchema,
  adminBindPartnerTelegramContactRequestSchema,
  adminBindPartnerTelegramContactResponseSchema,
  adminPartnerListResponseSchema,
  adminPartnerIdParamsSchema,
  adminServiceTypeListResponseSchema,
  adminTelegramContactListResponseSchema,
  apiErrorSchema,
} from '@phuket-go/contracts'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { z } from 'zod'

import type { AuthService } from '../auth/service'
import { validationErrorHook } from '../http/errors'
import type { AdminService } from './service'

type AdminRouteEnv = {
  Variables: {
    adminService: AdminService
    authService: AuthService
  }
}

const json = <T>(schema: T) => ({
  'application/json': {
    schema,
  },
})

const errorResponseContent = json(apiErrorSchema)

const listLeadsRoute = createRoute({
  method: 'get',
  path: '/leads',
  request: {
    query: adminLeadListQuerySchema,
  },
  responses: {
    200: {
      content: json(adminLeadListResponseSchema),
      description: 'Admin lead list',
    },
    401: {
      content: errorResponseContent,
      description: 'Missing or invalid access token',
    },
    403: {
      content: errorResponseContent,
      description: 'Admin access required',
    },
  },
})

const listPartnersRoute = createRoute({
  method: 'get',
  path: '/partners',
  responses: {
    200: {
      content: json(adminPartnerListResponseSchema),
      description: 'Admin partner options',
    },
    401: {
      content: errorResponseContent,
      description: 'Missing or invalid access token',
    },
    403: {
      content: errorResponseContent,
      description: 'Admin access required',
    },
  },
})

const listServiceTypesRoute = createRoute({
  method: 'get',
  path: '/service-types',
  responses: {
    200: {
      content: json(adminServiceTypeListResponseSchema),
      description: 'Admin service type options',
    },
    401: {
      content: errorResponseContent,
      description: 'Missing or invalid access token',
    },
    403: {
      content: errorResponseContent,
      description: 'Admin access required',
    },
  },
})

const listTelegramContactsRoute = createRoute({
  method: 'get',
  path: '/telegram/contacts',
  responses: {
    200: {
      content: json(adminTelegramContactListResponseSchema),
      description: 'Telegram contacts seen by the bot',
    },
    401: {
      content: errorResponseContent,
      description: 'Missing or invalid access token',
    },
    403: {
      content: errorResponseContent,
      description: 'Admin access required',
    },
  },
})

const bindPartnerTelegramContactRoute = createRoute({
  method: 'patch',
  path: '/partners/{id}/telegram-contact',
  request: {
    params: adminPartnerIdParamsSchema,
    body: {
      content: json(adminBindPartnerTelegramContactRequestSchema),
    },
  },
  responses: {
    200: {
      content: json(adminBindPartnerTelegramContactResponseSchema),
      description: 'Bind a Telegram contact to a partner',
    },
    400: {
      content: errorResponseContent,
      description: 'Invalid payload',
    },
    401: {
      content: errorResponseContent,
      description: 'Missing or invalid access token',
    },
    403: {
      content: errorResponseContent,
      description: 'Admin access required',
    },
    404: {
      content: errorResponseContent,
      description: 'Partner or Telegram contact not found',
    },
    409: {
      content: errorResponseContent,
      description: 'Telegram contact is already linked to another partner',
    },
  },
})

const createLeadRoute = createRoute({
  method: 'post',
  path: '/leads',
  request: {
    body: {
      content: json(adminCreateLeadRequestSchema),
    },
  },
  responses: {
    201: {
      content: json(adminCreateLeadResponseSchema),
      description: 'Admin-created lead detail with status history',
    },
    400: {
      content: errorResponseContent,
      description: 'Invalid payload',
    },
    401: {
      content: errorResponseContent,
      description: 'Missing or invalid access token',
    },
    403: {
      content: errorResponseContent,
      description: 'Admin access required',
    },
    404: {
      content: errorResponseContent,
      description: 'Partner or excursion not found',
    },
  },
})

const exportLeadsCsvRoute = createRoute({
  method: 'get',
  path: '/leads/export.csv',
  request: {
    query: adminLeadExportQuerySchema,
  },
  responses: {
    200: {
      content: {
        'text/csv': {
          schema: z.string(),
        },
      },
      description: 'Admin lead CSV export',
    },
    401: {
      content: errorResponseContent,
      description: 'Missing or invalid access token',
    },
    403: {
      content: errorResponseContent,
      description: 'Admin access required',
    },
  },
})

const getLeadDetailRoute = createRoute({
  method: 'get',
  path: '/leads/{id}',
  request: {
    params: adminLeadIdParamsSchema,
  },
  responses: {
    200: {
      content: json(adminLeadDetailResponseSchema),
      description: 'Admin lead detail with status history',
    },
    401: {
      content: errorResponseContent,
      description: 'Missing or invalid access token',
    },
    403: {
      content: errorResponseContent,
      description: 'Admin access required',
    },
    404: {
      content: errorResponseContent,
      description: 'Lead not found',
    },
  },
})

const syncLeadGoogleSheetsRoute = createRoute({
  method: 'post',
  path: '/leads/{id}/google-sheets-sync',
  request: {
    params: adminLeadIdParamsSchema,
  },
  responses: {
    200: {
      content: json(adminLeadSheetsSyncResponseSchema),
      description: 'Manual Google Sheets lead sync result',
    },
    401: {
      content: errorResponseContent,
      description: 'Missing or invalid access token',
    },
    403: {
      content: errorResponseContent,
      description: 'Admin access required',
    },
    404: {
      content: errorResponseContent,
      description: 'Lead not found',
    },
    502: {
      content: errorResponseContent,
      description: 'Google Sheets sync failed',
    },
  },
})

const updateLeadStatusRoute = createRoute({
  method: 'patch',
  path: '/leads/{id}/status',
  request: {
    params: adminLeadIdParamsSchema,
    body: {
      content: json(adminLeadStatusActionRequestSchema),
    },
  },
  responses: {
    200: {
      content: json(adminLeadDetailResponseSchema),
      description: 'Admin lead status quick action result',
    },
    400: {
      content: errorResponseContent,
      description: 'Invalid payload',
    },
    401: {
      content: errorResponseContent,
      description: 'Missing or invalid access token',
    },
    403: {
      content: errorResponseContent,
      description: 'Admin access required',
    },
    404: {
      content: errorResponseContent,
      description: 'Lead not found',
    },
  },
})

const bulkUpdateLeadStatusRoute = createRoute({
  method: 'patch',
  path: '/leads/bulk/status',
  request: {
    body: {
      content: json(adminLeadBulkStatusActionRequestSchema),
    },
  },
  responses: {
    200: {
      content: json(adminLeadBulkStatusActionResponseSchema),
      description: 'Admin lead bulk status update result',
    },
    400: {
      content: errorResponseContent,
      description: 'Invalid payload',
    },
    401: {
      content: errorResponseContent,
      description: 'Missing or invalid access token',
    },
    403: {
      content: errorResponseContent,
      description: 'Admin access required',
    },
    404: {
      content: errorResponseContent,
      description: 'One or more leads not found',
    },
  },
})

const updateLeadAdminNoteRoute = createRoute({
  method: 'patch',
  path: '/leads/{id}/admin-note',
  request: {
    params: adminLeadIdParamsSchema,
    body: {
      content: json(adminLeadAdminNoteRequestSchema),
    },
  },
  responses: {
    200: {
      content: json(adminLeadDetailResponseSchema),
      description: 'Admin lead note update result',
    },
    400: {
      content: errorResponseContent,
      description: 'Invalid payload',
    },
    401: {
      content: errorResponseContent,
      description: 'Missing or invalid access token',
    },
    403: {
      content: errorResponseContent,
      description: 'Admin access required',
    },
    404: {
      content: errorResponseContent,
      description: 'Lead not found',
    },
  },
})

export function createAdminRoutes() {
  const routes = new OpenAPIHono<AdminRouteEnv>({
    defaultHook: validationErrorHook,
  })

  routes.openapi(listLeadsRoute, async (c) => {
    const auth = c.get('authService')
    await auth.requireAdmin(bearerToken(c))

    const admin = c.get('adminService')
    return c.json(await admin.listLeads(c.req.valid('query')), 200)
  })

  routes.openapi(listPartnersRoute, async (c) => {
    const auth = c.get('authService')
    await auth.requireAdmin(bearerToken(c))

    const admin = c.get('adminService')
    return c.json(await admin.listPartners(), 200)
  })

  routes.openapi(listServiceTypesRoute, async (c) => {
    const auth = c.get('authService')
    await auth.requireAdmin(bearerToken(c))

    const admin = c.get('adminService')
    return c.json(admin.listServiceTypes(), 200)
  })

  routes.openapi(listTelegramContactsRoute, async (c) => {
    const auth = c.get('authService')
    await auth.requireAdmin(bearerToken(c))

    const admin = c.get('adminService')
    return c.json(await admin.listTelegramContacts(), 200)
  })

  routes.openapi(bindPartnerTelegramContactRoute, async (c) => {
    const auth = c.get('authService')
    const adminUser = await auth.requireAdmin(bearerToken(c))

    const admin = c.get('adminService')
    const { id } = c.req.valid('param')
    return c.json(await admin.bindPartnerTelegramContact(id, c.req.valid('json'), adminUser.id), 200)
  })

  routes.openapi(createLeadRoute, async (c) => {
    const auth = c.get('authService')
    const adminUser = await auth.requireAdmin(bearerToken(c))

    const admin = c.get('adminService')
    return c.json(await admin.createLead(c.req.valid('json'), adminUser.id), 201)
  })

  routes.openapi(exportLeadsCsvRoute, async (c) => {
    const auth = c.get('authService')
    await auth.requireAdmin(bearerToken(c))

    const admin = c.get('adminService')
    const csv = await admin.exportLeadsCsv(c.req.valid('query'))
    return c.body(csv, 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${adminLeadCsvFilename()}"`,
    })
  })

  routes.openapi(syncLeadGoogleSheetsRoute, async (c) => {
    const auth = c.get('authService')
    await auth.requireAdmin(bearerToken(c))

    const admin = c.get('adminService')
    const { id } = c.req.valid('param')
    return c.json(await admin.syncLeadToGoogleSheets(id), 200)
  })

  routes.openapi(getLeadDetailRoute, async (c) => {
    const auth = c.get('authService')
    await auth.requireAdmin(bearerToken(c))

    const admin = c.get('adminService')
    const { id } = c.req.valid('param')
    return c.json(await admin.getLeadDetail(id), 200)
  })

  routes.openapi(bulkUpdateLeadStatusRoute, async (c) => {
    const auth = c.get('authService')
    const adminUser = await auth.requireAdmin(bearerToken(c))

    const admin = c.get('adminService')
    return c.json(await admin.bulkUpdateLeadStatus(c.req.valid('json'), adminUser.id), 200)
  })

  routes.openapi(updateLeadStatusRoute, async (c) => {
    const auth = c.get('authService')
    const adminUser = await auth.requireAdmin(bearerToken(c))

    const admin = c.get('adminService')
    const { id } = c.req.valid('param')
    return c.json(await admin.updateLeadStatus(id, c.req.valid('json'), adminUser.id), 200)
  })

  routes.openapi(updateLeadAdminNoteRoute, async (c) => {
    const auth = c.get('authService')
    const adminUser = await auth.requireAdmin(bearerToken(c))

    const admin = c.get('adminService')
    const { id } = c.req.valid('param')
    return c.json(await admin.updateLeadAdminNote(id, c.req.valid('json'), adminUser.id), 200)
  })

  return routes
}

function adminLeadCsvFilename() {
  return `admin-leads-${new Date().toISOString().slice(0, 10)}.csv`
}

function bearerToken(c: Context) {
  const authorization = c.req.header('authorization')
  if (!authorization?.startsWith('Bearer ')) return undefined
  return authorization.slice('Bearer '.length)
}
