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
  return `<div class="note ${n.tag || 'normal'} ${n.done ? 'done' : ''}">
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
  const now = Date.now();
  return DB.notes.filter(n => !n.done && n.alarm && noteTime(n) && noteTime(n) <= now).length;
}
window.NAV_BADGE = Object.assign(window.NAV_BADGE || {}, { notes: overdueCount });

V.notes = r => {
  const f = r.f || 'active', tg = r.t || '';
  let list = DB.notes.filter(n => f === 'done' ? n.done : !n.done);
  if (tg) list = list.filter(n => (n.tag || 'normal') === tg);
  list = f === 'done' ? list.sort((a, b) => (b.created || 0) - (a.created || 0)) : sortNotes(list);
  let h = '';
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
