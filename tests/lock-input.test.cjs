const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource, dom, clock } = require('./source-fixture.cjs');
const Pattern = loadSource('src/models/pattern.js');
const config = loadSource('src/config.js');

function fixture({ difficulty = 4 } = {}) {
  const time = clock();
  const submissions = [];
  const PatternSVG = loadSource('src/utils/patternSVG.js', { './dom': dom });
  const Lock = loadSource('src/controllers/lock/lock.ctrl.js', {
    '../../models/pattern': Pattern, '../../utils/patternSVG': PatternSVG,
    '../../utils/dom': dom, '../../config': config,
  }, { window: time.window, navigator: {}, setTimeout: time.setTimeout, clearTimeout: time.clearTimeout });
  const lock = new Lock(pattern => { submissions.push([...pattern.suite]); return false; });
  lock.init();
  if (difficulty !== null) lock.setDotLength(difficulty);
  lock.el.getBoundingClientRect = () => ({ left: 120, top: 80, width: 200, height: 200 });
  const event = overrides => ({ currentTarget: lock.el, preventDefault() {}, stopPropagation() {}, ...overrides });
  return { lock, time, submissions, event };
}

test('incomplete or cancelled touch gestures do not spend an attempt', () => {
  const { lock, submissions } = fixture();
  lock.triggerDot(0);
  lock.triggerDot(1);
  lock.touchEnd();
  assert.equal(lock.pattern.suite.length, 0);
  assert.deepEqual(submissions, []);
  lock.triggerDot(8);
  const cancel = [...lock.el.listeners.get('touchcancel')][0];
  cancel();
  assert.equal(lock.pattern.suite.length, 0);
  assert.deepEqual(submissions, []);
});

test('touching duplicate dots does not advance the pattern or submit early', () => {
  const { lock, submissions } = fixture();
  for (const point of [0, 1, 0, 1, 4]) lock.triggerDot(point);
  assert.deepEqual(Array.from(lock.pattern.suite), [0, 1, 4]);
  assert.deepEqual(submissions, []);
  lock.triggerDot(8);
  assert.deepEqual(submissions, [[0, 1, 4, 8]]);
});

test('a complete drag submits immediately once and keeps feedback until the scheduled reset', () => {
  const { lock, time, submissions } = fixture();
  for (const point of [0, 1, 4, 8]) lock.triggerDot(point);
  assert.equal(time.timeouts.size, 1);
  lock.touchEnd();
  lock.updatePoint(85, 15);
  assert.deepEqual(submissions, [[0, 1, 4, 8]]);
  assert.equal(lock.patternEl.attributes.stroke, config.COLORS.ERROR);
  assert.equal(lock.pattern.suite.length, 4);
  [...time.timeouts.values()][0]();
  assert.equal(lock.pattern.suite.length, 0);
  assert.equal(lock.patternEl.childNodes.length, 0);
  assert.equal(lock.patternEl.attributes.stroke, config.COLORS.BRIGHT);
});

test('starting a fresh difficulty clears the old pending reset and drawn lines', () => {
  const { lock, time } = fixture();
  for (const point of [0, 1, 4, 8]) lock.triggerDot(point);
  assert.equal(time.timeouts.size, 1);
  lock.setDotLength(6);
  assert.equal(time.timeouts.size, 0);
  assert.equal(lock.pattern.dotLength, 6);
  assert.equal(lock.pattern.suite.length, 0);
  assert.equal(lock.patternEl.childNodes.length, 0);
  lock.triggerDot(8);
  assert.deepEqual(Array.from(lock.pattern.suite), [8]);
});

test('mouse hit-testing uses viewport coordinates when the page has been scrolled', () => {
  const { lock, event } = fixture();
  lock.mouseUpdate(event({ clientX: 220, clientY: 180, pageX: 720, pageY: 680 }));
  assert.deepEqual(Array.from(lock.pattern.suite), [4]);
});

test('touch hit-testing uses viewport coordinates and ignores empty touch lists', () => {
  const { lock, event } = fixture();
  lock.touchUpdate(event({ targetTouches: [{ clientX: 220, clientY: 180, pageX: 720, pageY: 680 }] }));
  assert.deepEqual(Array.from(lock.pattern.suite), [4]);
  assert.doesNotThrow(() => lock.touchUpdate(event({ targetTouches: [] })));
  assert.deepEqual(Array.from(lock.pattern.suite), [4]);
});

test('ending a mouse gesture removes all temporary listeners before another gesture starts', () => {
  const { lock, time, event } = fixture();
  const start = event({ clientX: 150, clientY: 110, pageX: 150, pageY: 110 });
  lock.mouseStart(start);
  assert.equal(time.window.listeners.get('mouseleave').size, 1);
  assert.equal(time.window.listeners.get('mouseup').size, 1);
  assert.equal(lock.el.listeners.get('mousemove').size, 1);
  lock.mouseEnd();
  assert.equal(time.window.listeners.get('mouseleave').size, 0);
  assert.equal(time.window.listeners.get('mouseup').size, 0);
  assert.equal(lock.el.listeners.get('mousemove').size, 0);
  lock.mouseStart(start);
  assert.equal(time.window.listeners.get('mouseleave').size, 1);
  lock.mouseEnd();
});

test('the focused lock maps number keys 1 through 9 in grid reading order', () => {
  const { lock, event, submissions } = fixture();
  const onKey = [...lock.el.listeners.get('keydown')][0];
  assert.equal(lock.el.attributes.tabindex, '0');
  assert.equal(lock.el.listeners.get('keydown').size, 1);
  for (let number = 1; number <= 9; number++) {
    let prevented = false;
    onKey(event({ key: String(number), preventDefault() { prevented = true; } }));
    assert.equal(prevented, true);
    assert.deepEqual(Array.from(lock.pattern.suite), [number - 1]);
    lock.reset();
  }
  assert.deepEqual(submissions, []);
});

test('keyboard input follows Android midpoint and duplicate rules and submits on the final dot', () => {
  const { lock, event, submissions } = fixture();
  for (const key of ['1', '1', '3', '3']) lock.keyInput(event({ key }));
  assert.deepEqual(Array.from(lock.pattern.suite), [0, 1, 2]);
  assert.deepEqual(submissions, []);
  lock.keyInput(event({ key: '6' }));
  assert.deepEqual(submissions, [[0, 1, 2, 5]]);
  lock.keyInput(event({ key: '6', repeat: true }));
  assert.deepEqual(submissions, [[0, 1, 2, 5]]);
});

test('Escape and Backspace clear incomplete keyboard paths without counting an attempt', () => {
  const { lock, event, submissions, time } = fixture();
  for (const reset of ['Escape', 'Backspace']) {
    lock.keyInput(event({ key: '1' }));
    lock.keyInput(event({ key: '2' }));
    let prevented = false;
    lock.keyInput(event({ key: reset, preventDefault() { prevented = true; } }));
    assert.equal(prevented, true);
    assert.equal(lock.pattern.suite.length, 0);
    assert.equal(lock.patternEl.childNodes.length, 0);
    assert.equal(time.timeouts.size, 0);
    assert.deepEqual(submissions, []);
  }
});

test('a new numeric key replaces completed feedback without leaving an old reset timer behind', () => {
  const { lock, event, submissions, time } = fixture();
  for (const key of ['1', '2', '5', '9']) lock.keyInput(event({ key }));
  assert.equal(time.timeouts.size, 1);
  lock.keyInput(event({ key: '9' }));
  assert.equal(time.timeouts.size, 0);
  assert.deepEqual(Array.from(lock.pattern.suite), [8]);
  for (const key of ['8', '5', '1']) lock.keyInput(event({ key }));
  assert.deepEqual(submissions, [[0, 1, 4, 8], [8, 7, 4, 0]]);
  lock.keyInput(event({ key: 'Escape' }));
  assert.equal(time.timeouts.size, 0);
  assert.equal(lock.pattern.suite.length, 0);
});

test('browser shortcuts, repeated keys and unrelated navigation keys leave the game untouched', () => {
  const { lock, event, submissions } = fixture();
  lock.keyInput(event({ key: '1' }));
  for (const extra of [
    { key: '2', altKey: true }, { key: '2', ctrlKey: true }, { key: '2', metaKey: true },
    { key: '2', repeat: true }, { key: 'Backspace', ctrlKey: true },
    ...['0', 'Enter', 'Tab', 'ArrowRight', 'a', '!'].map(key => ({ key })),
  ]) {
    lock.keyInput(event({ ...extra, preventDefault() { assert.fail('unhandled keyboard input should retain browser behavior'); } }));
    assert.deepEqual(Array.from(lock.pattern.suite), [0]);
  }
  assert.deepEqual(submissions, []);
  const fresh = fixture({ difficulty: null });
  for (const key of ['1', 'Escape', 'Backspace']) {
    assert.doesNotThrow(() => fresh.lock.keyInput(fresh.event({ key })));
  }
  assert.deepEqual(fresh.submissions, []);
});
