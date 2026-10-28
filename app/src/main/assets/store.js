'use strict';
// ===================== محل ذخیره اطلاعات =====================
// در برنامه اندروید، اطلاعات بزرگ (اطلاعات اصلی، وضعیت همگام‌سازی، لوگو و مهر) در فایل‌های پوشه
// خصوصی برنامه ذخیره می‌شود و دیگر به سقف حدود ۵ مگابایتی حافظه WebView محدود نیست.
// در مرورگر و آزمایش‌ها همان localStorage است. تنظیمات کوچک همیشه در localStorage می‌ماند.
//
// انتقال یک‌باره: هر کلید بزرگ از localStorage در فایل نوشته، دوباره خوانده و مقایسه می‌شود؛ یک نسخه
// «پیش از انتقال» هم جدا نگه داشته می‌شود. فقط وقتی همه کلیدها درست منتقل شدند، برنامه از فایل
// استفاده می‌کند و نسخه localStorage پاک می‌شود. اگر هر مرحله خطا داد، همه چیز در localStorage
// می‌ماند و دفعه بعد دوباره امتحان می‌شود.
const KV_BIG = ['contractor_db_v1', 'eshim_sync', 'rawano_logo', 'rawano_stamp'];
const KV_READ_ERROR = '\u0000ERR';
const KV = { native: false, err: '' };
function kvIsBig(k) { return KV_BIG.includes(k) || /^db_corrupt_\d+$/.test(k); }

(function kvInit() {
  const A = window.Android;
  if (!(A && A.storeGet && A.storeSet && A.storeRemove)) return;
  let lsKeys = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (kvIsBig(k)) lsKeys.push(k); } } catch (e) { lsKeys = []; }
  try {
    if (A.storeGet('_migrated') !== '1') {
      for (const k of lsKeys) {
        const v = localStorage.getItem(k);
        if (v == null) continue;
        if (!A.storeSet(k, v)) throw new Error('write ' + k);
        if (A.storeGet(k) !== v) throw new Error('verify ' + k);
        // نسخه پیش از انتقال، فقط برای احتیاط (در نسخه‌های بعدی پاک می‌شود)
        if (k === 'contractor_db_v1') A.storeSet(k + '__pre', v);
      }
      if (!A.storeSet('_migrated', '1') || A.storeGet('_migrated') !== '1') throw new Error('flag');
    }
    KV.native = true;
  } catch (e) {
    KV.err = String(e && e.message || e);
    KV.native = false;
    return;
  }
  // نسخه‌های localStorage که قبلاً درست منتقل و بررسی شده‌اند دیگر لازم نیستند
  for (const k of lsKeys) { try { localStorage.removeItem(k); } catch (e) { } }
})();

function kvGet(k) {
  if (KV.native && kvIsBig(k)) {
    const v = Android.storeGet(k);
    if (v === KV_READ_ERROR) throw Object.assign(new Error('read-error'), { code: 'read' });
    return v == null ? null : String(v);
  }
  return localStorage.getItem(k);
}
function kvSet(k, v) {
  if (KV.native && kvIsBig(k)) {
    if (!Android.storeSet(k, String(v))) throw new Error('store-failed');
    return;
  }
  localStorage.setItem(k, v);
}
function kvRemove(k) {
  if (KV.native && kvIsBig(k)) { Android.storeRemove(k); return; }
  localStorage.removeItem(k);
}
// فضای استفاده‌شده؛ در حالت فایل، فضای خالی گوشی هم برگردانده می‌شود
function kvUsage() {
  let ls = 0;
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls += (k.length + (localStorage.getItem(k) || '').length) * 2; } } catch (e) { }
  if (KV.native && Android.storeInfo) {
    try { const o = JSON.parse(Android.storeInfo()); return { native: true, used: (+o.used || 0) + ls, free: +o.free || 0 }; } catch (e) { }
  }
  return { native: false, used: ls, free: 0 };
}
