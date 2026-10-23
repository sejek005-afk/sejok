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
  let a = 0x811c9dc5, b = 0x9747b28c;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c, 0x5bd1e995); b ^= b >>> 15;
  }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36) + s.length.toString(36);
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
function syCurrent() {
  const m = new Map();
  for (const c of SYNC_COLLS) for (const r of DB[c]) m.set(c + '|' + r.id, { c, id: String(r.id), s: sySer(c, r) });
  for (const k in DB.att) m.set('att|' + k, { c: 'att', id: k, s: JSON.stringify(DB.att[k]) });
  const inv = syInvSer(); if (inv) m.set('settings|inv', { c: 'settings', id: 'inv', s: inv });
  for (const k of ['logo', 'stamp']) { const s = syAssetSer(k); if (s) m.set('asset|' + k, { c: 'asset', id: k, s }); }
  return m;
}
function syPending(cur) {
  const out = [];
  for (const [k, x] of cur) if (SY.snap[k] !== syHash(x.s)) out.push({ k, c: x.c, id: x.id, s: x.s });
  for (const k in SY.snap) if (!cur.has(k)) { const i = k.indexOf('|'); out.push({ k, c: k.slice(0, i), id: k.slice(i + 1), s: null }); }
  return out;
}
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
async function syncNow(manual) {
  if (!syncLoggedIn() || DB_CORRUPT || typeof fetch !== 'function') return false;
  if (syBusy) { syAgain = true; return false; }
  syBusy = true; syAgain = false;
  const startUser = SY.token;
  let anyChange = false;
  try {
    // ۱) اول دریافت تغییرات دیگران
    let more = true;
    while (more) {
      const r = await syApi('sync', { since: SY.rev || 0, changes: [] });
      if (SY.token !== startUser) return false;
      if (syApplyPage(r.changes)) { anyChange = true; syAfterApply(); }
      SY.rev = r.rev; more = !!r.more; sySave();
    }
    // ۲) ارسال تغییرات این گوشی (در بسته‌های کوچک)
    const pend = syPending(syCurrent());
    for (let i = 0; i < pend.length;) {
      const chunk = []; let bytes = 0;
      while (i < pend.length && chunk.length < 300 && (bytes < 2000000 || !chunk.length)) { const x = pend[i++]; chunk.push(x); bytes += x.s ? x.s.length : 20; }
      const body = '{"since":' + (SY.rev || 0) + ',"changes":[' + chunk.map(x => '{"c":' + JSON.stringify(x.c) + ',"id":' + JSON.stringify(x.id) + ',"d":' + (x.s == null ? 'null' : x.s) + '}').join(',') + ']}';
      const r = await syApi('sync', body);
      if (SY.token !== startUser) return false;
      for (const x of chunk) { if (x.s == null) delete SY.snap[x.k]; else SY.snap[x.k] = syHash(x.s); }
      if (syApplyPage(r.changes)) { anyChange = true; syAfterApply(); }
      SY.rev = r.rev; sySave();
      more = !!r.more;
      while (more) {
        const r2 = await syApi('sync', { since: SY.rev, changes: [] });
        if (syApplyPage(r2.changes)) { anyChange = true; syAfterApply(); }
        SY.rev = r2.rev; more = !!r2.more; sySave();
      }
    }
    if (anyChange) { syncAtt(); }
    SY.last = Date.now(); syErr = ''; sySave();
    if (manual) toast('همگام‌سازی انجام شد');
    return true;
  } catch (e) {
    if (e.code === 'bad_token' || e.code === 'no_token' || e.code === 'disabled') {
      syErr = e.message;
      syEndSession(false);
      toast(e.message);
    } else {
      syErr = e.message || 'خطا در همگام‌سازی';
      if (manual) toast(syErr);
    }
    return false;
  } finally {
    syBusy = false;
    if (cur().name === 'settings' || cur().name === 'users') { const modal = document.getElementById('modal'); if (modal && modal.classList.contains('hidden')) render(); }
    if (syAgain) sySchedule(1500);
  }
}
window.syncNow = syncNow;
function sySchedule(ms) {
  if (!syncLoggedIn()) return;
  clearTimeout(syTimer);
  syTimer = setTimeout(() => syncNow(false), ms);
}
const _saveSync = save;
save = function () { _saveSync(); if (!syApplying) sySchedule(3000); };

// پایان نشست: اطلاعات روی گوشی می‌ماند، اما وضعیت همگام‌سازی پاک می‌شود
function syEndSession(callServer) {
  if (callServer && SY.token) syApi('logout', {}).catch(() => { });
  SY = { snap: {}, url: SY.url, lastUser: SY.user ? SY.user.username : SY.lastUser };
  sySave();
}

// ---------- ورود ----------
function syDeviceLabel() {
  try { if (window.Android && Android.deviceName) return String(Android.deviceName()).slice(0, 100); } catch (e) { }
  const m = /Android [^;]*;\s*([^)]+)\)/.exec((navigator && navigator.userAgent) || '');
  return m ? m[1].trim().slice(0, 100) : 'web';
}
function syncLoginForm() {
  openForm('ورود به حساب', [
    { k: 'url', label: 'نشانی سرور', value: SY.url || DEFAULT_SERVER, ltr: true, req: true },
    { k: 'username', label: 'نام کاربری', value: SY.lastUser || '', ltr: true, req: true },
    { k: 'password', label: 'رمز عبور', type: 'password', req: true },
  ], o => { syDoLogin(o); return false; });
}
let syLoginBusy = false;
async function syDoLogin(o) {
  if (syLoginBusy) return;
  const url = syNormUrl(o.url);
  if (!/^https:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?\//i.test(url)) { toast('نشانی سرور باید با https:// شروع شود'); return; }
  syLoginBusy = true; toast('در حال ورود…');
  let r;
  try { r = await syApi('login', { username: o.username, password: o.password, device: syDeviceLabel() }, url); }
  catch (e) { toast(e.message); return; }
  finally { syLoginBusy = false; }
  const start = () => {
    SY = { url, token: r.token, deviceId: r.deviceId, user: r.user, rev: 0, snap: {}, lastUser: r.user.username };
    sySave(); closeModal(); render();
    toast('وارد شدید؛ در حال همگام‌سازی…');
    syncNow(true);
  };
  if (r.serverHasData && syHasLocalData()) {
    window._syStart = () => {
      // پیش از جایگزینی، از اطلاعات فعلی فایل پشتیبان گرفته می‌شود
      try { exportData(); } catch (e) { }
      DB = fix({}); if (window.setAsset) { setAsset('logo', ''); setAsset('stamp', ''); }
      syApplying = true; try { save(); } finally { syApplying = false; }
      start();
    };
    window._syCancel = () => {
      fetch(url + 'index.php?r=logout', { method: 'POST', headers: { Authorization: 'Bearer ' + r.token, 'X-Eshim-Token': r.token } }).catch(() => { });
      closeModal();
    };
    showModal(`<div class="sheet"><div class="sh-head"><b>سرور از قبل اطلاعات دارد</b></div><div class="sh-body">
      <p>روی سرور اطلاعات ثبت شده است و این گوشی هم اطلاعات جداگانه دارد. این دو را نمی‌توان بدون خطر تداخل یکی کرد.</p>
      <p>با «دریافت اطلاعات سرور»، اول یک فایل پشتیبان از اطلاعات فعلی این گوشی در پوشه Download ذخیره می‌شود و بعد اطلاعات سرور جایگزین آن می‌شود.</p></div>
      <div class="sh-foot"><button class="btn pri" onclick="_syStart()">دریافت اطلاعات سرور</button><button class="btn" onclick="_syCancel()">انصراف</button></div></div>`);
    return;
  }
  start();
}
window.syncLoginForm = syncLoginForm;
function syncLogout() {
  askConfirm('از حساب خارج می‌شوید؟ اطلاعات روی همین گوشی می‌ماند، اما دیگر با سرور همگام نمی‌شود.', () => {
    syEndSession(true); render(); toast('از حساب خارج شدید');
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
    return `<div class="card"><b>حساب کاربری و همگام‌سازی</b>
      <div class="mut" style="margin:4px 0 10px">با ورود به حساب، اطلاعات روی سرور ذخیره و بین همه گوشی‌ها مشترک می‌شود. برنامه بدون اینترنت هم کار می‌کند و هر وقت اینترنت وصل شد همگام می‌شود.</div>
      ${syErr ? `<div class="mut" style="color:var(--bad);margin-bottom:8px">${esc(syErr)}</div>` : ''}
      <button class="btn pri wide" onclick="syncLoginForm()">${ic('in')} ورود به حساب</button></div>`;
  }
  const u = SY.user || {};
  let pend = 0; try { pend = syPending(syCurrent()).length; } catch (e) { }
  let host = SY.url; try { host = new URL(SY.url).host; } catch (e) { }
  return `<div class="card"><div class="ct"><b>حساب کاربری</b><span class="badge ${syErr ? 'bad' : 'ok'}">${syBusy ? 'در حال همگام‌سازی' : syErr ? 'خطا' : 'متصل'}</span></div>
    <div class="kv"><span>کاربر</span><span>${esc(u.name || u.username || '')} ${u.role === 'admin' ? '(مدیر)' : ''}</span></div>
    <div class="kv"><span>سرور</span><span dir="ltr">${esc(host)}</span></div>
    <div class="kv"><span>آخرین همگام‌سازی</span><span>${syAgo(SY.last)}</span></div>
    <div class="kv"><span>تغییرات ارسال‌نشده</span><span>${faDigits(pend)}</span></div>
    ${syErr ? `<div class="mut" style="color:var(--bad);margin:6px 0">${esc(syErr)}</div>` : ''}
    <button class="btn pri wide" onclick="syncNow(true)">همگام‌سازی الان</button>
    ${u.role === 'admin' ? `<button class="btn dark wide" onclick="go('users')">مدیریت کاربران</button>` : ''}
    <div class="row" style="gap:8px"><button class="btn" style="flex:1" onclick="syncChangePass()">تغییر رمز</button><button class="btn danger" style="flex:1" onclick="syncLogout()">خروج از حساب</button></div></div>`;
}
window.syncCard = syncCard;

// ---------- مدیریت کاربران (فقط مدیر) ----------
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
    h += '<div class="mut" style="margin:0 4px 8px">همه کاربران به همه بخش‌ها دسترسی کامل دارند. کاربر غیرفعال نمی‌تواند وارد شود.</div>';
    for (const u of SY_USERS) {
      h += `<div class="card" onclick="syUserForm(${u.id})" style="cursor:pointer"><div class="ct"><b>${esc(u.name || u.username)}</b>
        <span class="badge ${u.active ? (u.role === 'admin' ? 'y' : 'ok') : 'bad'}">${!u.active ? 'غیرفعال' : u.role === 'admin' ? 'مدیر' : 'کاربر'}</span></div>
        <div class="mut" dir="ltr" style="text-align:right">${esc(u.username)}</div></div>`;
    }
  }
  return { title: 'مدیریت کاربران', html: h, fab: 'syUserForm(0)' };
};
function syUserForm(id) {
  const u = id ? (SY_USERS || []).find(x => x.id === id) : null;
  if (id && !u) return;
  const fields = [];
  if (!u) fields.push({ k: 'username', label: 'نام کاربری (حروف انگلیسی و عدد)', ltr: true, req: true });
  fields.push({ k: 'name', label: 'نام', value: u ? u.name : '' });
  fields.push({ k: 'password', label: u ? 'رمز جدید (خالی = بدون تغییر)' : 'رمز عبور (حداقل ۸ کاراکتر)', type: 'password', req: !u });
  fields.push({ k: 'role', label: 'نقش', type: 'select', value: u ? u.role : 'user', opts: [['user', 'کاربر'], ['admin', 'مدیر (مدیریت کاربران)']] });
  fields.push({ k: 'active', label: 'وضعیت', type: 'select', value: u ? (u.active ? '1' : '0') : '1', opts: [['1', 'فعال'], ['0', 'غیرفعال']] });
  openForm(u ? 'ویرایش کاربر' : 'کاربر جدید', fields, o => {
    if (!u && !/^[A-Za-z0-9_.-]{3,32}$/.test(o.username)) { toast('نام کاربری فقط حروف انگلیسی، عدد و . _ - (۳ تا ۳۲ کاراکتر)'); return false; }
    if ((o.password || !u) && o.password.length < 8) { toast('رمز باید حداقل ۸ کاراکتر باشد'); return false; }
    const body = { id: u ? u.id : 0, name: o.name, role: o.role, active: o.active === '1', password: o.password };
    if (!u) body.username = o.username;
    syApi('user_save', body).then(() => { closeModal(); toast('ذخیره شد'); SY_USERS = null; syLoadUsers(); }).catch(e => toast(e.message));
    return false;
  });
}
window.syUserForm = syUserForm;

// ---------- راه‌اندازی ----------
if (syncLoggedIn()) {
  // اگر شناسه بعدی خارج از بازه این دستگاه است، اصلاح می‌شود (بدون تغییر رکوردها)
  const lo = SY.deviceId * ID_RANGE;
  if (!(DB.seq >= lo && DB.seq < lo + ID_RANGE)) DB.seq = syMaxInRange(lo, lo + ID_RANGE) + 1;
  sySchedule(800);
}
if (typeof setInterval === 'function') setInterval(() => { if (!document.hidden) syncNow(false); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) sySchedule(500); });
if (typeof window.addEventListener === 'function') window.addEventListener('online', () => sySchedule(500));
