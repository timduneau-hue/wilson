package fr.duneau.wilson;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.AudioPlaybackConfiguration;
import android.media.AudioRecordingConfiguration;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.View;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Wilson pour Android (PLAN.md, section 9) : la page de Wilson en plein écran, qui garde le micro même quand Google Maps
 * est devant, lance le guidage directement dans Android Auto et revient toute seule devant.
 */
public class MainActivity extends Activity {
    static final String ADRESSE = "https://timduneau-hue.github.io/wilson/";
    private static final String HOTE = "timduneau-hue.github.io";
    private static final Pattern LIEN = Pattern.compile("https://timduneau-hue\\.github\\.io/wilson/\\S*");

    private VueToujoursVisible vue;
    final MicroNatif micro = new MicroNatif(this);
    private final Handler ui = new Handler(Looper.getMainLooper());
    private boolean devant = false;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);          // A5
        vue = new VueToujoursVisible(this);
        vue.setBackgroundColor(0xFF000000);
        setContentView(vue);
        pleinEcran();

        WebSettings s = vue.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);                                  // sa voix sans toucher l'écran
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " WilsonAndroid/" + Pont.VERSION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vue.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);    // A2 : jamais mise en sommeil
        }
        vue.addJavascriptInterface(new Pont(this), "WilsonAndroid");

        vue.setWebChromeClient(new WebChromeClient() {
            // Micro et caméra : accordés à la page de Wilson seulement, une fois que le téléphone les a accordés à l'appli.
            @Override
            public void onPermissionRequest(final PermissionRequest r) {
                ui.post(() -> {
                    Uri o = r.getOrigin();
                    if (o == null || !HOTE.equals(o.getHost())) { r.deny(); return; }
                    List<String> ok = new ArrayList<>();
                    for (String res : r.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res) && aLe(Manifest.permission.RECORD_AUDIO)) ok.add(res);
                        else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res) && aLe(Manifest.permission.CAMERA)) ok.add(res);
                    }
                    if (ok.isEmpty()) r.deny(); else r.grant(ok.toArray(new String[0]));
                });
            }
        });
        vue.setWebViewClient(new WebViewClient() {
            // Les liens vers autre chose que Wilson (Maps, Waze, téléphone…) s'ouvrent dans leur appli.
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                String sch = u.getScheme() == null ? "" : u.getScheme();
                if ("https".equals(sch) && HOTE.equals(u.getHost()) && u.getPath() != null && u.getPath().startsWith("/wilson")) return false;
                try {
                    Intent i = "tel".equals(sch) ? new Intent(Intent.ACTION_DIAL, u) : new Intent(Intent.ACTION_VIEW, u);
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(i);
                } catch (Exception e) {
                    journal("Lien impossible à ouvrir : " + u);
                }
                return true;
            }
        });

        demanderPermissions();
        String lien = lienRecu(getIntent());
        vue.loadUrl(lien != null ? lien : ADRESSE);
    }

    // ---------- permissions ----------
    boolean aLe(String p) { return checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED; }

    private void demanderPermissions() {
        List<String> l = new ArrayList<>();
        if (!aLe(Manifest.permission.RECORD_AUDIO)) l.add(Manifest.permission.RECORD_AUDIO);
        if (!aLe(Manifest.permission.CAMERA)) l.add(Manifest.permission.CAMERA);
        if (Build.VERSION.SDK_INT >= 33 && !aLe("android.permission.POST_NOTIFICATIONS")) l.add("android.permission.POST_NOTIFICATIONS");
        if (!l.isEmpty()) requestPermissions(l.toArray(new String[0]), 1);
        else ui.postDelayed(this::autorisationsAndroid, 1500);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        demarrerEcoute();
        vue.reload();                                                                   // la page redemande le micro, cette fois accordé
        ui.postDelayed(this::autorisationsAndroid, 1500);
    }

    // Une seule fois : revenir tout seul devant (A3) et rester en vie malgré l'économie de batterie (A2).
    private void autorisationsAndroid() {
        SharedPreferences p = getSharedPreferences("wilson", MODE_PRIVATE);
        if (!peutRevenir() && !p.getBoolean("retour_demande", false)) {
            p.edit().putBoolean("retour_demande", true).apply();
            new AlertDialog.Builder(this)
                    .setTitle("Revenir après le GPS")
                    .setMessage("Pour que Wilson revienne tout seul à l'écran après avoir lancé le guidage, autorise-le à « s'afficher par-dessus les autres applis » (écran suivant : active Wilson).")
                    .setPositiveButton("Autoriser", (d, w) -> {
                        try { startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()))); } catch (Exception ignored) { }
                    })
                    .setNegativeButton("Plus tard", null)
                    .show();
            return;
        }
        PowerManager pm = getSystemService(PowerManager.class);
        if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName()) && !p.getBoolean("batterie_demandee", false)) {
            p.edit().putBoolean("batterie_demandee", true).apply();
            try {
                startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName())));
            } catch (Exception ignored) { }
        }
    }

    boolean peutRevenir() { return Settings.canDrawOverlays(this); }

    // ---------- service d'écoute (A2) ----------
    private void demarrerEcoute() {
        if (!aLe(Manifest.permission.RECORD_AUDIO)) return;
        try { startForegroundService(new Intent(this, EcouteService.class)); }
        catch (Exception e) { journal("Service d'écoute impossible : " + e.getMessage()); }
    }

    // ---------- revenir devant (A3) ----------
    void revenirDans(long ms) {
        ui.postDelayed(() -> {
            try {
                Intent i = new Intent(this, MainActivity.class);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(i);
            } catch (Exception e) {
                journal("Retour devant impossible : " + e.getMessage());
            }
        }, ms);
    }

    boolean estDevant() { return devant; }

    // ---------- le son dans la voiture (appli 2) ----------
    // Journal du 05/11/26, 18h09 (« il y a encore un problème du son ») : dans Chrome, c'est Chrome qui demandait à Android
    // le son pour sa page, et Android Auto passait alors la voix de Wilson dans les haut-parleurs. La vue web de l'appli ne le
    // demande pas : l'appli le demande elle-même pendant chaque discussion, et le rend après.
    private AudioFocusRequest focus;

    void focusSon(boolean actif) {
        AudioManager am = getSystemService(AudioManager.class);
        if (am == null) return;
        if (actif) {
            couperCanalAppel();                                                         // appli 3 : avant que Wilson parle
            ui.removeCallbacks(gardeSon); ui.postDelayed(gardeSon, 2000);
            if (focus != null) return;
            focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build())
                    .setOnAudioFocusChangeListener(c -> { })
                    .build();
            int r = am.requestAudioFocus(focus);
            journal("son de la voiture demandé à Android : " + (r == AudioManager.AUDIOFOCUS_REQUEST_GRANTED ? "accordé" : r == AudioManager.AUDIOFOCUS_REQUEST_DELAYED ? "différé" : "REFUSÉ") + " — " + etatSon());
        } else {
            ui.removeCallbacks(gardeSon);
            if (focus != null) { am.abandonAudioFocusRequest(focus); focus = null; }
            if (Build.VERSION.SDK_INT >= 31 && canalForce) { am.clearCommunicationDevice(); canalForce = false; }
            canalDit = false;
        }
    }

    // Journal du 05/11/26, 18h24 (appli 2 : « le son ne marche toujours pas dans la voiture ») : Android accordait le son,
    // mais « communication sur Bluetooth » et micro sans nom. La vue web ne voit pas les noms des micros (Chrome, si) et
    // prenait celui de la voiture : Android ouvre alors le canal « appel » du Bluetooth, la musique (A2DP) est suspendue et
    // la voix de Wilson ne sort plus dans les haut-parleurs (même panne que dans Chrome le 02/11/26). Depuis l'appli 3, c'est
    // l'appli qui écoute, avec le micro du téléphone (MicroNatif) : la vue web n'ouvre plus de micro, donc plus de canal
    // « appel ». Garde-fou pendant chaque discussion (toutes les 2 s) : si ce canal est quand même ouvert, il est refermé.
    // Jamais pendant un vrai appel.
    private boolean canalForce = false, canalDit = false;
    private final Runnable gardeSon = new Runnable() {
        @Override public void run() {
            if (focus == null) return;
            couperCanalAppel();
            ui.postDelayed(this, 2000);
        }
    };

    void couperCanalAppel() {
        AudioManager am = getSystemService(AudioManager.class);
        if (am == null || am.getMode() == AudioManager.MODE_IN_CALL || am.getMode() == AudioManager.MODE_RINGTONE) return;   // vrai appel : on ne touche à rien
        List<String> fait = new ArrayList<>();
        try {
            if (Build.VERSION.SDK_INT >= 31 && enregistreSurBluetooth(am)) {
                for (AudioDeviceInfo d : am.getAvailableCommunicationDevices()) {
                    if (d.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) { if (am.setCommunicationDevice(d)) { canalForce = true; fait.add("micro de la voiture lâché"); } break; }
                }
            }
            if (am.isBluetoothScoOn()) { am.stopBluetoothSco(); am.setBluetoothScoOn(false); fait.add("canal appel refermé"); }
            if (am.getMode() == AudioManager.MODE_IN_COMMUNICATION) { am.setMode(AudioManager.MODE_NORMAL); fait.add("mode appel quitté"); }
        } catch (Exception e) {
            if (!canalDit) { canalDit = true; journal("canal « appel » impossible à refermer : " + e.getMessage()); }
        }
        if (!fait.isEmpty() && !canalDit) { canalDit = true; journal("son de la voiture : " + String.join(", ", fait) + " — " + etatSon()); }
    }

    // Un micro de cette appli est-il ouvert sur le Bluetooth de la voiture (canal « appel ») ?
    private static boolean enregistreSurBluetooth(AudioManager am) {
        if (Build.VERSION.SDK_INT < 29) return false;
        for (AudioRecordingConfiguration r : am.getActiveRecordingConfigurations()) {
            AudioDeviceInfo d = r.getAudioDevice();
            if (d != null && d.getType() == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) return true;
        }
        return false;
    }

    static String nomType(AudioDeviceInfo d) {
        if (d == null) return "?";
        int t = d.getType();
        return t == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ? "Bluetooth musique" : t == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ? "Bluetooth appel"
                : t == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER ? "haut-parleur" : t == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE ? "écouteur"
                : t == AudioDeviceInfo.TYPE_BUILTIN_MIC ? "micro du téléphone" : t == AudioDeviceInfo.TYPE_USB_DEVICE || t == AudioDeviceInfo.TYPE_USB_ACCESSORY ? "USB"
                : "type " + t;
    }

    // L'état du son, pour le journal : mode, sorties, appareil de communication.
    String etatSon() {
        AudioManager am = getSystemService(AudioManager.class);
        if (am == null) return "?";
        StringBuilder b = new StringBuilder();
        int m = am.getMode();
        b.append("mode ").append(m == AudioManager.MODE_NORMAL ? "normal" : m == AudioManager.MODE_IN_COMMUNICATION ? "communication" : m == AudioManager.MODE_IN_CALL ? "appel" : String.valueOf(m));
        b.append(", sorties :");
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            int t = d.getType();
            String n = t == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ? "Bluetooth musique" : t == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ? "Bluetooth appel"
                    : t == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER ? "haut-parleur" : t == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE ? "écouteur"
                    : t == AudioDeviceInfo.TYPE_USB_DEVICE || t == AudioDeviceInfo.TYPE_USB_ACCESSORY ? "USB" : null;
            if (n != null) b.append(' ').append(n).append(';');
        }
        if (Build.VERSION.SDK_INT >= 31) {
            AudioDeviceInfo c = am.getCommunicationDevice();
            if (c != null) b.append(" communication sur ").append(nomType(c));
        }
        b.append(am.isBluetoothScoOn() ? ", canal appel Bluetooth OUVERT" : ", canal appel fermé");
        try {
            for (AudioRecordingConfiguration r : am.getActiveRecordingConfigurations()) {
                int src = r.getClientAudioSource();
                b.append(", micro ").append(src == MediaRecorder.AudioSource.VOICE_COMMUNICATION ? "(communication)" : src == MediaRecorder.AudioSource.VOICE_RECOGNITION ? "(reconnaissance)" : src == MediaRecorder.AudioSource.MIC ? "(micro)" : "(source " + src + ")");
                if (Build.VERSION.SDK_INT >= 29) b.append(" sur ").append(nomType(r.getAudioDevice()));
            }
            for (AudioPlaybackConfiguration p : am.getActivePlaybackConfigurations()) {
                int u = p.getAudioAttributes().getUsage();
                b.append(", lecture ").append(u == AudioAttributes.USAGE_MEDIA ? "musique" : u == AudioAttributes.USAGE_VOICE_COMMUNICATION ? "APPEL" : u == AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE ? "GPS" : "usage " + u);
            }
        } catch (Exception ignored) { }
        b.append(am.isMusicActive() ? ", son en cours" : ", silence");
        return b.toString();
    }

    // Le son du micro vers la page (MicroNatif, 25 fois par seconde).
    void versPage(String js) {
        ui.post(() -> { if (vue != null) vue.evaluateJavascript(js, null); });
    }

    // Une ligne dans le journal de Wilson (la page l'envoie avec les autres).
    void journal(String m) {
        ui.post(() -> {
            if (vue == null) return;
            String js = "window.wilson && wilson.log && wilson.log(" + org.json.JSONObject.quote("Appli : " + m) + ")";
            vue.evaluateJavascript(js, null);
        });
    }

    // ---------- réglages partagés depuis Chrome (A7) ----------
    private String lienRecu(Intent i) {
        if (i == null) return null;
        String t = null;
        if (Intent.ACTION_SEND.equals(i.getAction())) t = i.getStringExtra(Intent.EXTRA_TEXT);
        else if (Intent.ACTION_VIEW.equals(i.getAction()) && i.getData() != null) t = i.getData().toString();
        if (t == null) return null;
        Matcher m = LIEN.matcher(t);
        return m.find() ? m.group() : null;
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        String lien = lienRecu(i);
        if (lien != null) vue.loadUrl(lien);
    }

    // ---------- cycle de vie : la page n'est jamais mise en pause (A2) ----------
    @Override
    protected void onResume() {
        super.onResume();
        devant = true;
        pleinEcran();
        demarrerEcoute();
    }

    @Override
    protected void onPause() {
        devant = false;
        super.onPause();                                                                // (pas de vue.onPause() : Wilson continue)
    }

    @Override
    public void onWindowFocusChanged(boolean f) {
        super.onWindowFocusChanged(f);
        if (f) pleinEcran();
    }

    @Override
    public void onBackPressed() {
        if (vue != null && vue.canGoBack()) vue.goBack();
        else moveTaskToBack(true);                                                      // Wilson reste ouvert derrière
    }

    @Override
    protected void onDestroy() {
        micro.arrete();
        stopService(new Intent(this, EcouteService.class));
        if (vue != null) { vue.destroy(); vue = null; }
        super.onDestroy();
    }

    @SuppressWarnings("deprecation")
    private void pleinEcran() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }
}
