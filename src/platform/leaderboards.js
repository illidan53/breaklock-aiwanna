import config from '../config'

const PLATFORM_ORIGINS = [
  'https://www.aiwanna.games',
  'https://aiwanna.games',
  'https://www.ai-made.games',
  'https://ai-made.games',
  'https://1gp-game-platform.vercel.app'
]
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const isId = value => typeof value === 'string' && UUID.test(value) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value)
const failure = (code, message) => Object.assign(new Error(message || code), { code })

/**
 * Obtain only a game-scoped ranking token. Cloud-save and website-login tokens
 * are separate capabilities and must never be passed through this transport.
 * The returned function accepts paths relative to /api/v1/.
 */
export function createPlatformRequest ({ platformOrigin = PLATFORM_ORIGINS[0], gameId } = {}) {
  const frame = typeof window === 'undefined' ? null : window
  const available = !!(isId(gameId) && PLATFORM_ORIGINS.includes(platformOrigin) &&
    frame && frame.parent && frame.parent !== frame &&
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
  let session = null
  let connecting = null
  let apiOrigin = null
  let invalidated = false
  let cancelConnection = null
  let retryAt = 0
  const activeRequests = new Set()

  function assertActive (signal) {
    if (invalidated) throw failure('IDENTITY_CHANGED')
    if (signal && signal.aborted) throw failure('CANCELLED')
  }

  function rateLimitError () {
    return Object.assign(failure('RATE_LIMITED'), { retryAt, retryAfterMs: Math.max(0, retryAt - Date.now()) })
  }

  function connect () {
    if (invalidated) return Promise.reject(failure('IDENTITY_CHANGED'))
    if (!available) return Promise.reject(failure('UNAVAILABLE'))
    if (session && Date.parse(session.expiresAt) > Date.now() + 60000) return Promise.resolve(session)
    if (connecting) return connecting
    connecting = new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID()
      let timer
      function cleanup () {
        clearTimeout(timer)
        frame.removeEventListener('message', receive)
        cancelConnection = null
      }
      cancelConnection = cause => { cleanup(); reject(cause) }
      function receive (event) {
        const data = event.data
        if (event.source !== frame.parent || !PLATFORM_ORIGINS.includes(event.origin) ||
            !data || data.source !== 'aimadegames-platform' || data.type !== 'leaderboard-session' ||
            data.requestId !== requestId) return
        cleanup()
        if (data.error) {
          reject(failure(data.error.code || 'SESSION_UNAVAILABLE'))
          return
        }
        if (data.apiOrigin !== event.origin || !data.session || data.session.gameId !== gameId ||
            typeof data.session.token !== 'string' || !data.session.token ||
            !(Date.parse(data.session.expiresAt) > Date.now())) {
          reject(failure('INVALID_SESSION'))
          return
        }
        apiOrigin = event.origin
        session = data.session
        resolve(session)
      }
      frame.addEventListener('message', receive)
      timer = setTimeout(() => {
        cleanup()
        reject(failure('SESSION_TIMEOUT'))
      }, 15000)
      try {
        for (const target of PLATFORM_ORIGINS) {
          frame.parent.postMessage({ source: 'aimadegames', type: 'leaderboard-session', requestId }, target)
        }
      } catch (error) {
        cleanup()
        reject(failure('SESSION_UNAVAILABLE'))
      }
    }).finally(() => { connecting = null })
    return connecting
  }

  async function request (path, options = {}) {
    assertActive(options.signal)
    if (!available) throw failure('UNAVAILABLE')
    if (typeof path !== 'string' || !/^[a-z0-9][a-z0-9/-]*$/i.test(path)) throw failure('INVALID_PATH')
    // A 401 refresh retries the exact request, including its idempotency key.
    // Network errors and ambiguous responses never trigger a fresh run.
    for (let retry = 0; retry < 2; retry++) {
      assertActive(options.signal)
      if (retryAt > Date.now()) throw rateLimitError()
      const current = await connect()
      assertActive(options.signal)
      if (retryAt > Date.now()) throw rateLimitError()
      const controller = new AbortController()
      activeRequests.add(controller)
      const abort = () => controller.abort()
      if (options.signal) options.signal.addEventListener('abort', abort, { once: true })
      const timer = setTimeout(abort, 15000)
      let response, data
      try {
        response = await fetch(apiOrigin + '/api/v1/' + path, {
          ...options,
          credentials: 'omit',
          redirect: 'error',
          cache: 'no-store',
          signal: controller.signal,
          headers: { ...options.headers, Authorization: 'Bearer ' + current.token }
        })
        try {
          data = await response.json()
        } catch (error) {
          // A proxy may return an HTML 429. Its Retry-After still applies.
          if (response.status !== 429) throw error
        }
      } catch (error) {
        assertActive(options.signal)
        throw error
      } finally {
        clearTimeout(timer)
        activeRequests.delete(controller)
        if (options.signal) options.signal.removeEventListener('abort', abort)
      }
      assertActive(options.signal)
      if (response.ok) return data
      if (response.status === 429) {
        const header = response.headers?.get('Retry-After')
        const delay = typeof header === 'string' && /^\d+$/.test(header.trim())
          ? Number(header) * 1000 : Date.parse(header) - Date.now()
        retryAt = Math.max(retryAt, Date.now() + (Number.isFinite(delay) && delay >= 0 ? delay : 60000))
        // Do not defer creating a run until after the player has already played,
        // and never replay a score in the background under a changed account.
        throw rateLimitError()
      }
      if (response.status === 401 && data?.error?.code === 'SESSION_EXPIRED' && retry === 0) {
        if (session === current) session = null
        continue
      }
      throw failure(data?.error?.code || 'REQUEST_FAILED')
    }
    throw failure('SESSION_EXPIRED')
  }
  request.available = available
  request.gameId = gameId
  // This is a local lifecycle hook, not an invented postMessage protocol.
  // Call it when the separate, verified cloud identity reports an account change.
  // The leaderboard protocol exposes no identity-change broadcast of its own.
  request.invalidate = () => {
    if (invalidated) return
    invalidated = true
    session = null
    apiOrigin = null
    request.available = false
    if (cancelConnection) cancelConnection(failure('IDENTITY_CHANGED'))
    for (const controller of activeRequests) controller.abort()
  }
  return request
}

/**
 * One fresh challenge, one server run, and at most one winning settlement.
 * Scores are the original attempt count (lower is better), split by difficulty.
 * Restored games and revealed/failed/abandoned games never publish a score.
 */
export default function createLeaderboardRound ({ mode, difficulty, restored = false, boardIds = {}, request, platformOrigin, gameId } = {}) {
  const boardId = boardIds && boardIds[difficulty]
  const skip = reason => ({
    finish: () => Promise.resolve({ status: 'skipped', reason }),
    cancel () {}
  })
  if (mode !== config.GAME.TYPE.CHALLENGE || restored || ![4, 5, 6].includes(difficulty) || !isId(boardId)) {
    return skip('ineligible')
  }
  const send = request || createPlatformRequest({ platformOrigin, gameId })
  if (typeof send !== 'function' || send.available === false || !isId(gameId || send.gameId) ||
      (gameId && send.gameId && gameId !== send.gameId) ||
      typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') return skip('unavailable')

  const controller = new AbortController()
  const startKey = crypto.randomUUID()
  const scoreKey = crypto.randomUUID()
  let cancelled = false
  let settlement = null
  // Catch immediately so a failed connection cannot reject an unobserved promise
  // while the player is still solving the puzzle.
  const started = Promise.resolve().then(() => {
    if (cancelled) throw failure('CANCELLED')
    return send('leaderboards/' + boardId + '/runs', {
      method: 'POST', headers: { 'Idempotency-Key': startKey }, signal: controller.signal
    })
  }).then(run => {
    if (!run || !isId(run.runId)) throw failure('INVALID_RUN')
    return { run }
  }).catch(error => ({ error }))

  return {
    finish ({ success, attempts } = {}) {
      if (settlement) return settlement
      if (cancelled || success !== true || !Number.isInteger(attempts) || attempts < 1 || attempts > 10) {
        cancelled = true
        controller.abort()
        settlement = Promise.resolve({ status: 'skipped', reason: 'not-a-fresh-win' })
        return settlement
      }
      const finalScore = attempts
      settlement = started.then(async result => {
        if (cancelled) return { status: 'skipped', reason: 'cancelled' }
        if (result.error) return { status: 'unavailable', code: result.error.code || 'REQUEST_FAILED' }
        try {
          const receipt = await send('runs/' + result.run.runId + '/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Idempotency-Key': scoreKey },
            body: JSON.stringify({ score: finalScore }), signal: controller.signal
          })
          if (cancelled) return { status: 'skipped', reason: 'cancelled' }
          if (!receipt || receipt.accepted !== true) throw failure('INVALID_RECEIPT')
          return { status: 'accepted', receipt }
        } catch (error) {
          return cancelled ? { status: 'skipped', reason: 'cancelled' } :
            { status: 'unavailable', code: error.code || 'REQUEST_FAILED' }
        }
      })
      return settlement
    },
    cancel () {
      cancelled = true
      controller.abort()
    }
  }
}
