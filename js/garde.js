// Wilson — oreille de garde (PLAN.md, section 7 sexies, G2-G3) : sons de la maison reconnus SUR L'APPAREIL.
// Le travailleur (garde-worker.js, YAMNet) ne tourne que pendant la garde ; ici on juge ce qu'il entend.

// Numéros des sons YAMNet utiles (liste officielle de 521 sons, intégrée au modèle).
export const SONS = {
  fumee: [393, 394],            // « Smoke detector, smoke alarm », « Fire alarm »
  verre: [437, 464, 463],       // « Shatter », « Breaking », « Smash, crash » (avec « Glass » 435)
  verreSeul: 435,
  alarme: [382, 475],           // « Alarm », « Beep, bleep »
  sonnette: [349, 350],         // « Doorbell », « Ding-dong »
  frappe: [353],                // « Knock »
  chien: [69, 70],              // « Dog », « Bark »
  cris: [11],                   // « Screaming »
};
export const NOMS = { fumee: 'détecteur de fumée', verre: 'bris de verre', alarme: 'alarme qui sonne depuis 45 s', sonnette: 'sonnette', frappe: 'on frappe à la porte', chien: 'chien qui aboie', cris: 'cris', inconnu: 'visage inconnu' };
export const URGENT = ['fumee', 'verre', 'alarme', 'inconnu'];
const INFO_ECART_MS = 120000;    // un même son « pour info » n'est noté qu'une fois toutes les 2 min

const score = (m, ids) => Math.max(0, ...ids.map((i) => m.get(i) || 0));

// Juge une analyse (sons = [[numéro, score]…]) avec ce qui a été entendu avant (etat, modifié). Renvoie les événements.
export function jugerSons(sons, etat, now) {
  const m = new Map(sons), ev = [];
  etat.fumee = (etat.fumee || []).filter((t) => now - t < 20000);
  etat.alarme = (etat.alarme || []).filter((t) => now - t < 60000);
  etat.info = etat.info || {};
  // Détecteur de fumée : 3 fois en 20 s (il bipe sans arrêt ; un seul bip peut venir de la télé).
  if (score(m, SONS.fumee) >= 0.3) { etat.fumee.push(now); if (etat.fumee.length >= 3) { ev.push({ genre: 'fumee', score: score(m, SONS.fumee) }); etat.fumee = []; } }
  // Bris de verre : une fois, net.
  const casse = score(m, SONS.verre), verre = m.get(SONS.verreSeul) || 0;
  if (score(m, [437]) >= 0.45 || (casse >= 0.3 && verre >= 0.15)) ev.push({ genre: 'verre', score: Math.max(casse, verre) });
  // Alarme (ou bips) sans arrêt depuis 45 s : pas un téléphone qui sonne.
  if (score(m, SONS.alarme) >= 0.3) {
    const A = etat.alarme;
    if (A.length && now - A[A.length - 1] > 6000) A.length = 0;                     // un trou de plus de 6 s : on recommence
    A.push(now);
    if (now - A[0] >= 45000) { ev.push({ genre: 'alarme', score: score(m, SONS.alarme) }); etat.alarme = []; }
  }
  // Pour info (raconté au retour). Plus les aboiements (remarque de Timothée du 09/11/26, 15h08 : « les bruits de chien, on
  // s'en fout » ; c'est un chien du voisinage) : ni notés, ni racontés.
  for (const [g, seuil] of [['sonnette', 0.3], ['frappe', 0.4], ['cris', 0.45]]) {
    if (score(m, SONS[g]) >= seuil && now - (etat.info[g] || -1e12) > INFO_ECART_MS) { etat.info[g] = now; ev.push({ genre: g, score: score(m, SONS[g]), info: true }); }
  }
  return ev;
}

export class OreilleGarde {
  constructor({ log = () => {}, onEvenement = () => {} } = {}) {
    this.log = log; this.onEvenement = onEvenement; this.worker = null; this.ready = false;
    this.buf = new Float32Array(16000 * 2); this.len = 0; this._depuis = 0; this.n = 0; this._attente = 0;
    this.etat = {}; this.stats = { n: 0, ms: 0, top: '' };
  }
  get on() { return !!this.worker; }
  start() {
    if (this.worker) return;
    try {
      this.worker = new Worker(new URL('./garde-worker.js', import.meta.url));
      this.worker.onmessage = (e) => this._message(e.data);
      this.worker.onerror = (e) => { this.log('Garde : erreur de l\'oreille (' + (e.message || 'inconnue') + ')'); this.stop(); };
      this.etat = {}; this.len = 0; this._attente = 0;
      this.log('Garde : oreille de garde en route (sons reconnus sur l\'appareil)');
    } catch (e) { this.log('Garde : oreille impossible (' + e.message + ')'); }
  }
  stop() { if (!this.worker) return; try { this.worker.terminate(); } catch (_) {} this.worker = null; this.ready = false; this.log('Garde : oreille de garde arrêtée'); }

  // Son du micro (16 kHz). Toutes les 0,5 s, la dernière seconde part à l'analyse (une à la fois, jamais de file d'attente).
  feed(f32) {
    if (!this.worker) return;
    const b = this.buf;
    if (this.len + f32.length > b.length) { const k = this.len + f32.length - b.length; b.copyWithin(0, k, this.len); this.len -= k; }
    b.set(f32, this.len); this.len += f32.length; this._depuis += f32.length;
    if (!this.ready || this.len < 15600 || this._depuis < 8000) return;
    if (this._attente && performance.now() - this._attente < 3000) return;
    this._depuis = 0; this._attente = performance.now();
    const pcm = b.slice(this.len - 15600, this.len);
    this.worker.postMessage({ type: 'son', pcm, n: ++this.n, t: Date.now() }, [pcm.buffer]);
  }

  _message(d) {
    if (d.type === 'ready') {
      if (d.error) { this.log('Garde : modèle des sons indisponible (' + d.error + ')'); this.panne = d.error; this.stop(); return; }
      this.ready = true; this.log('Garde : reconnaissance des sons prête'); return;
    }
    if (d.type !== 'sons') return;
    this._attente = 0;
    if (d.error) { this.log('Garde : analyse impossible (' + d.error + ')'); return; }
    this.stats.n++; this.stats.ms = this.stats.ms ? this.stats.ms * 0.8 + d.ms * 0.2 : d.ms; this.stats.top = (d.sons[0] || []).join(':');
    for (const ev of jugerSons(d.sons, this.etat, performance.now())) this.onEvenement({ ...ev, t: d.t || Date.now() });
  }
}
