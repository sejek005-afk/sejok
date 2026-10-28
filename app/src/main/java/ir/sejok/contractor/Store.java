package ir.sejok.contractor;

import android.content.Context;
import android.system.Os;
import android.util.Log;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

/**
 * ذخیره اطلاعات بزرگ برنامه (اطلاعات اصلی، وضعیت همگام‌سازی، لوگو و مهر) در فایل‌های پوشه خصوصی برنامه،
 * به‌جای حافظه ۵ مگابایتی WebView. هر نوشتن اتمی است: فایل کامل در فایل موقت نوشته و روی دیسک قطعی
 * می‌شود و بعد با یک rename جای فایل اصلی را می‌گیرد؛ پس با خاموش شدن ناگهانی گوشی یا نسخه قبلی
 * سالم می‌ماند یا نسخه جدید، و هیچ لحظه‌ای فایل اصلی وجود نداشتن ندارد. نسخه قبلی هم با نام .prev
 * (hard link، بدون کپی دوباره) نگه داشته می‌شود.
 */
final class Store {
    private static final String TAG = "EshimStore";
    private static final Pattern NAME = Pattern.compile("^[A-Za-z0-9_]{1,80}$");
    /** نشانه خطای خواندن (با «وجود ندارد» فرق دارد تا برنامه اطلاعات را خالی فرض نکند) */
    static final String READ_ERROR = "\u0000ERR";

    private Store() { }

    private static File dir(Context c) {
        File d = new File(c.getFilesDir(), "store");
        if (!d.isDirectory() && !d.mkdirs()) Log.e(TAG, "mkdir failed");
        return d;
    }

    private static boolean okName(String n) { return n != null && NAME.matcher(n).matches(); }

    private static String readFile(File f) throws IOException {
        try (FileInputStream in = new FileInputStream(f)) {
            long len = f.length();
            if (len > Integer.MAX_VALUE - 16) throw new IOException("too large");
            byte[] b = new byte[(int) len];
            int off = 0, r;
            while (off < b.length && (r = in.read(b, off, b.length - off)) > 0) off += r;
            if (off != b.length) throw new IOException("short read");
            return new String(b, StandardCharsets.UTF_8);
        }
    }

    static synchronized String get(Context c, String name) {
        if (!okName(name)) return READ_ERROR;
        File d = dir(c), f = new File(d, name), prev = new File(d, name + ".prev");
        if (!f.exists()) {
            // نباید پیش بیاید (rename اتمی است)؛ اگر شد نسخه قبلی بهتر از هیچ است
            if (!prev.exists()) return null;
            f = prev;
        }
        try { return readFile(f); }
        catch (IOException e) {
            Log.e(TAG, "read failed: " + name, e);
            if (f != prev && prev.exists()) {
                try { return readFile(prev); } catch (IOException e2) { Log.e(TAG, "prev read failed", e2); }
            }
            return READ_ERROR;
        }
    }

    static synchronized boolean set(Context c, String name, String value) {
        if (!okName(name) || value == null) return false;
        File d = dir(c), f = new File(d, name), tmp = new File(d, name + ".tmp"),
                prev = new File(d, name + ".prev"), link = new File(d, name + ".lnk");
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        try (FileOutputStream os = new FileOutputStream(tmp)) {
            os.write(bytes);
            os.flush();
            os.getFD().sync();
        } catch (IOException e) {
            Log.e(TAG, "write failed: " + name, e);
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            return false;
        }
        if (tmp.length() != bytes.length) { //noinspection ResultOfMethodCallIgnored
            tmp.delete(); return false; }
        // نسخه قبلی: hard link به فایل فعلی (اگر نشد مهم نیست، فقط نسخه قبلی نداریم)
        if (f.exists()) {
            try {
                //noinspection ResultOfMethodCallIgnored
                link.delete();
                Os.link(f.getAbsolutePath(), link.getAbsolutePath());
                if (!link.renameTo(prev)) { //noinspection ResultOfMethodCallIgnored
                    link.delete(); }
            } catch (Exception e) { Log.w(TAG, "prev link failed: " + name, e); }
        }
        if (!tmp.renameTo(f)) {
            Log.e(TAG, "rename failed: " + name);
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            return false;
        }
        syncDir(d);
        return true;
    }

    static synchronized boolean remove(Context c, String name) {
        if (!okName(name)) return false;
        File d = dir(c);
        boolean ok = true;
        for (String s : new String[]{"", ".prev", ".tmp", ".lnk"}) {
            File f = new File(d, name + s);
            if (f.exists() && !f.delete()) ok = false;
        }
        return ok;
    }

    /** {"used": بایت‌های ذخیره‌شده, "free": فضای خالی گوشی} */
    static String info(Context c) {
        File d = dir(c);
        long used = 0;
        File[] list = d.listFiles();
        if (list != null) for (File f : list) used += f.length();
        return "{\"used\":" + used + ",\"free\":" + d.getUsableSpace() + "}";
    }

    private static void syncDir(File d) {
        // قطعی کردن rename روی دیسک (در صورت امکان)
        try {
            java.io.FileDescriptor fd = Os.open(d.getAbsolutePath(), android.system.OsConstants.O_RDONLY, 0);
            try { Os.fsync(fd); } finally { Os.close(fd); }
        } catch (Exception ignored) { }
    }
}
