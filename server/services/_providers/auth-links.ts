export function buildAuthLink(path: '/accept-invite' | '/reset-password', token: string): string | null {
  const configuredOrigin = process.env.BULWARK_APP_URL?.trim()
  if (!configuredOrigin && process.env.NODE_ENV === 'production') return null

  try {
    const origin = new URL(configuredOrigin || 'http://localhost:3000')
    if (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:') return null
    origin.pathname = path
    origin.search = ''
    origin.searchParams.set('token', token)
    return origin.toString()
  } catch {
    return null
  }
}

export function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]!)
}