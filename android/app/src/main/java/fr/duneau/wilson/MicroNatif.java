package fr.duneau.wilson;

import android.Manifest;
import android.content.pm.PackageManager;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.media.audiofx.AcousticEchoCanceler;
import android.media.audiofx.AutomaticGainControl;
import android.media.audiofx.NoiseSuppressor;
import android.os.Build;
import android.util.Base64;

/**
 * Le micro de Wilson dans l'appli (appli 3, PLAN 9, A12).
 *
 * Journal du 05/11/26, 18h24 (« le son ne marche toujours pas dans la voiture ») : la vue web ne voit pas le nom des
 * micros ; elle prenait celui de la voiture (Bluetooth « mains libres »), Android ouvrait alors le canal « appel » du
 * Bluetooth et la voix de Wilson ne sortait plus dans les haut-parleurs. Ici, c'est l'appli qui écoute, toujours avec le
 * micro du téléphone, sans mode « appel » : la page ne fait que jouer du son, comme une musique, et Android Auto le passe
 * dans la voiture. Le son part vers la page par blocs de 40 ms (16 kHz, 16 bits), comme le micro de la page avant.
 */
public class MicroNatif {
    static final int TAUX = 16000;
    private static final int BLOC = 640;                     // 40 ms
    private final MainActivity a;
    private AudioRecord rec;
    private Thread fil;
    private volatile boolean marche = false;
    private boolean echo = false;
    private String desc = "";
    private AcousticEchoCanceler aec;
    private NoiseSuppressor ns;
    private AutomaticGainControl agc;

    MicroNatif(MainActivity a) { this.a = a; }

    /** Démarre le micro (ou le laisse tourner s'il tourne déjà avec le même réglage). Renvoie « ok : … » ou « erreur : … ». */
    synchronized String demarre(boolean avecEcho) {
        if (marche && fil != null && fil.isAlive() && avecEcho == echo) return "ok : " + desc + " (déjà en route)";
        arrete();
        if (a.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return "erreur : le micro n'est pas autorisé pour l'appli";
        int min = AudioRecord.getMinBufferSize(TAUX, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        if (min <= 0) return "erreur : micro 16 kHz impossible sur ce téléphone";
        int taille = Math.max(min * 2, TAUX * 2 / 4);        // au moins 250 ms de réserve
        // Sans anti-écho : la source « reconnaissance vocale » (celle des assistants), jamais la source « appel ».
        int[] sources = avecEcho
                ? new int[] { MediaRecorder.AudioSource.VOICE_COMMUNICATION, MediaRecorder.AudioSource.VOICE_RECOGNITION, MediaRecorder.AudioSource.MIC }
                : new int[] { MediaRecorder.AudioSource.VOICE_RECOGNITION, MediaRecorder.AudioSource.MIC };
        int source = -1;
        for (int s : sources) {
            try {
                AudioRecord r = new AudioRecord(s, TAUX, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, taille);
                if (r.getState() == AudioRecord.STATE_INITIALIZED) { rec = r; source = s; break; }
                r.release();
            } catch (Exception ignored) { }
        }
        if (rec == null) return "erreur : micro impossible à ouvrir";
        // Toujours le micro du téléphone, même quand celui de la voiture est là.
        AudioDeviceInfo interne = micDuTelephone();
        if (interne != null) rec.setPreferredDevice(interne);
        int id = rec.getAudioSessionId();
        StringBuilder effets = new StringBuilder();
        try {
            if (avecEcho && AcousticEchoCanceler.isAvailable()) { aec = AcousticEchoCanceler.create(id); if (aec != null) { aec.setEnabled(true); effets.append(", anti-écho"); } }
            if (NoiseSuppressor.isAvailable()) { ns = NoiseSuppressor.create(id); if (ns != null) { ns.setEnabled(true); effets.append(", anti-bruit"); } }
            if (AutomaticGainControl.isAvailable()) { agc = AutomaticGainControl.create(id); if (agc != null) { agc.setEnabled(true); effets.append(", volume auto"); } }
        } catch (Exception ignored) { }
        try {
            rec.startRecording();
        } catch (Exception e) {
            arrete();
            return "erreur : micro refusé par Android (" + e.getMessage() + ")";
        }
        if (rec.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) { arrete(); return "erreur : le micro ne démarre pas (pris par une autre appli ?)"; }
        echo = avecEcho;
        String src = source == MediaRecorder.AudioSource.VOICE_COMMUNICATION ? "source communication" : source == MediaRecorder.AudioSource.VOICE_RECOGNITION ? "source reconnaissance vocale" : "source micro";
        AudioDeviceInfo route = Build.VERSION.SDK_INT >= 24 ? rec.getRoutedDevice() : null;
        desc = (route != null ? MainActivity.nomType(route) : interne != null ? "micro du téléphone" : "micro par défaut") + ", " + src + ", 16 kHz" + effets;
        marche = true;
        final AudioRecord r = rec;
        fil = new Thread(() -> boucle(r), "wilson-micro");
        fil.start();
        return "ok : " + desc;
    }

    private AudioDeviceInfo micDuTelephone() {
        AudioManager am = a.getSystemService(AudioManager.class);
        if (am == null) return null;
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_INPUTS)) {
            if (d.getType() == AudioDeviceInfo.TYPE_BUILTIN_MIC) return d;
        }
        return null;
    }

    private void boucle(AudioRecord r) {
        short[] s = new short[BLOC];
        byte[] b = new byte[BLOC * 2];
        int erreurs = 0;
        while (marche && rec == r) {
            int n;
            try { n = r.read(s, 0, BLOC); } catch (Exception e) { n = -1; }
            if (n <= 0) {
                if (++erreurs == 1 || erreurs % 50 == 0) a.journal("micro de l'appli : lecture impossible (" + n + ")");
                try { Thread.sleep(40); } catch (InterruptedException e) { break; }
                continue;
            }
            erreurs = 0;
            for (int i = 0; i < n; i++) { b[2 * i] = (byte) (s[i] & 0xff); b[2 * i + 1] = (byte) ((s[i] >> 8) & 0xff); }
            String b64 = Base64.encodeToString(b, 0, n * 2, Base64.NO_WRAP);
            a.versPage("window.__wilsonMicro&&window.__wilsonMicro('" + b64 + "')");
        }
    }

    /** Arrête le micro (fin de Wilson, ou réglage d'anti-écho changé). */
    synchronized void arrete() {
        marche = false;
        AudioRecord r = rec;
        rec = null;
        if (fil != null) { try { fil.join(300); } catch (InterruptedException ignored) { } fil = null; }
        if (r != null) {
            try { r.stop(); } catch (Exception ignored) { }
            r.release();
        }
        if (aec != null) { aec.release(); aec = null; }
        if (ns != null) { ns.release(); ns = null; }
        if (agc != null) { agc.release(); agc = null; }
    }

    /** Pour le journal. */
    synchronized String etat() {
        if (!marche || rec == null) return "micro de l'appli arrêté";
        AudioDeviceInfo route = Build.VERSION.SDK_INT >= 24 ? rec.getRoutedDevice() : null;
        return "micro de l'appli en route sur " + (route != null ? MainActivity.nomType(route) : "?") + (rec.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING ? "" : " (ARRÊTÉ par Android)");
    }
}
