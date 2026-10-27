import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { transformSync, types as t } from '@babel/core';
import YAML from 'yaml';
import { rootFolder } from './paths.mjs';

const tokenPattern = /#@[a-z_0-9]+/g;
const nonPlayerKeys = new Set(['lang_code', 'special_css', 'airport_charlist', 'attribution']);
const escapeHtml = value => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

export function replaceTokens(input, dict, transform = value => value) {
  return input.replace(tokenPattern, token => {
    const key = token.slice(2);
    if (typeof dict[key] !== 'string') throw new Error(`Missing translation: ${key}`);
    return transform(dict[key], key);
  });
}

export async function getL10nData() {
  const folder = join(rootFolder, 'src', 'l10n');
  const files = (await readdir(folder)).filter(file => /^[a-z][a-z_-]+\.yml$/.test(file)).sort();
  return Promise.all(files.map(async file => {
    const data = YAML.parse(await readFile(join(folder, file), 'utf8'));
    for (const [key, value] of Object.entries(data)) {
      if (typeof value !== 'string') throw new Error(`${file}: ${key} must contain text`);
      // Upstream dictionaries escaped quotes for direct JavaScript insertion.
      // Values are now serialized safely, so remove only those legacy escapes.
      data[key] = value.replace(/\\(['"\\])/g, '$1');
    }
    return { code: file.slice(0, -4), data };
  }));
}

export function localizeJavaScript(input, dict, { runtime = false } = {}) {
  const templateRaw = value => value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  const chunks = value => value.split(/(#@[a-z_0-9]+)/g).filter(Boolean);
  function tokenExpression(token) {
    const key = token.slice(2);
    if (typeof dict[key] !== 'string') throw new Error(`Missing translation: ${key}`);
    return runtime && !nonPlayerKeys.has(key)
      ? t.callExpression(t.memberExpression(t.identifier('window'), t.identifier('__breaklockText')), [t.stringLiteral(key), t.stringLiteral(dict[key])])
      : t.stringLiteral(dict[key]);
  }
  return transformSync(input, {
    configFile: false, babelrc: false, comments: true, compact: true,
    plugins: [() => ({ visitor: {
      StringLiteral(path) {
        if (!runtime) {
          path.node.value = replaceTokens(path.node.value, dict);
          delete path.node.extra;
          return;
        }
        if (!/#@[a-z_0-9]+/.test(path.node.value)) return;
        const parts = chunks(path.node.value).map(value => value.startsWith('#@') ? tokenExpression(value) : t.stringLiteral(value));
        path.replaceWith(parts.reduce((left, right) => t.binaryExpression('+', left, right)));
        path.skip();
      },
      TemplateLiteral: { exit(path) {
        if (!runtime) {
          for (const quasi of path.node.quasis) {
            const value = replaceTokens(quasi.value.cooked ?? quasi.value.raw, dict);
            quasi.value = { cooked: value, raw: templateRaw(value) };
          }
          return;
        }
        if (!path.node.quasis.some(quasi => /#@[a-z_0-9]+/.test(quasi.value.cooked ?? quasi.value.raw))) return;
        const quasis = [], expressions = [];
        let buffer = '';
        function appendExpression(expression) {
          quasis.push(t.templateElement({ cooked: buffer, raw: templateRaw(buffer) }, false));
          expressions.push(expression);
          buffer = '';
        }
        path.node.quasis.forEach((quasi, index) => {
          for (const chunk of chunks(quasi.value.cooked ?? quasi.value.raw)) {
            if (!chunk.startsWith('#@')) buffer += chunk;
            else {
              const expression = tokenExpression(chunk);
              if (t.isStringLiteral(expression)) buffer += expression.value;
              else appendExpression(expression);
            }
          }
          if (index < path.node.expressions.length) appendExpression(path.node.expressions[index]);
        });
        quasis.push(t.templateElement({ cooked: buffer, raw: templateRaw(buffer) }, true));
        path.replaceWith(t.templateLiteral(quasis, expressions));
        path.skip();
      } },
    } })],
  }).code;
}

export function playerDictionary(dict) {
  return Object.fromEntries(Object.entries(dict).filter(([key]) => !nonPlayerKeys.has(key)));
}

export async function applyI18n(from, to, dict) {
  const input = await readFile(from, 'utf8');
  let output;
  if (extname(from) === '.js') output = localizeJavaScript(input, dict, { runtime: true });
  else if (extname(from) === '.json') {
    const replace = value => typeof value === 'string' ? replaceTokens(value, dict)
      : Array.isArray(value) ? value.map(replace)
        : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replace(child)])) : value;
    output = JSON.stringify(replace(JSON.parse(input)), null, 2);
  } else output = replaceTokens(input, dict, (value, key) => ['attribution', 'special_css'].includes(key) ? value : escapeHtml(value));
  await writeFile(to, output);
}
