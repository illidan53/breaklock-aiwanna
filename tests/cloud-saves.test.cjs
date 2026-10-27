const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./source-fixture.cjs');

const gameId = '11111111-2222-4333-8444-555555555555';
const fresh = () => ({ game: null, wins: 0 });
const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function fixture({ incoming = null, config = {}, standalone = false, initGate, apply, initialFailure = false, backgroundRetry = false } = {}) {
  let state = fresh();
  const calls = { scripts: [], initialized: 0, loads: 0, saves: [], applied: [], destroyed: 0, conflicts: [] };
  const changes = [];
  let sdkOptions, initial, status = { status: 'loading', ready: false }, listener;
  const recovery = deferred();
  function publish(next) { status = { ...next }; listener?.(clone(status)); }
  const sdk = {
    onStatus(fn) { listener = fn; fn(status); return () => { listener = null; }; },
    getStatus: () => status,
    async initialize(options) {
      calls.initialized++;
      sdkOptions = options;
      initial = clone(await options.exportState());
      if (initGate) await initGate.promise;
      if (initialFailure) {
        publish({ status: 'offline', ready: false, code: 'NETWORK_ERROR' });
        await recovery.promise;
        return { restored: false, status: status.status };
      }
      await options.importState(clone(incoming || initial));
      publish({ status: 'synced', ready: true });
      return { restored: Boolean(incoming), status: 'synced' };
    },
    async load() {
      calls.loads++;
      publish({ status: 'loading', ready: true });
      await sdkOptions.importState(clone(incoming || fresh()));
      publish({ status: 'synced', ready: true });
    },
    async save() { calls.saves.push(clone(await sdkOptions.exportState())); publish({ status: 'synced', ready: true }); },
    async retry() {
      if (backgroundRetry && status.ready) {
        publish({ status: incoming ? 'conflict' : 'synced', ready: true });
        return;
      }
      await sdk.load();
      recovery.resolve();
    },
    async playOffline() {
      if (!status.ready) await sdkOptions.importState(clone(initial));
      // The real SDK publishes the offline state before ready() in one turn.
      publish({ status: 'offline', ready: status.ready });
      publish({ status: 'offline', ready: true });
      recovery.resolve();
    },
    async resolveConflict(choice) {
      calls.conflicts.push(choice);
      if (choice === 'cloud') await sdkOptions.importState(clone(incoming));
      else calls.saves.push(clone(await sdkOptions.exportState()));
      publish({ status: 'synced', ready: true });
    },
    destroy() { calls.destroyed++; }
  };
  const window = { parent: {}, AIWanna: { saves: sdk } };
  if (standalone) window.parent = window;
  const document = {
    createElement() { return { remove() {}, set src(value) { this.url = value; }, async: false }; },
    head: { appendChild(script) { calls.scripts.push(script.url); } }
  };
  const createCloudSync = loadSource('src/platform/cloud-saves.js', {}, { window, document, AbortController, setTimeout, clearTimeout });
  const sync = createCloudSync({
    config: { gameId, ...config },
    getState: () => clone(state),
    applyState: async (next, context) => {
      if (apply) await apply(next, context);
      if (!context.signal.aborted) { state = clone(next); calls.applied.push(clone(next)); }
    },
    onStatus: next => changes.push(clone(next))
  });
  return { sync, calls, changes, sdk, window, document, publish, options: () => sdkOptions, state: () => state, setState: next => { state = clone(next); } };
}

test('missing game ID, disabled integration and standalone play make no SDK or remote requests', async () => {
  for (const options of [{ config: { gameId: '' } }, { config: { enabled: false } }, { standalone: true }]) {
    const f = fixture(options);
    await f.sync.initialize(); await f.sync.load(); await f.sync.save(); await f.sync.retry();
    assert.equal(f.calls.initialized, 0);
    assert.equal(f.calls.scripts.length, 0);
    assert.equal(f.calls.saves.length, 0);
    assert.equal(f.sync.getStatus().enabled, false);
  }
});

test('only exact official origins and a real-shaped game UUID reach the official SDK', async () => {
  for (const config of [{ platformOrigin: 'https://www.aiwanna.games.attacker.test' }, { platformOrigin: 'https://www.aiwanna.games/path' }, { gameId: 'YOUR_GAME_UUID' }]) {
    const f = fixture({ config });
    const result = await f.sync.load();
    assert.equal(result.status, 'error');
    assert.equal(f.calls.initialized, 0);
  }
  const f = fixture();
  await f.sync.load();
  assert.equal(f.options().platformOrigin, 'https://www.aiwanna.games');
  assert.equal(f.options().gameId, gameId);
  assert.equal(f.options().schemaVersion, 1);
});

test('a cold cloud read stages the initial save and completes without an invisible in-frame choice', async () => {
  const gate = deferred();
  const cloud = { game: { attempts: 2 }, wins: 3 };
  const f = fixture({ incoming: cloud, initGate: gate });
  const first = f.sync.initialize();
  const duplicate = f.sync.initialize();
  await settle();
  assert.equal(f.sync.getStatus().ready, false);
  assert.equal(f.calls.applied.length, 0);
  await f.sync.save();
  assert.equal(f.calls.saves.length, 0);
  gate.resolve();
  const result = await first;
  assert.equal((await duplicate).ready, true);
  assert.equal(result.ready, true);
  assert.notEqual(result.status, 'restore-required');
  assert.equal(result.restoreAvailable, undefined);
  assert.equal(f.calls.initialized, 1);
  assert.deepEqual(f.state(), cloud);
  assert.equal(f.calls.applied.length, 1);
  assert.equal(f.changes.some(state => state.status === 'restore-required'), false,
    'The parent may hide the frame until ready; startup must not wait on an inner button');
  await f.sync.save();
  assert.deepEqual(f.calls.saves[0], cloud);
});

test('an empty cloud slot never rewinds progress made while its initial read was pending', async () => {
  const gate = deferred();
  const f = fixture({ initGate: gate });
  const work = f.sync.load();
  await settle(); f.setState({ game: { attempts: 4 }, wins: 1 }); gate.resolve();
  await work;
  assert.equal(f.calls.applied.length, 0);
  assert.equal(f.state().game.attempts, 4);
  await f.sync.save();
  assert.equal(f.calls.saves[0].game.attempts, 4);
});

test('explicitly keeping local progress syncs the newest state without importing the cloud candidate', async () => {
  const f = fixture({ incoming: { game: { attempts: 7 }, wins: 3 } });
  await f.sync.initialize();
  f.setState({ game: { attempts: 2 }, wins: 1 });
  await f.sync.load();
  await f.sync.useLocal();
  assert.equal(f.calls.applied.length, 1, 'Only the startup save was imported');
  assert.deepEqual(f.calls.saves.at(-1), { game: { attempts: 2 }, wins: 1 });
});

test('a later explicit read offers a copied candidate and requires a choice before any replacement or sync', async () => {
  const cloud = { game: { attempts: 3 }, wins: 6 };
  const local = { game: { attempts: 5 }, wins: 2 };
  const f = fixture({ incoming: cloud });
  await f.sync.initialize();
  f.setState(local);
  const candidate = await f.sync.load();
  assert.equal(candidate.status, 'restore-required');
  assert.deepEqual(clone(candidate.value), cloud);
  candidate.value.wins = 999;
  assert.equal(f.sync.getStatus().value.wins, 6);
  const offline = await f.sync.playOffline();
  assert.equal(offline.status, 'restore-required');
  assert.equal(offline.code, 'SAVE_CHOICE_REQUIRED');
  assert.equal(offline.ready, true, 'Startup has already completed');
  assert.equal(offline.restoreAvailable, true);
  assert.deepEqual(f.state(), local);
  assert.equal(f.calls.applied.length, 1);
  await f.sync.save();
  await assert.rejects(f.options().exportState(), { code: 'SYNC_PAUSED' });
  assert.equal(f.calls.saves.length, 0);
  await f.sync.restoreCloud();
  assert.equal(f.calls.applied.length, 2);
  assert.deepEqual(f.state(), cloud);
});

test('initialize holds the gameplay gate through a failed read until an explicit offline choice', async () => {
  const f = fixture({ initialFailure: true });
  assert.equal(f.sync.getStatus().ready, false, 'A configured but unstarted adapter is not ready');
  let started = false;
  const startup = f.sync.initialize().then(result => { started = true; return result; });
  const attention = await f.sync.load();
  assert.equal(attention.ready, false);
  assert.equal(attention.code, 'NETWORK_ERROR');
  assert.equal(started, false);
  await f.sync.save();
  assert.equal(f.calls.saves.length, 0, 'A failed read is not permission to write an empty save');
  const offline = await f.sync.playOffline();
  assert.equal(offline.ready, true, 'Return the final SDK state, not its intermediate offline notification');
  assert.equal((await startup).ready, true);
  assert.equal(f.calls.applied.length, 0);
  f.setState({ game: { attempts: 2 }, wins: 1 });
  await f.sync.save();
  assert.equal(f.calls.saves[0].game.attempts, 2, 'Only initialized offline play can use SDK local persistence');
});

test('retrying after offline startup preserves the live game and exposes a cloud conflict without importing it', async () => {
  const f = fixture({ initialFailure: true, incoming: { game: { attempts: 3 }, wins: 8 }, backgroundRetry: true });
  const startup = f.sync.initialize();
  await f.sync.load();
  await f.sync.playOffline();
  await startup;
  const local = { game: { attempts: 6 }, wins: 1 };
  f.setState(local);
  const result = await f.sync.retry();
  assert.equal(result.status, 'conflict');
  assert.equal(result.ready, true);
  assert.equal(f.calls.applied.length, 0);
  assert.deepEqual(f.state(), local);
  assert.equal(f.calls.conflicts.length, 0);
});

test('ready background status notifications do not finish retry before the SDK operation settles', async () => {
  const f = fixture();
  await f.sync.initialize();
  const gate = deferred();
  f.sdk.retry = async () => {
    f.publish({ status: 'saving', ready: true });
    await gate.promise;
    f.publish({ status: 'conflict', ready: true });
  };
  let finished = false;
  const retry = f.sync.retry().then(result => { finished = true; return result; });
  await settle();
  assert.equal(finished, false);
  gate.resolve();
  assert.equal((await retry).status, 'conflict');
  assert.equal(f.calls.applied.length, 0);
});

test('initialize does not expose SDK readiness before its actual startup promise resolves', async () => {
  const gate = deferred();
  const f = fixture({ initGate: gate });
  let started = false;
  const startup = f.sync.initialize().then(() => { started = true; });
  await settle();
  assert.equal(started, false);
  assert.equal(f.sync.getStatus().ready, false);
  gate.resolve();
  await startup;
  assert.equal(started, true);
  assert.equal(f.sync.getStatus().ready, true);
});

test('a refresh offers changed progress, then permits saving again after the chosen restore completes', async () => {
  const cloud = { game: { attempts: 3 }, wins: 2 };
  const f = fixture({ incoming: cloud });
  await f.sync.initialize();
  f.setState({ game: { attempts: 4 }, wins: 2 });
  assert.equal((await f.sync.load()).status, 'restore-required');
  await f.sync.restoreCloud();
  await f.sync.save();
  assert.equal(f.calls.saves.length, 1);
  assert.equal(f.calls.saves[0].game.attempts, 3);
});

test('SDK revision conflicts remain unresolved until the player explicitly chooses a version', async () => {
  const cloud = { game: { attempts: 5 }, wins: 9 };
  const f = fixture({ incoming: cloud });
  await f.sync.initialize();
  f.setState({ game: { attempts: 2 }, wins: 2 });
  f.publish({ status: 'conflict', ready: true, code: 'SAVE_CONFLICT' });
  assert.equal(f.sync.getStatus().status, 'conflict');
  assert.equal(f.calls.conflicts.length, 0);
  await f.sync.save();
  assert.equal(f.calls.saves.length, 0, 'A conflict cannot become a silent overwrite');
  await f.sync.restoreCloud();
  assert.deepEqual(f.calls.conflicts, ['cloud']);
  assert.deepEqual(f.state(), cloud);
});

test('an account change invalidates a pending cloud choice without replacing the live game', async () => {
  const f = fixture({ incoming: { game: { attempts: 3 }, wins: 9 } });
  await f.sync.initialize();
  const local = { game: { attempts: 2 }, wins: 1 };
  f.setState(local);
  await f.sync.load();
  f.publish({ status: 'signed-out', ready: false, code: 'IDENTITY_CHANGED', error: 'Reload to change accounts.' });
  await settle();
  assert.equal(f.sync.getStatus().status, 'signed-out');
  await f.sync.restoreCloud(); await f.sync.save();
  assert.equal(f.calls.applied.length, 1);
  assert.deepEqual(f.state(), local);
  assert.equal(f.calls.saves.length, 0);
});

test('destroy cancels a pending restore and ignores all later SDK status events', async () => {
  const f = fixture({ incoming: { game: { attempts: 3 }, wins: 9 } });
  await f.sync.initialize();
  f.setState({ game: { attempts: 2 }, wins: 1 });
  await f.sync.load();
  f.sync.destroy();
  const count = f.changes.length;
  f.publish({ status: 'synced', ready: true });
  await settle();
  assert.equal(f.changes.length, count);
  assert.equal(f.calls.destroyed, 1);
  assert.equal(f.calls.applied.length, 1);
  assert.equal(f.sync.getStatus().code, 'DESTROYED');
  assert.equal((await f.sync.restoreCloud()).code, 'DESTROYED');
});

test('disposing during asynchronous restoration aborts the scene replacement', async () => {
  const gate = deferred();
  const f = fixture({ incoming: { game: { attempts: 3 }, wins: 9 }, apply: async (value, context) => {
    await gate.promise;
    assert.equal(context.signal.aborted, true);
  } });
  const restoring = f.sync.load();
  await settle(); f.sync.destroy(); gate.resolve();
  await restoring;
  assert.equal(f.calls.applied.length, 0);
});
