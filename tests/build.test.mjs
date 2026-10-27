import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { getL10nData, localizeJavaScript, playerDictionary, replaceTokens } from '../src/build/i18n.mjs';

const dictionaries = await getL10nData();
const router = (await readFile(new URL('../src/build/language-router.js', import.meta.url), 'utf8'))
  .replace('__SUPPORTED_LANGUAGES__', JSON.stringify(dictionaries.map(locale => locale.code)));

function route(href, language = 'zh', baseURI = 'https://game.example/') {
  const redirects = [];
  runInNewContext(router, {
    URL,
    window: { location: { href, replace: value => redirects.push(value) } },
    document: { baseURI, documentElement: { lang: language } },
  });
  return redirects;
}

test('platform language query wins over a localized path and keeps other query values', () => {
  assert.deepEqual(route('https://game.example/fr/?lang=ja&session=hello#play', 'fr'),
    ['https://game.example/ja/?lang=ja&session=hello#play']);
  assert.deepEqual(route('https://game.example/?lang=es'), ['https://game.example/es/?lang=es']);
  assert.deepEqual(route('https://game.example/ko/?lang=ko', 'ko'), []);
});

test('root stays in Chinese, direct locale paths stay selected, and unknown query languages use English', () => {
  assert.deepEqual(route('https://game.example/'), []);
  assert.deepEqual(route('https://game.example/fr/', 'fr'), []);
  assert.deepEqual(route('https://game.example/?lang=unsupported'), ['https://game.example/en/?lang=unsupported']);
  assert.deepEqual(route('https://game.example/en/?lang=unsupported', 'en'), []);
  assert.deepEqual(route('https://game.example/?lang='), ['https://game.example/en/?lang=']);
});

test('regional language aliases and a nested deployment root resolve without redirect loops', () => {
  assert.deepEqual(route('https://game.example/?lang=en-US'), ['https://game.example/en/?lang=en-US']);
  assert.deepEqual(route('https://game.example/?lang=zh-Hant'), ['https://game.example/zh-tw/?lang=zh-Hant']);
  assert.deepEqual(route('https://game.example/?lang=pt-BR'), ['https://game.example/pt_br/?lang=pt-BR']);
  assert.deepEqual(route('https://game.example/games/lock/?lang=ko', 'zh', 'https://game.example/games/lock/'),
    ['https://game.example/games/lock/ko/?lang=ko']);
});

test('translated JavaScript remains valid with quotes, backslashes, template syntax and newlines', () => {
  const text = 'Both "quotes" and \'quotes\', `ticks`, ${notCode}, \\paths\nnew line';
  const code = localizeJavaScript('result = ["#@text", \'#@text\', `#@text${2}`]', { text });
  const scope = {};
  runInNewContext(code, scope);
  assert.deepEqual(Array.from(scope.result), [text, text, text + '2']);
  assert.throws(() => replaceTokens('#@missing', {}), /Missing translation: missing/);
});

test('player dictionaries exclude markup and legacy quote escapes while retaining all original languages', () => {
  for (const code of ['zh', 'en', 'ja', 'ko', 'es', 'zh-tw', 'fa', 'fr', 'ru', 'pt_br', 'it']) {
    assert.ok(dictionaries.some(locale => locale.code === code), `Missing ${code}`);
  }
  const english = dictionaries.find(locale => locale.code === 'en').data;
  assert.equal(english.feedback_fail, "Sorry, you didn't make it this time.");
  const exported = playerDictionary(english);
  for (const key of ['lang_code', 'special_css', 'airport_charlist', 'attribution']) assert.equal(key in exported, false);
  assert.equal(exported.button_start, english.button_start);
});

test('compiled runtime text keeps local fallbacks and leaves non-player tokens static', () => {
  const dict = { name_app: 'Local "title"', button_start: 'Start', airport_charlist: 'abc\\def', lang_code: 'zh' };
  const code = localizeJavaScript('result = ["#@name_app", "#@airport_charlist", "#@lang_code/app.js", `#@button_start ${2}`]', dict, { runtime: true });
  const calls = [];
  const scope = { window: { __breaklockText: (key, fallback) => { calls.push([key, fallback]); return key === 'name_app' ? 'Remote "title"' : fallback; } } };
  runInNewContext(code, scope);
  assert.deepEqual(Array.from(scope.result), ['Remote "title"', 'abc\\def', 'zh/app.js', 'Start 2']);
  assert.deepEqual(calls, [['name_app', 'Local "title"'], ['button_start', 'Start']]);
});
