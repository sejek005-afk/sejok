'use strict';
// ===================== فاکتور =====================
const INV_DEF = {
  biz: '', slogan: '', bizPhone: '', bizAddress: '', currency: 'تومان', taxRate: 10, roundTo: 0,
  card: '', sheba: '', bank: '', holder: '', footer: 'از همکاری با شما مفتخریم', terms: '',
  sign: '1', showBal: '1', nextNo: 1, logo: '', stamp: '', defTitle: '',
};
const UNITS = ['متر مربع', 'متر طول', 'متر', 'عدد', 'شاخه', 'برگ', 'کیلوگرم', 'سرویس', 'روز', 'مقطوع'];
const S = k => (DB.inv[k] !== undefined && DB.inv[k] !== null) ? DB.inv[k] : INV_DEF[k];
const getInv = id => DB.invoices.find(x => x.id === +id);
const kindLabel = inv => inv.kind === 'pre' ? 'پیش فاکتور' : 'فاکتور';
const ccy = () => S('currency');
function fm(n) { return Math.round(n || 0).toLocaleString('fa-IR'); }
function fmc(n) { return fm(n) + ' ' + ccy(); }

function invCalc(inv) {
  let sub = 0, idisc = 0;
  for (const it of inv.items) { sub += (it.qty || 0) * (it.price || 0); idisc += it.disc || 0; }
  const base = sub - idisc;
  const tax = inv.taxOn ? Math.round(base * (inv.taxRate || 0) / 100) : 0;
  const total = base + tax;
  const afterDisc = total - (inv.discount || 0);
  const rt = +S('roundTo') || 0;
  const round = rt > 0 ? ((afterDisc % rt) + rt) % rt : 0;
  const payable = afterDisc - round;
  const paid = (inv.cash || 0) + (inv.cheque || 0);
  const remain = payable - paid;
  const status = inv.kind === 'pre' ? 'pre' : (payable > 0 && remain <= 0 ? 'paid' : paid > 0 ? 'part' : 'open');
  return { sub, idisc, tax, total, round, payable, paid, remain, status };
}
const STATUS = { paid: ['تسویه شده', 'ok'], part: ['پرداخت جزئی', 'y'], open: ['تسویه نشده', 'bad'], pre: ['پیش فاکتور', ''] };
function custBalance(inv) {
  const others = DB.invoices.filter(x => x !== inv && x.kind !== 'pre' && x.customer && inv.customer && x.customer.name && x.customer.name === inv.customer.name);
  let n = 0, s = 0;
  for (const o of others) { const c = invCalc(o); if (c.remain > 0) { n++; s += c.remain; } }
  return { n, s };
}
function customers() {
  const m = {};
  for (const i of DB.invoices) if (i.customer && i.customer.name) m[i.customer.name] = i.customer;
  return m;
}

// ---------- فرم‌ها ----------
function newInvoice(kind) {
  const no = +S('nextNo') || 1;
  const inv = { id: nid(), no, kind: kind || 'inv', title: S('defTitle') || '', date: todayJ(), due: '', customer: { name: '', address: '', phone: '' }, projectId: null, items: [], discount: 0, taxOn: false, taxRate: +S('taxRate') || 0, cash: 0, cheque: 0, chequeNote: '', note: '' };
  DB.invoices.push(inv);
  DB.inv.nextNo = no + 1;
  save();
  go('invoice', { id: inv.id });
  invHeadForm(inv.id);
}
function invHeadForm(id) {
  const inv = getInv(id);
  openForm('مشخصات فاکتور', [
    { k: 'kind', label: 'نوع', type: 'select', opts: [['inv', 'فاکتور'], ['pre', 'پیش فاکتور']], value: inv.kind },
    { k: 'title', label: 'عنوان (مثلاً: اجرای کناف)', value: inv.title },
    { k: 'no', label: 'شماره فاکتور', type: 'num', req: true, value: inv.no },
    { k: 'date', label: 'تاریخ فاکتور', type: 'date', value: inv.date },
    { k: 'due', label: 'مهلت پرداخت / اعتبار (اختیاری)', value: inv.due, hint: 'مثلاً «۷ روز» یا یک تاریخ' },
    { k: 'projectId', label: 'پروژه مرتبط (اختیاری)', type: 'select', numeric: true, opts: projOpts('— بدون پروژه —'), value: inv.projectId || '' },
  ], o => { Object.assign(inv, o); inv.projectId = o.projectId || null; },
    () => { DB.invoices = DB.invoices.filter(x => x !== inv); if (cur_().name === 'invoice') stack.pop(); });
}
const cur_ = () => stack[stack.length - 1];
function custFill(el) {
  const c = customers()[el.value];
  if (!c) return;
  const a = document.getElementById('f_address'), p = document.getElementById('f_phone');
  if (a && !a.value) a.value = c.address || '';
  if (p && !p.value) p.value = c.phone || '';
}
function custForm(id) {
  const inv = getInv(id); const c = inv.customer || {};
  openForm('طرف حساب', [
    { k: 'name', label: 'نام (آقای/خانم/شرکت)', req: true, value: c.name, list: Object.keys(customers()), onchange: 'custFill(this)' },
    { k: 'phone', label: 'شماره تماس', value: c.phone, ltr: true },
    { k: 'address', label: 'آدرس', type: 'textarea', value: c.address },
    { k: 'nid', label: 'کد/شناسه ملی (اختیاری)', value: c.nid, ltr: true },
  ], o => { inv.customer = { name: o.name, phone: toEn(o.phone), address: o.address, nid: toEn(o.nid) }; });
}
function itemForm(id, iid) {
  const inv = getInv(id); const it = iid ? inv.items.find(x => x.id === iid) : null;
  openForm(it ? 'ویرایش آیتم' : 'آیتم جدید', [
    { k: 'title', label: 'شرح کالا / خدمات', req: true, value: it && it.title },
    { k: 'desc', label: 'توضیحات تکمیلی (اختیاری)', type: 'textarea', value: it && it.desc },
    { k: 'qty', label: 'مقدار', type: 'num', req: true, value: it ? it.qty : '' },
    { k: 'unit', label: 'واحد', type: 'select', opts: UNITS.map(u => [u, u]), value: it ? it.unit : 'متر مربع' },
    { k: 'price', label: `مبلغ واحد (${ccy()})`, type: 'money', value: it && it.price },
    { k: 'disc', label: `تخفیف این ردیف (${ccy()})`, type: 'money', value: it && it.disc },
  ], o => {
    if (it) Object.assign(it, o); else inv.items.push(Object.assign({ id: nid() }, o));
  }, it ? () => { inv.items = inv.items.filter(x => x !== it); } : null);
}
function itemFromProject(id) {
  const inv = getInv(id);
  if (!DB.projects.length) { toast('پروژه‌ای ثبت نشده'); return; }
  openForm('افزودن آیتم از پروژه', [
    { k: 'p', label: 'پروژه', type: 'select', numeric: true, opts: projOpts(), value: inv.projectId || DB.projects[0].id },
    { k: 'basis', label: 'مقدار بر اساس', type: 'select', opts: [['done', 'متراژ انجام‌شده (از پیشرفت کار)'], ['area', 'متراژ کل پروژه']], value: 'done' },
  ], o => {
    const p = proj(o.p); if (!p) return false;
    const qty = o.basis === 'area' ? (p.area || 0) : agg(ALL, new Set([p.id])).meters;
    inv.items.push({ id: nid(), title: `${(cat(p.catId) || {}).name || ''} — ${p.name}`.replace(/^ — /, ''), desc: p.address || '', qty: Math.round(qty * 100) / 100, unit: 'متر مربع', price: rate(p), disc: 0 });
    if (!inv.projectId) inv.projectId = p.id;
    if (!inv.customer.address && p.address) inv.customer.address = p.address;
  });
}
function payForm(id) {
  const inv = getInv(id);
  openForm('تخفیف، مالیات و پرداخت', [
    { k: 'discount', label: `تخفیف فاکتور (${ccy()})`, type: 'money', value: inv.discount },
    { k: 'taxOn', label: 'مالیات', type: 'select', opts: [['0', 'ندارد'], ['1', 'دارد']], value: inv.taxOn ? '1' : '0' },
    { k: 'taxRate', label: 'درصد مالیات', type: 'num', value: inv.taxRate, when: o => o.taxOn === '1' },
    { k: 'cash', label: `پرداخت نقدی (${ccy()})`, type: 'money', value: inv.cash },
    { k: 'cheque', label: `پرداخت چکی (${ccy()})`, type: 'money', value: inv.cheque },
    { k: 'chequeNote', label: 'مشخصات چک (اختیاری)', value: inv.chequeNote, when: o => o.cheque > 0 },
  ], o => { Object.assign(inv, o); inv.taxOn = o.taxOn === '1'; });
}
function noteForm(id) {
  const inv = getInv(id);
  openForm('یادداشت زیر فاکتور', [{ k: 'note', label: 'یادداشت (در فاکتور چاپ می‌شود)', type: 'textarea', value: inv.note }], o => { inv.note = o.note; });
}
function dupInvoice(id, kind) {
  const src = getInv(id);
  const c = JSON.parse(JSON.stringify(src));
  c.id = nid(); c.no = +S('nextNo') || 1; DB.inv.nextNo = c.no + 1;
  c.date = todayJ(); c.cash = 0; c.cheque = 0; c.chequeNote = '';
  if (kind) c.kind = kind;
  c.items.forEach(it => it.id = nid());
  DB.invoices.push(c); save();
  stack[stack.length - 1] = { name: 'invoice', id: c.id }; render();
  toast(kind === 'inv' ? 'فاکتور از روی پیش فاکتور ساخته شد' : 'کپی فاکتور ساخته شد');
}

// ---------- تنظیمات ----------
function invSetForm(group) {
  const groups = {
    biz: ['اطلاعات فروشنده', [
      { k: 'biz', label: 'نام کسب‌وکار / فروشنده', value: S('biz') },
      { k: 'slogan', label: 'شعار یا توضیح زیر عنوان', value: S('slogan') },
      { k: 'bizPhone', label: 'تلفن', value: S('bizPhone'), ltr: true },
      { k: 'bizAddress', label: 'آدرس', type: 'textarea', value: S('bizAddress') },
    ]],
    pay: ['اطلاعات پرداخت', [
      { k: 'holder', label: 'به نام', value: S('holder') },
      { k: 'bank', label: 'نام بانک', value: S('bank') },
      { k: 'card', label: 'شماره کارت', value: S('card'), ltr: true },
      { k: 'sheba', label: 'شماره شبا', value: S('sheba'), ltr: true },
    ]],
    opt: ['تنظیمات فاکتور', [
      { k: 'currency', label: 'واحد پول', type: 'select', opts: [['تومان', 'تومان'], ['ریال', 'ریال']], value: S('currency') },
      { k: 'taxRate', label: 'درصد مالیات پیش‌فرض', type: 'num', value: S('taxRate') },
      { k: 'roundTo', label: 'رند شدن مبلغ قابل پرداخت', type: 'select', opts: [['0', 'ندارد'], ['1000', 'هزار'], ['10000', 'ده هزار'], ['100000', 'صد هزار'], ['1000000', 'یک میلیون']], value: String(S('roundTo')) },
      { k: 'nextNo', label: 'شماره فاکتور بعدی', type: 'num', value: S('nextNo') },
      { k: 'defTitle', label: 'عنوان پیش‌فرض فاکتور', value: S('defTitle'), hint: 'مثلاً «کناف» ← «پیش فاکتور کناف»' },
      { k: 'sign', label: 'کادر امضای فروشنده و خریدار', type: 'select', opts: [['1', 'دارد'], ['0', 'ندارد']], value: S('sign') },
      { k: 'showBal', label: 'نمایش مانده فاکتورهای قبلی مشتری', type: 'select', opts: [['1', 'دارد'], ['0', 'ندارد']], value: S('showBal') },
    ]],
    text: ['متن‌های ثابت فاکتور', [
      { k: 'terms', label: 'شرایط و توضیحات ثابت (هر فاکتور)', type: 'textarea', value: S('terms') },
      { k: 'footer', label: 'متن پایانی', value: S('footer') },
    ]],
  };
  const g = groups[group];
  openForm(g[0], g[1], o => {
    for (const k in o) DB.inv[k] = (k === 'card' || k === 'sheba' || k === 'bizPhone') ? toEn(o[k]) : o[k];
    if (o.roundTo !== undefined) DB.inv.roundTo = +o.roundTo;
  });
}
function pickImage(key) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 600, sc = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        DB.inv[key] = cv.toDataURL('image/png');
        save(); render(); toast('تصویر ذخیره شد');
      };
      img.onerror = () => toast('این فایل تصویر معتبر نیست');
      img.src = rd.result;
    };
    rd.readAsDataURL(f);
  };
  document.body.appendChild(inp); inp.click(); setTimeout(() => inp.remove(), 60000);
}
function clearImage(key) { DB.inv[key] = key === 'logo' ? 'none' : ''; save(); render(); }
const logoSrc = () => { const l = S('logo'); return l === 'none' ? '' : (l || 'logo.png'); };

// ---------- نمایش‌ها ----------
V.invoices = r => {
  const f = r.f || 'all';
  let list = DB.invoices.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.no - a.no);
  const calcs = new Map(list.map(i => [i, invCalc(i)]));
  const openSum = sum(list.filter(i => i.kind !== 'pre'), i => Math.max(0, calcs.get(i).remain));
  if (f === 'open') list = list.filter(i => ['open', 'part'].includes(calcs.get(i).status));
  if (f === 'pre') list = list.filter(i => i.kind === 'pre');
  let h = `<div class="card"><div class="hl"><div><div class="mut">مانده فاکتورهای تسویه‌نشده</div><div class="big">${fm(openSum)} <span style="font-size:14px">${ccy()}</span></div></div>
    <button class="btn sm dark" onclick="go('invSettings')">${ic('gear')} تنظیمات</button></div></div>`;
  h += `<div class="seg" style="margin-bottom:12px;display:flex">${[['all', 'همه'], ['open', 'تسویه‌نشده'], ['pre', 'پیش فاکتورها']].map(x => `<button class="sb ${f === x[0] ? 'p' : ''}" style="flex:1" onclick="setSub('f','${x[0]}')">${x[1]}</button>`).join('')}</div>`;
  if (!list.length) h += empty('با دکمه + فاکتور یا پیش فاکتور جدید بسازید و به صورت PDF ذخیره یا ارسال کنید.', 'receipt', 'فاکتوری نیست');
  else h += '<div class="list">' + list.map(i => {
    const c = calcs.get(i); const st = STATUS[c.status];
    return `<div class="li" onclick="go('invoice',{id:${i.id}})"><span class="av sq ${i.kind === 'pre' ? '' : 'on'}">${ic('receipt')}</span>
      <div class="d"><b>${kindLabel(i)} ${faDigits(i.no)}${i.title ? ' — ' + esc(i.title) : ''}</b><div class="mut">${esc((i.customer && i.customer.name) || 'بدون طرف حساب')} · ${showDate(i.date)}</div></div>
      <div class="v">${fm(c.payable)}<small><span class="badge ${st[1]}">${st[0]}</span></small></div></div>`;
  }).join('') + '</div>';
  return { title: 'فاکتورها', html: h, fab: 'invNewMenu()' };
};
function invNewMenu() {
  openForm('فاکتور جدید', [{ k: 'kind', label: 'نوع', type: 'select', opts: [['inv', 'فاکتور فروش / اجرا'], ['pre', 'پیش فاکتور']], value: 'inv' }],
    o => { setTimeout(() => newInvoice(o.kind), 0); });
}

V.invoice = r => {
  const inv = getInv(r.id); if (!inv) { stack.pop(); return V[cur_().name](cur_()); }
  const c = invCalc(inv); const st = STATUS[c.status]; const cu = inv.customer || {};
  let h = `<div class="invhead" onclick="invHeadForm(${inv.id})"><div class="ct"><div style="flex:1"><div class="t">${kindLabel(inv)} ${esc(inv.title)}</div>
      <div class="s">${showDate(inv.date)}${inv.due ? ' · مهلت: ' + esc(inv.due) : ''}${inv.projectId ? ' · ' + esc(pname(inv.projectId)) : ''}</div></div>
      <div class="no"># ${faDigits(inv.no)}</div></div></div>`;
  h += `<div class="sec">طرف حساب</div>`;
  if (cu.name) h += `<div class="card click" onclick="custForm(${inv.id})"><div class="ct"><span class="av sq">${ic('user')}</span><div style="flex:1;min-width:0"><b>${esc(cu.name)}</b>
      <div class="meta">${cu.phone ? `<span>${ic('phone')}${esc(faDigits(cu.phone))}</span>` : ''}${cu.address ? `<span>${ic('pin')}${esc(cu.address)}</span>` : ''}</div></div><span class="mut">${ic('edit')}</span></div></div>`;
  else h += `<button class="btn wide" style="border:1.5px dashed #C9CDC5;background:#fff" onclick="custForm(${inv.id})">${ic('plus')} افزودن طرف حساب</button>`;
  h += `<div class="sec">آیتم‌های فاکتور</div>
    <div class="row" style="margin-bottom:10px"><button class="btn pri" style="flex:1" onclick="itemForm(${inv.id})">${ic('plus')} آیتم جدید</button><button class="btn dark" style="flex:1" onclick="itemFromProject(${inv.id})">${ic('site')} از پروژه</button></div>`;
  if (inv.items.length) h += '<div class="card">' + inv.items.map((it, k) => `<div class="tx" onclick="itemForm(${inv.id},${it.id})"><span class="dot" style="background:var(--paper);color:var(--ink);font-weight:800">${faDigits(k + 1)}</span>
      <div class="d"><div><b>${esc(it.title)}</b></div>${it.desc ? `<div class="mut">${esc(it.desc)}</div>` : ''}
      <div class="mut">${faNum(it.qty)} ${esc(it.unit)} × ${fm(it.price)}${it.disc ? ` · تخفیف ${fm(it.disc)}` : ''}</div></div>
      <div class="a">${fm(it.qty * it.price - (it.disc || 0))}</div></div>`).join('') + '</div>';
  else h += empty('آیتم اضافه کنید؛ یا با «از پروژه» متراژ و قیمت را از یک پروژه بیاورید.', 'receipt', '');
  h += `<div class="sec">انتهای فاکتور</div><div class="card" onclick="payForm(${inv.id})">
    <div class="kv"><span>جمع</span><span>${fmc(c.sub)}</span></div>
    <div class="kv"><span>جمع تخفیف‌ها</span><span class="pos">${fmc(c.idisc)}</span></div>
    <div class="kv"><span>مالیات</span><span>${inv.taxOn ? `${faNum(inv.taxRate)}٪ — ${fmc(c.tax)}` : '<span class="mut">ندارد</span>'}</span></div>
    <div class="kv"><span>جمع کل</span><span>${fmc(c.total)}</span></div>
    <div class="kv"><span>تخفیف فاکتور</span><span>${fmc(inv.discount)}</span></div>
    <div class="kv"><span>کسر رند</span><span>${fmc(c.round)}</span></div>
    <div class="kv total"><span>قابل پرداخت</span><span>${fmc(c.payable)}</span></div>
    <div class="kv"><span>پرداخت نقدی</span><span>${fmc(inv.cash)}</span></div>
    <div class="kv"><span>پرداخت چکی</span><span>${fmc(inv.cheque)}</span></div>
    <div class="kv"><span>مانده</span><span class="${c.remain > 0 ? 'neg' : ''}">${fmc(Math.max(0, c.remain))}</span></div>
    <div class="kv"><span>وضعیت فاکتور</span><span class="badge ${st[1]}">${st[0]}</span></div>
    <div class="mut" style="text-align:center;margin-top:6px">برای ثبت تخفیف، مالیات و پرداخت‌ها بزنید</div></div>`;
  h += `<div class="card click" onclick="noteForm(${inv.id})"><div class="ct"><b style="font-size:14px">یادداشت زیر فاکتور</b><span class="mut">${ic('edit')}</span></div><div class="mut">${inv.note ? esc(inv.note) : 'ندارد'}</div></div>`;
  h += `<div class="row" style="margin-bottom:10px"><button class="btn pri" style="flex:1" onclick="invPdf(${inv.id},'save')">${ic('pdf')} ذخیره PDF</button><button class="btn dark" style="flex:1" onclick="invPdf(${inv.id},'share')">${ic('share')} ارسال</button></div>
    <div class="row"><button class="btn" style="flex:1" onclick="go('invPreview',{id:${inv.id}})">${ic('eye')} پیش‌نمایش</button><button class="btn" style="flex:1" onclick="dupInvoice(${inv.id}${inv.kind === 'pre' ? ",'inv'" : ''})">${ic('copy')} ${inv.kind === 'pre' ? 'تبدیل به فاکتور' : 'کپی فاکتور'}</button></div>`;
  return { title: `${kindLabel(inv)} شماره ${faDigits(inv.no)}`, html: h, edit: `invHeadForm(${inv.id})` };
};

V.invPreview = r => {
  const inv = getInv(r.id); if (!inv) { stack.pop(); return V[cur_().name](cur_()); }
  window._prevHtml = invoiceHtml(inv);
  const h = `<div class="row" style="margin-bottom:12px"><button class="btn pri" style="flex:1" onclick="invPdf(${inv.id},'save')">${ic('pdf')} ذخیره PDF</button><button class="btn dark" style="flex:1" onclick="invPdf(${inv.id},'share')">${ic('share')} ارسال</button></div>
    <div id="pvw" class="pvw"><iframe id="pvf" onload="fitPreview()"></iframe></div>`;
  setTimeout(() => { const f = document.getElementById('pvf'); if (f) f.srcdoc = window._prevHtml; }, 0);
  return { title: 'پیش‌نمایش', html: h };
};
function fitPreview() {
  const w = document.getElementById('pvw'), f = document.getElementById('pvf');
  if (!w || !f || !f.contentDocument) return;
  const sc = w.clientWidth / 794;
  const ht = f.contentDocument.documentElement.scrollHeight;
  f.style.height = ht + 'px'; f.style.transform = `scale(${sc})`;
  w.style.height = (ht * sc) + 'px';
}
window.addEventListener('resize', () => { if (document.getElementById('pvf')) fitPreview(); });

V.invSettings = () => {
  const lg = logoSrc(), sp = S('stamp');
  const row = (g, t, d) => `<div class="li" onclick="invSetForm('${g}')"><div class="d"><b>${t}</b><div class="mut">${d}</div></div><span class="mut">${ic('edit')}</span></div>`;
  let h = `<div class="sec">لوگو و مهر</div><div class="card">
    <div class="ct" style="margin-bottom:10px"><div class="imgbox">${lg ? `<img src="${lg}">` : ic('image')}</div><div style="flex:1"><b>لوگوی فاکتور</b><div class="mut">${S('logo') ? (S('logo') === 'none' ? 'بدون لوگو' : 'لوگوی شما') : 'لوگوی راوانو (پیش‌فرض)'}</div></div></div>
    <div class="row"><button class="btn pri sm" style="flex:1" onclick="pickImage('logo')">${ic('image')} آپلود لوگو</button>${lg ? `<button class="btn sm" onclick="clearImage('logo')">حذف</button>` : ''}</div>
    <div class="ct" style="margin:16px 0 10px"><div class="imgbox">${sp ? `<img src="${sp}">` : ic('image')}</div><div style="flex:1"><b>مهر یا امضا</b><div class="mut">${sp ? 'زیر فاکتور چاپ می‌شود' : 'ندارد'}</div></div></div>
    <div class="row"><button class="btn pri sm" style="flex:1" onclick="pickImage('stamp')">${ic('image')} آپلود مهر/امضا</button>${sp ? `<button class="btn sm" onclick="clearImage('stamp')">حذف</button>` : ''}</div></div>
    <div class="sec">تنظیمات</div><div class="list">
    ${row('biz', 'اطلاعات فروشنده', esc(S('biz') || 'نام، شعار، تلفن و آدرس'))}
    ${row('pay', 'اطلاعات پرداخت', S('card') ? esc(faDigits(S('card'))) : 'شماره کارت، شبا و بانک')}
    ${row('opt', 'تنظیمات فاکتور', `واحد پول: ${ccy()} · مالیات پیش‌فرض ${faNum(S('taxRate'))}٪ · شماره بعدی ${faDigits(S('nextNo'))}`)}
    ${row('text', 'متن‌های ثابت فاکتور', esc(S('footer') || 'شرایط و متن پایانی'))}
    </div>`;
  return { title: 'تنظیمات فاکتور', html: h };
};

// ---------- قالب چاپی ----------
function invoiceHtml(inv) {
  const c = invCalc(inv); const cu = inv.customer || {};
  const lg = logoSrc(); const sp = S('stamp');
  const bal = S('showBal') === '1' && inv.kind !== 'pre' ? custBalance(inv) : { n: 0 };
  const e = esc;
  const rows = inv.items.map((it, k) => `<tr><td class="n">${faDigits(k + 1)}</td>
    <td class="desc"><b>${e(it.title)}</b>${it.desc ? `<div>${e(it.desc).replace(/\n/g, '<br>')}</div>` : ''}</td>
    <td>${faNum(it.qty)} ${e(it.unit)}</td><td>${fm(it.price)}</td><td>${fm(it.disc)}</td><td>${fm(it.qty * it.price - (it.disc || 0))}</td></tr>`).join('');
  const payInfo = S('card') || S('sheba');
  const tl = (a, b, cls) => `<tr class="${cls || ''}"><td>${a}</td><td>${b}</td></tr>`;
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=794">
<style>
@font-face{font-family:Vazirmatn;src:url(Vazirmatn.woff2) format('woff2');font-weight:100 900}
*{box-sizing:border-box}html,body{margin:0;background:#fff}
body{width:794px;font-family:Vazirmatn,Tahoma,sans-serif;color:#1c1f24;font-size:11.5px;line-height:1.7;padding:38px 36px 30px;font-feature-settings:'tnum'}
.top{display:flex;align-items:center;gap:18px;padding-bottom:14px;border-bottom:2px solid #1c1f24}
.top .b{flex:1}.top h1{margin:0;font-size:22px;font-weight:800}.top .sl{color:#555;font-size:12px}
.top .lg{width:150px;height:70px;display:flex;align-items:center;justify-content:flex-end}.top .lg img{max-width:150px;max-height:70px}
.top .seller{font-size:10.5px;color:#555;margin-top:2px}
.info{display:flex;gap:24px;margin:14px 0 12px}.info>div{flex:1}.info .l{font-size:11.5px}.info span{color:#666}
table.it{width:100%;border-collapse:collapse;font-size:11px}
table.it th{background:#eceeeb;font-weight:700;padding:6px 5px;border:1px solid #c9cdc7;text-align:center}
table.it td{border:1px solid #d6d9d4;padding:6px 5px;text-align:center;vertical-align:top}
table.it td.n{width:28px;color:#555}table.it td.desc{text-align:right}table.it td.desc div{color:#555;font-size:10.5px}
table.it tr:nth-child(even) td{background:#fafaf9}
.bottom{display:flex;gap:22px;margin-top:14px;align-items:flex-start}
.bottom .r{flex:1}.bottom .tot{width:270px}
table.t{width:100%;border-collapse:collapse;border:1px solid #c9cdc7}
table.t td{padding:4px 8px;font-size:11px}table.t td:last-child{text-align:left;white-space:nowrap}
table.t tr.sep td{border-top:1px solid #c9cdc7}table.t tr.pay td{font-weight:800;font-size:12.5px;background:#eceeeb;border-top:1.5px solid #1c1f24}
.balm{font-weight:700;font-size:11px;margin-bottom:10px}
.box{border:1px solid #c9cdc7;border-radius:6px;padding:8px 10px;margin-bottom:10px}.box h4{margin:0 0 4px;font-size:11.5px}
.box .ltr{direction:ltr;text-align:right;font-weight:700;letter-spacing:.5px}
.note{white-space:pre-wrap;font-size:11px}
.sig{display:flex;gap:30px;margin-top:26px}.sig>div{flex:1;text-align:center;border-top:1px dashed #999;padding-top:6px;color:#555;min-height:90px;position:relative}
.sig img{max-height:90px;max-width:160px;display:block;margin:4px auto 0}
.foot{text-align:center;margin-top:22px;font-size:12px;font-weight:700}
.meta{margin-top:18px;border-top:1px solid #ddd;padding-top:6px;display:flex;justify-content:space-between;color:#777;font-size:10px}
</style></head><body>
<div class="top"><div class="b"><h1>${kindLabel(inv)} ${e(inv.title)}</h1>${S('slogan') ? `<div class="sl">${e(S('slogan'))}</div>` : ''}
${S('biz') ? `<div class="seller">${e(S('biz'))}${S('bizPhone') ? ' — تلفن: ' + e(faDigits(S('bizPhone'))) : ''}</div>` : ''}</div>
${lg ? `<div class="lg"><img src="${lg}"></div>` : ''}</div>
<div class="info"><div class="l"><div><span>شماره ${kindLabel(inv)}:</span> <b>${faDigits(inv.no)}</b></div><div><span>تاریخ:</span> <b>${faDigits(inv.date)}</b></div>${inv.due ? `<div><span>${inv.kind === 'pre' ? 'اعتبار' : 'مهلت پرداخت'}:</span> ${e(faDigits(inv.due))}</div>` : ''}</div>
<div class="l"><div><span>طرف حساب:</span> <b>${e(cu.name || '—')}</b></div>${cu.address ? `<div><span>آدرس:</span> ${e(cu.address)}</div>` : ''}${cu.phone ? `<div><span>شماره تماس:</span> ${e(faDigits(cu.phone))}</div>` : ''}${cu.nid ? `<div><span>کد/شناسه ملی:</span> ${e(faDigits(cu.nid))}</div>` : ''}</div></div>
<table class="it"><thead><tr><th>ردیف</th><th>شرح</th><th>مقدار</th><th>مبلغ واحد (${ccy()})</th><th>تخفیف</th><th>جمع (${ccy()})</th></tr></thead><tbody>${rows || '<tr><td colspan="6" style="color:#999">—</td></tr>'}</tbody></table>
<div class="bottom"><div class="r">
${bal.n ? `<div class="balm">مانده ${faDigits(bal.n)} فاکتور تسویه‌نشده قبلی به جمع ${fmc(bal.s)} می‌باشد.</div>` : ''}
${payInfo ? `<div class="box"><h4>اطلاعات پرداخت</h4>${S('holder') ? `<div>به نام: ${e(S('holder'))}</div>` : ''}${S('card') ? `<div>شماره کارت:</div><div class="ltr">${e(faDigits(S('card').replace(/(\d{4})(?=\d)/g, '$1-')))}</div>` : ''}${S('sheba') ? `<div>شماره شبا:</div><div class="ltr">${e(faDigits(S('sheba').toUpperCase()))}</div>` : ''}${S('bank') ? `<div>${e(S('bank'))}</div>` : ''}</div>` : ''}
${inv.note ? `<div class="box"><h4>توضیحات</h4><div class="note">${e(inv.note)}</div></div>` : ''}
${S('terms') ? `<div class="box"><div class="note">${e(S('terms'))}</div></div>` : ''}
</div><div class="tot"><table class="t">
${tl('جمع', fmc(c.sub))}${tl('جمع تخفیف‌ها', fmc(c.idisc))}${tl(`مالیات ${inv.taxOn ? faNum(inv.taxRate) + '٪' : ''}`, fmc(c.tax))}
${tl('جمع کل', fmc(c.total), 'sep')}${tl('تخفیف فاکتور', fmc(inv.discount))}${tl('کسر رند', fmc(c.round))}
${tl('قابل پرداخت', fmc(c.payable), 'pay')}
${c.paid ? tl('پرداخت نقدی', fmc(inv.cash), 'sep') + tl('پرداخت چکی' + (inv.chequeNote ? ` (${e(inv.chequeNote)})` : ''), fmc(inv.cheque)) + tl('<b>مانده</b>', `<b>${fmc(Math.max(0, c.remain))}</b>`) : ''}
</table></div></div>
${S('sign') === '1' || sp ? `<div class="sig"><div>مهر و امضای فروشنده${sp ? `<img src="${sp}">` : ''}</div><div>امضای خریدار</div></div>` : ''}
${S('footer') ? `<div class="foot">${e(S('footer'))}</div>` : ''}
<div class="meta"><span>${S('bizAddress') ? e(S('bizAddress')) : ''}</span><span>${kindLabel(inv)} ${faDigits(inv.no)} — ${faDigits(inv.date)}</span></div>
</body></html>`;
}

// ---------- خروجی PDF ----------
function invPdf(id, action) {
  const inv = getInv(id);
  if (!inv.items.length) { toast('ابتدا آیتم‌های فاکتور را وارد کنید'); return; }
  const name = `${inv.kind === 'pre' ? 'pre-invoice' : 'invoice'}-${inv.no}-${inv.date.replace(/\//g, '-')}.pdf`;
  const html = invoiceHtml(inv);
  if (window.Android && Android.makePdf) {
    toast('در حال ساخت PDF…');
    Android.makePdf(html, name, action);
    return;
  }
  // مرورگر: چاپ / ذخیره به PDF
  const fr = document.createElement('iframe');
  fr.style.cssText = 'position:fixed;width:794px;height:10px;left:-9999px;top:0';
  document.body.appendChild(fr);
  fr.onload = () => { setTimeout(() => { fr.contentWindow.print(); setTimeout(() => fr.remove(), 2000); }, 300); };
  fr.srcdoc = html;
}
window.onPdfDone = r => {
  if (!r) return;
  if (r.indexOf('ok:') === 0) info('PDF ذخیره شد', `<p>فایل در پوشه <b>Download</b> گوشی ذخیره شد:</p><p dir="ltr" style="text-align:left">${esc(r.slice(3))}</p>`);
  else if (r === 'shared') { }
  else toast('خطا در ساخت PDF: ' + r);
};
