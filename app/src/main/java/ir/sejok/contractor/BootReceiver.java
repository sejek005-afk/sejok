package ir.sejok.contractor;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** بعد از روشن شدن گوشی، به‌روزرسانی برنامه یا تغییر ساعت: یادآورهای جاافتاده اعلان و بقیه دوباره تنظیم می‌شوند */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String a = i == null ? null : i.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)
                || Intent.ACTION_TIME_CHANGED.equals(a) || Intent.ACTION_TIMEZONE_CHANGED.equals(a)) {
            Alarms.handleBoot(c);
        }
    }
}
