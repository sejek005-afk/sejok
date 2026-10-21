'use strict';
// ===================== یادداشت و یادآور =====================
const TAGS = { urgent: ['اضطراری', 'bad', '#C8452F'], important: ['مهم', 'y', '#F5B800'], normal: ['عادی', '', '#B9BFB6'] };
const TAG_ORDER = { urgent: 0, important: 1, normal: 2 };
const getNote = id => DB.notes.find(x => x.id === +id);

function noteTime(n) {
  if (!n.alarm || !n.date || !n.time) return null;
  const g = J.d2g(jToJdn(n.date));
  const [h, m] = n.time.split(':').map(Number);
  return new Date(g.gy, g.gm - 1, g.gd, h || 0, m || 0, 0).getTime();
}
function linkName(n) {
  if (!n.lt || !n.lid) return '';
  return n.lt === 'project' ? pname(n.lid) : n.lt === 'worker' ? wname(n.lid) : iname(n.lid);
}
const LINK_ICON = { project: 'site', worker: 'helmet', installer: 'ruler' };
function linkGo(id) {
  const n = getNote(id); if (!n || !n.lid) return;
  if (n.lt === 'project' && proj(n.lid)) go('project', { id: n.lid });
  else if (n.lt === 'worker' && worker(n.lid)) go('worker', { id: n.lid });
  else if (n.lt === 'installer' && inst(n.lid)) go('installer', { id: n.lid });
  else toast('این مورد حذف شده است');
}

// ---------- همگام‌سازی با زنگ‌های اندروید ----------
let _alarmT = null;
function syncAlarms() {
  clearTimeout(_alarmT);
  _alarmT = setTimeout(() => {
    if (!(window.Android && Android.syncAlarms)) return;
    const now = Date.now();
    const list = DB.notes.filter(n => !n.done).map(n => ({
      id: n.id, t: noteTime(n), title: n.title, tag: n.tag || 'normal',
      text: [linkName(n), n.text].filter(Boolean).join(' — '),
    })).filter(a => a.t && a.t > now);
    for (const c of DB.cheques) {
      const t = chequeTime(c);
      if (!t || t <= now) continue;
      list.push({ id: c.id, t, tag: c.dir === 'out' ? 'urgent' : 'important',
        title: `سررسید چک ${c.dir === 'out' ? 'پرداختی' : 'دریافتی'}: ${rnd(c.amount).toLocaleString('fa-IR')} ${c.cur || 'تومان'}`,
        text: [c.party, c.no ? 'شماره ' + c.no : '', c.bank, (c.before ? `سررسید: ${showDate(c.due)}` : '')].filter(Boolean).join(' — ') });
    }
    try { Android.syncAlarms(JSON.stringify(list)); } catch (e) { }
  }, 250);
}
// هر بار ذخیره، زنگ‌ها هم به‌روز شوند
const _saveOrig = save;
save = function () { _saveOrig(); syncAlarms(); };

function notifStatus() { try { return window.Android && Android.notifStatus ? Android.notifStatus() : 'web'; } catch (e) { return 'web'; } }
function askNotif() { try { if (window.Android && Android.requestNotif) Android.requestNotif(); } catch (e) { } setTimeout(render, 1500); }

// ---------- فرم ----------
function memoForm(id, preset) {
  const n = id ? getNote(id) : null;
  const ps = preset || {};
  const v = k => n ? n[k] : ps[k];
  const now = new Date();
  const defTime = p2((now.getHours() + 1) % 24) + ':00';
  openForm(n ? 'ویرایش یادداشت' : 'یادداشت جدید', [
    { k: 'title', label: 'عنوان', req: true, value: v('title') },
    { k: 'text', label: 'متن یادداشت', type: 'textarea', value: v('text') },
    { k: 'tag', label: 'برچسب', type: 'select', opts: [['normal', 'عادی'], ['important', 'مهم'], ['urgent', 'اضطراری']], value: v('tag') || 'normal' },
    { k: 'lt', label: 'مربوط به', type: 'select', opts: [['', '— هیچ‌کدام —'], ['project', 'پروژه'], ['worker', 'شاگرد'], ['installer', 'نصاب']], value: v('lt') || '' },
    { k: 'lp', label: 'پروژه', type: 'select', numeric: true, opts: projOpts(), value: v('lt') === 'project' ? v('lid') : '', when: o => o.lt === 'project' },
    { k: 'lw', label: 'شاگرد', type: 'select', numeric: true, opts: workerOpts(), value: v('lt') === 'worker' ? v('lid') : '', when: o => o.lt === 'worker' },
    { k: 'li', label: 'نصاب', type: 'select', numeric: true, opts: instOpts(), value: v('lt') === 'installer' ? v('lid') : '', when: o => o.lt === 'installer' },
    { k: 'alarm', label: 'یادآور (زنگ و اعلان)', type: 'select', opts: [['1', 'روشن'], ['0', 'خاموش']], value: n ? (n.alarm ? '1' : '0') : '1' },
    { k: 'date', label: 'تاریخ', type: 'date', value: v('date') || todayJ() },
    { k: 'time', label: 'ساعت', type: 'time', value: v('time') || defTime },
  ], o => {
    const lid = o.lt === 'project' ? o.lp : o.lt === 'worker' ? o.lw : o.lt === 'installer' ? o.li : null;
    if (o.lt && !lid) { toast('مورد مربوط را انتخاب کنید'); return false; }
    const alarm = o.alarm === '1';
    if (alarm && !/^\d{1,2}:\d{2}$/.test(o.time || '')) { toast('ساعت را وارد کنید'); return false; }
    const rec = { title: o.title, text: o.text, tag: o.tag, lt: o.lt || null, lid: lid || null, alarm, date: o.date, time: o.time };
    const t = noteTime(rec);
    if (n) {
      const timeChanged = n.date !== rec.date || n.time !== rec.time || n.alarm !== rec.alarm;
      Object.assign(n, rec);
      if (timeChanged && t && t > Date.now()) n.done = false;
    } else DB.notes.push(Object.assign({ id: nid(), created: Date.now(), done: false }, rec));
    if (alarm) {
      if (t && t <= Date.now()) toast('زمان یادآور گذشته است؛ زنگ نمی‌خورد');
      else if (t) { toast('یادآور تنظیم شد: ' + showDate(rec.date) + ' ساعت ' + faDigits(rec.time)); if (notifStatus() === 'off') askNotif(); }
    }
  }, n ? () => { DB.notes = DB.notes.filter(x => x !== n); } : null);
}
function toggleDone(id) {
  const n = getNote(id); n.done = !n.done; save(); render();
  toast(n.done ? 'انجام شد' : 'برگشت به یادداشت‌های فعال');
}

// ---------- نمایش ----------
function timeLabel(n) {
  const t = noteTime(n);
  if (!n.date) return '';
  const today = todayJ();
  const d = n.date === today ? 'امروز' : n.date === jdnToJ(todayJdn() + 1) ? 'فردا' : n.date === jdnToJ(todayJdn() - 1) ? 'دیروز' : showDate(n.date);
  const late = t && t <= Date.now() && !n.done;
  return `<span class="${late ? 'late' : ''}">${ic(n.alarm ? 'bell' : 'cal')}${d}${n.alarm && n.time ? ' ساعت ' + faDigits(n.time) : ''}${late ? ' (گذشته)' : ''}</span>`;
}
function noteCard(n) {
  const tg = TAGS[n.tag] || TAGS.normal;
  return `<div class="note ${esc(n.tag || 'normal')} ${n.done ? 'done' : ''}">
    <button class="chk ${n.done ? 'on' : ''}" onclick="toggleDone(${n.id})" aria-label="انجام شد">${ic('check')}</button>
    <div class="body" onclick="memoForm(${n.id})"><div class="ct"><span class="nt" style="flex:1">${esc(n.title)}</span>${n.tag !== 'normal' ? `<span class="badge ${tg[1]}">${tg[0]}</span>` : ''}</div>
    ${n.text ? `<div class="tx2">${esc(n.text)}</div>` : ''}
    <div class="meta">${timeLabel(n)}${n.lt && n.lid ? `<span class="chip" onclick="event.stopPropagation();linkGo(${n.id})">${ic(LINK_ICON[n.lt])}${esc(linkName(n))}</span>` : ''}</div></div></div>`;
}
function sortNotes(list) {
  return list.sort((a, b) => {
    const ta = noteTime(a), tb = noteTime(b);
    if (ta && tb) return ta - tb;
    if (ta) return -1; if (tb) return 1;
    return (TAG_ORDER[a.tag] - TAG_ORDER[b.tag]) || (b.created || 0) - (a.created || 0);
  });
}
function overdueCount() {
  const now = Date.now(), t0 = todayJ();
  return DB.notes.filter(n => !n.done && n.alarm && noteTime(n) && noteTime(n) <= now).length
    + DB.cheques.filter(c => c.status === 'pending' && c.due && c.due <= t0).length;
}
window.NAV_BADGE = Object.assign(window.NAV_BADGE || {}, { notes: overdueCount });

function modeTabs(m) {
  const due = DB.cheques.filter(c => c.status === 'pending' && c.due && c.due <= todayJ()).length;
  return `<div class="tabs">${[['notes', 'یادداشت‌ها'], ['cheques', 'چک‌ها' + (due ? ` (${faDigits(due)})` : '')]].map(x => `<button class="${m === x[0] ? 'on' : ''}" onclick="setSub('m','${x[0]}')">${x[1]}</button>`).join('')}</div>`;
}
V.notes = r => {
  if (r.m === 'cheques') return chequesView(r);
  const f = r.f || 'active', tg = r.t || '';
  let list = DB.notes.filter(n => f === 'done' ? n.done : !n.done);
  if (tg) list = list.filter(n => (n.tag || 'normal') === tg);
  list = f === 'done' ? list.sort((a, b) => (b.created || 0) - (a.created || 0)) : sortNotes(list);
  let h = modeTabs('notes');
  const ns = notifStatus();
  if (ns === 'off') h += `<div class="warn">${ic('bell')}<div style="flex:1">اعلان‌های برنامه خاموش است؛ یادآورها زنگ نمی‌خورند.</div><button class="btn sm dark" onclick="askNotif()">روشن کردن</button></div>`;
  h += `<div class="chips">${[['active', 'فعال'], ['done', 'انجام‌شده']].map(x => `<button class="${f === x[0] ? 'on' : ''}" onclick="setSub('f','${x[0]}')">${x[1]}</button>`).join('')}
    <span style="width:1px;background:var(--line);margin:0 2px"></span>
    ${[['', 'همه'], ['urgent', 'اضطراری'], ['important', 'مهم'], ['normal', 'عادی']].map(x => `<button class="${tg === x[0] ? 'on' : ''}" onclick="setSub('t','${x[0]}')">${x[0] ? `<span class="d" style="background:${TAGS[x[0]][2]}"></span>` : ''}${x[1]}</button>`).join('')}</div>`;
  if (!list.length) h += f === 'done' ? empty('یادداشت انجام‌شده‌ای نیست.', 'check', '') : empty('با دکمه + یادداشت بنویسید و برای آن تاریخ و ساعت یادآور بگذارید.', 'bell', 'یادداشتی نیست');
  else if (f === 'active') {
    const now = Date.now(), t0 = todayJ();
    const groups = [['گذشته', n => noteTime(n) && noteTime(n) <= now], ['امروز', n => n.date === t0], ['آینده', n => noteTime(n) || (n.date && n.date > t0)], ['بدون یادآور', () => true]];
    const used = new Set();
    for (const [title, fn] of groups) {
      const g = list.filter(n => !used.has(n) && fn(n));
      if (!g.length) continue;
      g.forEach(n => used.add(n));
      h += `<div class="sec">${title} <span class="mut" style="font-weight:400">${faDigits(g.length)}</span></div>` + g.map(noteCard).join('');
    }
  } else h += list.map(noteCard).join('');
  return { title: 'یادداشت‌ها', html: h, fab: 'memoForm()' };
};

// در شروع برنامه زنگ‌ها همگام شوند
syncAlarms();
render();

// ===================== چک‌ها =====================
const CH_ST = { pending: ['در انتظار', 'y'], cleared: ['وصول / پاس شد', 'ok'], bounced: ['برگشتی', 'bad'] };
function chequeTime(c) {
  if (!c.alarm || c.status !== 'pending' || !c.due) return null;
  const g = J.d2g(jToJdn(c.due) - (c.before || 0));
  const [h, m] = (c.time || '09:00').split(':').map(Number);
  return new Date(g.gy, g.gm - 1, g.gd, h || 0, m || 0, 0).getTime();
}
function chequeForm(id, preset) {
  const c = id ? DB.cheques.find(x => x.id === id) : null;
  const ps = preset || {};
  const v = k => c ? c[k] : ps[k];
  openForm(c ? 'ویرایش چک' : 'ثبت چک', [
    { k: 'dir', label: 'نوع چک', type: 'select', opts: [['in', 'دریافتی (از کارفرما / مشتری)'], ['out', 'پرداختی (به فروشنده / دیگران)']], value: v('dir') || 'in' },
    { k: 'amount', label: 'مبلغ (تومان)', type: 'money', req: true, value: v('amount') },
    { k: 'due', label: 'تاریخ سررسید', type: 'date', value: v('due') },
    { k: 'party', label: 'طرف حساب (صادرکننده / گیرنده)', value: v('party'), list: [...new Set(DB.cheques.map(x => x.party).filter(Boolean))] },
    { k: 'no', label: 'شماره چک / صیادی', value: v('no'), ltr: true },
    { k: 'bank', label: 'بانک', value: v('bank') },
    { k: 'status', label: 'وضعیت', type: 'select', opts: Object.entries(CH_ST).map(([k, x]) => [k, x[0]]), value: v('status') || 'pending' },
    { k: 'alarm', label: 'یادآور سررسید', type: 'select', opts: [['1', 'روشن'], ['0', 'خاموش']], value: c ? (c.alarm ? '1' : '0') : '1' },
    { k: 'before', label: 'زمان یادآوری', type: 'select', opts: [['0', 'روز سررسید'], ['1', 'یک روز قبل'], ['2', 'دو روز قبل'], ['3', 'سه روز قبل'], ['7', 'یک هفته قبل']], value: String(c ? c.before || 0 : 0), when: o => o.alarm === '1' },
    { k: 'time', label: 'ساعت یادآوری', type: 'time', value: v('time') || '09:00', when: o => o.alarm === '1' },
    { k: 'note', label: 'توضیحات', type: 'textarea', value: v('note') },
  ], o => {
    const rec = { dir: o.dir, amount: o.amount, due: o.due, party: o.party, no: toEn(o.no || ''), bank: o.bank, status: o.status, alarm: o.alarm === '1', before: +o.before || 0, time: o.time || '09:00', note: o.note };
    if (c) {
      Object.assign(c, rec);
      if (c.invoiceId && c.payId) { const inv = getInv(c.invoiceId); const p = inv && inv.pays.find(x => x.id === c.payId); if (p) { p.amount = rec.amount; } }
    } else DB.cheques.push(Object.assign({ id: nid(), created: Date.now() }, rec));
    const t = chequeTime(Object.assign({}, c || {}, rec));
    if (rec.status === 'pending' && rec.alarm) {
      if (t && t > Date.now()) { toast('یادآور سررسید تنظیم شد'); if (notifStatus() === 'off') askNotif(); }
      else toast('زمان یادآوری گذشته است');
    }
  }, c ? () => {
    DB.cheques = DB.cheques.filter(x => x !== c);
    if (c.invoiceId) { const inv = getInv(c.invoiceId); if (inv) inv.pays = inv.pays.filter(p => p.id !== c.payId); }
  } : null);
}
function chequeStatus(id, st) {
  const c = DB.cheques.find(x => x.id === id); c.status = st; save(); render();
  toast(st === 'cleared' ? 'وصول شد' : st === 'bounced' ? 'برگشتی ثبت شد' : 'در انتظار');
}
function chequeCard(c) {
  const t0 = todayJ();
  const late = c.status === 'pending' && c.due && c.due < t0;
  const today = c.status === 'pending' && c.due === t0;
  const st = CH_ST[c.status] || CH_ST.pending;
  const dleft = c.due ? jToJdn(c.due) - todayJdn() : null;
  const when = c.status !== 'pending' ? '' : today ? ' (امروز)' : late ? ` (${faDigits(-dleft)} روز گذشته)` : dleft != null ? ` (${faDigits(dleft)} روز دیگر)` : '';
  return `<div class="note ${c.dir === 'out' ? 'urgent' : 'important'} ${c.status !== 'pending' ? 'done' : ''}">
    <span class="dot ${c.dir === 'out' ? 'out' : 'in'}" style="margin-top:2px">${ic(c.dir === 'out' ? 'out' : 'in')}</span>
    <div class="body" onclick="chequeForm(${c.id})"><div class="ct"><span class="nt" style="flex:1;text-decoration:none">${rnd(c.amount).toLocaleString('fa-IR')} <span style="font-size:12px;font-weight:400">${c.cur || 'تومان'}</span></span><span class="badge ${st[1]}">${st[0]}</span></div>
    <div class="tx2">${c.dir === 'out' ? 'پرداختی به' : 'دریافتی از'} ${esc(c.party || '—')}${c.no ? ' · شماره ' + esc(faDigits(c.no)) : ''}${c.bank ? ' · ' + esc(c.bank) : ''}</div>
    <div class="meta"><span class="${late || today ? 'late' : ''}">${ic(c.alarm && c.status === 'pending' ? 'bell' : 'cal')}سررسید ${showDate(c.due)}${when}</span>
    ${c.invoiceId && getInv(c.invoiceId) ? `<span class="chip" onclick="event.stopPropagation();go('invoice',{id:${c.invoiceId}})">${ic('receipt')}${kindLabel(getInv(c.invoiceId))} ${faDigits(getInv(c.invoiceId).no)}</span>` : ''}</div>
    ${c.status === 'pending' ? `<div class="row" style="margin-top:8px"><button class="btn sm" style="flex:1;background:var(--ok-soft);color:var(--ok)" onclick="event.stopPropagation();chequeStatus(${c.id},'cleared')">${ic('check')} ${c.dir === 'out' ? 'پاس شد' : 'وصول شد'}</button><button class="btn sm danger" style="flex:1" onclick="event.stopPropagation();chequeStatus(${c.id},'bounced')">برگشت خورد</button></div>` : ''}</div></div>`;
}
function chequesView(r) {
  const f = r.cf || 'pending';
  const t0 = todayJ(), wk = jdnToJ(todayJdn() + 7);
  const pend = DB.cheques.filter(c => c.status === 'pending');
  const inSum = sum(pend.filter(c => c.dir === 'in'), c => c.amount), outSum = sum(pend.filter(c => c.dir === 'out'), c => c.amount);
  let h = modeTabs('cheques');
  const ns = notifStatus();
  if (ns === 'off') h += `<div class="warn">${ic('bell')}<div style="flex:1">اعلان‌ها خاموش است؛ یادآور سررسید زنگ نمی‌خورد.</div><button class="btn sm dark" onclick="askNotif()">روشن کردن</button></div>`;
  h += `<div class="card"><div class="row"><div style="flex:1"><div class="mut">چک‌های دریافتنی</div><b class="pos">${rnd(inSum).toLocaleString('fa-IR')}</b></div>
    <div style="flex:1"><div class="mut">چک‌های پرداختنی</div><b class="neg">${rnd(outSum).toLocaleString('fa-IR')}</b></div></div><div class="mut" style="margin-top:4px">مبالغ به تومان · فقط چک‌های در انتظار</div></div>`;
  h += `<div class="chips">${[['pending', 'در انتظار'], ['in', 'دریافتی'], ['out', 'پرداختی'], ['done', 'وصول‌شده'], ['bounced', 'برگشتی']].map(x => `<button class="${f === x[0] ? 'on' : ''}" onclick="setSub('cf','${x[0]}')">${x[1]}</button>`).join('')}</div>`;
  let list = DB.cheques.slice();
  if (f === 'pending') list = list.filter(c => c.status === 'pending');
  if (f === 'in' || f === 'out') list = list.filter(c => c.dir === f);
  if (f === 'done') list = list.filter(c => c.status === 'cleared');
  if (f === 'bounced') list = list.filter(c => c.status === 'bounced');
  list.sort((a, b) => (a.due || '').localeCompare(b.due || ''));
  if (!list.length) h += empty('چک‌های دریافتی و پرداختی را با دکمه + ثبت کنید تا روز سررسید یادآوری شود. چک‌هایی که در فاکتور دریافت کنید هم اینجا می‌آیند.', 'receipt', 'چکی نیست');
  else if (f === 'pending') {
    const groups = [['سررسید گذشته', c => c.due < t0], ['امروز', c => c.due === t0], ['تا یک هفته آینده', c => c.due <= wk], ['بعداً', () => true]];
    const used = new Set();
    for (const [title, fn] of groups) {
      const g = list.filter(c => !used.has(c) && fn(c)); if (!g.length) continue;
      g.forEach(c => used.add(c));
      h += `<div class="sec">${title} <span class="mut" style="font-weight:400">${faDigits(g.length)}</span></div>` + g.map(chequeCard).join('');
    }
  } else h += list.map(chequeCard).join('');
  return { title: 'یادداشت‌ها', html: h, fab: 'chequeForm()' };
}
syncAlarms();
