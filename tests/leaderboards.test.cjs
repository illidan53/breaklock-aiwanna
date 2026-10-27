const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource, node, clock } = require('./source-fixture.cjs');
const config = loadSource('src/config.js');
const GAME = '11111111-1111-4111-8111-111111111111';
const BOARDS = {
  4: '44444444-4444-4444-8444-444444444444',
  5: '55555555-5555-4555-8555-555555555555',
  6: '66666666-6666-4666-8666-666666666666',
};
const RUN = '77777777-7777-4777-8777-777777777777';
const OFFICIAL = [
  'https://www.aiwanna.games', 'https://aiwanna.games',
  'https://www.ai-made.games', 'https://ai-made.games',
  'https://1gp-game-platform.vercel.app',
];
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function fixture({ embedded = true, fetchImpl, now = Date.now() } = {}) {
  const time = clock();
  const frame = node();
  const posts = [];
  frame.parent = embedded ? {
    postMessage(message, target) {
      assert.equal(frame.listeners.get('message')?.size, 1, 'listener must precede the handshake');
      posts.push({ message, target });
    },
  } : frame;
  const calls = [];
  let nextId = 0;
  let currentTime = now;
  class FixtureDate extends Date { static now() { return currentTime; } }
  const module = loadSource('src/platform/leaderboards.js', { '../config': config }, {
    window: frame,
    Date: FixtureDate,
    crypto: { randomUUID: () => 'aaaaaaaa-aaaa-4aaa-8aaa-' + String(++nextId).padStart(12, '0') },
    AbortController,
    setTimeout: time.setTimeout,
    clearTimeout: time.clearTimeout,
    fetch: async (url, options) => {
      calls.push({ url, options });
      return fetchImpl ? fetchImpl(url, options, calls.length) : response(200, { runId: RUN });
    },
  });
  function emit(event) {
    for (const listener of [...(frame.listeners.get('message') || [])]) listener(event);
  }
  function reply({ origin = OFFICIAL[0], source = frame.parent, requestId = posts.at(-1)?.message.requestId,
    session = {}, ...data } = {}) {
    emit({ source, origin, data: {
      source: 'aimadegames-platform', type: 'leaderboard-session', requestId,
      apiOrigin: origin,
      session: { gameId: GAME, token: 'ranking-token', expiresAt: new Date(currentTime + 3600000).toISOString(), ...session },
      ...data,
    } });
  }
  return { ...module, frame, posts, calls, time, emit, reply, advance: milliseconds => { currentTime += milliseconds; } };
}
function response(status, data, headers = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => data, headers: { get: key => headers[key] ?? null } };
}
function roundFixture(overrides = {}, sendImpl) {
  const module = fixture();
  const calls = [];
  const send = async (path, options) => {
    calls.push({ path, options });
    return sendImpl ? sendImpl(path, options, calls.length) :
      calls.length === 1 ? { runId: RUN } : { accepted: true, submittedScore: JSON.parse(options.body).score };
  };
  send.gameId = GAME;
  send.available = true;
  const round = module.default({ mode: config.GAME.TYPE.CHALLENGE, difficulty: 4, boardIds: BOARDS, request: send, ...overrides });
  return { round, calls, module };
}

test('only a fresh challenge with a configured board and game can create a run', async () => {
  for (const override of [
    { mode: config.GAME.TYPE.PRACTICE }, { mode: config.GAME.TYPE.COUNTDOWN },
    { restored: true }, { difficulty: 3 }, { difficulty: '4' },
    { boardIds: {} }, { boardIds: { 4: 'replace-with-board-id' } },
    { boardIds: null }, { gameId: BOARDS[4] },
    { boardIds: { 4: '00000000-0000-0000-0000-000000000000' } },
    { request: Object.assign(async () => assert.fail('must not call unconfigured request'), { available: true }) },
  ]) {
    const { round, calls, module } = roundFixture(override);
    assert.equal((await round.finish({ success: true, attempts: 1 })).status, 'skipped');
    await flush();
    assert.equal(calls.length, 0);
    assert.equal(module.posts.length, 0);
  }
});

test('each difficulty creates its own run and submits the inclusive attempt count once', async () => {
  for (const difficulty of [4, 5, 6]) {
    const { round, calls } = roundFixture({ difficulty });
    const settlement = round.finish({ success: true, attempts: difficulty });
    assert.strictEqual(round.finish({ success: true, attempts: 1 }), settlement);
    const result = await settlement;
    assert.equal(result.status, 'accepted');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].path, 'leaderboards/' + BOARDS[difficulty] + '/runs');
    assert.equal(calls[1].path, 'runs/' + RUN + '/score');
    assert.equal(calls[0].options.body, undefined);
    assert.deepEqual(JSON.parse(calls[1].options.body), { score: difficulty });
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[1].options.headers['Content-Type'], 'application/json');
    assert.notEqual(calls[0].options.headers['Idempotency-Key'], calls[1].options.headers['Idempotency-Key']);
  }
});

test('an immediate finish waits for the original pending start, without starting another run', async () => {
  const start = deferred();
  const { round, calls } = roundFixture({}, (path, options, count) => count === 1 ? start.promise : { accepted: true });
  const result = round.finish({ success: true, attempts: 10 });
  await flush();
  assert.equal(calls.length, 1);
  start.resolve({ runId: RUN });
  assert.equal((await result).status, 'accepted');
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[1].options.body).score, 10);
});

test('failure, reveal-style failure, and invalid counts never submit and cannot later turn into a win', async () => {
  for (const outcome of [
    { success: false, attempts: 10 }, { success: 1, attempts: 2 }, {},
    ...[0, 11, 1.5, NaN, Infinity, '2'].map(attempts => ({ success: true, attempts })),
  ]) {
    const { round, calls } = roundFixture();
    await flush(); // A run may already exist, but it must never be settled.
    const result = round.finish(outcome);
    assert.equal((await result).status, 'skipped');
    assert.strictEqual(round.finish({ success: true, attempts: 1 }), result);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.signal.aborted, true);
  }
});

test('cancelling before start, during start, or during settlement prevents stale results', async () => {
  const immediate = roundFixture();
  immediate.round.cancel();
  assert.equal((await immediate.round.finish({ success: true, attempts: 1 })).status, 'skipped');
  await flush();
  assert.equal(immediate.calls.length, 0);

  const start = deferred();
  const pending = roundFixture({}, () => start.promise);
  const firstResult = pending.round.finish({ success: true, attempts: 2 });
  await flush();
  pending.round.cancel();
  start.resolve({ runId: RUN });
  assert.equal((await firstResult).status, 'skipped');
  assert.equal(pending.calls.length, 1);

  const score = deferred();
  const submitting = roundFixture({}, (path, options, count) => count === 1 ? { runId: RUN } : score.promise);
  const secondResult = submitting.round.finish({ success: true, attempts: 3 });
  await flush();
  assert.equal(submitting.calls.length, 2);
  submitting.round.cancel();
  assert.equal(submitting.calls[1].options.signal.aborted, true);
  score.resolve({ accepted: true });
  assert.equal((await secondResult).status, 'skipped');
});

test('invalid start responses, failed requests and invalid receipts fail without restarting or rejecting gameplay', async () => {
  for (const [send, expected, count] of [
    [async () => ({ runId: 'wrong' }), 'INVALID_RUN', 1],
    [async () => { throw new Error('offline'); }, 'REQUEST_FAILED', 1],
    [async (path, options, call) => call === 1 ? { runId: RUN } : { accepted: false }, 'INVALID_RECEIPT', 2],
  ]) {
    const { round, calls } = roundFixture({}, send);
    const result = await round.finish({ success: true, attempts: 1 });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.code, expected);
    assert.equal(calls.length, count);
  }
});

test('standalone, unknown origin, and missing game configurations do not attempt a handshake', async () => {
  for (const [options, params] of [
    [{ embedded: false }, { gameId: GAME }], [{}, {}],
    [{}, { gameId: 'real-id-not-yet-configured' }],
    [{}, { gameId: GAME, platformOrigin: 'https://attacker.invalid' }],
  ]) {
    const state = fixture(options);
    const request = state.createPlatformRequest(params);
    assert.equal(request.available, false);
    await assert.rejects(request('leaderboards/' + BOARDS[4] + '/runs'), { code: 'UNAVAILABLE' });
    assert.equal(state.posts.length, 0);
    assert.equal(state.calls.length, 0);
  }
});

test('handshake targets all official origins, shares one pending connection, and uses the authenticated reply origin', async () => {
  const state = fixture();
  const request = state.createPlatformRequest({ gameId: GAME });
  const first = request('leaderboards/' + BOARDS[4] + '/runs', { method: 'POST' });
  const second = request('leaderboards/' + BOARDS[5] + '/runs', { method: 'POST' });
  assert.deepEqual(state.posts.map(post => post.target), OFFICIAL);
  assert.equal(new Set(state.posts.map(post => post.message.requestId)).size, 1);
  state.reply({ origin: OFFICIAL[3] });
  await Promise.all([first, second]);
  assert.equal(state.calls.length, 2);
  for (const call of state.calls) {
    assert.ok(call.url.startsWith(OFFICIAL[3] + '/api/v1/'));
    assert.equal(call.options.credentials, 'omit');
    assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.headers.Authorization, 'Bearer ranking-token');
  }
  assert.equal(state.frame.listeners.get('message').size, 0);
  assert.equal(state.time.timeouts.size, 0);
  await request('leaderboards/' + BOARDS[6] + '/runs');
  assert.equal(state.posts.length, 5, 'valid session should remain in memory');
});

test('forged source, origin, message kind and request ID cannot supply a token', async () => {
  const state = fixture();
  const request = state.createPlatformRequest({ gameId: GAME });
  const pending = request('leaderboards/' + BOARDS[4] + '/runs');
  state.reply({ source: {} });
  state.reply({ origin: 'https://attacker.invalid' });
  state.reply({ requestId: 'unrelated' });
  state.reply({ type: 'cloud-save-session' });
  state.emit({ source: state.frame.parent, origin: OFFICIAL[0], data: {
    source: 'other-platform', type: 'leaderboard-session', requestId: state.posts[0].message.requestId,
  } });
  assert.equal(state.calls.length, 0);
  assert.equal(state.frame.listeners.get('message').size, 1);
  state.reply();
  await pending;
  assert.equal(state.calls.length, 1);
});

test('a matching reply for another game, mismatched origin, missing token, or expired token is rejected', async () => {
  for (const reply of [
    { session: { gameId: BOARDS[4] } }, { apiOrigin: OFFICIAL[1] },
    { session: { token: '' } }, { session: { expiresAt: '2000-01-01T00:00:00Z' } },
  ]) {
    const state = fixture();
    const pending = state.createPlatformRequest({ gameId: GAME })('leaderboards/' + BOARDS[4] + '/runs');
    const rejected = assert.rejects(pending, { code: 'INVALID_SESSION' });
    state.reply(reply);
    await rejected;
    assert.equal(state.calls.length, 0);
    assert.equal(state.frame.listeners.get('message').size, 0);
    assert.equal(state.time.timeouts.size, 0);
  }
});

test('handshake failure or timeout releases its listener and can reconnect later', async () => {
  for (const timeout of [true, false]) {
    const state = fixture();
    const request = state.createPlatformRequest({ gameId: GAME });
    const pending = request('leaderboards/' + BOARDS[4] + '/runs');
    const rejected = assert.rejects(pending, { code: timeout ? 'SESSION_TIMEOUT' : 'FORBIDDEN' });
    if (timeout) [...state.time.timeouts.values()][0]();
    else state.reply({ error: { code: 'FORBIDDEN' } });
    await rejected;
    assert.equal(state.frame.listeners.get('message').size, 0);
    assert.equal(state.time.timeouts.size, 0);
    const again = request('leaderboards/' + BOARDS[4] + '/runs');
    assert.equal(state.posts.length, 10);
    state.reply();
    await again;
    assert.equal(state.calls.length, 1);
  }
});

test('an expired session refreshes once and retries the same score, run path, and idempotency key', async () => {
  const state = fixture({ fetchImpl: async (url, options, count) => count === 1 ?
    response(401, { error: { code: 'SESSION_EXPIRED' } }) : response(200, { accepted: true }) });
  const request = state.createPlatformRequest({ gameId: GAME });
  const options = { method: 'POST', body: '{"score":4}', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': BOARDS[4] } };
  const pending = request('runs/' + RUN + '/score', options);
  state.reply();
  await flush();
  assert.equal(state.posts.length, 10);
  state.reply({ session: { token: 'refreshed-ranking-token' } });
  assert.equal((await pending).accepted, true);
  assert.equal(state.calls.length, 2);
  assert.equal(state.calls[0].url, state.calls[1].url);
  assert.equal(state.calls[0].options.body, state.calls[1].options.body);
  assert.equal(state.calls[0].options.headers['Idempotency-Key'], state.calls[1].options.headers['Idempotency-Key']);
  assert.equal(state.calls[1].options.headers.Authorization, 'Bearer refreshed-ranking-token');
});

test('network ambiguity and non-expiration server errors do not automatically retry', async () => {
  for (const status of [0, 401, 429, 503]) {
    const state = fixture({ fetchImpl: async () => {
      if (!status) throw new Error('disconnected after send');
      return response(status, { error: { code: 'TEST_ERROR' } });
    } });
    const pending = state.createPlatformRequest({ gameId: GAME })('runs/' + RUN + '/score');
    const rejected = assert.rejects(pending);
    state.reply();
    await rejected;
    assert.equal(state.calls.length, 1);
    assert.equal(state.posts.length, 5);
    assert.equal(state.time.timeouts.size, 0);
  }
});

test('a second expired-session response stops instead of entering a refresh loop', async () => {
  const state = fixture({ fetchImpl: async () => response(401, { error: { code: 'SESSION_EXPIRED' } }) });
  const pending = state.createPlatformRequest({ gameId: GAME })('runs/' + RUN + '/score');
  const rejected = assert.rejects(pending, { code: 'SESSION_EXPIRED' });
  state.reply();
  await flush();
  state.reply({ session: { token: 'refreshed-ranking-token' } });
  await rejected;
  assert.equal(state.posts.length, 10);
  assert.equal(state.calls.length, 2);
  assert.equal(state.time.timeouts.size, 0);
});

test('a stalled network request is aborted on timeout and its timer is cleaned up', async () => {
  const state = fixture({ fetchImpl: async (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }) });
  const pending = state.createPlatformRequest({ gameId: GAME })('runs/' + RUN + '/score');
  const rejected = assert.rejects(pending, /aborted/);
  state.reply();
  await flush();
  assert.equal(state.calls.length, 1);
  assert.equal(state.time.timeouts.size, 1);
  [...state.time.timeouts.values()][0]();
  await rejected;
  assert.equal(state.calls[0].options.signal.aborted, true);
  assert.equal(state.time.timeouts.size, 0);
  assert.equal(state.posts.length, 5);
});

test('cancellation while waiting for identity never sends the request and absolute URLs are rejected', async () => {
  const state = fixture();
  const request = state.createPlatformRequest({ gameId: GAME });
  await assert.rejects(request('https://attacker.invalid/api'), { code: 'INVALID_PATH' });
  assert.equal(state.posts.length, 0);
  const controller = new AbortController();
  const pending = request('leaderboards/' + BOARDS[4] + '/runs', { signal: controller.signal });
  const rejected = assert.rejects(pending, { code: 'CANCELLED' });
  controller.abort();
  state.reply();
  await rejected;
  assert.equal(state.calls.length, 0);
});

test('429 Retry-After applies a shared cooldown without automatic requests or delayed round creation', async () => {
  const now = Date.now();
  const state = fixture({ now, fetchImpl: async (url, options, count) => count === 1
    ? response(429, { error: { code: 'RATE_LIMITED' } }, { 'Retry-After': '90' })
    : response(200, { runId: RUN }) });
  const request = state.createPlatformRequest({ gameId: GAME });
  const pending = request('leaderboards/' + BOARDS[4] + '/runs');
  const rejected = assert.rejects(pending, { code: 'RATE_LIMITED', retryAt: now + 90000, retryAfterMs: 90000 });
  state.reply();
  await rejected;
  assert.equal(state.time.timeouts.size, 0, 'must not schedule a background retry');
  await assert.rejects(request('leaderboards/' + BOARDS[5] + '/runs'), { code: 'RATE_LIMITED', retryAfterMs: 90000 });
  state.advance(89999);
  await assert.rejects(request('runs/' + RUN + '/score'), { code: 'RATE_LIMITED', retryAfterMs: 1 });
  assert.equal(state.calls.length, 1);
  assert.equal(state.posts.length, 5);
  state.advance(1);
  await request('leaderboards/' + BOARDS[6] + '/runs');
  assert.equal(state.calls.length, 2);
});

test('rate limiting accepts HTTP-date values and uses sixty seconds when the header is absent or invalid', async () => {
  const now = Math.floor(Date.now() / 1000) * 1000;
  for (const [header, delay] of [
    [new Date(now + 120000).toUTCString(), 120000], [undefined, 60000], ['bad-date', 60000], ['-1', 60000],
  ]) {
    const state = fixture({ now, fetchImpl: async () => ({
      ...response(429, null, { 'Retry-After': header }), json: async () => { throw new Error('proxy HTML'); },
    }) });
    const pending = state.createPlatformRequest({ gameId: GAME })('runs/' + RUN + '/score');
    const rejected = assert.rejects(pending, { code: 'RATE_LIMITED', retryAfterMs: delay });
    state.reply();
    await rejected;
    assert.equal(state.calls.length, 1);
    assert.equal(state.time.timeouts.size, 0);
  }
});

test('a rate-limited round remains settled locally instead of sending its old result after cooldown', async () => {
  const state = fixture({ fetchImpl: async () => response(429, { error: { code: 'RATE_LIMITED' } }, { 'Retry-After': '60' }) });
  const request = state.createPlatformRequest({ gameId: GAME });
  const round = state.default({ mode: 2, difficulty: 4, boardIds: BOARDS, request });
  const finish = round.finish({ success: true, attempts: 3 });
  await flush();
  state.reply();
  assert.equal((await finish).code, 'RATE_LIMITED');
  state.advance(60000);
  assert.strictEqual(round.finish({ success: true, attempts: 3 }), finish);
  assert.equal(state.calls.length, 1);
});

test('verified identity invalidation cancels a pending handshake and blocks reconnecting until reload', async () => {
  const state = fixture();
  const request = state.createPlatformRequest({ gameId: GAME });
  const pending = request('leaderboards/' + BOARDS[4] + '/runs');
  const rejected = assert.rejects(pending, { code: 'IDENTITY_CHANGED' });
  request.invalidate();
  request.invalidate();
  await rejected;
  assert.equal(request.available, false);
  assert.equal(state.frame.listeners.get('message').size, 0);
  assert.equal(state.time.timeouts.size, 0);
  state.reply({ session: { token: 'old-account-late-reply' } });
  await assert.rejects(request('leaderboards/' + BOARDS[4] + '/runs'), { code: 'IDENTITY_CHANGED' });
  assert.equal(state.calls.length, 0);
  assert.equal(state.posts.length, 5);
});

test('identity invalidation aborts in-flight requests and discards a late successful response', async () => {
  const network = deferred();
  const state = fixture({ fetchImpl: async () => network.promise });
  const request = state.createPlatformRequest({ gameId: GAME });
  const pending = request('runs/' + RUN + '/score');
  const rejected = assert.rejects(pending, { code: 'IDENTITY_CHANGED' });
  state.reply();
  await flush();
  assert.equal(state.calls.length, 1);
  request.invalidate();
  assert.equal(state.calls[0].options.signal.aborted, true);
  network.resolve(response(200, { accepted: true }));
  await rejected;
  assert.equal(state.time.timeouts.size, 0);
  await assert.rejects(request('leaderboards/' + BOARDS[5] + '/runs'), { code: 'IDENTITY_CHANGED' });
  assert.equal(state.calls.length, 1);
});

test('an account change prevents settling an old run and prevents starting new rounds under its token', async () => {
  const state = fixture();
  const request = state.createPlatformRequest({ gameId: GAME });
  const round = state.default({ mode: 2, difficulty: 4, boardIds: BOARDS, request });
  await flush();
  state.reply();
  await flush();
  assert.equal(state.calls.length, 1);
  request.invalidate();
  assert.equal((await round.finish({ success: true, attempts: 2 })).code, 'IDENTITY_CHANGED');
  const after = state.default({ mode: 2, difficulty: 5, boardIds: BOARDS, request });
  assert.equal((await after.finish({ success: true, attempts: 1 })).status, 'skipped');
  assert.equal(state.calls.length, 1);
});
