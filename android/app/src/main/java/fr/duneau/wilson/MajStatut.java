package fr.duneau.wilson;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

/** Réponse d'Android à l'installation d'une nouvelle version de l'appli (PLAN 9, A13). */
public class MajStatut extends BroadcastReceiver {
    @Override
    @SuppressWarnings("deprecation")
    public void onReceive(Context c, Intent i) {
        int st = i.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (st == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            // Android veut un accord : sa fenêtre « Mettre à jour » s'ouvre, un appui suffit.
            Intent confirmer = i.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirmer != null) {
                confirmer.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try { c.startActivity(confirmer); } catch (Exception ignored) { }
            }
            MainActivity.journalStatique("nouvelle version de l'appli : Android demande ton accord (touche « Mettre à jour »)");
        } else if (st != PackageInstaller.STATUS_SUCCESS) {
            MainActivity.journalStatique("nouvelle version de l'appli refusée par Android : " + i.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE));
        }
    }
}
