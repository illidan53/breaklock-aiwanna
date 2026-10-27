const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadSource, node, clock } = require('./source-fixture.cjs');

const clone = value => JSON.parse(JSON.stringify(value));
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function executeApp(imports, globals) {
  const filename = path.resolve(__dirname, '../src/app.js');
  const source = readFileSync(filename, 'utf8').replace(/^import\s+(.+?)\s+from\s+(['"])([^'"]+)\2\s*;?/gm,
    (_, bindings, quote, name) => {
      assert.ok(Object.hasOwn(imports, name), `Missing app fixture import: ${name}`);
      const [defaultName, named] = bindings.split(/,\s*(?=\{)/);
      const declaration = `const ${defaultName} = __imports[${JSON.stringify(name)}];`;
      return named ? declaration + `const ${named} = __imports[${JSON.stringify(name)}];` : declaration;
    });
  vm.runInNewContext(source, {
    __imports: imports,
    require(name) { assert.ok(name.endsWith('.scss'), `Unexpected runtime require: ${name}`); },
    ...globals,
  }, { filename });
}

test('the real app defers a restored countdown until SDK initialization finishes and exports the staged save meanwhile', async () => {
  const time = clock();
  const elements = [];
  const element = () => {
    const result = node();
    result.replaceChildren = (...children) => { result.childNodes = children; };
    result.after = () => {};
    result.focus = () => {};
    elements.push(result);
    return result;
  };
  const dom = {
    create(tag, attributes, children) {
      const result = element();
      if (typeof attributes === 'object') Object.assign(result.attributes, attributes);
      else if (typeof attributes === 'string') result.attributes.class = attributes;
      if (Array.isArray(children)) children.forEach(child => result.appendChild(child));
      else if (typeof children === 'string') result.textContent = children;
      return result;
    },
    icon: element,
  };
  time.window.parent = {};
  time.window.scrollTo = () => {};
  time.window.requestAnimationFrame = callback => callback();
  const document = {
    body: element(), hidden: false, getElementById: () => null,
    addEventListener() {},
  };
  const globals = {
    window: time.window, document, navigator: {},
    setTimeout: time.setTimeout, clearTimeout: time.clearTimeout,
  };
  const Pattern = loadSource('src/models/pattern.js');
  const config = loadSource('src/config.js');
  const validateSaveState = loadSource('src/models/save-state.js', { './pattern': Pattern });
  const leftPadNum = value => String(value).padStart(3, '0');
  const Countdown = loadSource('src/controllers/countdown/countdown.ctrl.js', {
    '../../utils/leftPadNum': leftPadNum, '../../utils/dom': dom,
  }, globals);
  const StatusBar = loadSource('src/controllers/statusBar/statusBar.ctrl.js', {
    '../countdown/countdown.ctrl': Countdown, '../../utils/leftPadNum': leftPadNum, '../../utils/dom': dom,
  }, globals);
  const PatternSVG = loadSource('src/utils/patternSVG.js', { './dom': dom });
  const Lock = loadSource('src/controllers/lock/lock.ctrl.js', {
    '../../models/pattern': Pattern, '../../utils/patternSVG': PatternSVG,
    '../../utils/dom': dom, '../../config': config,
  }, globals);
  class History {
    constructor() { this.el = element(); }
    clear() {}
    stackPattern() {}
  }
  class Summary {
    constructor() { this.el = element(); this.detailsEl = element(); }
    setContent() {}
    toggle() {}
  }
  const GameCtrl = loadSource('src/controllers/game/game.ctrl.js', {
    '../statusBar/statusBar.ctrl': StatusBar, '../history/history.ctrl': History,
    '../lock/lock.ctrl': Lock, '../summary/summary.ctrl': Summary,
    '../../models/pattern': Pattern, '../../models/save-state': validateSaveState,
    '../../utils/patternSVG': {}, '../../config': config, '../../utils/dom': dom,
    '../../utils/color': {}, '../../utils/pluralize': { pluralize: value => value },
  }, globals);
  let game, menu, imports = 0, starts = 0;
  class ObservedGame extends GameCtrl {
    constructor(onEnd) {
      super(onEnd);
      game = this;
      this.buildPatternSVG = () => element();
    }
    importState(value) { imports++; return super.importState(value); }
    start(...args) { starts++; return super.start(...args); }
  }
  class Menu {
    constructor(onStart) {
      menu = this;
      this.onStart = onStart;
      this.el = element();
      this.btnStarlEl = element();
      const instructions = element();
      this.el.querySelector = () => instructions;
    }
    init() {}
  }
  let cloudOptions, finishInitialization;
  let cloudState = { status: 'loading', ready: false, enabled: true };
  const startup = new Promise(resolve => { finishInitialization = resolve; });
  const cloud = {
    initialize: () => startup,
    getStatus: () => cloudState,
    save: async () => cloudOptions.getState(),
  };
  const publish = state => { cloudState = state; cloudOptions.onStatus(state); };
  const leaderboard = () => ({ cancel() {}, finish: async () => ({ status: 'skipped' }) });
  leaderboard.createPlatformRequest = () => ({ invalidate() {} });

  // Execute src/app.js itself, including its real initialization callbacks.
  // Only external SDK completion and nonessential UI rendering are simulated.
  executeApp({
    './controllers/game/game.ctrl': ObservedGame,
    './controllers/menu/menu.ctrl': Menu,
    './platform/cloud-saves': options => { cloudOptions = options; return cloud; },
    './platform/leaderboards': leaderboard,
    './platform/config': { gameId: '11111111-2222-4333-8444-555555555555', boardIds: {} },
    './models/save-state': validateSaveState,
    './utils/dom': dom,
  }, globals);

  const saved = { schemaVersion: 1, game: {
    type: config.GAME.TYPE.COUNTDOWN, difficulty: 4,
    solution: [0, 1, 4, 8], history: [{ points: [2, 5, 6, 7], reveal: false }],
    count: 1, outcome: null, outcomeCount: 0, summaryOpen: false,
    remaining: 27, counter: 0,
  } };
  // The SDK has selected a save but is still awaiting its initial sync PUT.
  await cloudOptions.applyState(saved);
  publish({ status: 'saving', ready: false, enabled: true });
  menu.onStart(config.GAME.TYPE.COUNTDOWN, 4);
  time.tick(15);
  assert.equal(imports, 0, 'Restoration must not build a live scene before initialize resolves');
  assert.equal(starts, 0, 'The menu callback must also enforce the startup gate');
  assert.equal(menu.btnStarlEl.disabled, true);
  assert.equal(game.el.style.display, 'none');
  assert.deepEqual(clone(game.exportState()), { schemaVersion: 1, game: null });
  assert.deepEqual(clone(await cloud.save()), saved, 'SDK exports must retain the whole selected state during the wait');

  publish({ status: 'synced', ready: true, enabled: true });
  assert.equal(imports, 0, 'A status event alone must not bypass the awaited initialization promise');
  finishInitialization(cloudState);
  await settle();
  assert.equal(imports, 1);
  assert.equal(menu.btnStarlEl.disabled, false);
  assert.equal(game.el.style.display, '');
  assert.equal(game.statusBar.countdown.remaining, 27, 'The 15-second network wait must not consume playing time');
  time.tick(3);
  assert.equal(game.statusBar.countdown.remaining, 24);
  assert.equal((await cloud.save()).game.remaining, 24, 'After startup, exports must follow the live scene instead of the staged copy');

  publish({ status: 'offline', ready: true, enabled: true });
  const panel = elements.find(item => item.attributes.class === 'cloud-panel');
  assert.equal(panel.hidden, true, 'A background failure must not reopen the startup panel');
  assert.equal(imports, 1, 'A background failure must not restore the scene again');
});
