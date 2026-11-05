// Wilson — le CRM de Timothée pour Claude, EN LECTURE SEULE (PLAN.md, section 10, K3).
// Petit serveur MCP (stdio, JSON-RPC par lignes) lancé par Claude Code sur le PC de la maison. Chaque outil ne fait qu'une
// lecture, relayée par le script « Wilson journal » au CRM (mêmes fonctions que les outils de Wilson). Aucune écriture n'est
// possible : il n'existe aucun outil pour ça ici (les écritures restent crm_noter + « oui » dans Wilson, règle C2).

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));

const OPS = ['=', '!=', '>', '>=', '<', '<=', 'contient', 'ne_contient_pas', 'commence_par', 'entre', 'parmi', 'vide', 'non_vide', 'ressemble'];
const CALCULS = ['nombre', 'somme', 'moyenne', 'min', 'max', 'nb_distinct', 'liste'];
const TABLES = ['commandes', 'devis', 'devis_a_relancer', 'clients', 'taches', 'comptes_rendus', 'visites', 'veille'];
const FILTRE = { type: 'object', properties: { champ: { type: 'string' }, op: { type: 'string', enum: OPS }, valeur: { type: 'string' }, valeurs: { type: 'array', items: { type: 'string' } } }, required: ['champ', 'op'] };

// Outil → action du CRM (lecture seulement).
export const OUTILS = [
  { name: 'crm_description', action: 'crm_schema',
    description: 'Description des tableaux du CRM (tables, champs, exemples de valeurs). À lire en premier avant crm_recherche.',
    inputSchema: { type: 'object', properties: {} } },
  { name: 'crm_recherche', action: 'crm_requete',
    description: `Recherches dans les données du CRM, exécutées en lecture seule (jusqu'à 6 à la fois). Une recherche : {"table", "filtres": [{"champ", "op", "valeur" ou "valeurs"}], "grouper": [champs], "calculs": [{"op", "champ", "nom"}], "avoir": [filtres sur les calculs], "tri": {"champ", "ordre": "asc"|"desc"}, "limite", "champs": [champs à rendre]}. Tables : ${TABLES.join(', ')}. Opérateurs : ${OPS.join(', ')}. Calculs : ${CALCULS.join(', ')}. Les noms de clients sont souvent mal entendus : chercher avec « ressemble » ou « contient » sur un mot distinctif.`,
    inputSchema: { type: 'object', properties: { requetes: { type: 'array', maxItems: 6, items: { type: 'object', properties: {
      table: { type: 'string', enum: TABLES }, filtres: { type: 'array', items: FILTRE }, grouper: { type: 'array', items: { type: 'string' } },
      calculs: { type: 'array', items: { type: 'object', properties: { op: { type: 'string', enum: CALCULS }, champ: { type: 'string' }, nom: { type: 'string' } }, required: ['op'] } },
      avoir: { type: 'array', items: FILTRE }, tri: { type: 'object', properties: { champ: { type: 'string' }, ordre: { type: 'string', enum: ['asc', 'desc'] } } },
      limite: { type: 'integer' }, champs: { type: 'array', items: { type: 'string' } } }, required: ['table'] } } }, required: ['requetes'] },
    payload: (a) => ({ requetes: (a.requetes || []).slice(0, 6) }) },
  { name: 'crm_fiche_client', action: 'crm_client',
    description: "Tout ce que le CRM sait d'un client (société ou contact, même mal orthographié) : contacts, prochain rendez-vous, visites, comptes rendus, tâches, chiffre d'affaires, commandes, devis, articles achetés, achats chez les concurrents.",
    inputSchema: { type: 'object', properties: { client: { type: 'string' } }, required: ['client'] }, payload: (a) => ({ client: String(a.client || '') }) },
  { name: 'crm_journee', action: 'crm_journee',
    description: "Rendez-vous et tâches d'un jour (« aujourdhui », « demain », un jour de la semaine ou une date jj/mm/aa).",
    inputSchema: { type: 'object', properties: { jour: { type: 'string' } } }, payload: (a) => ({ jour: String(a.jour || 'aujourdhui') }) },
  { name: 'crm_bilan', action: 'crm_bilan',
    description: "Chiffre d'affaires tous clients confondus : exercice à ce jour (septembre à août), mois en cours, comparaison avec l'an dernier, clients actifs du mois (chiffre officiel), plus gros écarts.",
    inputSchema: { type: 'object', properties: {} } },
  { name: 'crm_produit', action: 'crm_produit',
    description: "Catalogue et ventes Boschat : quels clients achètent un fabricant ou un article (question « qui_achete »), ou référence, prix et disponibilité d'un article Boschat (question « infos »).",
    inputSchema: { type: 'object', properties: { produit: { type: 'string' }, question: { type: 'string', enum: ['qui_achete', 'infos'] } }, required: ['produit'] },
    payload: (a) => ({ produit: String(a.produit || ''), question: a.question === 'infos' ? 'infos' : 'qui_achete' }) },
];

export async function appeler(nom, args, { script, fetchImpl = globalThis.fetch } = {}) {
  const o = OUTILS.find((x) => x.name === nom);
  if (!o) return { isError: true, content: [{ type: 'text', text: `outil inconnu : ${nom}` }] };
  if (!/^crm_(schema|requete|client|journee|bilan|produit)$/.test(o.action)) throw new Error('lecture seule');   // garde-fou
  try {
    const r = await fetchImpl(script, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: o.action, ...(o.payload ? o.payload(args || {}) : {}) }), signal: AbortSignal.timeout(90000) });
    const j = JSON.parse(await r.text());
    if (!j.ok) return { isError: true, content: [{ type: 'text', text: `Le CRM a refusé : ${j.erreur || 'erreur'}` }] };
    return { content: [{ type: 'text', text: String(j.texte || JSON.stringify(j)).slice(0, 60000) }] };
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: `CRM injoignable : ${e.message}` }] };
  }
}

export function serveur({ entree = process.stdin, sortie = process.stdout, script, fetchImpl } = {}) {
  const ecrire = (o) => sortie.write(JSON.stringify(o) + '\n');
  const rl = readline.createInterface({ input: entree });
  rl.on('line', async (ligne) => {
    let m; try { m = JSON.parse(ligne); } catch (_) { return; }
    if (m.id === undefined || m.id === null) return;                         // notification : pas de réponse
    const repondre = (result) => ecrire({ jsonrpc: '2.0', id: m.id, result });
    if (m.method === 'initialize') return repondre({ protocolVersion: (m.params && m.params.protocolVersion) || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'crm-wilson', version: '1' } });
    if (m.method === 'ping') return repondre({});
    if (m.method === 'tools/list') return repondre({ tools: OUTILS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema, annotations: { readOnlyHint: true } })) });
    if (m.method === 'tools/call') return repondre(await appeler(m.params && m.params.name, m.params && m.params.arguments, { script, fetchImpl }));
    ecrire({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'méthode inconnue : ' + m.method } });
  });
  return rl;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cfg = JSON.parse(fs.readFileSync(path.join(DIR, 'config.json'), 'utf8'));
  serveur({ script: cfg.script });
}
