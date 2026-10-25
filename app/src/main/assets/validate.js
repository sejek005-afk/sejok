'use strict';
// ===================== اعتبارسنجی و پاک‌سازی داده =====================
// هر داده‌ای که از حافظه یا فایل پشتیبان خوانده می‌شود از این‌جا عبور می‌کند تا
// شناسه‌ها عدد صحیح مثبت، مقادیر عددی متناهی، فیلدهای انتخابی از فهرست مجاز و
// متن‌ها رشته باشند. ورودی‌های خراب حذف می‌شوند و برنامه از کار نمی‌افتد.
(function (g) {
  const DATE_RE = /^(\d{4})\/(\d{2})\/(\d{2})$/;
  const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
  const IMG_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
  const MAX_STR = 20000;

  function today() {
    const d = new Date();
    const r = J.d2j(J.g2d(d.getFullYear(), d.getMonth() + 1, d.getDate()));
    return `${r.jy}/${String(r.jm).padStart(2, '0')}/${String(r.jd).padStart(2, '0')}`;
  }
  function validDate(s) {
    if (typeof s !== 'string') return false;
    const m = DATE_RE.exec(s); if (!m) return false;
    const y = +m[1], mo = +m[2], d = +m[3];
    return y >= 1300 && y <= 1500 && mo >= 1 && mo <= 12 && d >= 1 && d <= J.monthLen(y, mo);
  }
  function posInt(x) {
    if (typeof x === 'string' && /^\d+$/.test(x)) x = +x;
    return (typeof x === 'number' && Number.isSafeInteger(x) && x > 0) ? x : null;
  }
  const T = {
    id: x => posInt(x),
    ref: x => posInt(x),
    refN: x => posInt(x),
    num: x => { const n = typeof x === 'string' && x.trim() !== '' ? Number(x) : x; return (typeof n === 'number' && isFinite(n)) ? n : 0; },
    int: x => { const n = T.num(x); return Math.trunc(n); },
    intN: x => (x === null || x === undefined || x === '') ? null : (isFinite(Number(x)) ? Math.trunc(Number(x)) : null),
    str: x => (typeof x === 'string' ? x : (typeof x === 'number' && isFinite(x)) ? String(x) : '').slice(0, MAX_STR),
    bool: x => x === true || x === 1 || x === '1' || x === 'true',
    date: x => validDate(x) ? x : today(),
    dateOpt: x => validDate(x) ? x : '',
    time: x => (typeof x === 'string' && TIME_RE.test(x)) ? x : '',
    img: x => (typeof x === 'string' && (x === 'none' || IMG_RE.test(x))) ? x : '',
  };
  const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);

  // فیلدهای اجباری مرجع: اگر نامعتبر باشند کل ردیف حذف می‌شود
  const REQUIRED = new Set(['id', 'ref']);

  const ITEM = { id: 'id', title: 'str', desc: 'str', unit: 'str', qty: 'num', price: 'num', disc: 'num' };
  const PAY = { id: 'id', date: 'date', amount: 'num', method: ['cash', 'card', 'cheque'], note: 'str', chequeId: 'refN' };
  const SITEM = { id: 'id', title: 'str', desc: 'str', unit: 'str', price: 'num', qty: 'num', auto: 'bool' };
  const SCHEMA = {
    cats: { id: 'id', name: 'str' },
    projects: { id: 'id', catId: 'ref', name: 'str', address: 'str', type: ['mat', 'labor', 'contract'], area: 'num', price: 'num', laborPrice: 'num', contract: 'num', material: 'num', created: 'dateOpt' },
    workers: { id: 'id', first: 'str', last: 'str', address: 'str', phone: 'str', wage: 'num', projectId: 'refN', active: 'bool', fillFrom: 'intN' },
    installers: { id: 'id', first: 'str', last: 'str', address: 'str', phone: 'str', rate: 'num' },
    contractors: { id: 'id', first: 'str', last: 'str', phone: 'str' },
    progress: { id: 'id', projectId: 'ref', date: 'date', meters: 'num', installerId: 'refN', instMeters: 'num', instRate: 'num', note: 'str' },
    tx: { id: 'id', type: ['in', 'wpay', 'ipay', 'extra', 'misc'], sub: ['', 'advance', 'settle'], amount: 'num', date: 'date', note: 'str', workerId: 'refN', installerId: 'refN', projectId: 'refN', contractorId: 'refN' },
    adj: { id: 'id', who: ['w', 'i'], pid: 'ref', type: ['bonus', 'fine'], amount: 'num', date: 'date', projectId: 'refN', note: 'str' },
    notes: { id: 'id', title: 'str', text: 'str', tag: ['normal', 'important', 'urgent'], lt: ['', 'project', 'worker', 'installer'], lid: 'refN', alarm: 'bool', date: 'dateOpt', time: 'time', done: 'bool', created: 'num' },
    cheques: { id: 'id', dir: ['in', 'out'], cur: ['تومان', 'ریال'], amount: 'num', due: 'date', party: 'str', no: 'str', bank: 'str', note: 'str', status: ['pending', 'cleared', 'bounced'], alarm: 'bool', before: 'int', time: 'time', invoiceId: 'refN', payId: 'refN', created: 'num' },
    invoices: { id: 'id', no: 'int', kind: ['inv', 'pre'], title: 'str', date: 'date', due: 'str', customer: { obj: { name: 'str', address: 'str', phone: 'str', nid: 'str' } }, projectId: 'refN', items: { arr: ITEM }, discount: 'num', taxOn: 'bool', taxRate: 'num', pays: { arr: PAY }, note: 'str', stmtId: 'refN', cash: 'num', cheque: 'num', chequeNote: 'str' },
    statements: { id: 'id', projectId: 'ref', no: 'int', date: 'date', from: 'date', to: 'date', ret: 'num', items: { arr: SITEM }, note: 'str', invoiceId: 'refN', created: 'num' },
  };
  const SETTINGS = {
    biz: 'str', slogan: 'str', bizPhone: 'str', bizAddress: 'str', card: 'str', sheba: 'str', bank: 'str', holder: 'str',
    footer: 'str', terms: 'str', defTitle: 'str', currency: ['تومان', 'ریال'], taxRate: 'num', roundTo: 'num',
    sign: ['1', '0'], showBal: ['1', '0'], nextNo: 'int', logo: 'img', stamp: 'img',
  };

  let maxId = 0, dropped = 0;

  function cleanObj(src, schema) {
    if (!isObj(src)) { dropped++; return null; }
    const out = {};
    for (const k in schema) {
      const t = schema[k];
      const v = src[k];
      if (Array.isArray(t)) { out[k] = t.includes(v) ? v : (v === null && t.includes('') ? '' : t[0]); continue; }
      if (isObj(t)) {
        if (t.arr) out[k] = cleanArr(v, t.arr);
        else if (t.obj) out[k] = cleanObj(isObj(v) ? v : {}, t.obj) || {};
        continue;
      }
      const r = T[t](v);
      if (REQUIRED.has(t) && r === null) { dropped++; return null; }
      if (t === 'id') maxId = Math.max(maxId, r);
      out[k] = r;
    }
    return out;
  }
  function cleanArr(arr, schema) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (const x of arr) { const c = cleanObj(x, schema); if (c) out.push(c); }
    return out;
  }
  function cleanAtt(att) {
    const out = {};
    if (!isObj(att)) return out;
    for (const k in att) {
      const m = /^(\d+)\|(\d{4}\/\d{2}\/\d{2})$/.exec(k);
      const a = att[k];
      if (!m || !posInt(m[1]) || !validDate(m[2]) || !isObj(a) || !['p', 'h', 'a'].includes(a.s)) { dropped++; continue; }
      out[k] = { p: posInt(a.p), s: a.s, w: T.num(a.w) };
    }
    return out;
  }
  function cleanSettings(s) {
    const out = {};
    if (!isObj(s)) return out;
    for (const k in SETTINGS) {
      if (s[k] === undefined || s[k] === null) continue;
      const t = SETTINGS[k];
      out[k] = Array.isArray(t) ? (t.includes(String(s[k])) ? String(s[k]) : t[0]) : T[t](s[k]);
    }
    return out;
  }

  /** داده خام را پاک‌سازی می‌کند. خروجی: { db, dropped } — اگر ورودی اصلاً قابل استفاده نباشد خطا می‌دهد. */
  function sanitizeDB(raw) {
    if (!isObj(raw)) throw new Error('not-an-object');
    maxId = 0; dropped = 0;
    const d = { v: 1 };
    for (const k in SCHEMA) d[k] = cleanArr(raw[k], SCHEMA[k]);
    // یادداشت‌ها: مقدار خالی نوع ارتباط در برنامه null است
    for (const n of d.notes) if (n.lt === '') { n.lt = null; n.lid = null; }
    d.att = cleanAtt(raw.att);
    d.inv = cleanSettings(raw.inv);
    // فایل پشتیبان جدید: لوگو و مهر در _assets
    if (isObj(raw._assets)) for (const k of ['logo', 'stamp']) { const v = T.img(raw._assets[k]); if (v) d.inv[k] = v; }
    const seq = posInt(raw.seq) || 1;
    d.seq = Math.max(seq, maxId + 1);
    // تبدیل قالب قدیمی پرداخت فاکتور (cash/cheque) به فهرست دریافت‌ها
    for (const inv of d.invoices) {
      if (inv.cash > 0) inv.pays.push({ id: d.seq++, date: inv.date, amount: inv.cash, method: 'cash', note: '', chequeId: null });
      if (inv.cheque > 0) inv.pays.push({ id: d.seq++, date: inv.date, amount: inv.cheque, method: 'cheque', note: inv.chequeNote || '', chequeId: null });
      delete inv.cash; delete inv.cheque; delete inv.chequeNote;
    }
    return { db: d, dropped };
  }
  g.sanitizeDB = sanitizeDB;
  g.validJDate = validDate;
})(typeof window !== 'undefined' ? window : globalThis);
