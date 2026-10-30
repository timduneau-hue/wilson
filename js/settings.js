// Wilson — réglages (stockés sur la tablette) et écrans de configuration.

import { EXPRESSIONS, STYLES } from './face.js';
import { checkKey, cleanKey, sessionsToday } from './brain.js';
import { SCRIPT_URL, scanQR } from './remote.js';
import { settingsLink } from './sync.js';

const AISTUDIO = '<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>';
// Message clair selon le résultat de la vérification de la clé.
export function keyMessage(r) {
  if (r.ok === true) return r.why === 'quota'
    ? 'Clé acceptée ✓ (quota momentanément atteint : Wilson pourra répondre dans quelques minutes).'
    : 'Clé acceptée par Google ✓';
  if (r.ok === null) return "Je n'ai pas pu joindre Google pour vérifier la clé (réseau). Je la garde quand même.";
  if (r.why === 'vide') return 'Colle ta clé dans le champ.';
  if (r.why === 'incomplete') return `Cette clé est incomplète. Sur ${AISTUDIO}, la clé affichée est raccourcie : touche l'icône <b>copier</b> à côté d'elle, puis colle-la ici.`;
  return `Google refuse cette clé${r.msg ? ` (« ${esc(r.msg)} »)` : ''}. Le plus souvent, ça se règle ainsi : sur ${AISTUDIO}, touche <b>Create API key</b> → <b>Create API key in new project</b>, attends une minute, copie la nouvelle clé avec l'icône <b>copier</b> et colle-la ici.`;
}

const KEY = 'wilson.settings';
export const DEFAULTS = {
  apiKey: '', model: 'gemini-3.8-live', voice: 'Puck',
  listenMode: 'regard', gazeCalib: { yaw: 0, pitch: 0, down: 0 }, convTimeout: 12, bargeIn: 'prudente',
  home: '', city: '', nightStart: 23, nightEnd: 7,
  camera: true, mirror: false, subtitles: false, face: 'lumiere', brainMode: 'auto', ecoVoice: '', ecoSpeed: 'rapide',
  logUrl: '', logContent: true,
  crm: false, voitureAuto: true, oreilleSens: 'normal',      // CRM à la voix et mode voiture (PLAN 2 quater)
  haUrl: '', haToken: '',                                    // la maison par Home Assistant (PLAN 7 bis)
};
export const VOICES = [
  ['Puck', 'enjoué'], ['Achird', 'amical'], ['Charon', 'posé'], ['Fenrir', 'énergique'], ['Umbriel', 'décontracté'],
  ['Algieba', 'doux'], ['Sadachbia', 'vif'], ['Orus', 'ferme'], ['Iapetus', 'clair'], ['Enceladus', 'feutré'],
  ['Zephyr', 'lumineuse (féminine)'], ['Sulafat', 'chaleureuse (féminine)'], ['Aoede', 'légère (féminine)'],
  ['Kore', 'ferme (féminine)'], ['Leda', 'jeune (féminine)'],
];

export function loadSettings() {
  let s;
  try { s = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { s = { ...DEFAULTS }; }
  // Migration 1.4 : mode le plus rapide par défaut, conversation plus courte.
  if ((s.v || 1) < 2) { s.ecoSpeed = 'rapide'; if (s.convTimeout === 20) s.convTimeout = 12; s.v = 2; }
  if (s.v < 3) { s.listenMode = 'regard'; s.ecoSpeed = 'rapide'; s.v = 3; }   // 1.5 : écoute au regard, plus de mot-clé
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {}
  return s;
}
export function saveSettings(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

const $ = (id) => document.getElementById(id);

export class SettingsUI {
  constructor(app) {
    this.app = app; this.s = app.settings;
    const hours = Array.from({ length: 24 }, (_, h) => `<option value="${h}">${h}h00</option>`).join('');
    $('s-night1').innerHTML = hours; $('s-night2').innerHTML = hours;
    $('s-face').innerHTML = Object.entries(STYLES).map(([k, v]) => `<option value="${k}">${v.label} — ${v.desc}</option>`).join('');
    $('s-voice').innerHTML = VOICES.map(([v, d]) => `<option value="${v}">${v} — ${d}</option>`).join('');
    $('emo-buttons').innerHTML = Object.keys(EXPRESSIONS).filter((e) => !['neutre', 'dort'].includes(e))
      .map((e) => `<button class="btn" data-emo="${e}">${e}</button>`).join('');
    $('emo-buttons').addEventListener('click', (e) => { const b = e.target.closest('[data-emo]'); if (b) app.face.setEmotion(b.dataset.emo, 3500); });

    const bind = (id, key, conv = (v) => v, prop = 'value') => {
      const el = $(id);
      el.addEventListener('change', () => { this.s[key] = conv(el[prop]); saveSettings(this.s); app.applySettings(key); });
    };
    bind('s-key', 'apiKey', cleanKey); bind('s-model', 'model', (v) => v.trim() || 'gemini-3.8-live');
    $('t-key').onclick = async () => {
      const st = $('s-keystatus'); st.hidden = false; st.className = 'status'; st.textContent = 'Vérification auprès de Google…';
      const r = await checkKey($('s-key').value);
      st.className = 'status ' + (r.ok ? 'ok' : r.ok === false ? 'err' : ''); st.innerHTML = keyMessage(r);
      if (r.ok === false) return;
      this.s.apiKey = cleanKey($('s-key').value); saveSettings(this.s); app.brain.authMode = app.brain.modelUsed = app.brain.level = null;
      st.innerHTML += '<br>Test de la connexion à Gemini (quelques secondes)…';
      const c = await app.testConnection();
      st.className = 'status ' + (c.ok ? 'ok' : 'err');
      st.innerHTML = keyMessage(r) + '<br>' + (c.ok ? `Wilson peut parler ✓ <em>(${esc(c.msg)})</em>`
        : `Wilson ne peut pas encore parler : ${esc(c.msg)}`) + `<br><em>Wilson ${app.version} · connexions aujourd'hui : ${sessionsToday()}</em>`;
      app.log('Test connexion : ' + (c.ok ? 'OK ' : 'échec ') + c.msg);
    };
    bind('s-voice', 'voice'); bind('s-face', 'face'); bind('s-brain', 'brainMode'); bind('s-ecospeed', 'ecoSpeed'); bind('s-ecovoice', 'ecoVoice'); bind('s-listen', 'listenMode');
    bind('s-timeout', 'convTimeout', Number); bind('s-barge', 'bargeIn');
    bind('s-haurl', 'haUrl', (v) => v.trim().replace(/\/+$/, '')); bind('s-hatoken', 'haToken', (v) => v.trim());
    $('t-maison').onclick = async () => {
      const st = $('s-maisonstatus'); st.hidden = false; st.className = 'status'; st.textContent = 'Vérification…';
      this.s.haUrl = $('s-haurl').value.trim().replace(/\/+$/, ''); this.s.haToken = $('s-hatoken').value.trim(); saveSettings(this.s); app.applySettings('haUrl');
      const r = await app.maison.verifier();
      st.className = 'status ' + (r.ok ? 'ok' : 'err'); st.textContent = r.msg; app.log('Vérification maison : ' + r.msg);
    };
    bind('s-home', 'home'); bind('s-city', 'city'); bind('s-night1', 'nightStart', Number); bind('s-night2', 'nightEnd', Number);
    bind('s-cam', 'camera', Boolean, 'checked'); bind('s-mirror', 'mirror', Boolean, 'checked'); bind('s-subs', 'subtitles', Boolean, 'checked');

    // CRM et voiture (PLAN 2 quater)
    bind('s-crm', 'crm', Boolean, 'checked'); bind('s-carauto', 'voitureAuto', Boolean, 'checked'); bind('s-earsens', 'oreilleSens');
    $('s-crm').addEventListener('change', () => this.crmStatus(true));
    $('t-crm').onclick = () => this.crmStatus(true);
    $('t-car').onclick = () => { this.close(); if (app.car) app.exitCar('réglages'); else app.enterCar('réglages'); };
    $('t-ear').onclick = () => this.apprendreNom();
    $('t-eartest').onclick = () => this.testerOreille();

    // Journal à distance : l'adresse du script Apps Script (collée ou scannée en QR code) reste sur la tablette.
    bind('s-logcontent', 'logContent', Boolean, 'checked');
    $('s-logurl').addEventListener('change', () => {
      const v = $('s-logurl').value.trim();
      if (v && !SCRIPT_URL.test(v)) { this.logStatus('Ce n\'est pas l\'adresse d\'un script Apps Script déployé (elle commence par https://script.google.com/macros/s/ et finit par /exec).', 'err'); return; }
      this.s.logUrl = v; saveSettings(this.s); app.applySettings('logUrl');
      this.logStatus(v ? 'Adresse enregistrée ✓ — le journal part maintenant toutes les 30 s.' : 'Journal à distance coupé.', v ? 'ok' : '');
    });
    // Mes appareils : copie de tous les réglages vers un autre appareil (QR code ou lien).
    $('t-copy').onclick = () => {
      const box = $('copy-box'); box.hidden = !box.hidden;
      if (box.hidden) return;
      this._link = settingsLink(this.s, DEFAULTS);
      drawQR($('copy-qr'), this._link);
      $('t-share').hidden = !navigator.share;
      app.log('Lien de copie des réglages affiché');
    };
    const copyStatus = (m, cls) => { const el = $('s-copystatus'); el.hidden = !m; el.className = 'status ' + (cls || ''); el.textContent = m; };
    $('t-share').onclick = async () => {
      try { await navigator.share({ title: 'Réglages de Wilson', text: 'Ouvre ce lien sur ton autre appareil pour y installer Wilson avec tes réglages.', url: this._link }); copyStatus('Lien partagé ✓', 'ok'); }
      catch (e) { if (e.name !== 'AbortError') copyStatus('Partage impossible : utilise « Copier le lien ».', 'err'); }
    };
    $('t-copylink').onclick = async () => {
      try { await navigator.clipboard.writeText(this._link); copyStatus('Lien copié ✓ — colle-le dans un message à toi-même.', 'ok'); }
      catch (_) { copyStatus('Copie impossible sur cet appareil : utilise le QR code.', 'err'); }
    };
    $('t-logsend').onclick = async () => {
      if (!app.remote.on) { this.logStatus('Indique d\'abord l\'adresse du script (ou scanne son QR code).', 'err'); return; }
      app.log('Envoi du journal demandé depuis les réglages');
      const ok = await app.remote.flush();
      this.logStatus(ok ? 'Journal envoyé ✓ (onglets Journal et État de la feuille « Wilson — journal »).' : 'Envoi impossible pour l\'instant (réseau ?) : nouvel essai automatique.', ok ? 'ok' : 'err');
    };
    $('t-logscan').onclick = async () => {
      const v = app.vision && app.vision.video, cv = $('logscan');
      if (this._scan) { this._scan.abort(); return; }
      if (!v) { this.logStatus('La caméra est coupée : colle l\'adresse à la main.', 'err'); return; }
      this._scan = new AbortController(); cv.hidden = false; $('t-logscan').textContent = 'Arrêter';
      this.logStatus('Montre-moi le QR code de la page « Journal de Wilson : prêt » (écran de l\'ordinateur ou photo sur ton téléphone)…', '');
      const g = cv.getContext('2d');
      try {
        const url = await scanQR(v, { signal: this._scan.signal, onFrame: (vid) => { try { g.drawImage(vid, 0, 0, cv.width, cv.height); } catch (_) {} } });
        if (url) {
          this.s.logUrl = url; saveSettings(this.s); $('s-logurl').value = url; app.applySettings('logUrl');
          app.face.setEmotion('joie', 2000);
          this.logStatus('QR code lu ✓ — le journal part maintenant toutes les 30 s.', 'ok');
        } else this.logStatus('', '');
      } catch (e) { this.logStatus('Lecture impossible : ' + e.message + '.', 'err'); }
      this._scan = null; cv.hidden = true; $('t-logscan').textContent = 'Scanner le QR code';
    };

    $('s-close').onclick = () => this.close();
    $('s-reload').onclick = () => location.reload();
    // Écouter la voix choisie : Wilson se présente avec elle (une conversation en cours est fermée d'abord).
    $('t-voice').onclick = () => {
      this.close();
      if (app.state === 'conversation' || app.state === 'eveil') app.endConversation('essai de voix');
      app.log(`Essai de la voix ${this.s.voice}`);
      setTimeout(() => app.startConversation('test'), 400);
    };
    $('t-chime').onclick = () => { app.audio.resume(); app.audio.chime(); app.log(`Son d'essai joué — son : ${app.audio.describe()}`); };
    $('t-ecovoice').onclick = () => { app.voice.voiceName = this.s.ecoVoice; app.voice.speak("Bonjour ! Je suis Wilson. Voilà ma voix quand je suis en mode économique.").catch(() => {}); };
    if (window.speechSynthesis) speechSynthesis.addEventListener('voiceschanged', () => { if (app.settingsOpen) this.fillVoices(); });
    $('t-gaze').onclick = () => {
      const box = $('gaze-test'), on = box.hidden; box.hidden = !on; $('t-calib').hidden = !on;
      $('t-gaze').textContent = on ? 'Arrêter le test' : 'Tester le regard';
      clearInterval(this._gz);
      if (on) this._gz = setInterval(() => {
        const v = app.vision;
        if (!v) { box.textContent = 'Caméra coupée'; return; }
        if (!v.gazeReady) { box.textContent = v.modelsDone ? 'Détection du regard indisponible sur cette tablette' : 'Chargement de la détection du regard…'; return; }
        const g = v.gaze;
        box.innerHTML = `<div>${v.looking ? '<b>Tu me regardes ✓</b>' : 'Tu ne me regardes pas'}</div>` +
          (g ? `<div>Visages : ${v.faces} · tête ${Math.round(g.yaw)}° · regard ${Math.round(g.gazeYaw)}° · haut/bas ${Math.round(g.pitch)}° · yeux baissés ${Math.round(g.down * 100)} % · distance ~${(0.12 / Math.max(g.size, 0.01)).toFixed(1)} m</div>` : '<div>Aucun visage</div>') +
          `<div><em>Analyse en arrière-plan : ${Math.round(v.stats.ms)} ms (visages ${Math.round(v.stats.fd || 0)} ms, regard ${Math.round(v.stats.lm || 0)} ms, ${v.delegate === 'GPU' ? 'carte graphique' : 'processeur'})</em></div>`;
      }, 300);
    };
    $('t-calib').onclick = () => {
      const v = app.vision, g = v && v.gaze; if (!g) return;
      // Position actuelle = « il me regarde » (tablette posée plus haut, plus bas ou sur le côté). Yeux baissés : on garde une marge normale.
      const downAbs = (v.calib.down || 0) + g.down;
      v.calib = { yaw: (v.calib.yaw || 0) + g.gazeYaw, pitch: (v.calib.pitch || 0) + g.pitch, down: Math.max(0, downAbs - 0.2) };
      this.s.gazeCalib = v.calib; saveSettings(this.s);
      app.log(`Regard calibré : ${Math.round(v.calib.yaw)}°, ${Math.round(v.calib.pitch)}°, yeux ${Math.round(v.calib.down * 100)} %`);
      app.badge('Regard calibré ✓', 3000);
    };
    $('m-export').onclick = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([app.memory.export()], { type: 'application/json' }));
      a.download = `wilson-souvenirs-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    };
    $('m-import').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { app.memory.import(await f.text()); this.renderMemory(); app.log('Souvenirs importés'); } catch (err) { alert('Fichier illisible'); }
    };
    $('m-clear').onclick = () => { if (confirm('Effacer tous les souvenirs et le journal de Wilson ?')) { app.memory.clear(); this.renderMemory(); } };
    $('mem-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]'); if (!b) return; app.memory.remove(+b.dataset.i); this.renderMemory();
    });

    // Premier lancement
    $('w-go').onclick = async () => {
      const btn = $('w-go'), st = $('w-status');
      const k = cleanKey($('w-key').value);
      btn.disabled = true; btn.textContent = 'Vérification de la clé…';
      st.hidden = false; st.className = 'status'; st.textContent = 'Je vérifie la clé auprès de Google…';
      const r = await checkKey(k);
      btn.disabled = false; btn.textContent = 'Réveiller Wilson';
      st.className = 'status ' + (r.ok ? 'ok' : r.ok === false ? 'err' : ''); st.innerHTML = keyMessage(r);
      if (r.ok === false) return;
      this.s.apiKey = k; this.s.home = $('w-home').value.trim(); saveSettings(this.s);
      setTimeout(() => { $('welcome').hidden = true; }, r.ok ? 600 : 2500);
      app.start(true);
    };
  }

  fill() {
    const s = this.s;
    $('s-haurl').value = s.haUrl || ''; $('s-hatoken').value = s.haToken || '';
    $('s-key').value = s.apiKey; $('s-model').value = s.model; $('s-voice').value = s.voice; $('s-face').value = s.face;
    $('s-brain').value = s.brainMode; $('s-ecospeed').value = s.ecoSpeed; this.fillVoices();
    $('s-listen').value = s.listenMode; $('s-timeout').value = String(s.convTimeout);
    $('s-barge').value = s.bargeIn; $('s-home').value = s.home; $('s-city').value = s.city;
    $('s-night1').value = String(s.nightStart); $('s-night2').value = String(s.nightEnd);
    $('s-cam').checked = s.camera; $('s-mirror').checked = s.mirror; $('s-subs').checked = s.subtitles;
    $('s-logurl').value = s.logUrl || ''; $('s-logcontent').checked = s.logContent !== false;
    $('s-crm').checked = !!s.crm; $('s-carauto').checked = s.voitureAuto !== false; $('s-earsens').value = s.oreilleSens || 'normal';
    $('t-car').textContent = this.app.car ? 'Quitter le mode voiture' : 'Mode voiture maintenant';
    this.crmStatus(false); this.oreilleStatus();
    const sy = $('s-sync'), sys = this.app.sync.state;
    sy.className = 'status ' + (!this.app.remote.on ? '' : /^à jour/.test(sys) ? 'ok' : sys ? 'err' : '');
    sy.textContent = !this.app.remote.on ? 'Synchronisation : pas de script sur cet appareil (copie tes réglages depuis le téléphone).'
      : `Synchronisation des réglages : ${sys || 'vérification en cours…'}`;
    $('copy-box').hidden = true;
    const ss = this.app._searchState || '', sr = $('s-search');
    sr.className = 'status ' + (!this.app.remote.on ? 'err' : /✓/.test(ss) ? 'ok' : ss ? 'err' : '');
    sr.textContent = !this.app.remote.on ? 'Recherche Internet : pas de script configuré (rubrique « Journal à distance »).'
      : ss ? `Recherche Internet : ${ss}` : 'Recherche Internet : Tavily par ton script (pas encore utilisée depuis le démarrage).';
    const r = this.app.remote;
    if (r.on) this.logStatus(r.sentAt ? `Actif ✓ — dernier envoi à ${new Date(r.sentAt).getHours()}h${String(new Date(r.sentAt).getMinutes()).padStart(2, '0')}${r.fails ? ` (${r.fails} échec(s) depuis, réseau ?)` : ''}.` : 'Actif ✓ — premier envoi dans quelques secondes.', r.fails ? 'err' : 'ok');
    else $('s-logstatus').hidden = true;
    const v = this.app.vision;
    const gaze = !v ? 'caméra coupée' : v.gazeReady ? `regard prêt (${v.delegate === 'GPU' ? 'carte graphique' : 'processeur'}, ${Math.round(v.stats.ms || 0)} ms)` : v.modelsDone ? 'regard indisponible' : 'regard en chargement';
    $('version').textContent = `Wilson ${this.app.version} · visage ${this.app.drawFps || '—'} images/s · vision : ${v ? v.mode : 'coupée'}, ${gaze} · connexions Gemini aujourd'hui : ${sessionsToday()}`;
    this.renderMemory(); this.renderLog();
  }
  fillVoices() {
    const vs = this.app.voice.voices(), sel = $('s-ecovoice');
    sel.innerHTML = '<option value="">Automatique (meilleure voix française)</option>' +
      vs.map((v) => `<option value="${esc(v.name)}">${esc(v.name)}${v.localService ? '' : ' (en ligne)'}</option>`).join('');
    sel.value = vs.some((v) => v.name === this.s.ecoVoice) ? this.s.ecoVoice : '';
  }
  renderMemory() {
    const f = this.app.memory.facts;
    $('mem-n').textContent = `(${f.length})`;
    $('mem-list').innerHTML = f.length
      ? f.map((x, i) => `<li><span>${esc(x.text)} <em>· ${x.date}</em></span><button data-i="${i}" aria-label="Oublier">×</button></li>`).join('')
      : '<li class="empty">Wilson ne sait encore rien. Dis-lui : « Wilson, retiens que… »</li>';
  }
  renderLog() { const el = $('log'); el.textContent = this.app.logs.join('\n'); el.scrollTop = el.scrollHeight; }
  logStatus(msg, cls) { const el = $('s-logstatus'); el.hidden = !msg; el.className = 'status ' + (cls || ''); el.textContent = msg; }
  // État du CRM : relié (nombre de contacts, brouillons à valider) ou la raison exacte.
  async crmStatus(force) {
    const el = $('s-crmstatus'), a = this.app, show = (m, cls) => { el.hidden = !m; el.className = 'status ' + (cls || ''); el.textContent = m; };
    if (!a.settings.crm) { show(''); return; }
    if (!a.remote.on) { show('Il faut d\'abord l\'adresse du script de Wilson (rubrique « Journal à distance ») : c\'est lui qui interroge le CRM.', 'err'); return; }
    if (!force && a.crm.etat) { const e = a.crm.etat; show(e.ok ? `CRM relié ✓ — ${e.contacts} contacts${e.brouillons ? `, ${e.brouillons} brouillon(s) à valider dans Mes tâches` : ''}.` : `CRM : ${e.erreur || 'pas de réponse'}`, e.ok ? 'ok' : 'err'); if (Date.now() - e.at < 60000) return; }
    show('Je contacte le CRM…');
    const e = await a.crm.status(true);
    if (!e) { show(''); return; }
    show(e.ok ? `CRM relié ✓ — ${e.contacts} contacts${e.brouillons ? `, ${e.brouillons} brouillon(s) à valider dans Mes tâches` : ''}.`
      : /action inconnue/.test(e.erreur || '') ? 'Le script de Wilson n\'a pas encore la partie CRM : recolle son code et déploie une nouvelle version.'
      : `CRM : ${e.erreur || 'pas de réponse'}`, e.ok ? 'ok' : 'err');
  }
  oreilleStatus(msg) {
    const o = this.app.oreille, el = $('ear-box');
    if (msg) { el.hidden = false; el.innerHTML = msg; return; }
    el.hidden = false;
    el.innerHTML = o.ready ? `Oreille prête ✓ (${o.templates.length} « Wilson » appris${o.info && o.info.le ? ` le ${new Date(o.info.le).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}` : ''}).`
      : 'Oreille pas encore apprise : en voiture, il faudra toucher l\'écran pour parler.';
  }
  // Une phrase captée au micro (début et fin détectés) : Int16 16 kHz, ou null après 12 s de silence.
  _capturer(job) {
    const A = this.app.audio;
    return new Promise((res) => {
      let t0 = 0; const fin = (v) => { clearTimeout(to); A.off('speechstart', on); A.off('speechend', off); res(v); };
      const on = () => { t0 = performance.now(); };
      const off = () => { if (!t0) return; fin(A.recent(performance.now() - t0 + 300)); };
      const to = setTimeout(() => fin(null), 12000);
      job.stop = () => fin(null);
      A.on('speechstart', on); A.on('speechend', off);
    });
  }
  // Apprendre mon nom, guidé par Wilson (demande du 30/10/26) : il demande « Dis Wilson », écoute, dit « Change de place »,
  // patiente 5 s, et recommence (8 fois : près, loin, canapé, debout…). Puis 15 s sans son nom (conversation, télé) pour
  // placer la limite au-dessus des bruits de la maison.
  async apprendreNom() {
    const app = this.app, N = 8, POSE = 5;
    if (this._ear) { this._ear.abort = true; if (this._ear.stop) this._ear.stop(); return; }
    if (app.state === 'conversation' || app.state === 'eveil') app.endConversation('apprentissage du nom');
    await app.audio.resume();
    const job = this._ear = { abort: false }, noms = [];
    const dire = async (t) => { if (job.abort) return; try { await app.voice.speak(t); } catch (_) {} await new Promise((r) => setTimeout(r, 450)); };
    const attendre = async (sec, msg) => { for (let k = sec; k > 0 && !job.abort; k--) { this.oreilleStatus(msg(k)); await new Promise((r) => setTimeout(r, 1000)); } };
    $('t-ear').textContent = 'Arrêter';
    try {
      this.oreilleStatus('Je vais te demander de dire « Wilson » 8 fois. Entre chaque fois, change de place : près, loin, dans le canapé, debout, dos tourné…');
      await dire('On apprend mon prénom. Je vais te demander huit fois de dire Wilson. Entre chaque fois, change de place.');
      for (let i = 0, rate = 0; i < N && !job.abort; i++) {
        this.oreilleStatus(`<b>Dis « Wilson »</b>, naturellement, comme si tu m'appelais (${i + 1}/${N})…`);
        await dire(i === 0 ? 'Dis Wilson.' : ['Vas-y : Wilson.', 'Encore : Wilson.', 'Dis Wilson.', 'Appelle-moi.'][i % 4]);
        if (job.abort) break;
        const pcm = await this._capturer(job);
        if (job.abort) break;
        if (!pcm || pcm.length < 16000 * 0.3) {
          if (++rate > 4) throw new Error('je n\'entends rien');
          i--; await dire('Je n\'ai rien entendu. On recommence.'); continue;
        }
        noms.push(pcm);
        if (i < N - 1) { await dire('Merci. Change de place.'); await attendre(POSE, (k) => `Change de place… (${k} s) — ${i + 1}/${N} enregistré(s)`); }
      }
      if (job.abort) { this.oreilleStatus('Apprentissage arrêté.'); return; }
      await dire('Parfait. Maintenant, ne dis plus mon nom pendant quinze secondes : parle normalement, ou laisse la télé.');
      await attendre(15, (k) => `<b>Ne dis pas « Wilson »</b> : parle normalement, télé allumée si tu veux… (${k} s)`);
      if (job.abort) { this.oreilleStatus('Apprentissage arrêté.'); return; }
      const fond = app.audio.recent(15000), autres = [];
      for (let o = 0; o + 32000 <= fond.length; o += 16000) autres.push(fond.subarray(o, o + 32000));   // morceaux de 2 s
      const r = app.oreille.apprendre(noms, autres);
      app.log(r.ok ? `Oreille apprise (guidée) : ${r.n}/${noms.length} « Wilson », seuil ${r.seuil.toFixed(1)} (écarts ${r.pos.map((x) => x.toFixed(1)).join(' ')}, bruits de la maison ${r.neg == null ? '—' : r.neg.toFixed(1)})` : 'Oreille : ' + r.why);
      this.oreilleStatus(r.ok ? `Oreille prête ✓ — ${r.n} « Wilson » retenus. Tu peux la tester ci-dessous.` : 'Raté : ' + r.why + '.');
      await dire(r.ok ? 'C\'est appris. Merci !' : 'Ça n\'a pas marché, on pourra recommencer.');
      if (app.car) app._carHint();
    } catch (e) { this.oreilleStatus('Raté : ' + e.message + '.'); }
    finally { this._ear = null; $('t-ear').textContent = 'Apprendre mon nom'; }
  }
  // Tester l'oreille : chaque phrase est notée (reconnue ou non), sans réveiller Wilson.
  testerOreille() {
    const app = this.app, o = app.oreille;
    if (app._earTest) { app._earTest = false; o.onSegment = (r) => app._oreilleLog(r); o.onDetect = (d) => app._onName(d); $('t-eartest').textContent = 'Tester l\'oreille'; this.oreilleStatus(); return; }
    if (!o.ready) { this.oreilleStatus('Apprends-moi d\'abord ton nom.'); return; }
    o.reset(); app._earTest = true; $('t-eartest').textContent = 'Arrêter le test';
    this.oreilleStatus('Parle : « Wilson, qui je vois demain ? », puis une phrase sans mon nom…');
    o.onDetect = () => {};
    o.onSegment = (r) => this.oreilleStatus(`${r.oui ? '<b>« Wilson » reconnu ✓</b>' : 'Pas reconnu'} — écart ${r.score === Infinity ? '—' : r.score.toFixed(1)} (limite ${o.limite.toFixed(1)}${!r.oui && r.score < o.presque ? ', presque : Gemini donnerait un second avis' : ''})`);
  }
  open() { this.fill(); $('settings').hidden = false; this.app.settingsOpen = true; }
  close() {
    if (this._ear) { this._ear.abort = true; if (this._ear.stop) this._ear.stop(); }
    if (this.app._earTest) this.testerOreille();
    if (this._scan) this._scan.abort(); $('settings').hidden = true; this.app.settingsOpen = false; clearInterval(this._gz); $('gaze-test').hidden = true; $('t-calib').hidden = true; $('t-gaze').textContent = 'Tester le regard'; }
  showWelcome() { $('w-home').value = this.s.home; $('w-key').value = this.s.apiKey || ''; $('welcome').hidden = false; }
}

// QR code (bibliothèque qrcode-generator, MIT) dessiné sur un canevas blanc avec sa marge.
function drawQR(cv, text) {
  const g = cv.getContext('2d');
  if (!window.qrcode) { g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); return; }
  const qr = window.qrcode(0, 'L'); qr.addData(text); qr.make();      // correction « L » : code moins dense (écran net)
  const n = qr.getModuleCount(), q = 4, cell = Math.max(2, Math.floor(600 / (n + 2 * q)));
  cv.width = cv.height = cell * (n + 2 * q);
  g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect((c + q) * cell, (r + q) * cell, cell, cell);
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
