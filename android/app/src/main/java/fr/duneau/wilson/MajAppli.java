package fr.duneau.wilson;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * L'appli se met à jour toute seule (PLAN 9, A13 ; demande de Timothée du 06/11/26, 00h11 : « si mise à jour pour l'appli
 * tel, autant que ce soit automatique le plus possible »).
 *  - au démarrage puis toutes les 6 h : dernière version publiée (Releases GitHub « android-N », N = numéro de version) ;
 *  - plus récente que celle installée → téléchargée en arrière-plan (50 ko) ;
 *  - installée seulement quand la page le demande (Wilson en veille, pas en voiture : jamais pendant une discussion ni sur
 *    la route) : Android 12 et plus l'installe sans rien demander quand il l'accepte, sinon une seule fenêtre « Mettre à jour » ;
 *  - la 1re fois, Android demande d'autoriser Wilson à installer des applis (réglage ouvert tout seul).
 * Rien ne lève d'erreur vers la page : tout est noté dans le journal de Wilson.
 */
final class MajAppli {
    static final String API = "https://api.github.com/repos/timduneau-hue/wilson/releases/latest";
    static final String STATUT = "fr.duneau.wilson.MAJ_STATUT";
    private static final long INTERVALLE = 6L * 3600 * 1000;

    private final MainActivity a;
    private volatile boolean enCours = false;
    private volatile long derniere = 0;
    private volatile File pret = null;
    private volatile int versionPrete = 0;
    private volatile boolean autorisationDemandee = false;
    volatile String etat = "pas encore vérifiée";

    MajAppli(MainActivity a) { this.a = a; }

    static int versionInstallee(Context c) {
        try {
            if (Build.VERSION.SDK_INT >= 28) return (int) c.getPackageManager().getPackageInfo(c.getPackageName(), 0).getLongVersionCode();
            return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionCode;
        } catch (Exception e) { return 0; }
    }

    boolean prete() { return pret != null && pret.exists(); }

    /** force : demandé (bouton, retour de l'autorisation) ; sinon au plus toutes les 6 h. */
    void verifier(boolean force) {
        long maintenant = System.currentTimeMillis();
        if (enCours || prete() || (!force && maintenant - derniere < INTERVALLE)) return;
        enCours = true; derniere = maintenant;
        new Thread(() -> {
            try { chercher(); }
            catch (Throwable t) { etat = "vérification impossible : " + t.getMessage(); a.journal("mise à jour de l'appli impossible à vérifier (" + t.getMessage() + ")"); }
            finally { enCours = false; }
        }, "wilson-maj").start();
    }

    private void chercher() throws Exception {
        JSONObject j = new JSONObject(lire(API));
        String tag = j.optString("tag_name", "");
        String chiffres = tag.replaceAll("\\D", "");
        int dispo = chiffres.isEmpty() ? 0 : Integer.parseInt(chiffres);
        int ici = versionInstallee(a);
        if (dispo <= ici) { etat = "à jour (appli " + ici + ")"; return; }
        String url = null;
        JSONArray assets = j.optJSONArray("assets");
        for (int i = 0; assets != null && i < assets.length(); i++) {
            JSONObject x = assets.getJSONObject(i);
            if ("wilson.apk".equals(x.optString("name"))) url = x.optString("browser_download_url");
        }
        if (url == null) { etat = "appli " + dispo + " publiée sans fichier"; return; }
        File f = new File(a.getCacheDir(), "wilson-" + dispo + ".apk");
        telecharger(url, f);
        pret = f; versionPrete = dispo;
        etat = "appli " + dispo + " téléchargée, installée dès que Wilson est en veille (pas en voiture)";
        a.journal("nouvelle version de l'appli (" + dispo + ", installée : " + ici + ") téléchargée : je l'installe dès que je suis en veille, jamais en voiture");
    }

    /** Appelé par la page (Wilson en veille, pas en voiture). Renvoie ce qui se passe, pour le journal. */
    String installer() {
        File f = pret;
        if (f == null || !f.exists()) return "rien à installer";
        if (Build.VERSION.SDK_INT >= 26 && !a.getPackageManager().canRequestPackageInstalls()) {
            if (!autorisationDemandee) {
                autorisationDemandee = true;
                a.runOnUiThread(() -> {
                    try {
                        Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + a.getPackageName()));
                        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        a.startActivity(i);
                    } catch (Exception ignored) { }
                });
                return "il faut autoriser Wilson à installer des applis (une seule fois) : réglage ouvert";
            }
            return "en attente de l'autorisation d'installer des applis";
        }
        try {
            PackageInstaller pi = a.getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams p = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            p.setAppPackageName(a.getPackageName());
            if (Build.VERSION.SDK_INT >= 31) p.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
            int id = pi.createSession(p);
            PackageInstaller.Session s = pi.openSession(id);
            try (InputStream in = new FileInputStream(f); OutputStream out = s.openWrite("wilson.apk", 0, f.length())) {
                byte[] b = new byte[65536]; int n;
                while ((n = in.read(b)) > 0) out.write(b, 0, n);
                s.fsync(out);
            }
            Intent i = new Intent(STATUT).setPackage(a.getPackageName()).putExtra("version", versionPrete);
            int drapeaux = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            PendingIntent pend = PendingIntent.getBroadcast(a, id, i, drapeaux);
            a.getSharedPreferences("wilson", Context.MODE_PRIVATE).edit().putInt("maj_avant", versionInstallee(a)).apply();
            s.commit(pend.getIntentSender());
            s.close();
            pret = null;
            etat = "appli " + versionPrete + " en cours d'installation";
            return "installation de l'appli " + versionPrete + " lancée";
        } catch (Exception e) {
            etat = "installation impossible : " + e.getMessage();
            return "installation impossible : " + e.getMessage();
        }
    }

    private static String lire(String adresse) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(adresse).openConnection();
        c.setConnectTimeout(15000); c.setReadTimeout(20000);
        c.setRequestProperty("Accept", "application/vnd.github+json");
        c.setRequestProperty("User-Agent", "Wilson-Android");
        try (InputStream in = c.getInputStream(); ByteArrayOutputStream o = new ByteArrayOutputStream()) {
            byte[] b = new byte[8192]; int n;
            while ((n = in.read(b)) > 0) o.write(b, 0, n);
            return o.toString("UTF-8");
        } finally { c.disconnect(); }
    }

    // GitHub renvoie vers un autre serveur (objects.githubusercontent.com) : on suit les redirections à la main.
    private static void telecharger(String adresse, File f) throws Exception {
        String u = adresse;
        for (int saut = 0; saut < 6; saut++) {
            HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15000); c.setReadTimeout(30000);
            c.setRequestProperty("User-Agent", "Wilson-Android");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) { u = c.getHeaderField("Location"); c.disconnect(); if (u == null) throw new Exception("redirection sans adresse"); continue; }
            if (code != 200) { c.disconnect(); throw new Exception("téléchargement refusé (" + code + ")"); }
            File tmp = new File(f.getPath() + ".part");
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(tmp)) {
                byte[] b = new byte[65536]; int n;
                while ((n = in.read(b)) > 0) out.write(b, 0, n);
            } finally { c.disconnect(); }
            if (tmp.length() < 10000) throw new Exception("fichier trop petit (" + tmp.length() + " octets)");
            if (!tmp.renameTo(f)) throw new Exception("fichier impossible à ranger");
            return;
        }
        throw new Exception("trop de redirections");
    }
}
