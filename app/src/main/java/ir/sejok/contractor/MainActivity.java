package ir.sejok.contractor;

import android.annotation.SuppressLint;
import android.annotation.TargetApi;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Canvas;
import android.graphics.pdf.PdfDocument;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final String TAG = "Eshim";
    private static final int FILE_REQ = 1001;
    /** مبدأ امن برای بارگذاری فایل‌های برنامه به‌جای file:// */
    static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String MAIN_URL = ORIGIN + "/assets/index.html";
    private static final String MIGRATE_URL = "file:///android_asset/migrate.html";
    private static final String MIGRATION_FILE = "origin_migration.json";
    private static final int MAX_BACKUP_CHARS = 30 * 1024 * 1024;
    private static final int MAX_HTML_CHARS = 10 * 1024 * 1024;

    private WebView web;
    private WebView pdfView;
    private FrameLayout root;
    private WebViewAssetLoader assetLoader;
    private ValueCallback<Uri[]> fileCallback;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean pendingOpenNotes = false;
    private boolean pdfBusy = false;
    private int pdfToken = 0;

    // ---------- چرخه حیات ----------
    // جاوااسکریپت لازم است و فقط فایل‌های خود برنامه (از assets) بارگذاری می‌شوند؛ ورود به صفحات بیرونی مسدود است
    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(0xFF0B5754);
        // برای رسم کامل صفحه فاکتور در PDF (باید قبل از ساخت WebView صدا زده شود)
        WebView.enableSlowWholeDocumentDraw();

        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        root = new FrameLayout(this);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // هیچ صفحه بیرونی داخل برنامه باز نمی‌شود
                return !request.getUrl().toString().startsWith(ORIGIN);
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return url == null || !url.startsWith(ORIGIN);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (url != null && url.startsWith(ORIGIN) && pendingOpenNotes) { pendingOpenNotes = false; openNotes(); }
            }
        });
        pendingOpenNotes = getIntent() != null && getIntent().getBooleanExtra("openNotes", false);
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try {
                    startActivityForResult(Intent.createChooser(i, "انتخاب فایل"), FILE_REQ);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "Android");

        // نسخه‌های قبلی اطلاعات را در localStorage مبدأ file:// نگه می‌داشتند؛ یک بار به مبدأ جدید منتقل می‌شود
        if (prefs().getBoolean("originMigrated", false)) web.loadUrl(MAIN_URL);
        else web.loadUrl(MIGRATE_URL);
    }

    private SharedPreferences prefs() { return getSharedPreferences("rawano_app", MODE_PRIVATE); }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        destroyPdfView();
        if (web != null) {
            ViewGroup p = (ViewGroup) web.getParent();
            if (p != null) p.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent != null && intent.getBooleanExtra("openNotes", false)) openNotes();
    }

    private void openNotes() {
        handler.postDelayed(() -> js("window.openTab && window.openTab('notes')"), 300);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_REQ && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (web == null) { finish(); return; }
        web.evaluateJavascript("(window.appBack && window.appBack()) ? 'y' : 'n'", value -> {
            if (value == null || !value.contains("y")) finish();
        });
    }

    // ---------- ابزارها ----------
    private void js(String code) {
        if (web != null) web.evaluateJavascript(code, null);
    }

    private void jsToast(String msg) {
        js("window.toast && toast(" + JSONObject.quote(msg) + ")");
    }

    /** نام فایل امن: بدون مسیر و جداکننده، با پسوند مشخص */
    static String safeName(String name, String ext) {
        String n = name == null ? "" : name;
        n = n.replaceAll("[^\\p{L}\\p{N}._-]", "_").replaceAll("\\.{2,}", ".").replaceAll("^[._]+", "");
        if (n.length() > 80) n = n.substring(0, 80);
        if (!n.toLowerCase(Locale.ROOT).endsWith(ext)) n = n + ext;
        if (n.length() <= ext.length()) n = "eshim" + ext;
        return n;
    }

    /** پوشه خروجی‌ها برای اشتراک با FileProvider (اندروید ۹ و پایین‌تر) */
    private File exportDir() {
        File base = getExternalFilesDir(null);
        File dir = new File(base != null ? base : getFilesDir(), "exports");
        if (!dir.exists() && !dir.mkdirs()) dir = new File(getFilesDir(), "exports");
        dir.mkdirs();
        return dir;
    }

    private Uri shareUri(File f) {
        return FileProvider.getUriForFile(this, getPackageName() + ".files", f);
    }

    /** ذخیره در Download با MediaStore (اندروید ۱۰+)؛ ردیف ناقص در صورت خطا حذف می‌شود */
    @TargetApi(29)
    private Uri writeToDownloads(String name, String mime, String sub, Writer writer) throws IOException {
        ContentResolver cr = getContentResolver();
        ContentValues cv = new ContentValues();
        cv.put(MediaStore.Downloads.DISPLAY_NAME, name);
        cv.put(MediaStore.Downloads.MIME_TYPE, mime);
        cv.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + sub);
        cv.put(MediaStore.Downloads.IS_PENDING, 1);
        Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
        if (uri == null) throw new IOException("insert failed");
        try (OutputStream os = cr.openOutputStream(uri)) {
            if (os == null) throw new IOException("no stream");
            writer.write(os);
        } catch (IOException | RuntimeException e) {
            cr.delete(uri, null, null);
            throw e;
        }
        ContentValues done = new ContentValues();
        done.put(MediaStore.Downloads.IS_PENDING, 0);
        cr.update(uri, done, null, null);
        return uri;
    }

    private File writeToExports(String name, Writer writer) throws IOException {
        File f = new File(exportDir(), name);
        try (OutputStream os = new FileOutputStream(f)) {
            writer.write(os);
        } catch (IOException | RuntimeException e) {
            //noinspection ResultOfMethodCallIgnored
            f.delete();
            throw e;
        }
        return f;
    }

    private interface Writer { void write(OutputStream os) throws IOException; }

    private void share(Uri uri, String mime, String title) {
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType(mime);
        i.putExtra(Intent.EXTRA_STREAM, uri);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivity(Intent.createChooser(i, title));
    }

    // ---------- ساخت PDF ----------
    private void destroyPdfView() {
        if (pdfView != null) {
            if (root != null) root.removeView(pdfView);
            pdfView.destroy();
            pdfView = null;
        }
    }

    private void finishPdf(int token, String result) {
        if (token != pdfToken) return;
        pdfBusy = false;
        destroyPdfView();
        js("window.onPdfDone && window.onPdfDone(" + JSONObject.quote(result) + ")");
    }

    private void startPdf(final String html, final String rawName, final String action) {
        if (pdfBusy) { jsToast("ساخت PDF قبلی هنوز تمام نشده است"); return; }
        if (html == null || html.length() > MAX_HTML_CHARS) { js("window.onPdfDone && window.onPdfDone('err')"); return; }
        pdfBusy = true;
        final int token = ++pdfToken;
        final String name = safeName(rawName, ".pdf");
        final float density = getResources().getDisplayMetrics().density;
        final int widthPx = Math.round(794 * density);
        destroyPdfView();
        final WebView pv = new WebView(this);
        pdfView = pv;
        WebSettings ps = pv.getSettings();
        ps.setJavaScriptEnabled(false);
        ps.setAllowFileAccess(false);
        ps.setAllowContentAccess(false);
        ps.setTextZoom(100);
        ps.setLoadWithOverviewMode(false);
        ps.setUseWideViewPort(true);
        pv.setVerticalScrollBarEnabled(false);
        pv.setHorizontalScrollBarEnabled(false);
        pv.setBackgroundColor(0xFFFFFFFF);
        // پشت صفحه اصلی و خارج از دید
        root.addView(pv, 0, new FrameLayout.LayoutParams(widthPx, Math.round(1123 * density)));
        pv.setWebViewClient(new WebViewClient() {
            boolean started = false;

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) { return true; }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (started || token != pdfToken) return;
                started = true;
                handler.postDelayed(() -> {
                    if (token != pdfToken || pdfView != pv) return;
                    int h = Math.round(pv.getContentHeight() * density);
                    if (h < 100) h = Math.round(1123 * density);
                    pv.setLayoutParams(new FrameLayout.LayoutParams(widthPx, h));
                    final int fh = h;
                    handler.postDelayed(() -> {
                        if (token == pdfToken && pdfView == pv) renderPdf(token, pv, widthPx, fh, name, action);
                    }, 450);
                }, 500);
            }
        });
        // اگر بارگذاری هرگز تمام نشد، قفل آزاد شود
        handler.postDelayed(() -> { if (token == pdfToken && pdfBusy) finishPdf(token, "err"); }, 30000);
        pv.loadDataWithBaseURL(ORIGIN + "/assets/", html, "text/html", "utf-8", null);
    }

    private void renderPdf(int token, WebView view, int widthPx, int heightPx, String name, String action) {
        String result;
        PdfDocument doc = new PdfDocument();
        try {
            final int pw = 595, ph = 842; // A4 در واحد پوینت
            float scale = pw / (float) widthPx;
            int pageHpx = Math.round(ph / scale);
            int pages = Math.max(1, (int) Math.ceil(heightPx / (double) pageHpx));
            // صفحه آخر اگر تقریباً خالی باشد حذف شود
            if (pages > 1 && heightPx - (pages - 1) * pageHpx < 12 * getResources().getDisplayMetrics().density) pages--;
            for (int i = 0; i < pages; i++) {
                PdfDocument.Page page = doc.startPage(new PdfDocument.PageInfo.Builder(pw, ph, i + 1).create());
                Canvas c = page.getCanvas();
                c.scale(scale, scale);
                c.translate(0, -i * pageHpx);
                c.clipRect(0, i * pageHpx, widthPx, (i + 1) * pageHpx);
                view.draw(c);
                doc.finishPage(page);
            }
            Uri uri;
            String where;
            if (Build.VERSION.SDK_INT >= 29) {
                uri = writeToDownloads(name, "application/pdf", "/Eshimiz", doc::writeTo);
                where = "Download/Eshimiz/" + name;
            } else {
                File f = writeToExports(name, doc::writeTo);
                uri = shareUri(f);
                where = f.getAbsolutePath();
            }
            if ("share".equals(action)) {
                share(uri, "application/pdf", "ارسال PDF");
                result = "shared";
            } else {
                result = "ok:" + where;
            }
        } catch (Exception e) {
            Log.e(TAG, "PDF failed", e);
            result = "err";
        } finally {
            doc.close();
        }
        finishPdf(token, result);
    }

    // ---------- پل جاوااسکریپت ----------
    private class Bridge {
        @JavascriptInterface
        public String appVersion() { return BuildConfig.VERSION_NAME; }

        @JavascriptInterface
        public int appVersionCode() { return BuildConfig.VERSION_CODE; }

        // ذخیره اطلاعات بزرگ در فایل (Store.java)؛ فراخوانی همزمان از جاوااسکریپت
        @JavascriptInterface
        public String storeGet(String name) { return Store.get(getApplicationContext(), name); }

        @JavascriptInterface
        public boolean storeSet(String name, String value) { return Store.set(getApplicationContext(), name, value); }

        @JavascriptInterface
        public boolean storeRemove(String name) { return Store.remove(getApplicationContext(), name); }

        @JavascriptInterface
        public String storeInfo() { return Store.info(getApplicationContext()); }

        @JavascriptInterface
        public String deviceName() { return (android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL).trim(); }

        // انتقال یک‌باره اطلاعات از مبدأ قدیمی file:// به مبدأ جدید
        @JavascriptInterface
        public void saveMigration(String json) {
            boolean ok = true;
            if (json != null && json.contains("contractor_db_v1")) {
                File f = new File(getFilesDir(), MIGRATION_FILE);
                try (OutputStream os = new FileOutputStream(f)) {
                    os.write(json.getBytes(StandardCharsets.UTF_8));
                } catch (IOException e) {
                    Log.e(TAG, "migration save failed", e);
                    ok = false;
                }
            }
            if (ok) prefs().edit().putBoolean("originMigrated", true).apply();
            runOnUiThread(() -> { if (web != null) web.loadUrl(MAIN_URL); });
        }

        @JavascriptInterface
        public String takeMigration() {
            File f = new File(getFilesDir(), MIGRATION_FILE);
            if (!f.exists()) return "";
            try (FileInputStream in = new FileInputStream(f)) {
                byte[] b = new byte[(int) f.length()];
                int off = 0, r;
                while (off < b.length && (r = in.read(b, off, b.length - off)) > 0) off += r;
                return new String(b, 0, off, StandardCharsets.UTF_8);
            } catch (IOException e) {
                Log.e(TAG, "migration read failed", e);
                return "";
            }
        }

        @JavascriptInterface
        public void migrationDone() {
            //noinspection ResultOfMethodCallIgnored
            new File(getFilesDir(), MIGRATION_FILE).delete();
        }

        @JavascriptInterface
        public void openUrl(final String url) {
            runOnUiThread(() -> {
                try {
                    Uri u = Uri.parse(url == null ? "" : url);
                    String sc = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
                    if (sc.equals("bazaar")) {
                        // صفحه برنامه در اپ بازار؛ اگر بازار نصب نبود، صفحه وب بازار
                        try { startActivity(new Intent(Intent.ACTION_VIEW, u).setPackage("com.farsitel.bazaar")); }
                        catch (Exception e) { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://cafebazaar.ir/app/" + getPackageName()))); }
                        return;
                    }
                    if (!sc.equals("https") && !sc.equals("tel") && !sc.equals("sms") && !sc.equals("smsto")) return;
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception e) {
                    jsToast("برنامه‌ای برای باز کردن پیدا نشد");
                }
            });
        }

        @JavascriptInterface
        public void sendSms(final String phone, final String text) {
            final String ph = phone == null ? "" : phone.replaceAll("[^0-9+]", "");
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + ph));
                    i.putExtra("sms_body", text);
                    startActivity(i);
                } catch (Exception e) {
                    try {
                        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("sms:" + ph));
                        i.putExtra("sms_body", text);
                        startActivity(i);
                    } catch (Exception e2) { jsToast("برنامه پیامک پیدا نشد"); }
                }
            });
        }

        @JavascriptInterface
        public void shareText(final String text) {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, text);
                try { startActivity(Intent.createChooser(i, "ارسال")); } catch (Exception ignored) { }
            });
        }

        @JavascriptInterface
        public void syncAlarms(String json) {
            Alarms.sync(getApplicationContext(), json);
        }

        @JavascriptInterface
        public String notifStatus() {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) return "off";
            if (Build.VERSION.SDK_INT >= 24) {
                NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                if (!nm.areNotificationsEnabled()) return "off";
            }
            return "ok";
        }

        @JavascriptInterface
        public void requestNotif() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 77);
                } else {
                    Intent i = new Intent();
                    if (Build.VERSION.SDK_INT >= 26) {
                        i.setAction(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                        i.putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName());
                    } else {
                        i.setAction(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                        i.setData(Uri.parse("package:" + getPackageName()));
                    }
                    try { startActivity(i); } catch (Exception ignored) { }
                }
            });
        }

        @JavascriptInterface
        public void makePdf(final String html, final String name, final String action) {
            runOnUiThread(() -> startPdf(html, name, action));
        }

        @JavascriptInterface
        public String saveFile(String rawName, String content) {
            if (content == null || content.length() > MAX_BACKUP_CHARS) return "err";
            final String name = safeName(rawName, ".json");
            final byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    writeToDownloads(name, "application/json", "", os -> os.write(bytes));
                    return "ok:Download/" + name;
                } else {
                    // اندروید ۹ و پایین‌تر: فایل ساخته و به‌صورت پیوست (نه متن) ارسال می‌شود
                    final File f = writeToExports(name, os -> os.write(bytes));
                    final Uri uri = shareUri(f);
                    runOnUiThread(() -> {
                        try { share(uri, "application/json", "ذخیره یا ارسال فایل پشتیبان"); }
                        catch (Exception e) { Log.e(TAG, "share failed", e); }
                    });
                    return "shared";
                }
            } catch (Exception e) {
                Log.e(TAG, "saveFile failed", e);
                return "err";
            }
        }
    }
}
