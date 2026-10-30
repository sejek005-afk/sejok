'use strict';
// ===================== صورت‌وضعیت پروژه =====================
const getStmt = id => DB.statements.find(x => x.id === +id);
const stmtsOf = pid => DB.statements.filter(s => s.projectId === pid).sort((a, b) => a.no - b.no);
const kRial = () => (ccy() === 'ریال' ? 10 : 1);
const itemKey = it => (it.title || '').trim();

function progressMeters(pid, from, to) {
  return sum(DB.progress.filter(e => e.projectId === pid && e.date >= from && e.date <= to), e => e.meters);
}
// متراژ دوره به تفکیک قیمت هر متر (برای پروژه‌هایی که قیمتشان در طول کار عوض شده یا قسمت‌هایی قیمت جدا دارند)
function progressByRate(pid, from, to) {
  const p = proj(pid), m = new Map();
  if (!p) return m;
  for (const e of DB.progress) if (e.projectId === pid && e.date >= from && e.date <= to) {
    const r = rnd(entryRate(e, p)); m.set(r, (m.get(r) || 0) + (Number(e.meters) || 0));
  }
  return new Map([...m].sort((a, b) => a[0] - b[0]));
}
function autoTitle(mt, r, many) { return many ? `${mt} — هر متر ${rnd(r).toLocaleString('fa-IR')}` : mt; }
function mainTitle(p) { const c = cat(p.catId); return `اجرای ${c ? c.name : 'کار'} — ${p.name}`; }

function newStatement(pid) {
  const p = proj(pid); if (!p) return;
  const prev = stmtsOf(pid);
  const last = prev[prev.length - 1];
  const firstProg = DB.progress.filter(e => e.projectId === pid).map(e => e.date).sort()[0];
  const from = last ? jdnToJ(jToJdn(last.to) + 1) : (firstProg || p.created || todayJ());
  const to = todayJ();
  const items = [];
  const mt = mainTitle(p);
  const groups = progressByRate(pid, from > to ? to : from, to);
  if (!groups.size) groups.set(rnd(rateAt(p, to)), 0);
  for (const [r, m] of groups) items.push({ id: nid(), title: autoTitle(mt, r, groups.size > 1), desc: '', unit: 'متر مربع', price: r * kRial(), qty: Math.round(m * 100) / 100, auto: true });
  if (last) for (const it of last.items) if (!it.auto && itemKey(it) !== mt) items.push({ id: nid(), title: it.title, desc: it.desc, unit: it.unit, price: it.price, qty: 0 });
  const s = { id: nid(), projectId: pid, no: (last ? last.no : 0) + 1, date: todayJ(), from: from > to ? to : from, to, ret: last ? last.ret : 5, items, note: '', created: Date.now() };
  DB.statements.push(s); save();
  go('stmt', { id: s.id });
}

function stmtCalc(s) {
  const prevS = stmtsOf(s.projectId).filter(x => x.no < s.no);
  const prevBy = {};
  let prevAmt = 0, prevRet = 0;
  for (const ps of prevS) {
    let a = 0;
    for (const it of ps.items) {
      const k = itemKey(it); const v = rnd((Number(it.qty) || 0) * (Number(it.price) || 0));
      prevBy[k] = prevBy[k] || { qty: 0, amt: 0 };
      prevBy[k].qty += it.qty || 0; prevBy[k].amt += v; a += v;
    }
    prevAmt += a; prevRet += rnd(a * (Number(ps.ret) || 0) / 100);
  }
  const rows = s.items.map(it => {
    const pv = prevBy[itemKey(it)] || { qty: 0, amt: 0 };
    const amt = rnd((Number(it.qty) || 0) * (Number(it.price) || 0));
    return { it, pq: pv.qty, pa: pv.amt, q: it.qty || 0, a: amt, cq: pv.qty + (it.qty || 0), ca: pv.amt + amt };
  });
  const amt = sum(rows, r => r.a);
  const ret = rnd(amt * (Number(s.ret) || 0) / 100);
  return { rows, prevAmt, amt, cumAmt: prevAmt + amt, prevRet, ret, cumRet: prevRet + ret, prevNet: prevAmt - prevRet, net: amt - ret, cumNet: prevAmt + amt - prevRet - ret };
}

// ---------- فرم‌ها ----------
function stmtHeadForm(id) {
  const s = getStmt(id);
  openForm('مشخصات صورت‌وضعیت', [
    { k: 'no', label: 'شماره صورت‌وضعیت', type: 'num', req: true, value: s.no },
    { k: 'date', label: 'تاریخ صورت‌وضعیت', type: 'date', value: s.date },
    { k: 'from', label: 'دوره کارکرد از تاریخ', type: 'date', value: s.from },
    { k: 'to', label: 'تا تاریخ', type: 'date', value: s.to },
    { k: 'ret', label: 'درصد کسر حسن انجام کار', type: 'num', value: s.ret, hint: 'مثلاً ۵ یا ۱۰ — صفر یعنی بدون کسر' },
  ], o => {
    if (o.from > o.to) { toast('تاریخ شروع دوره بعد از پایان آن است'); return false; }
    const periodChanged = o.from !== s.from || o.to !== s.to;
    Object.assign(s, o);
    if (periodChanged) { const n = refreshAuto(s); if (n !== null) return () => toast(`متراژ این دوره از پیشرفت کار به‌روز شد: ${faNum(n)} متر`); }
  }, () => { DB.statements = DB.statements.filter(x => x !== s); if (cur().name === 'stmt') stack.pop(); });
}
function refreshAuto(s) {
  const p = proj(s.projectId); if (!p) return null;
  const autos = s.items.filter(x => x.auto); if (!autos.length) return null;
  const groups = progressByRate(p.id, s.from, s.to);
  const total = Math.round(progressMeters(p.id, s.from, s.to) * 100) / 100;
  // یک ردیف و یک قیمت: مثل قبل فقط متراژ به‌روز می‌شود (قیمتی که دستی عوض شده می‌ماند)
  if (autos.length === 1 && groups.size <= 1) { autos[0].qty = total; return total; }
  const mt = mainTitle(p), used = new Set();
  for (const [r, m] of groups) {
    let it = autos.find(x => !used.has(x) && Math.abs(x.price - r * kRial()) < 0.5);
    if (!it) { it = { id: nid(), title: autoTitle(mt, r, true), desc: '', unit: 'متر مربع', price: r * kRial(), qty: 0, auto: true }; s.items.push(it); }
    used.add(it); it.qty = Math.round(m * 100) / 100;
    if (itemKey(it) === mt && groups.size > 1) it.title = autoTitle(mt, r, true);
  }
  for (const it of autos) if (!used.has(it)) it.qty = 0;
  return total;
}
function stmtRefresh(id) {
  const s = getStmt(id); const n = refreshAuto(s);
  if (n === null) { toast('ردیف اصلی پروژه پیدا نشد'); return; }
  save(); render(); toast(`متراژ از پیشرفت کار: ${faNum(n)} متر`);
}
function stmtItemForm(id, iid) {
  const s = getStmt(id); const it = iid ? s.items.find(x => x.id === iid) : null;
  const c = it ? stmtCalc(s).rows.find(r => r.it === it) : null;
  openForm(it ? 'ویرایش ردیف' : 'ردیف جدید', [
    { k: 'title', label: 'شرح کار', req: true, value: it && it.title, hint: it && c && c.pq ? `کارکرد قبلی این ردیف: ${faNum(c.pq)} ${it.unit}` : 'برای ادامه‌ی ردیف‌های قبلی، شرح را دقیقاً مثل صورت‌وضعیت قبل بنویسید.' },
    { k: 'desc', label: 'توضیحات (اختیاری)', type: 'textarea', value: it && it.desc },
    { k: 'unit', label: 'واحد', type: 'select', opts: UNITS.map(u => [u, u]), value: it ? it.unit : 'متر مربع' },
    { k: 'price', label: `فی / مبلغ واحد (${ccy()})`, type: 'money', value: it && it.price },
    { k: 'qty', label: 'مقدار کارکرد این دوره', type: 'num', value: it ? it.qty : '' },
  ], o => {
    if (it) Object.assign(it, o);
    else s.items.push(Object.assign({ id: nid() }, o));
  }, it ? () => { s.items = s.items.filter(x => x !== it); } : null);
}
function stmtNoteForm(id) {
  const s = getStmt(id);
  openForm('توضیحات صورت‌وضعیت', [{ k: 'note', label: 'در PDF چاپ می‌شود', type: 'textarea', value: s.note }], o => { s.note = o.note; });
}
function stmtToInvoice(id) {
  const s = getStmt(id); const c = stmtCalc(s); const p = proj(s.projectId);
  if (!c.amt) { toast('مبلغ این دوره صفر است'); return; }
  const lastInv = DB.invoices.filter(i => i.projectId === s.projectId && i.customer && i.customer.name).slice(-1)[0];
  const no = takeInvNo();
  const items = s.items.filter(it => it.qty).map(it => ({ id: nid(), title: it.title, desc: it.desc || '', qty: it.qty, unit: it.unit, price: it.price, disc: 0 }));
  if (c.ret) items.push({ id: nid(), title: `کسر حسن انجام کار ${faNum(s.ret)}٪`, desc: '', qty: 1, unit: 'مقطوع', price: -c.ret, disc: 0 });
  const inv = { id: nid(), no, kind: 'inv', title: `صورت‌وضعیت شماره ${faDigits(s.no)}`, date: todayJ(), due: '', customer: lastInv ? JSON.parse(JSON.stringify(lastInv.customer)) : { name: '', address: (p && p.address) || '', phone: '' }, projectId: s.projectId, items, discount: 0, taxOn: false, taxRate: +S('taxRate') || 0, pays: [], note: `بابت صورت‌وضعیت شماره ${faDigits(s.no)} — دوره ${faDigits(s.from)} تا ${faDigits(s.to)}`, stmtId: s.id };
  DB.invoices.push(inv); s.invoiceId = inv.id; save();
  go('invoice', { id: inv.id }); toast('فاکتور از روی صورت‌وضعیت ساخته شد');
}

// ---------- نمایش‌ها ----------
function stmtListHtml(p) {
  const list = stmtsOf(p.id).slice().reverse();
  let h = `<button class="btn pri wide" onclick="newStatement(${p.id})">${ic('plus')} صورت‌وضعیت جدید</button>`;
  if (!list.length) return h + empty('برای هر دوره کاری یک صورت‌وضعیت بسازید؛ متراژ از پیشرفت کار خودکار وارد می‌شود و کارکرد قبلی، این دوره و تجمعی محاسبه می‌شود.', 'clip', 'صورت‌وضعیتی ثبت نشده');
  const lastC = stmtCalc(list[0]);
  h += `<div class="card"><div class="kv"><span>جمع کارکرد تجمعی (تا صورت‌وضعیت ${faDigits(list[0].no)})</span><span>${fmc(lastC.cumAmt)}</span></div>
    <div class="kv"><span>جمع کسر حسن انجام کار</span><span>${fmc(lastC.cumRet)}</span></div>
    <div class="kv total"><span>خالص تجمعی</span><span>${fmc(lastC.cumNet)}</span></div></div>`;
  h += '<div class="list">' + list.map(s => {
    const c = stmtCalc(s);
    return `<div class="li" onclick="go('stmt',{id:${s.id}})"><span class="av sq on">${ic('clip')}</span>
      <div class="d"><b>صورت‌وضعیت شماره ${faDigits(s.no)}</b><div class="mut">${faDigits(s.from)} تا ${faDigits(s.to)}${s.invoiceId && getInv(s.invoiceId) ? ' · فاکتور شد' : ''}</div></div>
      <div class="v">${fm(c.net)}<small>خالص این دوره</small></div></div>`;
  }).join('') + '</div>';
  return h;
}

V.stmt = r => {
  const s = getStmt(r.id); if (!s) { stack.pop(); return V[cur().name](cur()); }
  const p = proj(s.projectId); const c = stmtCalc(s);
  let h = `<div class="invhead" onclick="stmtHeadForm(${s.id})"><div class="ct"><div style="flex:1"><div class="t">صورت‌وضعیت ${esc(p ? p.name : '')}</div>
    <div class="s">دوره ${faDigits(s.from)} تا ${faDigits(s.to)} · تاریخ ${showDate(s.date)} · حسن انجام کار ${faNum(s.ret || 0)}٪</div></div>
    <div class="no"># ${faDigits(s.no)}</div></div></div>`;
  h += `<div class="sec">ردیف‌های کار</div>
    <div class="row" style="margin-bottom:10px"><button class="btn pri" style="flex:1" onclick="stmtItemForm(${s.id})">${ic('plus')} ردیف جدید</button><button class="btn dark" style="flex:1" onclick="stmtRefresh(${s.id})">${ic('tape')} متراژ از پیشرفت کار</button></div>`;
  if (!c.rows.length) h += empty('ردیف کار اضافه کنید.', 'clip', '');
  else h += c.rows.map((x, k) => `<div class="card click" onclick="stmtItemForm(${s.id},${x.it.id})"><div class="ct"><span class="dot" style="background:var(--paper);color:var(--ink);font-weight:800">${faDigits(k + 1)}</span><div style="flex:1;min-width:0"><b>${esc(x.it.title)}</b><div class="mut">فی: ${fm(x.it.price)} ${ccy()} / ${esc(x.it.unit)}</div></div></div>
      <table class="mt" style="margin-top:8px"><tr><th></th><th>قبلی</th><th>این دوره</th><th>تجمعی</th></tr>
      <tr><td class="mut">مقدار</td><td>${faNum(x.pq)}</td><td><b>${faNum(x.q)}</b></td><td>${faNum(x.cq)}</td></tr>
      <tr><td class="mut">مبلغ</td><td>${fm(x.pa)}</td><td><b>${fm(x.a)}</b></td><td>${fm(x.ca)}</td></tr></table></div>`).join('');
  h += `<div class="sec">جمع صورت‌وضعیت</div><div class="card" onclick="stmtHeadForm(${s.id})"><table class="mt"><tr><th></th><th>قبلی</th><th>این دوره</th><th>تجمعی</th></tr>
    <tr><td class="mut">مبلغ کارکرد</td><td>${fm(c.prevAmt)}</td><td>${fm(c.amt)}</td><td>${fm(c.cumAmt)}</td></tr>
    <tr><td class="mut">حسن انجام کار ${faNum(s.ret || 0)}٪</td><td>${fm(c.prevRet)}</td><td>${fm(c.ret)}</td><td>${fm(c.cumRet)}</td></tr>
    <tr class="tot"><td>خالص</td><td>${fm(c.prevNet)}</td><td>${fm(c.net)}</td><td>${fm(c.cumNet)}</td></tr></table>
    <div class="kv total" style="margin-top:10px"><span>قابل پرداخت این صورت‌وضعیت</span><span>${fmc(c.net)}</span></div>
    <div class="mut" style="text-align:center;margin-top:4px">مبالغ به ${ccy()} · برای تغییر درصد حسن انجام کار بزنید</div></div>`;
  h += `<div class="card click" onclick="stmtNoteForm(${s.id})"><div class="ct"><b style="font-size:14px">توضیحات</b><span class="mut">${ic('edit')}</span></div><div class="mut">${s.note ? esc(s.note) : 'ندارد'}</div></div>`;
  h += `<div class="row" style="margin-bottom:10px"><button class="btn pri" style="flex:1" onclick="stmtPdf(${s.id},'save')">${ic('pdf')} ذخیره PDF</button><button class="btn dark" style="flex:1" onclick="stmtPdf(${s.id},'share')">${ic('share')} ارسال</button></div>
    <div class="row"><button class="btn" style="flex:1" onclick="go('stmtPreview',{id:${s.id}})">${ic('eye')} پیش‌نمایش</button>${s.invoiceId && getInv(s.invoiceId) ? `<button class="btn" style="flex:1" onclick="go('invoice',{id:${s.invoiceId}})">${ic('receipt')} دیدن فاکتور</button>` : `<button class="btn" style="flex:1" onclick="stmtToInvoice(${s.id})">${ic('receipt')} ساخت فاکتور</button>`}</div>`;
  return { title: `صورت‌وضعیت شماره ${faDigits(s.no)}`, html: h, edit: `stmtHeadForm(${s.id})` };
};
V.stmtPreview = r => {
  const s = getStmt(r.id); if (!s) { stack.pop(); return V[cur().name](cur()); }
  window._prevHtml = stmtHtml(s);
  const h = `<div class="row" style="margin-bottom:12px"><button class="btn pri" style="flex:1" onclick="stmtPdf(${s.id},'save')">${ic('pdf')} ذخیره PDF</button><button class="btn dark" style="flex:1" onclick="stmtPdf(${s.id},'share')">${ic('share')} ارسال</button></div>
    <div id="pvw" class="pvw"><iframe id="pvf" onload="fitPreview()"></iframe></div>`;
  setTimeout(() => { const f = document.getElementById('pvf'); if (f) f.srcdoc = window._prevHtml; }, 0);
  return { title: 'پیش‌نمایش صورت‌وضعیت', html: h };
};

// ---------- قالب چاپی ----------
function stmtHtml(s) {
  const p = proj(s.projectId) || {}; const c = stmtCalc(s); const e = esc;
  const lg = logoSrc(); const sp = S('stamp');
  const lastInv = DB.invoices.filter(i => i.projectId === s.projectId && i.customer && i.customer.name).slice(-1)[0];
  const emp = lastInv ? lastInv.customer.name : '';
  const rows = c.rows.map((x, k) => `<tr><td>${faDigits(k + 1)}</td><td class="desc"><b>${e(x.it.title)}</b>${x.it.desc ? `<div>${e(x.it.desc)}</div>` : ''}</td><td>${e(x.it.unit)}</td><td>${fm(x.it.price)}</td>
    <td>${faNum(x.pq)}</td><td class="hl">${faNum(x.q)}</td><td>${faNum(x.cq)}</td><td>${fm(x.pa)}</td><td class="hl">${fm(x.a)}</td><td>${fm(x.ca)}</td></tr>`).join('');
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=794">
<style>
@font-face{font-family:Vazirmatn;src:url(Vazirmatn.woff2) format('woff2');font-weight:100 900}
*{box-sizing:border-box}html,body{margin:0;background:#fff}
body{width:794px;font-family:Vazirmatn,Tahoma,sans-serif;color:#1c1f24;font-size:11px;line-height:1.65;padding:34px 30px 28px;font-feature-settings:'tnum'}
.top{display:flex;align-items:center;gap:16px;padding-bottom:12px;border-bottom:2px solid #1c1f24}
.top .b{flex:1}.top h1{margin:0;font-size:20px;font-weight:800}.top .sl{color:#555;font-size:11.5px}
.top .lg img{max-width:140px;max-height:64px}
.info{display:flex;gap:20px;margin:12px 0 10px}.info>div{flex:1}.info span{color:#666}
table.it{width:100%;border-collapse:collapse;font-size:9.6px}
table.it th{background:#eceeeb;font-weight:700;padding:4px 3px;border:1px solid #c9cdc7;text-align:center}
table.it td{border:1px solid #d6d9d4;padding:5px 3px;text-align:center;vertical-align:top;white-space:nowrap}
table.it td.desc{text-align:right;white-space:normal;min-width:150px}table.it td.desc div{color:#555;font-size:9px}
table.it td.hl{background:#fff7d6;font-weight:700}
table.it tfoot td{font-weight:800;background:#f4f5f3}
.bottom{display:flex;gap:20px;margin-top:14px;align-items:flex-start}.bottom .r{flex:1}.bottom .tot{width:380px}
table.t{width:100%;border-collapse:collapse;border:1px solid #c9cdc7;font-size:10.5px}
table.t th{background:#eceeeb;padding:4px;border-bottom:1px solid #c9cdc7}table.t td{padding:5px 6px;text-align:center;border-bottom:1px solid #e3e5e1}
table.t td:first-child{text-align:right}table.t tr.net td{font-weight:800;background:#eceeeb;border-top:1.5px solid #1c1f24}
.pay{margin-top:8px;border:1.5px solid #1c1f24;border-radius:6px;padding:8px 10px;display:flex;justify-content:space-between;font-weight:800;font-size:12.5px}
.box{border:1px solid #c9cdc7;border-radius:6px;padding:8px 10px;white-space:pre-wrap}
.sig{display:flex;gap:24px;margin-top:26px}.sig>div{flex:1;text-align:center;border-top:1px dashed #999;padding-top:6px;color:#555;min-height:84px}
.sig img{max-height:84px;max-width:150px;display:block;margin:4px auto 0}
.meta{margin-top:16px;border-top:1px solid #ddd;padding-top:6px;display:flex;justify-content:space-between;color:#777;font-size:9.5px}
</style></head><body>
<div class="top"><div class="b"><h1>صورت‌وضعیت شماره ${faDigits(s.no)}</h1><div class="sl">${e(p.name || '')}${S('biz') ? ' — پیمانکار: ' + e(S('biz')) : ''}</div></div>${lg ? `<div class="lg"><img src="${lg}"></div>` : ''}</div>
<div class="info"><div><div><span>پروژه:</span> <b>${e(p.name || '')}</b></div>${p.address ? `<div><span>آدرس:</span> ${e(p.address)}</div>` : ''}${emp ? `<div><span>کارفرما:</span> ${e(emp)}</div>` : ''}</div>
<div><div><span>تاریخ صورت‌وضعیت:</span> <b>${faDigits(s.date)}</b></div><div><span>دوره کارکرد:</span> ${faDigits(s.from)} تا ${faDigits(s.to)}</div>${p.area ? `<div><span>متراژ کل قرارداد:</span> ${faNum(p.area)} متر مربع</div>` : ''}</div></div>
<table class="it"><thead><tr><th rowspan="2">ردیف</th><th rowspan="2">شرح کار</th><th rowspan="2">واحد</th><th rowspan="2">فی (${ccy()})</th><th colspan="3">مقدار</th><th colspan="3">مبلغ (${ccy()})</th></tr>
<tr><th>قبلی</th><th>این دوره</th><th>تجمعی</th><th>قبلی</th><th>این دوره</th><th>تجمعی</th></tr></thead>
<tbody>${rows}</tbody><tfoot><tr><td colspan="7">جمع</td><td>${fm(c.prevAmt)}</td><td class="hl">${fm(c.amt)}</td><td>${fm(c.cumAmt)}</td></tr></tfoot></table>
<div class="bottom"><div class="r">${s.note ? `<div class="box">${e(s.note)}</div>` : ''}</div>
<div class="tot"><table class="t"><tr><th></th><th>قبلی</th><th>این دوره</th><th>تجمعی</th></tr>
<tr><td>مبلغ کارکرد</td><td>${fm(c.prevAmt)}</td><td>${fm(c.amt)}</td><td>${fm(c.cumAmt)}</td></tr>
<tr><td>کسر حسن انجام کار ${faNum(s.ret || 0)}٪</td><td>${fm(c.prevRet)}</td><td>${fm(c.ret)}</td><td>${fm(c.cumRet)}</td></tr>
<tr class="net"><td>خالص</td><td>${fm(c.prevNet)}</td><td>${fm(c.net)}</td><td>${fm(c.cumNet)}</td></tr></table>
<div class="pay"><span>قابل پرداخت این صورت‌وضعیت</span><span>${fmc(c.net)}</span></div></div></div>
<div class="sig"><div>پیمانکار${sp ? `<img src="${sp}">` : ''}</div><div>ناظر</div><div>کارفرما</div></div>
<div class="meta"><span>${S('bizPhone') ? 'تلفن: ' + e(faDigits(S('bizPhone'))) : ''}</span><span>صورت‌وضعیت ${faDigits(s.no)} — ${e(p.name || '')} — ${faDigits(s.date)}</span></div>
</body></html>`;
}
function stmtPdf(id, action) {
  const s = getStmt(id);
  if (!s.items.length) { toast('ابتدا ردیف‌های کار را وارد کنید'); return; }
  const name = `statement-${s.no}-${(proj(s.projectId) || {}).id || ''}-${s.date.replace(/\//g, '-')}.pdf`;
  const html = stmtHtml(s);
  if (window.Android && Android.makePdf) { toast('در حال ساخت PDF…'); Android.makePdf(html, name, action); return; }
  const fr = document.createElement('iframe');
  fr.style.cssText = 'position:fixed;width:794px;height:10px;left:-9999px;top:0';
  document.body.appendChild(fr);
  fr.onload = () => { setTimeout(() => { fr.contentWindow.print(); setTimeout(() => fr.remove(), 2000); }, 300); };
  fr.srcdoc = html;
}
