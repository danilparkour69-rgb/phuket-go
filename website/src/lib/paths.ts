const basePath = normalizeBasePath(import.meta.env.BASE_URL ?? '/')

export function sitePath(path: string) {
  if (!path || path.startsWith('#') || hasProtocolLikePrefix(path)) return path
  if (basePath === '/') return path

  const [pathWithQuery, hash = ''] = path.split('#', 2)
  const [pathname, query = ''] = pathWithQuery.split('?', 2)
  const normalizedPathname = pathname.startsWith('/') ? pathname.slice(1) : pathname
  const suffix = `${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`

  return `${basePath}${normalizedPathname}${suffix}`
}

function normalizeBasePath(value: string) {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '/') return '/'

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

function hasProtocolLikePrefix(path: string) {
  return /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')
}
