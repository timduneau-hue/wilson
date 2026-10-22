// Wilson — chef d'orchestre. Une seule machine à états (voir PLAN.md) pilote tous les modules.
//   dodo ⇄ veille → eveil → conversation → veille

import { Face } from './face.js';
import { AudioIO } from './audio.js';
import { Ear } from './ear.js';
import { Brain } from './brain.js';
import { Vision } from './vision.js';
import { Memory } from './memory.js';
import { Sensors } from './sensors.js';
import { loadSettings, SettingsUI } from './settings.js';

const VERSION = '1.0.3';
const MODEL_PARTS = ['model/fr.part1', 'model/fr.part2'];
const PREROLL_MS = 4000;          // R2 : la phrase qui contient « Wilson » est transmise en entier
const TAIL_MS = 300;              // ne pas renvoyer la fin de sa propre voix
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d = new Date()) => `${JOURS[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}, ${d.getHours()}h${pad(d.getMinutes())}`;
const $ = (id) => document.getElementById(id);

class App {
  constructor() {
    this.version = VERSION; this.logs = [];
    this.settings = loadSettings();
    this.face = new Face($('face'));
    this.face.setMood('somnolent'); this.face.setBrightness(0.35);
    this.audio = new AudioIO(); this.ear = new Ear('wilson'); this.brain = new Brain();
    this.memory = new Memory(); this.vision = null; this.sensors = new Sensors($('face'));
    this.ui = new SettingsUI(this);
    this.state = 'demarrage'; this.started = false; this.continuous = false;
    this.pending = []; this.outBuf = []; this.outLen = 0;
    this.lastActivity = 0; this.lastUserSpeech = 0; this.lastFrame = 0; this.playEndAt = 0;
    this.discard = false; this.endAfterSpeech = false; this.barge = { n: 0, echo: -60 };
    this.presenceAt = performance.now(); this.battery = null; this.earTest = false; this.settingsOpen = false;
    this._wireSensors(); this._wireBrain(); this._wireAudio();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch((e) => this.log('SW : ' + e.message));
    setInterval(() => this._tick(), 50);
  }

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
    this.setState('veille');
    this._loadEar();
    this.applySettings();
  }

  async _startVision() {
    try {
      this.vision = new Vision(); this.vision.mirror = !this.settings.mirror;
      this.vision.onPresence = (p) => this._presence(p);
      await this.vision.start(); this.log('Caméra prête');
    } catch (e) { this.vision = null; this.log('Caméra indisponible : ' + e.message); }
  }

  async _loadEar() {
    if (this.ear.ready || this._earLoading) return;
    this._earLoading = true;
    try {
      // Message seulement si le chargement dure (la 1re fois : 46 Mo à télécharger ; ensuite, il vient de la mémoire de la tablette).
      const t0 = performance.now(); let lastPct = -1;
      const slow = () => performance.now() - t0 > 1500;
      this.ear.onProgress = (p) => {
        const pct = Math.min(99, Math.floor(p * 20) * 5);
        if (!slow() || pct === lastPct) return;
        lastPct = pct; this.badge(`Je télécharge mon oreille (1re fois seulement)… ${pct} %`, 60000);
      };
      const prep = () => { if (!this.ear.ready) this.badge('Je prépare mon oreille… encore quelques secondes', 60000); };
      this.ear.onPhase = () => { if (slow()) prep(); else setTimeout(prep, 2500); };
      await this.ear.load(MODEL_PARTS);
      this.log(`Oreille chargée en ${((performance.now() - t0) / 1000).toFixed(1)} s`);
      this.ear.onWake = (w) => this._onWakeWord(w);
      this.ear.onHeard = (t) => { if (this.earTest) this.ui.earHeard(t); };
      this.ear.setSensitivity(this.settings.sensitivity);
      if (this.state === 'veille' || this.state === 'dodo') this.ear.start();
      this.log('Oreille locale prête'); this.badge("Je t'écoute : dis « Wilson » !", 4000);
      this.face.play('wake');
    } catch (e) {
      this.log('Oreille locale indisponible : ' + e.message);
      this.badge("Mon oreille n'a pas chargé — touche-moi pour me parler", 15000, true);
    } finally { this._earLoading = false; }
  }

  _showWake() { $('wake').hidden = false; }
  _hideWake() { $('wake').hidden = true; }
  async _wakeLock() { try { if ('wakeLock' in navigator) { this._wl = await navigator.wakeLock.request('screen'); } } catch (_) {} }

  applySettings(key) {
    const s = this.settings;
    this.ear.setSensitivity(s.sensitivity);
    if (this.vision) this.vision.mirror = !s.mirror;
    if (key === 'camera') { if (s.camera && !this.vision && this.started) this._startVision(); if (!s.camera && this.vision) { this.vision.stream.getTracks().forEach((t) => t.stop()); this.vision = null; } }
    $('subtitle').hidden = !s.subtitles;
    const cont = s.earMode === 'gemini';
    if (cont !== this.continuous) {
      this.continuous = cont;
      if (cont && this.started && this.state !== 'conversation' && this.state !== 'eveil') this.startConversation('continu');
      if (!cont && this.state === 'conversation') this.endConversation('mode');
    }
  }

  // ---------- états ----------
  setState(st) {
    if (this.state === st) return;
    this.log(`État : ${this.state} → ${st}`); this.state = st;
    const f = this.face;
    switch (st) {
      case 'dodo':
        f.clearEmotion(); f.play('yawn'); setTimeout(() => this.state === 'dodo' && f.setMood('dort'), 1800);
        f.setBrightness(0.1); f.setFps(24); f.setListen(-1); this.vision && this.vision.setRate(2);
        this.ear.start(); break;
      case 'veille':
        f.setMood(this.vision && this.vision.hasPerson ? 'neutre' : 'somnolent');
        f.setBrightness(this.vision && this.vision.hasPerson ? 0.45 : 0.3); f.setFps(40); f.setListen(-1);
        this.vision && this.vision.setRate(4); this.ear.start(); break;
      case 'eveil':
        this.ear.pause(); f.setMood('attentif'); f.play('wake'); f.setBrightness(1); f.setFps(60);
        this.vision && this.vision.setRate(8); break;
      case 'conversation':
        f.setMood('ecoute'); f.setBrightness(1); break;
    }
  }

  _presence(p) {
    if (p) {
      this.presenceAt = performance.now();
      if (this.state === 'dodo' && !this._isNight()) { this.setState('veille'); this.face.play('wake'); }
      if (this.state === 'veille') { this.face.setMood('neutre'); this.face.setBrightness(0.45); }
    } else if (this.state === 'veille') { this.face.setMood('somnolent'); this.face.setBrightness(0.3); }
  }
  _isNight() { const h = new Date().getHours(), a = this.settings.nightStart, b = this.settings.nightEnd; return a > b ? (h >= a || h < b) : (h >= a && h < b); }

  // ---------- réveil ----------
  _onWakeWord(w) {
    this.log(`Entendu « Wilson » ${w.conf ? '(confiance ' + w.conf.toFixed(2) + ')' : '(à la volée)'}`);
    if (this.earTest) { this.ui.earWake(); this.face.setEmotion('surprise', 900); return; }
    if (this.settingsOpen) return;
    this.startConversation('prenom');
  }

  async startConversation(reason) {
    if (this.state === 'eveil' || this.state === 'conversation') return;
    if (!navigator.onLine) { this.face.setEmotion('confus', 3000); this.badge("Pas d'Internet : je ne peux pas répondre", 5000); return; }
    if (!this.settings.apiKey) { this.ui.showWelcome(); return; }
    this.setState('eveil'); this.convId = (this.convId || 0) + 1;
    this.pending = reason === 'prenom' ? [this.audio.recent(PREROLL_MS)] : [];
    this.discard = false; this.endAfterSpeech = false; this.brain.handle = null;
    this.lastActivity = performance.now();
    try {
      await this.brain.connect({ key: this.settings.apiKey, model: this.settings.model, voice: this.settings.voice, system: this._system() });
    } catch (e) {
      this.log('Gemini : ' + e.message);
      this.face.setEmotion('confus', 4000);
      this.lastError = e.message;
      this.badge(e.auth ? 'Google refuse ma clé — appui long sur moi, puis « Vérifier la clé »'
        : `Je n'arrive pas à joindre mon cerveau : ${shorten(e.message)}`, 15000, true);
      this.setState('veille'); return;
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

  // Diagnostic : ouvre puis referme une connexion Gemini, sans parler.
  async testConnection() {
    if (this.state === 'eveil' || this.state === 'conversation') return { ok: true, msg: 'Déjà en conversation' };
    try {
      await this.brain.connect({ key: this.settings.apiKey, model: this.settings.model, voice: this.settings.voice, system: this._system() });
      const b = this.brain; this.brain.close();
      return { ok: true, msg: `${b.modelUsed}, ${b.authMode === 'key' ? 'clé' : 'jeton'}, configuration ${['complète', 'simplifiée', 'minimale'][b.level]}` };
    } catch (e) { return { ok: false, auth: !!e.auth, msg: e.message }; }
  }

  endConversation(why) {
    if (this.state !== 'conversation' && this.state !== 'eveil') return;
    this.log(`Fin de conversation (${why})`); this.convId++; this.endAfterSpeech = false;
    this.brain.close(); this.audio.flush(); this.outBuf = []; this.outLen = 0;
    this.face.setTalk(0); this.face.setListen(-1); this.face.clearEmotion();
    $('subtitle').textContent = '';
    if (this.continuous && why !== 'mode') { setTimeout(() => this.startConversation('continu'), 1500); }
    this.setState('veille');
  }

  _system() {
    const s = this.settings, m = this.memory.forPrompt();
    const bat = this.battery && !this.battery.charging ? `\nAttention : la tablette n'est plus branchée (batterie ${Math.round(this.battery.level * 100)} %). Signale-le gentiment.` : '';
    return `Tu es Wilson, un compagnon qui vit dans une tablette posée dans le salon d'une famille. Ton visage animé (deux grands yeux couleur miel, des sourcils, une bouche) montre tes émotions. Tu vois par la caméra de la tablette et tu entends par son micro.

Personnalité : chaleureux, curieux, drôle avec tendresse, jamais mielleux. Tu tutoies la famille. Tu parles un français naturel, comme à l'oral : une à trois phrases courtes, sauf si on te demande plus. Pas de listes, pas de symboles.

Quand parler :
- Au début de la conversation, quelqu'un vient de t'appeler par ton prénom : il s'adresse à toi, réponds-lui.
- Ensuite, la conversation est engagée : réponds quand on te parle, même sans ton prénom.
- Si les gens parlent entre eux, au téléphone, si c'est la télé, ou si la phrase ne t'est pas destinée : ne dis rien du tout.
- Si on te coupe la parole, arrête-toi et écoute.

Ta vue : si on te montre quelque chose ou si on te demande ce que tu vois, décris et commente l'image la plus récente. Sinon, ne commente pas l'image.
Ton visage : appelle exprimer_emotion dès que ton émotion change (joie, rire, surprise, tendresse, réflexion pendant que tu cherches…), avec un geste si ça s'y prête. N'en parle jamais.
Ta mémoire : quand on te confie une information durable (prénoms, goûts, anniversaires, habitudes, rendez-vous, où sont rangées les choses), appelle memoriser avec une phrase courte et autonome, puis confirme en quelques mots. Si on te demande d'oublier, appelle oublier.
La fin : si on te dit au revoir, bonne nuit ou « merci, c'est tout », réponds brièvement puis appelle terminer_conversation.
L'heure et la date : appelle date_et_heure. Les infos du moment (météo, actualité, horaires) : utilise la recherche Google${s.city ? `, la maison est à ${s.city}` : ''}.
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
      if (this.state === 'veille' || this.state === 'dodo') { this.ear.feed(f32); return; }
      if (this.state === 'eveil') { if (this.pending) this.pending.push(i16); return; }
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
      if (this.state === 'conversation') { this.lastUserSpeech = this.lastActivity = now; return; }
      this.presenceAt = now;                                   // quelqu'un parle dans la pièce
      if (this.state === 'dodo' && !this._isNight()) { this.setState('veille'); this.face.play('tilt'); }
    });
    this.audio.on('speechend', () => { if (this.state === 'conversation') this.lastUserSpeech = this.lastActivity = performance.now(); });
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
    if (!this.audio.playing) return;
    this.log(`Coupé (${why})`);
    this.audio.flush(); this.playEndAt = -1e9; this.discard = true; this.face.setTalk(0);
    this.face.setEmotion('ecoute', 2500); this.face.play('startle');
    // Le début de la phrase de la personne part tout de suite à Gemini.
    if (this.brain.open) this.brain.sendAudio(this.audio.recent(700));
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
      if (!this.audio.running) { this.audio.resume(); this._hideWake(); return; }
      if (this.audio.playing) { this.interrupt('toucher'); return; }
      if (this.state === 'veille' || this.state === 'dodo') { this.face.setEmotion('surprise', 900); this.startConversation('toucher'); return; }
      this.face.setEmotion('rire', 1600);
    });
    s.on('doubletap', () => { this.face.doWink(1); this.face.setEmotion('joie', 1800); });
    s.on('longpress', () => this.ui.open());
    s.on('shake', () => {
      this.face.setEmotion('peur', 2500);
      if (this.state === 'conversation' && this.brain.open) this.brain.sendText('[La tablette vient d\'être secouée ou déplacée.]');
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
    // Lèvres
    if (this.audio.playing) { const [l, r] = this.audio.outputLevels(); f.setTalk(l, r); }
    if (this.state === 'conversation') {
      f.setListen(this.audio.playing ? -1 : this.audio.level);
      if (this.audio.speaking || now - this.lastUserSpeech < 1500) this._sendFrame(false);
      // R3 : la conversation se ferme d'elle-même après un silence.
      const idle = now - Math.max(this.lastActivity, this.lastUserSpeech);
      if (!this.continuous && !this.audio.playing && !this.audio.speaking && idle > this.settings.convTimeout * 1000) this.endConversation('silence');
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

function shorten(m) { m = (m || 'erreur inconnue').replace(/\s+/g, ' ').trim(); return m.length > 140 ? m.slice(0, 137) + '…' : m; }

function concat(list) {
  let n = 0; for (const a of list) n += a.length;
  const out = new Int16Array(n); let o = 0; for (const a of list) { out.set(a, o); o += a.length; }
  return out;
}

const app = new App();
window.wilson = app;
app.boot();
