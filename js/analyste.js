// Wilson — l'analyste du CRM (PLAN.md, section 2 quater, C11) : répond à N'IMPORTE QUELLE question sur le CRM,
// gratuitement, sans une ligne de code par question.
//  - Gemini (palier gratuit, avec réflexion) reçoit la question et la description des tableaux du CRM (crm_schema) ;
//  - il écrit des recherches simples (table, filtres, regroupement, totaux, tri) que le CRM exécute EN LECTURE SEULE
//    (crm_requete, section 54 du CRM) ;
//  - il lit les résultats, cherche encore si besoin (8 étapes au plus), puis répond en français oral.
// Pas de limite de temps courte : 10 min au plus ; réseau coupé → il attend le réseau et reprend l'étape.

import { cleanKey } from './brain.js';

const API = 'https://generativelanguage.googleapis.com/v1beta/models/';
// Modèles gratuits, du plus réfléchi au plus disponible (les quotas gratuits sont par modèle).
export const ANALYSTE_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
export const ANALYSE_MAX_MS = 10 * 60000;
// Une requête à Gemini sans réponse au bout de 60 s : abandonnée, modèle suivant (journal du 05/11/26, 09h40 : une seule
// étape, aucune recherche, et la réponse est arrivée au bout de 187 s ; rien au journal sur ce qui traînait).
export const REQUETE_MAX_MS = 60000;   // les briefings (modèle qui réfléchit, gros résultats) prennent jusqu'à ~30 s
export const RELAIS_MS = 20000;        // sans réponse au bout de 20 s : le modèle suivant est interrogé en même temps (05/11/26)
// Journal du 05/11/26 : gemini-3.8-flash muet à 11h03 puis de nouveau à 14h44 (l'appli avait redémarré entre-temps et
// l'avait oublié : 20 s perdues). Modèle lent ou surchargé : en dernier pendant 2 h, et retenu même après un redémarrage,
// comme le dernier modèle qui a répondu (essayé en premier).
const LENT_MS = 2 * 3600000;
const MAX_ETAPES = 8;
const TABLES = ['commandes', 'devis', 'devis_a_relancer', 'clients', 'taches', 'comptes_rendus', 'visites', 'veille'];
const OPS = ['=', '!=', '>', '>=', '<', '<=', 'contient', 'ne_contient_pas', 'commence_par', 'entre', 'parmi', 'vide', 'non_vide', 'ressemble'];
const CALCULS = ['nombre', 'somme', 'moyenne', 'min', 'max', 'nb_distinct', 'liste'];

const STR = { type: 'STRING' }, STRS = { type: 'ARRAY', items: STR };
const FILTRE = { type: 'OBJECT', properties: { champ: STR, op: { type: 'STRING', enum: OPS }, valeur: STR, valeurs: STRS }, required: ['champ', 'op'] };
export const ANALYSTE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    action: { type: 'STRING', enum: ['chercher', 'repondre'] },
    pourquoi: STR,
    recherches: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      table: { type: 'STRING', enum: TABLES },
      filtres: { type: 'ARRAY', items: FILTRE },
      grouper: STRS,
      calculs: { type: 'ARRAY', items: { type: 'OBJECT', properties: { op: { type: 'STRING', enum: CALCULS }, champ: STR, nom: STR }, required: ['op'] } },
      avoir: { type: 'ARRAY', items: FILTRE },
      tri: { type: 'OBJECT', properties: { champ: STR, ordre: { type: 'STRING', enum: ['asc', 'desc'] } } },
      limite: { type: 'INTEGER' },
      champs: STRS,
    }, required: ['table'] } },
    reponse: STR,
  },
  required: ['action'],
  propertyOrdering: ['action', 'pourquoi', 'recherches', 'reponse'],
};

export function consigneAnalyste(schema, { voiture = false } = {}) {
  return `Tu es l'analyste du CRM de Timothée, technico-commercial itinérant chez Boschat Laveix (quincaillerie, ferrures, fermetures). Tu réponds à SA question à partir de SES données, en écrivant des recherches que le CRM exécute (lecture seule) et dont tu reçois les résultats.

${schema}

Méthode :
1. Réponds par un objet JSON. Pour chercher : {"action": "chercher", "pourquoi": "ce que tu cherches, en quelques mots", "recherches": [jusqu'à 6 recherches]}. Une recherche : {"table", "filtres": [{"champ", "op", "valeur"}], "grouper": [champs], "calculs": [{"op", "champ", "nom"}], "avoir": [filtres sur les calculs], "tri": {"champ", "ordre"}, "limite", "champs"}.
2. Tu reçois les résultats ; cherche encore si besoin (un nom de client à retrouver, un détail à préciser, une erreur à corriger).
3. Quand tu as de quoi répondre : {"action": "repondre", "reponse": "…"}.

Règles :
${reglesCRM({ voiture })}`;
}

// Les règles du CRM (dates, exercice, dernières commandes, briefings, objectif clients actifs…) : les mêmes pour l'analyste
// Gemini et pour Claude sur le PC de la maison (PLAN 10), qui les reçoit avec chaque question sur le CRM.
export function reglesCRM({ voiture = false } = {}) {
  return `- Ne devine jamais un chiffre, une date ou un nom : tout doit venir d'un résultat.
- Les noms de clients sont souvent mal entendus (il dicte en voiture) : cherche avec « ressemble » ou « contient » sur un mot distinctif, et vérifie que le client trouvé est le bon ; plusieurs clients possibles : dis-le dans la réponse.
- Préfère les calculs (somme, nombre, max…) aux longues listes ; mets une limite.
- « Le mois dernier », « cette année », « depuis trois mois » : calcule les dates à partir d'aujourd'hui. L'exercice va de septembre à août. Le chiffre d'affaires = somme de « montant » des commandes.
- La réponse sera dite à voix haute : français oral, ${voiture ? 'une ou deux phrases très courtes (il conduit)' : 'une à trois phrases courtes'}, l'essentiel d'abord, montants arrondis à l'euro (« 2 860 € »), dates dites naturellement (« le 14 septembre »), tutoiement, pas de liste, pas de symbole ni de mise en forme.
- « Dernières commandes », « dernières ventes », « ce qu'il a acheté » : il veut le CONTENU. Cherche les lignes de commandes du client triées par date (les 2 ou 3 dernières commandes), et réponds d'abord par les articles (désignation simplifiée, quantité), puis la date et le montant de chaque commande. Ne te contente jamais de la date et du total (remarque de Timothée du 04/11/26).
- EXCEPTION, les briefings (remarque de Timothée du 04/11/26 : « une analyse poussée des ventes, des devis et des échanges, pas un résumé de quelques secondes ; tu es mon coach commercial ») : si on te demande un briefing, de préparer un rendez-vous ou une analyse complète d'un client, cherche tout (commandes de l'exercice et du précédent, regroupées par famille ou article ; dernières commandes ; devis en cours et à relancer ; derniers comptes rendus et échanges ; tâches ouvertes ; veille concurrence) puis réponds en 6 à 10 phrases orales enchaînées, sans liste : où en est le chiffre (et la tendance), ce qu'il achète, les devis à relancer, ce qui s'est dit dernièrement, ce qu'il faut proposer et la question à poser au client. C'est la seule réponse longue permise.
- OBJECTIF CLIENTS ACTIFS (accord de Timothée du 04/11/26) : le nombre de clients actifs du mois est celui du bilan du CRM joint à la question (chiffre officiel : ne le recalcule pas). Dis d'abord où il en est (« Tu as 41 clients actifs sur 60 : il t'en manque 19. »). Puis cherche, parmi les clients des rendez-vous du prochain jour ouvré joints, ceux qui n'ont encore rien commandé ce mois-ci ; et les clients habituels (au moins une commande dans les 3 derniers mois) qui n'ont rien commandé ce mois-ci, dans les mêmes villes que ces rendez-vous. Cite-en 3 au plus, les plus gros acheteurs d'abord, avec leur ville. L'objectif est TOUJOURS au moins le nombre de clients actifs du même mois l'an dernier (N-1) (règle de Timothée du 05/11/26) : s'il n'est pas dans le bilan, compte-le (clients distincts ayant au moins une commande ce mois-là l'an dernier) ; prends le plus grand entre ce chiffre et l'objectif donné, et dis-le si c'est N-1 qui fixe l'objectif. 2 à 4 phrases.
- Si les données ne permettent pas de répondre, dis-le simplement et donne ce que tu as trouvé de plus proche.`;
}

const sleep = (ms, signal) => new Promise((ok, ko) => {
  const t = setTimeout(ok, ms);
  if (signal) signal.addEventListener('abort', () => { clearTimeout(t); const e = new Error('Annulé'); e.name = 'AbortError'; ko(e); }, { once: true });
});
const netErr = (e) => !navigator.onLine || (e && (e.name === 'TypeError' || e.network)) || /Failed to fetch|NetworkError|Load failed|network/i.test(String((e && e.message) || ''));

export class Analyste {
  // ask(payload, signal) : question au CRM (par le script de Timothée) ; log(m) : journal.
  constructor({ ask, log = () => {} } = {}) {
    this.ask = ask; this.log = log; this.modelUsed = null; this._schema = null; this.requeteMaxMs = REQUETE_MAX_MS; this.relaisMs = RELAIS_MS; this.lent = {};
    try { this.refused = JSON.parse(localStorage.getItem('wilson.analyste.refus') || '{}') || {}; } catch (_) { this.refused = {}; }
    try {
      const o = JSON.parse(localStorage.getItem('wilson.analyste.lent') || 'null');
      if (o) { this.lent = o.lent || {}; if (ANALYSTE_MODELS.includes(o.modele)) this.modelUsed = o.modele; }
    } catch (_) { this.lent = {}; }
  }

  // Description des tableaux (gardée la journée).
  async schema(signal) {
    const jour = new Date().toDateString();
    if (!this._schema) { try { const o = JSON.parse(localStorage.getItem('wilson.analyste.schema') || 'null'); if (o && o.texte) this._schema = o; } catch (_) {} }
    if (this._schema && this._schema.jour === jour) return this._schema.texte;
    const r = await this.ask({ action: 'crm_schema' }, signal);
    if (!r || !r.ok) {
      const e = new Error(/action inconnue/.test((r && r.erreur) || '') ? 'le CRM n\'a pas encore le moteur de questions (coller le nouveau WebApp_autonome.gs et déployer une nouvelle version)' : ((r && r.erreur) || 'description du CRM indisponible'));
      e.crm = true; throw e;
    }
    this._schema = { jour, texte: r.texte };
    try { localStorage.setItem('wilson.analyste.schema', JSON.stringify(this._schema)); } catch (_) {}   // gardée la journée, même après un redémarrage (04/11/26)
    return r.texte;
  }

  // Une requête à Gemini (JSON imposé). Journal du 05/11/26, 11h03-11h04 : gemini-3.8-flash muet 60 s avant de passer au
  // suivant (qui a répondu en 5 s), puis 11h05:58-11h06:00 deux modèles « high demand ». Désormais : sans réponse au bout de
  // 20 s, le modèle suivant est interrogé en même temps (le premier qui répond gagne, l'autre est arrêté) ; un modèle lent ou
  // surchargé passe en dernier pendant 15 min ; quota épuisé : en dernier pendant 1 h. Réseau coupé : on attend.
  _gemini({ key, system, contents, signal, until }) {
    const now = Date.now();
    const pref = this.modelUsed ? [this.modelUsed, ...ANALYSTE_MODELS.filter((m) => m !== this.modelUsed)] : ANALYSTE_MODELS;
    const ko = (m) => this.refused[m] > now, lent = (m) => this.lent[m] > now;
    const models = [...pref.filter((m) => !ko(m) && !lent(m)), ...pref.filter((m) => !ko(m) && lent(m)), ...pref.filter(ko)];
    return new Promise((resoudre, rejeter) => {
      let i = 0, enCours = 0, fini = false, last = null, relais = null;
      const ctls = [];
      const fin = (f) => { if (fini) return; fini = true; clearTimeout(relais); for (const c of ctls) c.abort(); f(); };
      const lancer = () => {
        if (fini) return;
        if (i >= models.length) { if (!enCours) fin(() => rejeter(last || new Error('aucun modèle disponible'))); return; }
        const model = models[i++], c = new AbortController(); ctls.push(c);
        if (signal) { if (signal.aborted) c.abort(); else signal.addEventListener('abort', () => c.abort(), { once: true }); }
        enCours++;
        clearTimeout(relais);
        relais = setTimeout(() => {
          if (fini || i >= models.length || enCours >= 2) return;
          this.lent[model] = Date.now() + LENT_MS; this._saveLent();   // lent : en dernier la prochaine fois (sauf s'il répond quand même)
          this.log(`Analyste : ${model} sans réponse en ${Math.round(this.relaisMs / 1000)} s : ${models[i]} interrogé en même temps`);
          lancer();
        }, this.relaisMs);
        this._modele(model, { key, system, contents, signal: c.signal, until }).then((r) => { enCours--; fin(() => resoudre(r)); }, (e) => {
          enCours--;
          if (fini) return;
          if ((signal && signal.aborted) || e.auth) { fin(() => rejeter(e)); return; }
          if (e.name !== 'AbortError') last = e;
          if (enCours < 2) lancer();
          if (!enCours && i >= models.length) fin(() => rejeter(last || e));
        });
      };
      lancer();
    });
  }
  // Un modèle : avec le schéma JSON, puis sans s'il est refusé ; délai maximal par requête ; réseau coupé : on attend.
  async _modele(model, { key, system, contents, signal, until }) {
    for (let schema = true; ; schema = false) {
      const body = { systemInstruction: { parts: [{ text: system }] }, contents,
        generationConfig: { maxOutputTokens: 8192, responseMimeType: 'application/json', ...(schema ? { responseSchema: ANALYSTE_SCHEMA } : {}) } };
      let r, j = null, trop = false;
      const t1 = Date.now();
      for (;;) {                                          // réseau coupé : on attend qu'il revienne (C8), jusqu'au délai
        const c = new AbortController(), stop = () => c.abort(), minut = setTimeout(() => { trop = true; c.abort(); }, this.requeteMaxMs);
        if (signal) { if (signal.aborted) c.abort(); else signal.addEventListener('abort', stop, { once: true }); }
        try { r = await fetch(API + model + ':generateContent', { method: 'POST', signal: c.signal, headers: { 'x-goog-api-key': cleanKey(key), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); try { j = await r.json(); } catch (_) {} break; }
        catch (e) {
          if (trop && !(signal && signal.aborted)) break;                   // trop long : modèle suivant
          if (e.name === 'AbortError' || !netErr(e)) throw e;
          if (Date.now() > until) throw e;
          this.log('Analyste : pas de réseau, j\'attends');
          await sleep(5000, signal);
        } finally { clearTimeout(minut); if (signal) signal.removeEventListener('abort', stop); }
      }
      if (trop) {
        this.lent[model] = Date.now() + LENT_MS; this._saveLent();
        this.log(`Analyste : ${model} sans réponse en ${Math.round((Date.now() - t1) / 1000)} s : modèle suivant`);
        throw new Error(`${model} sans réponse en ${Math.round(this.requeteMaxMs / 1000)} s`);
      }
      if (r.ok) {
        const parts = ((((j && j.candidates) || [])[0] || {}).content || {}).parts || [];
        const txt = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('');
        let out = null;
        try { out = JSON.parse(txt.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (_) {}
        if (out && out.action) {
          if (this.refused[model]) { delete this.refused[model]; this._saveRefus(); }
          delete this.lent[model];
          this.modelUsed = model; this._saveLent(); return { out, model, txt };
        }
        this.log(`Analyste : ${model} → réponse illisible : modèle suivant`);
        throw new Error('réponse illisible de Gemini');
      }
      const msg = (j && j.error && j.error.message) || `erreur ${r.status}`;
      const err = new Error(msg); err.status = r.status;
      this.log(`Analyste : ${model} → ${String(msg).slice(0, 100)} (${Math.round((Date.now() - t1) / 1000)} s)`);
      if (r.status === 401 || r.status === 403) { err.auth = true; throw err; }
      if (r.status === 429 || /quota|exhausted|rate.?limit/i.test(msg)) { this.refused[model] = Date.now() + 3600000; this._saveRefus(); throw err; }
      // Journal du 05/11/26, 19h22:54 : « models/gemini-2.5-flash is no longer available to new users » à chaque question (une
      // requête et une seconde perdues à chaque fois) : un modèle fermé n'est plus essayé pendant 30 jours.
      if (r.status === 404 || /no longer available|not found|not supported/i.test(msg)) { this.refused[model] = Date.now() + 30 * 86400000; this._saveRefus(); throw err; }
      if (r.status === 400 && schema && /schema|mime|json|enum|propert/i.test(msg)) continue;      // schéma refusé : même modèle, sans schéma
      if (r.status === 503 || /high demand|overloaded|unavailable/i.test(msg)) { this.lent[model] = Date.now() + LENT_MS; this._saveLent(); }
      throw err;                                                                                       // modèle indisponible : suivant
    }
  }
  _saveRefus() { try { localStorage.setItem('wilson.analyste.refus', JSON.stringify(this.refused)); } catch (_) {} }
  _saveLent() { try { localStorage.setItem('wilson.analyste.lent', JSON.stringify({ lent: this.lent, modele: this.modelUsed })); } catch (_) {} }

  // La question → { reponse, etapes, recherches, model, ms }. onEtape(n, pourquoi) à chaque étape.
  async repondre({ key, question, contexte = '', voiture = false, signal, onEtape }) {
    const t0 = Date.now(), until = t0 + ANALYSE_MAX_MS;
    const schema = await this.schema(signal);
    const system = consigneAnalyste(schema, { voiture });
    const contents = [{ role: 'user', parts: [{ text: `Question de Timothée : « ${question} »${contexte ? '\n' + contexte : ''}` }] }];
    let n = 0, model = null;
    for (let etape = 1; etape <= MAX_ETAPES; etape++) {
      if (Date.now() > until) break;
      if (etape === MAX_ETAPES) contents.push({ role: 'user', parts: [{ text: 'Dernière étape : réponds maintenant (action « repondre ») avec ce que tu as trouvé.' }] });
      const g = await this._gemini({ key, system, contents, signal, until });
      model = g.model;
      const o = g.out;
      contents.push({ role: 'model', parts: [{ text: g.txt }] });
      if (o.action === 'repondre' || !(o.recherches || []).length) {
        const reponse = String(o.reponse || '').trim() || 'Je n\'ai pas trouvé de réponse claire dans le CRM.';
        return { reponse, etapes: etape, recherches: n, model, ms: Date.now() - t0 };
      }
      if (onEtape) onEtape(etape, o.pourquoi || '', o.recherches);
      let res;
      for (;;) {
        try { res = await this.ask({ action: 'crm_requete', requetes: o.recherches.slice(0, 6) }, signal); break; }
        catch (e) {
          if (e.name === 'AbortError' || !netErr(e) || Date.now() > until) throw e;
          this.log('Analyste : pas de réseau vers le CRM, j\'attends'); await sleep(5000, signal);
        }
      }
      n += o.recherches.length;
      const texte = res && res.ok ? res.texte : `ERREUR du CRM : ${(res && res.erreur) || 'réponse vide'}`;
      contents.push({ role: 'user', parts: [{ text: `Résultats :\n${texte}` }] });
    }
    return { reponse: 'Je n\'ai pas réussi à trouver la réponse dans le temps imparti.', etapes: MAX_ETAPES, recherches: n, model, ms: Date.now() - t0 };
  }
}
