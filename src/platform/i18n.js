const ORIGINS = ['https://www.aiwanna.games', 'https://aiwanna.games', 'https://www.ai-made.games', 'https://ai-made.games', 'https://1gp-game-platform.vercel.app']
const LANGUAGES = ['zh', 'en', 'ja', 'ko', 'es', 'zh-tw', 'fa', 'fr', 'ru', 'pt_br', 'it']
const placeholders = value => (value.match(/\{(?:[a-zA-Z_][a-zA-Z_0-9]*|\d+)\}|%\d*\$?[sdf]/g) || []).sort().join('\n')

export function normalizeLanguage (value) {
  const language = String(value || '').toLowerCase().replace(/_/g, '-')
  if (language === 'pt-br') return 'pt_br'
  if (/^zh-(tw|hk|hant)(-|$)/.test(language)) return 'zh-tw'
  if (LANGUAGES.includes(language)) return language
  const primary = language.split('-')[0]
  return LANGUAGES.includes(primary) ? primary : 'en'
}

export function selectedLanguage (href, pageLanguage = 'zh') {
  const url = new URL(href)
  return normalizeLanguage(url.searchParams.has('lang') ? url.searchParams.get('lang') : pageLanguage)
}

/** Public text only: no account, session token, cookies or game-state access. */
export function createI18n ({
  gameSlug = null,
  platformOrigin = ORIGINS[0],
  keys = [],
  host = typeof window === 'undefined' ? null : window,
  documentRef = typeof document === 'undefined' ? null : document,
  fetchImpl = typeof fetch === 'undefined' ? null : fetch,
  timeoutMs = 3000,
} = {}) {
  const known = new Set(keys)
  const remote = Object.create(null)
  const locale = selectedLanguage(host?.location?.href || 'https://game.invalid/', documentRef?.documentElement?.lang || 'zh')

  function text (key, fallback) {
    if (!known.has(key) || typeof fallback !== 'string' || !Object.prototype.hasOwnProperty.call(remote, key)) return fallback
    const value = remote[key]
    return placeholders(value) === placeholders(fallback) ? value : fallback
  }

  function applyStaticText () {
    if (!documentRef) return
    for (const element of documentRef.querySelectorAll('[data-i18n]')) {
      const key = element.getAttribute('data-i18n')
      element.textContent = text(key, element.textContent)
    }
    for (const element of documentRef.querySelectorAll('meta[data-i18n-content]')) {
      const key = element.getAttribute('data-i18n-content')
      element.setAttribute('content', text(key, element.getAttribute('content') || ''))
    }
  }

  async function initialize () {
    if (host) host.__breaklockText = text
    const available = typeof gameSlug === 'string' && /^[a-z0-9][a-z0-9-]{0,127}$/.test(gameSlug) && ORIGINS.includes(platformOrigin) && typeof fetchImpl === 'function'
    if (!available) {
      applyStaticText()
      return { source: 'local', locale }
    }
    const platformLocale = locale === 'zh-tw' ? 'zh-Hant' : locale === 'pt_br' ? 'pt-BR' : locale
    const controller = new AbortController()
    let timer
    let source = 'local'
    try {
      const request = fetchImpl(`${platformOrigin}/i18n/${encodeURIComponent(gameSlug)}/${platformLocale}.json`, {
        method: 'GET', credentials: 'omit', mode: 'cors', signal: controller.signal,
      }).then(async response => {
        if (!response.ok) throw new Error('Text unavailable')
        const body = await response.text()
        if (body.length > 256 * 1024) throw new Error('Text dictionary too large')
        const entries = JSON.parse(body)
        if (!entries || Array.isArray(entries) || typeof entries !== 'object') throw new Error('Invalid text dictionary')
        return entries
      })
      const entries = await Promise.race([request, new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('Text request timed out')) }, Math.min(Math.max(timeoutMs, 1), 3000))
      })])
      for (const [key, value] of Object.entries(entries)) {
        if (known.has(key) && typeof value === 'string' && value.length <= 8000) remote[key] = value
      }
      source = 'platform'
    } catch (_) {
      // Public text is optional: the compiled local language remains playable.
    } finally {
      clearTimeout(timer)
      controller.abort()
    }
    applyStaticText()
    return { source, locale }
  }

  return { initialize, text, applyStaticText, locale }
}
