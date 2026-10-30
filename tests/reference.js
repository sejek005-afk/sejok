'use strict';
// پیاده‌سازی قدیمی و ساده‌ی agg (بدون شاخص) برای مقایسه با نسخه سریع
const REF_AGG = `(function (pred, pids) {
  const r = { meters: 0, revenue: 0, other: 0, material: 0, workers: 0, installers: 0, extras: 0, wdays: 0 };
  for (const e of DB.progress) {
    if (pids && !pids.has(e.projectId)) continue;
    if (!pred(e.date)) continue;
    const p = DB.projects.find(x => x.id === e.projectId); if (!p) continue;
    const m = Number(e.meters) || 0;
    r.meters += m; r.revenue += m * entryRate(e, p); r.material += m * matPerM(p);
    r.installers += (Number(e.instMeters) || 0) * (Number(e.instRate) || 0);
  }
  for (const k in DB.att) {
    const a = DB.att[k];
    if (a.s !== 'p' && a.s !== 'h') continue;
    if (pids && !pids.has(a.p)) continue;
    if (!pred(k.split('|')[1])) continue;
    r.workers += Number(a.w) || 0; r.wdays += a.s === 'h' ? 0.5 : 1;
  }
  for (const x of DB.adj) {
    if (pids && !pids.has(x.projectId)) continue;
    if (!pred(x.date)) continue;
    const v = (x.type === 'fine' ? -1 : 1) * (Number(x.amount) || 0);
    if (x.who === 'i') r.installers += v; else r.workers += v;
  }
  for (const t of DB.tx) {
    if (t.type !== 'extra' && t.type !== 'misc') continue;
    if (pids && !pids.has(t.projectId)) continue;
    if (!pred(t.date)) continue;
    if (t.type === 'misc') r.other += Number(t.amount) || 0; else r.extras += Number(t.amount) || 0;
  }
  r.net = r.revenue + r.other - r.material - r.workers - r.installers - r.extras;
  return r;
})`;
module.exports = { REF_AGG };
