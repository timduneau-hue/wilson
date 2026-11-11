// Wilson — les questions de Claude à Timothée (PLAN.md, section 7 septies, D ; demande de Timothée du 05/11/26).
// La nuit, Claude analyse le journal de Wilson pour l'améliorer ; s'il a besoin d'une précision, il écrit sa question dans
// l'onglet « Questions » de la feuille du journal (3 en attente au plus). Wilson la pose à Timothée — à lui seulement : sur son
// téléphone, ou sur la tablette quand son visage est reconnu à coup sûr —, une par discussion, à un moment naturel, puis écrit
// la réponse à côté de la question (outil repondre_question en direct ; sinon la passe de mémoire la retrouve dans l'échange).
// La réponse sert à Claude pour la mise à jour suivante. Sans réponse, la même question revient au plus toutes les 3 heures.

import { ecrireLocal } from './stockage.js';
const K = 'wilson.questions', K_POSEES = 'wilson.questions.posees', K_ATT = 'wilson.questions.attente';
export const PROPRIO = 'Timothée';
const ECART_MS = 3 * 3600000, LIRE_MS = 30 * 60000;
const lire = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (_) { return d; } };
const ecrire = ecrireLocal;   // W18 : un échec est noté au journal (js/stockage.js)
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set('le la les de du des un une et a au aux en est son sa ses mon ma mes ton ta tes il elle on qui que je tu nous vous ils elles ce cette pour par sur dans avec pas quand quoi comment est-ce'.split(' '));
const mots = (s) => norm(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w));

export const QUESTION_TOOL = { name: 'repondre_question', behavior: 'BLOCKING',
  description: "Timothée vient de répondre à la question de Claude que tu lui as posée (elle est dans tes consignes, avec son id) : id = l'id de la question, reponse = sa réponse, mise au propre, sans rien inventer ni trop résumer. Seulement Timothée. S'il dit « plus tard » ou ne veut pas répondre, n'appelle pas cet outil.",
  parameters: { type: 'OBJECT', properties: { id: { type: 'STRING' }, reponse: { type: 'STRING' } }, required: ['id', 'reponse'] } };

export class Questions {
  constructor(app) {
    this.app = app;
    this.liste = lire(K, []); this.posees = lire(K_POSEES, {}); this.att = lire(K_ATT, []);
    this.enCours = null;   // { id, question, conv, posee }
    this._lireAt = 0; this.etat = ''; this.repondues = 0;
    setInterval(() => { if (this.remote && this.remote.on && (Date.now() - this._lireAt > LIRE_MS || this.att.length)) this.synchroniser(); }, 5 * 60000);
  }
  get remote() { return this.app.remote; }
  log(m, priv) { this.app.log(m, priv); }
  _sauver() { ecrire(K, this.liste); ecrire(K_POSEES, this.posees); ecrire(K_ATT, this.att); }

  async synchroniser() {
    if (!this.remote || !this.remote.on || this._sync) return false;
    this._sync = true;
    try {
      for (const a of [...this.att]) {          // réponses pas encore écrites dans la feuille
        const r = await this.remote.ask({ action: 'q_repondre', ...a });
        if (r && (r.ok || /introuvable/.test(r.erreur || ''))) this.att = this.att.filter((x) => x !== a);
        else break;
      }
      const r = await this.remote.ask({ action: 'q_lire' });
      this._lireAt = Date.now();
      if (!r || !r.ok || !Array.isArray(r.questions)) {
        this.etat = /action inconnue/.test(String(r && r.erreur)) ? 'script pas encore à jour' : 'erreur : ' + String(r && r.erreur);
        return false;
      }
      const dejaRepondu = new Set(this.att.map((a) => a.id));
      this.liste = r.questions.filter((q) => q && q.id && q.question && !dejaRepondu.has(q.id));
      for (const id of Object.keys(this.posees)) if (!this.liste.some((q) => q.id === id) && Date.now() - this.posees[id] > 7 * 86400000) delete this.posees[id];
      this.etat = 'ok';
      return true;
    } catch (e) { this.etat = 'erreur : ' + (e.message || e); return false; }
    finally { this._sauver(); this._sync = false; }
  }

  // Pour la consigne de Gemini : seulement quand c'est Timothée qui parle (parle = son prénom, sinon rien).
  contexte({ parle = '', conv = 0, mode = 'live', voiture = false } = {}) {
    if (norm(parle) !== norm(PROPRIO)) return '';
    let q = this.enCours && this.enCours.conv === conv ? this.liste.find((x) => x.id === this.enCours.id) : null;
    if (!q) {
      this.enCours = null;
      q = this.liste.find((x) => Date.now() - (this.posees[x.id] || 0) > ECART_MS);
      if (!q) return '';
      this.enCours = { id: q.id, question: q.question, conv, posee: false };
    }
    const repondre = mode === 'live' ? `S'il répond, appelle repondre_question (id « ${q.id} ») avec sa réponse, puis remercie-le en quelques mots.` : 'S\'il répond, remercie-le simplement : sa réponse sera transmise.';
    if (this.enCours.posee) return `Tu as posé à Timothée cette question de Claude : « ${q.question} ». ${repondre} S'il ne veut pas répondre maintenant, n'insiste pas.`;
    return `Une question de Claude pour Timothée (Claude prépare tes mises à jour la nuit ; il a besoin de sa réponse pour la prochaine) : « ${q.question} »${q.pourquoi ? ` (pourquoi il demande : ${q.pourquoi})` : ''}.
Pose-la UNE fois, à un moment naturel : quand sa demande est réglée, jamais à la place d'une réponse ni au milieu d'une recherche${voiture ? ', en une phrase courte (il conduit)' : ''}. Commence par « Au fait, Claude m'a demandé de te poser une question pour ma prochaine mise à jour : … ». ${repondre} S'il dit « plus tard » ou ne veut pas répondre, n'insiste pas. Ne la pose à personne d'autre que Timothée.`;
  }

  // Ce que Wilson vient de dire : a-t-il posé la question ? (une bonne part de ses mots, ou « Claude » + « question »)
  dit(texte, conv) {
    const e = this.enCours; if (!e || e.posee || e.conv !== conv || !texte) return;
    const qm = new Set(mots(e.question)), dm = new Set(mots(texte)), communs = [...qm].filter((m) => dm.has(m)).length;
    if ((qm.size && communs / qm.size >= 0.5) || (/claude/i.test(texte) && /question/i.test(texte))) {
      e.posee = true; this.posees[e.id] = Date.now(); this._sauver();
      this.log(`Question de Claude posée à Timothée [${e.id}] : « ${e.question} »`);
    }
  }
  // Questions posées pendant cette discussion et toujours sans réponse (pour la passe de mémoire).
  poseesSansReponse(conv) {
    const e = this.enCours;
    return e && e.posee && e.conv === conv && this.liste.some((q) => q.id === e.id) ? [{ id: e.id, question: e.question }] : [];
  }

  // La réponse de Timothée : rangée à côté de la question (et dans le journal, que Claude lit la nuit).
  async repondre(id, reponse, comment = 'outil') {
    const q = this.liste.find((x) => x.id === String(id)), rep = String(reponse || '').replace(/\s+/g, ' ').trim().slice(0, 1000);
    if (!q) return 'Je ne retrouve pas cette question : dis-lui simplement merci.';
    if (!rep) return 'Réponse vide : rien n\'est transmis.';
    this.liste = this.liste.filter((x) => x.id !== q.id); this.repondues++;
    if (this.enCours && this.enCours.id === q.id) this.enCours = null;
    this.att.push({ id: q.id, reponse: rep, t: Date.now() }); this._sauver();
    this.log(`RÉPONSE DE TIMOTHÉE à la question de Claude [${q.id}] « ${q.question} » : « ${rep} » (${comment})`);
    if (this.remote && this.remote.on) this.synchroniser().catch(() => {});
    return 'Réponse transmise à Claude pour ta prochaine mise à jour. Remercie Timothée en quelques mots.';
  }
  decrire() { return `${this.liste.length} en attente${this.att.length ? `, ${this.att.length} réponse(s) à envoyer` : ''}${this.repondues ? `, ${this.repondues} répondue(s)` : ''}${this.etat && this.etat !== 'ok' ? ` — ${this.etat}` : ''}`; }
}
