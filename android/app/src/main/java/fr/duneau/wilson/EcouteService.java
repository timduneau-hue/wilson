package fr.duneau.wilson;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * Service de premier plan « micro » (PLAN 9, A2) : tant qu'il tourne, Android laisse Wilson utiliser le micro et rester
 * en vie même quand une autre appli (Google Maps) est devant ou que l'écran s'éteint.
 */
public class EcouteService extends Service {
    private static final String CANAL = "wilson";
    private PowerManager.WakeLock eveil;

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null && nm.getNotificationChannel(CANAL) == null) {
            NotificationChannel c = new NotificationChannel(CANAL, "Wilson t'écoute", NotificationManager.IMPORTANCE_LOW);
            c.setDescription("Wilson reste à l'écoute même quand le GPS est devant.");
            c.setShowBadge(false);
            nm.createNotificationChannel(c);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Intent ouvrir = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, ouvrir, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(this, CANAL)
                .setContentTitle("Wilson t'écoute")
                .setContentText("Touche ici pour revenir à Wilson.")
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentIntent(pi)
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } else {
            startForeground(1, n);
        }
        if (eveil == null) {
            PowerManager pm = getSystemService(PowerManager.class);
            if (pm != null) {
                eveil = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "wilson:ecoute");
                eveil.setReferenceCounted(false);
                eveil.acquire();
            }
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (eveil != null && eveil.isHeld()) eveil.release();
        eveil = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
