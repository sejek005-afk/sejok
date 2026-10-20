package ir.sejok.contractor;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** بعد از روشن شدن گوشی یا به‌روزرسانی برنامه، زنگ‌ها دوباره تنظیم می‌شوند */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        Alarms.scheduleAll(c);
    }
}
