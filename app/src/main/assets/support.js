'use strict';
// ===================== پشتیبانی و پیشنهادها (تیکت) =====================
// کاربر از تنظیمات پیشنهاد، گزارش مشکل یا سؤال می‌فرستد؛ سرور آن را نگه می‌دارد و به ایمیل
// پشتیبانی (info@eshim.ir) هم می‌فرستد. جواب مدیر در همین بخش برنامه دیده می‌شود.
const TK_KINDS = [['suggest', 'پیشنهاد'], ['bug', 'گزارش مشکل'], ['question', 'سؤال']];
const TK_STATUS = { open: ['در انتظار پاسخ', 'y'], answered: ['پاسخ داده شد', 'ok'], closed: ['بسته شد', ''] };
const TK_SEEN_KEY = 'eshim_tk';
let TK = { list: null, err: '', admin: false, all: true, thread: null, threadId: 0, threadErr: '', at: 0, unread: 0 };

const tkKind = k => (TK_KINDS.find(x => x[0] === k) || TK_KINDS[2])[1];
function tkWhen(t) {
  if (!t) return '';
  const d = new Date(t);
  const j = jdnToJ(J.g2d(d.getFullYear(), d.getMonth() + 1, d.getDate()));
  return faDigits(j + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'));
}
// تیکت خوانده‌نشده: برای کاربر، پاسخ تازه مدیر؛ برای مدیر، پیام تازه کاربر
function tkUnread(t) {
  if (!SY.user) return false;
  const mine = t.user && t.user.id === SY.user.id;
  if (mine) return t.status === 'answered' && t.updated > t.userSeen;
  return TK.admin && t.status === 'open' && t.updated > t.adminSeen;
}
function tkCount() { return (TK.list || []).filter(tkUnread).length; }
function tkRerender(names) { if (names.includes(cur().name)) render(); }

function tkUserCheck() {
  const uid = SY.user ? SY.user.id : 0;
  if (TK.uid !== uid) Object.assign(TK, { uid, list: null, err: '', admin: false, all: true, thread: null, threadId: 0, threadErr: '', at: 0, unread: 0 });
}
function tkLoad(force) {
  if (!syncLoggedIn()) return Promise.resolve();
  tkUserCheck();
  if (!force && TK.at && Date.now() - TK.at < 60000 && TK.list) return Promise.resolve();
  TK.at = Date.now();
  return syApi('ticket_list', { all: TK.all ? 1 : 0 }).then(r => {
    TK.list = r.tickets || []; TK.admin = !!r.admin; TK.err = '';
    const n = tkCount();
    // اعلان کوتاه وقتی پاسخ تازه‌ای رسیده که قبلاً اعلام نشده
    let seen = 0; try { seen = +localStorage.getItem(TK_SEEN_KEY) || 0; } catch (e) { }
    const newest = Math.max(0, ...TK.list.filter(tkUnread).map(t => t.updated));
    if (n && newest > seen && cur().name !== 'support' && cur().name !== 'ticket') {
      toast(TK.admin ? 'پیام تازه در پشتیبانی دارید' : 'پشتیبانی به پیام شما پاسخ داد');
      try { localStorage.setItem(TK_SEEN_KEY, String(newest)); } catch (e) { }
    }
    TK.unread = n;
    tkRerender(['support', 'settings', 'home']);
  }).catch(e => { TK.err = e.message; tkRerender(['support']); });
}

function tkNew(kind) {
  openForm('پیام به پشتیبانی', [
    { k: 'kind', label: 'نوع پیام', type: 'select', opts: TK_KINDS, value: kind || 'suggest' },
    { k: 'subject', label: 'موضوع', req: true },
    { k: 'body', label: 'متن پیام', type: 'textarea', req: true,
      hint: 'هر چه دقیق‌تر بنویسید زودتر رسیدگی می‌شود. برای گزارش مشکل بنویسید در کدام صفحه و بعد از زدن چه دکمه‌ای پیش آمد.' },
  ], o => {
    if (o.subject.length > 150) { toast('موضوع کوتاه‌تر باشد (حداکثر ۱۵۰ حرف)'); return false; }
    const btn = document.querySelector('.sh-foot .btn.pri');
    if (btn) { btn.disabled = true; btn.textContent = 'در حال ارسال…'; }
    syApi('ticket_create', {
      kind: o.kind, subject: o.subject, body: o.body,
      app: (appVersion() || '') + (updMyCodeSafe() ? ' (' + updMyCodeSafe() + ')' : ''), device: syDeviceLabel(),
    }).then(r => {
      closeModal(); toast('پیام شما فرستاده شد؛ جواب در همین بخش می‌آید');
      TK.at = 0; tkLoad(true);
      tkOpen(r.id);
    }).catch(e => { toast(e.message); if (btn) { btn.disabled = false; btn.textContent = 'ذخیره'; } });
    return false;
  });
  const b = document.querySelector('.sh-foot .btn.pri');
  if (b) b.textContent = 'ارسال';
}
function updMyCodeSafe() { try { return typeof updMyCode === 'function' ? updMyCode() : 0; } catch (e) { return 0; } }
window.tkNew = tkNew;

V.support = () => {
  if (!syncLoggedIn()) return { title: 'پشتیبانی', html: '<div class="card mut">ابتدا وارد حساب شوید.</div>' };
  tkUserCheck();
  if (TK.list === null && !TK.err) tkLoad(true);
  let h = `<div class="card"><b>پشتیبانی و پیشنهادها</b>
    <div class="mut" style="margin:4px 0 10px">پیشنهاد برای بهتر شدن برنامه، گزارش مشکل یا هر سؤالی دارید بفرستید. پاسخ در همین بخش برایتان می‌آید.</div>
    <div class="row" style="gap:8px;flex-wrap:wrap">
      <button class="btn pri" style="flex:1;margin:0" onclick="tkNew('suggest')">پیشنهاد</button>
      <button class="btn dark" style="flex:1;margin:0" onclick="tkNew('bug')">گزارش مشکل</button>
      <button class="btn" style="flex:1;margin:0" onclick="tkNew('question')">سؤال</button></div></div>`;
  if (TK.admin) {
    h += `<div class="row" style="gap:8px;margin:0 0 10px"><button class="btn sm ${TK.all ? 'pri' : ''}" style="flex:1;margin:0" onclick="TK.all=true;TK.list=null;render()">همه تیکت‌ها</button><button class="btn sm ${TK.all ? '' : 'pri'}" style="flex:1;margin:0" onclick="TK.all=false;TK.list=null;render()">پیام‌های خودم</button></div>`;
  }
  if (TK.err) h += `<div class="card"><div style="color:var(--bad)">${esc(TK.err)}</div><button class="btn wide" onclick="TK.err='';TK.list=null;render()">تلاش دوباره</button></div>`;
  else if (TK.list === null) h += '<div class="card mut">در حال دریافت…</div>';
  else if (!TK.list.length) h += '<div class="card mut" style="text-align:center">هنوز پیامی نفرستاده‌اید.</div>';
  else {
    for (const t of TK.list) {
      const st = TK_STATUS[t.status] || TK_STATUS.open;
      const other = TK.admin && t.user && SY.user && t.user.id !== SY.user.id;
      h += `<div class="card" style="cursor:pointer${tkUnread(t) ? ';border:2px solid var(--yellow)' : ''}" onclick="tkOpen(${t.id})">
        <div class="ct"><b>${esc(t.subject)}</b><span class="badge ${st[1]}">${tkUnread(t) ? 'پیام تازه' : st[0]}</span></div>
        <div class="mut">${esc(tkKind(t.kind))} · ${tkWhen(t.updated)} · شماره ${faDigits(t.id)}</div>
        ${other ? `<div class="mut">${esc(t.user.name || '')} <span dir="ltr">${esc(t.user.username)}</span></div>` : ''}</div>`;
    }
  }
  h += `<div class="mut" style="text-align:center;margin:10px 4px">ایمیل پشتیبانی: <span dir="ltr">info@eshim.ir</span></div>`;
  return { title: 'پشتیبانی و پیشنهادها', html: h, fab: 'tkNew()' };
};

function tkLoadThread(id) {
  TK.threadId = id; TK.threadErr = '';
  syApi('ticket_get', { id }).then(r => {
    TK.thread = r;
    // خوانده شد
    if (TK.list) { const t = TK.list.find(x => x.id === id); if (t) Object.assign(t, r.ticket); TK.unread = tkCount(); }
    tkRerender(['ticket']);
  }).catch(e => { TK.threadErr = e.message; tkRerender(['ticket']); });
}
function tkOpen(id) { TK.threadId = 0; TK.thread = null; go('ticket', { id }); }
window.tkOpen = tkOpen;
V.ticket = p => {
  if (TK.threadId !== p.id) { TK.thread = null; tkLoadThread(p.id); }
  if (TK.threadErr) return { title: 'پیام', html: `<div class="card"><div style="color:var(--bad)">${esc(TK.threadErr)}</div><button class="btn wide" onclick="TK.threadId=0;render()">تلاش دوباره</button></div>` };
  if (!TK.thread) return { title: 'پیام', html: '<div class="card mut">در حال دریافت…</div>' };
  const t = TK.thread.ticket, st = TK_STATUS[t.status] || TK_STATUS.open;
  const iAmOwner = t.user && SY.user && t.user.id === SY.user.id;
  let h = `<div class="card"><div class="ct"><b>${esc(t.subject)}</b><span class="badge ${st[1]}">${st[0]}</span></div>
    <div class="mut">${esc(tkKind(t.kind))} · شماره ${faDigits(t.id)}${!iAmOwner && t.user ? ` · ${esc(t.user.name || '')} <span dir="ltr">${esc(t.user.username)}</span>` : ''}</div>
    ${!iAmOwner && (t.app || t.device) ? `<div class="mut" dir="ltr" style="text-align:right">${esc(t.app)} · ${esc(t.device)}</div>` : ''}</div>`;
  for (const m of TK.thread.messages) {
    // پیام‌های طرف خودم سمت راست، طرف مقابل سمت چپ
    const mineSide = iAmOwner ? !m.admin : m.admin;
    h += `<div class="tk-msg ${mineSide ? 'me' : 'them'}"><div class="tk-who">${m.admin ? 'پشتیبانی ایشیمیز' : iAmOwner ? 'شما' : esc(t.user.name || t.user.username)}</div>
      <div class="tk-body">${esc(m.body)}</div><div class="tk-at">${tkWhen(m.created)}</div></div>`;
  }
  h += `<div class="card" style="margin-top:12px"><label class="fld" style="margin:0">${t.status === 'closed' ? 'این گفتگو بسته شده؛ با فرستادن پیام دوباره باز می‌شود.' : 'پیام جدید'}
      <textarea id="tk_reply" placeholder="${iAmOwner ? 'توضیح بیشتر یا جواب…' : 'پاسخ به کاربر…'}"></textarea></label>
    <div class="row" style="gap:8px;margin-top:8px"><button class="btn pri" style="flex:2;margin:0" onclick="tkReply(${t.id})">ارسال</button>
    ${t.status !== 'closed' ? `<button class="btn" style="flex:1;margin:0" onclick="tkClose(${t.id})">بستن گفتگو</button>` : ''}</div></div>`;
  return { title: 'پیام شماره ' + faDigits(t.id), html: h };
};
let tkSending = false;
function tkReply(id) {
  const el = document.getElementById('tk_reply');
  const body = el ? el.value.trim() : '';
  if (!body) { toast('متن پیام را بنویسید'); return; }
  if (tkSending) return;
  tkSending = true;
  syApi('ticket_reply', { id, body }).then(() => {
    toast('فرستاده شد'); TK.at = 0; tkLoadThread(id); tkLoad(true);
  }).catch(e => toast(e.message)).finally(() => { tkSending = false; });
}
function tkClose(id) {
  askConfirm('این گفتگو بسته شود؟', () => {
    syApi('ticket_close', { id }).then(() => { toast('گفتگو بسته شد'); TK.at = 0; tkLoadThread(id); tkLoad(true); }).catch(e => toast(e.message));
  });
}
window.tkReply = tkReply; window.tkClose = tkClose;

// دکمه در تنظیمات (زیر کارت حساب)
if (window.syncCard) {
  const _card = window.syncCard;
  window.syncCard = function () {
    let h = _card();
    if (!syncLoggedIn()) return h;
    const n = TK.uid === (SY.user && SY.user.id) ? TK.unread : 0;
    return h + `<div class="card"><button class="btn dark wide" style="margin:0" onclick="go('support')">پشتیبانی و پیشنهادها${n ? ` <span class="badge y">${faDigits(n)} پیام تازه</span>` : ''}</button></div>`;
  };
}
// پیام کوتاه بالای صفحه اصلی وقتی پاسخ تازه آمده
const _renderTk = render;
render = function () {
  _renderTk();
  if (!TK.unread || !syncLoggedIn() || TK.uid !== (SY.user && SY.user.id)) return;
  if (stack.length !== 1 || cur().name !== 'home' || (window.authGate && authGate())) return;
  const m = document.getElementById('main');
  if (m) m.insertAdjacentHTML('afterbegin', `<div class="card" style="border:2px solid var(--yellow);cursor:pointer;margin-bottom:12px" onclick="go('support')">
    <b>${TK.admin ? 'پیام تازه در پشتیبانی' : 'پشتیبانی به پیام شما پاسخ داد'}</b><div class="mut">برای دیدن بزنید</div></div>`);
};
// بررسی پاسخ‌های تازه: هنگام باز شدن برنامه و برگشت به آن (حداکثر هر ۱۰ دقیقه)
function tkPoll() {
  if (typeof fetch !== 'function' || !syncLoggedIn()) return;
  if (TK.at && Date.now() - TK.at < 600000) return;
  tkLoad(true);
}
setTimeout(tkPoll, 4000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tkPoll(); });
