// Wilson — chef d'orchestre. Une seule machine à états (voir PLAN.md) pilote tous les modules.
//   dodo ⇄ veille → (on le regarde en lui parlant) → conversation → veille
// Écoute au REGARD : une phrase n'est pour Wilson que si on le regarde en la disant (plus de mot-clé).

import { Face } from './face.js';
import { AudioIO } from './audio.js';
import { Brain } from './brain.js';
import { Vision } from './vision.js';
import { Memory } from './memory.js';
import { Sensors } from './sensors.js';
import { loadSettings, SettingsUI } from './settings.js';
import { Voice } from './voice.js';
import { EcoBrain, ecoFormat, sentenceCut, sayable, warmUp } from './eco.js';

const VERSION = '1.7.0';
const PREROLL_MS = 1200;          // R2 : le début de la phrase (avant que le regard soit confirmé) est transmis
const TAIL_MS = 300;              // ne pas renvoyer la fin de sa propre voix
const ECO_SILENCE_MS = 500;       // mode économique : silence qui marque la fin d'une phrase
const ECO_SPEC_MS = 250;          // envoi anticipé : la phrase part dès ce silence, Wilson ne parle qu'à la fin confirmée (PLAN 6 bis)
const ECO_TAIL_MS = 1000;         // après avoir parlé : le son de la tablette finit de sortir après l'annonce « fini »
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d = new Date()) => `${JOURS[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}, ${d.getHours()}h${pad(d.getMinutes())}`;
const $ = (id) => document.getElementById(id);

class App {
  constructor() {
    this.version = VERSION; this.logs = [];
    this.settings = loadSettings();
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

  log(m) { const d = new Date(); this.logs.push(`${pad(d.getHours())}h${pad(d.getMinutes())}:${pad(d.getSeconds())}  ${m}`); if (this.logs.length > 200) this.logs.shift(); console.log('[Wilson]', m); if (this.settingsOpen) this.ui.renderLog(); }
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
      await this.audio.start();
      this.log(`Micro prêt (${this.audio.ctx.sampleRate} Hz)`);
    } catch (e) {
      this.started = false; this.log('Micro refusé : ' + e.message);
      this.face.setEmotion('triste', 6000); this.badge("J'ai besoin du micro pour t'entendre", 8000); this._showWake(); return;
    }
    if (this.settings.camera) await this._startVision();
    this.sensors.startMotion(); this.sensors.startBattery();
    this._wakeLock(); document.addEventListener('visibilitychange', () => { if (!document.hidden) { this._wakeLock(); this.audio.resume(); } });
    if (fromGesture && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    if (!this.audio.running) this._showWake(); else this._hideWake();
    this.voice.warm();
    this._loadQuota();
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
      if (this.state === 'eveil' || this.state === 'conversation' || this.settingsOpen) return setTimeout(go, 15000);
      try { sessionStorage.setItem('wilson.reloadedFor', `${why}|${Date.now()}`); } catch (_) {}
      this.log('Mise à jour : rechargement'); location.reload();
    };
    go();
  }

  _showWake() { $('wake').hidden = false; }
  _hideWake() { $('wake').hidden = true; }
  async _wakeLock() { try { if ('wakeLock' in navigator) { this._wl = await navigator.wakeLock.request('screen'); } } catch (_) {} }

  applySettings(key) {
    const s = this.settings;
    if (s.face !== this.face.styleName) this.face.setStyle(s.face);
    this.eco.setSpeed(s.ecoSpeed);
    if (key === 'apiKey' || key === 'model') {          // nouvelle clé : nouveau quota, on repart de zéro
      this.quotaUntil = 0; this.ecoQuotaUntil = 0; this.brain.authMode = this.brain.modelUsed = this.brain.level = null; this.eco.modelUsed = null; this.log('Clé ou modèle changé');
    }
    if (this.vision) this.vision.mirror = !s.mirror;
    if (key === 'camera') { if (s.camera && !this.vision && this.started) this._startVision(); if (!s.camera && this.vision) { this.vision.stop(); this.vision = null; } }
    $('subtitle').hidden = !s.subtitles;
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
    const pol = this.settings.listenMode || 'regard', v = this.vision;
    if (pol === 'toucher') return false;
    if (pol === 'toujours') return true;
    if (!v || !v.gazeReady) return false;                               // sans détection du regard : toucher pour parler
    if (v.looking || now - v.lookAt < 1500) return true;
    // Pendant une discussion, on peut détourner les yeux un instant (visage toujours là, réponse récente).
    return this.state === 'conversation' && now - (this.lastAnswerAt || 0) < 8000 && now - v.faceAt < 1500;
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

  async startConversation(reason) {
    if (this.state === 'eveil' || this.state === 'conversation') return;
    if (!navigator.onLine) { this.face.setEmotion('confus', 3000); this.badge("Pas d'Internet : je ne peux pas répondre", 5000); return; }
    if (!this.settings.apiKey) { this.ui.showWelcome(); return; }
    // Quel cerveau ? Direct (Gemini Live) si possible, sinon mode économique (Gemini Flash + voix de la tablette).
    const now = Date.now(), want = this.settings.brainMode || 'auto';
    const liveBlocked = this.quotaUntil && now < this.quotaUntil, ecoBlocked = this.ecoQuotaUntil && now < this.ecoQuotaUntil;
    const mode = want === 'eco' ? 'eco' : want === 'live' ? 'live' : (liveBlocked ? 'eco' : 'live');
    if ((mode === 'live' && liveBlocked) || (mode === 'eco' && ecoBlocked)) {         // quota épuisé : on ne gaspille pas d'essais
      this.face.setEmotion('gene', 3000); this.face.play('shake');
      this.badge((mode === 'eco' ? this.ecoQuotaMsg : this.quotaMsg) + ' (appui long sur moi → « Vérifier » pour réessayer)', 9000, true); return;
    }
    this.setState('eveil'); this.convId = (this.convId || 0) + 1;
    if (mode === 'eco') warmUp(this.settings.apiKey);
    const preroll = reason === 'prenom' ? [this.audio.recent(4000)] : reason === 'regard' ? [this.audio.recent(PREROLL_MS)] : [];
    if (mode === 'eco') return this._startEco(reason, preroll);
    this.mode = 'live';
    this.pending = preroll;
    this.discard = false; this.endAfterSpeech = false; this.brain.handle = null;
    this.lastActivity = performance.now();
    try {
      await this.brain.connect({ key: this.settings.apiKey, model: this.settings.model, voice: this.settings.voice, system: this._system() });
    } catch (e) {
      this.log('Gemini : ' + e.message);
      this.lastError = e.message;
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
    this.log(`Conversation ouverte (${reason})`);
    this.setState('conversation');
    // Envoi du tampon (la phrase avec « Wilson ») puis passage au direct.
    const all = this.pending; this.pending = null;
    const flat = concat(all);
    for (let i = 0; i < flat.length; i += 3200) this.brain.sendAudio(flat.subarray(i, i + 3200));
    this._sendFrame(true);
    if (reason === 'test') this.brain.sendText('Présente-toi en une phrase, avec chaleur.');
    if (reason === 'toucher') this.brain.sendText("[Quelqu'un vient de toucher ton visage sur l'écran pour te parler. Salue-le très brièvement et écoute.]");
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
  }

  _ecoFrame(i16) {
    const E = this.ecoState, now = performance.now();
    if (!E) return;
    if (this.voice.speaking) return;                       // il parle : seule la détection de coupure écoute (voir _wireAudio)
    if (now - this.playEndAt < ECO_TAIL_MS) return;        // fin de sa propre voix (écho)
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
    return { audio, endAt: cap.lastVoice, hint, spec, ctl: new AbortController() };
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
    const live = () => !req.spec || req.confirmed;
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
      if (this.settings.subtitles && txt) $('subtitle').textContent = txt.slice(0, 220);
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
      const image = this.vision ? this.vision.snapshot(0.7, 384) : null;
      const out = await this.eco.ask({ key: this.settings.apiKey, system: this._system('eco'), audio: req.audio, image, text: req.text, hint: req.hint, onPartial, signal: req.ctl.signal });
      if (gate) await gate;                                  // envoi anticipé : fin de phrase confirmée (sinon : annulé)
      if (conv !== this.convId) return;
      this.eco.commit(out, req.text);
      out.reponse = sayable(out.reponse);
      let said = out.reponse, last = out, tSearch = 0;
      if (!out.pourMoi || notForMe || repeated || (!out.reponse && !out.chercher)) {
        if (!emoSet) this.face.clearEmotion();
        E.ignored++;
        this.log(`Pas pour moi (${E.ignored}) : « ${out.entendu.slice(0, 80)} » (${ms(performance.now())} s, ${out.model})`);
        if (sess) sess.end();
        // Bruits, télé, conversations entre vous : au 2e d'affilée, Wilson retourne en veille.
        if (E.ignored >= 2 && !sess) { setTimeout(() => conv === this.convId && this.endConversation('pas pour moi'), 200); }
      } else {
        E.ignored = 0; answered = true; this.lastAnswerAt = performance.now();
        if (!sess && out.reponse) speakChunk(out.reponse);          // réponse hors format : on la dit d'un bloc
        this._applyEco(out, emoSet);
        // 2e temps : une info récente est nécessaire → recherche Google pendant que Wilson dit sa phrase d'attente.
        if (out.chercher && !this.eco.noSearch && conv === this.convId) {
          this.log(`Recherche Google : « ${out.chercher} »`);
          tSearch = performance.now(); emoSet = false;
          if (!sess) this.face.setEmotion('reflexion', 30000, 0.6);
          const st2 = { spoken: 0 };
          try {
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
            speakChunk("Je n'arrive pas à chercher ça pour le moment.");
          }
        }
        this.log(`« ${out.entendu.slice(0, 90)} » → ${said.slice(0, 110)}`);
        // Délais mesurés depuis la fin de la phrase (dernier son de voix) : où part le temps.
        const tAll = performance.now();
        timing = () => this.log(`Délais : envoi ${ms(tSend)} s${req.spec ? ' (anticipé)' : ''} · Google ${ms(tNet || tAll)} s · 1re phrase ${ms(tFirst || tAll)} s · voix ${this.voice.startedAt ? ms(this.voice.startedAt) + ' s' : '—'} · complet ${ms(tAll)} s`
          + ` (${out.model}, réflexion ${out.think || 'par défaut'}${out.hedged ? ', relancée' : ''}${tSearch ? `, recherche ${((tAll - tSearch) / 1000).toFixed(1)} s${last.hedged ? ' relancée' : ''}` : ''}, phrase de ${req.audio ? (req.audio.length / 16000).toFixed(1) + ' s' : '—'})`);
        this.memory.addExchange(out.entendu, said);
        this._lastReply = said;
        if (this.settings.subtitles) $('subtitle').textContent = said.slice(0, 220);
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
    for (const f of out.memoriser) { this.memory.add(f); this.log('Retenu : ' + f); }
    if (out.oublier) { const g = this.memory.forget(out.oublier); this.log(`Oublier « ${out.oublier} » : ${g.length}`); }
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
        await this.brain.connect({ key: this.settings.apiKey, model: this.settings.model, voice: this.settings.voice, system: this._system() });
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
    this.log(`Fin de conversation (${why})`); this.convId++; this.endAfterSpeech = false;
    this.brain.close(); this.audio.flush(); this.voice.cancel(); this.outBuf = []; this.outLen = 0;
    if (this.ecoState) this.ecoState.queue = []; this.ecoState = null; this.mode = null;
    this.face.setTalk(0); this.face.setListen(-1); this.face.clearEmotion();
    $('subtitle').textContent = '';
    if (this.continuous && why !== 'mode') { setTimeout(() => this.startConversation('continu'), 1500); }
    this.setState('veille');
  }

  _system(mode = 'live') {
    const s = this.settings, m = this.memory.forPrompt();
    const bat = this.battery && !this.battery.charging ? `\nAttention : la tablette n'est plus branchée (batterie ${Math.round(this.battery.level * 100)} %). Signale-le gentiment.` : '';
    const eco = mode === 'eco' || mode === 'eco-search';
    // Mode économique : la recherche Google se fait en deux temps (PLAN 6 bis), la consigne est dans le format JSON.
    const tools = eco ? ecoFormat({ search: mode === 'eco-search', canSearch: !this.eco.noSearch }) : `Ton visage : appelle exprimer_emotion dès que ton émotion change (joie, rire, surprise, tendresse, réflexion pendant que tu cherches…), avec un geste si ça s'y prête. N'en parle jamais.
Ta mémoire : quand on te confie une information durable (prénoms, goûts, anniversaires, habitudes, rendez-vous, où sont rangées les choses), appelle memoriser avec une phrase courte et autonome, puis confirme en quelques mots. Si on te demande d'oublier, appelle oublier.
La fin : si on te dit au revoir, bonne nuit ou « merci, c'est tout », réponds brièvement puis appelle terminer_conversation.
L'heure et la date : appelle date_et_heure.`;
    return `Tu es Wilson, un compagnon qui vit dans une tablette posée dans le salon d'une famille. Ton visage animé montre tes émotions. Tu vois par la caméra de la tablette et tu entends par son micro.

Personnalité : chaleureux, curieux, drôle avec tendresse, jamais mielleux. Tu tutoies la famille. Tu parles un français naturel, comme à l'oral : une à trois phrases courtes, sauf si on te demande plus. Pas de listes, pas de symboles.

Quand parler :
- On ne t'envoie que ce qui a été dit pendant qu'on te regardait : la personne s'adresse à toi, réponds-lui (pas besoin de ton prénom).
- Pendant une discussion, réponds quand on te parle, même si on détourne un instant les yeux.
- Si les gens parlent entre eux, au téléphone, si c'est la télé, ou si la phrase ne t'est pas destinée : ne dis rien du tout.
- Si on te coupe la parole, arrête-toi et écoute.

Ta vue : si on te montre quelque chose ou si on te demande ce que tu vois, décris et commente l'image la plus récente. Sinon, ne commente pas l'image.
${tools}
${eco ? (s.city ? `La maison est à ${s.city} (utile pour la météo et les horaires).` : '') : `Recherche Google : utilise-la dès qu'une réponse dépend de l'actualité ou d'informations qui changent (météo, actualités, sport, horaires, prix, programmes télé, adresses, personnes connues), quand on te demande de chercher${s.city ? ` ; la maison est à ${s.city}` : ''}. Résume le résultat à l'oral en une à trois phrases, sans lire de liens ni d'adresses web.`}
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
    this.audio.on('frame', (f32, i16, db) => {
      if (this.state === 'veille' || this.state === 'dodo') { this._watchFrame(); return; }
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
      if (this.settings.bargeIn === 'prudente') {
        if (this.audio.playing) { this._bargeCheck(db); return; }      // il parle : on écoute s'il est coupé, sans renvoyer sa voix
        if (now - this.playEndAt < TAIL_MS) return;
      }
      this.outBuf.push(i16); this.outLen += i16.length;
      if (this.outLen >= 1600) { this.brain.sendAudio(concat(this.outBuf)); this.outBuf = []; this.outLen = 0; }
    });
    this.audio.on('speechstart', () => {
      const now = performance.now();
      if (this.state === 'conversation') { if (this.mode === 'live') this.lastUserSpeech = this.lastActivity = now; return; }
      this.presenceAt = now;                                   // quelqu'un parle dans la pièce
      if (this.state === 'dodo' && !this._isNight()) { this.setState('veille'); this.face.play('tilt'); }
    });
    this.audio.on('speechend', () => { if (this.state === 'conversation' && this.mode === 'live') this.lastUserSpeech = this.lastActivity = performance.now(); });
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
    b.on('audio', (i16, rate) => {
      if (this.discard || this.state !== 'conversation') return;
      if (!this.audio.playing) { this.barge.n = 0; this.barge.echo = Math.max(-60, this.audio.db); }
      this.audio.play(i16, rate); this.lastActivity = performance.now();
    });
    b.on('interrupted', () => { this.audio.flush(); this.discard = false; this.face.setTalk(0); });
    b.on('turn', ({ user, wilson }) => {
      this.discard = false;
      if (user || wilson) this.memory.addExchange(user, wilson);
      if (wilson) this.log('Wilson : ' + wilson.slice(0, 120));
      setTimeout(() => { if (!this.audio.playing) $('subtitle').textContent = ''; }, 5000);
    });
    b.on('heard', (t) => { if (this.state === 'conversation') this.lastActivity = performance.now(); });
    b.on('said', (t) => { if (this.settings.subtitles) $('subtitle').textContent = t.slice(-220); });
    b.on('toolcall', (calls) => this._tools(calls));
    b.on('goaway', () => this._reconnect('goAway'));
    b.on('closed', (e) => {
      if (e.expected) return;
      this.log(`Connexion fermée (${e.code}${e.reason ? ' : ' + e.reason : ''})`);
      if (this.state === 'conversation') this._reconnect('coupure');
    });
    b.on('log', (m) => this.log(m));
  }

  async _reconnect(why) {
    if (this._reconnecting) return; this._reconnecting = true;
    this.log(`Reconnexion (${why})`);
    const handle = this.brain.handle;
    this.brain.close(); this.brain.handle = handle;
    try {
      await this.brain.connect({ key: this.settings.apiKey, model: this.settings.model, voice: this.settings.voice, system: this._system(), resume: true });
    } catch (e) { this.log('Reconnexion impossible : ' + e.message); this.endConversation('coupure'); }
    this._reconnecting = false;
  }

  _tools(calls) {
    const res = [];
    for (const c of calls) {
      const a = c.args || {};
      let out = { result: 'ok' }, silent = true;
      switch (c.name) {
        case 'exprimer_emotion': {
          this.face.setEmotion(a.emotion, 6500, a.intensite || 0.9);
          const g = { oui: 'nod', non: 'shake', sautiller: 'bounce', pencher_la_tete: 'tilt' }[a.geste];
          if (g) this.face.play(g); if (a.geste === 'clin_oeil') this.face.doWink(1);
          break;
        }
        case 'memoriser': this.memory.add(a.fait); this.log('Retenu : ' + a.fait); this.face.play('nod'); out = { result: 'mémorisé' }; break;
        case 'oublier': { const g = this.memory.forget(a.sujet || ''); out = { result: g.length ? 'Oublié : ' + g.join(' ; ') : 'Aucun souvenir ne correspond.' }; silent = false; this.log('Oublier « ' + a.sujet + ' » : ' + g.length); break; }
        case 'date_et_heure': out = { result: fmtDate() }; silent = false; break;
        case 'terminer_conversation': { this.endAfterSpeech = true; const id = this.convId; setTimeout(() => { if (id === this.convId && this.endAfterSpeech && !this.audio.playing) this.endConversation('au revoir'); }, 4000); break; }
        default: out = { error: 'outil inconnu' }; silent = false;
      }
      const r = { id: c.id, name: c.name, response: out }; if (silent && this.brain.canSchedule) r.scheduling = 'SILENT';
      res.push(r);
    }
    this.brain.respond(res);
  }

  _sendFrame(force) {
    if (!this.vision || !this.brain.open) return;
    const now = performance.now();
    if (!force && now - this.lastFrame < 1000) return;
    const img = this.vision.snapshot(); if (img) { this.brain.sendImage(img); this.lastFrame = now; }
  }

  // ---------- capteurs ----------
  _wireSensors() {
    const s = this.sensors;
    $('wake').addEventListener('pointerup', () => this.start(true));
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
      this.face.setEmotion('peur', 2500);
      if (this.state === 'conversation' && this.mode === 'live' && this.brain.open) this.brain.sendText('[La tablette vient d\'être secouée ou déplacée.]');
    });
    s.on('battery', (b) => {
      const was = this.battery; this.battery = b;
      if (was && was.charging && !b.charging) { this.face.setEmotion('triste', 4000); this.badge('Je ne suis plus branché', 8000); }
      if (was && !was.charging && b.charging) this.face.setEmotion('joie', 2500);
    });
    s.on('network', (on) => { if (!on) { this.badge('Plus de réseau', 6000); this.face.setEmotion('confus', 3000); if (this.state === 'conversation') this.endConversation('réseau'); } });
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
    // Lèvres
    if (this.audio.playing) { const [l, r] = this.audio.outputLevels(); f.setTalk(l, r); }
    else if (this.voice.speaking) f.setTalk(this.voice.mouth(now), 0.25);
    if (this.state === 'conversation') {
      const E = this.ecoState, thinking = E && (E.busy || E.cap);
      if (this.mode === 'live' && (this.audio.speaking || now - this.lastUserSpeech < 1500)) this._sendFrame(false);
      // R3 : la conversation se ferme d'elle-même après un silence.
      const idle = now - Math.max(this.lastActivity, this.lastUserSpeech);
      // Mode éco : seule une vraie réponse prolonge la conversation (un bruit de fond continu ne la garde plus ouverte).
      const busyEar = this.mode === 'eco' ? false : this.audio.speaking;
      if (!this.continuous && !this.speaking && !busyEar && !thinking && idle > this.settings.convTimeout * 1000) this.endConversation('silence');
      if (this.continuous && idle > 30000 && f.p.bright.t > 0.5) { f.setBrightness(0.3); f.setMood('somnolent'); }
      if (this.continuous && idle < 1000 && f.p.bright.t < 0.5) { f.setBrightness(1); f.setMood('ecoute'); }
    }
    // Veille → dodo quand la pièce est vide (ou la nuit).
    if (v && v.hasPerson) this.presenceAt = now;
    if (this.state === 'veille') {
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

function shorten(m) { m = (m || 'erreur inconnue').replace(/\s+/g, ' ').trim(); return m.length > 140 ? m.slice(0, 137) + '…' : m; }

function concat(list) {
  let n = 0; for (const a of list) n += a.length;
  const out = new Int16Array(n); let o = 0; for (const a of list) { out.set(a, o); o += a.length; }
  return out;
}

const app = new App();
window.wilson = app;
app.boot();
