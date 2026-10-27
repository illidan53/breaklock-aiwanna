const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../src/utils/pluralize.js'), 'utf8')
  .replace('export const pluralize =', 'module.exports =');
function pluralizeFor(lang) {
  const module = { exports: {} };
  vm.runInNewContext(source, { module, document: { documentElement: { lang } } });
  return module.exports;
}

test('English and Spanish attempt labels use singular only for one attempt', () => {
  for (const [lang, word, singular, plural] of [
    ['en', 'attempt. | attempts.', 'attempt.', 'attempts.'],
    ['es', 'intento. | intentos.', 'intento.', 'intentos.']
  ]) {
    const pluralize = pluralizeFor(lang);
    assert.equal(pluralize(word, 1), singular);
    for (const count of [0, 2, 10, 21]) assert.equal(pluralize(word, count), plural);
  }
});

test('Russian rules and languages without variants retain their existing behavior', () => {
  const ru = pluralizeFor('ru');
  assert.equal(ru('нет попыток | попытка | попытки | попыток', 1), 'попытка');
  assert.equal(ru('нет попыток | попытка | попытки | попыток', 2), 'попытки');
  assert.equal(ru('нет попыток | попытка | попытки | попыток', 11), 'попыток');
  assert.equal(pluralizeFor('zh')('次尝试。', 1), '次尝试。');
  assert.equal(pluralizeFor('ja')('回で成功。', 2), '回で成功。');
});
