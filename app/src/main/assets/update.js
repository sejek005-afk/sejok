'use strict';
// ===================== پیام «نسخه جدید آمده» =====================
// برنامه هنگام باز شدن (و حداکثر هر ۶ ساعت) آخرین نسخه را از سرور می‌پرسد.
// اگر نسخه جدیدتری بود، بالای صفحه پیام به‌روزرسانی نشان داده می‌شود؛
// اگر نسخه فعلی از حداقل لازم (min) قدیمی‌تر بود، تا به‌روزرسانی برنامه باز نمی‌شود.
const UPD_KEY = 'eshim_update';
const UPD_DEFAULT_URL = 'bazaar://details?id=ir.sejok.contractor';
let UPD = { latest: 0, name: '', min: 0, message: '', url: '', force: false, show: false };

function updMyCode() {
  try { return window.Android && Android.appVersionCode ? Number(Android.appVersionCode()) || 0 : 0; } catch (e) { return 0; }
}
function updLoad() { try { return JSON.parse(localStorage.getItem(UPD_KEY) || '{}') || {}; } catch (e) { return {}; } }
function updSave(o) { try { localStorage.setItem(UPD_KEY, JSON.stringify(o)); } catch (e) { } }

function updApply(info) {
  const mine = updMyCode();
  if (!mine || !info) { UPD.show = UPD.force = false; return; }
  const st = updLoad();
  UPD = Object.assign(UPD, {
    latest: +info.latest || 0, name: String(info.name || ''), min: +info.min || 0,
    message: String(info.message || ''), url: String(info.url || '') || UPD_DEFAULT_URL,
  });
  UPD.force = UPD.min > mine;
  // پیام عادی: تا وقتی کاربر برای همین نسخه «بعداً» نزده باشد
  UPD.show = !UPD.force && UPD.latest > mine && st.dismissed !== UPD.latest;
}
async function updCheck(force) {
  if (typeof fetch !== 'function' || !updMyCode()) return;
  const st = updLoad();
  // آخرین جواب ذخیره‌شده تا بدون اینترنت هم پیام بماند
  if (st.info) updApply(st.info);
  if (!force && st.at && Date.now() - st.at < 6 * 3600000) { updRender(); return; }
  try {
    const base = (typeof SY !== 'undefined' && SY.url) || (typeof DEFAULT_SERVER !== 'undefined' ? DEFAULT_SERVER : 'https://eshim.ir/api/');
    const r = await fetch(base + 'index.php?r=version', { cache: 'no-store', credentials: 'omit' });
    const j = await r.json();
    if (!j || !j.ok) return;
    st.info = j; st.at = Date.now(); updSave(st);
    updApply(j);
  } catch (e) { }
  updRender();
}
function updOpen() { openExt(UPD.url || UPD_DEFAULT_URL); }
function updLater() { const st = updLoad(); st.dismissed = UPD.latest; updSave(st); UPD.show = false; render(); }
window.updOpen = updOpen; window.updLater = updLater;

function updBanner() {
  if (!UPD.show) return '';
  return `<div class="card" style="border:2px solid var(--yellow);margin-bottom:12px">
    <div class="ct"><b>نسخه جدید ایشیمیز آمده${UPD.name ? ' (' + esc(faDigits(UPD.name)) + ')' : ''}</b></div>
    ${UPD.message ? `<div class="mut" style="margin:4px 0">${esc(UPD.message)}</div>` : ''}
    <div class="row" style="gap:8px;margin-top:8px"><button class="btn pri" style="flex:2;margin:0" onclick="updOpen()">به‌روزرسانی از بازار</button><button class="btn" style="flex:1;margin:0" onclick="updLater()">بعداً</button></div></div>`;
}
V.update = () => ({
  title: 'ایشیمیز',
  logo: true,
  html: `<div class="card" style="text-align:center;margin-top:24px"><b style="font-size:17px">نسخه جدید ایشیمیز لازم است</b>
    <p class="mut">${esc(UPD.message || 'این نسخه دیگر با سرور کار نمی‌کند. برای ادامه، برنامه را از بازار به‌روز کنید. اطلاعات شما سر جایش می‌ماند.')}</p>
    <button class="btn pri wide" onclick="updOpen()">به‌روزرسانی از بازار</button></div>`,
});
// صفحه اجباری به‌روزرسانی، قبل از صفحه ورود
const _gateUpd = window.authGate;
window.authGate = () => UPD.force ? 'update' : (_gateUpd ? _gateUpd() : null);
// پیام بالای صفحه اصلی بعد از هر رندر
const _renderUpd = render;
render = function () {
  _renderUpd();
  if (!UPD.show || UPD.force) return;
  const r = cur();
  if (stack.length !== 1 || (window.authGate && authGate())) return;
  if (!['home', 'settings'].includes(r.name)) return;
  const m = document.getElementById('main');
  if (m) m.insertAdjacentHTML('afterbegin', updBanner());
};
function updRender() {
  const modal = document.getElementById('modal');
  if (modal && !modal.classList.contains('hidden')) return;
  render();
}
updCheck(false);
document.addEventListener('visibilitychange', () => { if (!document.hidden) updCheck(false); });
