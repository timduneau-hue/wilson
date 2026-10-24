// Wilson — une seule configuration pour tous les appareils (PLAN.md, section 2 ter).
//  1. Copie vers un nouvel appareil : lien « …/#reglages=… » (QR code ou partage). La partie « # » ne quitte pas l'appareil.
//  2. Ensuite, synchronisation par le script de Timothée (reglages_lire / reglages_ecrire) : le plus récent gagne.

// Propres à chaque appareil : calibrage et sens du regard (position de la caméra), voix installées sur l'appareil.
// Oreille du mode voiture : sa sensibilité dépend du micro de l'appareil (ses empreintes restent aussi sur l'appareil).
export const LOCAL_ONLY = ['gazeCalib', 'mirror', 'ecoVoice', 'v', 'oreilleSens'];
const PULL_MS = 10 * 60000;

export function shareable(s) {
  const o = {};
  for (const k of Object.keys(s)) if (!LOCAL_ONLY.includes(k)) o[k] = s[k];
  return o;
}

const b64u = (str) => { const b = new TextEncoder().encode(str); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); };

// Lien de copie des réglages (adresse de l'appli + « #reglages=… »). Seuls les réglages différents de ceux d'origine y
// figurent : QR code moins dense, plus facile à scanner. À l'import, les autres reprennent leur valeur d'origine.
export function settingsLink(s, defaults = {}, base = location.origin + location.pathname) {
  const o = {};
  for (const [k, v] of Object.entries(shareable(s))) if (JSON.stringify(v) !== JSON.stringify(defaults[k])) o[k] = v;
  return `${base}#reglages=${b64u(JSON.stringify({ ...o, _t: s._t || Date.now() }))}`;
}

// Réglages portés par l'adresse (puis effacés de l'adresse). null s'il n'y en a pas ou s'ils sont illisibles.
export function takeSettingsFromHash() {
  const m = /[#&]reglages=([\w-]+)/.exec(location.hash || '');
  if (!m) return null;
  try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
  try { const o = JSON.parse(unb64u(m[1])); return o && typeof o === 'object' && o.apiKey ? o : null; } catch (_) { return null; }
}

// Applique des réglages venus d'ailleurs sur les réglages locaux ; renvoie la liste des clés changées.
export function mergeInto(local, remote) {
  const changed = [];
  for (const k of Object.keys(remote)) {
    if (k === '_t' || LOCAL_ONLY.includes(k)) continue;
    if (JSON.stringify(local[k]) !== JSON.stringify(remote[k])) { local[k] = remote[k]; changed.push(k); }
  }
  local._t = remote._t || local._t;
  return changed;
}

export class SettingsSync {
  constructor(app) {
    this.app = app; this.state = ''; this.lastAt = 0; this._timer = null;
    setInterval(() => this.pull(), PULL_MS);
  }
  get on() { return this.app.remote.on; }

  // Un réglage a changé ici : envoyé (regroupé, 1,5 s après le dernier changement).
  schedulePush() {
    if (!this.on) return;
    clearTimeout(this._timer); this._timer = setTimeout(() => this.push(), 1500);
  }
  async push() {
    if (!this.on) return false;
    const s = this.app.settings;
    try {
      const r = await this.app.remote.ask({ action: 'reglages_ecrire', t: s._t || 1, reglages: shareable(s) });
      if (r && r.ok) { this._ok(r.applique ? 'envoyés' : 'déjà à jour'); return true; }
      return this._fail(r);
    } catch (e) { return this._fail(null, e); }
  }
  // Relit les réglages communs ; s'ils sont plus récents, ils remplacent ceux de l'appareil. Sinon, on envoie les nôtres.
  // adopt : appareil qui vient d'être relié au script → il prend les réglages communs, même si les siens sont plus récents.
  async pull({ adopt = false } = {}) {
    if (!this.on) return false;
    const s = this.app.settings;
    try {
      const r = await this.app.remote.ask({ action: 'reglages_lire' });
      if (!r || !r.ok) return this._fail(r);
      const remote = r.reglages, rt = +r.t || 0, lt = +s._t || 0;
      if (!remote || !rt) { this._ok('premier envoi'); return this.push(); }   // rien de commun encore : cet appareil fait référence
      if (rt > lt || (adopt && JSON.stringify(shareable({ ...s, _t: 0 })) !== JSON.stringify(shareable({ ...s, ...remote, _t: 0 })))) {
        const changed = mergeInto(s, { ...remote, _t: rt });
        this.app.saveSettingsQuiet();
        if (changed.length) {
          this.app.log(`Réglages mis à jour depuis un autre appareil : ${changed.filter((k) => k !== 'apiKey').join(', ') || 'clé'}${changed.includes('apiKey') ? ' (clé comprise)' : ''}`);
          for (const k of changed) this.app.applySettings(k, { fromSync: true });
          if (this.app.settingsOpen) this.app.ui.fill();
        }
        this._ok('à jour'); return true;
      }
      if (lt > rt) return this.push();
      this._ok('à jour'); return true;
    } catch (e) { return this._fail(null, e); }
  }
  _ok(what) { this.state = what === 'à jour' ? 'à jour' : `à jour (${what})`; this.lastAt = Date.now(); return true; }
  _fail(r, e) {
    const msg = e ? e.message : (r && r.erreur) || 'réponse inattendue';
    const old = /ancienne version/.test(msg) || (r && /action inconnue/.test(r.erreur || ''));
    const st = old ? 'le script ne sait pas encore synchroniser (code à mettre à jour)' : 'impossible : ' + msg;
    if (st !== this.state) this.app.log('Synchronisation des réglages : ' + st);
    this.state = st; return false;
  }
}
