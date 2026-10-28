'use strict';
// بازیابی یک‌باره اطلاعات منتقل‌شده از مبدأ قدیمی file:// (قبل از بارگذاری برنامه اجرا می‌شود)
(function () {
  try {
    if (!(window.Android && Android.takeMigration)) return;
    var s = Android.takeMigration();
    if (!s) return;
    var o = JSON.parse(s), KEY = 'contractor_db_v1';
    if (!o || typeof o !== 'object') { Android.migrationDone(); return; }
    if (!kvGet(KEY)) {
      for (var k in o) if (typeof o[k] === 'string') { try { kvSet(k, o[k]); } catch (e) { } }
    }
    // فقط وقتی اطلاعات اصلی واقعاً منتقل شده، فایل موقت حذف می‌شود
    if (kvGet(KEY) || !o[KEY]) Android.migrationDone();
  } catch (e) { }
})();
