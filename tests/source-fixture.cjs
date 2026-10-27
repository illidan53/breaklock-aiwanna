const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Load the original browser modules with explicit dependencies. Only module
// declarations and stylesheet loading are adapted; game logic runs unchanged.
function loadSource(relative, imports = {}, globals = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const namedExports = [];
  const source = readFileSync(filename, 'utf8')
    .replace(/^import\s+(.+?)\s+from\s+(['"])([^'"]+)\2\s*;?/gm, (_, bindings, quote, name) => {
      assert.ok(Object.hasOwn(imports, name), `Missing fixture dependency ${name} in ${relative}`);
      return `const ${bindings} = __imports[${JSON.stringify(name)}];`;
    })
    .replace(/\bexport default\s+/g, 'module.exports.default = ')
    .replace(/\bexport function\s+(\w+)/g, (_, name) => { namedExports.push(name); return `function ${name}`; });
  const module = { exports: {} };
  vm.runInNewContext(source + namedExports.map(name => `\nmodule.exports.${name} = ${name};`).join(''), {
    module, __imports: imports, console,
    require(name) {
      assert.ok(name.endsWith('.scss'), `Unexpected runtime require: ${name}`);
      return {};
    },
    ...globals,
  }, { filename });
  return namedExports.length ? module.exports : module.exports.default;
}

function node() {
  const classes = new Set();
  const listeners = new Map();
  return {
    style: {}, attributes: {}, childNodes: [], textContent: '',
    classList: {
      add: value => classes.add(value), remove: value => classes.delete(value),
      contains: value => classes.has(value),
    },
    setAttribute(key, value) { this.attributes[key] = value; },
    getAttribute(key) { return this.attributes[key]; },
    appendChild(child) { this.childNodes.push(child); child.parent = this; return child; },
    remove() {
      if (this.parent) this.parent.childNodes.splice(this.parent.childNodes.indexOf(this), 1);
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    listeners,
  };
}

const dom = {
  create(tag, attributes, children) {
    const result = node();
    if (typeof attributes === 'object') Object.assign(result.attributes, attributes);
    if (Array.isArray(children)) children.forEach(child => result.appendChild(child));
    else if (typeof children === 'string') result.textContent = children;
    return result;
  },
  icon: () => node(),
};

function clock() {
  let id = 0;
  const intervals = new Map();
  const timeouts = new Map();
  const window = node();
  window.setInterval = callback => { intervals.set(++id, callback); return id; };
  window.clearInterval = key => intervals.delete(key);
  const setTimeout = callback => { timeouts.set(++id, callback); return id; };
  const clearTimeout = key => timeouts.delete(key);
  return {
    window, setTimeout, clearTimeout, intervals, timeouts,
    tick(seconds = 1) {
      for (let i = 0; i < seconds; i++) {
        for (const [key, callback] of [...intervals]) if (intervals.has(key)) callback();
      }
    },
  };
}

module.exports = { loadSource, node, dom, clock };
