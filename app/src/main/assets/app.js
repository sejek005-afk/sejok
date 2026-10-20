'use strict';
// ===================== داده =====================
const KEY = 'contractor_db_v1';
const MN = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const WD = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
let DB = load();

function fix(d) {
  for (const k of ['cats', 'projects', 'workers', 'installers', 'contractors', 'progress', 'tx']) d[k] = Array.isArray(d[k]) ? d[k] : [];
  d.att = d.att && typeof d.att === 'object' ? d.att : {};
  d.seq = d.seq || 1;
  d.v = 1;
  return d;
}
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.v) return fix(d); } catch (e) { }
  return fix({});
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { toast('خطا در ذخیره‌سازی!'); } }
function nid() { return DB.seq++; }

// ===================== ابزارها =====================
const FA = '۰۱۲۳۴۵۶۷۸۹', AR = '٠١٢٣٤٥٦٧٨٩';
function toEn(s) { return String(s == null ? '' : s).replace(/[۰-۹]/g, c => FA.indexOf(c)).replace(/[٠-٩]/g, c => AR.indexOf(c)); }
function num(v) { const n = parseFloat(toEn(v).replace(/[,،٬\s]/g, '').replace('٫', '.')); return isFinite(n) ? n : 0; }
function faNum(n) { return (Math.round(n * 100) / 100).toLocaleString('fa-IR'); }
function faDigits(s) { return String(s).replace(/\d/g, d => FA[d]); }
function money(n, cls) {
  n = Math.round(n || 0);
  const c = cls ? (n < 0 ? 'neg' : n > 0 ? 'pos' : '') : '';
  return `<span class="${c}">${n.toLocaleString('fa-IR')} تومان</span>`;
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function sum(arr, f) { let s = 0; for (const x of arr) s += f(x) || 0; return s; }

// آیکون‌های اختصاصی (خطی ۲۴×۲۴)
const ICONS = {
  site: '<path d="M3 21h18"/><path d="M5 21V8l6-3v16"/><path d="M11 10h7v11"/><path d="M8 10h.01M8 13h.01M8 16h.01M14 13h1M14 16h1"/><path d="M15 3h6M19 3v4"/>',
  helmet: '<path d="M4 16a8 8 0 0 1 16 0"/><path d="M2.5 16h19v2.5h-19z"/><path d="M10 8.3V12M14 8.3V12"/><path d="M12 8v-.5"/>',
  ruler: '<path d="M3.5 16.5 16.5 3.5l4 4-13 13z"/><path d="M7.5 12.5l1.8 1.8M10 10l1.2 1.2M12.5 7.5l1.8 1.8M15 5l1.2 1.2"/>',
  wallet: '<path d="M4 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8"/><path d="M3 8a2 2 0 0 1 2-2h11V4"/><path d="M16 13.5h2"/>',
  chart: '<path d="M3 21h18"/><path d="M6 21v-7M11 21V5M16 21v-10M21 21v-4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  edit: '<path d="M4 20l4.5-1L19 8.5 15.5 5 5 15.5z"/><path d="M13.5 7l3.5 3.5"/>',
  back: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  layers: '<path d="M12 3 21 8l-9 5-9-5z"/><path d="M3 12.5l9 5 9-5"/><path d="M3 16.5l9 5 9-5"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  clip: '<path d="M9 3h6v3H9z"/><path d="M7 4.5H5V21h14V4.5h-2"/><path d="M8.5 13.5l2.5 2.5 4.5-5"/>',
  tape: '<rect x="2.5" y="6" width="13" height="13" rx="3"/><circle cx="9" cy="12.5" r="2.5"/><path d="M15.5 15.5h6v3.5h-6"/><path d="M18 15.5v1.5M20 15.5v1.5"/>',
  in: '<path d="M12 4v13M6 11l6 6 6-6"/><path d="M5 20h14"/>',
  out: '<path d="M12 20V7M6 13l6-6 6 6"/><path d="M5 4h14"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  box: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 15v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.6-2.4-2.9-5.5-3"/>',
};
function ic(n) { return `<svg class="i" viewBox="0 0 24 24">${ICONS[n] || ''}</svg>`; }
function tape(pct) { return `<div class="tape"><i class="${pct >= 100 ? 'full' : ''}" style="width:${pct}%"></i><em>${faNum(Math.round(pct))}٪</em></div>`; }

// تاریخ (ذخیره به صورت رشته شمسی 1405/07/28)
function p2(n) { return (n < 10 ? '0' : '') + n; }
function jdnToJ(n) { const r = J.d2j(n); return `${r.jy}/${p2(r.jm)}/${p2(r.jd)}`; }
function jToJdn(s) { const a = s.split('/').map(Number); return J.j2d(a[0], a[1], a[2]); }
function todayJdn() { const d = new Date(); return J.g2d(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
function todayJ() { return jdnToJ(todayJdn()); }
function parseJ(s) {
  const m = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/.exec(toEn(s).trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1300 || y > 1500 || mo < 1 || mo > 12 || d < 1 || d > J.monthLen(y, mo)) return null;
  return `${y}/${p2(mo)}/${p2(d)}`;
}
function showDate(s) {
  if (!s) return '';
  const a = s.split('/').map(Number);
  return faDigits(`${a[2]} ${MN[a[1] - 1]} ${a[0]}`);
}
function weekday(s) { return WD[(jToJdn(s) + 2) % 7]; }

// ===================== دسترسی به اشیا =====================
const byId = (arr, id) => arr.find(x => x.id === +id);
const proj = id => byId(DB.projects, id);
const cat = id => byId(DB.cats, id);
const worker = id => byId(DB.workers, id);
const inst = id => byId(DB.installers, id);
const contr = id => byId(DB.contractors, id);
const fullName = x => x ? `${x.first || ''} ${x.last || ''}`.trim() : '';
const pname = id => { const p = proj(id); return p ? p.name : 'پروژه حذف‌شده'; };
const wname = id => fullName(worker(id)) || 'شاگرد حذف‌شده';
const iname = id => fullName(inst(id)) || 'نصاب حذف‌شده';
const cname = id => fullName(contr(id)) || 'پیمانکار حذف‌شده';

function rate(p) { return p.type === 'labor' ? (p.laborPrice || 0) : (p.price || 0); }
function matPerM(p) { return p.type === 'labor' ? 0 : (p.area > 0 ? (p.material || 0) / p.area : 0); }

// ===================== حضور و غیاب خودکار =====================
function syncAtt() {
  const t = todayJdn();
  let changed = false;
  for (const w of DB.workers) {
    if (!w.active || !w.projectId || !proj(w.projectId)) continue;
    let from = w.fillFrom == null ? t : w.fillFrom;
    if (t - from > 400) from = t - 400; // محافظت
    for (let n = from; n <= t; n++) {
      const k = w.id + '|' + jdnToJ(n);
      if (!DB.att[k]) { DB.att[k] = { p: w.projectId, s: 'p', w: w.wage || 0 }; changed = true; }
    }
    if (w.fillFrom !== t + 1) { w.fillFrom = t + 1; changed = true; }
  }
  if (changed) save();
}

// ===================== محاسبات =====================
// pred: تابع روی تاریخ ، pids: مجموعه شناسه پروژه یا null برای همه
function agg(pred, pids) {
  const r = { meters: 0, revenue: 0, material: 0, workers: 0, installers: 0, extras: 0, wdays: 0 };
  for (const e of DB.progress) {
    if (pids && !pids.has(e.projectId)) continue;
    if (!pred(e.date)) continue;
    const p = proj(e.projectId); if (!p) continue;
    r.meters += e.meters;
    r.revenue += e.meters * rate(p);
    r.material += e.meters * matPerM(p);
    r.installers += (e.instMeters || 0) * (e.instRate || 0);
  }
  for (const k in DB.att) {
    const a = DB.att[k];
    if (a.s !== 'p') continue;
    if (pids && !pids.has(a.p)) continue;
    if (!pred(k.split('|')[1])) continue;
    r.workers += a.w || 0; r.wdays++;
  }
  for (const t of DB.tx) {
    if (t.type !== 'extra') continue;
    if (pids && !pids.has(t.projectId)) continue;
    if (!pred(t.date)) continue;
    r.extras += t.amount || 0;
  }
  r.net = r.revenue - r.material - r.workers - r.installers - r.extras;
  return r;
}
const ALL = () => true;

function workerStats(w) {
  let days = 0, absent = 0, earned = 0;
  const pre = w.id + '|';
  for (const k in DB.att) {
    if (!k.startsWith(pre)) continue;
    const a = DB.att[k];
    if (a.s === 'p') { days++; earned += a.w || 0; } else absent++;
  }
  const paid = sum(DB.tx.filter(t => t.type === 'wpay' && t.workerId === w.id), t => t.amount);
  return { days, absent, earned, paid, bal: earned - paid };
}
function instStats(i) {
  const works = DB.progress.filter(e => e.installerId === i.id);
  const meters = sum(works, e => e.instMeters);
  const earned = sum(works, e => e.instMeters * e.instRate);
  const paid = sum(DB.tx.filter(t => t.type === 'ipay' && t.installerId === i.id), t => t.amount);
  return { works, meters, earned, paid, bal: earned - paid };
}
function contrStats(c) {
  const txs = DB.tx.filter(t => t.contractorId === c.id);
  const inc = sum(txs.filter(t => t.type === 'in'), t => t.amount);
  const out = sum(txs.filter(t => t.type !== 'in'), t => t.amount);
  return { txs, inc, out, bal: inc - out };
}

// ===================== مسیریابی =====================
let stack = [{ name: 'home' }];
const cur = () => stack[stack.length - 1];
function go(name, params) { stack.push(Object.assign({ name }, params || {})); render(); window.scrollTo(0, 0); }
function tab(name) { stack = [{ name }]; render(); window.scrollTo(0, 0); }
function back() {
  if (!document.getElementById('modal').classList.contains('hidden')) { closeModal(); return true; }
  if (stack.length > 1) { stack.pop(); render(); return true; }
  if (cur().name !== 'home') { tab('home'); return true; }
  return false;
}
window.appBack = back;
function setSub(k, v) { cur()[k] = v; render(); }

// ===================== مودال و فرم =====================
let formFields = null, formCb = null, formDelCb = null;
function showModal(html) { const m = document.getElementById('modal'); m.innerHTML = html; m.classList.remove('hidden'); }
function closeModal() { const m = document.getElementById('modal'); m.classList.add('hidden'); m.innerHTML = ''; formFields = null; }
document.addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2400);
}

function fmtMoney(el) {
  const v = toEn(el.value).replace(/[^\d]/g, '');
  el.value = v ? Number(v).toLocaleString('en-US') : '';
}

function fieldInput(f) {
  const v = f.value == null ? '' : f.value;
  const id = 'f_' + f.k;
  switch (f.type) {
    case 'money': return `<input id="${id}" inputmode="numeric" value="${v === '' ? '' : Number(v).toLocaleString('en-US')}" oninput="fmtMoney(this)" placeholder="۰">`;
    case 'num': return `<input id="${id}" inputmode="decimal" value="${esc(v)}" placeholder="۰">`;
    case 'date': return `<div class="row"><input id="${id}" inputmode="numeric" value="${esc(v || todayJ())}" placeholder="1405/07/28"><button type="button" class="btn sm" onclick="document.getElementById('${id}').value=todayJ()">امروز</button></div>`;
    case 'select': return `<select id="${id}" onchange="updateWhen()">${f.opts.map(o => `<option value="${esc(o[0])}" ${String(o[0]) === String(v) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
    case 'textarea': return `<textarea id="${id}">${esc(v)}</textarea>`;
    default: return `<input id="${id}" value="${esc(v)}">`;
  }
}
function openForm(title, fields, cb, delCb) {
  formFields = fields; formCb = cb; formDelCb = delCb || null;
  let h = `<div class="sheet"><div class="sh-head"><b>${esc(title)}</b><button class="x" onclick="closeModal()">${ic('x')}</button></div><div class="sh-body">`;
  for (const f of fields) h += `<label class="fld" data-k="${f.k}">${esc(f.label)}${fieldInput(f)}${f.hint ? `<div class="mut" style="margin-top:4px">${esc(f.hint)}</div>` : ''}</label>`;
  h += `</div><div class="sh-foot"><button class="btn pri" onclick="submitForm()">ذخیره</button>${delCb ? '<button class="btn danger" onclick="formDel()">حذف</button>' : ''}</div></div>`;
  showModal(h);
  updateWhen();
}
function readForm() {
  const o = {};
  for (const f of formFields) {
    const el = document.getElementById('f_' + f.k);
    let v = el ? el.value : '';
    if (f.type === 'money' || f.type === 'num') v = num(v);
    else if (f.type === 'select' && f.numeric) v = v === '' ? null : +v;
    else if (typeof v === 'string') v = v.trim();
    o[f.k] = v;
  }
  return o;
}
function updateWhen() {
  if (!formFields) return;
  const o = readForm();
  for (const f of formFields) {
    if (!f.when) continue;
    const el = document.querySelector(`.fld[data-k="${f.k}"]`);
    if (el) el.style.display = f.when(o) ? '' : 'none';
  }
}
function submitForm() {
  const o = readForm();
  for (const f of formFields) {
    if (f.when && !f.when(o)) continue;
    if (f.req) {
      const bad = (f.type === 'money' || f.type === 'num') ? !(o[f.k] > 0) : (o[f.k] === '' || o[f.k] == null);
      if (bad) { toast(`«${f.label}» را وارد کنید`); return; }
    }
    if (f.type === 'date') {
      const d = parseJ(o[f.k]);
      if (!d) { toast('تاریخ نامعتبر است (مثال: 1405/07/28)'); return; }
      o[f.k] = d;
    }
  }
  const res = formCb(o);
  if (res === false) return;
  closeModal(); save(); syncAtt(); render();
  if (typeof res === 'function') res();
}
function formDel() {
  const cb = formDelCb;
  askConfirm('از حذف این مورد مطمئن هستید؟', () => { cb(); save(); render(); });
}
function askConfirm(msg, cb) {
  window._confirmCb = cb;
  showModal(`<div class="sheet"><div class="sh-head"><b>تأیید</b></div><div class="sh-body"><p>${esc(msg)}</p></div>
  <div class="sh-foot"><button class="btn danger" onclick="const c=window._confirmCb;closeModal();c()">بله</button><button class="btn" onclick="closeModal()">انصراف</button></div></div>`);
}
function info(title, html) {
  showModal(`<div class="sheet"><div class="sh-head"><b>${esc(title)}</b><button class="x" onclick="closeModal()">${ic('x')}</button></div><div class="sh-body">${html}</div><div class="sh-foot"><button class="btn pri" onclick="closeModal()">باشه</button></div></div>`);
}

const projOpts = (none) => (none ? [['', none]] : []).concat(DB.projects.map(p => [p.id, `${p.name} (${(cat(p.catId) || {}).name || ''})`]));
const workerOpts = () => DB.workers.map(w => [w.id, fullName(w)]);
const instOpts = (none) => (none ? [['', none]] : []).concat(DB.installers.map(i => [i.id, fullName(i)]));
const contrOpts = (none) => (none ? [['', none]] : []).concat(DB.contractors.map(c => [c.id, fullName(c)]));

// ===================== فرم‌ها =====================
function catForm(id) {
  const c = id ? cat(id) : null;
  openForm(c ? 'ویرایش دسته' : 'دسته جدید', [{ k: 'name', label: 'نام دسته (مثلاً کناف)', req: true, value: c && c.name }],
    o => { if (c) c.name = o.name; else DB.cats.push({ id: nid(), name: o.name }); },
    c ? () => {
      if (DB.projects.some(p => p.catId === c.id)) { toast('ابتدا پروژه‌های این دسته را حذف یا منتقل کنید'); return; }
      DB.cats = DB.cats.filter(x => x !== c);
      if (cur().name === 'cat') stack.pop();
    } : null);
}

function projectForm(id, catId) {
  const p = id ? proj(id) : null;
  openForm(p ? 'ویرایش پروژه' : 'پروژه جدید', [
    { k: 'name', label: 'نام پروژه', req: true, value: p && p.name },
    { k: 'address', label: 'آدرس', type: 'textarea', value: p && p.address },
    { k: 'catId', label: 'دسته', type: 'select', numeric: true, opts: DB.cats.map(c => [c.id, c.name]), value: p ? p.catId : catId },
    { k: 'type', label: 'نوع قرارداد', type: 'select', opts: [['mat', 'با متریال (محاسبه با قیمت هر متر مربع)'], ['labor', 'اجرتی (محاسبه با قیمت اجرتی)']], value: p ? p.type : 'mat' },
    { k: 'area', label: 'متراژ کل (متر مربع)', type: 'num', value: p && p.area },
    { k: 'price', label: 'قیمت هر متر مربع (تومان)', type: 'money', value: p && p.price },
    { k: 'laborPrice', label: 'قیمت اجرتی هر متر مربع (تومان)', type: 'money', value: p && p.laborPrice },
    { k: 'material', label: 'هزینه متریال خریداری‌شده (تومان)', type: 'money', value: p && p.material, hint: 'در قرارداد با متریال، به ازای هر متر کار به نسبت متراژ کل کسر می‌شود.' },
  ], o => {
    if (p) Object.assign(p, o);
    else { const np = Object.assign({ id: nid(), created: todayJ() }, o); DB.projects.push(np); return () => go('project', { id: np.id }); }
  }, p ? () => deleteProject(p) : null);
}
function deleteProject(p) {
  DB.progress = DB.progress.filter(e => e.projectId !== p.id);
  DB.tx = DB.tx.filter(t => !(t.type === 'extra' && t.projectId === p.id));
  for (const w of DB.workers) if (w.projectId === p.id) { w.projectId = null; w.active = false; }
  DB.projects = DB.projects.filter(x => x !== p);
  if (cur().name === 'project') stack.pop();
}

function workerForm(id, presetProject) {
  const w = id ? worker(id) : null;
  const fields = [
    { k: 'first', label: 'نام', req: true, value: w && w.first },
    { k: 'last', label: 'نام خانوادگی', value: w && w.last },
    { k: 'address', label: 'محل سکونت', value: w && w.address },
    { k: 'phone', label: 'شماره تماس (اختیاری)', type: 'num', value: w && w.phone },
    { k: 'wage', label: 'دستمزد روزانه (تومان)', type: 'money', req: true, value: w && w.wage },
  ];
  if (!w) {
    fields.push({ k: 'projectId', label: 'پروژه', type: 'select', numeric: true, opts: projOpts('— بدون پروژه —'), value: presetProject || '' });
    fields.push({ k: 'active', label: 'فعال (حضور خودکار از امروز)', type: 'select', opts: [['1', 'بله'], ['0', 'خیر']], value: '1', when: o => !!o.projectId });
  }
  openForm(w ? 'ویرایش شاگرد' : 'شاگرد جدید', fields, o => {
    o.phone = o.phone ? String(o.phone) : '';
    if (w) { Object.assign(w, o); return; }
    const nw = { id: nid(), first: o.first, last: o.last, address: o.address, phone: o.phone, wage: o.wage, projectId: o.projectId || null, active: !!o.projectId && o.active === '1', fillFrom: todayJdn() };
    DB.workers.push(nw);
  }, w ? () => {
    DB.workers = DB.workers.filter(x => x !== w);
    if (cur().name === 'worker') stack.pop();
  } : null);
}

function installerForm(id) {
  const i = id ? inst(id) : null;
  openForm(i ? 'ویرایش نصاب' : 'نصاب متری جدید', [
    { k: 'first', label: 'نام', req: true, value: i && i.first },
    { k: 'last', label: 'نام خانوادگی', value: i && i.last },
    { k: 'address', label: 'محل زندگی', value: i && i.address },
    { k: 'phone', label: 'شماره تماس (اختیاری)', type: 'num', value: i && i.phone },
    { k: 'rate', label: 'دستمزد هر متر (تومان)', type: 'money', req: true, value: i && i.rate },
  ], o => {
    o.phone = o.phone ? String(o.phone) : '';
    if (i) Object.assign(i, o); else DB.installers.push(Object.assign({ id: nid() }, o));
  }, i ? () => {
    DB.installers = DB.installers.filter(x => x !== i);
    if (cur().name === 'installer') stack.pop();
  } : null);
}

function contractorForm(id) {
  const c = id ? contr(id) : null;
  openForm(c ? 'ویرایش پیمانکار' : 'پیمانکار جدید', [
    { k: 'first', label: 'نام', req: true, value: c && c.first },
    { k: 'last', label: 'نام خانوادگی', value: c && c.last },
    { k: 'phone', label: 'شماره تماس (اختیاری)', type: 'num', value: c && c.phone },
  ], o => {
    o.phone = o.phone ? String(o.phone) : '';
    if (c) Object.assign(c, o); else DB.contractors.push(Object.assign({ id: nid() }, o));
  }, c ? () => {
    DB.tx = DB.tx.filter(t => !(t.contractorId === c.id && t.type === 'in'));
    for (const t of DB.tx) if (t.contractorId === c.id) t.contractorId = null;
    DB.contractors = DB.contractors.filter(x => x !== c);
    if (cur().name === 'contractor') stack.pop();
  } : null);
}

const TXT = { in: 'دریافتی', wpay: 'واریز به شاگرد', ipay: 'پرداخت به نصاب', extra: 'هزینه مازاد' };
// preset: مقادیر ثابت مثل {type:'wpay', workerId:3} یا {contractorId:2}
function txForm(id, preset) {
  const t = id ? DB.tx.find(x => x.id === id) : null;
  const ps = preset || {};
  const v = k => t ? t[k] : (ps[k] != null ? ps[k] : '');
  const fields = [];
  if (!ps.type || t) fields.push({ k: 'type', label: 'نوع', type: 'select', opts: (ps.contractorId || (t && t.contractorId) ? [['in', 'دریافتی (پول دریافت‌شده)']] : []).concat([['wpay', 'واریز به شاگرد'], ['ipay', 'پرداخت به نصاب'], ['extra', 'هزینه مازاد پروژه']]), value: v('type') || (ps.contractorId ? 'in' : 'wpay') });
  const T = o => o.type || ps.type;
  fields.push(
    { k: 'amount', label: 'مبلغ (تومان)', type: 'money', req: true, value: v('amount') },
    { k: 'date', label: 'تاریخ', type: 'date', value: v('date') },
    { k: 'workerId', label: 'شاگرد', type: 'select', numeric: true, opts: workerOpts(), value: v('workerId'), when: o => T(o) === 'wpay' },
    { k: 'installerId', label: 'نصاب', type: 'select', numeric: true, opts: instOpts(), value: v('installerId'), when: o => T(o) === 'ipay' },
    { k: 'projectId', label: 'پروژه', type: 'select', numeric: true, opts: projOpts(), value: v('projectId'), when: o => T(o) === 'extra' },
    { k: 'contractorId', label: 'از طرف پیمانکار', type: 'select', numeric: true, opts: contrOpts('— بدون پیمانکار —'), value: v('contractorId'), when: o => T(o) !== 'in' },
    { k: 'note', label: 'توضیحات', type: 'textarea', value: v('note') },
  );
  const title = t ? 'ویرایش ' + TXT[t.type] : (ps.type ? TXT[ps.type] + ' جدید' : 'تراکنش جدید');
  openForm(title, fields, o => {
    const type = o.type || ps.type;
    const rec = { type, amount: o.amount, date: o.date, note: o.note, workerId: null, installerId: null, projectId: null, contractorId: null };
    if (type === 'wpay') { if (!o.workerId) { toast('شاگرد را انتخاب کنید'); return false; } rec.workerId = o.workerId; }
    if (type === 'ipay') { if (!o.installerId) { toast('نصاب را انتخاب کنید'); return false; } rec.installerId = o.installerId; }
    if (type === 'extra') { if (!o.projectId) { toast('پروژه را انتخاب کنید'); return false; } rec.projectId = o.projectId; }
    rec.contractorId = type === 'in' ? (ps.contractorId || (t && t.contractorId) || null) : (o.contractorId || null);
    if (type === 'in' && !rec.contractorId) { toast('دریافتی فقط برای پیمانکار ثبت می‌شود'); return false; }
    if (t) Object.assign(t, rec); else DB.tx.push(Object.assign({ id: nid() }, rec));
  }, t ? () => { DB.tx = DB.tx.filter(x => x !== t); } : null);
}

function progressForm(pid, id) {
  const e = id ? DB.progress.find(x => x.id === id) : null;
  openForm(e ? 'ویرایش پیشرفت کار' : 'ثبت پیشرفت کار', [
    { k: 'date', label: 'تاریخ', type: 'date', value: e && e.date },
    { k: 'meters', label: 'متراژ انجام‌شده (متر مربع)', type: 'num', req: true, value: e && e.meters },
    { k: 'installerId', label: 'نصاب متری (اختیاری)', type: 'select', numeric: true, opts: instOpts('— بدون نصاب —'), value: e ? e.installerId || '' : '' },
    { k: 'instMeters', label: 'متراژ کار نصاب', type: 'num', value: e && e.instMeters, when: o => !!o.installerId, hint: 'اگر خالی بماند، برابر متراژ انجام‌شده در نظر گرفته می‌شود.' },
    { k: 'note', label: 'توضیحات', type: 'textarea', value: e && e.note },
  ], o => {
    const i = o.installerId ? inst(o.installerId) : null;
    const rec = { date: o.date, meters: o.meters, note: o.note, installerId: i ? i.id : null, instMeters: i ? (o.instMeters || o.meters) : 0, instRate: i ? (e && e.installerId === i.id ? e.instRate : i.rate) : 0 };
    if (e) Object.assign(e, rec); else DB.progress.push(Object.assign({ id: nid(), projectId: pid }, rec));
    return () => showDay(pid, o.date);
  }, e ? () => { DB.progress = DB.progress.filter(x => x !== e); } : null);
}

function breakdown(a, p) {
  return `<div class="kv"><span>متراژ کار</span><span>${faNum(a.meters)} متر</span></div>
  <div class="kv"><span>درآمد (${faNum(a.meters)} × ${Math.round(rate(p)).toLocaleString('fa-IR')})</span><span>${money(a.revenue)}</span></div>
  ${p.type === 'labor' ? '' : `<div class="kv"><span>متریال مصرفی</span><span>− ${money(a.material)}</span></div>`}
  <div class="kv"><span>دستمزد شاگردها (${faNum(a.wdays)} نفر‌روز)</span><span>− ${money(a.workers)}</span></div>
  <div class="kv"><span>دستمزد نصاب</span><span>− ${money(a.installers)}</span></div>
  <div class="kv"><span>هزینه مازاد</span><span>− ${money(a.extras)}</span></div>
  <div class="kv total"><span>خالص کارکرد</span><span>${money(a.net, 1)}</span></div>`;
}
function showDay(pid, date) {
  const p = proj(pid); if (!p) return;
  const a = agg(d => d === date, new Set([pid]));
  info(`خالص کارکرد ${showDate(date)}`, breakdown(a, p));
}

// ===================== حضور و غیاب =====================
function setAtt(wid, date, status, pid) {
  const w = worker(wid); const k = wid + '|' + date;
  if (status === null) { delete DB.att[k]; }
  else if (status === 'a') { DB.att[k] = { p: (DB.att[k] && DB.att[k].p) || w.projectId || null, s: 'a', w: 0 }; }
  else {
    const p = pid || (DB.att[k] && DB.att[k].p) || w.projectId;
    if (!p) { toast('ابتدا برای شاگرد پروژه انتخاب کنید'); return; }
    DB.att[k] = { p: +p, s: 'p', w: (DB.att[k] && DB.att[k].s === 'p' && DB.att[k].w) || w.wage || 0 };
  }
  save(); render();
}
function attDayForm(wid, date) {
  const w = worker(wid); const a = DB.att[wid + '|' + date];
  openForm(`${fullName(w)} — ${showDate(date)}`, [
    { k: 's', label: 'وضعیت', type: 'select', opts: [['p', 'حاضر'], ['a', 'غایب'], ['', 'ثبت نشده']], value: a ? a.s : 'p' },
    { k: 'p', label: 'پروژه', type: 'select', numeric: true, opts: projOpts(), value: a ? a.p : w.projectId, when: o => o.s === 'p' },
    { k: 'w', label: 'دستمزد این روز (تومان)', type: 'money', value: a && a.s === 'p' ? a.w : w.wage, when: o => o.s === 'p' },
  ], o => {
    const k = wid + '|' + date;
    if (o.s === '') delete DB.att[k];
    else if (o.s === 'a') DB.att[k] = { p: o.p || w.projectId || null, s: 'a', w: 0 };
    else { if (!o.p) { toast('پروژه را انتخاب کنید'); return false; } DB.att[k] = { p: o.p, s: 'p', w: o.w }; }
  });
}
function toggleActive(wid) {
  const w = worker(wid);
  if (!w.active) {
    if (!w.projectId || !proj(w.projectId)) { toast('ابتدا پروژه شاگرد را انتخاب کنید'); return; }
    w.active = true; w.fillFrom = todayJdn();
    syncAtt(); toast('فعال شد؛ از امروز حضور خودکار ثبت می‌شود');
  } else { w.active = false; toast('غیرفعال شد؛ حضور خودکار متوقف شد'); }
  save(); render();
}
function moveWorker(wid, pid) {
  const w = worker(wid); pid = pid ? +pid : null;
  w.projectId = pid;
  const k = wid + '|' + todayJ();
  if (pid && DB.att[k] && DB.att[k].s === 'p') DB.att[k].p = pid;
  if (!pid) w.active = false;
  save(); render(); toast(pid ? `منتقل شد به ${pname(pid)}` : 'از پروژه خارج شد');
}
function pickWorkerToProject(pid) {
  const others = DB.workers.filter(w => w.projectId !== pid);
  if (!others.length) { toast('شاگرد دیگری وجود ندارد'); return; }
  openForm('انتقال شاگرد به این پروژه', [
    { k: 'w', label: 'شاگرد', type: 'select', numeric: true, opts: others.map(w => [w.id, fullName(w) + (w.projectId ? ` (${pname(w.projectId)})` : '')]) },
  ], o => { moveWorker(o.w, pid); });
}

// ===================== نمایش‌ها =====================
function empty(msg, icon, title) { return `<div class="empty">${icon ? ic(icon) : ''}${title ? `<b>${title}</b>` : ''}${msg}</div>`; }
function txRow(t, show) {
  let who = '';
  if (t.type === 'wpay') who = 'شاگرد: ' + wname(t.workerId);
  if (t.type === 'ipay') who = 'نصاب: ' + iname(t.installerId);
  if (t.type === 'extra') who = 'پروژه: ' + pname(t.projectId);
  const parts = [showDate(t.date)];
  if (show !== 'contr' && t.contractorId) parts.push('پیمانکار: ' + cname(t.contractorId));
  if (show !== 'target' && who) parts.push(who);
  const sign = t.type === 'in' ? '+' : '−';
  return `<div class="tx" onclick="txForm(${t.id})"><span class="dot ${t.type === 'in' ? 'in' : 'out'}">${ic(t.type === 'in' ? 'in' : 'out')}</span><div class="d"><div>${TXT[t.type]}${t.note ? ' — ' + esc(t.note) : ''}</div><div class="mut">${esc(parts.join(' · '))}</div></div>
    <div class="a ${t.type === 'in' ? 'pos' : 'neg'}">${sign} ${Math.round(t.amount).toLocaleString('fa-IR')}</div></div>`;
}
const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id;

const V = {};

V.home = () => {
  const t = todayJ(); const ym = t.slice(0, 7);
  const m = agg(d => d.startsWith(ym), null);
  const present = Object.keys(DB.att).filter(k => k.endsWith('|' + t) && DB.att[k].s === 'p').length;
  const todayM = agg(d => d === t, null).meters;
  let h = `<div class="diary"><div class="wd">${dayName(t)}</div><div class="date">${showDate(t)}</div>
    <div class="row2"><div class="st"><small>شاگرد حاضر امروز</small><b>${faDigits(present)} نفر</b></div>
    <div class="st"><small>کار امروز</small><b>${faNum(todayM)} متر</b></div>
    <div class="st"><small>خالص ${MN[+t.slice(5, 7) - 1]}</small><b class="${m.net < 0 ? 'neg' : ''}">${short(m.net)}<span style="font-size:11px;font-weight:400"> هزار</span></b></div></div></div>`;
  h += `<div class="sec">دسته‌های کاری</div>`;
  if (!DB.cats.length) h += empty('با دکمه + اولین دسته را بسازید؛ مثلاً «کناف» یا «سقف کاذب».', 'layers', 'هنوز دسته‌ای ندارید');
  for (const c of DB.cats) {
    const ps = DB.projects.filter(p => p.catId === c.id);
    const a = agg(ALL, new Set(ps.map(p => p.id)));
    h += `<div class="card click" onclick="go('cat',{id:${c.id}})"><div class="ct"><span class="tile">${ic('layers')}</span>
      <div style="flex:1;min-width:0"><b style="font-size:16px">${esc(c.name)}</b><div class="mut">${faDigits(ps.length)} پروژه · ${faNum(a.meters)} متر کار</div></div>
      <div class="v">${money(a.net, 1)}<small>خالص کل</small></div></div></div>`;
  }
  return { title: 'راوانو', html: h, fab: 'catForm()', settings: true, logo: true };
};
function dayName(s) { return ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'][(jToJdn(s) + 2) % 7]; }

V.cat = r => {
  const c = cat(r.id); if (!c) { stack.pop(); return V[cur().name](cur()); }
  const ps = DB.projects.filter(p => p.catId === c.id);
  let h = '';
  if (!ps.length) h += empty('با دکمه + پروژه اضافه کنید و متراژ و قیمت‌ها را وارد کنید.', 'site', 'پروژه‌ای در این دسته نیست');
  for (const p of ps) {
    const a = agg(ALL, new Set([p.id]));
    const pct = p.area > 0 ? Math.min(100, a.meters / p.area * 100) : 0;
    h += `<div class="card click" onclick="go('project',{id:${p.id}})"><div class="ct"><b>${esc(p.name)}</b><span class="badge ${p.type === 'labor' ? '' : 'y'}">${p.type === 'labor' ? 'اجرتی' : 'با متریال'}</span></div>
      ${p.address ? `<div class="meta"><span>${ic('pin')}${esc(p.address)}</span></div>` : ''}
      ${tape(pct)}
      <div class="hl"><span class="mut">${faNum(a.meters)} از ${faNum(p.area || 0)} متر</span><span>${money(a.net, 1)}</span></div></div>`;
  }
  return { title: c.name, html: h, fab: `projectForm(null,${c.id})`, edit: `catForm(${c.id})` };
};

V.project = r => {
  const p = proj(r.id); if (!p) { stack.pop(); return V[cur().name](cur()); }
  const sub = r.sub || 'sum';
  const S = new Set([p.id]);
  const tabs = [['sum', 'خلاصه'], ['prog', 'پیشرفت کار'], ['work', 'شاگردها'], ['extra', 'هزینه مازاد']];
  let h = `<div class="tabs">${tabs.map(t => `<button class="${sub === t[0] ? 'on' : ''}" onclick="setSub('sub','${t[0]}')">${t[1]}</button>`).join('')}</div>`;
  let fab = null;
  if (sub === 'sum') {
    const a = agg(ALL, S);
    const pct = p.area > 0 ? Math.min(100, a.meters / p.area * 100) : 0;
    h += `<div class="card"><div class="hl"><div><div class="mut">انجام‌شده</div><div class="big">${faNum(a.meters)} <span style="font-size:15px">متر</span></div></div>
      <div style="text-align:left"><div class="mut">باقی‌مانده</div><b>${faNum(Math.max(0, (p.area || 0) - a.meters))} متر</b></div></div>
      ${tape(pct)}<div class="mut">از متراژ کل ${faNum(p.area || 0)} متر مربع</div></div>`;
    h += `<div class="card">${breakdown(a, p)}</div>`;
    h += `<div class="card"><div class="ct"><b>اطلاعات پروژه</b><button class="btn sm" onclick="projectForm(${p.id})">ویرایش</button></div>
      ${p.address ? `<div class="kv"><span>آدرس</span><span>${esc(p.address)}</span></div>` : ''}
      <div class="kv"><span>دسته</span><span>${esc((cat(p.catId) || {}).name || '')}</span></div>
      <div class="kv"><span>نوع قرارداد</span><span>${p.type === 'labor' ? 'اجرتی' : 'با متریال'}</span></div>
      <div class="kv"><span>متراژ کل</span><span>${faNum(p.area || 0)} متر مربع</span></div>
      <div class="kv"><span>قیمت هر متر مربع</span><span>${money(p.price)}</span></div>
      <div class="kv"><span>قیمت اجرتی هر متر</span><span>${money(p.laborPrice)}</span></div>
      <div class="kv"><span>هزینه متریال خریداری‌شده</span><span>${money(p.material)}</span></div>
      ${p.type === 'labor' ? '' : `<div class="kv"><span>متریال به ازای هر متر</span><span>${money(matPerM(p))}</span></div>`}
      <div class="kv"><span>مبلغ کل قرارداد</span><span>${money((p.area || 0) * rate(p))}</span></div></div>`;
  }
  if (sub === 'prog') {
    h += `<button class="btn pri wide" onclick="progressForm(${p.id})">${ic('tape')} ثبت پیشرفت کار امروز</button>`;
    const entries = DB.progress.filter(e => e.projectId === p.id).sort(byDateDesc);
    const dates = [...new Set(entries.map(e => e.date))];
    if (!dates.length) h += empty('متراژ کار هر روز را ثبت کنید تا خالص کارکرد آن روز حساب شود.', 'tape', 'هنوز پیشرفتی ثبت نشده');
    for (const d of dates) {
      const a = agg(x => x === d, S);
      h += `<div class="card"><div class="ct"><b>${showDate(d)}</b><span class="badge">${dayName(d)}</span></div>`;
      for (const e of entries.filter(x => x.date === d)) {
        h += `<div class="tx" onclick="progressForm(${p.id},${e.id})"><span class="dot" style="background:var(--yellow-soft);color:#8A6400">${ic('tape')}</span><div class="d"><div><b>${faNum(e.meters)} متر</b>${e.note ? ' — ' + esc(e.note) : ''}</div>
          ${e.installerId ? `<div class="mut">نصاب: ${esc(iname(e.installerId))} (${faNum(e.instMeters)} متر)</div>` : ''}</div><span class="mut">${ic('edit')}</span></div>`;
      }
      h += `<div style="margin-top:6px">${breakdown(a, p)}</div></div>`;
    }
  }
  if (sub === 'work') {
    h += `<div class="row" style="margin-bottom:12px"><button class="btn pri" style="flex:1" onclick="workerForm(null,${p.id})">${ic('plus')} شاگرد جدید</button><button class="btn dark" style="flex:1" onclick="pickWorkerToProject(${p.id})">${ic('helmet')} انتقال شاگرد</button></div>`;
    const ws = DB.workers.filter(w => w.projectId === p.id);
    const t = todayJ();
    if (!ws.length) h += empty('شاگرد جدید اضافه کنید یا از پروژه‌های دیگر منتقل کنید.', 'helmet', 'شاگردی در این پروژه نیست');
    else h += `<div class="card">${ws.map(w => attRow(w, t)).join('')}</div>`;
    const a = agg(ALL, S);
    h += `<div class="card"><div class="kv"><span>کل نفر‌روز کارکرد در این پروژه</span><span>${faNum(a.wdays)}</span></div><div class="kv"><span>جمع دستمزد شاگردها</span><span>${money(a.workers)}</span></div></div>`;
  }
  if (sub === 'extra') {
    const xs = DB.tx.filter(t => t.type === 'extra' && t.projectId === p.id).sort(byDateDesc);
    h += `<div class="card"><div class="kv total" style="border:0;margin:0;padding:0"><span>جمع هزینه‌های مازاد</span><span>${money(sum(xs, t => t.amount))}</span></div></div>`;
    if (!xs.length) h += empty('کرایه، ابزار، غذا و هر خرج دیگری را با دکمه + ثبت کنید.', 'coins', 'هزینه مازادی ثبت نشده');
    else h += `<div class="card">${xs.map(t => txRow(t, 'target')).join('')}</div>`;
    fab = `txForm(null,{type:'extra',projectId:${p.id}})`;
  }
  return { title: p.name, html: h, fab, edit: `projectForm(${p.id})` };
};

function attRow(w, date, withProject) {
  const a = DB.att[w.id + '|' + date];
  const s = a ? a.s : '';
  const pid = (a && a.p) || w.projectId || '';
  return `<div class="att"><div class="n" onclick="go('worker',{id:${w.id}})"><span class="av ${w.active ? 'on' : ''}">${ic('helmet')}</span><div><div>${esc(fullName(w))}</div>
    <div class="mut">${w.active ? 'حضور خودکار' : 'غیرفعال'}</div></div></div>
    <span class="seg"><button class="sb ${s === 'p' ? 'p' : ''}" onclick="setAtt(${w.id},'${date}','p')">حاضر</button><button class="sb ${s === 'a' ? 'a' : ''}" onclick="setAtt(${w.id},'${date}','a')">غایب</button></span>
    ${withProject ? `<select class="ps" onchange="setAtt(${w.id},'${date}','p',this.value)">${projOpts('— پروژه —').map(o => `<option value="${o[0]}" ${String(o[0]) === String(pid) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>` : ''}</div>`;
}

V.workers = () => {
  let h = `<button class="btn dark wide" onclick="go('attendance',{date:todayJ()})">${ic('clip')} حضور و غیاب روزانه</button>`;
  if (!DB.workers.length) h += empty('با دکمه + شاگرد اضافه کنید؛ نام، محل سکونت و دستمزد روزانه.', 'helmet', 'شاگردی ثبت نشده');
  const list = DB.workers.slice().sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0));
  if (list.length) h += '<div class="list">' + list.map(w => {
    const s = workerStats(w);
    return `<div class="li" onclick="go('worker',{id:${w.id}})"><span class="av ${w.active ? 'on' : ''}">${ic('helmet')}</span>
      <div class="d"><b>${esc(fullName(w))}</b><div class="mut">${w.projectId ? esc(pname(w.projectId)) : 'بدون پروژه'} · ${faDigits(s.days)} روز</div></div>
      <div class="v">${money(s.bal, 1)}<small>طلب تا امروز</small></div></div>`;
  }).join('') + '</div>';
  return { title: 'شاگردها', html: h, fab: 'workerForm()' };
};

V.worker = r => {
  const w = worker(r.id); if (!w) { stack.pop(); return V[cur().name](cur()); }
  const s = workerStats(w);
  const t = todayJ();
  if (!r.ym) r.ym = t.slice(0, 7);
  const [yy, mm] = r.ym.split('/').map(Number);
  let h = `<div class="card"><div class="switch"><div><b>فعال (حضور خودکار)</b><div class="mut">${w.active ? 'هر روز به‌طور خودکار حاضر ثبت می‌شود' : 'حضور خودکار خاموش است'}</div></div>
    <button class="tg ${w.active ? 'on' : ''}" onclick="toggleActive(${w.id})"></button></div>
    <label class="fld" style="margin:10px 0 0">پروژه فعلی<select onchange="moveWorker(${w.id},this.value)">${projOpts('— بدون پروژه —').map(o => `<option value="${o[0]}" ${String(o[0]) === String(w.projectId || '') ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label></div>`;
  h += `<div class="card"><div class="kv"><span>روزهای حضور</span><span>${faDigits(s.days)} روز</span></div>
    <div class="kv"><span>روزهای غیبت</span><span>${faDigits(s.absent)} روز</span></div>
    <div class="kv"><span>کارکرد تا امروز</span><span>${money(s.earned)}</span></div>
    <div class="kv"><span>دریافتی (واریزها)</span><span>${money(s.paid)}</span></div>
    <div class="kv total"><span>طلب تا امروز</span><span>${money(s.bal, 1)}</span></div></div>`;
  // تقویم
  const first = J.j2d(yy, mm, 1), len = J.monthLen(yy, mm), off = (first + 2) % 7;
  const prev = mm === 1 ? `${yy - 1}/12` : `${yy}/${p2(mm - 1)}`;
  const next = mm === 12 ? `${yy + 1}/01` : `${yy}/${p2(mm + 1)}`;
  h += `<div class="card"><div class="calnav"><button class="ic" onclick="setSub('ym','${prev}')">›</button><b>${MN[mm - 1]} ${faDigits(yy)}</b><button class="ic" onclick="setSub('ym','${next}')">‹</button></div><div class="cal">`;
  h += WD.map(d => `<div class="h">${d}</div>`).join('');
  for (let i = 0; i < off; i++) h += '<div></div>';
  const tj = todayJdn();
  let mDays = 0, mEarn = 0;
  for (let d = 1; d <= len; d++) {
    const ds = `${yy}/${p2(mm)}/${p2(d)}`; const a = DB.att[w.id + '|' + ds];
    if (a && a.s === 'p') { mDays++; mEarn += a.w || 0; }
    const fut = first + d - 1 > tj;
    h += `<button class="c ${a ? a.s : ''} ${ds === t ? 't' : ''} ${fut ? 'f' : ''}" onclick="attDayForm(${w.id},'${ds}')">${faDigits(d)}</button>`;
  }
  h += `</div><div class="mut" style="margin-top:8px">این ماه: ${faDigits(mDays)} روز حضور · ${money(mEarn)}</div>
    <div class="mut">روی هر روز بزنید تا حاضر/غایب یا پروژه آن روز را تغییر دهید.</div></div>`;
  h += `<div class="card"><div class="ct"><b>اطلاعات</b><button class="btn sm" onclick="workerForm(${w.id})">ویرایش</button></div>
    <div class="kv"><span>محل سکونت</span><span>${esc(w.address || '—')}</span></div>
    ${w.phone ? `<div class="kv"><span>تماس</span><span>${esc(faDigits(w.phone))}</span></div>` : ''}
    <div class="kv"><span>دستمزد روزانه</span><span>${money(w.wage)}</span></div></div>`;
  const pays = DB.tx.filter(x => x.type === 'wpay' && x.workerId === w.id).sort(byDateDesc);
  h += `<div class="sec">واریزی‌ها</div><div class="card">${pays.length ? pays.map(x => txRow(x, 'target')).join('') : '<div class="mut">واریزی ثبت نشده</div>'}</div>`;
  return { title: fullName(w), html: h, fab: `txForm(null,{type:'wpay',workerId:${w.id}})`, edit: `workerForm(${w.id})` };
};

V.attendance = r => {
  const d = r.date || todayJ(); const n = jToJdn(d);
  let h = `<div class="card"><div class="calnav"><button class="ic" onclick="setSub('date','${jdnToJ(n - 1)}')">›</button>
    <div style="text-align:center"><b>${showDate(d)}</b><div class="mut">${dayName(d)}</div></div>
    <button class="ic" onclick="setSub('date','${jdnToJ(n + 1)}')">‹</button></div>
    ${d !== todayJ() ? `<button class="btn sm" style="width:100%" onclick="setSub('date',todayJ())">برو به امروز</button>` : ''}</div>`;
  if (!DB.workers.length) h += empty('شاگردی ثبت نشده.');
  else {
    const list = DB.workers.slice().sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0));
    const present = list.filter(w => (DB.att[w.id + '|' + d] || {}).s === 'p');
    h += `<div class="card">${list.map(w => attRow(w, d, true)).join('')}</div>`;
    h += `<div class="card"><div class="kv"><span>حاضرین</span><span>${faDigits(present.length)} نفر</span></div><div class="kv"><span>جمع دستمزد این روز</span><span>${money(sum(present, w => DB.att[w.id + '|' + d].w))}</span></div></div>`;
  }
  return { title: 'حضور و غیاب', html: h };
};

V.installers = () => {
  let h = '';
  if (!DB.installers.length) h += empty('نصاب‌هایی که متری کار می‌کنند را با دکمه + اضافه کنید.', 'ruler', 'نصاب متری ثبت نشده');
  else h += '<div class="list">' + DB.installers.map(i => {
    const s = instStats(i);
    return `<div class="li" onclick="go('installer',{id:${i.id}})"><span class="av sq on">${ic('ruler')}</span>
      <div class="d"><b>${esc(fullName(i))}</b><div class="mut">${Math.round(i.rate || 0).toLocaleString('fa-IR')} تومان هر متر · ${faNum(s.meters)} متر کار</div></div>
      <div class="v">${money(s.bal, 1)}<small>طلب تا امروز</small></div></div>`;
  }).join('') + '</div>';
  return { title: 'نصاب‌های متری', html: h, fab: 'installerForm()' };
};

V.installer = r => {
  const i = inst(r.id); if (!i) { stack.pop(); return V[cur().name](cur()); }
  const s = instStats(i);
  let h = `<div class="card"><div class="kv"><span>متراژ کار تا امروز</span><span>${faNum(s.meters)} متر</span></div>
    <div class="kv"><span>کارکرد</span><span>${money(s.earned)}</span></div>
    <div class="kv"><span>دریافتی</span><span>${money(s.paid)}</span></div>
    <div class="kv total"><span>طلب تا امروز</span><span>${money(s.bal, 1)}</span></div></div>`;
  h += `<div class="card"><div class="ct"><b>اطلاعات</b><button class="btn sm" onclick="installerForm(${i.id})">ویرایش</button></div>
    <div class="kv"><span>محل زندگی</span><span>${esc(i.address || '—')}</span></div>
    ${i.phone ? `<div class="kv"><span>تماس</span><span>${esc(faDigits(i.phone))}</span></div>` : ''}
    <div class="kv"><span>دستمزد هر متر</span><span>${money(i.rate)}</span></div></div>`;
  const works = s.works.slice().sort(byDateDesc);
  h += `<div class="sec">کارکردها (از بخش پیشرفت کار پروژه‌ها)</div><div class="card">${works.length ? works.map(e => `<div class="tx" onclick="go('project',{id:${e.projectId},sub:'prog'})"><div class="d"><div>${esc(pname(e.projectId))} — ${faNum(e.instMeters)} متر</div><div class="mut">${showDate(e.date)}</div></div><div class="a">${Math.round(e.instMeters * e.instRate).toLocaleString('fa-IR')}</div></div>`).join('') : '<div class="mut">هنوز کارکردی ثبت نشده. هنگام ثبت پیشرفت کار، نصاب را انتخاب کنید.</div>'}</div>`;
  const pays = DB.tx.filter(x => x.type === 'ipay' && x.installerId === i.id).sort(byDateDesc);
  h += `<div class="sec">پرداختی‌ها</div><div class="card">${pays.length ? pays.map(x => txRow(x, 'target')).join('') : '<div class="mut">پرداختی ثبت نشده</div>'}</div>`;
  return { title: fullName(i), html: h, fab: `txForm(null,{type:'ipay',installerId:${i.id}})`, edit: `installerForm(${i.id})` };
};

V.contractors = () => {
  let h = '';
  if (!DB.contractors.length) h += empty('پیمانکار اضافه کنید تا دریافتی‌ها و خرج‌کردهایش را ثبت کنید.', 'wallet', 'پیمانکاری ثبت نشده');
  else h += '<div class="list">' + DB.contractors.map(c => {
    const s = contrStats(c);
    return `<div class="li" onclick="go('contractor',{id:${c.id}})"><span class="av sq on">${ic('wallet')}</span>
      <div class="d"><b>${esc(fullName(c))}</b><div class="mut">دریافتی ${short(s.inc)} · خرج ${short(s.out)} هزار</div></div>
      <div class="v">${money(s.bal, 1)}<small>مانده</small></div></div>`;
  }).join('') + '</div>';
  return { title: 'پیمانکاران', html: h, fab: 'contractorForm()' };
};

V.contractor = r => {
  const c = contr(r.id); if (!c) { stack.pop(); return V[cur().name](cur()); }
  const s = contrStats(c);
  let h = `<div class="card"><div class="kv"><span>جمع دریافتی</span><span>${money(s.inc)}</span></div>
    <div class="kv"><span>واریز به شاگردها</span><span>${money(sum(s.txs.filter(t => t.type === 'wpay'), t => t.amount))}</span></div>
    <div class="kv"><span>پرداخت به نصاب‌ها</span><span>${money(sum(s.txs.filter(t => t.type === 'ipay'), t => t.amount))}</span></div>
    <div class="kv"><span>هزینه‌های مازاد</span><span>${money(sum(s.txs.filter(t => t.type === 'extra'), t => t.amount))}</span></div>
    <div class="kv total"><span>مانده (دریافتی − خرج‌کرد)</span><span>${money(s.bal, 1)}</span></div></div>`;
  h += `<div class="row" style="margin-bottom:12px"><button class="btn pri" style="flex:1" onclick="txForm(null,{contractorId:${c.id},type:'in'})">${ic('in')} ثبت دریافتی</button><button class="btn dark" style="flex:1" onclick="txForm(null,{contractorId:${c.id}})">${ic('out')} ثبت خرج‌کرد</button></div>`;
  const txs = s.txs.slice().sort(byDateDesc);
  h += `<div class="card">${txs.length ? txs.map(t => txRow(t, 'contr')).join('') : '<div class="mut">تراکنشی ثبت نشده</div>'}</div>`;
  return { title: fullName(c), html: h, edit: `contractorForm(${c.id})` };
};

V.chart = r => {
  const ty = +todayJ().slice(0, 4);
  const y = r.year || ty;
  const rows = [];
  for (let m = 1; m <= 12; m++) {
    const pre = `${y}/${p2(m)}/`;
    const a = agg(d => d.startsWith(pre), null);
    rows.push({ m, rev: a.revenue, mat: a.material, labor: a.workers + a.installers, extra: a.extras, net: a.net, meters: a.meters });
  }
  const tot = k => sum(rows, x => x[k]);
  let h = `<div class="card"><div class="calnav"><button class="ic" onclick="setSub('year',${y - 1})">›</button><b>سال ${faDigits(y)}</b><button class="ic" onclick="setSub('year',${y + 1})">‹</button></div>
    ${chartSvg(rows)}
    <div class="legend"><span><i style="background:var(--c1)"></i>درآمد خالص</span><span><i style="background:var(--c2)"></i>هزینه شاگرد و نصاب</span><span><i style="background:var(--c3)"></i>هزینه مازاد</span></div></div>`;
  h += `<div class="card scroll-x"><table class="mt"><tr><th>ماه</th><th>درآمد</th><th>شاگرد/نصاب</th><th>مازاد</th><th>خالص</th></tr>
    ${rows.map(x => `<tr class="${y === ty && x.m === +todayJ().slice(5, 7) ? 'cur' : ''}"><td>${MN[x.m - 1]}</td><td>${short(x.rev)}</td><td>${short(x.labor)}</td><td>${short(x.extra)}</td><td class="${x.net < 0 ? 'neg' : x.net > 0 ? 'pos' : ''}">${short(x.net)}</td></tr>`).join('')}
    <tr class="tot"><td>جمع</td><td>${short(tot('rev'))}</td><td>${short(tot('labor'))}</td><td>${short(tot('extra'))}</td><td class="${tot('net') < 0 ? 'neg' : 'pos'}">${short(tot('net'))}</td></tr></table>
    <div class="mut" style="margin-top:8px">ارقام به هزار تومان. خالص = درآمد − متریال مصرفی − دستمزد شاگرد و نصاب − هزینه مازاد. (متریال مصرفی سال: ${money(tot('mat'))})</div></div>`;
  return { title: 'نمودار ماهیانه', html: h };
};
function short(n) { return Math.round(n / 1000).toLocaleString('fa-IR'); }
function chartSvg(rows) {
  const W = 360, H = 210, L = 6, R = 6, T = 10, B = 24;
  const vals = rows.flatMap(r => [r.net, r.labor, r.extra]);
  let max = Math.max(0, ...vals), min = Math.min(0, ...vals);
  if (max === min) max = 1;
  const y = v => T + (max - v) / (max - min) * (H - T - B);
  const gw = (W - L - R) / 12, bw = gw / 4;
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart">`;
  for (let g = 0; g <= 4; g++) { const yy = T + g * (H - T - B) / 4; s += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="#eef1f4"/>`; }
  s += `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="#b9c2cb"/>`;
  rows.forEach((r, i) => {
    const x0 = W - R - (i + 1) * gw + bw / 2;
    [[r.net, 'var(--c1)'], [r.labor, 'var(--c2)'], [r.extra, 'var(--c3)']].forEach(([v, c], j) => {
      const ya = y(Math.max(v, 0)), yb = y(Math.min(v, 0));
      s += `<rect x="${x0 + (2 - j) * bw}" y="${ya}" width="${bw - 1}" height="${Math.max(yb - ya, v ? 1 : 0)}" fill="${c}" rx="1.5"/>`;
    });
    s += `<text x="${x0 + 1.5 * bw}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#6b7785">${faDigits(r.m)}</text>`;
  });
  return s + '</svg>';
}

V.settings = () => {
  const n = DB.projects.length, w = DB.workers.length;
  let h = `<div class="card"><b>پشتیبان‌گیری</b><div class="mut" style="margin:4px 0 10px">اطلاعات فقط روی همین گوشی ذخیره می‌شود. برای جلوگیری از گم شدن اطلاعات (مثلاً هنگام عوض کردن گوشی)، هر چند وقت یک بار فایل پشتیبان بگیرید.</div>
    <button class="btn pri wide" onclick="exportData()">${ic('out')} ذخیره فایل پشتیبان</button>
    <label class="btn dark wide">${ic('in')} بازیابی از فایل پشتیبان<input type="file" accept=".json,application/json,text/plain,*/*" style="display:none" onchange="importData(this)"></label></div>
    <div class="card"><div class="kv"><span>دسته‌ها</span><span>${faDigits(DB.cats.length)}</span></div><div class="kv"><span>پروژه‌ها</span><span>${faDigits(n)}</span></div><div class="kv"><span>شاگردها</span><span>${faDigits(w)}</span></div><div class="kv"><span>نصاب‌ها</span><span>${faDigits(DB.installers.length)}</span></div><div class="kv"><span>پیمانکاران</span><span>${faDigits(DB.contractors.length)}</span></div></div>
    <div class="card"><button class="btn danger wide" style="margin:0" onclick="askConfirm('همه اطلاعات برنامه پاک شود؟ این کار قابل بازگشت نیست.',()=>askConfirm('واقعاً مطمئن هستید؟',()=>{DB=fix({});save();tab('home')}))">پاک کردن همه اطلاعات</button></div>
    <div style="text-align:center;margin-top:18px"><img src="logo.png" alt="راوانو" style="width:150px;opacity:.9"><div class="mut">نسخه ۱٫۳</div></div>`;
  return { title: 'تنظیمات', html: h };
};

function exportData() {
  const name = `rawano-backup-${todayJ().replace(/\//g, '-')}.json`;
  const json = JSON.stringify(DB);
  if (window.Android && Android.saveFile) {
    const r = Android.saveFile(name, json);
    if (r && r.indexOf('ok:') === 0) info('پشتیبان ذخیره شد', `<p>فایل در پوشه <b>Download</b> گوشی ذخیره شد:</p><p dir="ltr" style="text-align:left">${esc(r.slice(3))}</p>`);
    else if (r === 'shared') { } else toast('خطا: ' + r);
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = name; a.click();
}
function importData(input) {
  const f = input.files && input.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const d = JSON.parse(rd.result);
      if (!d || !d.v || !Array.isArray(d.projects)) throw 0;
      askConfirm('اطلاعات فعلی با فایل پشتیبان جایگزین شود؟', () => { DB = fix(d); save(); syncAtt(); tab('home'); toast('بازیابی انجام شد'); });
    } catch (e) { toast('فایل پشتیبان معتبر نیست'); }
  };
  rd.readAsText(f);
  input.value = '';
}

// ===================== رندر =====================
const NAV = [['home', 'site', 'پروژه‌ها'], ['workers', 'helmet', 'شاگردها'], ['installers', 'ruler', 'نصاب‌ها'], ['contractors', 'wallet', 'پیمانکاران'], ['chart', 'chart', 'نمودار']];
const ROOT = { home: 'home', cat: 'home', project: 'home', settings: 'home', workers: 'workers', worker: 'workers', attendance: 'workers', installers: 'installers', installer: 'installers', contractors: 'contractors', contractor: 'contractors', chart: 'chart' };
function render() {
  const r = cur();
  const v = V[r.name](r);
  const rr = cur();
  const canBack = stack.length > 1;
  document.getElementById('hdr').innerHTML = `${canBack ? `<button onclick="back()" aria-label="بازگشت">${ic('back')}</button>` : ''}<h1>${v.logo ? '<img class="hlogo" src="logo-mark.png" alt="">' : ''}${esc(v.title)}</h1>
    ${v.edit ? `<button onclick="${v.edit}" aria-label="ویرایش">${ic('edit')}</button>` : ''}${v.settings ? `<button onclick="go('settings')" aria-label="تنظیمات">${ic('gear')}</button>` : ''}`;
  document.getElementById('main').innerHTML = v.html;
  const fab = document.getElementById('fab');
  fab.innerHTML = ic('plus');
  if (v.fab) { fab.style.display = ''; fab.setAttribute('onclick', v.fab); } else fab.style.display = 'none';
  const root = ROOT[(stack[0] || rr).name];
  document.getElementById('nav').innerHTML = NAV.map(n => `<button class="${root === n[0] ? 'on' : ''}" onclick="tab('${n[0]}')">${ic(n[1])}${n[2]}</button>`).join('');
}

syncAtt();
render();
// صفحه آغازین با لوگو
setTimeout(() => { const s = document.getElementById('splash'); if (s) { s.classList.add('out'); setTimeout(() => s.remove(), 450); } }, 1700);
// اگر برنامه چند روز باز بماند، حضور خودکار روزهای جدید هم ثبت شود
document.addEventListener('visibilitychange', () => { if (!document.hidden) { syncAtt(); render(); } });
