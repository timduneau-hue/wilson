// Wilson — réglages (stockés sur la tablette) et écrans de configuration.

import { EXPRESSIONS } from './face.js';

const KEY = 'wilson.settings';
export const DEFAULTS = {
  apiKey: '', model: 'gemini-3.8-live', voice: 'Puck',
  earMode: 'local', sensitivity: 'normale', convTimeout: 20, bargeIn: 'prudente',
  home: '', city: '', nightStart: 23, nightEnd: 7,
  camera: true, mirror: false, subtitles: false,
};
export const VOICES = [
  ['Puck', 'enjoué'], ['Achird', 'amical'], ['Charon', 'posé'], ['Fenrir', 'énergique'], ['Umbriel', 'décontracté'],
  ['Algieba', 'doux'], ['Sadachbia', 'vif'], ['Orus', 'ferme'], ['Iapetus', 'clair'], ['Enceladus', 'feutré'],
  ['Zephyr', 'lumineuse (féminine)'], ['Sulafat', 'chaleureuse (féminine)'], ['Aoede', 'légère (féminine)'],
  ['Kore', 'ferme (féminine)'], ['Leda', 'jeune (féminine)'],
];

export function loadSettings() {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { return { ...DEFAULTS }; }
}
export function saveSettings(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

const $ = (id) => document.getElementById(id);

export class SettingsUI {
  constructor(app) {
    this.app = app; this.s = app.settings;
    const hours = Array.from({ length: 24 }, (_, h) => `<option value="${h}">${h}h00</option>`).join('');
    $('s-night1').innerHTML = hours; $('s-night2').innerHTML = hours;
    $('s-voice').innerHTML = VOICES.map(([v, d]) => `<option value="${v}">${v} — ${d}</option>`).join('');
    $('emo-buttons').innerHTML = Object.keys(EXPRESSIONS).filter((e) => !['neutre', 'dort'].includes(e))
      .map((e) => `<button class="btn" data-emo="${e}">${e}</button>`).join('');
    $('emo-buttons').addEventListener('click', (e) => { const b = e.target.closest('[data-emo]'); if (b) app.face.setEmotion(b.dataset.emo, 3500); });

    const bind = (id, key, conv = (v) => v, prop = 'value') => {
      const el = $(id);
      el.addEventListener('change', () => { this.s[key] = conv(el[prop]); saveSettings(this.s); app.applySettings(key); });
    };
    bind('s-key', 'apiKey', (v) => v.trim()); bind('s-model', 'model', (v) => v.trim() || 'gemini-3.8-live');
    bind('s-voice', 'voice'); bind('s-earmode', 'earMode'); bind('s-sens', 'sensitivity');
    bind('s-timeout', 'convTimeout', Number); bind('s-barge', 'bargeIn');
    bind('s-home', 'home'); bind('s-city', 'city'); bind('s-night1', 'nightStart', Number); bind('s-night2', 'nightEnd', Number);
    bind('s-cam', 'camera', Boolean, 'checked'); bind('s-mirror', 'mirror', Boolean, 'checked'); bind('s-subs', 'subtitles', Boolean, 'checked');

    $('s-close').onclick = () => this.close();
    $('s-reload').onclick = () => location.reload();
    $('t-voice').onclick = () => { this.close(); app.startConversation('test'); };
    $('t-ear').onclick = () => { const on = $('ear-test').hidden; $('ear-test').hidden = !on; app.earTest = on; $('t-ear').textContent = on ? 'Arrêter le test' : "Tester l'oreille"; };
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
    $('w-go').onclick = () => {
      const k = $('w-key').value.trim();
      if (!/^AIza[0-9A-Za-z_\-]{20,}$/.test(k) && !confirm('Cette clé ne ressemble pas à une clé Gemini. Continuer quand même ?')) return;
      this.s.apiKey = k; this.s.home = $('w-home').value.trim(); saveSettings(this.s);
      $('welcome').hidden = true; app.start(true);
    };
  }

  fill() {
    const s = this.s;
    $('s-key').value = s.apiKey; $('s-model').value = s.model; $('s-voice').value = s.voice;
    $('s-earmode').value = s.earMode; $('s-sens').value = s.sensitivity; $('s-timeout').value = String(s.convTimeout);
    $('s-barge').value = s.bargeIn; $('s-home').value = s.home; $('s-city').value = s.city;
    $('s-night1').value = String(s.nightStart); $('s-night2').value = String(s.nightEnd);
    $('s-cam').checked = s.camera; $('s-mirror').checked = s.mirror; $('s-subs').checked = s.subtitles;
    $('version').textContent = `Wilson ${this.app.version} · oreille : ${this.app.ear.ready ? 'prête' : 'en chargement'} · vision : ${this.app.vision ? this.app.vision.mode : 'coupée'}`;
    this.renderMemory(); this.renderLog();
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
  close() { $('settings').hidden = true; this.app.settingsOpen = false; this.app.earTest = false; $('ear-test').hidden = true; $('t-ear').textContent = "Tester l'oreille"; }
  showWelcome() { $('w-home').value = this.s.home; $('welcome').hidden = false; }
  earHeard(t) { $('ear-heard').textContent = t || '—'; }
  earWake() { const c = $('ear-count'); c.textContent = String(+c.textContent + 1); }
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
