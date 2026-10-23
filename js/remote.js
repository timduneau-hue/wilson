// Wilson — journal à distance : le journal de la tablette part vers la feuille Google « Wilson — journal » de Timothée,
// par son script Apps Script (apps-script/journal.gs). Claude lit cette feuille pour diagnostiquer Wilson lui-même.
//  - lignes du journal : envoyées par paquets toutes les 30 s (plus vite s'il y en a beaucoup) ;
//  - mesures de délais : une ligne par réponse (onglet « Délais ») ;
//  - bilan de la tablette (version, état, vision, batterie…) : onglet « État », rafraîchi au moins toutes les 10 min.
// L'adresse du script est saisie ou scannée (QR code) sur la tablette et reste dessus, comme la clé Gemini.

export const SCRIPT_URL = /^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[\w-]{20,}\/exec\/?$/;
const FLUSH_MS = 30000, PULSE_MS = 10 * 60000, MAXQ = 600, MAXM = 200;

export class RemoteLog {
  constructor(app) {
    this.app = app; this.q = []; this.mesures = []; this.timer = null; this.fails = 0; this.sentAt = 0; this.sent = 0;
    setInterval(() => { if (this.on) this.flush(); }, PULSE_MS);   // pouls : l'onglet État dit si la tablette est toujours en vie
  }
  get url() { return String(this.app.settings.logUrl || '').trim(); }
  get on() { return SCRIPT_URL.test(this.url); }

  // priv : la ligne contient ce que la famille a dit (masquée si « Envoyer aussi les phrases échangées » est décoché).
  line(text, priv = false) {
    if (!this.on) return;
    const m = priv && this.app.settings.logContent === false ? '[phrase masquée]' : String(text);
    this.q.push({ t: Date.now(), m });
    if (this.q.length > MAXQ) this.q.splice(0, this.q.length - MAXQ);
    this._arm(this.q.length >= 80 ? 2000 : FLUSH_MS);
  }
  mesure(o) {
    if (!this.on) return;
    this.mesures.push({ t: Date.now(), ...o });
    if (this.mesures.length > MAXM) this.mesures.shift();
    this._arm(FLUSH_MS);
  }
  _arm(ms) {
    if (this.timer && ms >= FLUSH_MS) return;
    clearTimeout(this.timer); this.timer = setTimeout(() => { this.timer = null; this.flush(); }, ms);
  }

  // Envoie tout ce qui attend (+ le bilan). beacon : la page se ferme ou se recharge, envoi garanti par le navigateur.
  async flush({ beacon = false } = {}) {
    clearTimeout(this.timer); this.timer = null;
    if (!this.on) return false;
    const lignes = this.q.splice(0), mesures = this.mesures.splice(0);
    let bilan = null;
    try { bilan = this.app.bilan(); } catch (e) { bilan = { Bilan: 'erreur : ' + e.message }; }
    const appareil = /Mobile/.test(navigator.userAgent) ? 'téléphone' : 'tablette';
    const body = JSON.stringify({ appareil, version: this.app.version, lignes, mesures, bilan });
    if (beacon && navigator.sendBeacon) {
      try { if (navigator.sendBeacon(this.url, new Blob([body], { type: 'text/plain;charset=utf-8' }))) { this.sentAt = Date.now(); this.sent++; return true; } } catch (_) {}
    }
    try {
      // « no-cors » : Google ne permet pas de lire la réponse, mais le script reçoit bien les données.
      await fetch(this.url, { method: 'POST', mode: 'no-cors', cache: 'no-store', keepalive: body.length < 60000,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body });
      this.fails = 0; this.sentAt = Date.now(); this.sent++;
      return true;
    } catch (e) {
      // Pas de réseau : on garde les lignes et on réessaie de plus en plus tard (jusqu'à 10 min).
      this.fails++;
      this.q = lignes.concat(this.q).slice(-MAXQ); this.mesures = mesures.concat(this.mesures).slice(-MAXM);
      this._arm(Math.min(PULSE_MS, FLUSH_MS * 2 ** this.fails));
      return false;
    }
  }
}

// Question au script (réponse lisible, contrairement au journal) : utilisé pour la recherche Internet (Tavily).
RemoteLog.prototype.ask = async function (payload, signal) {
  if (!this.on) throw new Error('script non configuré');
  const r = await fetch(this.url, { method: 'POST', cache: 'no-store', signal, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
  const txt = await r.text();
  try { return JSON.parse(txt); } catch (_) { throw new Error(/^ok$/i.test(txt.trim()) ? 'le script déployé ne sait pas encore chercher (ancienne version)' : `réponse illisible du script (${r.status})`); }
};

// Lecture d'un QR code avec la caméra de Wilson (adresse du script). onFrame(video) sert à afficher l'aperçu.
export async function scanQR(video, { timeoutMs = 60000, onFrame, signal } = {}) {
  if (!('BarcodeDetector' in window)) throw new Error('cette tablette ne sait pas lire les QR codes : colle l\'adresse à la main');
  let formats = ['qr_code'];
  try { const ok = await BarcodeDetector.getSupportedFormats(); if (!ok.includes('qr_code')) throw new Error('lecture des QR codes indisponible : colle l\'adresse à la main'); } catch (e) { if (/QR/.test(e.message)) throw e; }
  const det = new BarcodeDetector({ formats });
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    if (signal && signal.aborted) return null;
    if (onFrame) onFrame(video);
    try {
      const codes = await det.detect(video);
      for (const c of codes) { const v = String(c.rawValue || '').trim(); if (SCRIPT_URL.test(v)) return v; }
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('aucun QR code de journal vu en 1 minute');
}
