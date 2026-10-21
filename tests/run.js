'use strict';
// اجرای آزمون‌ها:  node tests/run.js
// بدون وابستگی؛ اسکریپت‌های برنامه در vm با شبیه‌ساز window/document/localStorage بارگذاری می‌شوند.
const assert = require('assert');
const { boot } = require('./harness');
const { bigDataset } = require('./dataset');
const { REF_AGG } = require('./reference');

const results = [];
// مقایسه با JSON تا آرایه‌های داخل vm (realm دیگر) هم درست مقایسه شوند
const eq = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);
function test(name, fn) {
  try { fn(); results.push([true, name]); }
  catch (e) { results.push([false, name, e]); }
}
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// ---------- اعتبارسنجی فایل پشتیبان ----------
test('import: malicious id strings are dropped or coerced', () => {
  const t = boot();
  const r = t.run(`(() => {
    const bad = { v: 1, cats: [{ id: '1);alert(1)//', name: 'x' }, { id: '7', name: 'ok' }, { id: -3, name: 'neg' }, { id: 1.5, name: 'frac' }],
      projects: [{ id: 9, catId: '7', name: '<img src=x onerror=alert(1)>', type: "mat' onclick='x" }],
      tx: [{ id: 10, type: 'wpay"><script>', amount: 5, workerId: 'abc' }],
      att: { '1|1405/07/10': { p: 9, s: 'p" onclick="x', w: 1 }, 'x|y': { p: 9, s: 'p', w: 1 } } };
    const o = parseBackup(JSON.stringify(bad)); applyBackup(o);
    render(); // نباید خطا بدهد
    return { cats: DB.cats.map(c => c.id), proj: DB.projects[0], tx: DB.tx[0], att: Object.keys(DB.att).length, dropped: o.dropped };
  })()`);
  eq(r.cats, [7]);
  assert.strictEqual(r.proj.catId, 7);
  assert.strictEqual(r.proj.type, 'mat');
  assert.strictEqual(r.tx.type, 'in');
  assert.strictEqual(r.tx.workerId, null);
  assert.strictEqual(r.att, 0);
  assert.ok(r.dropped >= 5);
  for (const id of r.cats) assert.ok(Number.isInteger(id) && id > 0);
});

test('import: cats:[null] does not brick the app', () => {
  const t = boot();
  t.run(`applyBackup(parseBackup('{"v":1,"projects":[],"cats":[null]}'))`);
  assert.strictEqual(t.run('DB.cats.length'), 0);
  t.run('render()');
  assert.ok(!t.els.main.innerHTML.includes('خطا روبه‌رو'), 'home renders without the error screen');
  // و دوباره اجرا شدن برنامه با همین داده
  const t2 = boot({ storage: { contractor_db_v1: t.store.get('contractor_db_v1') } });
  assert.ok(t2.els.hdr.innerHTML.includes('راوانو'));
});

test('import: wrong types and non-backups are rejected or cleaned', () => {
  const t = boot();
  assert.throws(() => t.run(`parseBackup('[1,2,3]')`));
  assert.throws(() => t.run(`parseBackup('{"v":1,"hello":1}')`));
  assert.throws(() => t.run(`parseBackup('not json')`));
  const r = t.run(`(() => { const o = parseBackup(JSON.stringify({ v: 1, cats: 'x', projects: {}, workers: [1, 'a', null, { id: 3, first: 5, wage: 'zz', active: 'yes' }], invoices: [{ id: 4, items: 'no', pays: [{ id: 5, amount: 'NaN' }] }] }));
    return o.db; })()`);
  eq(r.cats, []);
  eq(r.projects, []);
  assert.strictEqual(r.workers.length, 1);
  assert.strictEqual(r.workers[0].first, '5');
  assert.strictEqual(r.workers[0].wage, 0);
  assert.strictEqual(r.workers[0].active, false);
  eq(r.invoices[0].items, []);
  assert.strictEqual(r.invoices[0].pays[0].amount, 0);
});

test('import: missing seq is rebuilt above every id (nested too)', () => {
  const t = boot();
  const seq = t.run(`fix({ v: 1, cats: [{ id: 40, name: 'a' }], invoices: [{ id: 50, items: [{ id: 77, qty: 1, price: 1 }], pays: [] }] }).seq`);
  assert.ok(seq > 77, 'seq=' + seq);
  const seq2 = t.run(`fix({ v: 1, seq: 5, statements: [{ id: 6, projectId: 1, items: [{ id: 300 }] }] }).seq`);
  assert.ok(seq2 > 300);
});

test('missing meters / numbers never produce NaN totals', () => {
  const t = boot();
  const r = t.run(`(() => { DB = fix({ v: 1, cats: [{ id: 1, name: 'c' }], projects: [{ id: 2, catId: 1, name: 'p', type: 'mat', area: 100, price: 1000 }],
      progress: [{ id: 3, projectId: 2, date: '1405/01/02' }, { id: 4, projectId: 2, date: '1405/01/03', meters: 10 }],
      tx: [{ id: 5, type: 'extra', projectId: 2, date: '1405/01/02' }] }); save();
    const a = agg(ALL, null); return [a.meters, a.revenue, a.net, V.home().html.includes('NaN')]; })()`);
  eq(r.slice(0, 3), [10, 10000, 10000]);
  assert.strictEqual(r[3], false);
});

test('corrupt stored data is kept and never overwritten', () => {
  const t = boot({ storage: { contractor_db_v1: '{broken json' } });
  assert.ok(t.run('!!DB_CORRUPT'));
  const keys = [...t.store.keys()];
  assert.ok(keys.some(k => k.startsWith('db_corrupt_')), 'recovery copy exists');
  t.run('DB.cats.push({ id: 1, name: "x" }); save(); render()');
  assert.strictEqual(t.store.get('contractor_db_v1'), '{broken json');
  assert.ok(t.els.hdr.innerHTML.includes('قابل خواندن نیست'));
});

test('failed save shows a persistent warning', () => {
  const t = boot({ quota: 100 });
  t.run('DB.cats.push({ id: 1, name: "x".repeat(200) }); save()');
  assert.strictEqual(t.run('SAVE_FAILED'), true);
  assert.ok(t.els.savewarn.innerHTML.includes('ذخیره نشد'));
});

test('render error shows the recovery screen instead of crashing', () => {
  const t = boot();
  t.run('V.home = () => { throw new Error("boom"); }; render()');
  assert.ok(t.els.main.innerHTML.includes('بازیابی از فایل پشتیبان'));
});

// ---------- مبالغ و اعداد ----------
test('invoice: 3.3 x 1001 paid in full -> paid, balance 0', () => {
  const t = boot();
  const r = t.run(`(() => {
    const inv = { id: 1, no: 1, kind: 'inv', customer: { name: 'a' }, items: [{ id: 2, qty: 3.3, price: 1001, disc: 0 }], pays: [], discount: 0, taxOn: false, taxRate: 0 };
    DB.invoices.push(inv); save();
    const c0 = invCalc(inv);
    inv.pays.push({ id: 3, amount: c0.payable, method: 'cash' }); save();
    const c = invCalc(inv);
    const other = { id: 4, no: 2, kind: 'inv', customer: { name: 'a' }, items: [], pays: [] };
    return { payable: c0.payable, status: c.status, remain: c.remain, bal: custBalance(other).s };
  })()`);
  assert.strictEqual(r.payable, 3303);
  assert.strictEqual(r.status, 'paid');
  assert.strictEqual(r.remain, 0);
  assert.strictEqual(r.bal, 0);
});

test('rounding is symmetric for negatives', () => {
  const t = boot();
  const r = t.run(`(() => {
    DB.inv.roundTo = 1000; save();
    const n = invCalcRaw({ kind: 'inv', items: [{ qty: 1, price: -1500 }], pays: [], discount: 0 });
    const p = invCalcRaw({ kind: 'inv', items: [{ qty: 1, price: 1500 }], pays: [], discount: 0 });
    return [n.payable, p.payable, rnd(-1.5), rnd(1.5), rnd(-2.5), rnd(2.5)];
  })()`);
  eq(r, [-1000, 1000, -2, 2, -3, 3]);
});

test('fmtMoney keeps decimals instead of multiplying by 10', () => {
  const t = boot();
  const r = t.run(`(() => { const a = { value: '12.5' }, b = { value: '۱۲٫۵' }, c = { value: '1234567' }; fmtMoney(a); fmtMoney(b); fmtMoney(c);
    return [a.value, b.value, c.value, rnd(num(a.value)), rnd(num(b.value)), num('۱۲٫۵')]; })()`);
  eq(r, ['12.5', '12.5', '1,234,567', 13, 13, 12.5]);
});

test('money(-0.4) shows ۰ not −۰', () => {
  const t = boot();
  const r = t.run(`[money(-0.4), money(-0.4, 1), short(-400), faNum(-0.001), fm(-0.2)]`);
  for (const s of r) { assert.ok(s.includes('۰'), s); assert.ok(!/[-−]/.test(s.replace(/class="[^"]*"/, '')), s); }
  assert.ok(t.run('money(-5000, 1)').includes('neg'));
});

// ---------- پشتیبان ----------
test('export -> import round trip is lossless (including logo/stamp)', () => {
  const src = bigDatasetSmall();
  const t = boot({ storage: { contractor_db_v1: JSON.stringify(src), rawano_logo: PNG, rawano_stamp: PNG } });
  let exported = null;
  t.ctx.Android = { saveFile: (n, c) => { exported = c; return 'ok:x'; } };
  t.run('exportData()');
  assert.ok(exported);
  const t2 = boot();
  t2.run(`applyBackup(parseBackup(${JSON.stringify(exported)}))`);
  assert.strictEqual(t2.run('JSON.stringify(DB)'), t.run('JSON.stringify(DB)'));
  assert.strictEqual(t2.store.get('rawano_logo'), PNG);
  assert.strictEqual(t2.store.get('rawano_stamp'), PNG);
});

test('old data with logo inside the database is migrated to its own key', () => {
  const t = boot({ storage: { contractor_db_v1: JSON.stringify({ v: 1, seq: 2, inv: { logo: PNG, biz: 'x' } }) } });
  assert.strictEqual(t.store.get('rawano_logo'), PNG);
  assert.ok(!t.store.get('contractor_db_v1').includes('base64'));
  assert.strictEqual(t.run("S('biz')"), 'x');
});

test('double tap on save runs the form only once', () => {
  const t = boot();
  t.run('formFields = [{ k: "name", label: "x" }]; formCb = () => { window.calls = (window.calls || 0) + 1; }; document.getElementById("f_name").value = "a"; submitForm(); submitForm();');
  assert.strictEqual(t.run('window.calls'), 1);
});

// ---------- کارایی ----------
const big = (() => { const t = boot(); return JSON.stringify(bigDataset(t.run('J'))); })();
function bigDatasetSmall() { const t = boot(); const d = bigDataset(t.run('J')); for (const k of ['progress', 'tx', 'invoices', 'notes', 'cheques', 'adj']) d[k] = d[k].slice(0, 200); const att = {}; Object.keys(d.att).slice(0, 2000).forEach(k => { att[k] = d.att[k]; }); d.att = att; return d; }

test('fast agg() equals the reference implementation on the big dataset', () => {
  const t = boot(); t.ctx.__json = big;
  t.run('DB = fix(JSON.parse(__json)); save(); window.refAgg = ' + REF_AGG);
  const ok = t.run(`(() => { const close = (a, b) => Object.keys(a).every(k => Math.abs(a[k] - b[k]) <= 1e-6 * Math.max(1, Math.abs(b[k])));
    const cases = [[ALL, null], [d => d.startsWith('1404/03/'), null], [d => d === '1404/05/10', null], [ALL, new Set([DB.projects[0].id])], [d => d.startsWith('1405/'), new Set(DB.projects.slice(0, 20).map(p => p.id))]];
    return cases.map(([p, s]) => close(agg(p, s), refAgg(p, s))); })()`);
  eq(ok, [true, true, true, true, true]);
});

const PERF_BUDGET_MS = Number(process.env.PERF_BUDGET_MS || 400); // vm نود از مرورگر کندتر است
const perfTimes = {};
test(`main screens prepare within ${PERF_BUDGET_MS} ms on the big dataset`, () => {
  const t = boot(); t.ctx.__json = big;
  t.run('DB = fix(JSON.parse(__json)); save(); idx();');
  const views = { home: 'V.home()', chart: 'V.chart({})', workers: 'V.workers()', installers: 'V.installers()', contractors: 'V.contractors()', notes: 'V.notes({})', cheques: "V.notes({m:'cheques'})", invoices: 'V.invoices({})', projectAccounts: "V.invoices({f:'proj'})", category: 'V.cat({id:DB.cats[0].id})', project: 'V.project({id:DB.projects[0].id})', worker: 'V.worker({id:DB.workers[0].id})', attendance: 'V.attendance({})', sortNotes: 'sortNotes(DB.notes.slice())' };
  for (const [k, c] of Object.entries(views)) {
    t.run(c); // گرم کردن
    const t0 = process.hrtime.bigint(); t.run(c); perfTimes[k] = Number(process.hrtime.bigint() - t0) / 1e6;
  }
  const t0 = process.hrtime.bigint(); t.run('invalidate(); idx();'); perfTimes['index build'] = Number(process.hrtime.bigint() - t0) / 1e6;
  const slow = Object.entries(perfTimes).filter(([, ms]) => ms > PERF_BUDGET_MS);
  eq(slow, []);
});

// ---------- گزارش ----------
let failed = 0;
for (const [ok, name, err] of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) { failed++; console.log('      ' + (err && err.stack || err).toString().split('\n').slice(0, 4).join('\n      ')); }
}
console.log('\nPerformance (ms, Node vm):');
for (const [k, ms] of Object.entries(perfTimes)) console.log(`  ${k.padEnd(16)} ${ms.toFixed(1)}`);
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
