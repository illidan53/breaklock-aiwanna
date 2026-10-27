const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource, node, dom, clock } = require('./source-fixture.cjs');
const Pattern = loadSource('src/models/pattern.js');
const config = loadSource('src/config.js');
const validateSaveState = loadSource('src/models/save-state.js', { './pattern': Pattern });
const { PRACTICE, CHALLENGE, COUNTDOWN } = config.GAME.TYPE;

function fixture() {
  const time = clock();
  const globals = { window: time.window, navigator: {}, setTimeout: time.setTimeout, clearTimeout: time.clearTimeout };
  const leftPadNum = value => String(value).padStart(3, '0');
  const Countdown = loadSource('src/controllers/countdown/countdown.ctrl.js', {
    '../../utils/leftPadNum': leftPadNum, '../../utils/dom': dom,
  }, globals);
  const StatusBar = loadSource('src/controllers/statusBar/statusBar.ctrl.js', {
    '../countdown/countdown.ctrl': Countdown, '../../utils/leftPadNum': leftPadNum, '../../utils/dom': dom,
  }, globals);
  class History {
    constructor() { this.el = node(); this.entries = []; }
    clear() { this.entries = []; }
    stackPattern(value) { this.entries.push(value); }
  }
  const PatternSVG = loadSource('src/utils/patternSVG.js', { './dom': dom });
  const Lock = loadSource('src/controllers/lock/lock.ctrl.js', {
    '../../models/pattern': Pattern, '../../utils/patternSVG': PatternSVG,
    '../../utils/dom': dom, '../../config': config,
  }, globals);
  class Summary {
    constructor() { this.el = node(); this.results = []; this.visible = false; }
    setContent(success, count) { this.results.push({ success, count }); this.visible = true; }
    toggle(force) { this.visible = force === undefined ? !this.visible : force; }
  }
  const Game = loadSource('src/controllers/game/game.ctrl.js', {
    '../statusBar/statusBar.ctrl': StatusBar, '../history/history.ctrl': History,
    '../lock/lock.ctrl': Lock, '../summary/summary.ctrl': Summary,
    '../../models/pattern': Pattern, '../../models/save-state': validateSaveState, '../../utils/patternSVG': {},
    '../../config': config, '../../utils/dom': dom, '../../utils/color': {},
    '../../utils/pluralize': { pluralize: value => value },
  }, globals);
  let ended = 0;
  const game = new Game(() => ended++);
  game.buildPatternSVG = (pattern, match) => ({ points: [...pattern.suite], match: [...match] });
  return { game, time, get ended() { return ended; } };
}

function pattern(points) {
  const result = new Pattern(points.length);
  points.forEach(point => result.addDot(point));
  return result;
}
const secret = () => pattern([0, 1, 4, 8]);
const wrong = () => pattern([2, 5, 6, 7]);
function start(game, type) { game.start(type, 4); game.pattern = secret(); }

test('practice accepts more than ten attempts and reports the successful attempt inclusively', () => {
  const { game } = fixture();
  start(game, PRACTICE);
  for (let i = 0; i < 12; i++) assert.equal(game.newAttempt(wrong()), false);
  assert.equal(game.isEnded, false);
  assert.equal(game.statusBar.counterVal, 12);
  assert.equal(game.newAttempt(secret()), true);
  assert.deepEqual(game.summary.results, [{ success: true, count: 13 }]);
  assert.equal(game.history.entries.length, 13);
});

test('challenge loses on the tenth incorrect attempt, and not on the ninth', () => {
  const { game } = fixture();
  start(game, CHALLENGE);
  for (let i = 0; i < 9; i++) game.newAttempt(wrong());
  assert.equal(game.isEnded, false);
  assert.equal(game.statusBar.counterVal, 1);
  game.newAttempt(wrong());
  assert.deepEqual(game.summary.results, [{ success: false, count: 10 }]);
  assert.equal(game.statusBar.counterVal, 0);
});

test('a correct tenth challenge attempt wins instead of failing the attempt limit', () => {
  const { game } = fixture();
  start(game, CHALLENGE);
  for (let i = 0; i < 9; i++) game.newAttempt(wrong());
  assert.equal(game.newAttempt(secret()), true);
  assert.deepEqual(game.summary.results, [{ success: true, count: 10 }]);
});

test('countdown permits unlimited attempts within sixty seconds and expires only once', () => {
  const { game, time } = fixture();
  start(game, COUNTDOWN);
  for (let i = 0; i < 12; i++) game.newAttempt(wrong());
  time.tick(59);
  assert.equal(game.isEnded, false);
  assert.equal(game.statusBar.countdown.remaining, 1);
  time.tick();
  assert.deepEqual(game.summary.results, [{ success: false, count: 12 }]);
  assert.equal(time.intervals.size, 0);
  time.tick(5);
  assert.equal(game.summary.results.length, 1);
});

test('winning countdown stops its timer and cannot later turn success into failure', () => {
  const { game, time } = fixture();
  start(game, COUNTDOWN);
  time.tick(11);
  game.newAttempt(secret());
  assert.equal(game.statusBar.countdown.remaining, 49);
  assert.equal(time.intervals.size, 0);
  time.tick(100);
  assert.deepEqual(game.summary.results, [{ success: true, count: 1 }]);
});

test('revealing a failed challenge shows the answer without awarding a win', () => {
  const { game } = fixture();
  start(game, CHALLENGE);
  for (let i = 0; i < 10; i++) game.newAttempt(wrong());
  game.action(config.GAME.ACTIONS.SOLUTION);
  assert.deepEqual(game.history.entries.at(-1).points, [0, 1, 4, 8]);
  assert.deepEqual(game.summary.results, [{ success: false, count: 10 }]);
  assert.equal(game.count, 10);
  assert.equal(game.summary.visible, false);
});

test('new game keeps mode and difficulty but resets attempts, history, and the lock', () => {
  const { game } = fixture();
  start(game, CHALLENGE);
  game.newAttempt(wrong());
  game.newAttempt(secret());
  game.action(config.GAME.ACTIONS.NEW_GAME);
  assert.equal(game.type, CHALLENGE);
  assert.equal(game.difficulty, 4);
  assert.equal(game.count, 0);
  assert.equal(game.statusBar.counterVal, 10);
  assert.equal(game.history.entries.length, 0);
  assert.equal(game.lock.pattern.suite.length, 0);
  assert.equal(game.isEnded, false);
});

test('aborting countdown cancels its timer and never opens a result after leaving', () => {
  const state = fixture();
  start(state.game, COUNTDOWN);
  state.time.tick(5);
  state.game.abort(0);
  assert.equal(state.ended, 1);
  assert.equal(state.time.intervals.size, 0);
  state.time.tick(100);
  assert.deepEqual(state.game.summary.results, []);
});

test('a fresh practice game is never failed by the previous countdown', () => {
  const { game, time } = fixture();
  start(game, COUNTDOWN);
  time.tick(50);
  game.start(PRACTICE, 5);
  time.tick(20);
  assert.equal(game.isEnded, false);
  assert.equal(game.count, 0);
  assert.equal(time.intervals.size, 0);
  assert.deepEqual(game.summary.results, []);
});

const plain = value => JSON.parse(JSON.stringify(value));

test('a saved challenge restores its secret, feedback, remaining attempts and inclusive next guess', () => {
  const original = fixture();
  start(original.game, CHALLENGE);
  original.game.newAttempt(wrong());
  original.game.newAttempt(wrong());
  const snapshot = original.game.exportState();

  const restored = fixture();
  const starts = [], finishes = [];
  restored.game.onRoundStart = value => starts.push(plain(value));
  restored.game.onRoundFinish = value => finishes.push(plain(value));
  restored.game.importState(snapshot);
  assert.deepEqual(plain(restored.game.exportState()), plain(snapshot));
  assert.deepEqual(restored.game.history.entries, original.game.history.entries);
  assert.deepEqual(starts, [{ mode: CHALLENGE, difficulty: 4, restored: true }]);
  assert.equal(restored.game.statusBar.counterVal, 8);
  assert.deepEqual(finishes, []);
  restored.game.newAttempt(secret());
  assert.deepEqual(finishes, [{ success: true, attempts: 3 }]);
  assert.deepEqual(restored.game.summary.results, [{ success: true, count: 3 }]);
});

test('invalid saved data cannot stop or partially overwrite a running countdown', () => {
  const state = fixture();
  start(state.game, COUNTDOWN);
  state.time.tick(7);
  state.game.newAttempt(wrong());
  const before = plain(state.game.exportState());
  const broken = structuredClone(before);
  broken.game.solution = [0, 2, 4, 8]; // Invalid: Android would insert dot 1.
  assert.throws(() => state.game.importState(broken), /Invalid saved path/);
  assert.deepEqual(plain(state.game.exportState()), before);
  assert.equal(state.time.intervals.size, 1);
  state.time.tick();
  assert.equal(state.game.statusBar.countdown.remaining, 52);
});

test('restoring an active countdown replaces the old timer and retains its original progress scale', () => {
  const original = fixture();
  start(original.game, COUNTDOWN);
  original.time.tick(11);
  original.game.newAttempt(wrong());
  const snapshot = original.game.exportState();

  const restored = fixture();
  start(restored.game, COUNTDOWN);
  restored.time.tick(30);
  restored.game.importState(snapshot);
  assert.equal(restored.time.intervals.size, 1);
  assert.equal(restored.game.statusBar.countdown.remaining, 49);
  assert.equal(restored.game.statusBar.countdown.duration, 60);
  assert.equal(restored.game.statusBar.countdown.barEl.style.width, (49 / 60 * 100) + '%');
  restored.time.tick(48);
  assert.equal(restored.game.isEnded, false);
  restored.time.tick();
  assert.equal(restored.time.intervals.size, 0);
  assert.deepEqual(restored.game.summary.results, [{ success: false, count: 1 }]);
});

test('finished countdowns restore the frozen clock without restarting or invalid progress widths', () => {
  for (const success of [true, false]) {
    const original = fixture();
    start(original.game, COUNTDOWN);
    original.time.tick(success ? 11 : 60);
    if (success) original.game.newAttempt(secret());

    const restored = fixture();
    restored.game.importState(original.game.exportState());
    const bar = restored.game.statusBar;
    assert.equal(restored.time.intervals.size, 0);
    assert.equal(bar.countdown.remaining, success ? 49 : 0);
    assert.equal(bar.countdownEl.style.display, 'inherit');
    assert.equal(bar.counterEl.style.display, 'none');
    assert.equal(bar.countdown.barEl.style.width, ((success ? 49 : 0) / 60 * 100) + '%');
    restored.time.tick(100);
    assert.deepEqual(restored.game.summary.results, [{ success, count: success ? 1 : 0 }]);
  }
});

test('restored revealed failures retain their result and later drawings never create another settlement', () => {
  const original = fixture();
  start(original.game, CHALLENGE);
  for (let i = 0; i < 10; i++) original.game.newAttempt(wrong());
  original.game.action(config.GAME.ACTIONS.SOLUTION);
  const snapshot = original.game.exportState();
  assert.equal(snapshot.game.history.at(-1).reveal, true);
  assert.equal(snapshot.game.summaryOpen, false);
  assert.equal(snapshot.game.count, 10);

  const restored = fixture();
  const finishes = [];
  restored.game.onRoundFinish = value => finishes.push(value);
  restored.game.importState(snapshot);
  assert.equal(restored.game.summary.visible, false);
  assert.equal(restored.game.history.entries.length, 11);
  restored.game.newAttempt(secret());
  assert.equal(restored.game.outcome, 'loss');
  assert.equal(restored.game.outcomeCount, 10);
  assert.equal(restored.game.count, 11);
  assert.deepEqual(finishes, []);
});

test('restored wins retain their original result count after subsequent history exploration', () => {
  const original = fixture();
  start(original.game, PRACTICE);
  original.game.newAttempt(wrong());
  original.game.newAttempt(secret());
  original.game.action(config.GAME.ACTIONS.SOLUTION);
  original.game.newAttempt(wrong());
  const restored = fixture();
  restored.game.importState(original.game.exportState());
  assert.equal(restored.game.outcome, 'win');
  assert.equal(restored.game.outcomeCount, 2);
  assert.equal(restored.game.count, 3);
  assert.equal(restored.game.summary.visible, false);
  assert.equal(restored.game.history.entries.length, 3);
  assert.deepEqual(plain(restored.game.exportState()), plain(original.game.exportState()));
});

test('save snapshots are detached in both directions, and a long practice retains total count with bounded history', () => {
  const original = fixture();
  start(original.game, PRACTICE);
  for (let i = 0; i < 305; i++) original.game.newAttempt(wrong());
  const snapshot = original.game.exportState();
  assert.equal(snapshot.game.count, 305);
  assert.equal(snapshot.game.history.length, 300);
  snapshot.game.history[0].points[0] = 0;
  snapshot.game.solution[0] = 8;
  assert.equal(original.game.savedHistory[0].points[0], 2);
  assert.equal(original.game.pattern.suite[0], 0);

  const clean = original.game.exportState();
  const restored = fixture();
  restored.game.importState(clean);
  clean.game.history[0].points[0] = 0;
  clean.game.solution[0] = 8;
  assert.equal(restored.game.savedHistory[0].points[0], 2);
  assert.equal(restored.game.pattern.suite[0], 0);
  assert.equal(restored.game.count, 305);
  assert.equal(restored.game.history.entries.length, 300);
});

test('a cleared save returns to the menu, cancels the timer, and invalidates an active ranking round', () => {
  const state = fixture();
  start(state.game, COUNTDOWN);
  const starts = [];
  state.game.onRoundStart = value => starts.push(plain(value));
  state.game.importState({ schemaVersion: 1, game: null });
  assert.equal(state.ended, 1);
  assert.equal(state.game.active, false);
  assert.equal(state.time.intervals.size, 0);
  assert.deepEqual(starts, [{ restored: true }]);
  assert.deepEqual(plain(state.game.exportState()), { schemaVersion: 1, game: null });
  state.time.tick(100);
  assert.deepEqual(state.game.summary.results, []);
});
