import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type {
  AdminCreateLeadRequest,
  AdminLeadBulkStatusActionRequest,
  AdminBindPartnerTelegramContactResponse,
  AdminLeadDetailResponse,
  AdminLeadDto,
  AdminLeadExportQuery,
  AdminLeadListResponse,
  AdminLeadSheetsSyncResponse,
  AdminLeadStatusActionRequest,
  AdminPartnerOptionDto,
  AdminServiceTypeOptionDto,
  AdminTelegramContactDto,
  ExcursionCardDto,
} from '@phuket-go/contracts'
import { useMemo, useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Typography } from '@/components/ui/typography'
import { ApiRequestError } from '@/lib/api'
import { getLeadSlaInfo } from '@/lib/admin-leads'
import { useAuth } from '@/lib/use-auth'

const leadStatuses = [
  'new',
  'waiting_partner',
  'accepted',
  'paid',
  'declined',
  'completed',
  'cancelled',
] as const

const statusLabels: Record<(typeof leadStatuses)[number], string> = {
  new: 'Новая',
  waiting_partner: 'Ждет партнера',
  accepted: 'Принята',
  paid: 'Оплачена',
  declined: 'Отклонена',
  completed: 'Услуга оказана',
  cancelled: 'Отменена',
}

const statusBadgeVariant: Record<
  (typeof leadStatuses)[number],
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  new: 'outline',
  waiting_partner: 'secondary',
  accepted: 'default',
  paid: 'secondary',
  declined: 'destructive',
  completed: 'secondary',
  cancelled: 'outline',
}

const quickActions = [
  { status: 'accepted', label: 'Принять' },
  { status: 'paid', label: 'Оплата получена' },
  { status: 'declined', label: 'Отклонить' },
  { status: 'completed', label: 'Услуга оказана' },
  { status: 'cancelled', label: 'Отменить' },
] as const

const actionCommentTemplates = [
  {
    label: 'Клиент подтвердил',
    comment: 'Клиент подтвердил детали, передали партнеру.',
  },
  {
    label: 'Партнер подтвердил',
    comment: 'Партнер подтвердил наличие мест.',
  },
  {
    label: 'Нет ответа',
    comment: 'Клиент не отвечает, нужен повторный контакт.',
  },
  {
    label: 'Отмена клиента',
    comment: 'Клиент попросил отменить заявку.',
  },
] as const

const contactChannelLabels: Record<NonNullable<AdminLeadDto['contactChannel']>, string> = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  max: 'MAX',
}

const leadServiceTypes = [
  'excursion',
  'bike_rental',
  'visa',
  'border_run',
  'car_rental',
  'money_exchange',
] as const

const serviceTypeLabels: Record<AdminLeadDto['serviceType'], string> = {
  excursion: 'Экскурсии',
  bike_rental: 'Аренда байков',
  visa: 'Визы',
  border_run: 'Border run',
  car_rental: 'Аренда машин',
  money_exchange: 'Обмен денег',
}

function fallbackServiceTypeOptions(): AdminServiceTypeOptionDto[] {
  return leadServiceTypes.map((serviceType, index) => ({
    value: serviceType,
    label: serviceTypeLabels[serviceType],
    isActive: true,
    sortOrder: (index + 1) * 10,
  }))
}

const adminLeadsQueryKey = ['admin', 'leads'] as const
type SummaryFilter = 'total' | 'new' | 'requires_attention' | 'waiting_partner'
type AdminLeadFilters = {
  status: 'all' | (typeof leadStatuses)[number]
  serviceType: 'all' | (typeof leadServiceTypes)[number]
  focus: 'all' | 'requires_attention'
  search: string
  partnerId: string
  createdFrom: string
  createdTo: string
  sortBy: 'created_at' | 'updated_at'
  sortDirection: 'asc' | 'desc'
}

const emptyFilters: AdminLeadFilters = {
  status: 'all',
  serviceType: 'all',
  focus: 'all',
  search: '',
  partnerId: '',
  createdFrom: '',
  createdTo: '',
  sortBy: 'created_at',
  sortDirection: 'desc',
}
const pageSizeOptions = [10, 25, 50, 100] as const

function TelegramPartnerBindingPanel({
  partners,
  contacts,
  isLoading,
  isSubmitting,
  result,
  error,
  onBind,
}: {
  partners: AdminPartnerOptionDto[]
  contacts: AdminTelegramContactDto[]
  isLoading: boolean
  isSubmitting: boolean
  result: AdminBindPartnerTelegramContactResponse | undefined
  error: unknown
  onBind: (partnerId: string, contactId: string) => void
}) {
  const [partnerId, setPartnerId] = useState('')
  const [contactId, setContactId] = useState('')
  const availableContacts = contacts.filter((contact) => !contact.linkedPartnerId)
  const selectedPartner = partners.find((partner) => partner.id === partnerId)
  const selectedContact = contacts.find((contact) => contact.id === contactId)
  const submitDisabled = isLoading || isSubmitting || !selectedPartner || !selectedContact

  return (
    <Card>
      <CardHeader className="gap-2">
        <CardTitle>Telegram менеджеры</CardTitle>
        <CardDescription>
          Привязка делается только вручную администратором после сообщения менеджера боту.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <div className="grid gap-2">
            <Label htmlFor="telegram-bind-partner">Партнер</Label>
            <Select value={partnerId} onValueChange={setPartnerId} disabled={isLoading}>
              <SelectTrigger id="telegram-bind-partner">
                <SelectValue placeholder="Выберите партнера" />
              </SelectTrigger>
              <SelectContent>
                {partners.map((partner) => (
                  <SelectItem key={partner.id} value={partner.id}>
                    {partner.name}
                    {partner.telegramChatId ? ' · Telegram привязан' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="telegram-bind-contact">Telegram контакт</Label>
            <Select value={contactId} onValueChange={setContactId} disabled={isLoading}>
              <SelectTrigger id="telegram-bind-contact">
                <SelectValue placeholder="Выберите контакт" />
              </SelectTrigger>
              <SelectContent>
                {availableContacts.map((contact) => (
                  <SelectItem key={contact.id} value={contact.id}>
                    {contact.displayName} · {contact.chatId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            disabled={submitDisabled}
            onClick={() => {
              if (selectedPartner && selectedContact) {
                onBind(selectedPartner.id, selectedContact.id)
              }
            }}
          >
            {isSubmitting ? 'Привязываем...' : 'Привязать'}
          </Button>
        </div>

        {error instanceof Error && (
          <Alert variant="destructive">
            <AlertTitle>Не удалось привязать Telegram</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        {result?.testLead && (
          <Alert>
            <AlertTitle>Тестовая заявка создана</AlertTitle>
            <AlertDescription>
              {result.testNotificationSent
                ? `Менеджеру отправлена тестовая заявка ${result.testLead.publicNumber}.`
                : `Тестовая заявка ${result.testLead.publicNumber} создана, но Telegram-отправка не подтвердилась.`}
            </AlertDescription>
          </Alert>
        )}

        {contacts.length > 0 && (
          <div className="grid gap-2">
            <Typography variant="bodySmMedium">Последние контакты бота</Typography>
            <div className="grid gap-2 md:grid-cols-2">
              {contacts.slice(0, 4).map((contact) => (
                <div key={contact.id} className="grid gap-1 rounded-lg border bg-muted/20 p-3">
                  <Typography variant="bodySmMedium" wrap="break">
                    {contact.displayName}
                  </Typography>
                  <Typography variant="caption" tone="muted" wrap="break">
                    {contact.chatId}
                    {contact.linkedPartnerName ? ` · ${contact.linkedPartnerName}` : ''}
                  </Typography>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function AdminLeadsPage() {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const [draftFilters, setDraftFilters] = useState<AdminLeadFilters>(emptyFilters)
  const [appliedFilters, setAppliedFilters] = useState<AdminLeadFilters>(emptyFilters)
  const [pageSize, setPageSize] = useState<(typeof pageSizeOptions)[number]>(25)
  const [offset, setOffset] = useState(0)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [isCreateLeadOpen, setIsCreateLeadOpen] = useState(false)
  const [selectedBulkLeadIds, setSelectedBulkLeadIds] = useState<string[]>([])
  const [sheetsSyncResult, setSheetsSyncResult] = useState<{
    leadId: string
    result: AdminLeadSheetsSyncResponse
  } | null>(null)

  const listQuery = useQuery({
    queryKey: [adminLeadsQueryKey[0], adminLeadsQueryKey[1], appliedFilters, pageSize, offset],
    enabled: auth.isAuthenticated,
    queryFn: () =>
      auth.api.listAdminLeads({
        status: appliedFilters.status === 'all' ? undefined : appliedFilters.status,
        serviceType:
          appliedFilters.serviceType === 'all' ? undefined : appliedFilters.serviceType,
        search: appliedFilters.search,
        partnerId: appliedFilters.partnerId,
        createdFrom: appliedFilters.createdFrom,
        createdTo: appliedFilters.createdTo,
        requiresAttention: appliedFilters.focus === 'requires_attention' ? true : undefined,
        sortBy: appliedFilters.sortBy,
        sortDirection: appliedFilters.sortDirection,
        limit: pageSize,
        offset,
      }),
  })

  const leads = useMemo(() => listQuery.data?.leads ?? [], [listQuery.data?.leads])
  const visibleLeadIds = useMemo(() => leads.map((lead) => lead.id), [leads])
  const selectedBulkLeadIdsSet = useMemo(
    () => new Set(selectedBulkLeadIds),
    [selectedBulkLeadIds],
  )
  const selectedVisibleLeadCount = visibleLeadIds.filter((leadId) =>
    selectedBulkLeadIdsSet.has(leadId),
  ).length
  const allVisibleLeadsSelected = leads.length > 0 && selectedVisibleLeadCount === leads.length
  const effectiveSelectedLeadId =
    selectedLeadId ?? leads[0]?.id ?? null
  const appliedExportQuery = useMemo(
    () => adminLeadExportQueryFromFilters(appliedFilters),
    [appliedFilters],
  )

  const detailQuery = useQuery({
    queryKey: ['admin', 'lead', effectiveSelectedLeadId],
    enabled: auth.isAuthenticated && Boolean(effectiveSelectedLeadId),
    queryFn: () => auth.api.getAdminLead(effectiveSelectedLeadId ?? ''),
  })
  const partnersQuery = useQuery({
    queryKey: ['admin', 'partners'],
    enabled: auth.isAuthenticated,
    queryFn: () => auth.api.listAdminPartners(),
  })
  const serviceTypesQuery = useQuery({
    queryKey: ['admin', 'service-types'],
    enabled: auth.isAuthenticated,
    queryFn: () => auth.api.listAdminServiceTypes(),
  })
  const telegramContactsQuery = useQuery({
    queryKey: ['admin', 'telegram-contacts'],
    enabled: auth.isAuthenticated,
    queryFn: () => auth.api.listAdminTelegramContacts(),
  })
  const excursionsQuery = useQuery({
    queryKey: ['catalog', 'excursions'],
    enabled: auth.isAuthenticated,
    queryFn: () => auth.api.listExcursions(),
  })

  const updateStatusMutation = useMutation({
    mutationFn: ({ leadId, input }: { leadId: string | null; input: AdminLeadStatusActionRequest }) => {
      if (!leadId) {
        throw new Error('Lead is not selected')
      }

      return auth.api.updateAdminLeadStatus(leadId, input)
    },
    onSuccess: (detail) => {
      queryClient.setQueryData(['admin', 'lead', detail.lead.id], detail)
      void queryClient.invalidateQueries({ queryKey: adminLeadsQueryKey })
    },
  })
  const updateAdminNoteMutation = useMutation({
    mutationFn: ({ leadId, adminNote }: { leadId: string | null; adminNote: string }) => {
      if (!leadId) {
        throw new Error('Lead is not selected')
      }

      return auth.api.updateAdminLeadAdminNote(leadId, { adminNote })
    },
    onSuccess: (detail) => {
      queryClient.setQueryData(['admin', 'lead', detail.lead.id], detail)
      void queryClient.invalidateQueries({ queryKey: adminLeadsQueryKey })
    },
  })
  const bulkUpdateStatusMutation = useMutation({
    mutationFn: (input: AdminLeadBulkStatusActionRequest) =>
      auth.api.bulkUpdateAdminLeadStatus(input),
    onSuccess: () => {
      setSelectedBulkLeadIds([])
      void queryClient.invalidateQueries({ queryKey: adminLeadsQueryKey })
      if (effectiveSelectedLeadId) {
        void queryClient.invalidateQueries({ queryKey: ['admin', 'lead', effectiveSelectedLeadId] })
      }
    },
  })
  const exportCsvMutation = useMutation({
    mutationFn: () => auth.api.exportAdminLeadsCsv(appliedExportQuery),
    onSuccess: (csv) => {
      downloadBlob(csv, adminLeadCsvFilename())
    },
  })
  const syncSheetsMutation = useMutation({
    mutationFn: (leadId: string) => auth.api.syncAdminLeadGoogleSheets(leadId),
    onSuccess: (result, leadId) => {
      setSheetsSyncResult({
        leadId,
        result,
      })
    },
  })
  const createLeadMutation = useMutation({
    mutationFn: (input: AdminCreateLeadRequest) => auth.api.createAdminLead(input),
    onSuccess: (detail) => {
      setDraftFilters(emptyFilters)
      setAppliedFilters(emptyFilters)
      setOffset(0)
      setSelectedLeadId(detail.lead.id)
      setIsCreateLeadOpen(false)
      queryClient.setQueryData(['admin', 'lead', detail.lead.id], detail)
      void queryClient.invalidateQueries({ queryKey: adminLeadsQueryKey })
    },
  })
  const bindTelegramContactMutation = useMutation({
    mutationFn: ({ partnerId, contactId }: { partnerId: string; contactId: string }) =>
      auth.api.bindAdminPartnerTelegramContact(partnerId, { contactId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'telegram-contacts'] })
    },
  })

  const accessError = listQuery.error instanceof ApiRequestError ? listQuery.error : null
  const clearBulkSelection = () => setSelectedBulkLeadIds([])
  const toggleBulkLead = (leadId: string) => {
    setSelectedBulkLeadIds((current) =>
      current.includes(leadId)
        ? current.filter((selectedLeadId) => selectedLeadId !== leadId)
        : [...current, leadId],
    )
  }
  const toggleVisibleBulkLeads = () => {
    setSelectedBulkLeadIds((current) => {
      const visibleSet = new Set(visibleLeadIds)

      if (allVisibleLeadsSelected) {
        return current.filter((leadId) => !visibleSet.has(leadId))
      }

      return [...new Set([...current, ...visibleLeadIds])]
    })
  }
  const applySummaryFilter = (summaryFilter: SummaryFilter) => {
    const nextFilters: AdminLeadFilters = {
      ...draftFilters,
      status:
        summaryFilter === 'new'
          ? 'new'
          : summaryFilter === 'waiting_partner'
            ? 'waiting_partner'
            : 'all',
      focus: summaryFilter === 'requires_attention' ? 'requires_attention' : 'all',
    }

    setDraftFilters(nextFilters)
    setAppliedFilters(nextFilters)
    setOffset(0)
    setSelectedLeadId(null)
    clearBulkSelection()
  }

  if (auth.isBootstrapping) {
    return <AdminLoadingState />
  }

  if (!auth.user) {
    return <AdminLoginRequired />
  }

  return (
    <section className="mx-auto grid w-full max-w-7xl gap-6 px-5 py-8">
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Badge variant="outline" className="w-fit">
            Admin
          </Badge>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Typography variant="h1">Заявки</Typography>
            <Button type="button" onClick={() => setIsCreateLeadOpen((current) => !current)}>
              {isCreateLeadOpen ? 'Закрыть форму' : 'Создать заявку'}
            </Button>
          </div>
          <Typography tone="muted">
            Операционная очередь: фильтр, карточка, история и быстрые действия по статусу.
          </Typography>
        </div>
      </div>

      {isCreateLeadOpen && (
        <CreateLeadForm
          partners={partnersQuery.data?.partners ?? []}
          serviceTypes={serviceTypesQuery.data?.serviceTypes ?? fallbackServiceTypeOptions()}
          excursions={excursionsQuery.data?.excursions ?? []}
          isLoadingOptions={
            partnersQuery.isLoading || serviceTypesQuery.isLoading || excursionsQuery.isLoading
          }
          isSubmitting={createLeadMutation.isPending}
          error={createLeadMutation.error}
          onCancel={() => setIsCreateLeadOpen(false)}
          onSubmit={(input) => createLeadMutation.mutate(input)}
        />
      )}

      <TelegramPartnerBindingPanel
        partners={partnersQuery.data?.partners ?? []}
        contacts={telegramContactsQuery.data?.contacts ?? []}
        isLoading={partnersQuery.isLoading || telegramContactsQuery.isLoading}
        isSubmitting={bindTelegramContactMutation.isPending}
        result={bindTelegramContactMutation.data}
        error={bindTelegramContactMutation.error}
        onBind={(partnerId, contactId) =>
          bindTelegramContactMutation.mutate({ partnerId, contactId })
        }
      />

      <LeadFilters
        filters={draftFilters}
        partners={partnersQuery.data?.partners ?? []}
        isLoadingPartners={partnersQuery.isLoading}
        onFiltersChange={setDraftFilters}
        onApply={() => {
          setAppliedFilters(draftFilters)
          setOffset(0)
          setSelectedLeadId(null)
          clearBulkSelection()
        }}
        onReset={() => {
          setDraftFilters(emptyFilters)
          setAppliedFilters(emptyFilters)
          setOffset(0)
          setSelectedLeadId(null)
          clearBulkSelection()
        }}
      />

      {accessError?.status === 403 && (
        <Alert variant="destructive">
          <AlertTitle>Нет доступа</AlertTitle>
          <AlertDescription>
            Этот экран доступен только пользователям с правами администратора.
          </AlertDescription>
        </Alert>
      )}

      {accessError && accessError.status !== 403 && (
        <Alert variant="destructive">
          <AlertTitle>Не удалось загрузить заявки</AlertTitle>
          <AlertDescription>{accessError.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <Card className="overflow-hidden">
          <CardHeader className="gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Очередь</CardTitle>
                <CardDescription>
                  {listQuery.isFetching ? 'Обновляем...' : `${listQuery.data?.total ?? 0} заявок`}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {listQuery.isFetching && <Spinner />}
                <Button
                  type="button"
                  variant="outline"
                  disabled={exportCsvMutation.isPending}
                  onClick={() => exportCsvMutation.mutate()}
                >
                  {exportCsvMutation.isPending ? 'Готовим CSV...' : 'Экспорт CSV'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {exportCsvMutation.error && (
              <Alert variant="destructive" className="m-4">
                <AlertTitle>CSV не выгружен</AlertTitle>
                <AlertDescription>{exportCsvMutation.error.message}</AlertDescription>
              </Alert>
            )}
            <LeadQueueSummary
              activeFilter={summaryFilterFromFilters(appliedFilters)}
              summary={listQuery.data?.summary}
              onSelectFilter={applySummaryFilter}
            />
            <BulkStatusActions
              selectedCount={selectedBulkLeadIds.length}
              isSubmitting={bulkUpdateStatusMutation.isPending}
              error={bulkUpdateStatusMutation.error}
              onClear={clearBulkSelection}
              onSubmit={(input) => {
                bulkUpdateStatusMutation.mutate({
                  ...input,
                  leadIds: selectedBulkLeadIds,
                })
              }}
            />
            <LeadTable
              leads={leads}
              selectedLeadId={effectiveSelectedLeadId}
              selectedBulkLeadIds={selectedBulkLeadIdsSet}
              allVisibleLeadsSelected={allVisibleLeadsSelected}
              selectedVisibleLeadCount={selectedVisibleLeadCount}
              onSelectLead={setSelectedLeadId}
              onToggleBulkLead={toggleBulkLead}
              onToggleVisibleBulkLeads={toggleVisibleBulkLeads}
              isLoading={listQuery.isLoading}
              hasFilters={hasActiveFilters(appliedFilters)}
            />
            <LeadPagination
              total={listQuery.data?.total ?? 0}
              limit={pageSize}
              offset={offset}
              isFetching={listQuery.isFetching}
              onRefresh={() => {
                void listQuery.refetch()
              }}
              onPrevious={() => {
                setOffset(Math.max(0, offset - pageSize))
                setSelectedLeadId(null)
                clearBulkSelection()
              }}
              onNext={() => {
                setOffset(offset + pageSize)
                setSelectedLeadId(null)
                clearBulkSelection()
              }}
              onPageSizeChange={(nextPageSize) => {
                setPageSize(nextPageSize)
                setOffset(0)
                setSelectedLeadId(null)
                clearBulkSelection()
              }}
            />
          </CardContent>
        </Card>

        <LeadDetailPanel
          key={
            detailQuery.data?.lead
              ? `${detailQuery.data.lead.id}:${detailQuery.data.lead.updatedAt}`
              : 'empty'
          }
          detail={detailQuery.data}
          isLoading={detailQuery.isLoading || detailQuery.isFetching}
          error={detailQuery.error}
          isUpdating={updateStatusMutation.isPending}
          isSavingNote={updateAdminNoteMutation.isPending}
          isSyncingSheets={syncSheetsMutation.isPending}
          onSaveNote={(adminNote) => {
            updateAdminNoteMutation.mutate({
              leadId: effectiveSelectedLeadId,
              adminNote,
            })
          }}
          onSyncSheets={() => {
            if (effectiveSelectedLeadId) {
              syncSheetsMutation.mutate(effectiveSelectedLeadId)
            }
          }}
          onAction={(input) => {
            updateStatusMutation.mutate({
              leadId: effectiveSelectedLeadId,
              input,
            })
          }}
          mutationError={updateStatusMutation.error}
          noteMutationError={updateAdminNoteMutation.error}
          sheetsSyncError={syncSheetsMutation.error}
          sheetsSyncResult={
            sheetsSyncResult?.leadId === effectiveSelectedLeadId ? sheetsSyncResult.result : null
          }
        />
      </div>
    </section>
  )
}

function LeadQueueSummary({
  activeFilter,
  summary,
  onSelectFilter,
}: {
  activeFilter: SummaryFilter
  summary: AdminLeadListResponse['summary'] | undefined
  onSelectFilter: (filter: SummaryFilter) => void
}) {
  const items: Array<{ key: SummaryFilter; label: string; value: number | undefined }> = [
    { key: 'total', label: 'Всего', value: summary?.total },
    { key: 'new', label: 'Новые', value: summary?.new },
    { key: 'requires_attention', label: 'Требуют внимания', value: summary?.requiresAttention },
    { key: 'waiting_partner', label: 'Ждут партнера', value: summary?.waitingPartner },
  ]

  return (
    <div className="grid gap-2 border-t px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          className="grid gap-1 rounded-lg border bg-muted/20 p-3 text-left transition-colors hover:bg-muted/40 data-[active=true]:border-primary data-[active=true]:bg-primary/10"
          data-active={activeFilter === item.key}
          aria-label={`${item.label}: ${item.value ?? '...'}`}
          aria-pressed={activeFilter === item.key}
          onClick={() => onSelectFilter(item.key)}
        >
          <Typography variant="caption" tone="muted">
            {item.label}
          </Typography>
          <Typography variant="h5">{item.value ?? '...'}</Typography>
        </button>
      ))}
    </div>
  )
}

function summaryFilterFromFilters(
  filters: AdminLeadFilters,
): SummaryFilter {
  if (filters.focus === 'requires_attention') return 'requires_attention'
  if (filters.status === 'new') return 'new'
  if (filters.status === 'waiting_partner') return 'waiting_partner'
  return 'total'
}

function CreateLeadForm({
  partners,
  serviceTypes,
  excursions,
  isLoadingOptions,
  isSubmitting,
  error,
  onCancel,
  onSubmit,
}: {
  partners: AdminPartnerOptionDto[]
  serviceTypes: AdminServiceTypeOptionDto[]
  excursions: ExcursionCardDto[]
  isLoadingOptions: boolean
  isSubmitting: boolean
  error: Error | null
  onCancel: () => void
  onSubmit: (input: AdminCreateLeadRequest) => void
}) {
  const [serviceType, setServiceType] = useState<AdminCreateLeadRequest['serviceType']>('excursion')
  const [partnerId, setPartnerId] = useState('')
  const [excursionId, setExcursionId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerTelegram, setCustomerTelegram] = useState('')
  const [contactChannel, setContactChannel] =
    useState<NonNullable<AdminCreateLeadRequest['contactChannel']>>('telegram')
  const [requestedDate, setRequestedDate] = useState('')
  const [peopleCount, setPeopleCount] = useState('')
  const [comment, setComment] = useState('')
  const isExcursion = serviceType === 'excursion'
  const canSubmit =
    Boolean(partnerId) &&
    Boolean(customerName.trim()) &&
    Boolean(customerPhone.trim()) &&
    (!isExcursion || Boolean(excursionId))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Новая заявка</CardTitle>
        <CardDescription>Ручное создание заявки администратором.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          aria-label="Новая заявка"
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!canSubmit) return

            onSubmit({
              serviceType,
              partnerId,
              excursionId: isExcursion ? excursionId : undefined,
              customerName,
              customerPhone,
              customerTelegram,
              contactChannel,
              requestedDate,
              peopleCount: peopleCount ? Number(peopleCount) : undefined,
              comment,
            })
          }}
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="admin-create-lead-service-type">Направление</Label>
              <Select
                value={serviceType}
                onValueChange={(value) => {
                  setServiceType(value as AdminCreateLeadRequest['serviceType'])
                  if (value !== 'excursion') {
                    setExcursionId('')
                  }
                }}
                disabled={isLoadingOptions}
              >
                <SelectTrigger id="admin-create-lead-service-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {serviceTypes.map((option) => (
                    <SelectItem key={option.value} value={option.value} disabled={!option.isActive}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-create-lead-partner">Партнер</Label>
              <Select
                value={partnerId || 'none'}
                onValueChange={(value) => setPartnerId(value === 'none' ? '' : value)}
                disabled={isLoadingOptions || partners.length === 0}
              >
                <SelectTrigger id="admin-create-lead-partner" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Выберите партнера</SelectItem>
                  {partners.map((partner) => (
                    <SelectItem key={partner.id} value={partner.id}>
                      {partner.name}
                      {partner.telegram ? ` · ${partner.telegram}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isExcursion && (
              <div className="grid gap-2">
                <Label htmlFor="admin-create-lead-excursion">Экскурсия</Label>
                <Select
                  value={excursionId || 'none'}
                  onValueChange={(value) => setExcursionId(value === 'none' ? '' : value)}
                  disabled={isLoadingOptions || excursions.length === 0}
                >
                  <SelectTrigger id="admin-create-lead-excursion" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Выберите экскурсию</SelectItem>
                    {excursions.map((excursion) => (
                      <SelectItem key={excursion.id} value={excursion.id}>
                        {excursion.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="admin-create-lead-customer-name">Клиент</Label>
              <Input
                id="admin-create-lead-customer-name"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="Имя клиента"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-create-lead-customer-phone">Телефон</Label>
              <Input
                id="admin-create-lead-customer-phone"
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                placeholder="+66..."
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-create-lead-customer-telegram">Telegram</Label>
              <Input
                id="admin-create-lead-customer-telegram"
                value={customerTelegram}
                onChange={(event) => setCustomerTelegram(event.target.value)}
                placeholder="@username"
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[180px_180px_180px_minmax(220px,1fr)]">
            <div className="grid gap-2">
              <Label htmlFor="admin-create-lead-contact-channel">Канал</Label>
              <Select
                value={contactChannel}
                onValueChange={(value) =>
                  setContactChannel(value as NonNullable<AdminCreateLeadRequest['contactChannel']>)
                }
              >
                <SelectTrigger id="admin-create-lead-contact-channel" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(contactChannelLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-create-lead-requested-date">Дата</Label>
              <Input
                id="admin-create-lead-requested-date"
                type="date"
                value={requestedDate}
                onChange={(event) => setRequestedDate(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-create-lead-people-count">Количество</Label>
              <Input
                id="admin-create-lead-people-count"
                type="number"
                min={1}
                max={100}
                value={peopleCount}
                onChange={(event) => setPeopleCount(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-create-lead-comment">Комментарий</Label>
              <Input
                id="admin-create-lead-comment"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Детали заявки"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!canSubmit || isSubmitting}>
              {isSubmitting ? 'Создаем...' : 'Создать заявку'}
            </Button>
            <Button type="button" variant="outline" disabled={isSubmitting} onClick={onCancel}>
              Отменить
            </Button>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Заявка не создана</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
        </form>
      </CardContent>
    </Card>
  )
}

function LeadFilters({
  filters,
  partners,
  isLoadingPartners,
  onFiltersChange,
  onApply,
  onReset,
}: {
  filters: AdminLeadFilters
  partners: AdminPartnerOptionDto[]
  isLoadingPartners: boolean
  onFiltersChange: (filters: AdminLeadFilters) => void
  onApply: () => void
  onReset: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Фильтры</CardTitle>
        <CardDescription>Поиск работает по номеру, клиенту, телефону, Telegram, экскурсии и партнеру.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_170px_190px_180px_220px_150px_150px_180px_170px_auto] lg:items-end">
          <div className="grid gap-2">
            <Label htmlFor="admin-lead-search">Поиск</Label>
            <Input
              id="admin-lead-search"
              value={filters.search}
              onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })}
              placeholder="Номер, клиент, телефон"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="admin-lead-status-filter">Статус</Label>
            <Select
              value={filters.status}
              onValueChange={(value) =>
                onFiltersChange({ ...filters, status: value as AdminLeadFilters['status'] })
              }
            >
              <SelectTrigger id="admin-lead-status-filter" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                {leadStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {statusLabels[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="admin-lead-service-type-filter">Направление</Label>
            <Select
              value={filters.serviceType}
              onValueChange={(value) =>
                onFiltersChange({
                  ...filters,
                  serviceType: value as AdminLeadFilters['serviceType'],
                })
              }
            >
              <SelectTrigger id="admin-lead-service-type-filter" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все направления</SelectItem>
                {leadServiceTypes.map((serviceType) => (
                  <SelectItem key={serviceType} value={serviceType}>
                    {serviceTypeLabels[serviceType]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="admin-lead-focus-filter">Фокус</Label>
            <Select
              value={filters.focus}
              onValueChange={(value) =>
                onFiltersChange({ ...filters, focus: value as AdminLeadFilters['focus'] })
              }
            >
              <SelectTrigger id="admin-lead-focus-filter" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все заявки</SelectItem>
                <SelectItem value="requires_attention">Требуют внимания</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="admin-lead-partner-filter">Партнер</Label>
            <Select
              value={filters.partnerId || 'all'}
              onValueChange={(value) =>
                onFiltersChange({ ...filters, partnerId: value === 'all' ? '' : value })
              }
              disabled={isLoadingPartners}
            >
              <SelectTrigger id="admin-lead-partner-filter" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {isLoadingPartners ? 'Загружаем партнеров...' : 'Все партнеры'}
                </SelectItem>
                {partners.map((partner) => (
                  <SelectItem key={partner.id} value={partner.id}>
                    {partner.name}
                    {partner.telegram ? ` · ${partner.telegram}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="admin-lead-created-from">С даты</Label>
            <Input
              id="admin-lead-created-from"
              type="date"
              value={filters.createdFrom}
              onChange={(event) => onFiltersChange({ ...filters, createdFrom: event.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="admin-lead-created-to">По дату</Label>
            <Input
              id="admin-lead-created-to"
              type="date"
              value={filters.createdTo}
              onChange={(event) => onFiltersChange({ ...filters, createdTo: event.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="admin-lead-sort-by">Сортировать</Label>
            <Select
              value={filters.sortBy}
              onValueChange={(value) =>
                onFiltersChange({ ...filters, sortBy: value as AdminLeadFilters['sortBy'] })
              }
            >
              <SelectTrigger id="admin-lead-sort-by" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at">По созданию</SelectItem>
                <SelectItem value="updated_at">По обновлению</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="admin-lead-sort-direction">Порядок</Label>
            <Select
              value={filters.sortDirection}
              onValueChange={(value) =>
                onFiltersChange({
                  ...filters,
                  sortDirection: value as AdminLeadFilters['sortDirection'],
                })
              }
            >
              <SelectTrigger id="admin-lead-sort-direction" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Сначала новые</SelectItem>
                <SelectItem value="asc">Сначала старые</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={onApply}>
              Применить
            </Button>
            <Button type="button" variant="outline" onClick={onReset}>
              Сбросить
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function BulkStatusActions({
  selectedCount,
  isSubmitting,
  error,
  onClear,
  onSubmit,
}: {
  selectedCount: number
  isSubmitting: boolean
  error: Error | null
  onClear: () => void
  onSubmit: (input: Omit<AdminLeadBulkStatusActionRequest, 'leadIds'>) => void
}) {
  const [status, setStatus] = useState<AdminLeadBulkStatusActionRequest['status']>('waiting_partner')
  const [comment, setComment] = useState('')

  if (selectedCount === 0) {
    return null
  }

  return (
    <div className="grid gap-3 border-t bg-muted/20 px-4 py-3 lg:grid-cols-[auto_180px_minmax(220px,1fr)_auto] lg:items-end">
      <div className="grid gap-1">
        <Typography variant="caption" tone="muted">
          Массовое действие
        </Typography>
        <Typography variant="bodySmMedium">Выбрано: {selectedCount}</Typography>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="admin-lead-bulk-status">Массовый статус</Label>
        <Select
          value={status}
          onValueChange={(value) =>
            setStatus(value as AdminLeadBulkStatusActionRequest['status'])
          }
        >
          <SelectTrigger id="admin-lead-bulk-status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {leadStatuses.map((leadStatus) => (
              <SelectItem key={leadStatus} value={leadStatus}>
                {statusLabels[leadStatus]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="admin-lead-bulk-comment">Комментарий</Label>
        <Input
          id="admin-lead-bulk-comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Комментарий для истории"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={isSubmitting}
          onClick={() =>
            onSubmit({
              status,
              comment,
            })
          }
        >
          {isSubmitting ? 'Применяем...' : 'Применить к выбранным'}
        </Button>
        <Button type="button" variant="outline" disabled={isSubmitting} onClick={onClear}>
          Очистить
        </Button>
      </div>
      {error && (
        <Alert variant="destructive" className="lg:col-span-4">
          <AlertTitle>Массовое действие не выполнено</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

function LeadTable({
  leads,
  selectedLeadId,
  selectedBulkLeadIds,
  allVisibleLeadsSelected,
  selectedVisibleLeadCount,
  onSelectLead,
  onToggleBulkLead,
  onToggleVisibleBulkLeads,
  isLoading,
  hasFilters,
}: {
  leads: AdminLeadDto[]
  selectedLeadId: string | null
  selectedBulkLeadIds: Set<string>
  allVisibleLeadsSelected: boolean
  selectedVisibleLeadCount: number
  onSelectLead: (leadId: string) => void
  onToggleBulkLead: (leadId: string) => void
  onToggleVisibleBulkLeads: () => void
  isLoading: boolean
  hasFilters: boolean
}) {
  if (isLoading) {
    return (
      <div className="flex min-h-72 items-center justify-center gap-3">
        <Spinner />
        <Typography variant="bodySm" tone="muted">
          Загружаем заявки...
        </Typography>
      </div>
    )
  }

  if (leads.length === 0) {
    return (
      <div className="grid min-h-72 place-items-center px-4">
        <Typography variant="bodySm" tone="muted" align="center">
          {hasFilters ? 'По этим фильтрам заявок нет.' : 'Заявок пока нет.'}
        </Typography>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">
            <Checkbox
              aria-label="Выбрать все видимые заявки"
              checked={
                allVisibleLeadsSelected
                  ? true
                  : selectedVisibleLeadCount > 0
                    ? 'indeterminate'
                    : false
              }
              onCheckedChange={onToggleVisibleBulkLeads}
            />
          </TableHead>
          <TableHead>Номер</TableHead>
          <TableHead>Статус</TableHead>
          <TableHead>Клиент</TableHead>
          <TableHead>SLA</TableHead>
          <TableHead>Экскурсия</TableHead>
          <TableHead>Партнер</TableHead>
          <TableHead align="right">Комиссия</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((lead) => (
          <TableRow
            key={lead.id}
            data-state={selectedLeadId === lead.id ? 'selected' : undefined}
            className="cursor-pointer"
            aria-label={`Заявка ${lead.publicNumber}`}
            onClick={() => onSelectLead(lead.id)}
          >
            <TableCell onClick={(event) => event.stopPropagation()}>
              <Checkbox
                aria-label={`Выбрать заявку ${lead.publicNumber}`}
                checked={selectedBulkLeadIds.has(lead.id)}
                onCheckedChange={() => onToggleBulkLead(lead.id)}
              />
            </TableCell>
            <TableCell>
              <div className="grid gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Typography variant="bodySmMedium">{lead.publicNumber}</Typography>
                  {lead.isTest && <Badge variant="outline">Тест</Badge>}
                </div>
                <Typography variant="caption" tone="muted">
                  {formatDateTime(lead.createdAt)}
                </Typography>
              </div>
            </TableCell>
            <TableCell>
              <StatusBadge status={lead.status} />
            </TableCell>
            <TableCell>
              <div className="grid gap-1">
                <Typography variant="bodySmMedium">{lead.customerName}</Typography>
                <Typography variant="caption" tone="muted">
                  {lead.customerPhone}
                </Typography>
              </div>
            </TableCell>
            <TableCell>
              <LeadSlaBadge lead={lead} />
            </TableCell>
            <TableCell className="max-w-64">
              <Typography variant="bodySm" truncate>
                {lead.excursionTitle}
              </Typography>
            </TableCell>
            <TableCell>
              <Typography variant="bodySm">{lead.partnerName}</Typography>
            </TableCell>
            <TableCell align="right">
              <Typography variant="bodySmMedium">
                {formatMoney(lead.commissionTotal ?? lead.commissionThb, 'THB')}
              </Typography>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function LeadPagination({
  total,
  limit,
  offset,
  isFetching,
  onRefresh,
  onPrevious,
  onNext,
  onPageSizeChange,
}: {
  total: number
  limit: (typeof pageSizeOptions)[number]
  offset: number
  isFetching: boolean
  onRefresh: () => void
  onPrevious: () => void
  onNext: () => void
  onPageSizeChange: (limit: (typeof pageSizeOptions)[number]) => void
}) {
  const pageStart = total === 0 ? 0 : offset + 1
  const pageEnd = Math.min(offset + limit, total)
  const canGoPrevious = offset > 0
  const canGoNext = offset + limit < total

  return (
    <div className="grid gap-3 border-t p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <Typography variant="bodySm" tone="muted">
        {total === 0 ? 'Нет записей' : `${pageStart}-${pageEnd} из ${total}`}
      </Typography>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="admin-lead-page-size">На странице</Label>
          <Select
            value={String(limit)}
            onValueChange={(value) =>
              onPageSizeChange(Number(value) as (typeof pageSizeOptions)[number])
            }
          >
            <SelectTrigger id="admin-lead-page-size" className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" onClick={onRefresh} disabled={isFetching}>
          {isFetching ? 'Обновляем...' : 'Обновить'}
        </Button>
        <Button type="button" variant="outline" onClick={onPrevious} disabled={!canGoPrevious}>
          Назад
        </Button>
        <Button type="button" variant="outline" onClick={onNext} disabled={!canGoNext}>
          Вперед
        </Button>
      </div>
    </div>
  )
}

function LeadDetailPanel({
  detail,
  isLoading,
  error,
  isUpdating,
  isSavingNote,
  isSyncingSheets,
  onSaveNote,
  onSyncSheets,
  onAction,
  mutationError,
  noteMutationError,
  sheetsSyncError,
  sheetsSyncResult,
}: {
  detail: AdminLeadDetailResponse | undefined
  isLoading: boolean
  error: Error | null
  isUpdating: boolean
  isSavingNote: boolean
  isSyncingSheets: boolean
  onSaveNote: (adminNote: string) => void
  onSyncSheets: () => void
  onAction: (input: AdminLeadStatusActionRequest) => void
  mutationError: Error | null
  noteMutationError: Error | null
  sheetsSyncError: Error | null
  sheetsSyncResult: AdminLeadSheetsSyncResponse | null
}) {
  const lead = detail?.lead
  const facts = useMemo(() => (lead ? leadFacts(lead) : []), [lead])
  const [adminNote, setAdminNote] = useState(lead?.adminNote ?? '')
  const [actionComment, setActionComment] = useState('')

  if (!lead) {
    return (
      <Card className="min-h-96">
        <CardHeader>
          <CardTitle>Карточка заявки</CardTitle>
          <CardDescription>
            {isLoading ? 'Загружаем детали...' : 'Выберите заявку из очереди.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center gap-3">
              <Spinner />
              <Typography variant="bodySm" tone="muted">
                Загружаем карточку...
              </Typography>
            </div>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Не удалось открыть карточку</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="min-h-96">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <CardTitle>{lead.publicNumber}</CardTitle>
            <CardDescription>{lead.excursionTitle}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {lead.isTest && <Badge variant="outline">Тест</Badge>}
            <LeadSlaBadge lead={lead} />
            <StatusBadge status={lead.status} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        <ContactDetails lead={lead} />

        <div className="grid gap-3 sm:grid-cols-2">
          {facts.map((fact) => (
            <div key={fact.label} className="grid gap-1 rounded-lg border bg-muted/20 p-3">
              <Typography variant="caption" tone="muted">
                {fact.label}
              </Typography>
              <Typography variant="bodySmMedium" wrap="break">
                {fact.value}
              </Typography>
            </div>
          ))}
        </div>

        <Separator />

        {detail.followUpAnswers.length > 0 && (
          <>
            <div className="grid gap-3">
              <Typography variant="h5">Ответы клиента</Typography>
              <div className="grid gap-3">
                {detail.followUpAnswers.map((answer) => (
                  <div key={answer.id} className="grid gap-1 rounded-lg border bg-muted/20 p-3">
                    <Typography variant="caption" tone="muted">
                      {answer.questionPrompt}
                    </Typography>
                    <Typography variant="bodySmMedium" wrap="break">
                      {answer.answer}
                    </Typography>
                  </div>
                ))}
              </div>
            </div>

            <Separator />
          </>
        )}

        <div className="grid gap-3">
          <Typography variant="h5">Быстрые действия</Typography>
          <div className="grid gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSyncingSheets}
              onClick={onSyncSheets}
            >
              {isSyncingSheets ? 'Синхронизируем...' : 'Синхронизировать в Sheets'}
            </Button>
            {sheetsSyncResult && (
              <Alert>
                <AlertTitle>{sheetsSyncTitle(sheetsSyncResult)}</AlertTitle>
                <AlertDescription>{sheetsSyncDescription(sheetsSyncResult)}</AlertDescription>
              </Alert>
            )}
            {sheetsSyncError && (
              <Alert variant="destructive">
                <AlertTitle>Sheets не синхронизирован</AlertTitle>
                <AlertDescription>{sheetsSyncError.message}</AlertDescription>
              </Alert>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="admin-note">Заметка админа</Label>
            <Typography variant="caption" tone="muted">
              {adminNoteAuditText(lead)}
            </Typography>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="admin-note"
                value={adminNote}
                onChange={(event) => setAdminNote(event.target.value)}
                placeholder="Например: клиент просит перенос"
              />
              <Button
                type="button"
                variant="outline"
                disabled={isSavingNote}
                onClick={() => onSaveNote(adminNote)}
              >
                {isSavingNote ? 'Сохраняем...' : 'Сохранить заметку'}
              </Button>
            </div>
          </div>
          {noteMutationError && (
            <Alert variant="destructive">
              <AlertTitle>Заметка не сохранена</AlertTitle>
              <AlertDescription>{noteMutationError.message}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-2">
            <Label htmlFor="admin-action-comment">Комментарий в историю</Label>
            <div className="grid gap-2">
              <Typography variant="caption" tone="muted">
                Шаблоны комментариев
              </Typography>
              <div className="flex flex-wrap gap-2">
                {actionCommentTemplates.map((template) => (
                  <Button
                    key={template.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setActionComment(template.comment)}
                  >
                    {template.label}
                  </Button>
                ))}
              </div>
            </div>
            <Textarea
              id="admin-action-comment"
              value={actionComment}
              onChange={(event) => setActionComment(event.target.value)}
              placeholder="Причина изменения статуса"
            />
          </div>
          {mutationError && (
            <Alert variant="destructive">
              <AlertTitle>Действие не выполнено</AlertTitle>
              <AlertDescription>{mutationError.message}</AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-2">
            {quickActions.map((action) => (
              <Button
                key={action.status}
                type="button"
                variant={action.status === 'declined' || action.status === 'cancelled' ? 'outline' : 'default'}
                disabled={isUpdating}
                onClick={() =>
                  onAction({
                    status: action.status,
                    adminNote,
                    comment: actionComment,
                  })
                }
              >
                {isUpdating ? 'Сохраняем...' : action.label}
              </Button>
            ))}
          </div>
        </div>

        <Separator />

        <div className="grid gap-3">
          <Typography variant="h5">История статусов</Typography>
          <div className="grid gap-3">
            {detail.statusHistory.map((history) => (
              <div key={history.id} className="grid gap-1 border-l-2 border-border pl-3">
                <div className="flex flex-wrap items-center gap-2">
                  {history.fromStatus && <StatusBadge status={history.fromStatus} />}
                  <Typography variant="caption" tone="muted">
                    {history.fromStatus ? '→' : 'Создано'}
                  </Typography>
                  <StatusBadge status={history.toStatus} />
                </div>
                <Typography variant="bodySmMedium">
                  {actorLabel(history.actorType)}
                  {history.actorId ? ` · ${history.actorId}` : ''}
                </Typography>
                {history.comment && (
                  <Typography variant="bodySm" tone="muted">
                    {history.comment}
                  </Typography>
                )}
                <Typography variant="caption" tone="muted">
                  {formatDateTime(history.createdAt)}
                </Typography>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ContactDetails({ lead }: { lead: AdminLeadDto }) {
  const phoneHref = phoneLink(lead.customerPhone)
  const whatsappHref = whatsappLink(lead.customerPhone)
  const telegramHref = telegramLink(lead.customerTelegram)
  const preferredChannel = lead.contactChannel
    ? contactChannelLabels[lead.contactChannel]
    : 'Не выбран'

  return (
    <div className="grid gap-3 rounded-lg border bg-muted/20 p-4">
      <div className="grid gap-1">
        <Typography variant="h5">Контакты клиента</Typography>
        <Typography variant="bodySm" tone="muted">
          Предпочтительно: {preferredChannel}
        </Typography>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Typography variant="caption" tone="muted">
            Имя
          </Typography>
          <Typography variant="bodySmMedium" wrap="break">
            {lead.customerName}
          </Typography>
        </div>
        <div className="grid gap-1">
          <Typography variant="caption" tone="muted">
            Телефон
          </Typography>
          <Typography variant="bodySmMedium" wrap="break">
            {lead.customerPhone}
          </Typography>
        </div>
        <div className="grid gap-1 sm:col-span-2">
          <Typography variant="caption" tone="muted">
            Telegram
          </Typography>
          <Typography variant="bodySmMedium" wrap="break">
            {lead.customerTelegram ?? 'Не указан'}
          </Typography>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <ContactButton href={phoneHref} label="Позвонить" />
        <ContactButton href={whatsappHref} label="WhatsApp" external />
        <ContactButton href={telegramHref} label="Telegram" external />
      </div>
    </div>
  )
}

function ContactButton({
  href,
  label,
  external = false,
}: {
  href: string | null
  label: string
  external?: boolean
}) {
  if (!href) {
    return (
      <Button type="button" variant="outline" size="sm" disabled>
        {label}
      </Button>
    )
  }

  return (
    <Button asChild variant="outline" size="sm">
      <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>
        <Typography as="span" variant="control">
          {label}
        </Typography>
      </a>
    </Button>
  )
}

function AdminLoadingState() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-16">
      <Card className="w-fit">
        <CardContent className="flex items-center gap-3">
          <Spinner />
          <Typography variant="bodySm" tone="muted">
            Проверяем сессию...
          </Typography>
        </CardContent>
      </Card>
    </section>
  )
}

function AdminLoginRequired() {
  return (
    <section className="mx-auto grid w-full max-w-6xl gap-5 px-5 py-16">
      <Badge variant="outline" className="w-fit">
        Admin
      </Badge>
      <Typography variant="h1">Нужен вход</Typography>
      <Typography className="max-w-2xl" tone="muted">
        Войдите в аккаунт администратора, чтобы открыть заявки.
      </Typography>
    </section>
  )
}

function StatusBadge({ status }: { status: AdminLeadDto['status'] }) {
  return <Badge variant={statusBadgeVariant[status]}>{statusLabels[status]}</Badge>
}

function LeadSlaBadge({ lead }: { lead: AdminLeadDto }) {
  const sla = getLeadSlaInfo(lead)

  return (
    <Badge variant={sla.variant} title={sla.title}>
      {sla.label}
    </Badge>
  )
}

function hasActiveFilters(filters: AdminLeadFilters) {
  return (
    filters.status !== 'all' ||
    filters.serviceType !== 'all' ||
    filters.focus !== 'all' ||
    Boolean(filters.search.trim()) ||
    Boolean(filters.partnerId.trim()) ||
    Boolean(filters.createdFrom) ||
    Boolean(filters.createdTo)
  )
}

function adminLeadExportQueryFromFilters(filters: AdminLeadFilters): AdminLeadExportQuery {
  return {
    status: filters.status === 'all' ? undefined : filters.status,
    serviceType: filters.serviceType === 'all' ? undefined : filters.serviceType,
    search: filters.search,
    partnerId: filters.partnerId,
    createdFrom: filters.createdFrom,
    createdTo: filters.createdTo,
    requiresAttention: filters.focus === 'requires_attention' ? true : undefined,
    sortBy: filters.sortBy,
    sortDirection: filters.sortDirection,
  }
}

function adminLeadCsvFilename() {
  return `admin-leads-${new Date().toISOString().slice(0, 10)}.csv`
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function leadFacts(lead: AdminLeadDto) {
  return [
    { label: 'Направление', value: serviceTypeLabels[lead.serviceType] },
    { label: 'Партнер', value: `${lead.partnerName}${lead.partnerTelegram ? ` · ${lead.partnerTelegram}` : ''}` },
    { label: 'Дата', value: lead.requestedDate ? formatDateTime(lead.requestedDate) : 'Не выбрана' },
    { label: 'Людей', value: lead.peopleCount ? String(lead.peopleCount) : 'Не указано' },
    { label: 'Комиссия', value: formatMoney(lead.commissionTotal ?? lead.commissionThb, 'THB') },
    { label: 'Комментарий клиента', value: lead.comment ?? 'Нет комментария' },
    { label: 'Заметка партнера', value: lead.partnerNote ?? 'Нет заметки' },
  ]
}

function adminNoteAuditText(lead: AdminLeadDto) {
  if (!lead.adminNoteUpdatedAt) {
    return 'Заметку админа еще не меняли.'
  }

  const actor =
    lead.adminNoteUpdatedByDisplayName ??
    lead.adminNoteUpdatedByEmail ??
    lead.adminNoteUpdatedById ??
    'администратор'

  return `Последнее изменение: ${actor} · ${formatDateTime(lead.adminNoteUpdatedAt)}`
}

function phoneLink(phone: string) {
  const compactPhone = phone.replace(/\s+/g, '')

  return compactPhone ? `tel:${compactPhone}` : null
}

function whatsappLink(phone: string) {
  const digits = phone.replace(/\D/g, '')

  return digits ? `https://wa.me/${digits}` : null
}

function telegramLink(telegram: string | null) {
  if (!telegram) return null

  const trimmed = telegram.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^t\.me\//i.test(trimmed)) return `https://${trimmed}`

  return `https://t.me/${trimmed.replace(/^@/, '')}`
}

function actorLabel(actorType: AdminLeadDetailResponse['statusHistory'][number]['actorType']) {
  if (actorType === 'admin') return 'Администратор'
  if (actorType === 'partner') return 'Партнер'
  if (actorType === 'user') return 'Пользователь'
  return 'Система'
}

function sheetsSyncTitle(result: AdminLeadSheetsSyncResponse) {
  if (result.mode === 'disabled') return 'Google Sheets выключен'
  if (result.mode === 'appended') return 'Строка добавлена в Sheets'
  return 'Строка обновлена в Sheets'
}

function sheetsSyncDescription(result: AdminLeadSheetsSyncResponse) {
  if (result.mode === 'disabled') {
    return 'Интеграция не включена в env, локальная заявка осталась без изменений.'
  }
  if (result.mode === 'appended') {
    return 'Заявка не была найдена в таблице, поэтому создана новая строка.'
  }
  return 'Текущий snapshot заявки повторно записан в существующую строку.'
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatMoney(value: number, currency: 'THB') {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}
