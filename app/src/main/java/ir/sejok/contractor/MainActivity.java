package ir.sejok.contractor;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.app.NotificationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.graphics.Canvas;
import android.graphics.pdf.PdfDocument;
import android.os.Handler;
import android.os.Looper;
import android.os.StrictMode;
import android.view.View;
import android.view.Window;
import android.widget.FrameLayout;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final int FILE_REQ = 1001;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private FrameLayout root;
    private WebView pdfView;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean pendingOpenNotes = false;

    private void openNotes() {
        handler.postDelayed(() -> web.evaluateJavascript("window.openTab && window.openTab('notes')", null), 300);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent != null && intent.getBooleanExtra("openNotes", false)) openNotes();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.evaluateJavascript("window.render && window.render()", null);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window win = getWindow();
        if (Build.VERSION.SDK_INT >= 21) win.setStatusBarColor(0xFF0B5754);

        // برای رسم کامل صفحه فاکتور در PDF
        if (Build.VERSION.SDK_INT >= 21) WebView.enableSlowWholeDocumentDraw();
        // اجازه اشتراک فایل در اندرویدهای قدیمی
        StrictMode.setVmPolicy(new StrictMode.VmPolicy.Builder().build());

        root = new FrameLayout(this);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                if (pendingOpenNotes) { pendingOpenNotes = false; openNotes(); }
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
                    startActivityForResult(Intent.createChooser(i, "انتخاب فایل پشتیبان"), FILE_REQ);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "Android");

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
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
        web.evaluateJavascript("(window.appBack && window.appBack()) ? 'y' : 'n'", value -> {
            if (value == null || !value.contains("y")) finish();
        });
    }

    // ---------- ساخت PDF از HTML فاکتور ----------
    private void startPdf(final String html, final String name, final String action) {
        if (pdfView != null) { root.removeView(pdfView); pdfView.destroy(); pdfView = null; }
        final float density = getResources().getDisplayMetrics().density;
        final int widthPx = Math.round(794 * density);
        pdfView = new WebView(this);
        WebSettings ps = pdfView.getSettings();
        ps.setJavaScriptEnabled(false);
        ps.setAllowFileAccess(true);
        ps.setTextZoom(100);
        ps.setLoadWithOverviewMode(false);
        ps.setUseWideViewPort(true);
        pdfView.setVerticalScrollBarEnabled(false);
        pdfView.setHorizontalScrollBarEnabled(false);
        pdfView.setBackgroundColor(0xFFFFFFFF);
        // پشت صفحه اصلی و خارج از دید
        root.addView(pdfView, 0, new FrameLayout.LayoutParams(widthPx, Math.round(1123 * density)));
        pdfView.setWebViewClient(new WebViewClient() {
            boolean done = false;
            @Override
            public void onPageFinished(WebView view, String url) {
                if (done) return;
                done = true;
                handler.postDelayed(() -> {
                    int h = Math.round(view.getContentHeight() * density);
                    if (h < 100) h = Math.round(1123 * density);
                    view.setLayoutParams(new FrameLayout.LayoutParams(widthPx, h));
                    final int fh = h;
                    handler.postDelayed(() -> renderPdf(view, widthPx, fh, name, action), 450);
                }, 500);
            }
        });
        pdfView.loadDataWithBaseURL("file:///android_asset/", html, "text/html", "utf-8", null);
    }

    private void renderPdf(WebView view, int widthPx, int heightPx, String name, String action) {
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
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Downloads.DISPLAY_NAME, name);
                cv.put(MediaStore.Downloads.MIME_TYPE, "application/pdf");
                cv.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Rawano");
                uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) throw new Exception("cannot create file");
                OutputStream os = getContentResolver().openOutputStream(uri);
                doc.writeTo(os);
                os.close();
                where = "Download/Rawano/" + name;
            } else {
                File dir = getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS);
                if (dir == null) dir = getFilesDir();
                dir.mkdirs();
                File f = new File(dir, name);
                FileOutputStream os = new FileOutputStream(f);
                doc.writeTo(os);
                os.close();
                uri = Uri.fromFile(f);
                where = f.getAbsolutePath();
            }
            if ("share".equals(action)) {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("application/pdf");
                i.putExtra(Intent.EXTRA_STREAM, uri);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(Intent.createChooser(i, "ارسال فاکتور"));
                result = "shared";
            } else {
                result = "ok:" + where;
            }
        } catch (Exception e) {
            result = "err:" + e.getMessage();
        } finally {
            doc.close();
            root.removeView(view);
            view.destroy();
            if (pdfView == view) pdfView = null;
        }
        final String r = result.replace("\\", "/").replace("'", " ");
        web.evaluateJavascript("window.onPdfDone && window.onPdfDone('" + r + "')", null);
    }

    private void jsToast(String msg) {
        web.evaluateJavascript("window.toast && toast('" + msg + "')", null);
    }

    private class Bridge {
        @JavascriptInterface
        public void openUrl(final String url) {
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(i);
                } catch (Exception e) {
                    jsToast("برنامه‌ای برای باز کردن پیدا نشد");
                }
            });
        }

        @JavascriptInterface
        public void sendSms(final String phone, final String text) {
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + (phone == null ? "" : phone)));
                    i.putExtra("sms_body", text);
                    startActivity(i);
                } catch (Exception e) {
                    try {
                        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("sms:" + (phone == null ? "" : phone)));
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
                try { startActivity(Intent.createChooser(i, "ارسال")); } catch (Exception ignored) {}
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
                    try { startActivity(i); } catch (Exception ignored) {}
                }
            });
        }

        @JavascriptInterface
        public void makePdf(final String html, final String name, final String action) {
            runOnUiThread(() -> startPdf(html, name, action));
        }

        @JavascriptInterface
        public String saveFile(String name, String content) {
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    cv.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                    cv.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri == null) return "err:cannot create file";
                    OutputStream os = getContentResolver().openOutputStream(uri);
                    os.write(content.getBytes(StandardCharsets.UTF_8));
                    os.close();
                    return "ok:Download/" + name;
                } else {
                    runOnUiThread(() -> {
                        Intent i = new Intent(Intent.ACTION_SEND);
                        i.setType("text/plain");
                        i.putExtra(Intent.EXTRA_SUBJECT, name);
                        i.putExtra(Intent.EXTRA_TEXT, content);
                        startActivity(Intent.createChooser(i, "ارسال فایل پشتیبان"));
                    });
                    return "shared";
                }
            } catch (Exception e) {
                return "err:" + e.getMessage();
            }
        }
    }
}
