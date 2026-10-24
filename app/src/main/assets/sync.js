'use strict';
// ===================== حساب کاربری و همگام‌سازی با سرور =====================
// برنامه همچنان آفلاین کار می‌کند؛ هر تغییر محلی ذخیره می‌شود و هر وقت اینترنت باشد با سرور
// همگام می‌شود. برای هر رکورد، اثر انگشت (hash) آخرین نسخه همگام‌شده نگه داشته می‌شود تا فقط
// تغییرات ارسال شوند. هر دستگاه شناسه‌های جدید را از بازه خودش (deviceId × ۱۰۰۰۰۰۰۰۰۰) می‌سازد
// تا رکوردهای دو گوشی هرگز شناسه یکسان نگیرند.
const SYNC_KEY = 'eshim_sync';
const SYNC_COLLS = ['cats', 'projects', 'workers', 'installers', 'contractors', 'progress', 'tx', 'adj', 'notes', 'cheques', 'invoices', 'statements'];
const ID_RANGE = 1e9;
// تا وقتی دامنه eshim.ir فعال شود، از نشانی میزبان هاست استفاده می‌شود
const DEFAULT_SERVER = 'https://1496118093.cloudylink.com/~h438354/api/';
let SY = syLoad();
let syBusy = false, syAgain = false, syTimer = null, syApplying = false, syErr = '', syRenderLater = false;

function syLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(SYNC_KEY) || 'null');
    if (s && typeof s === 'object' && !Array.isArray(s)) { if (!s.snap || typeof s.snap !== 'object') s.snap = {}; return s; }
  } catch (e) { }
  return { snap: {} };
}
function sySave() { try { localStorage.setItem(SYNC_KEY, JSON.stringify(SY)); return true; } catch (e) { return false; } }
function syncLoggedIn() { return !!(SY.token && SY.url && SY.deviceId); }
window.syncLoggedIn = syncLoggedIn;

// ---------- اثر انگشت و نسخه قابل ارسال هر رکورد ----------
function syHash(s) {
  // FNV-1a ۳۲ بیتی؛ فقط برای تشخیص تغییر رکورد
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
// fillFrom شاگرد وضعیت داخلی هر گوشی برای حضور خودکار است و همگام نمی‌شود
function sySer(c, r) {
  if (c === 'workers') { const o = Object.assign({}, r); delete o.fillFrom; return JSON.stringify(o); }
  return JSON.stringify(r);
}
function syInvSer() {
  const inv = Object.assign({}, DB.inv); delete inv.logo; delete inv.stamp;
  return Object.keys(inv).length ? JSON.stringify(inv) : null;
}
function syAssetSer(k) { const v = window.getAsset ? getAsset(k) : ''; return v ? JSON.stringify({ v }) : null; }
// همه رکوردهای محلی: Map از «مجموعه|شناسه» به { c, id, s }
function* syEntries() {
  for (const c of SYNC_COLLS) for (const r of DB[c]) yield [c + '|' + r.id, { c, id: String(r.id), s: sySer(c, r) }];
  for (const k in DB.att) yield ['att|' + k, { c: 'att', id: k, s: JSON.stringify(DB.att[k]) }];
  const inv = syInvSer(); if (inv) yield ['settings|inv', { c: 'settings', id: 'inv', s: inv }];
  for (const k of ['logo', 'stamp']) { const s = syAssetSer(k); if (s) yield ['asset|' + k, { c: 'asset', id: k, s }]; }
}
function syCurrent() { return new Map(syEntries()); }
// کش متن و اثر انگشت هر رکورد در حافظه: اگر متن رکورد عوض نشده باشد، دوباره hash نمی‌شود
const SY_CACHE = new Map();
function syHashOf(k, str) {
  const c = SY_CACHE.get(k);
  if (c && c[0] === str) return c[1];
  const h = syHash(str);
  SY_CACHE.set(k, [str, h]);
  return h;
}
const syYield = () => new Promise(r => setTimeout(r, 0));
// فهرست تغییرات ارسال‌نشده؛ کار در تکه‌های کوچک انجام می‌شود تا برنامه هنگام همگام‌سازی کند نشود
async function syPendingAsync() {
  const cur = new Set();
  const out = [];
  let n = 0;
  for (const [k, x] of syEntries()) {
    cur.add(k);
    if (SY.snap[k] !== syHashOf(k, x.s)) out.push({ k, c: x.c, id: x.id, s: x.s });
    if (++n % 1500 === 0) await syYield();
  }
  for (const k in SY.snap) if (!cur.has(k)) { const i = k.indexOf('|'); out.push({ k, c: k.slice(0, i), id: k.slice(i + 1), s: null }); SY_CACHE.delete(k); }
  SY_PEND = out.length;
  return out;
}
function syPending(cur) {
  const out = [];
  for (const [k, x] of cur) if (SY.snap[k] !== syHashOf(k, x.s)) out.push({ k, c: x.c, id: x.id, s: x.s });
  for (const k in SY.snap) if (!cur.has(k)) { const i = k.indexOf('|'); out.push({ k, c: k.slice(0, i), id: k.slice(i + 1), s: null }); }
  return out;
}
let SY_PEND = 0;
// فقط اگر از آخرین بررسی چیزی ذخیره شده باشد، تغییرات محلی دوباره بررسی می‌شوند
let SY_DIRTY = true;
function syHasLocalData() {
  return SYNC_COLLS.some(c => DB[c].length) || Object.keys(DB.att).length > 0;
}

// ---------- شناسه‌های بدون تداخل بین گوشی‌ها ----------
function syMaxInRange(lo, hi) {
  let m = lo - 1;
  const walk = x => {
    if (Array.isArray(x)) { for (const y of x) walk(y); return; }
    if (!x || typeof x !== 'object') return;
    if (typeof x.id === 'number' && x.id >= lo && x.id < hi && x.id > m) m = x.id;
    if (x.items) walk(x.items);
    if (x.pays) walk(x.pays);
  };
  for (const c of SYNC_COLLS) walk(DB[c]);
  return m;
}
const _nidOrig = nid;
nid = function () {
  if (SY.deviceId) {
    const lo = SY.deviceId * ID_RANGE, hi = lo + ID_RANGE;
    if (!(DB.seq >= lo && DB.seq < hi)) DB.seq = syMaxInRange(lo, hi) + 1;
  }
  return _nidOrig();
};

// ---------- ارتباط با سرور ----------
function syNormUrl(u) {
  u = String(u || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  u = u.replace(/\/index\.php.*$/i, '').replace(/\/+$/, '') + '/';
  return u;
}
async function syApi(route, body, url) {
  const base = url || SY.url;
  const headers = { 'Content-Type': 'application/json' };
  if (!url && SY.token) { headers.Authorization = 'Bearer ' + SY.token; headers['X-Eshim-Token'] = SY.token; }
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const to = ctl ? setTimeout(() => ctl.abort(), 90000) : 0;
  let res, j;
  try {
    res = await fetch(base + 'index.php?r=' + route, {
      method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body || {}),
      signal: ctl ? ctl.signal : undefined, cache: 'no-store', credentials: 'omit',
    });
  } catch (e) {
    throw Object.assign(new Error('به سرور وصل نشد؛ اینترنت یا نشانی سرور را بررسی کنید.'), { code: 'network' });
  } finally { if (to) clearTimeout(to); }
  try { j = await res.json(); } catch (e) { j = null; }
  if (!j || typeof j !== 'object') throw Object.assign(new Error(`پاسخ سرور نامعتبر است (کد ${res.status}). نشانی سرور را بررسی کنید.`), { code: 'bad_response', status: res.status });
  if (!j.ok) throw Object.assign(new Error(j.message || j.error || 'خطای سرور'), { code: j.error, status: res.status });
  return j;
}

// ---------- اعمال تغییرات رسیده از سرور ----------
// اگر همان رکورد در این گوشی هم تغییر کرده و هنوز ارسال نشده، نسخه این گوشی می‌ماند و بعداً ارسال می‌شود
// (به‌جز حضور و غیاب که نسخه سرور ترجیح دارد تا حضور خودکار گوشی دیگر، تغییر دستی را پاک نکند).
function syApplyPage(list) {
  if (!Array.isArray(list) || !list.length) return false;
  const maps = {};
  const mapOf = c => maps[c] || (maps[c] = new Map(DB[c].map(x => [x.id, x])));
  const localSer = (c, id) => {
    if (SYNC_COLLS.includes(c)) { const r = mapOf(c).get(+id); return r ? sySer(c, r) : null; }
    if (c === 'att') return DB.att[id] ? JSON.stringify(DB.att[id]) : null;
    if (c === 'settings') return syInvSer();
    if (c === 'asset') return syAssetSer(id);
    return null;
  };
  const setSnap = (k, s) => { if (s == null) delete SY.snap[k]; else SY.snap[k] = syHash(s); };
  let changed = false;
  for (const ch of list) {
    if (!ch || typeof ch !== 'object') continue;
    const c = String(ch.c), id = String(ch.id), k = c + '|' + id;
    if (ch.own) continue;
    const loc = localSer(c, id);
    const locH = loc == null ? undefined : syHash(loc);
    if (locH !== SY.snap[k] && c !== 'att') continue; // تغییر ارسال‌نشده این گوشی
    const d = ch.d;
    if (SYNC_COLLS.includes(c)) {
      const m = mapOf(c), nid_ = +id;
      if (d == null) { m.delete(nid_); setSnap(k, null); changed = true; continue; }
      const clean = sanitizeDB({ v: 1, [c]: [d] }).db[c][0];
      if (!clean || clean.id !== nid_) continue;
      if (c === 'workers') { const old = m.get(nid_); clean.fillFrom = old ? old.fillFrom : null; }
      m.set(nid_, clean); setSnap(k, sySer(c, clean)); changed = true;
    } else if (c === 'att') {
      if (d == null) delete DB.att[id];
      else { const a = sanitizeDB({ v: 1, att: { [id]: d } }).db.att[id]; if (!a) continue; DB.att[id] = a; }
      setSnap(k, localSer(c, id)); changed = true;
    } else if (c === 'settings' && id === 'inv') {
      const inv = d == null ? {} : sanitizeDB({ v: 1, inv: d }).db.inv;
      delete inv.logo; delete inv.stamp;
      DB.inv = inv; setSnap(k, localSer(c, id)); changed = true;
    } else if (c === 'asset' && (id === 'logo' || id === 'stamp')) {
      const v = d && typeof d.v === 'string' ? (sanitizeDB({ v: 1, inv: { [id]: d.v } }).db.inv[id] || '') : '';
      if (window.setAsset) setAsset(id, v);
      setSnap(k, localSer(c, id)); changed = true;
    }
  }
  for (const c in maps) DB[c] = [...maps[c].values()];
  return changed;
}
function syAfterApply() {
  syApplying = true;
  try { save(); } finally { syApplying = false; }
  const modal = document.getElementById('modal');
  if (modal && modal.classList.contains('hidden')) render(); else syRenderLater = true;
}
const _closeModalOrig = closeModal;
closeModal = function () { _closeModalOrig(); if (syRenderLater) { syRenderLater = false; render(); } };

// ---------- چرخه همگام‌سازی ----------
function syBody(changes) {
  return '{"ws":' + (SY.ws || 0) + ',"since":' + (SY.rev || 0) + ',"skipOwn":' + (SY.fresh ? 'false' : 'true') + ',"changes":' + changes + '}';
}
async function syncNow(manual) {
  if (!syncLoggedIn() || !SY.ws || DB_CORRUPT || typeof fetch !== 'function') return false;
  if (syBusy) { syAgain = true; return false; }
  syBusy = true; syAgain = false;
  const startToken = SY.token, startWs = SY.ws;
  const stale = () => SY.token !== startToken || SY.ws !== startWs;
  let anyChange = false;
  try {
    // ۱) اول دریافت تغییرات دیگران
    let more = true;
    while (more) {
      const r = await syApi('sync', syBody('[]'));
      if (stale()) return false;
      if (syApplyPage(r.changes)) { anyChange = true; syAfterApply(); }
      SY.rev = r.rev; more = !!r.more; sySave();
    }
    if (SY.fresh) { SY.fresh = false; sySave(); }
    // ۲) ارسال تغییرات این گوشی (در بسته‌های کوچک)
    const pend = SY_DIRTY ? (SY_DIRTY = false, await syPendingAsync()) : [];
    for (let i = 0; i < pend.length;) {
      const chunk = []; let bytes = 0;
      while (i < pend.length && chunk.length < 300 && (bytes < 2000000 || !chunk.length)) { const x = pend[i++]; chunk.push(x); bytes += x.s ? x.s.length : 20; }
      const body = syBody('[' + chunk.map(x => '{"c":' + JSON.stringify(x.c) + ',"id":' + JSON.stringify(x.id) + ',"d":' + (x.s == null ? 'null' : x.s) + '}').join(',') + ']');
      const r = await syApi('sync', body);
      if (stale()) return false;
      for (const x of chunk) { if (x.s == null) delete SY.snap[x.k]; else SY.snap[x.k] = syHashOf(x.k, x.s); }
      SY_PEND = Math.max(0, SY_PEND - chunk.length);
      if (syApplyPage(r.changes)) { anyChange = true; syAfterApply(); }
      SY.rev = r.rev; sySave();
      more = !!r.more;
      while (more) {
        const r2 = await syApi('sync', syBody('[]'));
        if (stale()) return false;
        if (syApplyPage(r2.changes)) { anyChange = true; syAfterApply(); }
        SY.rev = r2.rev; more = !!r2.more; sySave();
      }
    }
    if (anyChange) { syncAtt(); }
    SY.last = Date.now(); syErr = ''; sySave();
    if (manual) toast('همگام‌سازی انجام شد');
    return true;
  } catch (e) {
    SY_DIRTY = true;
    if (e.code === 'bad_token' || e.code === 'no_token' || e.code === 'disabled') {
      syErr = '';
      toast(e.message);
      syEndSession(false, true);
    } else if (e.code === 'not_member') {
      // دسترسی به حساب مشترک برداشته شده: برگشت به حساب خود کاربر
      toast(e.message);
      syEnterWs(SY.ownWs, false);
    } else {
      syErr = e.message || 'خطا در همگام‌سازی';
      if (manual) toast(syErr);
    }
    return false;
  } finally {
    syBusy = false;
    syRerender();
    if (syAgain) sySchedule(1500);
  }
}
window.syncNow = syncNow;
function syRerender() {
  if (!['settings', 'users', 'auth'].includes(cur().name) && !syGate()) return;
  const modal = document.getElementById('modal');
  if (modal && modal.classList.contains('hidden')) render();
}
function sySchedule(ms) {
  if (!syncLoggedIn()) return;
  clearTimeout(syTimer);
  syTimer = setTimeout(() => syncNow(false), ms);
}
const _saveSync = save;
save = function () { _saveSync(); if (!syApplying) { SY_DIRTY = true; sySchedule(3000); } };
if (window.setAsset) { const _setAssetSync = setAsset; setAsset = function (k, v) { SY_DIRTY = true; if (!syApplying) sySchedule(3000); return _setAssetSync(k, v); }; }

function syWipeLocal() {
  DB = fix({}); DB_CORRUPT = null;
  if (window.setAsset) { setAsset('logo', ''); setAsset('stamp', ''); }
  syApplying = true; try { save(); } finally { syApplying = false; }
}
// پایان نشست. wipe: اطلاعات این حساب از گوشی پاک شود (روی سرور می‌ماند)
function syEndSession(callServer, wipe) {
  if (callServer && SY.token) syApi('logout', {}).catch(() => { });
  SY = { snap: {}, url: SY.url, lastUser: SY.user ? SY.user.username : SY.lastUser };
  sySave();
  if (wipe) syWipeLocal();
  stack = [{ name: 'home' }]; closeModal(); render();
}

// ---------- حساب‌ها (اطلاعات جدا برای هر کاربر، قابل اشتراک) ----------
function syWsName(w) {
  if (!w) return '';
  if (w.role === 'owner') return 'حساب خودم';
  return 'حساب ' + (w.owner.name || w.owner.username);
}
function syCurWs() { return (SY.wsList || []).find(w => w.id === SY.ws) || null; }
let syMeAt = 0;
async function syRefreshMe(force) {
  if (!syncLoggedIn() || typeof fetch !== 'function') return;
  if (!force && Date.now() - syMeAt < 30000) return;
  syMeAt = Date.now();
  let r;
  try { r = await syApi('me', {}); } catch (e) {
    if (e.code === 'bad_token' || e.code === 'no_token' || e.code === 'disabled') { toast(e.message); syEndSession(false, true); }
    return;
  }
  SY.user = r.user; SY.wsList = r.workspaces; SY.ownWs = r.ownWs;
  // نسخه قبلی برنامه حساب نداشت: همان حسابی که اطلاعات قبلی در آن است انتخاب می‌شود
  if (!SY.ws) { SY.ws = r.ws; sySchedule(300); }
  const seen = SY.seenWs || [];
  const fresh = r.workspaces.filter(w => w.role !== 'owner' && !seen.includes(w.id));
  SY.seenWs = r.workspaces.map(w => w.id);
  sySave();
  if (fresh.length && seen.length) toast(`${fresh.map(w => w.owner.name || w.owner.username).join('، ')} حسابش را با شما به اشتراک گذاشت؛ از تنظیمات وارد آن شوید`);
  if (SY.ws && !r.workspaces.some(w => w.id === SY.ws)) { toast('دسترسی شما به حساب مشترک برداشته شد'); syEnterWs(SY.ownWs, false); return; }
  syRerender();
}
// ورود به یک حساب: اطلاعات حساب فعلی (که روی سرور هست) از گوشی برداشته و اطلاعات حساب جدید دریافت می‌شود
async function syEnterWs(id, checkPending) {
  if (!id) { if (!checkPending) syRefreshMe(true).then(() => { if (SY.ownWs) syEnterWs(SY.ownWs, false); }); return; }
  if (checkPending) {
    if (syBusy) { toast('کمی صبر کنید؛ همگام‌سازی در جریان است'); return; }
    await syncNow(false);
    const pend = (await syPendingAsync()).length;
    if (pend) { toast(`${faDigits(pend)} تغییر هنوز به سرور نرسیده؛ اول اینترنت را وصل کنید و «همگام‌سازی الان» را بزنید`); return; }
    try { await syApi('use_ws', { ws: id }); } catch (e) { toast(e.message); return; }
  } else {
    syApi('use_ws', { ws: id }).catch(() => { });
  }
  syWipeLocal();
  SY.ws = id; SY.rev = 0; SY.snap = {}; SY.fresh = true; SY.last = 0; SY_DIRTY = true; SY_CACHE.clear();
  sySave(); SY_MEMBERS = null;
  stack = [{ name: 'home' }]; closeModal(); render();
  toast('در حال دریافت اطلاعات حساب…');
  syncNow(false).then(ok => { if (ok) toast('اطلاعات حساب دریافت شد'); });
}
window.syEnterWs = syEnterWs;

let SY_MEMBERS = null, SY_MEMBERS_WS = 0;
function syLoadMembers() {
  const ws = SY.ws;
  syApi('share_list', { ws }).then(r => { SY_MEMBERS = r.members; SY_MEMBERS_WS = ws; syRerender(); }).catch(() => { });
}
function syShareAdd() {
  openForm('اشتراک حساب با شخص دیگر', [
    { k: 'username', label: 'شماره موبایل (نام کاربری) آن شخص', ltr: true, req: true, hint: 'آن شخص باید قبلاً در برنامه ثبت‌نام کرده باشد. بعد از افزودن، او هم همین اطلاعات را می‌بیند و می‌تواند تغییر دهد.' },
  ], o => {
    syApi('share_add', { ws: SY.ws, username: syNormPhone(o.username) || o.username }).then(r => {
      closeModal(); toast(`${r.member.name || r.member.username} به حساب اضافه شد`); syLoadMembers();
    }).catch(e => toast(e.message));
    return false;
  });
}
window.syShareAdd = syShareAdd;
function syShareRemove(uid, name) {
  const self = SY.user && uid === SY.user.id;
  askConfirm(self ? 'از این حساب مشترک خارج می‌شوید؟ دیگر اطلاعات آن را نمی‌بینید.' : `دسترسی «${name}» به این حساب برداشته شود؟`, () => {
    syApi('share_remove', { ws: SY.ws, user_id: uid }).then(() => {
      if (self) { syRefreshMe(true); syEnterWs(SY.ownWs, false); }
      else { toast('دسترسی برداشته شد'); syLoadMembers(); }
    }).catch(e => toast(e.message));
  });
}
window.syShareRemove = syShareRemove;

// ---------- ورود و ثبت‌نام ----------
function syDeviceLabel() {
  try { if (window.Android && Android.deviceName) return String(Android.deviceName()).slice(0, 100); } catch (e) { }
  const m = /Android [^;]*;\s*([^)]+)\)/.exec((navigator && navigator.userAgent) || '');
  return m ? m[1].trim().slice(0, 100) : 'web';
}
function syNormPhone(s) {
  s = toEn(s).replace(/[\s\-()]/g, '');
  let m = /^(\+98|0098|98)(9\d{9})$/.exec(s);
  if (m) return '0' + m[2];
  if (/^9\d{9}$/.test(s)) return '0' + s;
  return /^09\d{9}$/.test(s) ? s : '';
}
// نمای ورود/ثبت‌نام؛ تا وقتی کاربر وارد نشده، به‌جای برنامه نمایش داده می‌شود
let SY_AUTH = { mode: 'register', busy: false, err: '', showUrl: false };
function syGate() { return typeof fetch === 'function' && !syncLoggedIn() && !DB_CORRUPT; }
window.authGate = () => syGate() ? 'auth' : null;
V.auth = () => {
  const reg = SY_AUTH.mode === 'register';
  // مقدارهای تایپ‌شده نگه داشته می‌شوند تا اگر صفحه دوباره ساخته شد (مثلاً برگشتن به برنامه) پاک نشوند
  const vals = SY_AUTH.vals || (SY_AUTH.vals = {});
  const inp = (id, label, attrs) => `<label class="fld">${label}<input id="${id}" ${attrs || ''} value="${esc(vals[id] != null ? vals[id] : (id === 'au_user' ? (SY.lastUser || '') : id === 'au_url' ? (SY.url || DEFAULT_SERVER) : ''))}" oninput="SY_AUTH.vals[this.id]=this.value"></label>`;
  let h = `<div style="text-align:center;margin:8px 0 14px"><img src="logo.png" alt="ایشیم" style="width:190px;max-width:60%"></div>
  <div class="card">
    <div class="seg" style="display:flex;gap:6px;margin-bottom:12px">
      <button class="btn ${reg ? 'pri' : ''}" style="flex:1;margin:0" onclick="syAuthMode('register')">ثبت‌نام</button>
      <button class="btn ${reg ? '' : 'pri'}" style="flex:1;margin:0" onclick="syAuthMode('login')">ورود</button>
    </div>
    ${reg ? `<div class="mut" style="margin-bottom:8px">برای شروع، با شماره موبایل خود یک حساب بسازید. اطلاعات شما روی سرور ذخیره می‌شود و در هر گوشی با همین شماره و رمز در دسترس است.</div>` : `<div class="mut" style="margin-bottom:8px">اگر قبلاً حساب ساخته‌اید، با شماره و رمز خود وارد شوید.</div>`}
    ${reg ? inp('au_name', 'نام و نام خانوادگی', 'autocomplete="name"') : ''}
    ${inp('au_user', reg ? 'شماره موبایل' : 'شماره موبایل (یا نام کاربری)', `inputmode="${reg ? 'tel' : 'text'}" dir="ltr" style="text-align:left" placeholder="09121234567" autocomplete="username"`)}
    ${inp('au_pass', reg ? 'رمز عبور (حداقل ۸ کاراکتر)' : 'رمز عبور', 'type="password" dir="ltr" style="text-align:left" autocomplete="' + (reg ? 'new-password' : 'current-password') + '"')}
    ${reg ? inp('au_pass2', 'تکرار رمز عبور', 'type="password" dir="ltr" style="text-align:left" autocomplete="new-password"') : ''}
    ${SY_AUTH.showUrl ? inp('au_url', 'نشانی سرور', 'dir="ltr" style="text-align:left"') : ''}
    ${SY_AUTH.err ? `<div style="color:var(--bad);margin:8px 0">${esc(SY_AUTH.err)}</div>` : ''}
    <button class="btn pri wide" ${SY_AUTH.busy ? 'disabled' : ''} onclick="syAuthSubmit()">${SY_AUTH.busy ? 'لطفاً صبر کنید…' : reg ? 'ساخت حساب' : 'ورود'}</button>
    ${reg && syHasLocalData() ? '<div class="mut" style="margin-top:8px">اطلاعاتی که الان روی این گوشی هست، بعد از ثبت‌نام به حساب جدید شما منتقل می‌شود.</div>' : ''}
    <div class="mut" style="margin-top:10px;font-size:12px">برای اولین ورود، اینترنت لازم است. بعد از آن برنامه بدون اینترنت هم کار می‌کند.</div>
  </div>
  <div style="text-align:center"><button class="btn" style="background:none;box-shadow:none;font-size:12px;opacity:.7" onclick="SY_AUTH.showUrl=!SY_AUTH.showUrl;render()">تنظیمات سرور</button></div>`;
  return { title: 'ایشیم', html: h, logo: true };
};
function syAuthMode(m) { SY_AUTH.mode = m; SY_AUTH.err = ''; render(); }
window.syAuthMode = syAuthMode;
const syVal = id => { const el = document.getElementById(id); return el ? el.value : ''; };
async function syAuthSubmit() {
  if (SY_AUTH.busy) return;
  const reg = SY_AUTH.mode === 'register';
  const name = syVal('au_name').trim(), rawUser = syVal('au_user').trim(), pass = syVal('au_pass'), pass2 = syVal('au_pass2');
  const url = syNormUrl(SY_AUTH.showUrl ? syVal('au_url') : (SY.url || DEFAULT_SERVER));
  const phone = syNormPhone(rawUser);
  const err = m => { SY_AUTH.err = m; render(); };
  if (reg) {
    if (!name) return err('نام را وارد کنید.');
    if (!phone) return err('شماره موبایل را درست وارد کنید (مثال: 09121234567).');
    if (pass.length < 8) return err('رمز باید حداقل ۸ کاراکتر باشد.');
    if (pass !== pass2) return err('رمز و تکرار آن یکی نیستند.');
  } else if (!rawUser || !pass) return err('شماره و رمز را وارد کنید.');
  if (!/^https:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?\//i.test(url)) return err('نشانی سرور باید با https:// شروع شود.');
  SY_AUTH.busy = true; SY_AUTH.err = ''; render();
  let r;
  try {
    r = await syApi(reg ? 'register' : 'login', { username: phone || rawUser, password: pass, name, device: syDeviceLabel() }, url);
  } catch (e) {
    SY_AUTH.busy = false;
    if (e.code === 'exists') SY_AUTH.mode = 'login';
    return err(e.message);
  }
  SY_AUTH.busy = false; SY_AUTH.err = ''; SY_AUTH.vals = {};
  syStartSession(url, r);
}
window.syAuthSubmit = syAuthSubmit;
function syStartSession(url, r) {
  const start = () => {
    SY = { url, token: r.token, deviceId: r.deviceId, user: r.user, ws: r.ws, ownWs: r.ownWs, wsList: r.workspaces,
      seenWs: r.workspaces.map(w => w.id), rev: 0, snap: {}, fresh: true, lastUser: r.user.username };
    SY_DIRTY = true; SY_CACHE.clear();
    sySave(); closeModal(); stack = [{ name: 'home' }]; render();
    toast(r.serverHasData ? 'وارد شدید؛ در حال دریافت اطلاعات…' : 'خوش آمدید!');
    syncNow(false);
  };
  if (r.serverHasData && syHasLocalData()) {
    window._syStart = () => {
      // پیش از جایگزینی، از اطلاعات فعلی فایل پشتیبان گرفته می‌شود
      try { exportData(); } catch (e) { }
      syWipeLocal();
      start();
    };
    window._syCancel = () => {
      fetch(url + 'index.php?r=logout', { method: 'POST', headers: { Authorization: 'Bearer ' + r.token, 'X-Eshim-Token': r.token } }).catch(() => { });
      closeModal();
    };
    showModal(`<div class="sheet"><div class="sh-head"><b>این حساب از قبل اطلاعات دارد</b></div><div class="sh-body">
      <p>روی سرور برای این حساب اطلاعات ثبت شده است و این گوشی هم اطلاعات جداگانه دارد. این دو را نمی‌توان بدون خطر تداخل یکی کرد.</p>
      <p>با «دریافت اطلاعات حساب»، اول یک فایل پشتیبان از اطلاعات فعلی این گوشی در پوشه Download ذخیره می‌شود و بعد اطلاعات حساب جایگزین آن می‌شود.</p></div>
      <div class="sh-foot"><button class="btn pri" onclick="_syStart()">دریافت اطلاعات حساب</button><button class="btn" onclick="_syCancel()">انصراف</button></div></div>`);
    return;
  }
  start();
}

async function syncLogout() {
  if (syBusy) { toast('کمی صبر کنید؛ همگام‌سازی در جریان است'); return; }
  await syncNow(false);
  const pend = (await syPendingAsync()).length;
  const msg = pend
    ? `${faDigits(pend)} تغییر هنوز به سرور نرسیده (اینترنت وصل نیست). اگر خارج شوید این تغییرات فقط در فایل پشتیبانی که الان ذخیره می‌شود می‌ماند. خارج می‌شوید؟`
    : 'از حساب خارج می‌شوید؟ اطلاعات روی سرور می‌ماند و با ورود دوباره برمی‌گردد.';
  askConfirm(msg, () => {
    if (pend) { try { exportData(); } catch (e) { } }
    syEndSession(true, true); toast('از حساب خارج شدید');
  });
}
window.syncLogout = syncLogout;
function syncChangePass() {
  openForm('تغییر رمز عبور', [
    { k: 'old', label: 'رمز فعلی', type: 'password', req: true },
    { k: 'n1', label: 'رمز جدید (حداقل ۸ کاراکتر)', type: 'password', req: true },
    { k: 'n2', label: 'تکرار رمز جدید', type: 'password', req: true },
  ], o => {
    if (o.n1.length < 8) { toast('رمز جدید باید حداقل ۸ کاراکتر باشد'); return false; }
    if (o.n1 !== o.n2) { toast('رمز جدید و تکرار آن یکی نیستند'); return false; }
    syApi('change_password', { old: o.old, new: o.n1 }).then(() => { closeModal(); toast('رمز عوض شد؛ گوشی‌های دیگر باید دوباره وارد شوند'); }).catch(e => toast(e.message));
    return false;
  });
}
window.syncChangePass = syncChangePass;

// ---------- کارت تنظیمات ----------
function syAgo(t) {
  if (!t) return 'هنوز انجام نشده';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'همین حالا';
  if (s < 3600) return faDigits(Math.round(s / 60)) + ' دقیقه پیش';
  if (s < 86400) return faDigits(Math.round(s / 3600)) + ' ساعت پیش';
  return faDigits(Math.round(s / 86400)) + ' روز پیش';
}
function syncCard() {
  if (!syncLoggedIn()) {
    return `<div class="card"><b>حساب کاربری</b>
      <div class="mut" style="margin:4px 0 10px">با ورود به حساب، اطلاعات روی سرور ذخیره و در هر گوشی در دسترس است.</div>
      <button class="btn pri wide" onclick="syAuthMode('login');tab('home')">${ic('in')} ورود یا ثبت‌نام</button></div>`;
  }
  syRefreshMe(false);
  const u = SY.user || {};
  const w = syCurWs();
  const isOwner = w ? w.role === 'owner' : true;
  if (SY_MEMBERS_WS !== SY.ws) { SY_MEMBERS = null; SY_MEMBERS_WS = SY.ws; syLoadMembers(); }
  const pend = SY_PEND;
  let h = `<div class="card"><div class="ct"><b>حساب کاربری</b><span class="badge ${syErr ? 'bad' : 'ok'}">${syBusy ? 'در حال همگام‌سازی' : syErr ? 'خطا' : 'متصل'}</span></div>
    <div class="kv"><span>کاربر</span><span>${esc(u.name || '')}</span></div>
    <div class="kv"><span>شماره / نام کاربری</span><span dir="ltr">${esc(u.username || '')}</span></div>
    <div class="kv"><span>حساب فعال</span><span>${esc(syWsName(w) || '—')}</span></div>
    <div class="kv"><span>آخرین همگام‌سازی</span><span>${syAgo(SY.last)}</span></div>
    <div class="kv"><span>تغییرات ارسال‌نشده</span><span>${faDigits(pend)}</span></div>
    ${syErr ? `<div class="mut" style="color:var(--bad);margin:6px 0">${esc(syErr)}</div>` : ''}
    <button class="btn pri wide" onclick="syncNow(true)">همگام‌سازی الان</button>
    <div class="row" style="gap:8px"><button class="btn" style="flex:1" onclick="syncChangePass()">تغییر رمز</button><button class="btn danger" style="flex:1" onclick="syncLogout()">خروج از حساب</button></div></div>`;
  // حساب‌های در دسترس
  const list = SY.wsList || [];
  if (list.length > 1) {
    h += `<div class="card"><b>حساب‌های در دسترس</b><div class="mut" style="margin:4px 0 8px">حساب‌هایی که دیگران با شما به اشتراک گذاشته‌اند. با ورود به هر حساب، اطلاعات همان حساب نمایش داده می‌شود.</div>`;
    for (const x of list) {
      h += `<div class="kv"><span>${esc(syWsName(x))}${x.role !== 'owner' ? ` <span class="mut" dir="ltr">${esc(x.owner.username)}</span>` : ''}</span>
        <span>${x.id === SY.ws ? '<span class="badge ok">فعال</span>' : `<button class="btn sm" style="margin:0" onclick="syEnterWs(${x.id},true)">ورود به این حساب</button>`}</span></div>`;
    }
    h += '</div>';
  }
  // اشتراک حساب فعال
  h += `<div class="card"><b>${isOwner ? 'اشتراک حساب من' : 'افراد این حساب'}</b>
    <div class="mut" style="margin:4px 0 8px">${isOwner ? 'با افزودن شماره یک کاربر دیگر، او هم همین اطلاعات را می‌بیند و می‌تواند ثبت و ویرایش کند.' : 'این حساب را صاحب آن با شما به اشتراک گذاشته است.'}</div>`;
  if (SY_MEMBERS === null) h += '<div class="mut">در حال دریافت…</div>';
  else {
    for (const m of SY_MEMBERS) {
      const me = SY.user && m.id === SY.user.id;
      h += `<div class="kv"><span>${esc(m.name || m.username)} ${me ? '(شما)' : ''} <span class="mut" dir="ltr">${esc(m.username)}</span></span>
        <span>${m.role === 'owner' ? '<span class="badge y">صاحب حساب</span>' : (isOwner || me) ? `<button class="btn sm danger" style="margin:0" onclick='syShareRemove(${m.id},${jsq(m.name || m.username)})'>${me ? 'خروج' : 'حذف'}</button>` : ''}</span></div>`;
    }
  }
  if (isOwner) h += `<button class="btn dark wide" onclick="syShareAdd()">افزودن شخص با شماره</button>`;
  h += '</div>';
  if (u.role === 'admin') h += `<div class="card"><button class="btn wide" style="margin:0" onclick="go('users')">مدیریت کاربران سرور (بازنشانی رمز)</button></div>`;
  return h;
}
window.syncCard = syncCard;

// ---------- مدیریت کاربران سرور (فقط مدیر) ----------
let SY_USERS = null, SY_USERS_ERR = '';
function syLoadUsers() {
  syApi('users', {}).then(r => { SY_USERS = r.users; SY_USERS_ERR = ''; if (cur().name === 'users') render(); })
    .catch(e => { SY_USERS_ERR = e.message; if (cur().name === 'users') render(); });
}
V.users = () => {
  if (!syncLoggedIn()) return { title: 'کاربران', html: '<div class="card mut">ابتدا وارد حساب شوید.</div>' };
  if (SY_USERS === null && !SY_USERS_ERR) { syLoadUsers(); }
  let h = '';
  if (SY_USERS_ERR) h += `<div class="card"><div style="color:var(--bad)">${esc(SY_USERS_ERR)}</div><button class="btn wide" onclick="SY_USERS_ERR='';SY_USERS=null;render()">تلاش دوباره</button></div>`;
  else if (SY_USERS === null) h += '<div class="card mut">در حال دریافت فهرست کاربران…</div>';
  else {
    h += '<div class="mut" style="margin:0 4px 8px">همه کسانی که ثبت‌نام کرده‌اند. اگر کسی رمزش را فراموش کرد، از این‌جا رمز جدید بگذارید. کاربر غیرفعال نمی‌تواند وارد شود.</div>';
    for (const u of SY_USERS) {
      h += `<div class="card" onclick="syUserForm(${u.id})" style="cursor:pointer"><div class="ct"><b>${esc(u.name || u.username)}</b>
        <span class="badge ${u.active ? (u.role === 'admin' ? 'y' : 'ok') : 'bad'}">${!u.active ? 'غیرفعال' : u.role === 'admin' ? 'مدیر سرور' : 'کاربر'}</span></div>
        <div class="mut" dir="ltr" style="text-align:right">${esc(u.username)}</div></div>`;
    }
  }
  return { title: 'کاربران سرور', html: h };
};
function syUserForm(id) {
  const u = (SY_USERS || []).find(x => x.id === id);
  if (!u) return;
  openForm('ویرایش کاربر', [
    { k: 'name', label: 'نام', value: u.name },
    { k: 'password', label: 'رمز جدید (خالی = بدون تغییر)', type: 'password' },
    { k: 'role', label: 'نقش', type: 'select', value: u.role, opts: [['user', 'کاربر'], ['admin', 'مدیر سرور']] },
    { k: 'active', label: 'وضعیت', type: 'select', value: u.active ? '1' : '0', opts: [['1', 'فعال'], ['0', 'غیرفعال']] },
  ], o => {
    if (o.password && o.password.length < 8) { toast('رمز باید حداقل ۸ کاراکتر باشد'); return false; }
    syApi('user_save', { id: u.id, name: o.name, role: o.role, active: o.active === '1', password: o.password })
      .then(() => { closeModal(); toast('ذخیره شد'); SY_USERS = null; syLoadUsers(); }).catch(e => toast(e.message));
    return false;
  });
}
window.syUserForm = syUserForm;

// ---------- راه‌اندازی ----------
if (syncLoggedIn()) {
  // اگر شناسه بعدی خارج از بازه این دستگاه است، اصلاح می‌شود (بدون تغییر رکوردها)
  const lo = SY.deviceId * ID_RANGE;
  if (!(DB.seq >= lo && DB.seq < lo + ID_RANGE)) DB.seq = syMaxInRange(lo, lo + ID_RANGE) + 1;
  syRefreshMe(true);
  sySchedule(800);
}
if (syGate()) render();
if (typeof setInterval === 'function') setInterval(() => { if (!document.hidden) syncNow(false); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { sySchedule(500); syRefreshMe(false); } });
if (typeof window.addEventListener === 'function') window.addEventListener('online', () => sySchedule(500));
