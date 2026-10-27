// The official SDK owns identity, parent-origin validation, local partitions,
// revision checks and retry queues. This adapter only gates replacing the scene.
const OFFICIAL_ORIGINS = [
  'https://www.aiwanna.games', 'https://aiwanna.games',
  'https://www.ai-made.games', 'https://ai-made.games',
  'https://1gp-game-platform.vercel.app'
];

const error = (code, message) => Object.assign(new Error(message), { code });
const copy = value => JSON.parse(JSON.stringify(value));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/**
 * A returned restore-required result contains a candidate in `value`; it has
 * NOT replaced the live game. restoreCloud() applies it only after the player
 * chooses it. useLocal() explicitly keeps AND syncs the current local game.
 * playOffline() can postpone that choice without discarding either version.
 * Local game persistence must work independently of this optional integration.
 * applyState receives { signal }; asynchronous scene restoration must honor it.
 */
export default function createCloudSync({ config = {}, getState, applyState, onStatus = () => {} }) {
  const origin = config.platformOrigin || 'https://www.aiwanna.games';
  const configured = Boolean(config.gameId) && config.enabled !== false;
  let sdk, unsubscribe, script, scriptTimer, abortScript;
  let startup, sdkReady = false, loading, saving, reading;
  let pending, initialState, initialCaptured = false, destroyed = false;
  let status = { status: 'local', ready: true, enabled: false, code: 'NOT_CONFIGURED' };
  const lifetime = new AbortController();
  const waiters = new Set();

  function current() {
    if (!pending) return copy(status);
    return {
      ...copy(status), status: pending.snoozed ? 'offline' : 'restore-required',
      ready: false, restoreAvailable: true, localOnly: Boolean(pending.snoozed),
      value: copy(pending.value)
    };
  }

  function notify() {
    const result = current();
    try { onStatus(result); } catch { /* UI failures must not break save ownership. */ }
    if (pending || result.ready || ['offline', 'conflict', 'error', 'incompatible', 'signed-out', 'unsupported'].includes(result.status)) {
      for (const resolve of waiters) resolve(current());
      waiters.clear();
    }
    return result;
  }

  function report(cause) {
    if (destroyed) return current();
    status = {
      ...status, status: cause.code === 'IDENTITY_CHANGED' ? 'signed-out' : 'error',
      code: cause.code || 'SAVE_ERROR', error: cause.message, ready: sdkReady
    };
    return notify();
  }

  function active() {
    if (destroyed) throw error('DESTROYED', 'Cloud sync has been disposed.');
  }

  function available() {
    active();
    if (!configured) return false;
    if (!OFFICIAL_ORIGINS.includes(origin)) throw error('INVALID_ORIGIN', 'Use an exact official AIWANNA origin.');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(config.gameId)) {
      throw error('INVALID_CONFIG', 'Use the published game UUID before enabling cloud saves.');
    }
    if (typeof getState !== 'function' || typeof applyState !== 'function') throw error('INVALID_CONFIG', 'Provide state export and restore functions.');
    if (window.parent === window) {
      status = { status: 'local', ready: true, enabled: false, code: 'OUTSIDE_PLATFORM' };
      return false;
    }
    return true;
  }

  function loadSDK() {
    const existing = window.AIWanna && window.AIWanna.saves || window.AIMadeGames && window.AIMadeGames.saves;
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      script = document.createElement('script');
      script.src = `${origin}/sdk/cloud-saves-v1.js`;
      script.async = true;
      function cleanup() {
        clearTimeout(scriptTimer);
        script.onload = null;
        script.onerror = null;
        abortScript = null;
      }
      function failed(cause) {
        cleanup();
        script.remove();
        reject(cause);
      }
      abortScript = () => failed(error('DESTROYED', 'Cloud sync has been disposed.'));
      script.onload = () => {
        const loaded = window.AIWanna && window.AIWanna.saves || window.AIMadeGames && window.AIMadeGames.saves;
        if (!loaded || typeof loaded.initialize !== 'function' || typeof loaded.onStatus !== 'function') {
          failed(error('SDK_UNAVAILABLE', 'The official cloud-save SDK is unavailable.'));
          return;
        }
        cleanup();
        resolve(loaded);
      };
      script.onerror = () => failed(error('SDK_UNAVAILABLE', 'The cloud-save SDK could not load. Local play remains available.'));
      scriptTimer = setTimeout(() => failed(error('SDK_UNAVAILABLE', 'The cloud-save SDK timed out. Local play remains available.')), 15000);
      document.head.appendChild(script);
    });
  }

  async function exportState() {
    active();
    if (pending) throw error('SYNC_PAUSED', 'Choose which progress to keep before syncing.');
    const value = await getState();
    active();
    if (pending) throw error('SYNC_PAUSED', 'Choose which progress to keep before syncing.');
    if (!initialCaptured) { initialState = copy(value); initialCaptured = true; }
    return value;
  }

  async function importState(value) {
    active();
    const local = await getState();
    active();
    // An empty cloud slot restores the SDK's initial export. If play advanced
    // while loading, retain it instead of rewinding to that initial export.
    if (same(value, local) || (!sdkReady && same(value, initialState))) return;
    // The official SDK calls importState while its status is conflict only
    // after an explicit local/cloud choice (including verified parent commands).
    if (sdk.getStatus().status === 'conflict') {
      await applyState(copy(value), { signal: lifetime.signal });
      active();
      return;
    }
    if (pending) throw error('RESTORE_PENDING', 'A save choice is already pending.');
    return new Promise((resolve, reject) => {
      pending = { value: copy(value), resolve, reject, snoozed: false };
      notify();
    });
  }

  function waitForResult(work) {
    if (pending) return Promise.resolve(current());
    let wake;
    const attention = new Promise(resolve => { wake = resolve; waiters.add(resolve); });
    return Promise.race([work.then(() => current()), attention]).finally(() => waiters.delete(wake));
  }

  function begin() {
    if (startup) return startup;
    status = { status: 'loading', ready: false, enabled: true };
    notify();
    startup = (async () => {
      sdk = await loadSDK();
      active();
      unsubscribe = sdk.onStatus(next => {
        if (destroyed) return;
        if (['signed-out', 'incompatible'].includes(next.status)) {
          lifetime.abort();
          if (pending) {
            pending.reject(error(next.code || 'RELOAD_REQUIRED', next.error || 'Reload before restoring this save.'));
            pending = null;
          }
        }
        status = { ...copy(next), enabled: true };
        sdkReady = Boolean(next.ready);
        notify();
      });
      await sdk.initialize({
        platformOrigin: origin,
        gameId: config.gameId,
        schemaVersion: config.schemaVersion || 1,
        gameVersion: config.gameVersion || '1.0.0',
        exportState,
        importState,
        summary: typeof config.summary === 'function' ? config.summary : 'BreakLock'
      });
      active();
      sdkReady = true;
      return current();
    })();
    // The public operation reports errors without stopping the independent game.
    // Retain the rejected Promise so invalid identity/config cannot restart sync.
    startup.catch(cause => {
      if (!sdk && !destroyed && cause.code === 'SDK_UNAVAILABLE') startup = null;
      report(cause);
    });
    return startup;
  }

  async function load() {
    try {
      if (!available()) return notify();
      if (pending) { pending.snoozed = false; return notify(); }
      if (loading) return await loading;
      if (!startup || !sdkReady) {
        loading = waitForResult(begin());
      } else {
        reading = (async () => { if (saving) await saving; active(); return sdk.load(); })().finally(() => { reading = null; });
        loading = waitForResult(reading);
      }
      return await loading;
    } catch (cause) { return report(cause); }
    finally { loading = null; }
  }

  async function save() {
    try {
      if (!available()) return notify();
      if (pending) return current();
      if (['conflict', 'incompatible', 'signed-out'].includes(status.status)) return current();
      if (!sdkReady) return { ...current(), code: 'NOT_READY' };
      if (loading || reading) return { ...current(), code: 'SYNC_BUSY' };
      if (saving) return await saving;
      saving = sdk.save().then(() => current()).catch(report);
      return await saving;
    } catch (cause) { return report(cause); }
    finally { saving = null; }
  }

  async function choose(choice) {
    try {
      if (!available()) return notify();
      if (pending) {
        const candidate = pending;
        if (candidate.applying) return current();
        candidate.applying = true;
        try {
          if (choice === 'cloud') await applyState(copy(candidate.value), { signal: lifetime.signal });
          active();
        } catch (cause) { candidate.applying = false; throw cause; }
        pending = null;
        candidate.resolve();
        const result = await waitForResult(reading || startup);
        reading = null;
        if (choice === 'local' && sdkReady) return save();
        return result;
      }
      if (sdk && sdk.getStatus().status === 'conflict') {
        return await waitForResult(sdk.resolveConflict(choice));
      }
      return { ...current(), code: 'NO_RESTORE_PENDING' };
    } catch (cause) { return report(cause); }
  }

  async function retry() {
    try {
      if (!available()) return notify();
      if (pending) return current();
      if (!sdk) return load();
      return await waitForResult(sdk.retry());
    } catch (cause) { return report(cause); }
  }

  async function playOffline() {
    try {
      if (!available()) return notify();
      if (pending) { pending.snoozed = true; return notify(); }
      if (!sdk) return { ...current(), localOnly: true };
      return await waitForResult(sdk.playOffline());
    } catch (cause) { return report(cause); }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    lifetime.abort();
    if (abortScript) abortScript();
    if (pending) { pending.reject(error('DESTROYED', 'Cloud sync has been disposed.')); pending = null; }
    if (unsubscribe) unsubscribe();
    if (sdk) sdk.destroy();
    status = { status: 'local', ready: false, enabled: false, code: 'DESTROYED' };
    for (const resolve of waiters) resolve(current());
    waiters.clear();
  }

  return {
    load, save, retry, playOffline, destroy,
    restoreCloud: () => choose('cloud'), useLocal: () => choose('local'),
    getStatus: current
  };
}
