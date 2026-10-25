'use strict';
// بارگذاری اسکریپت‌های برنامه در محیط vm نود با شبیه‌سازی window/document/localStorage
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const ASSETS = path.join(__dirname, '..', 'app', 'src', 'main', 'assets');
const FILES = ['migrate-in.js', 'jalali.js', 'validate.js', 'app.js', 'invoice.js', 'statement.js', 'notes.js', 'sync.js', 'update.js'];

function makeEl() {
  return {
    innerHTML: '', textContent: '', value: '', style: {}, children: [],
    classList: { add() { }, remove() { }, contains() { return true; } },
    setAttribute() { }, appendChild(c) { this.children.push(c); }, remove() { }, click() { },
  };
}

function boot(opts = {}) {
  const store = new Map(Object.entries(opts.storage || {}));
  const els = {};
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { if (opts.quota && String(v).length > opts.quota) throw new Error('QuotaExceededError'); store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
    key: i => [...store.keys()][i] || null,
    get length() { return store.size; },
  };
  const document = {
    getElementById: id => els[id] || (els[id] = makeEl()),
    createElement: () => makeEl(),
    addEventListener() { }, querySelector() { return null; },
    body: makeEl(), hidden: false,
  };
  const ctx = {
    console: { log: console.log, warn() { }, error() { } }, localStorage, document, navigator: {},
    setTimeout: () => 0, clearTimeout() { },
    URL: { createObjectURL: () => '' }, Blob: function () { }, FileReader: function () { }, Image: function () { },
    Android: opts.android, addEventListener() { },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ASSETS, f), 'utf8'), ctx, { filename: f });
  const run = code => vm.runInContext(code, ctx);
  return { ctx, store, els, run };
}
module.exports = { boot, ASSETS };
