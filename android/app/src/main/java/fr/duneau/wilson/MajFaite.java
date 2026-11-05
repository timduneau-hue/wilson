package fr.duneau.wilson;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** L'appli vient d'être mise à jour (PLAN 9, A13) : Wilson se rouvre tout seul (autorisé grâce à « par-dessus les autres applis »). */
public class MajFaite extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        if (!Intent.ACTION_MY_PACKAGE_REPLACED.equals(i.getAction())) return;
        try {
            Intent ouvrir = new Intent(c, MainActivity.class);
            ouvrir.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(ouvrir);
        } catch (Exception ignored) { }
    }
}
