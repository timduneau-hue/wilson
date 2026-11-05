package fr.duneau.wilson;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

/**
 * Le pont entre la page de Wilson et le téléphone (PLAN 9) : window.WilsonAndroid dans la page.
 * Chaque méthode est appelée par app.js ; aucune ne lève d'erreur vers la page (elle renvoie un texte ou false).
 */
public class Pont {
    public static final String VERSION = "3";
    private final MainActivity a;
    private final Handler ui = new Handler(Looper.getMainLooper());

    Pont(MainActivity a) { this.a = a; }

    @JavascriptInterface
    public String version() { return VERSION; }

    /** A3 : lance le guidage (Google Maps, sinon Waze) vers cette adresse ; la voiture l'affiche par Android Auto. */
    @JavascriptInterface
    public String naviguer(String adresse, String nom) {
        final String dest = adresse == null || adresse.trim().isEmpty() ? (nom == null ? "" : nom) : adresse.trim();
        if (dest.isEmpty()) return "erreur : pas d'adresse";
        final String[] res = { "ok" };
        PackageManager pm = a.getPackageManager();
        Intent maps = new Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=" + Uri.encode(dest) + "&mode=d"));
        maps.setPackage("com.google.android.apps.maps");
        maps.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        Intent waze = new Intent(Intent.ACTION_VIEW, Uri.parse("https://waze.com/ul?q=" + Uri.encode(dest) + "&navigate=yes"));
        waze.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        final Intent choix = maps.resolveActivity(pm) != null ? maps : waze;
        res[0] = choix == maps ? "ok : Google Maps" : "ok : Waze";
        ui.post(() -> {
            try {
                a.startActivity(choix);
                a.revenirDans(1200);                  // 05/11/26, 18h11 : « le mieux serait qu'il ne s'affiche pas du tout » (2,5 s avant)
            } catch (ActivityNotFoundException e) {
                a.journal("Pas d'appli de GPS sur le téléphone");
            } catch (Exception e) {
                a.journal("GPS impossible : " + e.getMessage());
            }
        });
        return res[0] + (a.peutRevenir() ? "" : " (retour automatique impossible : autorisation « par-dessus les autres applis » manquante)");
    }

    /** Le son de Wilson dans la voiture : demandé à Android pendant une discussion (true), rendu après (false). */
    @JavascriptInterface
    public String sonVoiture(boolean actif) {
        ui.post(() -> a.focusSon(actif));
        return a.etatSon();
    }

    /** L'état du son (journal). */
    @JavascriptInterface
    public String etatSon() { return a.etatSon() + " ; " + a.micro.etat(); }

    /** Appli 3 : c'est l'appli qui écoute, avec le micro du téléphone (jamais celui de la voiture). Le son arrive dans la
     *  page par window.__wilsonMicro(base64), en blocs de 40 ms à 16 kHz. Renvoie « ok : … » ou « erreur : … ». */
    @JavascriptInterface
    public String microDemarre(boolean echo) {
        try { return a.micro.demarre(echo); } catch (Exception e) { return "erreur : " + e.getMessage(); }
    }

    @JavascriptInterface
    public void microArrete() { a.micro.arrete(); }

    /** Wilson peut-il revenir tout seul devant (autorisation « Afficher par-dessus les autres applis ») ? */
    @JavascriptInterface
    public boolean peutRevenir() { return a.peutRevenir(); }

    /** Ouvre le réglage d'Android qui permet de revenir tout seul devant. */
    @JavascriptInterface
    public void demanderRetour() {
        ui.post(() -> {
            try {
                a.startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + a.getPackageName())));
            } catch (Exception e) {
                a.journal("Réglage « par-dessus les autres applis » introuvable : " + e.getMessage());
            }
        });
    }

    /** Ramène Wilson devant. */
    @JavascriptInterface
    public void revenir() { ui.post(() -> a.revenirDans(0)); }

    /** Wilson est-il à l'écran (et pas derrière Maps) ? */
    @JavascriptInterface
    public boolean premierPlan() { return a.estDevant(); }

    /** A4 : un micro Bluetooth est relié (voiture, Android Auto), vu par Android lui-même. */
    @JavascriptInterface
    public boolean bluetoothVoiture() {
        try {
            AudioManager am = a.getSystemService(AudioManager.class);
            if (am == null) return false;
            for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_INPUTS)) {
                if (d.getType() == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) return true;
            }
        } catch (Exception ignored) { }
        return false;
    }
}
