type TripAdvisorLocationDetails = {
  name?: unknown
  rating?: unknown
  num_reviews?: unknown
  review_count?: unknown
  number_of_reviews?: unknown
  reviewCount?: unknown
  ranking?: unknown
  ranking_data?: {
    ranking?: unknown
    ranking_string?: unknown
  }
  web_url?: unknown
  webUrl?: unknown
  rating_image_url?: unknown
  ratingImageUrl?: unknown
}

type TripAdvisorReviewItemRaw = {
  title?: unknown
  text?: unknown
  rating?: unknown
  rating_image_url?: unknown
  author_name?: unknown
  username?: unknown
  name?: unknown
  user_name?: unknown
  user?: {
    username?: unknown
    name?: unknown
  }
  published_date?: unknown
  review_date?: unknown
  date?: unknown
  location?: unknown
  language?: unknown
  language_name?: unknown
}

type TripAdvisorLocationReviewsResponse = {
  reviews?: TripAdvisorReviewItemRaw[]
  data?: {
    reviews?: TripAdvisorReviewItemRaw[]
  }
}

export type TripAdvisorReviewItemSnapshot = {
  title: string | null
  text: string
  rating: number | null
  author: string | null
  date: string | null
  location: string | null
}

export type TripAdvisorRatingSnapshot = {
  name: string | null
  rating: number | null
  reviewCount: number | null
  ranking: number | null
  webUrl: string | null
  ratingImageUrl: string | null
}

export type TripAdvisorClientConfig = {
  apiKey: string
  timeoutMs: number
  baseUrl: string
}

export class TripAdvisorClient {
  constructor(private readonly config: TripAdvisorClientConfig) {
    if (!this.config.apiKey) {
      throw new Error('Tripadvisor API key is missing')
    }
  }

  async getLocationRating(locationId: string): Promise<TripAdvisorRatingSnapshot> {
    const response = await this.fetchLocationDetails(locationId)
    return this.extractRating(response)
  }

  async getLocationReviews(
    locationId: string,
    limit = 8,
  ): Promise<TripAdvisorReviewItemSnapshot[]> {
    const response = await this.fetchLocationReviews(locationId)
    const reviews = extractReviews(response).slice(0, Math.max(1, limit))
    return reviews.map(snapshotReview)
  }

  private async fetchLocationDetails(locationId: string) {
    const url = new URL(`${this.config.baseUrl}/location/${encodeURIComponent(locationId)}/details`)
    url.searchParams.set('key', this.config.apiKey)
    url.searchParams.set('language', 'en_US')
    url.searchParams.set('currency', 'THB')

    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(), this.config.timeoutMs)

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: abortController.signal,
      })

      if (!response.ok) {
        const body = await safeJsonText(response)
        throw new TripAdvisorApiError(response.status, `Tripadvisor API request failed: ${body}`)
      }

      return (await response.json()) as TripAdvisorLocationDetails
    } finally {
      clearTimeout(timeout)
    }
  }

  private async fetchLocationReviews(locationId: string) {
    const url = new URL(`${this.config.baseUrl}/location/${encodeURIComponent(locationId)}/reviews`)
    url.searchParams.set('key', this.config.apiKey)
    url.searchParams.set('language', 'en_US')
    url.searchParams.set('limit', '8')

    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(), this.config.timeoutMs)

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: abortController.signal,
      })

      if (!response.ok) {
        const body = await safeJsonText(response)
        throw new TripAdvisorApiError(response.status, `Tripadvisor API request failed: ${body}`)
      }

      return (await response.json()) as TripAdvisorLocationReviewsResponse
    } finally {
      clearTimeout(timeout)
    }
  }

  private extractRating(payload: TripAdvisorLocationDetails): TripAdvisorRatingSnapshot {
    const rating = toNumber(payload.rating) ?? null
    const reviewCount = toInt(
      payload.num_reviews ??
        payload.review_count ??
        payload.number_of_reviews ??
        payload.reviewCount,
    )
    const rankingCandidate =
      payload.ranking ??
      payload.ranking_data?.ranking ??
      payload.ranking_data?.ranking_string
    const webUrl = asString(payload.web_url ?? payload.webUrl)
    const ratingImageUrl = asString(
      payload.rating_image_url ?? payload.ratingImageUrl,
    )

    return {
      name: asString(payload.name),
      rating: rating === null ? null : Math.min(5, Math.max(0, rating)),
      reviewCount: reviewCount,
      ranking: parseRanking(rankingCandidate),
      webUrl,
      ratingImageUrl,
    }
  }
}

function extractReviews(payload: TripAdvisorLocationReviewsResponse) {
  const fromData = payload.reviews
  const nestedReviews = payload.data?.reviews

  if (Array.isArray(fromData)) return fromData
  if (Array.isArray(nestedReviews)) return nestedReviews
  return []
}

function snapshotReview(item: TripAdvisorReviewItemRaw): TripAdvisorReviewItemSnapshot {
  const text = asString(item.text)
  const title = asString(item.title)
  const rating = toNumber(item.rating)
  const author = pickFirstString([item.author_name, item.name, item.username, item.user_name, item.user?.name, item.user?.username])
  const date = asString(item.published_date ?? item.review_date ?? item.date)
  const location = asString(item.location)

  return {
    title,
    text: text ?? '',
    rating: rating === null ? null : Math.min(5, Math.max(0, rating)),
    author,
    date,
    location,
  }
}

function pickFirstString(values: unknown[]) {
  for (const value of values) {
    const text = asString(value)
    if (text) return text
  }

  return null
}

function parseRanking(value: unknown) {
  const asNumber = toInt(value)
  if (asNumber !== null) return asNumber

  const text = asString(value)
  if (!text) return null

  const match = /#?(\d+)/.exec(text)
  return match ? Number(match[1]) : null
}

function asString(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toInt(value: unknown) {
  const parsed = toNumber(value)
  if (parsed === null) return null
  return Number.isInteger(parsed) ? parsed : Math.trunc(parsed)
}

async function safeJsonText(response: Response) {
  try {
    const body = await response.text()
    return body || response.statusText
  } catch {
    return response.statusText
  }
}

export class TripAdvisorApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'TripAdvisorApiError'
  }
}
