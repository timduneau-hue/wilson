// Wilson — les questions difficiles passent par Claude, sur le PC de la maison (PLAN.md, section 10).
//  - question_difficile : référence à identifier, équivalent Boschat, comparaison de fiches techniques, question technique ;
//  - crm_question (questions inhabituelles sur ses données) : Claude d'abord quand le PC répond, l'analyste Gemini sinon.
// Chemin : Wilson → script « Wilson journal » (file d'attente) → relais du PC (claude -p, abonnement de Timothée) → script →
// Wilson. Le PC ne répond pas (éteint, en veille, planté) : Wilson le dit et fait au mieux sans lui (K6).

export const CLAUDE_TOOL = {
  name: 'question_difficile', behavior: 'BLOCKING',
  description: "Question qui demande de vraiment chercher et lire des sources : identifier une référence de produit (même approximative), trouver l'équivalent Boschat d'un produit concurrent (Setin, Foussier, Legallais…), comparer deux produits d'après leurs fiches techniques, une question technique, normative ou réglementaire. Claude, sur l'ordinateur de la maison, cherche sur Internet, ouvre les fiches et répond (30 s à 2 min). Avant de l'appeler, dis seulement « Je cherche. ». Pas pour la météo, l'heure, l'actualité ou une petite info (chercher), ni pour ses clients (outils du CRM).",
  parameters: { type: 'OBJECT', properties: { question: { type: 'STRING', description: 'la question complète, avec les références, marques et dimensions dites' } }, required: ['question'] },
};

export const CLAUDE_MAX_MS = 4 * 60000;   // Claude a 4 min au plus (le relais l'arrête au-delà)
export const PRISE_MAX_MS = 30000;        // pas prise par le PC en 30 s : il ne répondra pas
const VU_MS = 20000;                      // état du PC gardé 20 s

const pause = (ms, signal) => new Promise((ok, ko) => {
  const t = setTimeout(ok, ms);
  if (signal) signal.addEventListener('abort', () => { clearTimeout(t); const e = new Error('Annulé'); e.name = 'AbortError'; ko(e); }, { once: true });
});
const reseau = (e) => (e && (e.name === 'TypeError' || e.reseau)) || /Failed to fetch|NetworkError|Load failed|network|trop long/i.test(String((e && e.message) || ''));

export class ClaudePC {
  // app : remote (ask), settings (claudePC), log
  constructor(app) { this.app = app; this.pc = null; this.pcAt = 0; this.n = 0; this.priseMaxMs = PRISE_MAX_MS; this.maxMs = CLAUDE_MAX_MS + 15000; }
  get on() { return !!(this.app.remote && this.app.remote.on) && this.app.settings.claudePC !== false; }

  // Une requête au script, bornée dans le temps (le script attend lui-même jusqu'à 15 s).
  async _ask(payload, signal, ms = 30000) {
    const ctl = new AbortController(), stop = () => ctl.abort();
    if (signal) { if (signal.aborted) stop(); else signal.addEventListener('abort', stop, { once: true }); }
    let trop = false; const t = setTimeout(() => { trop = true; ctl.abort(); }, ms);
    try { return await this.app.remote.ask(payload, ctl.signal); }
    catch (e) {
      if (trop && !(signal && signal.aborted)) { const x = new Error(`pas de réponse du script en ${Math.round(ms / 1000)} s (réseau trop long)`); x.reseau = true; throw x; }
      throw e;
    } finally { clearTimeout(t); if (signal) signal.removeEventListener('abort', stop); }
  }

  async etat(signal, force = false) {
    if (!this.on) return null;
    if (!force && this.pc && Date.now() - this.pcAt < VU_MS) return this.pc;
    const r = await this._ask({ action: 'claude_etat' }, signal, 20000);
    if (r && r.ok) { this.pc = r.pc; this.pcAt = Date.now(); }
    return this.pc;
  }
  // Pour l'onglet État du journal.
  etatDit() {
    if (!this.on) return 'coupé';
    if (!this.pc) return 'pas encore vérifié';
    return this.pc.vivant ? `PC présent (vu il y a ${this.pc.vu} s${this.pc.occupe ? `, ${this.pc.occupe} question(s) en cours` : ''})` : `PC absent${this.pc.vu != null ? ` (vu il y a ${Math.round(this.pc.vu / 60)} min)` : ' (jamais vu : relais pas installé ?)'}`;
  }

  // La question → { ok: true, dire, detail, etapes, ms } ou { ok: false, raison, message } (raison : absent, pas_pris, trop_long,
  // erreur, script). Jamais d'exception sauf annulation (AbortError).
  // crm : Claude peut-il lire le CRM (seulement si c'est Timothée qui demande, règle du 06/11/26) ?
  async repondre({ question, type = 'internet', contexte = '', regles = '', voiture = false, crm = false, appareil = '', signal, onPris } = {}) {
    const t0 = Date.now(), id = `w${t0.toString(36)}${(++this.n).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    // PC absent il y a moins d'une minute : pas la peine de redemander (la recherche de secours part tout de suite).
    if (this.pc && !this.pc.vivant && Date.now() - this.pcAt < 60000) return { ok: false, raison: 'absent', message: this.pc.vu != null ? `vu il y a ${Math.round(this.pc.vu / 60)} min` : 'jamais vu' };
    let r = null;
    for (let essai = 0; ; essai++) {                                          // réseau mobile capricieux : on redemande (même id, pas de doublon)
      try { r = await this._ask({ action: 'claude_demander', id, question, type, contexte, regles, voiture, crm: !!crm, appareil }, signal, 20000); break; }
      catch (e) {
        if (e.name === 'AbortError' && signal && signal.aborted) throw e;
        if (!reseau(e) || essai >= 2) return { ok: false, raison: 'script', message: e.message };
        await pause(3000, signal);
      }
    }
    if (!r || !r.ok) {
      if (r && /action inconnue/.test(r.erreur || '')) { this.pc = { vivant: false, vu: null }; this.pcAt = Date.now(); }   // script pas encore en version 9
      return { ok: false, raison: 'script', message: (r && r.erreur) || 'réponse vide du script' };
    }
    if (r.pc) { this.pc = r.pc; this.pcAt = Date.now(); }
    if (!r.accepte) return { ok: false, raison: 'absent', message: r.pc && r.pc.vu != null ? `vu il y a ${Math.round(r.pc.vu / 60)} min` : 'jamais vu' };
    let etat = r.etat || 'attente', pris = false;
    const annuler = () => this._ask({ action: 'claude_annuler', id }, null, 15000).catch(() => {});
    for (;;) {
      if (signal && signal.aborted) { annuler(); const e = new Error('Annulé'); e.name = 'AbortError'; throw e; }
      const ecoule = Date.now() - t0;
      if (!pris && etat === 'attente' && ecoule > this.priseMaxMs) { annuler(); return { ok: false, raison: 'pas_pris', message: `question pas prise par le PC en ${Math.round(this.priseMaxMs / 1000)} s` }; }
      if (ecoule > this.maxMs) { annuler(); return { ok: false, raison: 'trop_long', message: `pas de réponse en ${Math.round(ecoule / 60000)} min` }; }
      let s;
      try { s = await this._ask({ action: 'claude_resultat', id, attente: pris ? 15 : Math.min(15, Math.max(1, Math.round((this.priseMaxMs - ecoule) / 1000))), etat }, signal, 30000); }
      catch (e) {
        if (e.name === 'AbortError' && signal && signal.aborted) { annuler(); throw e; }
        await pause(3000, signal); continue;                                   // réseau coupé : on attend qu'il revienne
      }
      if (!s || !s.ok) return { ok: false, raison: 'script', message: (s && s.erreur) || 'réponse vide du script' };
      if (s.pc) { this.pc = s.pc; this.pcAt = Date.now(); }
      etat = s.etat;
      if (!pris && (etat === 'en_cours' || etat === 'faite')) { pris = true; if (onPris) onPris(s.pris); }
      if (etat === 'faite') return { ok: true, dire: s.dire, detail: s.detail || '', etapes: s.etapes || 0, ms: Date.now() - t0, duree: s.duree || 0 };
      if (etat === 'erreur') return { ok: false, raison: 'erreur', message: s.erreur || 'erreur du relais' };
      if (etat === 'annulee') return { ok: false, raison: 'erreur', message: 'question annulée' };
    }
  }
}

// Ce que Wilson dit quand le PC ne peut pas répondre (K6) : une phrase, puis il fait au mieux sans lui.
export function phraseIndispo(raison) {
  return raison === 'absent' ? "l'ordinateur de la maison ne répond pas (éteint ou en veille)"
    : raison === 'pas_pris' ? "l'ordinateur de la maison n'a pas pris la question"
      : raison === 'trop_long' ? "Claude n'a pas répondu à temps"
        : "Claude n'a pas pu répondre";
}
