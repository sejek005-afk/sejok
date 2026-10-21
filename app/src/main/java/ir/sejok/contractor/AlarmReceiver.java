package ir.sejok.contractor;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String a = i.getAction();
        int id = i.getIntExtra("id", 0);
        if (Alarms.ACTION_FIRE.equals(a)) {
            Alarms.markFired(c, id);
            Alarms.show(c, id, i.getStringExtra("title"), i.getStringExtra("text"), i.getStringExtra("tag"));
        } else if (Alarms.ACTION_DISMISS.equals(a)) {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            nm.cancel(id);
        }
    }
}
