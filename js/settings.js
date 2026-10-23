// Wilson — réglages (stockés sur la tablette) et écrans de configuration.

import { EXPRESSIONS, STYLES } from './face.js';
import { checkKey, cleanKey, sessionsToday } from './brain.js';

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
    bind('s-home', 'home'); bind('s-city', 'city'); bind('s-night1', 'nightStart', Number); bind('s-night2', 'nightEnd', Number);
    bind('s-cam', 'camera', Boolean, 'checked'); bind('s-mirror', 'mirror', Boolean, 'checked'); bind('s-subs', 'subtitles', Boolean, 'checked');

    $('s-close').onclick = () => this.close();
    $('s-reload').onclick = () => location.reload();
    $('t-voice').onclick = () => { this.close(); app.startConversation('test'); };
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
    $('s-key').value = s.apiKey; $('s-model').value = s.model; $('s-voice').value = s.voice; $('s-face').value = s.face;
    $('s-brain').value = s.brainMode; $('s-ecospeed').value = s.ecoSpeed; this.fillVoices();
    $('s-listen').value = s.listenMode; $('s-timeout').value = String(s.convTimeout);
    $('s-barge').value = s.bargeIn; $('s-home').value = s.home; $('s-city').value = s.city;
    $('s-night1').value = String(s.nightStart); $('s-night2').value = String(s.nightEnd);
    $('s-cam').checked = s.camera; $('s-mirror').checked = s.mirror; $('s-subs').checked = s.subtitles;
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
  open() { this.fill(); $('settings').hidden = false; this.app.settingsOpen = true; }
  close() { $('settings').hidden = true; this.app.settingsOpen = false; clearInterval(this._gz); $('gaze-test').hidden = true; $('t-calib').hidden = true; $('t-gaze').textContent = 'Tester le regard'; }
  showWelcome() { $('w-home').value = this.s.home; $('w-key').value = this.s.apiKey || ''; $('welcome').hidden = false; }
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
