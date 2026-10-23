package ir.sejok.contractor;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/** زمان‌بندی زنگ یادآورها و نمایش اعلان */
public final class Alarms {
    static final String ACTION_FIRE = "ir.sejok.contractor.ALARM";
    static final String ACTION_DISMISS = "ir.sejok.contractor.DISMISS";
    static final String CHANNEL = "rawano_alarm_v1";
    private static final String PREFS = "rawano_alarms";
    private static final long[] VIBRATE = {0, 600, 400, 600, 400, 600};

    private Alarms() {}

    static int immutable() { return Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0; }

    private static PendingIntent firePi(Context c, int id, JSONObject o, int extraFlags) {
        Intent i = new Intent(c, AlarmReceiver.class).setAction(ACTION_FIRE);
        i.putExtra("id", id);
        if (o != null) {
            i.putExtra("title", o.optString("title"));
            i.putExtra("text", o.optString("text"));
            i.putExtra("tag", o.optString("tag", "normal"));
        }
        return PendingIntent.getBroadcast(c, id, i, extraFlags | immutable());
    }

    /** لیست کامل زنگ‌ها را از برنامه می‌گیرد؛ قبلی‌ها لغو و جدیدها تنظیم می‌شوند */
    static synchronized void sync(Context c, String json) {
        SharedPreferences sp = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        try {
            JSONArray old = new JSONArray(sp.getString("list", "[]"));
            for (int k = 0; k < old.length(); k++) {
                int id = old.getJSONObject(k).getInt("id");
                PendingIntent pi = firePi(c, id, null, PendingIntent.FLAG_NO_CREATE);
                if (pi != null) { am.cancel(pi); pi.cancel(); }
            }
        } catch (Exception ignored) {}
        sp.edit().putString("list", json == null ? "[]" : json).apply();
        scheduleAll(c);
    }

    /** وقتی زنگی به صدا درآمد علامت می‌خورد تا بعد از ری‌استارت دوباره «از دست رفته» حساب نشود */
    static synchronized void markFired(Context c, int id) {
        SharedPreferences sp = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            JSONArray arr = new JSONArray(sp.getString("list", "[]"));
            for (int k = 0; k < arr.length(); k++) {
                JSONObject o = arr.getJSONObject(k);
                if (o.optInt("id") == id) o.put("f", true);
            }
            sp.edit().putString("list", arr.toString()).apply();
        } catch (Exception ignored) {}
    }

    /** بعد از روشن شدن گوشی: یادآورهایی که وقتشان در زمان خاموشی گذشته یک‌جا اعلان می‌شوند و بقیه دوباره تنظیم می‌شوند */
    static synchronized void handleBoot(Context c) {
        SharedPreferences sp = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        java.util.List<String> missed = new java.util.ArrayList<>();
        try {
            JSONArray arr = new JSONArray(sp.getString("list", "[]"));
            long now = System.currentTimeMillis();
            for (int k = 0; k < arr.length(); k++) {
                JSONObject o = arr.getJSONObject(k);
                if (o.optLong("t") <= now && !o.optBoolean("f")) {
                    missed.add(o.optString("title", "یادآور"));
                    o.put("f", true);
                }
            }
            sp.edit().putString("list", arr.toString()).apply();
        } catch (Exception ignored) {}
        if (!missed.isEmpty()) showMissed(c, missed);
        scheduleAll(c);
    }

    @SuppressWarnings("deprecation")
    private static void showMissed(Context c, java.util.List<String> titles) {
        ensureChannel(c);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        Intent open = new Intent(c, MainActivity.class).putExtra("openNotes", true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPi = PendingIntent.getActivity(c, 400000, open, PendingIntent.FLAG_UPDATE_CURRENT | immutable());
        Notification.InboxStyle style = new Notification.InboxStyle();
        for (int k = 0; k < titles.size() && k < 7; k++) style.addLine(titles.get(k));
        if (titles.size() > 7) style.setSummaryText("و " + (titles.size() - 7) + " مورد دیگر");
        String title = titles.size() + " یادآور از دست رفته (گوشی خاموش بود)";
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat_note)
                .setContentTitle(title)
                .setContentText(titles.get(0))
                .setStyle(style)
                .setAutoCancel(true)
                .setContentIntent(openPi)
                .setColor(0xFFC8452F);
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        nm.notify(999999, b.build());
    }

    static synchronized void scheduleAll(Context c) {
        SharedPreferences sp = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            JSONArray arr = new JSONArray(sp.getString("list", "[]"));
            long now = System.currentTimeMillis();
            for (int k = 0; k < arr.length(); k++) {
                JSONObject o = arr.getJSONObject(k);
                if (o.getLong("t") > now) schedule(c, o);
            }
        } catch (Exception ignored) {}
    }

    private static void schedule(Context c, JSONObject o) throws Exception {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        int id = o.getInt("id");
        long t = o.getLong("t");
        PendingIntent pi = firePi(c, id, o, PendingIntent.FLAG_UPDATE_CURRENT);
        boolean exactOk = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
        if (exactOk) {
            Intent show = new Intent(c, MainActivity.class).putExtra("openNotes", true);
            PendingIntent showPi = PendingIntent.getActivity(c, 100000 + id, show, PendingIntent.FLAG_UPDATE_CURRENT | immutable());
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(t, showPi), pi);
        } else if (Build.VERSION.SDK_INT >= 23) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t, pi);
        } else {
            am.set(AlarmManager.RTC_WAKEUP, t, pi);
        }
    }

    static Uri alarmSound() {
        Uri u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        return u;
    }

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "یادآورهای ایشیم", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("زنگ و اعلان یادداشت‌ها");
        ch.setSound(alarmSound(), new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        ch.enableVibration(true);
        ch.setVibrationPattern(VIBRATE);
        ch.enableLights(true);
        ch.setLightColor(0xFFF5B800);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        ch.setBypassDnd(true);
        nm.createNotificationChannel(ch);
    }

    @SuppressWarnings("deprecation")
    static void show(Context c, int id, String title, String text, String tag) {
        ensureChannel(c);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        String prefix = "urgent".equals(tag) ? "🔴 اضطراری: " : "important".equals(tag) ? "🟡 مهم: " : "";
        int color = "urgent".equals(tag) ? 0xFFC8452F : "important".equals(tag) ? 0xFFF5B800 : 0xFF20262D;

        Intent open = new Intent(c, MainActivity.class).putExtra("openNotes", true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPi = PendingIntent.getActivity(c, 200000 + id, open, PendingIntent.FLAG_UPDATE_CURRENT | immutable());
        Intent dis = new Intent(c, AlarmReceiver.class).setAction(ACTION_DISMISS).putExtra("id", id);
        PendingIntent disPi = PendingIntent.getBroadcast(c, 300000 + id, dis, PendingIntent.FLAG_UPDATE_CURRENT | immutable());

        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat_note)
                .setContentTitle(prefix + (title == null || title.isEmpty() ? "یادآور" : title))
                .setContentText(text == null || text.isEmpty() ? "زمان یادداشت فرا رسید" : text)
                .setStyle(new Notification.BigTextStyle().bigText(text == null || text.isEmpty() ? "زمان یادداشت فرا رسید" : text))
                .setAutoCancel(true)
                .setContentIntent(openPi)
                .setDeleteIntent(disPi)
                .setCategory(Notification.CATEGORY_ALARM)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setColor(color)
                .setShowWhen(true)
                .addAction(0, "خاموش کردن زنگ", disPi);
        if (Build.VERSION.SDK_INT < 26) {
            b.setPriority(Notification.PRIORITY_MAX)
                    .setSound(alarmSound(), AudioManager.STREAM_ALARM)
                    .setVibrate(VIBRATE)
                    .setDefaults(Notification.DEFAULT_LIGHTS);
        }
        Notification n = b.build();
        n.flags |= Notification.FLAG_INSISTENT; // تکرار صدای زنگ تا وقتی کاربر اعلان را لمس یا رد کند
        nm.notify(id, n);
    }
}
