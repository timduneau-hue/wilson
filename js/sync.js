// Wilson — une seule configuration pour tous les appareils (PLAN.md, section 2 ter).
//  1. Copie vers un nouvel appareil : lien « …/#reglages=… » (QR code ou partage). La partie « # » ne quitte pas l'appareil.
//  2. Ensuite, synchronisation par le script de Timothée (reglages_lire / reglages_ecrire) : le plus récent gagne.

// Propres à chaque appareil : calibrage et sens du regard (position de la caméra), voix installées sur l'appareil.
// Oreille du mode voiture : sa sensibilité dépend du micro de l'appareil (ses empreintes restent aussi sur l'appareil).
export const LOCAL_ONLY = ['gazeCalib', 'mirror', 'ecoVoice', 'v', 'oreilleSens'];
// L'adresse du script (logUrl), avec sa clé secrète, ne passe JAMAIS par la synchronisation : journal du 11/11/26,
// 08h41-08h42, la tablette puis le téléphone scannent le nouveau QR code (adresse avec la clé), et aussitôt la
// synchronisation leur remet l'ancienne adresse des réglages communs (sans la clé) → « clé refusée », plus rien ne passait
// (CRM, journal, mémoire, Claude). Elle reste dans le lien de copie (« #reglages=… », geste volontaire de Timothée).
// Home Assistant (haUrl, haToken) non plus (PLAN-AMELIORATIONS W9) : le jeton donne la main sur la maison ; il ne doit pas
// dormir dans les propriétés du script. À saisir sur chaque appareil, ou à reprendre par le lien de copie (geste volontaire).
export const HORS_SYNCHRO = [...LOCAL_ONLY, 'logUrl', 'haUrl', 'haToken'];
const PULL_MS = 10 * 60000;

export function shareable(s, exclus = LOCAL_ONLY) {
  const o = {};
  for (const k of Object.keys(s)) if (k !== '_sale' && !exclus.includes(k)) o[k] = s[k];   // _sale : « changement pas encore envoyé » (W19), propre à l'appareil
  return o;
}

const b64u = (str) => { const b = new TextEncoder().encode(str); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); };

// Réglages à mettre dans un lien : seuls ceux qui diffèrent des réglages d'origine (QR code moins dense, plus facile à
// scanner). À l'import, les autres reprennent leur valeur d'origine.
function reglagesDuLien(s, defaults) {
  const o = {};
  for (const [k, v] of Object.entries(shareable(s))) if (JSON.stringify(v) !== JSON.stringify(defaults[k])) o[k] = v;
  return { ...o, _t: s._t || Date.now() };
}
// Ancien lien, en clair (« #reglages=… ») : encore lu à l'arrivée, plus produit par l'appli depuis le W10.
export function settingsLink(s, defaults = {}, base = location.origin + location.pathname) {
  return `${base}#reglages=${b64u(JSON.stringify(reglagesDuLien(s, defaults)))}`;
}

// Lien chiffré (PLAN-AMELIORATIONS W10) : « #reglages2=… ». Les réglages (clé Gemini, adresse du script avec sa clé, jeton Home
// Assistant) sont chiffrés en AES-GCM avec une clé tirée d'un code à 4 chiffres (PBKDF2). Le code s'affiche sur l'appareil qui
// montre le QR code et se saisit sur celui qui le reçoit : un lien ou une photo du QR code, seuls, ne livrent plus rien.
// Limite assumée : 4 chiffres = 10 000 possibilités ; cela protège d'une fuite par hasard (lien transféré, photo), pas d'un
// attaquant qui s'y met sérieusement avec le lien en main.
const ITER_CODE = 200000;
const bytesB64u = (u8) => { let s = ''; for (const x of u8) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const b64uBytes = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
async function cleDepuisCode(code, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(code)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER_CODE, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export function nouveauCodeCopie() { const a = new Uint32Array(1); crypto.getRandomValues(a); return String(a[0] % 10000).padStart(4, '0'); }
export async function settingsLinkChiffre(s, defaults, code, base = location.origin + location.pathname) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cleDepuisCode(code, salt), new TextEncoder().encode(JSON.stringify(reglagesDuLien(s, defaults)))));
  const out = new Uint8Array(1 + 16 + 12 + ct.length); out[0] = 1; out.set(salt, 1); out.set(iv, 17); out.set(ct, 29);
  return `${base}#reglages2=${bytesB64u(out)}`;
}
// Renvoie les réglages, ou lève une erreur si le code est faux (l'authentification GCM échoue) ou le lien abîmé.
export async function dechiffrerReglages(payload, code) {
  const b = b64uBytes(payload); if (b[0] !== 1 || b.length < 30) throw new Error('lien illisible');
  const clair = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(17, 29) }, await cleDepuisCode(code, b.slice(1, 17)), b.slice(29));
  const o = JSON.parse(new TextDecoder().decode(clair));
  if (!o || typeof o !== 'object' || !o.apiKey) throw new Error('réglages illisibles');
  return o;
}
export function lienChiffreDansAdresse() { const m = /[#&]reglages2=([\w-]+)/.exec(location.hash || ''); return m ? m[1] : null; }
// Au démarrage : si l'adresse porte un lien chiffré, demande le code (fenêtre #codecopie) et rend les réglages, ou null.
export function importerLienChiffre() {
  const payload = lienChiffreDansAdresse(); if (!payload) return Promise.resolve(null);
  try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
  const $ = (id) => document.getElementById(id);
  const sec = $('codecopie'); if (!sec) return Promise.resolve(null);
  return new Promise((fini) => {
    let essais = 0;
    const statut = (m) => { $('cc-status').hidden = !m; $('cc-status').textContent = m; };
    const fermer = (r) => { sec.hidden = true; $('cc-go').onclick = $('cc-cancel').onclick = $('cc-code').onkeydown = null; fini(r); };
    $('cc-code').value = ''; statut(''); sec.hidden = false; setTimeout(() => $('cc-code').focus(), 50);
    const valider = async () => {
      const code = $('cc-code').value.trim();
      if (!/^\d{4}$/.test(code)) { statut('Le code a 4 chiffres.'); return; }
      $('cc-go').disabled = true; statut('Vérification…');
      try { fermer(await dechiffrerReglages(payload, code)); }
      catch (_) {
        $('cc-go').disabled = false; $('cc-code').value = '';
        if (++essais >= 5) { statut(''); fermer(null); return; }
        const reste = 5 - essais;
        statut('Code incorrect (' + reste + ' essai' + (reste > 1 ? 's' : '') + ' restant' + (reste > 1 ? 's' : '') + ').');
      }
    };
    $('cc-go').onclick = valider; $('cc-cancel').onclick = () => fermer(null);
    $('cc-code').onkeydown = (e) => { if (e.key === 'Enter') valider(); };
  });
}

// Réglages portés par l'adresse (puis effacés de l'adresse). null s'il n'y en a pas ou s'ils sont illisibles.
export function takeSettingsFromHash() {
  const m = /[#&]reglages=([\w-]+)/.exec(location.hash || '');
  if (!m) return null;
  try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
  try { const o = JSON.parse(unb64u(m[1])); return o && typeof o === 'object' && o.apiKey ? o : null; } catch (_) { return null; }
}

// Applique des réglages venus d'ailleurs sur les réglages locaux ; renvoie la liste des clés changées.
export function mergeInto(local, remote, exclus = LOCAL_ONLY) {
  const changed = [];
  for (const k of Object.keys(remote)) {
    if (k === '_t' || k === '_sale' || exclus.includes(k)) continue;
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
    this._gen = (this._gen || 0) + 1;
    clearTimeout(this._timer); this._timer = setTimeout(() => this.push(), 1500);
  }
  async push() {
    if (!this.on) return false;
    const s = this.app.settings, gen = this._gen || 0;
    try {
      // W19 : l'heure du réglage est donnée par le script (réponse « t »), pas par l'horloge de l'appareil. « t » envoyé : seulement
      // pour un ancien script, qui l'attend encore.
      const r = await this.app.remote.ask({ action: 'reglages_ecrire', t: Date.now(), base: s._t || 0, reglages: shareable(s, HORS_SYNCHRO) });
      if (r && r.ok) {
        if (+r.t) s._t = +r.t;
        if ((this._gen || 0) === gen) s._sale = false;               // rien n'a changé pendant l'envoi : plus rien à envoyer
        this.app.saveSettingsQuiet();
        this._ok(r.applique ? 'envoyés' : 'déjà à jour'); return true;
      }
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
      if (s._sale) return this.push();                                         // W19 : un changement d'ici pas encore envoyé l'emporte (dernier arrivé)
      if (rt > lt || (adopt && JSON.stringify(shareable({ ...s, _t: 0 }, HORS_SYNCHRO)) !== JSON.stringify(shareable({ ...s, ...remote, logUrl: s.logUrl, _t: 0 }, HORS_SYNCHRO)))) {
        const changed = mergeInto(s, { ...remote, _t: rt }, HORS_SYNCHRO);
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
