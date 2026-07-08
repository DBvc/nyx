export function normalizeConnectionBaseUrl(rawBaseUrl: string) {
  const url = new URL(rawBaseUrl.trim())

  url.username = ''
  url.password = ''
  url.search = ''
  url.hash = ''

  if (!url.pathname.endsWith('/')) {
    url.pathname = `${url.pathname}/`
  }

  return url.toString()
}

export function readConnectionBaseUrlHost(rawBaseUrl: string) {
  try {
    return new URL(rawBaseUrl).hostname
  } catch {
    return null
  }
}
