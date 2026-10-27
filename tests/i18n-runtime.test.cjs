const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');

const source = babel.transformSync(fs.readFileSync(require.resolve('../src/platform/i18n.js'), 'utf8'), {
  configFile: false, babelrc: false, presets: [['@babel/preset-env', { targets: { node: 'current' }, modules: 'commonjs' }]],
}).code;

function fixture(query = '', pageLanguage = 'zh') {
  const exports = {};
  vm.runInNewContext(source, { exports, URL, AbortController, setTimeout, clearTimeout, Set, Object, Promise });
  const elements = [{ key: 'title', textContent: 'Local title', getAttribute() { return this.key; } }];
  const meta = { value: 'Local description', getAttribute(name) { return name === 'data-i18n-content' ? 'description' : this.value; }, setAttribute(name, value) { assert.equal(name, 'content'); this.value = value; } };
  const documentRef = { documentElement: { lang: pageLanguage }, querySelectorAll(selector) { return selector === '[data-i18n]' ? elements : [meta]; } };
  const host = { location: { href: 'https://game.example/fr/' + query } };
  return { ...exports, host, documentRef, elements, meta };
}

test('an unconfigured game makes no platform request and installs the local fallback bridge', async () => {
  const f = fixture(); let requests = 0;
  const i18n = f.createI18n({ gameSlug: null, keys: ['title'], host: f.host, documentRef: f.documentRef, fetchImpl: () => { requests++; } });
  const result = await i18n.initialize();
  assert.equal(result.source, 'local'); assert.equal(requests, 0);
  assert.equal(f.host.__breaklockText('title', 'Local'), 'Local');
});

test('query language wins and public dictionaries use no credentials; remote content remains text', async () => {
  const f = fixture('?lang=ja&session=abc', 'fr'); let request;
  const i18n = f.createI18n({ gameSlug: 'breaklock-abc', keys: ['title', 'description'], host: f.host, documentRef: f.documentRef,
    fetchImpl: async (url, options) => { request = { url, options }; return { ok: true, text: async () => JSON.stringify({ title: '<img src=x onerror=alert(1)>', description: 'He said "go".\n次の行', unknown: 'Do not use', object: { bad: true } }) }; } });
  assert.equal((await i18n.initialize()).source, 'platform');
  assert.equal(request.url, 'https://www.aiwanna.games/i18n/breaklock-abc/ja.json');
  assert.equal(request.options.credentials, 'omit'); assert.equal(request.options.method, 'GET');
  assert.equal(f.elements[0].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(f.meta.value, 'He said "go".\n次の行');
  assert.equal(i18n.text('unknown', 'Fallback'), 'Fallback');
  assert.equal(i18n.text('missing', 'Fallback'), 'Fallback');
});

test('invalid values and changed placeholders fall back per key', async () => {
  const f = fixture();
  const i18n = f.createI18n({ gameSlug: 'breaklock', keys: ['title', 'attempts', 'count', 'wrong'], host: f.host, documentRef: f.documentRef,
    fetchImpl: async () => ({ ok: true, text: async () => JSON.stringify({ title: 17, attempts: 'Intentos: {0}', count: 'Wrong {1}', wrong: 'No placeholders' }) }) });
  await i18n.initialize();
  assert.equal(i18n.text('title', 'Local title'), 'Local title');
  assert.equal(i18n.text('attempts', '{0} attempts'), 'Intentos: {0}');
  assert.equal(i18n.text('count', '{0} attempts'), '{0} attempts');
  assert.equal(i18n.text('wrong', 'Hello {name}'), 'Hello {name}');
});

test('network failure, malformed dictionaries and timeout keep local play available', async () => {
  for (const fetchImpl of [
    async () => { throw new Error('offline'); },
    async () => ({ ok: false }),
    async () => ({ ok: true, text: async () => 'not json' }),
    async () => ({ ok: true, text: async () => '[]' }),
    () => new Promise(() => {}),
  ]) {
    const f = fixture();
    const i18n = f.createI18n({ gameSlug: 'breaklock', keys: ['title'], host: f.host, documentRef: f.documentRef, fetchImpl, timeoutMs: 10 });
    assert.equal((await i18n.initialize()).source, 'local');
    assert.equal(i18n.text('title', 'Local'), 'Local');
  }
});

test('unsupported locale falls back to English; invalid slug/origin never send a request', async () => {
  const f = fixture('?lang=unknown', 'fr');
  assert.equal(f.selectedLanguage(f.host.location.href, 'fr'), 'en');
  assert.equal(f.normalizeLanguage('zh-Hant'), 'zh-tw');
  assert.equal(f.normalizeLanguage('pt-BR'), 'pt_br');
  for (const configuration of [{ gameSlug: '../private' }, { gameSlug: 'breaklock', platformOrigin: 'https://unexpected.example' }]) {
    let called = false;
    const i18n = f.createI18n({ ...configuration, host: f.host, documentRef: f.documentRef, fetchImpl: () => { called = true; } });
    assert.equal((await i18n.initialize()).source, 'local'); assert.equal(called, false);
  }
});
