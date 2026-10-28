'use strict';
// ===================== فاکتور =====================
const INV_DEF = {
  biz: '', slogan: '', bizPhone: '', bizAddress: '', currency: 'تومان', taxRate: 10, roundTo: 0,
  card: '', sheba: '', bank: '', holder: '', footer: 'از همکاری با شما مفتخریم', terms: '',
  sign: '1', showBal: '1', nextNo: 1, logo: '', stamp: '', defTitle: '',
};
const UNITS = ['متر مربع', 'متر طول', 'متر', 'عدد', 'شاخه', 'برگ', 'کیلوگرم', 'سرویس', 'روز', 'مقطوع'];
// لوگو و مهر جدا از اطلاعات اصلی ذخیره می‌شوند تا فایل اصلی سنگین نشود
const ASSET_KEY = { logo: 'rawano_logo', stamp: 'rawano_stamp' };
function getAsset(k) { try { return kvGet(ASSET_KEY[k]) || ''; } catch (e) { return ''; } }
function setAsset(k, v) {
  try { if (v) kvSet(ASSET_KEY[k], v); else kvRemove(ASSET_KEY[k]); return true; } catch (e) { return false; }
}
// انتقال لوگو/مهر از داخل اطلاعات اصلی (نسخه‌های قبلی یا فایل پشتیبان) به کلید جداگانه
function migrateAssets(force) {
  let changed = false;
  for (const k of ['logo', 'stamp']) {
    if (DB.inv[k] === undefined) { if (force) setAsset(k, ''); continue; }
    if (force || !getAsset(k)) setAsset(k, DB.inv[k]);
    delete DB.inv[k]; changed = true;
  }
  return changed;
}
const S = k => (k === 'logo' || k === 'stamp') ? getAsset(k) : (DB.inv[k] !== undefined && DB.inv[k] !== null) ? DB.inv[k] : INV_DEF[k];
const getInv = id => DB.invoices.find(x => x.id === +id);
const kindLabel = inv => inv.kind === 'pre' ? 'پیش فاکتور' : 'فاکتور';
const ccy = () => S('currency');
function fm(n) { return rnd(n).toLocaleString('fa-IR'); }
// جمع یک ردیف فاکتور به واحد کامل پول
function lineTotal(it) { return rnd((Number(it.qty) || 0) * (Number(it.price) || 0)) - rnd(it.disc); }
function fmc(n) { return fm(n) + ' ' + ccy(); }

// نتیجه محاسبه هر فاکتور تا تغییر بعدی داده (save) نگه داشته می‌شود
function invCalc(inv) {
  const I = idx(); if (!I.invCalc) I.invCalc = new Map();
  let c = I.invCalc.get(inv);
  if (!c) { c = invCalcRaw(inv); I.invCalc.set(inv, c); }
  return c;
}
function invCalcRaw(inv) {
  // هر ردیف و مبلغ قابل پرداخت به واحد کامل گرد می‌شود تا پرداخت همان عدد نمایش‌داده‌شده، فاکتور را تسویه کند
  let sub = 0, idisc = 0;
  for (const it of inv.items) { sub += rnd((Number(it.qty) || 0) * (Number(it.price) || 0)); idisc += rnd(it.disc); }
  const base = sub - idisc;
  const tax = inv.taxOn ? rnd(base * (Number(inv.taxRate) || 0) / 100) : 0;
  const total = base + tax;
  const afterDisc = total - rnd(inv.discount);
  const rt = +S('roundTo') || 0;
  // کسر رند به سمت صفر و متقارن: ۱۵۰۰- با رند ۱۰۰۰ ← ۱۰۰۰- (نه ۲۰۰۰-)
  const r0 = rt > 0 ? afterDisc % rt : 0;
  const round = r0 === 0 ? 0 : r0;
  const payable = rnd(afterDisc - round);
  let cashP = 0, chqP = 0;
  for (const p of inv.pays || []) {
    if (p.method === 'cheque') {
      const ch = p.chequeId && idx().cheque.get(p.chequeId);
      if (ch && ch.status === 'bounced') continue;
      chqP += rnd(p.amount);
    } else cashP += rnd(p.amount);
  }
  const paid = cashP + chqP;
  const remain = payable - paid;
  const status = inv.kind === 'pre' ? 'pre' : (payable > 0 && remain <= 0 ? 'paid' : paid > 0 ? 'part' : 'open');
  return { sub, idisc, tax, total, round, payable, paid, cashP, chqP, remain, status };
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

// شماره فاکتور بعدی: از تنظیمات، اما هرگز کمتر از بزرگ‌ترین شماره موجود
// (وقتی چند نفر روی یک حساب کار می‌کنند، فاکتورهای دیگران هم بعد از همگام‌سازی در نظر گرفته می‌شوند)
function peekInvNo() {
  let max = 0;
  for (const i of DB.invoices) if (+i.no > max) max = +i.no;
  return Math.max(+S('nextNo') || 1, max + 1);
}
function takeInvNo() {
  const no = peekInvNo();
  DB.inv.nextNo = no + 1;
  return no;
}

// ---------- فرم‌ها ----------
function newInvoice(kind, projectId) {
  const no = takeInvNo();
  const inv = { id: nid(), no, kind: kind || 'inv', title: S('defTitle') || '', date: todayJ(), due: '', customer: { name: '', address: '', phone: '' }, projectId: null, items: [], discount: 0, taxOn: false, taxRate: +S('taxRate') || 0, pays: [], note: '' };
  if (projectId && proj(projectId)) { inv.projectId = +projectId; inv.customer.address = proj(projectId).address || ''; }
  DB.invoices.push(inv);
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
    inv.items.push({ id: nid(), title: `${(cat(p.catId) || {}).name || ''} — ${p.name}`.replace(/^ — /, ''), desc: p.address || '', qty: Math.round(qty * 100) / 100, unit: 'متر مربع', price: rate(p) * (ccy() === 'ریال' ? 10 : 1), disc: 0 });
    if (!inv.projectId) inv.projectId = p.id;
    if (!inv.customer.address && p.address) inv.customer.address = p.address;
  });
}
function payForm(id) {
  const inv = getInv(id);
  openForm('تخفیف و مالیات', [
    { k: 'discount', label: `تخفیف فاکتور (${ccy()})`, type: 'money', value: inv.discount },
    { k: 'taxOn', label: 'مالیات', type: 'select', opts: [['0', 'ندارد'], ['1', 'دارد']], value: inv.taxOn ? '1' : '0' },
    { k: 'taxRate', label: 'درصد مالیات', type: 'num', value: inv.taxRate, when: o => o.taxOn === '1' },
  ], o => { Object.assign(inv, o); inv.taxOn = o.taxOn === '1'; });
}
const PAY_M = { cash: 'نقدی', card: 'کارت به کارت / واریز', cheque: 'چک' };
function invPayForm(id, payId) {
  const inv = getInv(id); const p = payId ? inv.pays.find(x => x.id === payId) : null;
  const c = invCalc(inv);
  const ch = p && p.chequeId ? DB.cheques.find(x => x.id === p.chequeId) : null;
  openForm(p ? 'ویرایش دریافت' : 'ثبت دریافت از طرف حساب', [
    { k: 'date', label: 'تاریخ دریافت', type: 'date', value: p && p.date },
    { k: 'amount', label: `مبلغ (${ccy()})`, type: 'money', req: true, value: p ? p.amount : Math.max(0, c.remain) },
    { k: 'method', label: 'روش پرداخت', type: 'select', opts: Object.entries(PAY_M), value: p ? p.method : 'cash' },
    { k: 'due', label: 'تاریخ سررسید چک', type: 'date', value: ch ? ch.due : '', when: o => o.method === 'cheque' },
    { k: 'chNo', label: 'شماره چک (اختیاری)', value: ch && ch.no, when: o => o.method === 'cheque', ltr: true },
    { k: 'bank', label: 'بانک (اختیاری)', value: ch && ch.bank, when: o => o.method === 'cheque' },
    { k: 'note', label: 'توضیحات', value: p && p.note },
  ], o => {
    const rec = p || { id: nid() };
    Object.assign(rec, { date: o.date, amount: o.amount, method: o.method, note: o.note });
    if (!p) inv.pays.push(rec);
    let chq = rec.chequeId ? DB.cheques.find(x => x.id === rec.chequeId) : null;
    if (o.method === 'cheque') {
      const data = { dir: 'in', cur: ccy(), amount: o.amount, due: o.due, no: toEn(o.chNo || ''), bank: o.bank, party: (inv.customer && inv.customer.name) || '', invoiceId: inv.id, payId: rec.id };
      if (chq) Object.assign(chq, data);
      else { chq = Object.assign({ id: nid(), status: 'pending', alarm: true, time: '09:00', before: 0, note: `بابت ${kindLabel(inv)} ${inv.no}`, created: Date.now() }, data); DB.cheques.push(chq); }
      rec.chequeId = chq.id;
      return () => toast('چک در بخش «چک‌ها»ی تب یادداشت ثبت شد و روز سررسید یادآوری می‌شود');
    } else if (chq) { DB.cheques = DB.cheques.filter(x => x !== chq); rec.chequeId = null; }
  }, p ? () => {
    inv.pays = inv.pays.filter(x => x !== p);
    if (p.chequeId) DB.cheques = DB.cheques.filter(x => x.id !== p.chequeId);
  } : null);
}
function payRow(inv, p) {
  const ch = p.chequeId ? DB.cheques.find(x => x.id === p.chequeId) : null;
  const st = ch ? (ch.status === 'cleared' ? ' · وصول شد' : ch.status === 'bounced' ? ' · برگشتی' : ` · سررسید ${showDate(ch.due)}`) : '';
  return `<div class="tx" onclick="invPayForm(${inv.id},${p.id})"><span class="dot ${ch && ch.status === 'bounced' ? 'out' : 'in'}">${ic(p.method === 'cheque' ? 'receipt' : 'in')}</span><div class="d"><div>${PAY_M[p.method] || ''}${p.note ? ' — ' + esc(p.note) : ''}</div><div class="mut">${showDate(p.date)}${st}</div></div>
    <div class="a ${ch && ch.status === 'bounced' ? 'neg' : 'pos'}" style="${ch && ch.status === 'bounced' ? 'text-decoration:line-through' : ''}">${fm(p.amount)}</div></div>`;
}

// ---------- حساب پروژه با کارفرما ----------
function projAccount(p) {
  const I = idx(); if (!I.invByProj) I.invByProj = groupBy(DB.invoices.filter(i => i.kind !== 'pre'), i => i.projectId);
  const invs = I.invByProj.get(p.id) || [];
  let invoiced = 0, received = 0;
  for (const i of invs) { const c = invCalc(i); invoiced += c.payable; received += c.paid; }
  const k = ccy() === 'ریال' ? 10 : 1; // مبالغ پروژه به تومان است
  const work = agg(ALL, new Set([p.id])).revenue * k;
  const contract = (p.area || 0) * rate(p) * k;
  return { invs, invoiced, received, due: invoiced - received, unbilled: Math.max(0, work - invoiced), work, contract };
}
function projAccountCard(p) {
  const a = projAccount(p);
  const rows = a.invs.slice().sort(byDateDesc).slice(0, 30).map(i => { const c = invCalc(i); const st = STATUS[c.status];
    return `<div class="tx" onclick="go('invoice',{id:${i.id}})"><span class="dot" style="background:var(--yellow-soft);color:#8A6400">${ic('receipt')}</span><div class="d"><div>${kindLabel(i)} ${faDigits(i.no)}${i.title ? ' — ' + esc(i.title) : ''}</div><div class="mut">${showDate(i.date)} · <span class="badge ${st[1]}">${st[0]}</span></div></div><div class="a">${fm(c.payable)}</div></div>`; }).join('');
  return `<div class="card"><div class="ct" style="margin-bottom:4px"><b>حساب با کارفرما</b><button class="btn sm pri" onclick="newInvoice('inv',${p.id})">${ic('plus')} فاکتور</button></div>
    <div class="kv"><span>ارزش کار انجام‌شده</span><span>${fmc(a.work)}</span></div>
    <div class="kv"><span>جمع فاکتورها</span><span>${fmc(a.invoiced)}</span></div>
    <div class="kv"><span>دریافتی از کارفرما</span><span class="pos">${fmc(a.received)}</span></div>
    <div class="kv total"><span>طلب از کارفرما</span><span>${fmc(Math.max(0, a.due))}</span></div>
    ${a.unbilled > 0 ? `<div class="mut" style="margin-top:8px">${fmc(a.unbilled)} کار انجام‌شده هنوز فاکتور نشده است.</div>` : ''}
    ${rows ? `<div style="margin-top:8px">${rows}</div>` : ''}</div>`;
}

function noteForm(id) {
  const inv = getInv(id);
  openForm('یادداشت زیر فاکتور', [{ k: 'note', label: 'یادداشت (در فاکتور چاپ می‌شود)', type: 'textarea', value: inv.note }], o => { inv.note = o.note; });
}
function dupInvoice(id, kind) {
  const src = getInv(id);
  const c = JSON.parse(JSON.stringify(src));
  c.id = nid(); c.no = takeInvNo();
  c.date = todayJ(); c.pays = [];
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
        // کوچک‌سازی و فشرده‌سازی: حداکثر ۴۰۰ پیکسل؛ اگر PNG سنگین بود JPEG با زمینه سفید
        const max = 400, sc = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.width * sc)); cv.height = Math.max(1, Math.round(img.height * sc));
        const g = cv.getContext('2d');
        g.drawImage(img, 0, 0, cv.width, cv.height);
        let data = cv.toDataURL('image/png');
        if (data.length > 150000) {
          g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
          data = cv.toDataURL('image/jpeg', 0.85);
        }
        if (!setAsset(key, data)) { toast('حافظه برنامه کافی نیست؛ تصویر ذخیره نشد'); return; }
        render(); toast('تصویر ذخیره شد');
      };
      img.onerror = () => toast('این فایل تصویر معتبر نیست');
      img.src = rd.result;
    };
    rd.readAsDataURL(f);
  };
  document.body.appendChild(inp); inp.click(); setTimeout(() => inp.remove(), 60000);
}
function clearImage(key) { setAsset(key, key === 'logo' ? 'none' : ''); render(); }
const logoSrc = () => { const l = S('logo'); return l === 'none' ? '' : (l || 'logo.png'); };

// ---------- نمایش‌ها ----------
V.invoices = r => {
  const f = r.f || 'all';
  let list = DB.invoices.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.no - a.no));
  const calcs = new Map(list.map(i => [i, invCalc(i)]));
  const openSum = sum(list.filter(i => i.kind !== 'pre'), i => Math.max(0, calcs.get(i).remain));
  if (f === 'open') list = list.filter(i => ['open', 'part'].includes(calcs.get(i).status));
  if (f === 'pre') list = list.filter(i => i.kind === 'pre');
  if (f === 'proj') return invProjView();
  let h = `<div class="card"><div class="hl"><div><div class="mut">مانده فاکتورهای تسویه‌نشده</div><div class="big">${fm(openSum)} <span style="font-size:14px">${ccy()}</span></div></div>
    <button class="btn sm dark" onclick="go('invSettings')">${ic('gear')} تنظیمات</button></div></div>`;
  h += `<div class="seg" style="margin-bottom:12px;display:flex">${[['all', 'همه'], ['open', 'تسویه‌نشده'], ['pre', 'پیش فاکتور'], ['proj', 'حساب پروژه‌ها']].map(x => `<button class="sb ${f === x[0] ? 'p' : ''}" style="flex:1" onclick="setSub('f','${x[0]}')">${x[1]}</button>`).join('')}</div>`;
  if (!list.length) h += empty('با دکمه + فاکتور یا پیش فاکتور جدید بسازید و به صورت PDF ذخیره یا ارسال کنید.', 'receipt', 'فاکتوری نیست');
  const pg = pager(r, list.length);
  if (list.length) h += '<div class="list">' + list.slice(0, pg.lim).map(i => {
    const c = calcs.get(i); const st = STATUS[c.status];
    return `<div class="li" onclick="go('invoice',{id:${i.id}})"><span class="av sq ${i.kind === 'pre' ? '' : 'on'}">${ic('receipt')}</span>
      <div class="d"><b>${kindLabel(i)} ${faDigits(i.no)}${i.title ? ' — ' + esc(i.title) : ''}</b><div class="mut">${esc((i.customer && i.customer.name) || 'بدون طرف حساب')} · ${showDate(i.date)}</div></div>
      <div class="v">${fm(c.payable)}<small><span class="badge ${st[1]}">${st[0]}</span></small></div></div>`;
  }).join('') + '</div>' + pg.btn;
  return { title: 'فاکتورها', html: h, fab: 'invNewMenu()' };
};
function invProjView() {
  const seg = `<div class="seg" style="margin-bottom:12px;display:flex">${[['all', 'همه'], ['open', 'تسویه‌نشده'], ['pre', 'پیش فاکتور'], ['proj', 'حساب پروژه‌ها']].map(x => `<button class="sb ${x[0] === 'proj' ? 'p' : ''}" style="flex:1" onclick="setSub('f','${x[0]}')">${x[1]}</button>`).join('')}</div>`;
  const ps = DB.projects.map(p => [p, projAccount(p)]).filter(([p, a]) => a.invs.length || a.work > 0);
  const T = k => sum(ps, x => x[1][k]);
  let h = `<div class="card"><div class="kv"><span>جمع فاکتورهای پروژه‌ها</span><span>${fmc(T('invoiced'))}</span></div><div class="kv"><span>دریافتی از کارفرماها</span><span class="pos">${fmc(T('received'))}</span></div>
    <div class="kv total"><span>طلب از کارفرماها</span><span>${fmc(Math.max(0, T('due')))}</span></div>${T('unbilled') > 0 ? `<div class="mut" style="margin-top:6px">کار فاکتورنشده: ${fmc(T('unbilled'))}</div>` : ''}</div>` + seg;
  if (!ps.length) h += empty('برای فاکتورها «پروژه مرتبط» را انتخاب کنید تا حساب هر پروژه با کارفرما اینجا دیده شود.', 'site', 'هنوز حسابی نیست');
  else h += '<div class="list">' + ps.map(([p, a]) => `<div class="li" onclick="go('project',{id:${p.id}})"><span class="av sq on">${ic('site')}</span>
    <div class="d"><b>${esc(p.name)}</b><div class="mut">فاکتور ${fm(a.invoiced)} · دریافتی ${fm(a.received)}${a.unbilled > 0 ? ` · فاکتورنشده ${fm(a.unbilled)}` : ''}</div></div>
    <div class="v">${fm(Math.max(0, a.due))}<small>طلب از کارفرما</small></div></div>`).join('') + '</div>';
  return { title: 'فاکتورها', html: h, fab: 'invNewMenu()' };
}
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
      <div class="a">${fm(lineTotal(it))}</div></div>`).join('') + '</div>';
  else h += empty('آیتم اضافه کنید؛ یا با «از پروژه» متراژ و قیمت را از یک پروژه بیاورید.', 'receipt', '');
  h += `<div class="sec">انتهای فاکتور</div><div class="card" onclick="payForm(${inv.id})">
    <div class="kv"><span>جمع</span><span>${fmc(c.sub)}</span></div>
    <div class="kv"><span>جمع تخفیف‌ها</span><span class="pos">${fmc(c.idisc)}</span></div>
    <div class="kv"><span>مالیات</span><span>${inv.taxOn ? `${faNum(inv.taxRate)}٪ — ${fmc(c.tax)}` : '<span class="mut">ندارد</span>'}</span></div>
    <div class="kv"><span>جمع کل</span><span>${fmc(c.total)}</span></div>
    <div class="kv"><span>تخفیف فاکتور</span><span>${fmc(inv.discount)}</span></div>
    <div class="kv"><span>کسر رند</span><span>${fmc(c.round)}</span></div>
    <div class="kv total"><span>قابل پرداخت</span><span>${fmc(c.payable)}</span></div>
    <div class="mut" style="text-align:center;margin-top:6px">برای ثبت تخفیف و مالیات بزنید</div></div>`;
  h += `<div class="sec">دریافتی‌ها</div><div class="card">
    ${(inv.pays || []).length ? inv.pays.slice().sort(byDateDesc).map(p => payRow(inv, p)).join('') : '<div class="mut">دریافتی ثبت نشده</div>'}
    <div class="kv" style="margin-top:6px"><span>پرداخت نقدی / کارت</span><span>${fmc(c.cashP)}</span></div>
    <div class="kv"><span>پرداخت چکی</span><span>${fmc(c.chqP)}</span></div>
    <div class="kv total"><span>مانده</span><span class="${c.remain > 0 ? 'neg' : ''}">${fmc(Math.max(0, c.remain))}</span></div>
    <div class="kv"><span>وضعیت فاکتور</span><span class="badge ${st[1]}">${st[0]}</span></div>
    <button class="btn pri wide" style="margin:10px 0 0" onclick="invPayForm(${inv.id})">${ic('in')} ثبت دریافت</button></div>`;
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
    <div class="ct" style="margin-bottom:10px"><div class="imgbox">${lg ? `<img src="${lg}">` : ic('image')}</div><div style="flex:1"><b>لوگوی فاکتور</b><div class="mut">${S('logo') ? (S('logo') === 'none' ? 'بدون لوگو' : 'لوگوی شما') : 'لوگوی ایشیمیز (پیش‌فرض)'}</div></div></div>
    <div class="row"><button class="btn pri sm" style="flex:1" onclick="pickImage('logo')">${ic('image')} آپلود لوگو</button>${lg ? `<button class="btn sm" onclick="clearImage('logo')">حذف</button>` : ''}</div>
    <div class="ct" style="margin:16px 0 10px"><div class="imgbox">${sp ? `<img src="${sp}">` : ic('image')}</div><div style="flex:1"><b>مهر یا امضا</b><div class="mut">${sp ? 'زیر فاکتور چاپ می‌شود' : 'ندارد'}</div></div></div>
    <div class="row"><button class="btn pri sm" style="flex:1" onclick="pickImage('stamp')">${ic('image')} آپلود مهر/امضا</button>${sp ? `<button class="btn sm" onclick="clearImage('stamp')">حذف</button>` : ''}</div></div>
    <div class="sec">تنظیمات</div><div class="list">
    ${row('biz', 'اطلاعات فروشنده', esc(S('biz') || 'نام، شعار، تلفن و آدرس'))}
    ${row('pay', 'اطلاعات پرداخت', S('card') ? esc(faDigits(S('card'))) : 'شماره کارت، شبا و بانک')}
    ${row('opt', 'تنظیمات فاکتور', `واحد پول: ${ccy()} · مالیات پیش‌فرض ${faNum(S('taxRate'))}٪ · شماره بعدی ${faDigits(peekInvNo())}`)}
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
    <td>${faNum(it.qty)} ${e(it.unit)}</td><td>${fm(it.price)}</td><td>${fm(it.disc)}</td><td>${fm(lineTotal(it))}</td></tr>`).join('');
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
${c.paid ? tl('پرداخت نقدی', fmc(c.cashP), 'sep') + tl('پرداخت چکی', fmc(c.chqP)) + tl('<b>مانده</b>', `<b>${fmc(Math.max(0, c.remain))}</b>`) : ''}
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
  else toast('ساخت PDF انجام نشد؛ دوباره تلاش کنید');
};

// اجرا یک بار هنگام شروع: لوگو/مهر قدیمی از اطلاعات اصلی جدا شود
if (!DB_CORRUPT && migrateAssets(false)) save();
