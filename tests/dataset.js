'use strict';
// ساخت داده بزرگ آزمایشی: ۱۰هزار پیشرفت، ۱۰هزار تراکنش، ۱۰هزار فاکتور، ۱۰هزار یادداشت،
// ۳۶٫۵هزار حضور، ۲۰۰ پروژه، ۵۰ شاگرد (حدود ۷ تا ۸ مگابایت)
function bigDataset(J) {
  let id = 1;
  const nid = () => id++;
  const p2 = n => (n < 10 ? '0' : '') + n;
  const start = J.j2d(1404, 1, 1);
  const dstr = n => { const r = J.d2j(n); return `${r.jy}/${p2(r.jm)}/${p2(r.jd)}`; };
  let seed = 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = a => a[Math.floor(rand() * a.length)];
  const d = { v: 1, cats: [], projects: [], workers: [], installers: [], contractors: [], progress: [], tx: [], att: {}, invoices: [], notes: [], adj: [], cheques: [], statements: [], inv: {} };
  for (let i = 0; i < 10; i++) d.cats.push({ id: nid(), name: 'دسته ' + i });
  for (let i = 0; i < 200; i++) d.projects.push({ id: nid(), catId: pick(d.cats).id, name: 'پروژه ' + i, address: 'آدرس ' + i, type: i % 3 ? 'mat' : 'labor', area: 500 + i, price: 1500000, laborPrice: 400000, material: 50000000, created: dstr(start) });
  for (let i = 0; i < 50; i++) d.workers.push({ id: nid(), first: 'شاگرد', last: String(i), address: '', phone: '0912000' + i, wage: 1000000 + i * 1000, projectId: pick(d.projects).id, active: false, fillFrom: null });
  for (let i = 0; i < 10; i++) d.installers.push({ id: nid(), first: 'نصاب', last: String(i), address: '', phone: '', rate: 150000 });
  for (let i = 0; i < 10; i++) d.contractors.push({ id: nid(), first: 'پیمانکار', last: String(i), phone: '' });
  for (let i = 0; i < 10000; i++) { const inst = rand() < 0.3 ? pick(d.installers) : null; const m = Math.round(rand() * 8000) / 100; d.progress.push({ id: nid(), projectId: pick(d.projects).id, date: dstr(start + Math.floor(rand() * 730)), meters: m, installerId: inst ? inst.id : null, instMeters: inst ? m : 0, instRate: inst ? 150000 : 0, note: '' }); }
  const types = ['in', 'wpay', 'ipay', 'extra'];
  for (let i = 0; i < 10000; i++) {
    const type = pick(types);
    d.tx.push({ id: nid(), type, sub: type === 'wpay' && rand() < 0.2 ? 'advance' : '', amount: Math.round(rand() * 5e6), date: dstr(start + Math.floor(rand() * 730)), note: '', workerId: type === 'wpay' ? pick(d.workers).id : null, installerId: type === 'ipay' ? pick(d.installers).id : null, projectId: type === 'extra' ? pick(d.projects).id : null, contractorId: rand() < 0.7 ? pick(d.contractors).id : null });
  }
  // ۵۰ شاگرد × ۷۳۰ روز = ۳۶٫۵هزار حضور
  for (const w of d.workers) for (let k = 0; k < 730; k++) d.att[w.id + '|' + dstr(start + k)] = { p: w.projectId, s: rand() < 0.9 ? 'p' : rand() < 0.5 ? 'h' : 'a', w: w.wage };
  for (let i = 0; i < 10000; i++) {
    const items = [1, 2, 3].map(() => ({ id: nid(), title: 'ردیف', desc: '', qty: Math.round(rand() * 1000) / 10, unit: 'متر مربع', price: 1000000, disc: 0 }));
    d.invoices.push({ id: nid(), no: i + 1, kind: rand() < 0.2 ? 'pre' : 'inv', title: 'فاکتور', date: dstr(start + Math.floor(rand() * 730)), due: '', customer: { name: 'مشتری ' + (i % 300), address: '', phone: '', nid: '' }, projectId: pick(d.projects).id, items, discount: 0, taxOn: false, taxRate: 0, pays: [{ id: nid(), date: dstr(start), amount: Math.round(rand() * 2e8), method: 'cash', note: '', chequeId: null }], note: '' });
  }
  const tags = ['normal', 'important', 'urgent'];
  for (let i = 0; i < 10000; i++) d.notes.push({ id: nid(), title: 'یادداشت ' + i, text: 'متن', tag: pick(tags), lt: null, lid: null, alarm: rand() < 0.6, date: dstr(start + Math.floor(rand() * 800)), time: '09:30', done: rand() < 0.3, created: i });
  for (let i = 0; i < 1000; i++) d.cheques.push({ id: nid(), dir: rand() < 0.5 ? 'in' : 'out', cur: 'تومان', amount: 1e7, due: dstr(start + Math.floor(rand() * 800)), party: 'طرف', no: '', bank: '', note: '', status: pick(['pending', 'cleared', 'bounced']), alarm: true, before: 0, time: '09:00', invoiceId: null, payId: null, created: i });
  for (let i = 0; i < 500; i++) d.adj.push({ id: nid(), who: rand() < 0.7 ? 'w' : 'i', pid: 0, type: rand() < 0.5 ? 'bonus' : 'fine', amount: 100000, date: dstr(start + Math.floor(rand() * 730)), projectId: pick(d.projects).id, note: '' });
  for (const a of d.adj) a.pid = a.who === 'w' ? pick(d.workers).id : pick(d.installers).id;
  d.seq = id;
  return d;
}
module.exports = { bigDataset };
