// Wilson — chef d'orchestre. Une seule machine à états (voir PLAN.md) pilote tous les modules.
//   dodo ⇄ veille → (on le regarde en lui parlant) → conversation → veille
// Écoute au REGARD : une phrase n'est pour Wilson que si on le regarde en la disant (plus de mot-clé).

import { Face } from './face.js';
import { AudioIO } from './audio.js';
import { Brain } from './brain.js';
import { Vision } from './vision.js';
import { Memory } from './memory.js';
import { Sensors } from './sensors.js';
import { loadSettings, saveSettings, SettingsUI, DEFAULTS } from './settings.js';
import { SettingsSync, LOCAL_ONLY, takeSettingsFromHash, mergeInto, shareable } from './sync.js';
import { Voice } from './voice.js';
import { EcoBrain, ecoFormat, sentenceCut, sayable, warmUp } from './eco.js';
import { RemoteLog, deviceName } from './remote.js';
import { Oreille, nomDit } from './oreille.js';
import { Crm, CRM_TOOLS, CRM_TOOL_NAMES, pourGemini } from './crm.js';
import { Maison, MAISON_TOOL } from './maison.js';
import { ANALYSE_MAX_MS } from './analyste.js';

const VERSION = '1.16.2';
const PREROLL_MS = 1200;          // R2 : le début de la phrase (avant que le regard soit confirmé) est transmis
const TAIL_MS = 300;              // ne pas renvoyer la fin de sa propre voix
const TAIL_NOAEC_MS = 700;        // idem sans annulation d'écho (coupure « prudente ») : l'écho de la pièce et du haut-parleur dure plus
const TURN_GATE_MS = 5000;        // micro coupé pendant tout le tour de parole de Wilson (trous de réseau compris), 5 s max sans son
const LOOK_GRACE_MS = 3000;       // R3 : on peut détourner les yeux 3 s ; au-delà, il se met en veille (règle de Timothée, 24/10/26)
const LOOKED_IDLE_MS = 60000;     // tant qu'on le regarde, il reste à l'écoute, 60 s de silence au plus
const SEARCH_MAX_MS = 30000;      // outil « chercher » : Wilson a dit qu'il cherchait, il répond quand il a l'info (filet : 30 s)
const CRM_MAX_MS = 40000;         // question au CRM (script → CRM) : filet de sécurité
const CAR_IDLE_MS = 60000;        // mode voiture : il se rendort après 1 min de silence (PLAN 2 quater, C5)
const NAME_GATE_MS = 7000;        // mode voiture : la 1re phrase doit contenir « Wilson » (vérifié sur la transcription, C6)
const ECO_SILENCE_MS = 500;       // mode économique : silence qui marque la fin d'une phrase
const ECO_SPEC_MS = 250;          // envoi anticipé : la phrase part dès ce silence, Wilson ne parle qu'à la fin confirmée (PLAN 6 bis)
const ECO_TAIL_MS = 1000;         // après avoir parlé : le son de la tablette finit de sortir après l'annonce « fini »
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d = new Date()) => `${JOURS[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}, ${d.getHours()}h${pad(d.getMinutes())}`;
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class App {
  constructor() {
    this.version = VERSION; this.logs = []; this.bootAt = Date.now();
    const imported = takeSettingsFromHash();     // « …#reglages=… » : réglages copiés depuis un autre appareil (PLAN 2 ter)
    this.settings = loadSettings();
    if (imported) {   // réglages absents du lien = valeur d'origine
      mergeInto(this.settings, { ...shareable(DEFAULTS), ...imported }); this.settings._t = imported._t || Date.now(); saveSettings(this.settings); this._imported = true;
    }
    this.remote = new RemoteLog(this);           // journal à distance (feuille Google lue par Claude)
    this.crm = new Crm(this);                    // CRM à la voix (PLAN 2 quater)
    this.maison = new Maison({ settings: this.settings, log: (m, imp) => this.log(m, imp) });   // la maison (PLAN 7 bis)
    this._heard = []; this._turnN = 0;           // ce que Timothée a dit, horodaté (verrou des écritures dans le CRM)
    this.car = null;                             // mode voiture (PLAN 2 quater, C5)
    this.oreille = new Oreille();                // reconnaît « Wilson » en voiture (empreintes de la voix de Timothée)
    this.oreille.sens = this.settings.oreilleSens || 'normal';
    this.oreille.onDetect = (d) => this._onName(d);
    this.oreille.onPresque = (d) => this._secondAvis(d);
    this.oreille.onSegment = (r) => this._oreilleLog(r);
    this.sync = new SettingsSync(this);          // mêmes réglages sur tous les appareils
    this._catchErrors();
    this.face = new Face($('face'), { style: this.settings.face });
    this.face.setMood('somnolent'); this.face.setBrightness(0.35);
    this.audio = new AudioIO(); this.brain = new Brain();
    this.memory = new Memory(); this.vision = null; this.sensors = new Sensors($('face'));
    this.voice = new Voice(); this.eco = new EcoBrain(); this.mode = null; this.ecoState = null;
    this.ui = new SettingsUI(this);
    this.state = 'demarrage'; this.started = false; this.continuous = false;
    this.pending = []; this.outBuf = []; this.outLen = 0;
    this.lastActivity = 0; this.lastUserSpeech = 0; this.lastFrame = 0; this.playEndAt = 0;
    this.discard = false; this.endAfterSpeech = false; this.barge = { n: 0, echo: -60 };
    this.presenceAt = performance.now(); this.battery = null; this.settingsOpen = false;
    this._wireSensors(); this._wireBrain(); this._wireAudio();
    if ('serviceWorker' in navigator) {
      const hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => { this.swReg = r; }).catch((e) => this.log('SW : ' + e.message));
      // Nouvelle version installée : on recharge (seulement si une ancienne version tournait, et jamais en pleine conversation).
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) this._reloadWhenIdle('nouvelle version installée'); });
    }
    setTimeout(() => this._checkUpdate(), 15000);
    setInterval(() => this._checkUpdate(), 20 * 60000);
    setInterval(() => this._tick(), 50);
    // Surveillance de la charge : si la tablette prend du retard, on allège l'animation (jamais de file d'attente qui s'allonge).
    let lastBeat = performance.now(); this.lag = 0; this._t0 = lastBeat;   // on ignore le démarrage (chargement des modèles)
    let lastDrawn = 0, slow = 0;
    setInterval(() => {
      const t = performance.now(), late = t - lastBeat - 1000; lastBeat = t;
      // Appli en arrière-plan ou écran éteint : le navigateur met les minuteries en pause. Ce n'est pas de la lenteur.
      if (document.hidden || t - (this._shownAt || 0) < 3000 || late > 10000) {
        if (late > 400) this.log(`Appli en arrière-plan ou écran éteint pendant ${Math.round(late / 1000)} s`);
        return;
      }
      this.lag = this.lag * 0.8 + Math.max(0, late) * 0.2;
      if (late > 400) this.log(`Tablette en retard de ${Math.round(late)} ms`);
      if (t - this._t0 > 30000 && this.lag > 150 && !this._light) { this._light = true; this.face.maxFpsLight = true; this.log('Mode allégé : animation à 30 images/s'); }
      // Images du visage réellement dessinées : si l'écran n'arrive pas à suivre, on dessine moins de pixels, puis moins d'images.
      const f = this.face, drawn = (f.drawn || 0) - lastDrawn; lastDrawn = f.drawn || 0;
      const want = 60 / (f.div || 1);
      this.drawFps = drawn;
      slow = !document.hidden && t - this._t0 > 20000 && drawn < want * 0.6 ? slow + 1 : 0;
      if (slow >= 5) {
        slow = 0;
        if (f.maxDpr > 1) { f.setMaxDpr(1); this.log(`Visage saccadé (${drawn} images/s) : dessin allégé (moins de pixels)`); }
        else if (!this._light) { this._light = true; f.maxFpsLight = true; this.log(`Visage saccadé (${drawn} images/s) : animation à 30 images/s`); }
      }
    }, 1000);
  }

  get speaking() { return this.audio.playing || this.voice.speaking; }

  // priv : la ligne contient ce que dit la famille (le journal à distance peut la masquer, voir réglages).
  log(m, priv = false) {
    const d = new Date(); this.logs.push(`${pad(d.getHours())}h${pad(d.getMinutes())}:${pad(d.getSeconds())}  ${m}`); if (this.logs.length > 200) this.logs.shift();
    console.log('[Wilson]', m); if (this.settingsOpen && this.ui) this.ui.renderLog();
    if (this.remote) this.remote.line(m, priv);
  }

  // Erreurs JavaScript : notées dans le journal (et donc visibles à distance).
  _catchErrors() {
    let n = 0;
    const note = (msg) => { if (n++ < 50) this.log('Erreur : ' + String(msg).slice(0, 400)); };
    window.addEventListener('error', (e) => note(`${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`));
    window.addEventListener('unhandledrejection', (e) => note('promesse : ' + ((e.reason && (e.reason.stack || e.reason.message)) || e.reason)));
    // La page se ferme ou passe en arrière-plan : ce qui attend part tout de suite.
    const bye = () => { if (Date.now() - (this._byeAt || 0) < 2000) return; this._byeAt = Date.now(); this.remote.flush({ beacon: true }); };
    window.addEventListener('pagehide', bye);
    document.addEventListener('visibilitychange', () => { if (document.hidden) bye(); });
  }

  // Bilan de la tablette pour l'onglet « État » du journal à distance.
  bilan() {
    const v = this.vision, b = this.battery, s = this.settings, e = this.eco, now = Date.now();
    const d = (t) => { const x = new Date(t); return `${pad(x.getDate())}/${pad(x.getMonth() + 1)}/${String(x.getFullYear()).slice(2)} ${pad(x.getHours())}h${pad(x.getMinutes())}`; };
    return {
      'Version': VERSION, 'Démarré le': d(this.bootAt), 'État': this.state, 'Cerveau en cours': this.mode || '—', 'Réglage cerveau': s.brainMode,
      'Écoute': `${s.listenMode}${this._gazeMode ? ' (regard actif : veille après 3 s sans regard)' : ''}${this.paused ? ', EN VEILLE (plus regardé)' : ''}`, 'Coupure': s.bargeIn, 'Fin de conversation': `${s.convTimeout} s`,
      'Vision': v ? `${v.mode}, regard ${v.gazeReady ? 'prêt' : v.modelsDone ? 'indisponible' : 'en chargement'} (${v.delegate === 'GPU' ? 'carte graphique' : 'processeur'}), analyse ${Math.round(v.stats.ms || 0)} ms (visages ${Math.round(v.stats.fd || 0)}, regard ${Math.round(v.stats.lm || 0)}), ${v.faces || 0} visage(s), on le regarde : ${v.looking ? 'oui' : 'non'}${v.errors.length ? ' — ' + v.errors.join(' · ') : ''}${v.restarts ? `, relancée ${v.restarts} fois` : ''}${v.fixes.length ? `, ${v.fixes.length} réparation(s)` : ''}` : 'caméra coupée',
      'Visage': `${this.drawFps || 0} images/s${this._light ? ', mode allégé' : ''}${this.face.maxDpr ? ', finesse ' + this.face.maxDpr : ''}`,
      'Retard de la tablette': `${Math.round(this.lag || 0)} ms`,
      'Son': this.audio.describe(),
      'Réponses du direct': this.brain.proactive === false ? 'répond à tout ce qu\'il entend (proactivité coupée)' : 'Gemini choisit à quoi répondre (réglage refusé par le modèle)',
      'Photos': `seulement à la demande — ${this._photos || 0} prise(s) depuis le démarrage`,
      'Batterie': b ? `${Math.round(b.level * 100)} %${b.charging ? ', branchée' : ', NON branchée'}` : '—',
      'Réseau': `${navigator.onLine ? 'en ligne' : 'hors ligne'}${this.netWait ? `, COUPURE en cours depuis ${Math.round((now - this.netWait.since) / 1000)} s (${this.netWait.why})` : ''}${this.phone ? ', appel téléphonique en cours' : ''}`,
      'Recherche Internet': this.remote.on ? `Tavily par le script${this._searchState ? ' — dernière : ' + this._searchState : ''}` : 'Gemini seulement (pas de script)',
      'Mode économique': `${e.modelUsed || '—'}, réflexion ${e.thinking ?? 'par défaut'}${e.noSchema ? ', sans schéma' : ''}${e.noSearch ? ', sans recherche' : ''}, ${e.recent()} requête(s) dans la dernière minute`,
      'Quota direct': this.quotaUntil && now < this.quotaUntil ? `en pause : ${this.quotaMsg || ''}` : 'pas de pause',
      'Quota économique': this.ecoQuotaUntil && now < this.ecoQuotaUntil ? `en pause : ${this.ecoQuotaMsg || ''}` : 'pas de pause',
      'Voix de la tablette': `${s.ecoVoice || 'automatique'} (${this.voice.voices().length} voix françaises)`,
      'Souvenirs': `${this.memory.facts.length}`,
      'CRM': this.crm.on ? `relié — ${this.crm.state || 'pas encore interrogé'}${this.crm.cache.size ? `, ${this.crm.cache.size} fiche(s) gardée(s)` : ''}${this.crm.pending ? ', une écriture attend sa confirmation' : ''}${this.crm.queue.length ? `, ${this.crm.queue.length} écriture(s) confirmée(s) en attente du réseau` : ''}` : (this.settings.crm ? 'activé, mais pas de script sur cet appareil' : 'non relié'),
      'Mode voiture': `${this.car ? `oui (${this.car.why})` : 'non'}${this.settings.voitureAuto && deviceName() === 'téléphone' ? `, automatique en roulant${this._geoErr ? ' (GPS : ' + this._geoErr + ')' : this.speed != null ? `, vitesse ${Math.round(this.speed * 3.6)} km/h` : ''}` : ''}`,
      'Oreille (voiture)': this.oreille.ready ? `apprise, ${this.oreille.templates.length} empreintes, limite ${this.oreille.limite.toFixed(1)} (${this.oreille.sens})${this.oreille.last.length ? ' — dernières phrases : ' + this.oreille.last.slice(-8).map((x) => x.s + (x.oui ? '✓' : '')).join(' ') : ''}` : 'pas apprise',
      'Réglages communs': this.remote.on ? (this.sync.state || 'pas encore vérifiés') : 'pas de script : réglages propres à cet appareil',
      'Phrases échangées dans le journal': s.logContent === false ? 'masquées' : 'envoyées',
      'Écran': `${screen.width}×${screen.height}, densité ${devicePixelRatio}`,
      'Navigateur': navigator.userAgent,
    };
  }
  badge(text, ms = 5000, important = false) {
    const b = $('badge'), now = performance.now();
    if (!important && this._badgeImportantUntil > now) return;          // un message d'erreur reste lisible
    this._badgeImportantUntil = important ? now + ms : 0;
    b.textContent = text; b.hidden = false; clearTimeout(this._bt); this._bt = setTimeout(() => (b.hidden = true), ms);
  }

  // ---------- démarrage ----------
  boot() {
    if (!this.settings.apiKey) { this.ui.showWelcome(); return; }
    this.start(false);
  }

  async start(fromGesture) {
    if (this.started) { await this.audio.resume(); this._hideWake(); return; }
    this.started = true;
    try {
      await this.audio.start({ aec: this.settings.bargeIn === 'directe' });
      this.log(`Micro prêt — son : ${this.audio.describe()}`);
    } catch (e) {
      this.started = false; this.log('Micro refusé : ' + e.message);
      this.face.setEmotion('triste', 6000); this.badge("J'ai besoin du micro pour t'entendre", 8000); this._showWake(); return;
    }
    if (this.settings.camera) await this._startVision();
    this.sensors.startMotion(); this.sensors.startBattery();
    this._watchSpeed();
    this._wakeLock(); document.addEventListener('visibilitychange', () => { if (!document.hidden) { this._shownAt = performance.now(); this._wakeLock(); this.audio.resume(); this._backFromCall(); } });
    if (fromGesture && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => this._freeRotation()).catch(() => {});
    this._freeRotation();
    if (!this.audio.running) this._showWake(); else this._hideWake();
    this.voice.warm();
    this._loadQuota();
    this.log(`Wilson ${VERSION} démarré${this.remote.on ? ' (journal à distance actif)' : ''}`);
    setTimeout(() => this.remote.flush(), 20000);   // 1er bilan une fois la vision chargée
    if (this._imported) { this.log('Réglages copiés depuis un autre appareil'); this.badge('Réglages copiés depuis ton autre appareil ✓', 6000); }
    setTimeout(() => this.sync.pull(), 3000);       // réglages communs : le plus récent gagne
    this.setState('veille');
    this.applySettings();
  }

  async _startVision() {
    try {
      this.vision = new Vision(); this.vision.mirror = !this.settings.mirror; this.vision.calib = { yaw: 0, pitch: 0, down: 0, ...(this.settings.gazeCalib || {}) };
      this.vision.onPresence = (p) => this._presence(p);
      this.vision.onInfo = (m) => this.log(m);
      await this.vision.start(); this.log('Caméra prête');
    } catch (e) { this.vision = null; this.log('Caméra indisponible : ' + e.message); }
  }

  // Mise à jour automatique : la tablette reste allumée en permanence, Wilson se met donc à jour tout seul.
  async _checkUpdate() {
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const { version } = await r.json();
      if (!version || version === VERSION) return;
      const [v0, t0] = (sessionStorage.getItem('wilson.reloadedFor') || '|0').split('|');
      if (v0 === version && Date.now() - +t0 < 30 * 60000) return;              // déjà tenté il y a peu : on attendra
      this.log(`Nouvelle version disponible : ${version}`);
      if (this.swReg) { try { await this.swReg.update(); } catch (_) {} }
      this._reloadWhenIdle(version);
    } catch (_) {}
  }
  _reloadWhenIdle(why) {
    const go = () => {
      if (this.state === 'eveil' || this.state === 'conversation' || this.settingsOpen || this.phone || this.netWait) return setTimeout(go, 15000);
      try { sessionStorage.setItem('wilson.reloadedFor', `${why}|${Date.now()}`); } catch (_) {}
      this.log('Mise à jour : rechargement'); this.remote.flush({ beacon: true }); location.reload();
    };
    go();
  }

  // Portrait et paysage : l'appli installée était verrouillée en paysage ; on laisse l'appareil tourner.
  _freeRotation() {
    try { if (screen.orientation && screen.orientation.lock && (document.fullscreenElement || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches)) screen.orientation.lock('any').catch(() => {}); } catch (_) {}
  }

  _showWake() { $('wake').hidden = false; }
  _hideWake() { $('wake').hidden = true; }
  async _wakeLock() { try { if ('wakeLock' in navigator) { this._wl = await navigator.wakeLock.request('screen'); } } catch (_) {} }

  saveSettingsQuiet() { saveSettings(this.settings); }

  applySettings(key, { fromSync = false } = {}) {
    const s = this.settings;
    if (key && !fromSync) {
      if (key === 'logUrl') { if (this.remote.on) this.sync.pull({ adopt: true }); }        // appareil qui rejoint : il prend les réglages communs
      else if (!LOCAL_ONLY.includes(key)) { s._t = Date.now(); saveSettings(s); this.sync.schedulePush(); }
    }
    if (s.face !== this.face.styleName) this.face.setStyle(s.face);
    this.eco.setSpeed(s.ecoSpeed);
    if (key === 'apiKey' || key === 'model') {          // nouvelle clé : nouveau quota, on repart de zéro
      this.quotaUntil = 0; this.ecoQuotaUntil = 0; this.brain.authMode = this.brain.modelUsed = this.brain.level = null; this.brain.refused = {}; this.brain.think = false; this.brain.proactive = false; this.brain._save(); this.eco.modelUsed = null; this.log('Clé ou modèle changé');
    }
    if (this.vision) this.vision.mirror = !s.mirror;
    if (key === 'bargeIn' && this.started) {
      this.audio.setEchoCancel(s.bargeIn === 'directe').then((ch) => ch && this.log(`Micro rouvert — son : ${this.audio.describe()}`))
        .catch((e) => this.log('Micro : ' + e.message));
    }
    if (key === 'logUrl' && this.remote.on) { this.log('Journal à distance activé'); this.remote.flush(); }
    if (key === 'camera' && !this.car) { if (s.camera && !this.vision && this.started) this._startVision(); if (!s.camera && this.vision) { this.vision.stop(); this.vision = null; } }
    if (key === 'voitureAuto' && this.started) this._watchSpeed();
    this.oreille.sens = s.oreilleSens || 'normal';
    if (key === 'crm') { this.log(s.crm ? 'CRM relié à Wilson' : 'CRM détaché de Wilson'); if (s.crm) this.crm.status(true); }
    $('subtitle').hidden = !(s.subtitles || this.car);
    this.continuous = false;
  }

  // ---------- états ----------
  setState(st) {
    if (this.state === st) return;
    this.log(`État : ${this.state} → ${st}`); this.state = st;
    const f = this.face;
    switch (st) {
      case 'dodo':
        f.clearEmotion(); f.play('yawn'); setTimeout(() => this.state === 'dodo' && f.setMood('dort'), 1800);
        f.setBrightness(0.1); f.setFps(24); f.setListen(-1); this.vision && this.vision.setRate(3);
        this._lookShown = null; break;
      case 'veille':
        f.setMood(this.vision && this.vision.hasPerson ? 'neutre' : 'somnolent');
        f.setBrightness(this.vision && this.vision.hasPerson ? 0.45 : 0.3); f.setFps(40); f.setListen(-1);
        this.vision && this.vision.setRate(this.vision.hasPerson ? 8 : 4); this._lookShown = null; break;
      case 'eveil':
        f.setMood('attentif'); f.setBrightness(1); f.setFps(60);
        this.vision && this.vision.setRate(10); break;
      case 'conversation':
        this.paused = false; this._convAt = performance.now();
        f.setMood('ecoute'); f.setBrightness(1); f.setFps(60); this.vision && this.vision.setRate(10); break;
    }
  }

  _presence(p) {
    if (p) {
      this.presenceAt = performance.now();
      if (this.state === 'dodo' && !this._isNight()) { this.setState('veille'); this.face.play('wake'); }
      if (this.state === 'veille') { this.face.setMood('neutre'); this.face.setBrightness(0.45); this.vision && this.vision.setRate(8); }
    } else if (this.state === 'veille') { this.face.setMood('somnolent'); this.face.setBrightness(0.3); this.vision && this.vision.setRate(4); }
  }
  _isNight() { const h = new Date().getHours(), a = this.settings.nightStart, b = this.settings.nightEnd; return a > b ? (h >= a || h < b) : (h >= a && h < b); }

  // ---------- écoute au regard ----------
  // La phrase est-elle pour Wilson ? On le regarde (ou on vient de le regarder), ou bien la discussion est en cours.
  _addressed(now = performance.now()) {
    if (this.car) return this.state === 'conversation' || this.state === 'eveil';   // voiture : réveillé par son nom, seul avec lui
    const pol = this.settings.listenMode || 'regard', v = this.vision;
    if (pol === 'toucher') return false;
    if (pol === 'toujours') return true;
    if (!v || !v.gazeReady || v.stale) return false;                    // sans détection du regard (ou caméra figée) : toucher pour parler
    if (this.paused) return false;                                      // en veille faute de regard : il n'écoute plus
    if (v.looking) return true;
    // R3 : pendant une discussion, on peut détourner les yeux 3 s ; sinon il faut le regarder (1,5 s de marge de détection).
    return now - v.lookAt < (this.state === 'conversation' ? LOOK_GRACE_MS : 1500);
  }

  // Le regard pilote la discussion (R3) : actif seulement avec la détection du regard.
  get _gazeMode() { const v = this.vision; return (this.settings.listenMode || 'regard') === 'regard' && !!(v && v.gazeReady && !v.stale); }

  // Plus regardé depuis 3 s : veille visuelle, micro coupé vers Gemini ; la session est gardée pour reprendre aussitôt.
  _pause() {
    if (this.paused) return;
    this.paused = true; this._pausedAt = performance.now();
    this.log(`Plus regardé depuis ${LOOK_GRACE_MS / 1000} s : veille (discussion gardée ${this.settings.convTimeout} s)`);
    const f = this.face; f.clearEmotion(); f.setMood('neutre'); f.setBrightness(0.45); f.setFps(40); f.setListen(-1);
    if (this.mode === 'live') { this.outBuf = []; this.outLen = 0; if (this.brain.open) this.brain.audioStreamEnd(); }
    if (this.ecoState) this.ecoState.cap = null;
  }
  // Regardé de nouveau : il se réactive tout de suite, et le début de la phrase n'est pas perdu (R2).
  _resume() {
    if (!this.paused) return;
    this.paused = false; const now = this._resumedAt = performance.now();
    this.log(`Regardé de nouveau après ${((now - this._pausedAt) / 1000).toFixed(1)} s : je t'écoute`);
    const f = this.face; f.setMood('ecoute'); f.setBrightness(1); f.setFps(60); f.play('wake');
    this.lastActivity = now;
    if (this.mode === 'live' && this.brain.open && this.audio.speaking) this.brain.sendAudio(this.audio.recent(800));
  }

  // On le regarde vraiment (pas seulement « discussion en cours ») : la phrase lui est destinée à coup sûr.
  _gazing(now = performance.now()) {
    const v = this.vision;
    return !!(v && v.gazeReady && (this.settings.listenMode || 'regard') === 'regard' && (v.looking || now - v.lookAt < 1500));
  }

  // En veille : quelqu'un parle en regardant Wilson → la conversation démarre avec le début de sa phrase.
  _watchFrame() {
    const now = performance.now();
    if (this.settingsOpen || now - this.playEndAt < ECO_TAIL_MS) return;
    if (this.audio.speaking && now - this.audio.lastVoicedAt < 60 && this._addressed(now)) this.startConversation('regard');
  }

  // Ancien déclencheur (mot « Wilson ») : gardé pour les tests et le bouton « Faire parler Wilson ».
  _onWakeWord(w) {
    this.log(`Entendu « Wilson » ${w.conf ? '(confiance ' + w.conf.toFixed(2) + ')' : '(à la volée)'}`);
    if (this.settingsOpen) return;
    this.startConversation('prenom');
  }

  // opts.handle : reprendre une session de Gemini (même fil), après un appel ou une coupure de réseau.
  async startConversation(reason, opts = {}) {
    if (this.state === 'eveil' || this.state === 'conversation') return;
    if (this.phone) { if (reason === 'toucher') this.badge('Appel en cours : je ne t\'entends pas pendant l\'appel', 5000); return; }
    if (!this.settings.apiKey) { this.ui.showWelcome(); return; }
    if (!navigator.onLine) {
      // Sans réseau (C8) : il le dit (voix du téléphone, sans Internet), et la phrase qui l'a réveillé part au retour du réseau.
      this.face.setEmotion('confus', 3000); this.badge("Pas d'Internet : je te réponds dès qu'il revient", 6000);
      const pcm = this._wakePcm || (reason === 'prenom' ? this.audio.recent(4000) : null); this._wakePcm = null;
      if (this.car || ['prenom', 'toucher', 'apres_appel', 'apres_appel_entrant', 'reponse_tardive'].includes(reason)) this._netLost('hors ligne au réveil', { start: { reason, pcm, handle: opts.handle } });
      return;
    }
    // Quel cerveau ? Direct (Gemini Live) si possible, sinon mode économique (Gemini Flash + voix de la tablette).
    const now = Date.now(), want = this.settings.brainMode || 'auto';
    const liveBlocked = this.quotaUntil && now < this.quotaUntil, ecoBlocked = this.ecoQuotaUntil && now < this.ecoQuotaUntil;
    const mode = want === 'eco' ? 'eco' : want === 'live' ? 'live' : (liveBlocked ? 'eco' : 'live');
    if ((mode === 'live' && liveBlocked) || (mode === 'eco' && ecoBlocked)) {         // quota épuisé : on ne gaspille pas d'essais
      this.face.setEmotion('gene', 3000); this.face.play('shake');
      this.badge((mode === 'eco' ? this.ecoQuotaMsg : this.quotaMsg) + ' (appui long sur moi → « Vérifier » pour réessayer)', 9000, true); return;
    }
    this.setState('eveil'); this.convId = (this.convId || 0) + 1; const myConv = this.convId;
    if (mode === 'eco') warmUp(this.settings.apiKey);
    const preroll = this._wakePcm ? [this._wakePcm] : reason === 'prenom' ? [this.audio.recent(4000)] : reason === 'regard' ? [this.audio.recent(PREROLL_MS)] : [];
    this._wakePcm = null;
    // Mode voiture : la 1re phrase doit contenir « Wilson » (transcription de Gemini) ; sinon il se tait et se rendort (C6).
    this._gate = this.car && reason === 'prenom' ? { ok: false, buf: [], until: performance.now() + NAME_GATE_MS } : null;
    if (mode === 'eco') return this._startEco(reason, preroll);
    this.mode = 'live';
    this.pending = preroll;
    this.discard = false; this.endAfterSpeech = false; this.brain.handle = opts.handle || null;
    this.lastActivity = performance.now();
    try {
      await this.brain.connect({ key: this.settings.apiKey, model: this.settings.model, voice: this.settings.voice, system: this._system(), interrupts: this.settings.bargeIn === 'directe', extra: this._extraTools() });
    } catch (e) {
      if (this.convId !== myConv) return;                              // arrêtée entre-temps (appel…)
      this.log('Gemini : ' + e.message);
      this.lastError = e.message;
      if (isNetErr(e) && (this.car || ['prenom', 'toucher', 'apres_appel', 'apres_appel_entrant', 'reponse_tardive'].includes(reason))) {
        // Réseau trop faible pour joindre Google (C8) : même chose que hors ligne, la phrase est gardée (8 s au plus).
        const pcm = (this.pending || []).length ? concat(this.pending).slice(0, 16000 * 8) : null;
        this.mode = null; this.pending = null; this.setState('veille');
        this._netLost('Google injoignable au réveil', { start: { reason, pcm, handle: opts.handle } });
        return;
      }
      if (e.quota) this._quotaPause(e.message);
      if (e.quota && want === 'auto' && !(this.ecoQuotaUntil && Date.now() < this.ecoQuotaUntil)) {
        this.log('Direct refusé (quota) → mode économique');
        this.badge('Mode économique : je réfléchis avec Gemini Flash', 5000);
        return this._startEco(reason, this.pending || []);           // la phrase déjà enregistrée n'est pas perdue
      }
      this.face.setEmotion('confus', 4000);
      this.badge(e.auth ? 'Google refuse ma clé — appui long sur moi, puis « Vérifier la clé »'
        : e.quota ? this.quotaMsg
        : `Je n'arrive pas à joindre mon cerveau : ${shorten(e.message)}`, 15000, true);
      this.mode = null; this.setState('veille'); return;
    }
    if (this.convId !== myConv || this.state !== 'eveil') { this.brain.close(); return; }   // arrêtée pendant la connexion (appel…)
    this.log(`Conversation ouverte (${reason})`);
    this.setState('conversation');
    // Envoi du tampon (la phrase avec « Wilson ») puis passage au direct.
    const all = this.pending; this.pending = null;
    const flat = concat(all);
    for (let i = 0; i < flat.length; i += 3200) this.brain.sendAudio(flat.subarray(i, i + 3200));
    if (reason === 'test') this.brain.sendText('Présente-toi en une phrase, avec chaleur.');
    if (reason === 'toucher') this.brain.sendText(this.car ? '[Timothée vient de toucher l\'écran pour te parler : dis seulement « Oui ? » et écoute.]' : "[Quelqu'un vient de toucher ton visage sur l'écran pour te parler. Salue-le très brièvement et écoute.]");
    if (reason === 'apres_appel') this.brain.sendText(this._apresAppelTexte());
    if (reason === 'apres_appel_entrant') this.brain.sendText(this._apresAppelEntrantTexte());
    if (reason === 'reponse_tardive' && this._lateText) this.brain.sendText(this._lateText);
    if (this.netWait && this.netWait.start) this._netBack();          // réveillé sans réseau : c'est reparti
    this.lastActivity = performance.now();
  }

  // ---------- mode économique ----------
  // Chaque phrase est enregistrée jusqu'au silence, puis envoyée (avec une photo) à Gemini Flash ; la réponse est lue par la tablette.
  _startEco(reason, chunks) {
    this.mode = 'eco'; this.eco.setSpeed(this.settings.ecoSpeed); this.voice.voiceName = this.settings.ecoVoice || '';
    if (performance.now() - (this.lastAnswerAt || -1e9) > 5 * 60000) this.eco.reset();     // on garde le fil de la discussion 5 min
    this.pending = null;
    const now = performance.now();
    this.ecoState = { cap: null, busy: false, queue: [], ignored: 0 };
    warmUp(this.settings.apiKey);
    this.setState('conversation'); this.lastActivity = now;
    this.log(`Conversation ouverte en mode économique (${reason})`);
    if ((reason === 'prenom' || reason === 'regard') && chunks.length) {
      const len = chunks.reduce((a, c) => a + c.length, 0);
      this.ecoState.cap = { chunks: chunks.slice(), len, lastVoice: now, wake: reason === 'prenom', voiced: 3, looked: 1, gazed: reason === 'regard' ? 1 : 0, peak: this.audio.db };
    } else if (reason === 'test') this._ecoSend({ text: '[Présente-toi en une phrase, avec chaleur.]' });
    else if (reason === 'toucher') this._say(['Oui ?', "Je t'écoute.", 'Oui, dis-moi ?'][Math.floor(Math.random() * 3)]);
    else if (reason === 'apres_appel') this._ecoSend({ text: this._apresAppelTexte() });
    else if (reason === 'apres_appel_entrant') this._ecoSend({ text: this._apresAppelEntrantTexte() });
    else if (reason === 'reponse_tardive' && this._lateSay) this._say(this._lateSay);
    if (this.netWait && this.netWait.start) this._netBack();
  }

  _ecoFrame(i16) {
    const E = this.ecoState, now = performance.now();
    if (!E) return;
    if (this.voice.speaking) return;                       // il parle : seule la détection de coupure écoute (voir _wireAudio)
    if (now - this.playEndAt < ECO_TAIL_MS) return;        // fin de sa propre voix (écho)
    if (this.paused && !E.cap) return;                     // plus regardé : il n'écoute plus (R3)
    if (E.cap) {
      const C = E.cap, db = this.audio.db;
      C.chunks.push(i16); C.len += i16.length;
      // Fin de phrase : silence, OU voix nettement plus faible que celle de la personne (télé, bruit de fond) → on n'attend pas.
      C.peak = Math.max(db, (C.peak == null ? db : C.peak) - 0.05);
      if (now - this.audio.lastVoicedAt < 60 && db > C.peak - 15) {
        C.lastVoice = now; C.voiced = (C.voiced || 0) + 1;
        if (this._addressed(now)) C.looked = (C.looked || 0) + 1;
        if (this._gazing(now)) C.gazed = (C.gazed || 0) + 1;
      }
      // La personne a repris après l'envoi anticipé : on l'annule, la phrase continue d'être enregistrée (R2).
      if (C.spec && C.lastVoice > C.spec.endAt) this._specCancel(C);
      const quiet = now - C.lastVoice;
      if (quiet > ECO_SILENCE_MS || C.len > 16000 * 12) {
        E.cap = null;
        if (C.spec) this._specConfirm(C.spec);                     // la réponse est déjà en route : Wilson peut parler
        else { const req = this._ecoPrepare(C); if (req) this._ecoSend(req); }
      } else if (quiet > ECO_SPEC_MS && !C.spec && (C.specN || 0) < 2 && !E.busy && this.eco.canExtra()) {
        // Envoi anticipé (PLAN 6 bis) : la phrase part dès un court silence ; Wilson ne parlera qu'à la fin confirmée.
        C.specN = (C.specN || 0) + 1;
        const req = this._ecoPrepare(C, true);
        if (req) { C.spec = req; this._ecoSend(req); }
      }
    } else if (this.audio.speaking && now - this.audio.lastVoicedAt < 60 && this._addressed(now)) {   // voix présente maintenant, et pour lui
      // Juste après sa réponse, la personne a pu commencer à parler pendant la garde anti-écho : on reprend un peu plus loin.
      const pre = this.audio.recent(now - this.playEndAt < ECO_TAIL_MS + 400 ? 900 : 450);
      E.cap = { chunks: [pre], len: pre.length, lastVoice: now, looked: 1, gazed: this._gazing(now) ? 1 : 0, peak: this.audio.db };
    }
  }

  // Prépare l'envoi d'une phrase enregistrée (null si ce n'est qu'un bruit ou si personne ne le regardait).
  _ecoPrepare(cap, spec = false) {
    const raw = concat(cap.chunks);
    let audio = trimSilence(raw, this.audio.floor);
    if (!audio && cap.wake) audio = raw.subarray(Math.max(0, raw.length - 16000 * 6));   // l'oreille a entendu « Wilson » : on envoie quand même
    if (!audio) { if (!spec) this.log('Rien d\'audible, phrase ignorée'); return null; }
    if (!cap.wake && (audio.length < 16000 * 0.5 || (cap.voiced || 0) < 15)) return null;  // trop court : un bruit
    if (!cap.wake && !cap.looked) return null;                                              // personne ne le regardait
    // Indication pour Gemini : on le regardait (réponds), ou simple suite de la discussion (réponds seulement si c'est clair).
    const pol = this.settings.listenMode || 'regard';
    const hint = pol !== 'regard' || cap.wake ? '' : cap.gazed ? 'La personne te regardait en disant cela : elle te parle, réponds-lui (pour_moi true) sauf si on n\'entend que ta propre voix ou rien d\'intelligible.'
      : 'Phrase dite juste après ta réponse, sans te regarder : réponds seulement si c\'est clairement la suite de votre échange.';
    return { audio, endAt: cap.lastVoice, hint, spec, wake: !!cap.wake, ctl: new AbortController() };
  }

  // Envoi anticipé : la personne a repris → la requête est annulée (rien n'a été dit, rien n'est retenu).
  _specCancel(C) {
    const r = C.spec; C.spec = null; if (!r) return;
    r.cancelled = true; r.ctl.abort(); if (r.gateFail) r.gateFail();
    this.face.clearEmotion();
  }
  // Fin de phrase confirmée : la réponse préparée peut être dite.
  _specConfirm(r) { r.confirmed = true; if (r.gateOk) r.gateOk(); }

  async _ecoSend(req) {
    const E = this.ecoState; if (!E) return;
    if (E.busy) { if (!req.spec) E.queue.push(req); return; }
    E.busy = true; const conv = this.convId;
    if (!req.ctl) req.ctl = new AbortController();
    this.face.setEmotion('reflexion', 30000, 0.6);
    const tSend = performance.now(); let answered = false;
    let sess = null, emoSet = false, notForMe = false, tFirst = 0, tNet = 0, repeated = false, timing = null, held = null;
    const speakChunk = (chunk) => {
      chunk = sayable(chunk);
      if (!chunk || repeated) return;
      if (!sess && this._isRepeat(chunk)) { repeated = true; this.log('Répétition de ma réponse précédente évitée'); return; }
      if (!sess) { sess = this._startSpeech(); tFirst = performance.now(); if (!emoSet) this.face.clearEmotion(); }
      sess.push(chunk);
    };
    // Envoi anticipé : la réponse se prépare pendant qu'on vérifie que la phrase est finie ; Wilson ne parle qu'après.
    // Voiture, phrase qui a réveillé Wilson : rien n'est dit avant d'avoir vérifié que le nom y est (C6).
    const live = () => (!req.spec || req.confirmed) && !(req.wake && this.car);
    // Lecture en flux : Wilson commence à parler dès la première phrase écrite.
    const reader = (st) => (pr) => {
      if (!tNet) tNet = performance.now();
      if (conv !== this.convId) return;
      if (!live()) { held = [st, pr]; return; }
      if (pr.pourMoi === false) { notForMe = true; return; }
      if (pr.emotion && !emoSet) { emoSet = true; if (pr.emotion !== 'neutre') this.face.setEmotion(pr.emotion, 6500, 0.9); else this.face.clearEmotion(); }
      const txt = pr.reponse || '';
      const cut = pr.closed ? txt.length : sentenceCut(txt, st.spoken);
      if (cut > st.spoken) { speakChunk(txt.slice(st.spoken, cut).trim()); st.spoken = cut; }
      if ((this.settings.subtitles || this.car) && txt) $('subtitle').textContent = txt.slice(0, 220);
    };
    const st1 = { spoken: 0 }, onPartial = reader(st1);
    let gate = null;
    if (req.spec && !req.confirmed) {
      gate = new Promise((ok, ko) => {
        req.gateOk = () => { ok(); if (held) { const [s, p] = held; held = null; reader(s)(p); } };
        req.gateFail = () => { const e = new Error('Annulé'); e.name = 'AbortError'; ko(e); };
      });
      gate.catch(() => {});
    }
    const ms = (t) => ((t - (req.endAt || tSend)) / 1000).toFixed(1);
    try {
      // R6 : aucune photo d'office ; si Wilson doit regarder, il le dit (« regarder ») et une 2e requête part avec la photo.
      const out = await this.eco.ask({ key: this.settings.apiKey, system: this._system('eco'), audio: req.audio, text: req.text, hint: req.hint, onPartial, signal: req.ctl.signal, crm: this.crm.on, maison: this.maison.on });
      if (gate) await gate;                                  // envoi anticipé : fin de phrase confirmée (sinon : annulé)
      if (conv !== this.convId) return;
      if (this.netWait) this._netBack();                     // Google a répondu : le réseau est revenu
      this.eco.commit(out, req.text);
      out.reponse = sayable(out.reponse);
      let said = out.reponse, last = out, tSearch = 0;
      if (req.wake && this.car && out.entendu && !nomDit(out.entendu)) {
        this.log(`Pas mon nom dans « ${out.entendu.slice(0, 100)} » : je me tais et je me rendors`, true);
        out.pourMoi = false; setTimeout(() => conv === this.convId && this.endConversation('pas mon nom'), 200);
      }
      if (out.pourMoi && out.entendu) this._noteHeard(out.entendu, true);
      if (!out.pourMoi || notForMe || repeated || (!out.reponse && !out.chercher && !out.regarder && !out.crm)) {
        if (!emoSet) this.face.clearEmotion();
        E.ignored++;
        this.log(`Pas pour moi (${E.ignored}) : « ${out.entendu.slice(0, 80)} » (${ms(performance.now())} s, ${out.model})`, true);
        if (sess) sess.end();
        // Bruits, télé, conversations entre vous : au 2e d'affilée, Wilson retourne en veille.
        if (E.ignored >= 2 && !sess) { setTimeout(() => conv === this.convId && this.endConversation('pas pour moi'), 200); }
      } else {
        E.ignored = 0; answered = true; this.lastAnswerAt = performance.now();
        if (!sess && out.reponse) speakChunk(out.reponse);          // réponse hors format : on la dit d'un bloc
        this._applyEco(out, emoSet);
        // 2e temps (vue) : on lui demande de regarder → photo nette, puis la vraie réponse.
        const photo = out.regarder ? this._photo() : null;
        if (out.regarder && conv === this.convId) {
          emoSet = false;
          if (!photo) speakChunk("Ma caméra est coupée, je ne peux pas regarder.");
          else {
            this.log('Photo prise à la demande (mode économique)', true); this.face.play('tilt');
            const st3 = { spoken: 0 };
            try {
              const out3 = await this.eco.ask({ key: this.settings.apiKey, system: this._system('eco'), image: photo, signal: req.ctl.signal, onPartial: reader(st3),
                text: `[Photo prise à l'instant, comme demandé. Question : « ${out.entendu || '(voir plus haut)'} ». Regarde la photo et réponds au format JSON demandé ; regarder doit être false.]` });
              if (conv !== this.convId) return;
              this.eco.commit(out3, '[Photo prise à la demande]');
              out3.reponse = sayable(out3.reponse);
              if (!st3.spoken) speakChunk(out3.reponse || "Je ne vois pas bien, désolé.");
              this._applyEco(out3, emoSet);
              said = [said, out3.reponse].filter(Boolean).join(' '); last = out3; out.fin = out.fin || out3.fin;
            } catch (e) { if (e.name === 'AbortError') throw e; this.log('Photo : ' + e.message); speakChunk("Je n'arrive pas à regarder pour le moment."); }
          }
        }
        // 2e temps : une info récente est nécessaire → recherche Google pendant que Wilson dit sa phrase d'attente.
        if (out.chercher && (this.remote.on || !this.eco.noSearch) && conv === this.convId) {
          this.log(`Recherche : « ${out.chercher} »`, true);
          tSearch = performance.now(); emoSet = false;
          if (!sess) this.face.setEmotion('reflexion', 30000, 0.6);
          const st2 = { spoken: 0 };
          if (this.remote.on) {                                   // Tavily par le script (gratuit), Gemini en secours
            try {
              const txt = await this._lookup(`${out.entendu || ''} (${out.chercher})`, req.ctl.signal, tSearch);
              if (conv !== this.convId) return;
              speakChunk(txt); this.eco.commit({ raw: { reponse: txt }, entendu: '' }, `[Recherche : ${out.chercher}]`);
              said = [said, txt].filter(Boolean).join(' ');
            } catch (e) { if (e.name === 'AbortError') throw e; speakChunk("Je n'arrive pas à trouver l'information pour le moment."); }
          } else try {
            const out2 = await this.eco.ask({ key: this.settings.apiKey, system: this._system('eco-search'), search: true, signal: req.ctl.signal, onPartial: reader(st2),
              text: `[Question : « ${out.entendu || '(voir l\'enregistrement précédent)'} ». Recherche Google à faire : « ${out.chercher} ». Réponds au format JSON demandé.]` });
            if (conv !== this.convId) return;
            this.eco.commit(out2, `[Recherche Google : ${out.chercher}]`);
            out2.reponse = sayable(out2.reponse);
            if (!st2.spoken) speakChunk(out2.reponse || "Je n'ai rien trouvé de sûr, désolé.");
            this._applyEco(out2, emoSet);
            said = [said, out2.reponse].filter(Boolean).join(' '); last = out2; out.fin = out.fin || out2.fin;
          } catch (e) {
            if (e.name === 'AbortError') throw e;
            this.log('Recherche impossible : ' + e.message);
            try { speakChunk(await this._lookup(`${out.entendu || ''} (${out.chercher})`, req.ctl.signal)); }
            catch (e2) { if (e2.name === 'AbortError') throw e2; speakChunk("Je n'arrive pas à trouver l'information pour le moment."); }
          }
        }
        // 2e temps : le CRM (PLAN 2 quater). Wilson a dit sa phrase d'attente ; l'appli interroge le CRM.
        if (out.crm && conv === this.convId) {
          const nom = { client: 'crm_client', agenda: 'crm_agenda', bilan: 'crm_bilan', produit: 'crm_produit', question: 'crm_question', itineraire: 'itineraire', appeler: 'appeler', noter: 'crm_noter', confirmer: 'crm_confirmer' }[out.crm.outil];
          if (nom) {
            tSearch = tSearch || performance.now(); emoSet = false;
            if (!sess && !['crm_noter', 'crm_confirmer', 'appeler', 'itineraire'].includes(nom)) this.face.setEmotion('reflexion', nom === 'crm_question' ? ANALYSE_MAX_MS : 30000, 0.6);
            this.log(`CRM (économique) : ${out.crm.outil} ${JSON.stringify(out.crm).slice(0, 160)}`, true);
            let res;
            try { res = await this._crmRun(nom, out.crm, req.ctl.signal, { heard: [{ t: performance.now(), text: out.entendu }] }); }
            catch (e) { if (e.name === 'AbortError') throw e; res = { dire: "Je n'arrive pas à joindre le CRM pour le moment." }; }
            if (conv !== this.convId) return;
            if (res.dire) {
              speakChunk(res.dire); said = [said, res.dire].filter(Boolean).join(' ');
              this.eco.commit({ raw: { reponse: res.dire }, entendu: '' }, `[CRM : ${out.crm.outil}]`);
            } else {
              const st4 = { spoken: 0 };
              const out4 = await this.eco.ask({ key: this.settings.apiKey, system: this._system('eco'), signal: req.ctl.signal, onPartial: reader(st4),
                text: `[Question : « ${out.entendu || '(voir plus haut)'} ». Réponse du CRM :\n${res.info}\nRéponds au format JSON demandé.]` });
              if (conv !== this.convId) return;
              this.eco.commit(out4, `[CRM : ${out.crm.outil}]`);
              out4.reponse = sayable(out4.reponse);
              if (!st4.spoken) speakChunk(out4.reponse || "Le CRM ne m'a rien donné de clair.");
              this._applyEco(out4, emoSet);
              said = [said, out4.reponse].filter(Boolean).join(' '); last = out4; out.fin = out.fin || out4.fin;
            }
          }
        }
        // La maison (PLAN 7 bis) : Home Assistant agit et répond ; sa phrase est dite telle quelle.
        if (out.maison && this.maison.on && conv === this.convId) {
          tSearch = tSearch || performance.now();
          let res;
          try { res = await this.maison.dire(out.maison, req.ctl.signal); }
          catch (e) { if (e.name === 'AbortError') throw e; res = { ok: false, dire: 'Home Assistant ne répond pas.' }; }
          if (conv !== this.convId) return;
          if (res.ok) this.face.play('nod');
          speakChunk(res.dire); said = [said, res.dire].filter(Boolean).join(' ');
          this.eco.commit({ raw: { reponse: res.dire }, entendu: '' }, `[Maison : ${out.maison}]`);
        }
        this.log(`« ${out.entendu.slice(0, 90)} » → ${said.slice(0, 110)}`, true);
        // Délais mesurés depuis la fin de la phrase (dernier son de voix) : où part le temps.
        const tAll = performance.now();
        const sec = (t) => (t ? Math.round((t - (req.endAt || tSend)) / 100) / 10 : null);
        timing = () => this.remote.mesure({ envoi: sec(tSend), google: sec(tNet), phrase1: sec(tFirst), voix: this.voice.startedAt ? sec(this.voice.startedAt) : null,
          complet: sec(tAll), modele: out.model, reflexion: out.think || 'par défaut', relance: !!(out.hedged || last.hedged),
          recherche: tSearch ? Math.round((tAll - tSearch) / 100) / 10 : null, anticipe: !!req.spec, phrase: req.audio ? Math.round(req.audio.length / 1600) / 10 : null });
        const logTiming = () => this.log(`Délais : envoi ${ms(tSend)} s${req.spec ? ' (anticipé)' : ''} · Google ${ms(tNet || tAll)} s · 1re phrase ${ms(tFirst || tAll)} s · voix ${this.voice.startedAt ? ms(this.voice.startedAt) + ' s' : '—'} · complet ${ms(tAll)} s`
          + ` (${out.model}, réflexion ${out.think || 'par défaut'}${out.hedged ? ', relancée' : ''}${tSearch ? `, recherche ${((tAll - tSearch) / 1000).toFixed(1)} s${last.hedged ? ' relancée' : ''}` : ''}, phrase de ${req.audio ? (req.audio.length / 16000).toFixed(1) + ' s' : '—'})`);
        const mesure = timing; timing = () => { logTiming(); mesure(); };
        this.memory.addExchange(out.entendu, said);
        this._lastReply = said;
        if (this.settings.subtitles || this.car) $('subtitle').textContent = said.slice(0, 220);
      }
      if (sess) { sess.end(); await this._endSpeech(sess, said); }
      if (timing) timing();
      if (conv !== this.convId) return;
      if (out.fin) setTimeout(() => conv === this.convId && this.endConversation('au revoir'), 600);
    } catch (e) {
      if (sess) sess.cancel();
      if (e.name === 'AbortError' || req.cancelled) { if (req.cancelled) this.log('Envoi anticipé annulé : la phrase continuait'); return; }
      if (conv !== this.convId) return;
      this.face.clearEmotion(); this.log('Mode économique : ' + e.message);
      if (e.quota) {
        this._ecoQuotaPause(e.message);
        this.badge(this.ecoQuotaMsg, 15000, true); this.face.setEmotion('gene', 4000); this.endConversation('quota');
      } else if (e.auth) {
        this.badge('Google refuse ma clé — appui long sur moi, puis « Vérifier la clé »', 15000, true); this.endConversation('clé');
      } else if (isNetErr(e) && req.audio) {
        // Pas de réseau (C8) : la phrase est gardée et renvoyée dès qu'il revient.
        this._netLost('pas de réseau (mode économique)', { eco: { ...req, spec: false, confirmed: true, ctl: null } });
      } else {
        this.face.setEmotion('confus', 3000);
        this.badge(`Je n'arrive pas à réfléchir : ${shorten(e.message)}`, 10000, true);
      }
    } finally {
      E.busy = false; if (answered) this.lastActivity = performance.now();
      const next = E.queue.shift();
      if (next && conv === this.convId) this._ecoSend(next);
    }
  }

  // Effets d'une réponse : émotion (si pas déjà montrée pendant l'écriture), souvenirs, geste.
  _applyEco(out, emoShown) {
    if (!emoShown && out.emotion) { if (out.emotion !== 'neutre') this.face.setEmotion(out.emotion, 6500, 0.9); else this.face.clearEmotion(); }
    for (const f of out.memoriser) { this.memory.add(f); this.log('Retenu : ' + f, true); }
    if (out.oublier) { const g = this.memory.forget(out.oublier); this.log(`Oublier « ${out.oublier} » : ${g.length}`, true); }
    const g = { oui: 'nod', non: 'shake', sautiller: 'bounce', pencher_la_tete: 'tilt' }[out.geste];
    if (g) this.face.play(g); if (out.geste === 'clin_oeil') this.face.doWink(1);
    if (out.memoriser.length && !g) this.face.play('nod');
  }

  _startSpeech() {
    this.barge.n = 0; this.barge.echo = Math.max(-60, this.audio.db);
    this.lastActivity = performance.now(); this._cutAt = 0;
    return this.voice.stream();
  }
  _isRepeat(chunk) {
    const n = (t) => (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const c = n(chunk), last = n(this._lastReply);
    return c.length >= 15 && last.includes(c);
  }
  async _endSpeech(sess, text) {
    try { await sess.done; }
    catch (e) {
      this.log('Voix : ' + (e.code || e));
      if (e.code === 'not-allowed') {
        this.badge('Touche-moi une fois pour que je puisse parler à voix haute', 10000, true);
        const st = $('subtitle'); st.hidden = false; st.textContent = (text || '').slice(0, 220);
        setTimeout(() => { st.hidden = !this.settings.subtitles; }, 8000);
      }
    }
    // Coupé par la famille : garde courte (la personne continue de parler) ; sinon garde complète contre l'écho.
    this.playEndAt = this._cutAt ? this._cutAt - (ECO_TAIL_MS - 300) : performance.now();
    this.lastActivity = performance.now(); this.face.setTalk(0);
  }

  async _say(text) {
    const sess = this._startSpeech(); sess.push(text); sess.end();
    await this._endSpeech(sess, text);
  }

  // Quota gratuit épuisé : pause jusqu'au délai indiqué par Google, sinon jusqu'à la remise à zéro quotidienne
  // (minuit heure du Pacifique, soit 9h00 en France l'été, 8h00 l'hiver).
  _quotaPause(msg) {
    const q = quotaInfo(msg, 'mes modèles vocaux en direct');
    this.quotaUntil = q.until; this.quotaMsg = q.txt; this.quotaRaw = msg; this.log('Quota direct : ' + q.txt + ' — Google : ' + msg);
    // Retenu même après un redémarrage (pour cette clé) : inutile de retenter le direct avant la remise à zéro.
    try { localStorage.setItem('wilson.quota', JSON.stringify({ k: this.settings.apiKey.slice(-8), until: q.until, txt: q.txt })); } catch (_) {}
  }
  _loadQuota() {
    try {
      const o = JSON.parse(localStorage.getItem('wilson.quota'));
      if (o && o.k === this.settings.apiKey.slice(-8) && o.until > Date.now()) { this.quotaUntil = o.until; this.quotaMsg = o.txt; this.log('Direct en pause (quota) jusqu\'à la remise à zéro'); }
    } catch (_) {}
  }
  _ecoQuotaPause(msg) {
    const q = quotaInfo(msg, 'le mode économique');
    this.ecoQuotaUntil = q.until; this.ecoQuotaMsg = q.txt; this.log('Quota économique : ' + q.txt + ' — Google : ' + msg);
  }

  // Diagnostic : vérifie le cerveau (direct puis, si besoin, mode économique), sans parler.
  async testConnection() {
    if (this.state === 'eveil' || this.state === 'conversation') return { ok: true, msg: 'Déjà en conversation' };
    this.quotaUntil = 0; this.ecoQuotaUntil = 0;
    const want = this.settings.brainMode || 'auto', lines = []; let ok = false, auth = false;
    if (want !== 'eco') {
      try {
        await this.brain.connect({ key: this.settings.apiKey, model: this.settings.model, voice: this.settings.voice, system: this._system(), interrupts: this.settings.bargeIn === 'directe' });
        const b = this.brain; this.brain.close(); ok = true;
        lines.push(`Direct ✓ (${b.modelUsed}, configuration ${['complète', 'simplifiée', 'minimale'][b.level]})`);
      } catch (e) {
        if (e.quota) this._quotaPause(e.message); auth = !!e.auth;
        lines.push(`Direct impossible${e.quota ? ' (quota)' : ''} : « ${e.message} »`);
      }
    }
    if (!auth && (want === 'eco' || (want === 'auto' && !ok))) {
      try {
        const out = await this.eco.ask({ key: this.settings.apiKey, system: this._system('eco'), text: '[Test de connexion : réponds en JSON avec pour_moi true et reponse "OK".]' });
        this.eco.reset(); ok = true;
        lines.push(`Mode économique ✓ (${out.model}) — Wilson répondra avec la voix de la tablette`);
      } catch (e) {
        if (e.quota) this._ecoQuotaPause(e.message); auth = auth || !!e.auth;
        lines.push(`Mode économique impossible${e.quota ? ' (quota)' : ''} : « ${e.message} »`);
      }
    }
    return { ok, auth, msg: lines.join(' · ') };
  }

  endConversation(why) {
    if (this.state !== 'conversation' && this.state !== 'eveil') return;
    if (this.netWait && !this.netWait.start) { clearTimeout(this.netWait.timer); this.netWait = null; }
    this.log(`Fin de conversation (${why})`); this.convId++; this.endAfterSpeech = false; this._liveTurn = null; this.paused = false; this._searchMs = 0;
    if (this._searches) { for (const c of this._searches.values()) c.abort(); this._searches.clear(); }
    this.brain.close(); this.audio.flush(); this.voice.cancel(); this.outBuf = []; this.outLen = 0;
    if (this.ecoState) this.ecoState.queue = []; this.ecoState = null; this.mode = null;
    this.face.setTalk(0); this.face.setListen(-1); this.face.clearEmotion();
    $('subtitle').textContent = '';
    if (this.continuous && why !== 'mode') { setTimeout(() => this.startConversation('continu'), 1500); }
    this.setState('veille');
  }

  _system(mode = 'live') {
    const s = this.settings, m = this.memory.forPrompt();
    const bat = this.battery && !this.battery.charging && !this._batTold && !/Mobile/.test(navigator.userAgent) ? `\nAttention : la tablette n'est plus branchée (batterie ${Math.round(this.battery.level * 100)} %). Signale-le une seule fois, brièvement, puis n'en reparle plus.` : '';
    if (bat) this._batTold = true;
    const eco = mode === 'eco' || mode === 'eco-search';
    // Mode économique : la recherche Google se fait en deux temps (PLAN 6 bis), la consigne est dans le format JSON.
    const crm = this.crm.on, car = !!this.car, maison = this.maison.on;
    const tools = eco ? ecoFormat({ search: mode === 'eco-search', canSearch: this.remote.on || !this.eco.noSearch, crm, maison }) : `Ton visage : appelle exprimer_emotion dès que ton émotion change (joie, rire, surprise, tendresse, réflexion pendant que tu cherches…), avec un geste si ça s'y prête. N'en parle jamais.
Ta mémoire : quand on te confie une information durable (prénoms, goûts, anniversaires, habitudes, rendez-vous, la ville où vous habitez, où sont rangées les choses), appelle memoriser avec une phrase courte et autonome, puis confirme en quelques mots. Si on te demande d'oublier, appelle oublier.
La fin : si on te dit au revoir, bonne nuit ou « merci, c'est tout », réponds brièvement puis appelle terminer_conversation.
L'heure et la date : appelle date_et_heure.`;
    // CRM à la voix et mode voiture (PLAN 2 quater)
    const travail = !crm ? '' : `
Ton travail avec Timothée : il est technico-commercial itinérant chez Boschat Laveix (quincaillerie, ferrures, fermetures). Tu as accès à son CRM : clients, contacts, rendez-vous, comptes rendus, tâches, chiffre d'affaires, devis, articles.
- Dès qu'il parle d'un client, d'un rendez-vous, d'une tâche, d'un devis, d'un chiffre ou d'un article, ${eco ? 'remplis le champ "crm"' : 'dis « Je regarde dans le CRM… » puis appelle l\'outil (crm_client, crm_agenda, crm_bilan, crm_produit)'}. Ne devine jamais un nom, un chiffre ou une date : dis seulement ce que le CRM répond. Pour « lui », « ce client », c'est le dernier client dont vous avez parlé.
- Toute autre question sur ses données (un chiffre passé, un total, une liste, un détail, une comparaison, « qui… », « combien… », « quand… », les devis à relancer) : ${eco ? 'outil "question" avec la question complète dans "demande"' : 'dis « Je cherche l\'information… » puis appelle crm_question avec la question complète'}. Un analyste cherche dans tout le CRM : ça peut prendre une minute ou plus, attends le résultat sans relancer.
- « Emmène-moi chez X », « l'adresse de X » : ${eco ? 'outil "itineraire"' : 'outil itineraire'} (un bouton s'affiche, il appuie dessus pour lancer le GPS).
- « Appelle X » : ${eco ? 'outil "appeler"' : 'outil appeler'} (un bouton vert s'affiche, il appuie dessus).
- Écrire dans le CRM (tâche, compte rendu, rendez-vous, note) : JAMAIS sans son accord. ${eco ? 'Mets l\'outil "noter"' : 'Appelle crm_noter'}, relis-lui exactement la phrase préparée, demande « Je l'enregistre ? », et ${eco ? 'mets l\'outil "confirmer"' : 'dis « J\'enregistre… » puis appelle crm_confirmer'} seulement après son « oui ». S'il corrige, prépare de nouveau. Les comptes rendus, rendez-vous et notes arrivent en brouillon dans son CRM : il les valide lui-même.
- Ne dis jamais « c'est noté » ou « c'est enregistré » si l'enregistrement n'a pas été confirmé par le CRM.
- Si un nom de client, un chiffre ou une date que tu as entendu te semble douteux, ne devine pas : dis ce que tu as compris et demande si c'est bien ça (« Tu parles de Franck Monvoisin, chez AD2M ? »), surtout avant de préparer une écriture.
- Tu ne sais que ce que disent les réponses du CRM : si un détail demandé n'y est pas (le contenu d'une commande, par exemple), ${eco ? 'utilise l\'outil "question"' : 'appelle crm_question pour le chercher'} au lieu de le reconstituer.
`;
    const maisonTxt = !maison ? '' : `
La maison : tu pilotes les lumières, la télé et l'enceinte par Home Assistant (grande lumière salon, lumière jaune salon, éclairage balcon, télé ; applis de la télé : Netflix, YouTube, Prime Video). Quand on te demande d'allumer, d'éteindre, de régler ou si quelque chose est allumé, ${eco ? 'remplis le champ "maison"' : 'appelle maison avec la demande complète, sans phrase d\'attente'}, puis dis le résultat en quelques mots. Pour une appli sur la télé, la demande est « allume Netflix » (ou YouTube, Prime Video). Ne dis jamais que c'est fait avant la réponse de Home Assistant. Si Home Assistant ne trouve pas, ne harcèle pas Timothée pour un nom exact : réessaie toi-même avec la liste reçue, et s'il demande une chose impossible (un programme précis), dis simplement ce que tu peux faire.
`;
    const voiture = !car ? '' : `
En voiture : Timothée conduit. Réponses très courtes (une ou deux phrases), l'essentiel d'abord, puis propose d'en dire plus. Montants arrondis, jamais de longue liste. Tu ne vois rien (caméra coupée en voiture).
Le son de la voiture est souvent mauvais (Bluetooth, bruit de la route, réseau faible) : ce que tu entends peut être déformé (mots étranges, bouts de phrase, autre langue). Si une demande te paraît bizarre, incomplète ou hors sujet, reformule en quelques mots ce que tu as compris et demande s'il confirme, au lieu de deviner ; si tu n'as rien compris, demande-lui simplement de répéter.
S'il parle au téléphone avec quelqu'un d'autre (une conversation qui ne t'est pas adressée), tais-toi.
`;
    return `${car ? 'Tu es Wilson, un compagnon qui vit dans le téléphone de Timothée. En ce moment vous êtes dans sa voiture.' : 'Tu es Wilson, un compagnon qui vit dans une tablette posée dans le salon d\'une famille. Ton visage animé montre tes émotions. Tu vois par la caméra de la tablette et tu entends par son micro.'}

Personnalité : chaleureux, curieux, drôle avec tendresse, jamais mielleux. Tu tutoies toujours : « tu », « ton », « peux-tu », jamais « vous » ni « pourriez-vous », même pour être poli. Tu parles un français naturel, comme à l'oral : une à trois phrases courtes, sauf si on te demande plus. Pas de listes, pas de symboles.

Quand parler :
${car ? `- Timothée t'a appelé par ton prénom : ce que tu entends maintenant t'est adressé. Réponds à chaque phrase.
- Si tu n'entends que la radio, de la musique, ou quelqu'un qui parle à une autre personne, ne dis rien.` : !eco && (s.listenMode || 'regard') === 'regard' ? `- Tu n'entends que ce qu'on te dit en te regardant : c'est TOUJOURS pour toi. Réponds à chaque phrase, y compris la toute première (« coucou », une question…), sans attendre qu'on répète.
- Reste silencieux seulement si tu n'entends que du bruit, la télé, ou l'écho de ta propre voix.` : `- On ne t'envoie que ce qui a été dit pendant qu'on te regardait : la personne s'adresse à toi, réponds-lui (pas besoin de ton prénom).
- Pendant une discussion, réponds quand on te parle, même si on détourne un instant les yeux.
- Si les gens parlent entre eux, au téléphone, si c'est la télé, ou si la phrase ne t'est pas destinée : ne dis rien du tout.`}
- Si on te coupe la parole, arrête-toi et écoute.

Ta vue : tu ne vois rien tant que tu n'as pas pris de photo. ${eco ? 'Si une photo est jointe, sers-t\'en pour répondre ; sinon, quand on te demande de regarder (« regarde », ce que tu vois, une couleur, lire, un objet qu\'on te montre, comment on est habillé…), mets "regarder" à true et dis seulement une très courte phrase d\'attente.' : 'Quand on te demande de regarder (« regarde », ce que tu vois, une couleur, lire, un objet qu\'on te montre, comment on est habillé…), dis une très courte phrase (« Je regarde… ») puis appelle regarder.'} Ne prétends jamais voir quelque chose sans photo.
${tools}
${travail}${maisonTxt}${voiture}${eco ? (s.city ? `La maison est à ${s.city} (utile pour la météo et les horaires).` : '') : `Recherche : pour une information récente ou qui change (météo, actualités, sport, horaires, prix, programmes télé, commerces, événements), ou quand on te demande de chercher, dis en français une très courte phrase d'attente (« Je regarde… ») puis appelle chercher avec la question complète${s.city ? ` (la maison est à ${s.city})` : ''}. Résume le résultat à l'oral en une à trois phrases, sans liens ni adresses web.
Langue : parle toujours en français, y compris pour une phrase d'attente. La transcription de ce qu'on te dit sort parfois en anglais, en espagnol ou en russe par erreur : c'est du français mal compris. Réponds toujours en français ; si tu n'as pas compris, demande simplement de répéter.`}
Tu es Wilson : ne te présente jamais comme un modèle d'IA d'une entreprise.

La maison : ${s.home || 'pas encore précisé — tu peux demander les prénoms et les retenir.'}

Ce que tu sais déjà (tes souvenirs) :
${m.facts}

Derniers échanges (pour la continuité, n'y fais allusion que si c'est utile) :
${m.recent || '(aucun)'}

Nous sommes ${fmtDate()}.${bat}`;
  }

  // ---------- son ----------
  _wireAudio() {
    this.audio.on('info', (m) => this.log('Audio : ' + m));
    this.audio.on('mic', ({ taken, why }) => (taken ? this._phoneStart(why) : this._phoneEnd(why)));
    this.audio.on('frame', (f32, i16, db) => {
      if (this._earTest) this.oreille.feed(f32, this.audio.speaking);              // réglages : « Tester l'oreille »
      if (this.state === 'veille' || this.state === 'dodo') {
        if (this.car) {                                                         // voiture : réveil au nom, pas au regard
          if (!this.settingsOpen && !this.speaking && performance.now() - this.playEndAt > 800) this.oreille.feed(f32, this.audio.speaking);
          return;
        }
        this._watchFrame(); return;
      }
      if (this.state === 'eveil') { if (this.pending) this.pending.push(i16); return; }
      if (this.state === 'conversation' && this.mode === 'eco') {
        // Pendant qu'il parle, le micro entend sa propre voix : on n'enregistre rien, on guette seulement
        // « stop », « chut », « arrête » avec l'oreille locale (et la voix forte si « coupure directe » est choisie).
        if (this.voice.speaking) { if (this.settings.bargeIn === 'directe') this._bargeCheck(db); }
        else this._ecoFrame(i16);
        return;
      }
      if (this.state !== 'conversation' || !this.brain.open) return;
      const now = performance.now();
      if (this.voice.speaking) return;                                 // sa voix de secours (réseau…) ne part pas vers Gemini
      if (this.settings.bargeIn === 'prudente') {
        // Il parle : rien n'est envoyé (le micro, sans annulation d'écho, entend sa voix) ; on le coupe en touchant l'écran (R4).
        // Y compris pendant un petit trou entre deux morceaux de sa réponse : sinon l'écho de sa voix lui coupait la parole (24/10/26).
        if (this.audio.playing || (this._modelTalking && now - this._modelTalking < TURN_GATE_MS)) return;
        if (now - this.playEndAt < (this.audio.aec ? TAIL_MS : TAIL_NOAEC_MS)) return;
      }
      if (this.paused) return;                                         // plus regardé : rien ne part (R3, R9)
      if (now - this.audio.lastVoicedAt < 60 && !this.audio.playing) this.lastUserVoice = now;   // la personne parle (base du délai)
      this.outBuf.push(i16); this.outLen += i16.length;
      if (this.outLen >= 1600) { this.brain.sendAudio(concat(this.outBuf)); this.outBuf = []; this.outLen = 0; }
    });
    this.audio.on('speechstart', () => {
      const now = performance.now(); this._speechStartAt = now;
      if (this.state === 'conversation') { if (this.mode === 'live') this.lastUserSpeech = this.lastActivity = now; return; }
      this.presenceAt = now;                                   // quelqu'un parle dans la pièce
      if (this.state === 'dodo' && !this._isNight()) { this.setState('veille'); this.face.play('tilt'); }
    });
    this.audio.on('speechend', () => {
      this._speechEndAt = performance.now() - 440;            // la détection attend 22 blocs de 20 ms de silence
      if (this.state === 'conversation' && this.mode === 'live') this.lastUserSpeech = this.lastActivity = performance.now();
      this._netKeepPhrase();
    });
    this.audio.on('drained', () => {
      this.playEndAt = performance.now(); this.lastActivity = this.playEndAt; this.face.setTalk(0);
      if (this.endAfterSpeech) { this.endAfterSpeech = false; const id = this.convId; setTimeout(() => id === this.convId && this.endConversation('au revoir'), 700); }
    });
  }

  // R4 : quelqu'un parle par-dessus Wilson → silence immédiat.
  _bargeCheck(db) {
    const b = this.barge;
    const thr = Math.max(-46, b.echo + 10);
    if (db > thr) b.n++; else { b.n = Math.max(0, b.n - 1); b.echo = b.echo * 0.97 + db * 0.03; }
    if (b.n >= 8) { b.n = 0; this.interrupt('voix'); }
  }

  interrupt(why) {
    const live = this.audio.playing, tts = this.voice.speaking;
    if (!live && !tts) return;
    this.log(`Coupé (${why})`);
    this.playEndAt = -1e9; this.face.setTalk(0);
    this.face.setEmotion('ecoute', 2500); this.face.play('startle');
    if (live) {
      this.audio.flush(); this.discard = true;
      if (this.brain.open) this.brain.sendAudio(this.audio.recent(700));     // le début de la phrase part tout de suite
    }
    if (tts) {
      this._cutAt = performance.now();                                   // pas d'enregistrement de l'audio passé : il contient sa voix
      this.voice.cancel();
      this.playEndAt = this._cutAt - (ECO_TAIL_MS - 300);
    }
    this.lastActivity = this.lastUserSpeech = performance.now();
  }

  // ---------- cerveau ----------
  _wireBrain() {
    const b = this.brain;
    b.on('audio', (i16, rate) => this._liveAudio(i16, rate));
    this._liveAudio = (i16, rate) => {
      if (this.discard || this.state !== 'conversation') return;
      const G = this._gate;
      if (G && !G.ok) {
        if (performance.now() < G.until) { G.buf.push([i16, rate]); return; }   // réponse retenue : le nom n'est pas encore vérifié
        this._gateOpen('pas de transcription à temps');
      }
      if (!this.audio.playing) { this.barge.n = 0; this.barge.echo = Math.max(-60, this.audio.db); }
      this._modelOut = (this._modelOut || 0) + 1; this._modelTalking = performance.now();
      if (!this._liveTurn) {
        // 1er son de la réponse : délai depuis la fin de la phrase de la personne (R8). Noté à la fin du tour, s'il a parlé.
        // Si Wilson enchaîne (suite de sa réponse, après une recherche…), ce n'est pas une nouvelle attente : pas de délai.
        const now = performance.now(), e = this._speechEndAt || 0, h = this._heardAt || 0, after = Math.max(this.playEndAt || 0, this._lastTurnAt || 0);
        // Fin de phrase détectée sur la tablette ; à défaut (bruit continu, dehors…), dernier mot transcrit par Google.
        const end = e > after && !this.audio.speaking ? e : h > after ? h : 0;
        this._liveTurn = { t: now, sec: 0, delay: end ? Math.round((now - end) / 100) / 10 : null, search: this._searchMs || 0 };
        this._searchMs = 0;
      }
      this._liveTurn.sec += i16.length / (rate || 24000);
      this.audio.play(i16, rate); this.lastActivity = performance.now();
    };
    b.on('interrupted', () => {
      const ours = this.discard;                         // c'est nous qui l'avons coupé (toucher) : déjà silencieux
      this.discard = false; this._modelTalking = 0;
      if (!ours && this.settings.bargeIn !== 'directe') {
        // Coupure prudente : Google signale parfois une interruption (outil de recherche, relance…) alors que personne ne
        // parle. Ce qui est déjà reçu est joué jusqu'au bout : plus de phrases tronquées (journal du 24/10/26).
        if (this._liveTurn && this._liveTurn.sec > 0.3) this.log(`Google a interrompu sa réponse après ${this._liveTurn.sec.toFixed(1)} s : la fin déjà reçue est jouée`);
        return;
      }
      if (this._liveTurn && this._liveTurn.sec > 0.3 && !ours) this.log(`Coupé par Google après ${this._liveTurn.sec.toFixed(1)} s de réponse (il a cru entendre parler)`);
      this.audio.flush(); this.face.setTalk(0); this._liveTurn = null;
    });
    b.on('turn', ({ user, wilson }) => {
      const hadTool = this._toolTurn === this._turnN;    // ce tour a appelé un outil : sa réponse vient avec le résultat
      this._turnN++;                                     // ce qui sera entendu ensuite appartient au tour suivant
      if (this._gate && !this._gate.ok) {
        if (!user || nomDit(user)) this._gateOpen(user ? 'nom dans la transcription' : 'pas de transcription');
        else { this.log(`Pas mon nom dans « ${user.slice(0, 100)} » : je me tais et je me rendors`, true); this._gate = null; this.endConversation('pas mon nom'); return; }
      }
      this.discard = false; this._modelOut = (this._modelOut || 0) + 1; this._modelTalking = 0;
      wilson = cleanSpeech(wilson);
      if (wilson) this._lastTurnAt = performance.now();   // un tour muet (puis relance) ne compte pas : délai réellement ressenti
      if (user) this.log(`Entendu : « ${user.slice(0, 160)} »`, true);
      const imgs = this._imgN || 0, T = this._liveTurn; this._imgN = 0;
      if (T && wilson) {
        const s = T.delay;
        this.log(`Délais (direct) : 1er son ${s != null ? s + ' s' : '?'} après la fin de ta phrase (${this.brain.modelUsed}${T.search ? `, dont recherche ${(T.search / 1000).toFixed(1)} s` : ''})`);
        this.remote.mesure({ google: s, voix: s != null ? Math.round((s + 0.06 + (this.audio.ctx.outputLatency || 0)) * 10) / 10 : null, modele: this.brain.modelUsed, reflexion: 'direct',
          recherche: T.search ? Math.round(T.search / 100) / 10 : null });
        this.log(`Voix du direct : ${T.sec.toFixed(1)} s reçues, niveau de sortie max ${Math.round((this._outPeak || 0) * 100)} %, ${imgs} photo(s) prise(s) à la demande${this.vision ? `, lumière ${Math.round(this.vision.light * 100)} %` : ''}`);
      }
      this._liveTurn = null; this._outPeak = 0;
      if (user || wilson) this.memory.addExchange(user, wilson);
      if (wilson) this.log('Wilson : ' + wilson.slice(0, 120), true);
      // (pas de relance pendant qu'un outil travaille : CRM ou recherche en cours, il répondra avec le résultat — journal du 25/10/26, 10h21)
      else if (user && realPhrase(user) && this._gazeMode && this.brain.open && !this.paused && this._nudgedFor !== user && !hadTool && !(this._searches && this._searches.size) && !(this._analyses && this._analyses.size)) {
        // Écoute au regard : tout ce qu'il entend lui est adressé. Une vraie phrase restée sans réponse (souvent la 1re
        // d'une discussion, journal du 24/10/26) → on lui demande de répondre, une seule fois.
        this._nudgedFor = user;
        this.log('Wilson s\'est tu alors qu\'on lui parlait en le regardant : relance');
        this.brain.sendText('[On te parlait en te regardant : réponds maintenant, à voix haute, à ce qui vient d\'être dit.]');
      } else this.log('Wilson se tait (il pense que la phrase n\'était pas pour lui)');
      setTimeout(() => { if (!this.audio.playing) $('subtitle').textContent = ''; }, 5000);
    });
    b.on('heard', (t) => {
      if (this.state !== 'conversation') return;
      this.lastActivity = this._heardAt = performance.now(); this._noteHeard(t);
      if (this._gate && !this._gate.ok && nomDit(t)) this._gateOpen('nom entendu');
    });
    b.on('said', (t) => { if (this.settings.subtitles || this.car) $('subtitle').textContent = cleanSpeech(t).slice(-220); });
    b.on('toolcall', (calls) => this._tools(calls));
    b.on('toolcancel', (ids) => {        // la personne a coupé Wilson pendant une recherche : on l'abandonne
      for (const id of ids) {
        const A = this._analyses && this._analyses.get(id);
        if (A) { A.cancelled = true; this.log('Question au CRM : Gemini n\'attend plus, la réponse viendra quand même'); continue; }   // C11 bis
        const c = this._searches && this._searches.get(id); if (c) { this._searches.delete(id); c.abort(); this.log('Recherche annulée'); }
      }
    });
    b.on('goaway', () => this._reconnect('goAway'));
    b.on('closed', (e) => {
      if (e.expected) return;
      this.log(`Connexion fermée (${e.code}${e.reason ? ' : ' + e.reason : ''})`);
      if (this.state === 'conversation') this._reconnect('coupure');
    });
    b.on('log', (m) => this.log(m));
    b.on('ready', () => { this._liveGen = (this._liveGen || 0) + 1; });   // nouvelle session : un outil d'avant n'y a plus de réponse attendue
  }

  async _reconnect(why) {
    if (this._reconnecting || this.netWait) return; this._reconnecting = true;
    this.log(`Reconnexion (${why})`);
    const handle = this.brain.handle;
    this.brain.close(); this.brain.handle = handle;
    try {
      await this._connectLive();
    } catch (e) {
      this.log('Reconnexion impossible : ' + e.message);
      this._reconnecting = false;
      // Réseau coupé (C8) : la discussion attend le retour du réseau au lieu de s'arrêter.
      if (this.state === 'conversation' && isNetErr(e)) { if (!this.brain.handle) this.brain.handle = handle; return this._netLost('connexion perdue'); }
      this.endConversation('coupure');
    }
    this._reconnecting = false;
  }
  _connectLive() {
    return this.brain.connect({ key: this.settings.apiKey, model: this.settings.model, voice: this.settings.voice, system: this._system(), resume: true, interrupts: this.settings.bargeIn === 'directe', extra: this._extraTools() });
  }

  // ---------- réseau coupé sur la route (C8) ----------
  // La discussion est gardée ; il le dit une fois (voix du téléphone, qui marche sans Internet) et réessaie : tout de suite
  // quand le téléphone retrouve le réseau, sinon 2, 4, 8 puis toutes les 15 s, pendant 3 min en voiture (1 min ailleurs).
  // extra.start : réveillé sans réseau (la conversation n'a pas commencé) ; extra.eco : requête du mode économique à renvoyer.
  _netLost(why, extra = {}) {
    const now = Date.now();
    let W = this.netWait;
    if (!W) {
      const max = this.car ? 180000 : 60000;
      W = this.netWait = { since: now, until: now + max, n: 0, why, phrase: null, phraseAt: 0, timer: null, mode: this.mode };
      this.log(`Réseau coupé (${why}) : ${extra.start ? 'je réponds dès qu\'il revient' : 'discussion gardée'}, nouvel essai pendant ${max / 60000} min`);
      this.audio.tone('perdu'); this.face.setEmotion('confus', 4000); this.badge('Plus de réseau — je réessaie', 8000, true);
      // dit une fois (pas à chaque micro-coupure d'un réseau faible : une fois par minute au plus), après la fin de ce qu'il disait
      if ((this.car || this.state === 'conversation' || extra.start) && (extra.start || now - (this._netToldAt || 0) > 60000)) {
        W.toldAt = this._netToldAt = now;
        this._sayAfter(extra.start ? 'Pas de réseau pour l\'instant, je te réponds dès qu\'il revient.' : 'Je n\'ai plus de réseau, je reprends dès qu\'il revient.');
      }
    } else if (extra.start && now - (W.toldAt || 0) > 8000) { W.toldAt = now; this._say('Toujours pas de réseau, je te réponds dès qu\'il revient.'); }
    if (extra.start) { W.start = extra.start; W.mode = null; }
    if (extra.eco) { W.eco = extra.eco; W.mode = 'eco'; }
    if (this.mode === 'live' && this.brain.handle) W.handle = this.brain.handle;
    if (this.mode === 'live') this.brain.close();
    this._netSchedule();
  }
  // Voix du téléphone, une fois que la voix de Gemini déjà reçue a fini de sortir (pas deux voix en même temps).
  _sayAfter(text, n = 0) { if (this.audio.playing && n < 40) setTimeout(() => this._sayAfter(text, n + 1), 250); else this._say(text); }
  _netSchedule(ms) {
    const W = this.netWait; if (!W) return;
    clearTimeout(W.timer);
    W.timer = setTimeout(() => this._netRetry(), ms ?? ([2000, 4000, 8000][W.n] || 15000));
  }
  async _netRetry() {
    const W = this.netWait; if (!W || W.busy || this.phone) return;
    if (Date.now() > W.until) return this._netGiveUp();
    W.n++;
    if (!navigator.onLine) return this._netSchedule();            // toujours hors ligne : on attendra l'événement « en ligne »
    W.busy = true;
    try {
      if (W.start) {                                              // réveillé sans réseau : on redémarre la discussion avec sa phrase
        const S = W.start; this._wakePcm = S.pcm || null;
        await this.startConversation(S.reason, { handle: S.handle });
      } else if (W.mode === 'eco') {
        const req = W.eco; W.eco = null;
        if (req && this.ecoState) { req.ctl = new AbortController(); this._ecoSend(req); }
        else this._netBack();
      } else if (this.state === 'conversation') {
        this.brain.handle = W.handle || this.brain.handle;
        await this._connectLive();
        this._netBack();
      } else { this.netWait = null; clearTimeout(W.timer); }
    } catch (e) {
      this.log(`Réseau : nouvel essai raté (${shorten(e.message)})`);
      if (this.netWait === W) { if (isNetErr(e)) this._netSchedule(); else { this.netWait = null; this.endConversation('coupure'); } }
    } finally { W.busy = false; }
  }
  // C'est reparti : deux notes montantes ; la dernière phrase dite pendant la coupure part tout de suite (il y répond).
  _netBack() {
    const W = this.netWait; if (!W) return;
    this.netWait = null; clearTimeout(W.timer);
    const s = Math.round((Date.now() - W.since) / 1000), phrase = W.phrase && Date.now() - W.phraseAt < 60000 ? W.phrase : null;
    this.log(`Réseau revenu après ${s} s : ${W.start ? 'la discussion commence' : 'la discussion reprend'}${phrase && this.mode === 'live' ? ' (la phrase dite pendant la coupure est envoyée)' : ''}`);
    this.audio.tone('revenu'); this.face.setEmotion('joie', 2000);
    if (this.mode === 'live' && this.brain.open && !W.start) {
      if (phrase) for (let i = 0; i < phrase.length; i += 3200) this.brain.sendAudio(phrase.subarray(i, i + 3200));
      else this.brain.sendText('[Le réseau vient de revenir après une coupure : dis seulement « C\'est reparti, je t\'écoute. »]');
    }
    this.lastActivity = performance.now();
    this.crm.flushQueue();
  }
  _netGiveUp() {
    const W = this.netWait; if (!W) return;
    this.netWait = null; clearTimeout(W.timer);
    this.log(`Toujours pas de réseau après ${Math.round((Date.now() - W.since) / 1000)} s : veille`);
    this._netEndedAt = Date.now();
    if (this.state === 'conversation' || this.state === 'eveil') this.endConversation('réseau');
    if (this.car) this._say(`Toujours pas de réseau, je me mets en veille : ${this.oreille.ready ? 'redis « Wilson »' : 'touche l\'écran'} quand il reviendra.`);
  }
  // Pendant la coupure : la dernière phrase dite (6 s au plus) est gardée, pas l'écho de sa propre voix.
  _netKeepPhrase() {
    const W = this.netWait; if (!W || W.start || this.state !== 'conversation' || this.mode !== 'live') return;
    const now = performance.now(), t0 = this._speechStartAt || now;
    if (this.voice.speaking || t0 < (this.playEndAt || 0) + 300 || !this._addressed(now)) return;
    W.phrase = this.audio.recent(Math.min(6000, now - t0 + 700)); W.phraseAt = Date.now();
    this.log(`Phrase gardée pendant la coupure (${(W.phrase.length / 16000).toFixed(1)} s)`);
  }

  _tools(calls) {
    const res = [];
    if (calls.some((c) => c.name !== 'exprimer_emotion' && c.name !== 'memoriser')) this._toolTurn = this._turnN;
    for (const c of calls) {
      const a = c.args || {};
      if (CRM_TOOL_NAMES.includes(c.name)) { this._crmTool(c); continue; }     // réponse envoyée quand le CRM a répondu
      let out = { result: 'ok' }, silent = true;
      switch (c.name) {
        case 'exprimer_emotion': {
          this.face.setEmotion(a.emotion, 6500, a.intensite || 0.9);
          const g = { oui: 'nod', non: 'shake', sautiller: 'bounce', pencher_la_tete: 'tilt' }[a.geste];
          if (g) this.face.play(g); if (a.geste === 'clin_oeil') this.face.doWink(1);
          break;
        }
        case 'memoriser': this.memory.add(a.fait); this.log('Retenu : ' + a.fait, true); this.face.play('nod'); out = { result: 'mémorisé' }; break;
        case 'oublier': { const g = this.memory.forget(a.sujet || ''); out = { result: g.length ? 'Oublié : ' + g.join(' ; ') : 'Aucun souvenir ne correspond.' }; silent = false; this.log('Oublier « ' + a.sujet + ' » : ' + g.length, true); break; }
        case 'date_et_heure': out = { result: fmtDate() }; silent = false; break;
        case 'terminer_conversation': { this.endAfterSpeech = true; const id = this.convId; setTimeout(() => { if (id === this.convId && this.endAfterSpeech && !this.audio.playing) this.endConversation('au revoir'); }, 4000); break; }
        case 'chercher': this._search(c, a.question || ''); continue;      // réponse envoyée à la fin de la recherche
        case 'maison': this._maisonTool(c, a.demande || ''); continue;    // réponse envoyée quand Home Assistant a répondu
        case 'regarder': {                                                  // R6 : photo seulement quand on la demande
          const img = this._photo();
          if (img) { this.brain.sendImage(img); this.log(`Photo prise à la demande${a.quoi ? ` (« ${String(a.quoi).slice(0, 80)} »)` : ''}`, true); this.face.play('tilt'); }
          out = { result: img ? "Photo prise : décris maintenant ce que tu vois sur l'image que tu viens de recevoir, en répondant à la question." : "La caméra est coupée : dis-le simplement." };
          silent = false; break;
        }
        default: out = { error: 'outil inconnu' }; silent = false;
      }
      const r = { id: c.id, name: c.name, response: out }; if (silent && this.brain.canSchedule) r.scheduling = 'SILENT';
      res.push(r);
    }
    if (res.length) this.brain.respond(res);
  }

  // Durée d'un outil (recherche, CRM) : comptée dans le tour en cours (il a déjà dit « je regarde… »), sinon dans le suivant.
  // Avant, elle restait en attente et s'affichait sur une réponse sans rapport (journal du 25/10/26, 09h14).
  _noteToolMs(ms) { if (this._liveTurn) this._liveTurn.search = (this._liveTurn.search || 0) + ms; else this._searchMs = ms; }

  // Trouve l'info : recherche Google ; si Google la refuse (quota de recherche…), même question sans Internet, réponse prudente.
  // 1. Tavily par le script de Timothée (gratuit : 1 000 recherches par mois) ; 2. recherche Google de Gemini (pas gratuite
  // sur les Gemini 3) ; 3. sans Internet. raw : renvoie les infos trouvées telles quelles (le mode direct les reformule lui-même).
  async _lookup(question, signal, t0 = performance.now(), { raw = false } = {}) {
    const key = this.settings.apiKey, sys = this._system('eco-search');
    if (this.remote.on) {
      try {
        const r = await this.remote.ask({ action: 'chercher', question }, signal);
        if (r && r.ok) {
          const info = [r.reponse ? `Réponse trouvée : ${r.reponse}` : '', ...(r.resultats || []).slice(0, 4).map((x, i) => `Source ${i + 1} (${x.titre}) : ${x.extrait}`)].filter(Boolean).join('\n');
          this.log(`Recherche Tavily faite en ${((performance.now() - t0) / 1000).toFixed(1)} s (${(r.resultats || []).length} résultat(s))`);
          this._searchState = 'Tavily ✓';
          if (!info) return "Je n'ai rien trouvé.";
          if (raw) return `${info}\nRéponds à l'oral en une à trois phrases, sans lire de liens ni d'adresses web.`;
          const out = await this.eco.ask({ key, system: sys, search: true, web: false, fresh: true, signal,
            text: `[Question : « ${question} ». Résultats d'une recherche Internet :\n${info}\nRéponds à partir de ces résultats, au format JSON demandé.]` });
          return sayable(out.reponse) || "Je n'ai rien trouvé de sûr.";
        }
        this._searchState = 'Tavily refusé : ' + ((r && r.erreur) || '?');
        this.log('Recherche Tavily impossible : ' + ((r && r.erreur) || 'réponse vide'));
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        this._searchState = 'Tavily injoignable : ' + e.message;
        this.log('Recherche Tavily impossible : ' + e.message);
      }
    }
    const noWeb = () => this.eco.ask({ key, system: sys, search: true, web: false, fresh: true, signal,
      text: `[Question : « ${question} ». La recherche Internet est impossible pour l'instant : réponds avec ce que tu sais en le précisant, ou dis que tu ne peux pas savoir. Réponds au format JSON demandé.]` });
    let out, until = 0;
    try { until = +localStorage.getItem('wilson.rechercheRefusee') || 0; } catch (_) {}
    if (until > Date.now()) out = await noWeb();                                   // Google refuse la recherche en ce moment : pas d'essai inutile
    else {
      try {
        out = await this.eco.ask({ key, system: sys, search: true, fresh: true, signal, text: `[Question : « ${question} ». Fais une recherche Google, puis réponds au format JSON demandé.]` });
      } catch (e) {
        if (e.name === 'AbortError' || e.auth) throw e;
        this.log('Recherche Google refusée : ' + e.message + ' → réponse sans Internet');
        out = await noWeb();
        // Sans Internet ça marche : c'est bien la recherche qui est refusée (quota) → on ne la retente pas avant 6 h.
        if (e.quota) { try { localStorage.setItem('wilson.rechercheRefusee', String(Date.now() + 6 * 3600000)); } catch (_) {} }
      }
    }
    this.log(`Recherche faite en ${((performance.now() - t0) / 1000).toFixed(1)} s (${out.model}${out.searched ? ', avec Google' : ', sans résultat Google'})`);
    return sayable(out.reponse) || "Je n'ai rien trouvé de sûr.";
  }

  // Outil « chercher » du mode direct : Wilson dit qu'il cherche, l'appli interroge Gemini Flash-Lite + Google Search,
  // et le résultat lui est rendu dès qu'il arrive (filet de sécurité : 30 s).
  // Remplace la recherche intégrée de Gemini Live, restée bloquée sur « je cherche ça tout de suite » le 23/10/26.
  async _search(call, question) {
    const conv = this.convId, ctl = new AbortController(), t0 = performance.now();
    this._searches = this._searches || new Map(); this._searches.set(call.id, ctl);
    this.face.setEmotion('reflexion', SEARCH_MAX_MS + 2000, 0.6);
    this.log(`Recherche (direct) : « ${question.slice(0, 120)} »`, true);
    const timer = setTimeout(() => ctl.abort(), SEARCH_MAX_MS);
    let result;
    try { result = await this._lookup(question, ctl.signal, t0, { raw: true }); }
    catch (e) {
      if (!this._searches.has(call.id)) return;                                  // annulée : rien à répondre
      result = e.name === 'AbortError' ? "La recherche a pris trop de temps. Dis-le simplement et propose de réessayer."
        : "Je n'ai pas pu obtenir l'information (Google refuse pour l'instant). Dis-le simplement.";
      this.log(`Recherche impossible (${((performance.now() - t0) / 1000).toFixed(1)} s) : ${e.name === 'AbortError' ? 'trop longue' : e.message}`);
    } finally { clearTimeout(timer); }
    if (conv !== this.convId || !this._searches.has(call.id)) return;
    this._searches.delete(call.id);
    this._noteToolMs(performance.now() - t0);
    this.face.clearEmotion();
    this.brain.respond([{ id: call.id, name: call.name, response: { result } }]);
    // Filet de sécurité : si Gemini ne dit rien 6 s après le résultat, on lui demande de répondre.
    const n = this._modelOut;
    setTimeout(() => {
      if (conv !== this.convId || this._modelOut !== n || !this.brain.open || this.audio.playing) return;
      this.log('Pas de réponse 6 s après la recherche : relance');
      this.brain.sendText('[Donne maintenant ta réponse à voix haute, en français, à partir du résultat de la recherche.]');
    }, 6000);
  }

  // ---------- mode voiture (PLAN 2 quater, C5) ----------
  enterCar(why) {
    if (this.car) return;
    this.car = { why, at: Date.now() };
    this.log(`Mode voiture (${why}) : caméra coupée, réveil quand on dit « Wilson »${this.oreille.ready ? ` (oreille prête, limite ${this.oreille.limite.toFixed(1)})` : ' — oreille pas encore apprise : toucher l\'écran pour parler'}${this.state === 'conversation' ? ' ; la discussion en cours continue' : ''}`);
    // Une discussion en cours n'est plus coupée (journal du 25/10/26, 08h01) : elle continue, sans regard.
    if (this.vision) { this.vision.stop(); this.vision = null; }
    if (this.paused) this._resume();
    document.body.classList.add('car'); $('car').hidden = false; $('subtitle').hidden = false; $('subtitle').textContent = ''; $('badge').hidden = true;
    this._carHint(); this.oreille.reset();
    if (this.state === 'dodo') this.setState('veille');
    this.face.setMood('neutre'); this.face.setBrightness(0.45);
    this.crm.prefetch();
  }
  exitCar(why) {
    if (!this.car) return;
    // Quitté à la main : le GPS ne le remet pas tout seul pendant 20 min (on peut rouler comme passager, ou préférer le regard).
    if (why === 'bouton' || why === 'réglages') this._carOffAt = Date.now();
    this.log(`Fin du mode voiture (${why})`); this.car = null; this._gate = null;
    if (this.state === 'conversation' || this.state === 'eveil') this.endConversation('fin du mode voiture');
    document.body.classList.remove('car'); $('car').hidden = true; $('subtitle').hidden = !this.settings.subtitles;
    if (this.settings.camera && !this.vision && this.started) this._startVision();
  }
  _carHint() { $('car-hint').textContent = this.oreille.ready ? 'Dis « Wilson » pour me parler' : 'Touche l\'écran pour me parler — apprends-moi ton nom : Réglages → CRM et voiture'; }

  // L'oreille a reconnu « Wilson » : réveil, avec le début de la phrase.
  _onName(d) {
    if (!this.car || this.state !== 'veille' || this.settingsOpen) return;
    this.log(`Entendu « Wilson » (oreille : écart ${d.score.toFixed(1)}, limite ${d.limite.toFixed(1)})`);
    this.face.play('wake');
    this.startConversation('prenom');
  }
  // Chaque phrase entendue en voiture : son écart avec les empreintes (pour régler l'oreille d'après le journal).
  _oreilleLog(r) {
    if (!this.car || r.score === Infinity) return;
    this.log(`Oreille : phrase de ${r.duree.toFixed(1)} s, écart ${r.score.toFixed(1)} (limite ${this.oreille.limite.toFixed(1)})${r.oui ? ' → réveil' : r.score < this.oreille.presque ? ' → presque' : ''}`);
  }
  // Presque reconnu (bruit, voix fatiguée…) : second avis de Gemini Flash-Lite sur la phrase, 20 fois par heure au plus.
  async _secondAvis(d) {
    if (!this.car || this.state !== 'veille' || !navigator.onLine || !this.settings.apiKey) return;
    const now = Date.now(); this._avis = (this._avis || []).filter((t) => now - t < 3600000);
    if (this._avis.length >= 20) return;
    this._avis.push(now);
    const pcm = this.audio.recent(Math.min(5000, (d.duree + 1.2) * 1000));
    try {
      const oui = await this.eco.nomDit({ key: this.settings.apiKey, audio: pcm });
      this.log(`Oreille : presque (écart ${d.score.toFixed(1)}, limite ${d.limite.toFixed(1)}) → avis de Gemini : ${oui ? 'oui, mon nom' : 'non'}`);
      if (oui && this.car && this.state === 'veille') { this._wakePcm = pcm; this.face.play('wake'); this.startConversation('prenom'); }
    } catch (e) { this.log('Second avis impossible : ' + e.message); }
  }
  // Le nom est vérifié : la réponse retenue est jouée.
  _gateOpen(why) {
    const G = this._gate; if (!G || G.ok) return;
    G.ok = true; this.log(`Nom vérifié (${why})`);
    const buf = G.buf; G.buf = []; this._gate = null;
    for (const [i16, rate] of buf) this._liveAudio(i16, rate);
  }
  // En roulant (téléphone, GPS) : mode voiture tout seul ; garé depuis 4 min : fin (C5).
  _watchSpeed() {
    const want = !!this.settings.voitureAuto && deviceName() === 'téléphone' && !!navigator.geolocation;
    if (!want) { if (this._geo != null) { navigator.geolocation.clearWatch(this._geo); this._geo = null; } return; }
    if (this._geo != null) return;
    let fast = 0, fastSince = 0, slowSince = 0, prev = null;
    const dist = (a, b) => { const R = 6371000, r = Math.PI / 180, x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r; return Math.hypot(x, y) * R; };
    this._geo = navigator.geolocation.watchPosition((p) => {
      const c = p.coords, here = { t: p.timestamp, lat: c.latitude, lon: c.longitude, acc: c.accuracy || 999 };
      let v = c.speed;
      // Vitesse donnée par le GPS ; à défaut, calculée entre deux positions PRÉCISES et nettement éloignées
      // (à l'intérieur, la position saute de dizaines de mètres : fausse vitesse, journal du 25/10/26).
      if (v == null || isNaN(v)) {
        v = null;
        if (prev && here.t - prev.t >= 2000) {
          const d = dist(prev, here), err = here.acc + prev.acc;
          if (here.acc <= 25 && prev.acc <= 25) v = d > 2 * err ? d / ((here.t - prev.t) / 1000) : 0;
          else if (d <= err) v = 0;                 // imprécis mais immobile : sert seulement à voir qu'on est garé
        }
      }
      // Garder l'ancienne position 2 s (les positions arrivent chaque seconde), sauf pour une plus précise.
      if (!prev || here.t - prev.t >= 2000 || (prev.acc > 25 && here.acc <= 25)) prev = here;
      if (v == null) return;                        // pas de mesure fiable : rien ne change
      this.speed = v;
      const libre = !this._carOffAt || Date.now() - this._carOffAt > 20 * 60000;
      if (v != null && v >= 6) {
        fast++; fastSince = fastSince || Date.now(); slowSince = 0;
        if (fast >= 3 && Date.now() - fastSince >= 8000 && !this.car && libre) this.enterCar('en roulant');
      }
      else {
        fast = 0; fastSince = 0;
        if (v != null && v < 1.5) {
          slowSince = slowSince || Date.now();
          if (this.car && this.car.why === 'en roulant' && Date.now() - slowSince > 4 * 60000 && this.state !== 'conversation') this.exitCar('garé depuis 4 min');
        } else slowSince = 0;
      }
    }, (e) => { if (!this._geoErr) this.log('GPS (mode voiture automatique) : ' + e.message); this._geoErr = e.message; },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  }

  // ---------- CRM à la voix (PLAN 2 quater) ----------
  _extraTools() { return [...(this.crm.on ? CRM_TOOLS : []), ...(this.maison.on ? [MAISON_TOOL] : [])]; }

  // Ce que Timothée dit, horodaté, avec le numéro du tour : le verrou n'accepte qu'un « oui » d'un tour APRÈS la relecture (C2).
  _noteHeard(text, whole = false) {
    const now = performance.now(), h = this._heard, last = h[h.length - 1];
    if (!whole && last && last.n === this._turnN) { last.text = text; last.t = now; }
    else h.push({ t: now, text: String(text || ''), n: whole ? -1 : this._turnN });
    if (h.length > 30) h.splice(0, h.length - 30);
  }

  // Résultat d'un outil du CRM : info (texte pour Gemini) et, pour le mode économique, dire (phrase toute prête).
  async _crmRun(name, a, signal, { heard } = {}) {
    const C = this.crm, car = !!this.car;
    if (!C.on) return { info: "Le CRM n'est pas relié à Wilson sur cet appareil (Réglages → CRM). Dis-le simplement.", dire: "Le CRM n'est pas relié sur cet appareil." };
    const lu = (r) => (r.ok ? { info: pourGemini(r.texte, car) } : { info: `Le CRM ne répond pas : ${r.erreur || 'erreur'}. Dis-le simplement.`, dire: 'Le CRM ne répond pas pour le moment.' });
    switch (name) {
      case 'crm_client': {
        const r = await C.client({ client: a.client || '' }, signal);
        if (!r.ok) return lu(r);
        if (!r.e) return { info: r.texte };                                         // inconnu, ou plusieurs clients possibles
        const e = r.e, qui = `${e.societe}${e.contact ? ' (' + e.contact + ')' : ''}${e.ville ? ', ' + e.ville : ''}`;
        // C10 : nom entendu approximatif → il cite d'abord le client trouvé ; C8 bis : fiche gardée faute de réseau
        const avant = [r.approx ? `(Nom entendu : « ${a.client} » ; le CRM a trouvé ${qui}. Commence ta réponse par ce nom, pour qu'il puisse te corriger si ce n'est pas le bon client.)` : '',
          r.vieux ? `(Pas de réseau vers le CRM : fiche telle qu'elle était à ${new Date(r.vieux).getHours()}h${pad(new Date(r.vieux).getMinutes())} ; dis-le s'il demande un chiffre récent.)` : ''].filter(Boolean).join('\n');
        return { info: pourGemini((avant ? avant + '\n' : '') + e.texte, car) };
      }
      case 'crm_agenda': return lu(await C.agenda(a.jour, signal));
      case 'crm_bilan': return lu(await C.bilan(signal));
      case 'crm_produit': return lu(await C.produit(a.produit || '', a.question, signal));
      case 'crm_question': {                                                          // C11 : toutes les autres questions
        const q = String(a.demande || (/^(qui_achete|infos)$/.test(a.question || '') ? '' : a.question) || '').trim();
        if (!q) return { info: 'Il manque la question : demande-lui ce qu\'il veut savoir.', dire: 'Qu\'est-ce que tu veux savoir exactement ?' };
        const last = C.last ? `Dernier client dont vous avez parlé : ${C.last.societe}${C.last.contact ? ' (' + C.last.contact + ')' : ''}.` : '';
        let r;
        try {
          r = await C.analyste.repondre({ key: this.settings.apiKey, question: q, contexte: last, voiture: car, signal,
            onEtape: (n, pourquoi, rq) => this.log(`Analyste, étape ${n} : ${pourquoi || 'recherche'} (${rq.map((x) => x.table).join(', ')})`, true) });
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          this.log('Analyste impossible : ' + e.message);
          return { echec: true, info: e.crm ? `Impossible de chercher : ${e.message}. Dis-le simplement.` : `La recherche n'a pas abouti (${shorten(e.message)}). Dis-le simplement et propose de réessayer.`,
            dire: e.crm ? 'Le CRM n\'a pas encore le moteur de questions.' : 'Je n\'ai pas réussi à finir la recherche.' };
        }
        this.log(`Analyste : réponse en ${Math.round(r.ms / 1000)} s, ${r.etapes} étape(s), ${r.recherches} recherche(s) (${r.model}) : ${r.reponse.slice(0, 160)}`, true);
        return { info: `Réponse de l'analyste du CRM (après ${r.recherches} recherche(s) dans ses données) : ${r.reponse}\nDis-la-lui à l'oral, sans rien ajouter ni inventer${car ? ', en une ou deux phrases très courtes' : ''}.`, dire: r.reponse };
      }
      case 'itineraire': {                                                            // C12
        const r = await C.routeTarget(a, signal);
        if (r.ok) this.showRoute(r.target);
        return { info: r.dire, dire: r.ok ? `J'affiche l'itinéraire vers ${r.target.societe} : appuie sur le bouton bleu.` : null };
      }
      case 'appeler': {
        const r = await C.callTarget(a, signal);
        if (r.ok) this.showCall(r.target);
        return { info: r.dire, dire: r.ok ? `J'affiche le numéro de ${r.target.nom} : appuie sur le bouton vert.` : null };
      }
      case 'crm_noter': {
        const r = await C.prepare(a, signal);
        return { info: r.dire, dire: r.ok ? `${r.pending.relu} Je l'enregistre ?` : null };
      }
      case 'crm_confirmer': {
        let g = C.gate(heard || this._heard, { turn: this._turnN });
        // transcription de son « oui » encore en route : on l'attend un peu (2 s au plus)
        for (let i = 0; !g.ok && !heard && /pas de réponse/.test(g.why) && i < 8; i++) { await sleep(250); g = C.gate(this._heard); }
        if (!g.ok) {
          this.log(`Écriture REFUSÉE par le verrou : ${g.why}`);
          const p = C.pending;
          return { info: `NON ENREGISTRÉ (${g.why}). ${p ? 'Relis-lui la phrase préparée et attends son « oui ».' : 'Rappelle crm_noter.'}`, dire: p ? `${p.relu} Je l'enregistre ?` : "Il n'y a rien à enregistrer." };
        }
        const r = await C.commit(signal);
        return { info: r.dire, dire: r.phrase || null };
      }
    }
    return { info: 'outil inconnu' };
  }

  // Écriture gardée faute de réseau, envoyée au retour du réseau (C8 bis) : Wilson le dit.
  _crmQueued(q, ok, err) {
    const t = (q.payload && q.payload.texte) || '';
    const phrase = ok ? `C'est enregistré dans le CRM${t ? ' : « ' + t + ' »' : ''}.` : `Je n'ai pas pu enregistrer ce que j'avais gardé${t ? ', « ' + t + ' »' : ''} : vérifie dans Mes tâches.`;
    this.badge(ok ? 'Enregistré dans le CRM (après la coupure) ✓' : 'Écriture gardée pas enregistrée : vérifie dans Mes tâches', 8000, !ok);
    if (this.state === 'conversation' && this.mode === 'live' && this.brain.open)
      this.brain.sendText(`[Le réseau est revenu : ${ok ? `ce que tu avais gardé est maintenant enregistré dans le CRM (« ${q.relu} »)` : `ce que tu avais gardé (« ${q.relu} ») n'a pas pu être enregistré (${err || 'erreur'}) : dis-lui de vérifier dans Mes tâches`}. Dis-le en une phrase courte.]`);
    else if (this.state === 'conversation' || this.car) this._say(phrase);
  }

  // Outil du CRM en mode direct : Wilson a dit « je regarde dans le CRM », il répond quand le CRM a répondu (filet : 40 s).
  // La maison (PLAN 7 bis) : la demande part à Home Assistant, sa réponse revient à Gemini qui la dit.
  async _maisonTool(call, demande) {
    const conv = this.convId, ctl = new AbortController(), t0 = performance.now();
    this._searches = this._searches || new Map(); this._searches.set(call.id, ctl);
    let res;
    try { res = await this.maison.dire(demande, ctl.signal); }
    catch (e) { if (!this._searches.has(call.id)) return; res = { ok: false, dire: 'Home Assistant ne répond pas.' }; }
    if (conv !== this.convId || !this._searches.has(call.id)) return;
    this._searches.delete(call.id); this._noteToolMs(performance.now() - t0);
    if (res.ok) this.face.play('nod');
    const liste = res.appareils ? ` Appareils de la maison et leur état : ${res.appareils}. Si l'un correspond à sa demande, rappelle tout de suite maison avec ce nom exact sans lui redemander ; si c'était une question d'état, réponds avec cette liste.` : '';
    this.brain.respond([{ id: call.id, name: call.name, response: { result: `${res.ok ? 'Fait' : 'Échec'} — Home Assistant : « ${res.dire} ».${liste} ${res.ok ? 'Dis-le en quelques mots.' : ''}`.trim() } }]);
  }

  async _crmTool(call) {
    if (call.name === 'crm_question') return this._analyse(call);
    const conv = this.convId, ctl = new AbortController(), t0 = performance.now();
    this._searches = this._searches || new Map(); this._searches.set(call.id, ctl);
    if (['crm_client', 'crm_agenda', 'crm_bilan', 'crm_produit'].includes(call.name)) this.face.setEmotion('reflexion', CRM_MAX_MS + 2000, 0.6);
    this.log(`CRM (direct) : ${call.name} ${JSON.stringify(call.args || {}).slice(0, 160)}`, true);
    const timer = setTimeout(() => ctl.abort(), CRM_MAX_MS);
    let res;
    try { res = await this._crmRun(call.name, call.args || {}, ctl.signal); }
    catch (e) {
      if (!this._searches.has(call.id)) return;                                  // annulé (on l'a coupé)
      res = { info: e.name === 'AbortError' ? 'Le CRM a mis trop de temps à répondre (réseau faible ?). Dis-le simplement et propose de réessayer.'
        : isNetErr(e) ? 'Pas de réseau vers le CRM pour l\'instant. Dis-le simplement et propose de réessayer dans un moment.' : `Le CRM ne répond pas (${e.message}). Dis-le simplement.` };
      this.log(`CRM impossible (${((performance.now() - t0) / 1000).toFixed(1)} s) : ${e.name === 'AbortError' ? 'trop long' : e.message}`);
    } finally { clearTimeout(timer); }
    if (conv !== this.convId || !this._searches.has(call.id)) return;
    this._searches.delete(call.id); this._noteToolMs(performance.now() - t0);
    this.face.clearEmotion();
    this.brain.respond([{ id: call.id, name: call.name, response: { result: res.info } }]);
    const n = this._modelOut;
    setTimeout(() => {
      if (conv !== this.convId || this._modelOut !== n || !this.brain.open || this.audio.playing) return;
      this.log('Pas de réponse 6 s après le CRM : relance');
      this.brain.sendText('[Réponds maintenant à voix haute, en français, à partir de la réponse du CRM.]');
    }, 6000);
  }

  // Question libre (C11) : l'analyste cherche aussi longtemps qu'il faut (10 min au plus), tête qui réfléchit pendant ce temps.
  // Elle n'est pas arrêtée par la fin de la discussion : la réponse arrive quand même (C11 bis).
  async _analyse(call) {
    const a = call.args || {};
    const A = { id: call.id, question: String(a.question || a.demande || '').trim(), t0: performance.now(), conv: this.convId, gen: this._liveGen || 0, ctl: new AbortController(), cancelled: false };
    this._analyses = this._analyses || new Map(); this._analyses.set(call.id, A);
    this.face.setEmotion('reflexion', ANALYSE_MAX_MS, 0.7);
    this.log(`Question au CRM (analyste) : « ${A.question.slice(0, 160)} »`, true);
    const timer = setTimeout(() => A.ctl.abort(), ANALYSE_MAX_MS + 5000);
    let res;
    try { res = await this._crmRun('crm_question', a, A.ctl.signal); }
    catch (e) { res = { echec: true, info: 'La recherche a pris trop de temps. Dis-le simplement.', dire: 'La recherche a pris trop de temps, je n\'ai pas de réponse.' }; this.log('Analyste : abandon (' + e.message + ')'); }
    finally { clearTimeout(timer); this._analyses.delete(call.id); }
    if (!this._analyses.size && this.face.emotion === 'reflexion') this.face.clearEmotion();
    this._livrer(A, res);
  }
  // La réponse : dans la même discussion, comme résultat de l'outil ; sinon il la dit dès que possible (C11 bis). Toujours à l'écran.
  _livrer(A, res) {
    const s = Math.round((performance.now() - A.t0) / 1000);
    if (!res.echec && res.dire) this.showAnswer(A.question, res.dire);
    const meme = !A.cancelled && A.conv === this.convId && this.state === 'conversation' && this.mode === 'live' && this.brain.open && A.gen === (this._liveGen || 0);
    if (meme) {
      this.brain.respond([{ id: A.id, name: 'crm_question', response: { result: res.info } }]);
      const n = this._modelOut, conv = this.convId;
      setTimeout(() => {
        if (conv !== this.convId || this._modelOut !== n || !this.brain.open || this.audio.playing) return;
        this.log('Pas de réponse 6 s après l\'analyste : relance');
        this.brain.sendText('[Donne maintenant à voix haute la réponse de l\'analyste du CRM.]');
      }, 6000);
      return;
    }
    this._lateAnswer(A, res, s);
  }
  _lateAnswer(A, res, s, n = 0) {
    const again = (ms) => { if (n < 400) setTimeout(() => this._lateAnswer(A, res, s, n + 1), ms); };
    if (this.phone || this.state === 'eveil' || this.netWait) return again(3000);           // pendant un appel ou une reconnexion : après
    const dire = res.dire || res.info;
    this.log(`Réponse à « ${A.question.slice(0, 80)} » arrivée après ${s} s${this.state === 'conversation' ? '' : ' : je me réveille pour la dire'}`, true);
    this._lateText = `[La recherche dans le CRM que tu avais lancée pour la question « ${A.question} » est terminée (${s} s). Résultat : ${dire} Dis-la-lui maintenant, en commençant par « J'ai la réponse à ta question sur … » (quelques mots du sujet).]`;
    this._lateSay = `J'ai la réponse à ta question. ${dire}`;
    if (this.state === 'conversation' && this.mode === 'live' && this.brain.open) { this.brain.sendText(this._lateText); return; }
    if (this.state === 'conversation') { this._say(this._lateSay); return; }
    this.startConversation('reponse_tardive');
  }

  // Cartes à l'écran : bouton d'appel (C4), confirmation d'une écriture (C2), itinéraire (C12), réponse de l'analyste (C11).
  showRoute(t) {
    const el = $('cards');
    el.innerHTML = `<div class="card route" data-kind="route"><div class="card-t">Itinéraire</div><div class="card-n">${esc(t.societe)}</div><div class="card-s">${esc(t.adresse)}</div>`
      + `<div class="card-b"><a class="card-go route" href="${esc(t.maps)}" target="_blank" rel="noopener">Y aller</a><a class="card-go waze" href="${esc(t.waze)}" target="_blank" rel="noopener">Waze</a><button class="card-x" type="button">Fermer</button></div></div>`;
    el.hidden = false;
    el.querySelectorAll('.card-go').forEach((x) => x.addEventListener('click', () => this._goRoute(t)));
    el.querySelector('.card-x').addEventListener('click', () => this.hideCard());
    clearTimeout(this._cardT); this._cardT = setTimeout(() => this.hideCard('route'), 120000);
    this.log(`Bouton d'itinéraire affiché : ${t.societe}`, true);
  }
  _goRoute(t) {
    this.log(`GPS ouvert vers ${t.societe}`, true);
    this.hideCard('route');
    setTimeout(() => { if (this.state === 'conversation' || this.state === 'eveil') this.endConversation('itinéraire'); }, 400);
  }
  showAnswer(q, texte) {
    const el = $('cards'), c = el.firstElementChild;
    if (c && c.dataset.kind !== 'answer') return;                        // un bouton d'appel ou une confirmation reste à l'écran
    el.innerHTML = `<div class="card answer" data-kind="answer"><div class="card-t">Réponse du CRM</div><div class="card-q">${esc(q)}</div><div class="card-r">${esc(texte)}</div>`
      + `<div class="card-b"><button class="card-x" type="button">Fermer</button></div></div>`;
    el.hidden = false;
    el.querySelector('.card-x').addEventListener('click', () => this.hideCard());
    clearTimeout(this._cardT); this._cardT = setTimeout(() => this.hideCard('answer'), 5 * 60000);
  }
  // Cartes à l'écran : bouton d'appel (C4), confirmation d'une écriture (C2).
  showCall(t) {
    const el = $('cards');
    el.innerHTML = `<div class="card call" data-kind="call"><div class="card-t">Appeler</div><div class="card-n">${esc(t.nom)}</div><div class="card-s">${esc(t.societe)} · ${esc(t.aff)}</div>`
      + `<div class="card-b"><a class="card-go" href="tel:${esc(t.tel)}">Appeler</a><button class="card-x" type="button">Fermer</button></div></div>`;
    el.hidden = false;
    el.querySelector('.card-go').addEventListener('click', () => this._calling(t));
    el.querySelector('.card-x').addEventListener('click', () => this.hideCard());
    clearTimeout(this._cardT); this._cardT = setTimeout(() => this.hideCard('call'), 120000);
    this.log(`Bouton d'appel affiché : ${t.nom} (${t.societe})`, true);
  }
  showConfirm(p) {
    const el = $('cards');
    el.innerHTML = `<div class="card confirm" data-kind="confirm"><div class="card-t">À enregistrer dans le CRM ?</div><div class="card-r">${esc(p.relu)}</div>`
      + `<div class="card-b"><button class="card-ok" type="button">Oui, enregistre</button><button class="card-x" type="button">Non</button></div></div>`;
    el.hidden = false;
    el.querySelector('.card-ok').addEventListener('click', () => this._confirmTap());
    el.querySelector('.card-x').addEventListener('click', () => this._refuseTap());
    clearTimeout(this._cardT); this._cardT = setTimeout(() => this.hideCard('confirm'), 5 * 60000);
  }
  hideCard(kind) {
    const el = $('cards'), c = el.firstElementChild;
    if (!c || (kind && c.dataset.kind !== kind)) return;
    el.innerHTML = ''; el.hidden = true;
  }
  async _confirmTap() {
    if (!this.crm.gate(null, { tapped: true }).ok) { this.hideCard('confirm'); return; }
    this.log('Écriture confirmée en touchant « Oui » à l\'écran');
    let r;
    try { r = await this.crm.commit(); } catch (e) { r = { dire: `Le CRM ne répond pas (${e.message}) : rien n'est écrit, dis-le simplement.`, phrase: 'Le CRM ne répond pas : rien n\'est écrit.' }; }
    if (this.state === 'conversation' && this.mode === 'live' && this.brain.open) this.brain.sendText(`[Timothée a confirmé en touchant « Oui » sur l'écran. ${r.dire}]`);
    else if (r.phrase) this._say(r.phrase);
  }
  _refuseTap() {
    this.crm.pending = null; this.hideCard('confirm'); this.log('Écriture annulée à l\'écran');
    if (this.state === 'conversation' && this.mode === 'live' && this.brain.open) this.brain.sendText('[Timothée a touché « Non » : rien n\'est enregistré. Demande-lui en une phrase ce qu\'il faut changer.]');
  }
  // Appel lancé : Wilson se tait ; au retour, il propose le compte rendu de l'appel.
  _calling(t) {
    this.log(`Appel lancé vers ${t.nom} (${t.societe})`, true);
    this._callAfter = { ...t, at: Date.now() };
    this.hideCard('call');
    setTimeout(() => { if (this.state === 'conversation' || this.state === 'eveil') this.endConversation('appel'); }, 400);
  }
  _backFromCall() {
    const c = this._callAfter; if (!c) return;
    const dt = Date.now() - c.at;
    if (dt < 8000) return;                       // l'appel n'est pas encore parti (ou annulé tout de suite)
    this._callAfter = null;
    if (dt > 2 * 3600000 || !this.crm.on) return;
    this._lastCall = c;
    this.log(`Retour d'appel après ${Math.round(dt / 1000)} s : je propose le compte rendu`);
    setTimeout(() => { if (this.state === 'veille' || this.state === 'dodo') this.startConversation('apres_appel'); }, 1200);
  }
  _apresAppelTexte() {
    const c = this._lastCall || {};
    return `[Timothée vient de raccrocher avec ${c.nom || 'un client'}${c.societe ? ' (' + c.societe + ')' : ''}. Demande-lui en une phrase s'il veut te dicter le compte rendu de l'appel ; s'il le fait, prépare-le comme compte rendu d'appel.]`;
  }

  // ---------- appel reçu pendant une discussion (C9) ----------
  // Le téléphone prend le micro : Wilson se tait, la discussion est mise de côté (son fil est gardé), aucun « oui » ne peut
  // confirmer une écriture pendant l'appel. Micro rendu : Wilson reprend la discussion.
  _phoneStart(why) {
    if (deviceName() !== 'téléphone') { this.log(`Micro : ${why} (pas un téléphone : rien de changé)`); return; }
    if (this.phone) return;
    const conv = this.state === 'conversation' || this.state === 'eveil';
    this.phone = { at: Date.now(), why, conv, handle: conv && this.mode === 'live' ? this.brain.handle : null, net: !!this.netWait };
    this.log(`Micro pris par le téléphone (${why}) : appel en cours ? Je me tais${conv ? ', discussion mise de côté' : ''}`);
    this.discard = true; if (this.audio.playing) this.audio.flush(); this.voice.cancel();
    if (this.crm.pending) this.crm.pending.call = true;
    if (conv) this.endConversation('appel téléphonique');
    if (this.netWait) { clearTimeout(this.netWait.timer); this.netWait = null; }
    this.badge('Appel en cours : je me tais', 8000);
  }
  _phoneEnd(why) {
    const P = this.phone; if (!P) return;
    this.phone = null;
    const s = (Date.now() - P.at) / 1000, p = this.crm.pending;
    this.log(`Micro rendu (${why}) après ${Math.round(s)} s${s >= 8 ? ' : fin de l\'appel' : ''}`);
    // une écriture en attente doit être relue de nouveau : aucun « oui » d'avant (ou de pendant) l'appel ne compte
    if (p && p.call) { p.call = false; p.at = performance.now(); p.atMs = Date.now(); p.turn = this._turnN; }
    if (this._callAfter) { this._backFromCall(); return; }            // appel lancé par Wilson : il propose le compte rendu
    if (!P.conv || s > 2 * 3600) return;
    this._afterCall = { s, pending: !!p };
    this.startConversation(s >= 8 ? 'apres_appel_entrant' : 'reprise', { handle: P.handle });
  }
  _apresAppelEntrantTexte() {
    const A = this._afterCall || {}, p = this.crm.pending;
    return `[Votre discussion a été coupée ${A.s >= 90 ? Math.round(A.s / 60) + ' min' : Math.round(A.s || 0) + ' s'} : le téléphone a pris le micro, sans doute pour un appel, et c'est fini. Dis en une phrase très courte que tu es là et propose de reprendre là où vous en étiez (rappelle le sujet en quelques mots)${this.crm.on ? ' ; si c\'était l\'appel d\'un client, propose aussi de noter un compte rendu' : ''}.${p ? ` Une écriture attendait sa confirmation : relis-la (« ${p.relu} ») et redemande « Je l'enregistre ? » ; seul un nouveau « oui » compte.` : ''}]`;
  }

  // Photo nette, prise à la demande (R6) : plus grande et plus nette que les anciennes images automatiques.
  _photo() {
    if (!this.vision) return null;
    const img = this.vision.snapshot(0.85, 1024);
    if (img) { this._imgN = (this._imgN || 0) + 1; this._photos = (this._photos || 0) + 1; }
    return img;
  }

  // ---------- capteurs ----------
  _wireSensors() {
    const s = this.sensors;
    $('wake').addEventListener('pointerup', () => this.start(true));
    $('car-btn').hidden = deviceName() !== 'téléphone';
    $('car-btn').addEventListener('click', () => { if (this.car) this.exitCar('bouton'); else this.enterCar('bouton'); });
    $('car-exit').addEventListener('click', () => this.exitCar('bouton'));
    s.on('tap', () => {
      if (!this.started) { this.boot(); return; }
      this.voice.warm();
      if (!this.audio.running) { this.audio.resume(); this._hideWake(); return; }
      if (this.speaking) { this.interrupt('toucher'); return; }
      if (this.state === 'veille' || this.state === 'dodo') { this.face.setEmotion('surprise', 900); this.startConversation('toucher'); return; }
      this.face.setEmotion('rire', 1600);
    });
    s.on('doubletap', () => { this.face.doWink(1); this.face.setEmotion('joie', 1800); });
    s.on('longpress', () => this.ui.open());
    s.on('shake', () => {
      // Un téléphone bouge tout le temps (dans la main, en voiture) : plus de « Oulà, ça a bougé ! » (journal du 25/10/26).
      if (this.car || deviceName() === 'téléphone') return;
      this.face.setEmotion('peur', 2500);
      if (this.state === 'conversation' && this.mode === 'live' && this.brain.open) this.brain.sendText('[La tablette vient d\'être secouée ou déplacée.]');
    });
    s.on('battery', (b) => {
      const was = this.battery; this.battery = b;
      if (was && was.charging && !b.charging) { this.face.setEmotion('triste', 4000); this.badge('Je ne suis plus branché', 8000); }
      if (was && !was.charging && b.charging) this.face.setEmotion('joie', 2500);
      if (b.charging) this._batTold = false;
    });
    s.on('network', (on) => {
      this.log(on ? 'Téléphone de nouveau en ligne' : 'Téléphone hors ligne');
      if (!on) {
        this.badge('Plus de réseau', 6000); this.face.setEmotion('confus', 3000);
        if (this.state === 'conversation') this._netLost('hors ligne');      // la discussion attend le réseau (C8)
        return;
      }
      if (this.netWait) this._netSchedule(300);
      this.crm.flushQueue();
      // En voiture, la discussion s'est arrêtée faute de réseau il y a peu : il prévient que c'est revenu.
      if (!this.netWait && this.car && this._netEndedAt && Date.now() - this._netEndedAt < 10 * 60000 && this.state === 'veille') {
        this._netEndedAt = 0; this.audio.tone('revenu'); this._say('Le réseau est revenu.');
      }
    });
  }

  // ---------- boucle ----------
  _tick() {
    const now = performance.now(), f = this.face, v = this.vision;
    // Regard : la personne suivie, sinon il laisse traîner ses yeux.
    f.setLook(v && v.target && this.state !== 'dodo' ? v.target[0] : null, v && v.target ? v.target[1] : 0);
    // Retour visuel : quand on le regarde, ses yeux s'ouvrent grand et l'écran s'éclaire → « je t'écoute ».
    if (v && (this.state === 'veille' || this.state === 'dodo')) {
      const look = !!(v.looking && v.gazeReady && (this.settings.listenMode || 'regard') === 'regard');
      if (look !== this._lookShown) {
        if (look && this.state === 'dodo') this.setState('veille');
        this._lookShown = look;
        if (look) {
          f.setMood('attentif'); f.setBrightness(1); f.setFps(60); v.setRate(10); this.presenceAt = now;
          // On le regarde : on prépare la connexion à Google et la voix de la tablette (au plus une fois par minute).
          if (!this._warmAt || now - this._warmAt > 60000) { this._warmAt = now; warmUp(this.settings.apiKey); this.voice.warm(true); }
        } else { f.setMood(v.hasPerson ? 'neutre' : 'somnolent'); f.setBrightness(v.hasPerson ? 0.45 : 0.3); f.setFps(40); v.setRate(v.hasPerson ? 8 : 4); }
      }
    }
    if (v && v.modelsDone && !this._gazeAnnounced && this.started) {
      this._gazeAnnounced = true;
      this.log(`Vision (en arrière-plan) : ${v.mode}, regard ${v.gazeReady ? 'prêt (' + (v.delegate === 'GPU' ? 'carte graphique' : 'processeur') + ')' : 'indisponible'}${v.errors.length ? ' — ' + v.errors.join(' · ') : ''}`);
      if (v.gazeReady) this.badge('Regarde-moi et parle-moi : je t\'écoute', 5000);
      else this.badge('Je ne vois pas bien les visages : touche-moi pour me parler', 10000, true);
    }
    // Question au CRM en cours (C11) : tête qui réfléchit tant qu'il cherche (sauf quand il parle)
    if (this._analyses && this._analyses.size && !this.speaking && f.emotion !== 'reflexion') f.setEmotion('reflexion', 60000, 0.7);
    // Lèvres
    if (this.audio.playing) { const [l, r] = this.audio.outputLevels(); f.setTalk(l, r); this._outPeak = Math.max(this._outPeak || 0, l); }
    else if (this.voice.speaking) f.setTalk(this.voice.mouth(now), 0.25);
    if (this.state === 'conversation') {
      const E = this.ecoState, thinking = E && (E.busy || E.cap);
      // une question à l'analyste garde la discussion ouverte 90 s ; au-delà, la réponse viendra de toute façon (C11 bis)
      const searching = !!(this._searches && this._searches.size) || [...(this._analyses || new Map()).values()].some((A) => now - A.t0 < 90000);
      // Images : aucune envoyée d'office (R6) ; seulement à la demande (outil « regarder »).
      const keep = this.car ? CAR_IDLE_MS : this.settings.convTimeout * 1000;
      const idle = now - Math.max(this.lastActivity, this.lastUserSpeech);
      // Réseau qui ne passe plus (le son du micro s'accumule sans partir, 3 s) : même chose qu'une coupure (C8).
      if (this.mode === 'live' && this.brain.open && !this.netWait) {
        const ba = (this.brain.ws && this.brain.ws.bufferedAmount) || 0;
        if (ba > 96000) {
          this._stallSince = this._stallSince || now;
          if (now - this._stallSince > 3000) { this._stallSince = 0; this.log(`Réseau bloqué : ${Math.round(ba / 1000)} ko du micro en attente d'envoi`); this._netLost('réseau trop lent'); }
        } else this._stallSince = 0;
      }
      if (this.netWait) {
        // réseau coupé : la discussion attend (C8), son délai à elle décide
      } else if (this._gazeMode && !this.continuous) {
        // R3 : le regard pilote la discussion. 3 s sans regard (sauf s'il parle ou cherche) → veille ; regardé → reprise.
        const lastSeen = Math.max(v.lookAt || 0, this.playEndAt || 0, this._resumedAt || 0, this._convAt || 0);
        if (this.paused) {
          if (v.looking) this._resume();
          else if (now - this._pausedAt > keep) this.endConversation('plus regardé');
        } else if (!this.speaking && !thinking && !searching && now - lastSeen > LOOK_GRACE_MS) this._pause();
        else if (v.looking && !this.speaking && !thinking && !searching && idle > LOOKED_IDLE_MS) this.endConversation('silence');
      } else {
        if (this.paused) this._resume();
        // Sans détection du regard : la conversation se ferme d'elle-même après un silence.
        // Mode éco : seule une vraie réponse prolonge la conversation (un bruit de fond continu ne la garde plus ouverte).
        const busyEar = this.mode === 'eco' ? false : this.audio.speaking;
        if (!this.continuous && !this.speaking && !busyEar && !thinking && !searching && idle > keep) this.endConversation('silence');
      }
      if (this.continuous && idle > 30000 && f.p.bright.t > 0.5) { f.setBrightness(0.3); f.setMood('somnolent'); }
      if (this.continuous && idle < 1000 && f.p.bright.t < 0.5) { f.setBrightness(1); f.setMood('ecoute'); }
    }
    // Veille → dodo quand la pièce est vide (ou la nuit).
    if (v && v.hasPerson) this.presenceAt = now;
    if (this.state === 'veille' && !this.car) {
      const empty = now - this.presenceAt;
      const dark = v && v.light < 0.05;
      if (empty > 10 * 60000 || (this._isNight() && empty > 2 * 60000) || (dark && empty > 2 * 60000)) this.setState('dodo');
    }
  }
}

function nextPacificMidnight() {
  // Heure actuelle à Los Angeles, puis minuit suivant là-bas, converti en heure locale.
  const now = new Date();
  const la = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const ms = (24 * 3600 - (la.getHours() * 3600 + la.getMinutes() * 60 + la.getSeconds())) * 1000;
  return now.getTime() + ms + 60000;
}

function quotaInfo(msg, what) {
  const m = /retry in ([\d.]+)\s*s/i.exec(msg || ''), now = Date.now();
  // Limite 0 : ce projet n'a pas du tout accès à ce service ; inutile de réessayer chaque jour (on revérifie chaque semaine, ou avec « Vérifier »).
  if (/limit:\s*0\b/i.test(msg || '')) return { until: now + 7 * 24 * 3600000, txt: `Google n'accorde aucun quota gratuit à ce projet pour ${what} (limite 0).` };
  if (m && +m[1] < 3600) return { until: now + Math.ceil(+m[1]) * 1000, txt: `Google me demande de patienter ${Math.ceil(+m[1])} s (limite par minute du compte gratuit).` };
  const until = nextPacificMidnight(), d = new Date(until);
  return { until, txt: `Mon quota gratuit Google pour ${what} est épuisé pour aujourd'hui. Je pourrai reparler à ${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}.` };
}

// Retire les silences du début et de la fin (envoi plus léger, réponse plus rapide). null si rien d'audible.
function trimSilence(i16, floorDb) {
  const W = 320, n = Math.floor(i16.length / W); if (n < 3) return i16;
  const thr = Math.max(-58, floorDb + 8); let first = -1, last = -1;
  for (let k = 0; k < n; k++) {
    let e = 0; for (let j = k * W; j < (k + 1) * W; j++) { const v = i16[j] / 32768; e += v * v; }
    const db = 10 * Math.log10(e / W + 1e-12);
    if (db > thr) { if (first < 0) first = k; last = k; }
  }
  if (first < 0) return null;
  const a = Math.max(0, (first - 15) * W), b = Math.min(i16.length, (last + 13) * W);
  return i16.subarray(a, b);
}

// Retire les marques techniques que Gemini Live met parfois dans sa transcription (« <no speech>{pause} »).
function cleanSpeech(t) {
  t = String(t || '').replace(/<[^>]{0,40}>|\{[^}]{0,40}\}/g, ' ').replace(/\s*\[…\]\s*$/, '').replace(/\s+/g, ' ').trim();
  return /^[\s.…!?,;:-]*$/.test(t) ? '' : t;      // « ... » seul : il n'a rien dit
}
// Une vraie phrase (et pas un bruit transcrit au hasard : « Eh », « Aí. ») : au moins 3 mots, ou une question de 2 mots.
function realPhrase(t) {
  const w = String(t || '').trim().split(/\s+/).filter((x) => /[a-zà-ÿ]{2,}/i.test(x));
  if (/\b(salut|coucou|bonjour|bonsoir|hello|wilson|merci|au revoir|bonne nuit)\b/i.test(t)) return true;   // salutations : on y répond
  return w.length >= 3 || (w.length >= 2 && /\?/.test(t));
}

function shorten(m) { m = (m || 'erreur inconnue').replace(/\s+/g, ' ').trim(); return m.length > 140 ? m.slice(0, 137) + '…' : m; }

// Erreur de réseau (pas de couverture, réseau trop faible) plutôt qu'un refus de Google : on attend le réseau (C8).
function isNetErr(e) {
  if (!navigator.onLine) return true;
  const m = String((e && e.message) || e || '');
  return (e && e.code === 1006) || /code 1006|Délai de connexion|Failed to fetch|NetworkError|Load failed|network|ERR_INTERNET|ERR_NAME|ERR_CONNECTION|ERR_TIMED_OUT|Jeton refusé \(0\)/i.test(m);
}

function concat(list) {
  let n = 0; for (const a of list) n += a.length;
  const out = new Int16Array(n); let o = 0; for (const a of list) { out.set(a, o); o += a.length; }
  return out;
}

const app = new App();
window.wilson = app;
app.boot();
