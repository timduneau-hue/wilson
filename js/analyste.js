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
- Ne devine jamais un chiffre, une date ou un nom : tout doit venir d'un résultat.
- Les noms de clients sont souvent mal entendus (il dicte en voiture) : cherche avec « ressemble » ou « contient » sur un mot distinctif, et vérifie que le client trouvé est le bon ; plusieurs clients possibles : dis-le dans la réponse.
- Préfère les calculs (somme, nombre, max…) aux longues listes ; mets une limite.
- « Le mois dernier », « cette année », « depuis trois mois » : calcule les dates à partir d'aujourd'hui. L'exercice va de septembre à août. Le chiffre d'affaires = somme de « montant » des commandes.
- La réponse sera dite à voix haute : français oral, ${voiture ? 'une ou deux phrases très courtes (il conduit)' : 'une à trois phrases courtes'}, l'essentiel d'abord, montants arrondis à l'euro (« 2 860 € »), dates dites naturellement (« le 14 septembre »), tutoiement, pas de liste, pas de symbole ni de mise en forme.
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
    this.ask = ask; this.log = log; this.modelUsed = null; this._schema = null;
    try { this.refused = JSON.parse(localStorage.getItem('wilson.analyste.refus') || '{}') || {}; } catch (_) { this.refused = {}; }
  }

  // Description des tableaux (gardée la journée).
  async schema(signal) {
    const jour = new Date().toDateString();
    if (this._schema && this._schema.jour === jour) return this._schema.texte;
    const r = await this.ask({ action: 'crm_schema' }, signal);
    if (!r || !r.ok) {
      const e = new Error(/action inconnue/.test((r && r.erreur) || '') ? 'le CRM n\'a pas encore le moteur de questions (coller le nouveau WebApp_autonome.gs et déployer une nouvelle version)' : ((r && r.erreur) || 'description du CRM indisponible'));
      e.crm = true; throw e;
    }
    this._schema = { jour, texte: r.texte };
    return r.texte;
  }

  // Une requête à Gemini (JSON imposé), modèle suivant si quota ou modèle indisponible. Réseau coupé : on attend.
  async _gemini({ key, system, contents, signal, until }) {
    const now = Date.now();
    const pref = this.modelUsed ? [this.modelUsed, ...ANALYSTE_MODELS.filter((m) => m !== this.modelUsed)] : ANALYSTE_MODELS;
    const models = [...pref.filter((m) => !(this.refused[m] > now)), ...pref.filter((m) => this.refused[m] > now)];
    let last = null;
    for (const model of models) {
      for (let schema = true; ; schema = false) {
        const body = { systemInstruction: { parts: [{ text: system }] }, contents,
          generationConfig: { maxOutputTokens: 8192, responseMimeType: 'application/json', ...(schema ? { responseSchema: ANALYSTE_SCHEMA } : {}) } };
        let r, j = null;
        for (;;) {                                          // réseau coupé : on attend qu'il revienne (C8), jusqu'au délai
          try { r = await fetch(API + model + ':generateContent', { method: 'POST', signal, headers: { 'x-goog-api-key': cleanKey(key), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); break; }
          catch (e) {
            if (e.name === 'AbortError' || !netErr(e)) throw e;
            if (Date.now() > until) throw e;
            this.log('Analyste : pas de réseau, j\'attends');
            await sleep(5000, signal);
          }
        }
        try { j = await r.json(); } catch (_) {}
        if (r.ok) {
          const parts = ((((j && j.candidates) || [])[0] || {}).content || {}).parts || [];
          const txt = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('');
          let out = null;
          try { out = JSON.parse(txt.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (_) {}
          if (out && out.action) {
            if (this.refused[model]) { delete this.refused[model]; this._saveRefus(); }
            this.modelUsed = model; return { out, model, txt };
          }
          last = new Error('réponse illisible de Gemini'); break;
        }
        const msg = (j && j.error && j.error.message) || `erreur ${r.status}`;
        last = new Error(msg); last.status = r.status;
        if (r.status === 401 || r.status === 403) { last.auth = true; throw last; }
        if (r.status === 429 || /quota|exhausted|rate.?limit/i.test(msg)) { this.refused[model] = Date.now() + 3600000; this._saveRefus(); break; }
        if (r.status === 400 && schema && /schema|mime|json|enum|propert/i.test(msg)) continue;      // schéma refusé : même modèle, sans schéma
        break;                                                                                          // modèle indisponible : suivant
      }
    }
    throw last || new Error('aucun modèle disponible');
  }
  _saveRefus() { try { localStorage.setItem('wilson.analyste.refus', JSON.stringify(this.refused)); } catch (_) {} }

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
