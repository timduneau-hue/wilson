// Wilson — le CRM à la voix (PLAN.md, section 2 quater).
//  - Questions au CRM de Timothée par son script (actions « crm_… », relayées au CRM avec son jeton) : les réponses
//    viennent des fonctions du CRM lui-même (fiche, historique, agenda, bilan, articles).
//  - Fiches gardées pour la journée (préchargées en mode voiture) : réponse immédiate.
//  - Écritures (C2) : rien sans confirmation. crm_noter prépare et renvoie le texte exact à relire ; l'écriture n'est
//    débloquée que par un « oui » de Timothée entendu APRÈS la relecture, ou par un appui sur « Oui » à l'écran.
//    Tâche → directement dans le CRM ; compte rendu, rendez-vous, note → brouillon à valider dans le CRM.
//  - Appeler (C4) : bouton vert avec le numéro (une page web n'a pas le droit de lancer un appel seule).

import { Analyste } from './analyste.js';
import { ecrireLocal } from './stockage.js';
import { Annuaire, personneParmi, motsNom, sim as simNom, nomDit, cleContact } from './annuaire.js';

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const NOMBRES = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, quinze: 15, premier: 1 };
const pad = (n) => String(n).padStart(2, '0');
const plat = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’ʼ]/g, "'");
export const frDate = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
export const jourDit = (d) => `${JOURS[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
const minuit = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const plus = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const CACHE_KEY = 'wilson.crm.cache', QUEUE_KEY = 'wilson.crm.attente', PENDING_MS = 5 * 60000, CACHE_MS = 6 * 3600000;
const JOURNEE_MS = 10 * 60000, BILAN_MS = 15 * 60000;      // journée et bilan récents : réponse immédiate (et sans réseau)
const LECTURES = { crm_requete: 60000, crm_schema: 30000, crm_client: 45000, crm_journee: 45000, crm_bilan: 45000, crm_produit: 45000, crm_etat: 30000, crm_trouver: 30000, crm_annuaire: 60000 };
const hm = (t) => { const d = new Date(t); return `${d.getHours()}h${pad(d.getMinutes())}`; };
// Nom de client dit à voix haute, débarrassé des mots qui ne le désignent pas (journal du 05/11/26, 14h36-14h37 :
// « entreprise Galet » → le CRM proposait ENTREPRISE CREZE et ENTREPRISE VIOLIN, jamais GALLAIS SARL, deux fois de suite ;
// Timothée a dû l'épeler). Le mot générique (« entreprise », « société », « établissements », forme juridique, « chez »)
// pesait plus que le nom lui-même. Rien n'est ôté s'il ne reste rien (un client qui s'appellerait « Entreprise »).
const GENERIQUES = /(?<=^|[\s(])((?:la |le |les |l')?(?:entreprises?|soci[eé]t[eé]s?|bo[iî]te|[eé]tablissements?|ets|client|cliente)|sarl|s\.a\.r\.l\.?|sas|s\.a\.s\.?|sasu|eurl)(?=\s|$|[.,;:)])\.?/gi;
export function nomNet(q) {
  const t = String(q || '').replace(/\s+/g, ' ').trim();
  // (les articles restent : « Le Goff », « Le Bihan » sont des noms de clients en Bretagne)
  const n = t.replace(/^(chez|de chez|pour)\s+/i, '').replace(GENERIQUES, ' ').replace(/\s+/g, ' ').trim();
  return n.replace(/[^\p{L}\p{N}]/gu, '').length >= 2 ? n : t;
}
// Le CRM a proposé plusieurs clients : ce texte contient-il ce nom ? (pour savoir qu'un bouton a été choisi dans une liste)
const dansTexte = (texte, nom) => { const a = plat(texte).replace(/[^a-z0-9]+/g, ' '), b = plat(nom).replace(/[^a-z0-9]+/g, ' ').trim(); return !!b && (' ' + a + ' ').includes(' ' + b + ' '); };

// Pas de réseau, ou réseau trop faible (C8) : la requête n'est pas partie.
export const netErr = (e) => !navigator.onLine || (e && e.name === 'TypeError') || /Failed to fetch|NetworkError|Load failed|network/i.test(String((e && e.message) || ''));

// « demain », « jeudi », « le 30 », « 30/10 », « 30 octobre », « dans 2 semaines »… → Date (minuit) ou null.
// futur : une date sans année déjà passée est prise l'an prochain (tâche, rendez-vous) ; sinon dans le passé (compte rendu).
export function parseJour(txt, now = new Date(), { futur = true } = {}) {
  const t = plat(txt).replace(/[,.;]/g, ' ').replace(/\s+/g, ' ').trim(), auj = minuit(now);
  if (!t) return null;
  if (/apres[- ]?demain/.test(t)) return plus(auj, 2);
  if (/avant[- ]?hier/.test(t)) return plus(auj, -2);
  if (/\bdemain\b/.test(t)) return plus(auj, 1);
  if (/\bhier\b/.test(t)) return plus(auj, -1);
  if (/aujourd'?hui|ce jour|ce matin|cet apres-midi|ce soir|tout a l'heure/.test(t)) return auj;
  let m = /dans (\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|quinze) (jours?|semaines?|mois)/.exec(t);
  if (m) {
    const n = +m[1] || NOMBRES[m[1]] || 1;
    if (/^jour/.test(m[2])) return plus(auj, n);
    if (/^semaine/.test(m[2])) return plus(auj, 7 * n);
    return new Date(auj.getFullYear(), auj.getMonth() + n, auj.getDate());
  }
  if (/semaine prochaine/.test(t) && !/(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/.test(t)) return plus(auj, ((8 - auj.getDay()) % 7) || 7);
  m = /\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/.exec(t);
  if (m) return quand(+m[1], +m[2], m[3], auj, futur);
  m = /\b(\d{1,2}|1er|premier)\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?:\s+(\d{4}))?/.exec(t);
  if (m) return quand(/^\d+$/.test(m[1]) ? +m[1] : 1, MOIS.indexOf(m[2]) + 1, m[3], auj, futur);
  m = /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/.exec(t);
  if (m) {
    const w = JOURS.indexOf(m[1]); let n = (w - auj.getDay() + 7) % 7;
    if (futur) { if (n === 0) n = 7; if (/(semaine prochaine|en huit)/.test(t) && n < 7) n += 7; }
    else { n = n === 0 ? 0 : n - 7; if (/dernier/.test(t) && n === 0) n = -7; }
    return plus(auj, n);
  }
  m = /\b(?:le\s+)?(\d{1,2}|1er|premier)\b/.exec(t);
  if (m && /\ble\b/.test(t)) {
    const j = /^\d+$/.test(m[1]) ? +m[1] : 1;
    let d = new Date(auj.getFullYear(), auj.getMonth(), j);
    if (d.getDate() !== j) return null;
    if (futur && d < auj) d = new Date(auj.getFullYear(), auj.getMonth() + 1, j);
    if (!futur && d > auj) d = new Date(auj.getFullYear(), auj.getMonth() - 1, j);
    return d;
  }
  return null;
}
function quand(j, mo, an, auj, futur) {
  let y = an ? (+an < 100 ? 2000 + +an : +an) : auj.getFullYear();
  let d = new Date(y, mo - 1, j);
  if (d.getDate() !== j || d.getMonth() !== mo - 1) return null;
  if (!an && futur && d < plus(auj, -7)) d = new Date(y + 1, mo - 1, j);
  if (!an && !futur && d > auj) d = new Date(y - 1, mo - 1, j);
  return d;
}

// « 10h », « 14 h 30 », « 9h00 », « midi », « 10 heures et demie » → « 10h00 », « 14h30 »… ('' si aucune heure)
export function parseHeure(txt) {
  const t = plat(txt);
  if (/\bmidi\b/.test(t)) return '12h' + (/et demie/.test(t) ? '30' : '00');
  const m = /\b(\d{1,2})\s*(?:h|heures?|:)\s*(\d{2})?/.exec(t);
  if (!m || +m[1] > 23) return '';
  let mn = m[2] ? +m[2] : /et demie/.test(t) ? 30 : /et quart/.test(t) ? 15 : 0;
  if (mn > 59) return '';
  return `${pad(+m[1])}h${pad(mn)}`;
}

// Un « oui » clair, sans « non », « attends », « change »… (le verrou des écritures, C2).
const OUI = /\b(oui|ouais|ouai|yes|vas[- ]?y|go|confirme|confirmer|je confirme|c'?est bon|c'?est ca|d'?accord|ok|okay|valide|enregistre|enregistre[sz]?|parfait|exact|exactement|tout a fait|bien sur|allez|nickel|impeccable)\b/;
const NON = /\b(non|pas|attends?|annule|annuler|stop|change|changer|modifie|modifier|corrige|corriger|faux|erreur|plutot|mais)\b/;
export function estOui(txt) { const t = plat(txt); return OUI.test(t) && !NON.test(t); }

// Ressemblance de noms dits à voix haute (même méthode que le CRM, section 53) : pour retrouver une fiche gardée.
const VIDES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'a', 'au', 'aux', 'chez', 'sarl', 'sas', 'sasu', 'eurl', 'sa', 'sci', 'snc', 'ets',
  'etablissements', 'etablissement', 'ste', 'societe', 'groupe', 'monsieur', 'madame', 'mr', 'mme', 'm', 'client', 'mon', 'ma']);
export function mots(s) { return plat(String(s || '').replace(/ç/gi, 's')).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((m) => m && !VIDES.has(m)); }
export function phon(m) {
  let s = plat(String(m || '').replace(/ç/gi, 's')).replace(/[^a-z0-9]/g, '');
  if (!s || /^\d+$/.test(s)) return s;
  return s.replace(/ph/g, 'f').replace(/sch|ch|sh/g, 'S').replace(/qu|ck|q/g, 'k')
    .replace(/gu(?=[eiy])/g, 'G').replace(/g(?=[eiy])/g, 'j').replace(/G/g, 'g')
    .replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/w/g, 'v').replace(/y/g, 'i').replace(/z/g, 's').replace(/h/g, '')
    .replace(/eau|au/g, 'o').replace(/ou/g, 'U').replace(/oi/g, 'wa')
    .replace(/(ai|ei)(?=[^n]|$)/g, 'e').replace(/(et|er|ez)$/g, 'e')
    .replace(/(ain|ein|in|un|im)(?=[^aeiouU]|$)/g, 'I')
    .replace(/(an|en)(?=[^aeiouU]|$)|(am|em)(?=[bp])/g, 'A')
    .replace(/on(?=[^aeiouU]|$)|om(?=[bp])/g, 'O')
    .replace(/(.)\1+/g, '$1').replace(/([^A-Z])[estdxp]$/, '$1');
}
export function jw(a, b) {
  if (a === b) return 1;
  const la = a.length, lb = b.length; if (!la || !lb) return 0;
  const fen = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1), ma = new Array(la).fill(false), mb = new Array(lb).fill(false);
  let m = 0;
  for (let i = 0; i < la; i++) for (let j = Math.max(0, i - fen); j < Math.min(lb, i + fen + 1); j++) { if (mb[j] || a[i] !== b[j]) continue; ma[i] = mb[j] = true; m++; break; }
  if (!m) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < la; i++) { if (!ma[i]) continue; while (!mb[k]) k++; if (a[i] !== b[k]) t++; k++; }
  const jaro = (m / la + m / lb + (m - t / 2) / m) / 3;
  let p = 0; while (p < Math.min(4, la, lb) && a[p] === b[p]) p++;
  return jaro + p * 0.1 * (1 - jaro);
}
export function sim(a, b) {
  if (a === b) return 1;
  if (/^\d+$/.test(a) || /^\d+$/.test(b)) return 0;
  const pa = phon(a), pb = phon(b);
  if (a.length >= 3 && b.length >= 3 && pa && pa === pb) return 0.93;
  let s = jw(a, b);
  if (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a))) s = Math.max(s, 0.86);
  return pa.length >= 4 && pb.length >= 4 ? Math.max(s, jw(pa, pb) * 0.93) : s;
}
// Ressemblance entre ce qui a été dit et un client (société, contacts, ville) : 0 à 1.
export function ressemblance(q, c) {
  const qm = mots(q); if (!qm.length) return 0;
  const noms = [...mots(c.societe), ...(c.noms || []).flatMap(mots)], ville = mots(c.ville);
  let tot = 0, pds = 0;
  for (const w of qm) {
    let best = 0;
    for (const t of noms) best = Math.max(best, sim(w, t));
    for (const t of ville) best = Math.max(best, sim(w, t) * 0.9);
    if (best < 0.78) best = 0;
    const poids = Math.min(1, Math.max(0.4, w.length / 4));
    tot += best * poids; pds += poids;
  }
  return pds ? tot / pds : 0;
}

// Le CRM a rendu cette fiche pour ce qui a été dit : chaque mot dit se retrouve-t-il nettement dans la société, ses contacts
// ou sa ville ? (Un sigle est le même ou rien : le 12/11/26, un sigle de trois lettres a été pris pour une autre société
// dont un mot lui ressemblait.) Sinon Wilson fait confirmer avant d'agir.
export function confiant(q, e) {
  const Q = motsNom(q); if (!Q.length) return false;
  const noms = [...motsNom(e.societe), ...[e.contact, ...(e.contacts || []).map((c) => c.nom), ...(e.noms || [])].flatMap(motsNom), ...motsNom(e.ville)];
  const k = Q.join(''); if (k.length >= 2 && k === motsNom(e.societe).join('')) return true;
  return Q.every((w) => noms.some((t) => simNom(w, t) >= 0.86));
}

export const CRM_TOOLS = [
  { name: 'crm_client', behavior: 'BLOCKING',
    description: "Tout ce que le CRM de Timothée sait d'un client (société ou contact, même mal prononcé, avec la ville si elle aide) : contacts et téléphones, prochain rendez-vous, dernières visites, comptes rendus, tâches, chiffre d'affaires (exercice, mois en cours, comparaison avec l'an dernier), commandes, devis, articles achetés, réachats en retard, achats chez les concurrents, articles à proposer. Avant de l'appeler, dis « Je regarde dans le CRM… ».",
    parameters: { type: 'OBJECT', properties: { client: { type: 'STRING', description: 'le nom de la société ou du contact, tel que Timothée l\'a dit' } }, required: ['client'] } },
  { name: 'crm_contacts', behavior: 'BLOCKING',
    description: "Les contacts d'un client, TOUT DE SUITE (annuaire du CRM gardé sur l'appareil, sans attente) : qui est le magasinier, l'acheteur, le dirigeant…, le nom de quelqu'un, sa fonction, son numéro de téléphone, l'adresse ou la ville de la société. Pour « qui est… chez X », « c'est quoi le numéro de… », « comment s'appelle… », « où est… » : cet outil, pas crm_question. Pour tout le reste (visites, comptes rendus, chiffres, commandes, devis) : crm_client ou crm_question.",
    parameters: { type: 'OBJECT', properties: { client: { type: 'STRING', description: 'la société ou la personne, tel que Timothée l\'a dit' } }, required: ['client'] } },
  { name: 'crm_agenda', behavior: 'BLOCKING',
    description: "Rendez-vous et tâches d'un jour dans le CRM (« qui je vois aujourd'hui », « ma journée de demain », « jeudi »).",
    parameters: { type: 'OBJECT', properties: { jour: { type: 'STRING', description: "aujourd'hui, demain, un jour de la semaine ou une date" } } } },
  { name: 'crm_bilan', behavior: 'BLOCKING',
    description: "Chiffre d'affaires de Timothée tous clients confondus : exercice à ce jour, mois en cours, comparaison avec l'an dernier, clients actifs, plus gros écarts." },
  { name: 'crm_produit', behavior: 'BLOCKING',
    description: "Catalogue et ventes : quels clients achètent un fabricant ou un article (question qui_achete), ou référence, prix et disponibilité d'un article (question infos).",
    parameters: { type: 'OBJECT', properties: { produit: { type: 'STRING', description: 'fabricant, référence ou désignation' }, question: { type: 'STRING', enum: ['qui_achete', 'infos'] } }, required: ['produit'] } },
  { name: 'crm_question', behavior: 'BLOCKING',
    description: "Toute autre question sur ses données, même inhabituelle : chiffre d'un mois ou d'une année passée, devis à relancer, clients qui ont (ou n'ont pas) commandé, quand un client a acheté un article, détail d'une commande, comparaisons, listes, totaux… Un analyste cherche dans tout le CRM et répond, même si ça prend une minute ou plus. Avant de l'appeler, dis « Je cherche l'information… », puis attends le résultat sans relancer.",
    parameters: { type: 'OBJECT', properties: { question: { type: 'STRING', description: 'la question complète, avec le nom du client et la période s\'il les a dits (ou le client dont vous parlez)' } }, required: ['question'] } },
  { name: 'itineraire', behavior: 'BLOCKING',
    description: "Aller chez un client : affiche un grand bouton qui ouvre le GPS (Google Maps ou Waze) avec l'adresse de sa fiche ; Timothée appuie dessus. SEULEMENT quand il demande d'y aller (« emmène-moi », « guide-moi », « lance le GPS », « l'itinéraire ») : jamais parce qu'il cite un client.",
    parameters: { type: 'OBJECT', properties: { client: { type: 'STRING', description: 'la société ou le contact' } }, required: ['client'] } },
  { name: 'appeler', behavior: 'BLOCKING',
    description: "Appeler un client : affiche sur l'écran un grand bouton vert avec son numéro ; Timothée appuie dessus pour lancer l'appel.",
    parameters: { type: 'OBJECT', properties: { client: { type: 'STRING', description: 'la société ou le contact' }, contact: { type: 'STRING', description: 'la personne à appeler, si elle est précisée' } }, required: ['client'] } },
  { name: 'crm_noter', behavior: 'BLOCKING',
    description: "Prépare une écriture dans le CRM : tache (un rappel à une date), compte_rendu (visite ou appel), rdv (prochain rendez-vous avec date et heure), note. RIEN n'est écrit : l'outil renvoie la phrase exacte à relire à Timothée. N'appelle crm_confirmer qu'après son « oui ».",
    parameters: { type: 'OBJECT', properties: {
      type: { type: 'STRING', enum: ['tache', 'compte_rendu', 'rdv', 'note'] },
      client: { type: 'STRING', description: 'le client concerné : la société (vide pour une tâche personnelle)' },
      contact: { type: 'STRING', description: "la personne vue, appelée ou concernée, s'il la cite (« j'ai vu Julien », « avec le magasinier ») : son nom tel qu'il l'a dit" },
      texte: { type: 'STRING', description: 'ce qu\'il a dit, mis au propre sans rien ajouter (vide pour un simple rendez-vous)' },
      date: { type: 'STRING', description: "tel qu'il l'a dit : « demain », « jeudi », « le 30 », « 30/10 »… (tâche : jour du rappel ; compte rendu : jour de l'échange, vide = aujourd'hui ; rdv : jour du rendez-vous)" },
      heure: { type: 'STRING', description: 'rendez-vous : « 10h00 »' },
      echange: { type: 'STRING', enum: ['visite', 'appel'], description: 'compte rendu : visite ou appel' } },
      required: ['type'] } },
  { name: 'crm_confirmer', behavior: 'BLOCKING',
    description: "Enregistre ce que crm_noter a préparé. À appeler SEULEMENT après un « oui » clair de Timothée à ta relecture ; s'il corrige, rappelle crm_noter." },
];
export const CRM_TOOL_NAMES = CRM_TOOLS.map((t) => t.name);

export class Crm {
  constructor(app) {
    this.app = app; this.delais = { ...LECTURES }; this.cache = new Map(); this.pending = null; this.last = null; this.journee = null; this._bilan = null;
    this.state = ''; this.etat = null; this.call = null; this.queue = [];
    this.analyste = new Analyste({ ask: (p, s) => this.ask(p, s), log: (m) => this.app.log(m) });
    this.annuaire = new Annuaire({ log: (m) => this.log(m) });      // tous les contacts du CRM, gardés sur l'appareil (PLAN 2 sexies)
    this.dernier = null;                                           // le dernier client dont on a parlé : { soc, contact, at }
    setTimeout(() => this.chargerAnnuaire(), 6000);
    this._load();
    try { this.queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') || []; } catch (_) { this.queue = []; }
    if (this.queue.length) setTimeout(() => this.flushQueue(), 8000);
  }
  get on() { return !!this.app.settings.crm && this.app.remote.on; }
  log(m, priv) { this.app.log('CRM : ' + m, priv); }

  async ask(payload, signal) {
    const t0 = performance.now();
    // Lectures : délai maximal (journal du 04/11/26, 17h18 : une recherche de l'analyste partie en voiture n'est jamais
    // revenue, la requête restait bloquée sur le réseau mobile). Passé ce délai, elle compte comme une coupure de réseau :
    // l'analyste attend puis la relance. Les écritures n'en ont pas (on ne renvoie jamais une écriture qui a peut-être eu lieu).
    const max = (this.delais || LECTURES)[payload && payload.action];
    let r;
    if (!max) r = await this.app.remote.ask(payload, signal);
    else {
      const ctl = new AbortController(), stop = () => ctl.abort();
      if (signal) { if (signal.aborted) stop(); else signal.addEventListener('abort', stop, { once: true }); }
      let trop = false; const t = setTimeout(() => { trop = true; ctl.abort(); }, max);
      try { r = await this.app.remote.ask(payload, ctl.signal); }
      catch (e) {
        if (!trop) throw e;
        this.log(`${payload.action} sans réponse au bout de ${Math.round(max / 1000)} s (réseau bloqué)`);
        const err = new Error(`Failed to fetch : pas de réponse du CRM en ${Math.round(max / 1000)} s`); err.network = true; err.name = 'TypeError'; throw err;
      } finally { clearTimeout(t); if (signal) signal.removeEventListener('abort', stop); }
    }
    const s = ((performance.now() - t0) / 1000).toFixed(1);
    if (!r || r.ok === false) { this.state = 'refus : ' + ((r && r.erreur) || 'réponse vide'); this.log(`${payload.action} refusé en ${s} s : ${(r && r.erreur) || 'réponse vide'}`); }
    else { this.state = 'à jour'; this.log(`${payload.action} en ${s} s${r.ms ? ` (CRM ${(r.ms / 1000).toFixed(1)} s)` : ''}`); }
    return r || { ok: false, erreur: 'réponse vide' };
  }
  async status(force = false) {
    if (!this.on) return null;
    if (!force && this.etat && Date.now() - this.etat.at < 5 * 60000) return this.etat;
    try { const r = await this.ask({ action: 'crm_etat' }); this.etat = { at: Date.now(), ...r }; }
    catch (e) { this.etat = { at: Date.now(), ok: false, erreur: e.message }; }
    return this.etat;
  }

  // ---- annuaire du CRM gardé sur l'appareil (PLAN 2 sexies) ----
  // Relu au plus toutes les 6 h (au démarrage, quand le téléphone se relie à la voiture), en arrière-plan : jamais d'attente
  // pour Timothée. Un CRM pas encore à jour (« action inconnue ») : Wilson continue comme avant, et réessaie 6 h après.
  async chargerAnnuaire({ force = false } = {}) {
    const A = this.annuaire;
    if (!this.on || this._annuaireEnCours) return false;
    if (!force && !A.aRelire()) return true;
    if (!force && this._annuaireNon && Date.now() - this._annuaireNon < 6 * 3600000) return false;
    this._annuaireEnCours = true; const t0 = performance.now();
    try {
      const r = await this.ask({ action: 'crm_annuaire' });
      if (r && r.ok && A.charger(r)) { this._annuaireNon = 0; this.log(`annuaire : ${A.n} contacts, ${A.groupes.length} sociétés gardés sur l'appareil en ${((performance.now() - t0) / 1000).toFixed(1)} s`); return true; }
      this._annuaireNon = Date.now();
      this.log(/action inconnue/.test((r && r.erreur) || '') ? "annuaire : le CRM ne le donne pas encore (CRM à mettre à jour) — je retrouve les clients par le CRM, comme avant"
        : `annuaire : pas lu (${(r && r.erreur) || 'réponse vide'})${A.pret ? ` — je garde celui du ${A.date()}` : ''}`);
      return false;
    } catch (e) { this.log(`annuaire : pas lu (${e.message})${A.pret ? ` — je garde celui du ${A.date()}` : ''}`); return false; }
    finally { this._annuaireEnCours = false; }
  }
  etatAnnuaire() {
    const A = this.annuaire;
    return A.pret ? `${A.n} contacts, ${A.groupes.length} sociétés, lu le ${A.date()}` : this._annuaireNon ? 'pas disponible (CRM à mettre à jour ?)' : 'pas encore lu';
  }
  // La société et ses contacts, d'après une fiche du CRM (quand l'annuaire n'est pas là).
  _socDeFiche(e) {
    const contacts = (e.contacts && e.contacts.length ? e.contacts : [{ nom: e.contact, cle: e.cle }]).filter((c) => c && c.nom).map((c) => ({ nom: c.nom, fonction: c.fonction || '', tel: c.tel || '', mail: c.mail || '', cle: c.cle || cleContact(c.nom, e.societe) }));
    return { societe: e.societe, ville: e.ville || '', adresse: e.adresse || '', code: '', contacts, principal: contacts.find((c) => c.nom === e.contact) || contacts[0] || null };
  }
  _socDeGroupe(g) {
    const contacts = g.contacts.map((c) => ({ nom: c.nom, fonction: c.fonction, tel: c.tel, mail: c.mail, cle: c.cle, adresse: c.adresse }));
    const P = this.annuaire.principal(g);
    return { societe: g.societe, ville: g.ville, adresse: g.adresse, code: g.code, contacts, principal: contacts.find((c) => c.cle === P.cle) || contacts[0], g };
  }
  _plusieursTexte(dit, liste) {
    const qui = (x) => this.annuaire.qui(x.g, x.contact);
    return `Plusieurs clients possibles pour « ${dit} » : ${liste.map(qui).join(' ; ')}. Demande-lui lequel (cite le nom et la ville de chacun), puis rappelle l'outil avec le nom exact et la ville.`;
  }
  // De qui parle-t-il ? { soc, contact (la personne reconnue, ou null), sur, e (fiche, si elle a été lue) } — ou { dire } :
  // ce qu'il faut lui dire (plusieurs clients possibles, client inconnu, CRM muet). L'annuaire d'abord (immédiat, sans
  // réseau) ; à défaut, le CRM. sur : assez certain pour agir sans redemander (P8).
  async _qui(client, signal) {
    if (this._isLast(client) && this.dernier) { this.dernier.at = Date.now(); return { ...this.dernier, sur: true }; }
    if (this._isLast(client) && this.last) return { soc: this._socDeFiche(this.last), contact: null, sur: true, e: this.last };
    const net = nomNet(client), A = this.annuaire;
    if (net !== String(client || '').replace(/\s+/g, ' ').trim()) this.log(`nom cherché : « ${net} » (dit : « ${client} »)`);
    if (A.pret) {
      const r = A.choisir(net);
      if (r.plusieurs) {
        const texte = this._plusieursTexte(client, r.plusieurs);
        this.dernierChoix = { at: Date.now(), dit: client, texte };
        // parmi les clients possibles, celui dont on parle depuis moins de 30 min est pris, à faire confirmer (P8)
        const D = this.dernier, pris = D && Date.now() - D.at < 30 * 60000 && r.plusieurs.find((x) => x.g.societe === D.soc.societe);
        if (pris) { this.log(`plusieurs clients possibles pour « ${net} » : je prends ${D.soc.societe}, celui dont on parlait (à faire confirmer)`); return this._retenir({ soc: this._socDeGroupe(pris.g), contact: pris.contact ? this._contactDe(pris) : null, sur: false, parmi: texte }); }
        this.log(`plusieurs clients possibles pour « ${net} » (annuaire) : ${r.plusieurs.map((x) => x.g.societe).join(' | ')}`);
        return { dire: texte, choix: r.plusieurs.map((x) => ({ societe: x.g.societe, ville: x.g.ville })) };
      }
      if (r.un) {
        this.log(`annuaire : « ${net} » → ${A.qui(r.un.g, r.un.contact)}${r.sur ? '' : ' (à faire confirmer)'}`);
        return this._retenir({ soc: this._socDeGroupe(r.un.g), contact: r.un.contact ? this._contactDe(r.un) : null, sur: r.sur });
      }
      this.log(`annuaire : rien pour « ${net} » — je demande au CRM`);
    }
    const r = await this.client({ client, parCrm: true }, signal);
    if (!r.ok) return { dire: `Le CRM ne répond pas : ${r.erreur || 'erreur'}. Dis-le simplement.` };
    if (!r.e) return { dire: r.texte || 'Client introuvable.', choix: r.choix };
    const soc = this._socDeFiche(r.e), P = personneParmi(soc.contacts, net).contact || null;
    // Le CRM a répondu : est-ce bien ce qui a été dit ? Chaque mot dit doit se retrouver dans la société, ses contacts ou sa ville.
    return this._retenir({ soc, contact: P, sur: !r.approx && confiant(net, r.e), e: r.e, parmi: r.parmi || '' });
  }
  _contactDe(x) { const c = x.contact; return { nom: c.nom, fonction: c.fonction, tel: c.tel, mail: c.mail, cle: c.cle, adresse: c.adresse }; }
  _retenir(R) { this.dernier = { soc: R.soc, contact: R.contact || null, e: R.e || null, at: Date.now() }; return R; }

  // ---- fiches gardées pour la journée ----
  _load() {
    try {
      const o = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (o && o.jour === frDate(new Date())) for (const e of o.e || []) if (Date.now() - e.at < CACHE_MS) this.cache.set(e.cle, e);
    } catch (_) {}
  }
  _save() {
    ecrireLocal(CACHE_KEY, { jour: frDate(new Date()), e: [...this.cache.values()].slice(-15) });
  }
  _keep(r) {
    const e = { cle: r.cle, societe: r.societe, contact: r.contact, ville: r.ville || '', adresse: r.adresse || '', contacts: r.contacts || [], texte: r.texte, rdv: r.rdv || '', at: Date.now(),
      noms: [r.contact, ...(r.contacts || []).map((c) => c.nom)].filter(Boolean) };
    this.cache.delete(r.cle); this.cache.set(r.cle, e); this._save();
    this.last = e; this.lastAt = Date.now();
    if (!this.dernier || this.dernier.soc.societe !== e.societe) this.dernier = { soc: this._socDeFiche(e), contact: null, e, at: Date.now() };
    else { this.dernier.at = Date.now(); this.dernier.e = e; }
    return e;
  }
  // Fiche gardée qui correspond clairement à ce qui a été dit (sinon null : on demande au CRM).
  _fromCache(q) {
    if (!q) return null;
    const l = [...this.cache.values()].map((e) => ({ e, s: ressemblance(q, e) })).sort((a, b) => b.s - a.s);
    if (!l.length || l[0].s < 0.85 || (l[1] && l[1].s > l[0].s - 0.1)) return null;
    return l[0].e;
  }
  // « lui », « ce client », vide : le dernier client dont on a parlé.
  _isLast(q) { return !q || /^(lui|elle|ce client|cette societe|le meme|la meme|il|eux)$/i.test(plat(q).trim()); }

  // Fiche gardée d'une société (quel que soit le contact sous lequel elle a été lue).
  _ficheDeSociete(societe) {
    const k = motsNom(societe).join('');
    return (k && [...this.cache.values()].reverse().find((e) => motsNom(e.societe).join('') === k && Date.now() - e.at < CACHE_MS)) || null;
  }
  async client({ client = '', cle = '', parCrm = false } = {}, signal) {
    // « lui », « ce client » : le dernier dont on a parlé — même s'il n'a été vu que dans l'annuaire (GPS, appel, contacts).
    const D = this.dernier;
    if (!cle && !parCrm && this._isLast(client) && D && (!this.last || this.last.societe !== D.soc.societe)) {
      const r = await this.client({ cle: (D.contact || D.soc.principal || {}).cle || '', client: D.soc.societe }, signal);
      return r.e ? { ...r, contactDit: D.contact || null } : r;
    }
    if (!cle && this._isLast(client) && this.last) { this.lastAt = Date.now(); return { ok: true, e: this.last, cached: true, contactDit: (D && D.contact) || null }; }
    // L'annuaire d'abord : il sait de qui on parle (société ET personne), tout de suite ; le CRM ne donne plus que la fiche.
    if (!cle && !parCrm && this.annuaire.pret) {
      const Q = await this._qui(client, signal);
      if (Q.dire) return { ok: true, texte: Q.dire, choix: Q.choix || [] };
      if (Q.e) return { ok: true, e: Q.e, approx: !Q.sur, parmi: Q.parmi || '', contactDit: Q.contact };
      const garde = this._ficheDeSociete(Q.soc.societe);
      if (garde) { this.last = garde; this.lastAt = Date.now(); this.log(`fiche gardée : ${garde.societe}`); return { ok: true, e: garde, cached: true, approx: !Q.sur, parmi: Q.parmi || '', contactDit: Q.contact }; }
      const c = Q.contact || Q.soc.principal;
      const r = await this.ask({ action: 'crm_client', cle: c.cle }, signal);      // (pas de réseau : l'appelant donne les contacts de l'annuaire)
      if (r.ok && r.cle) return { ok: true, e: this._keep(r), approx: !Q.sur, parmi: Q.parmi || '', contactDit: Q.contact };
      // fiche renommée ou supprimée depuis la lecture de l'annuaire : le CRM cherche lui-même, et l'annuaire est relu
      this.log(`annuaire : la fiche de ${c.nom} (${Q.soc.societe}) n'est plus dans le CRM (${(r && r.erreur) || 'introuvable'}) — je demande au CRM et je relis l'annuaire`);
      this.chargerAnnuaire({ force: true });
    }
    const net = cle ? client : nomNet(client);
    if (net !== String(client || '').replace(/\s+/g, ' ').trim()) this.log(`nom cherché : « ${net} » (dit : « ${client} »)`);
    const hit = cle ? this.cache.get(cle) : this._fromCache(net);
    if (hit && Date.now() - hit.at < CACHE_MS) { this.last = hit; this.lastAt = Date.now(); this.log(`fiche gardée : ${hit.societe}`); return { ok: true, e: hit, cached: true }; }
    let r;
    try { r = await this.ask(cle ? { action: 'crm_client', cle } : { action: 'crm_client', client: net }, signal); }
    catch (e) {
      // pas de réseau vers le CRM : la fiche gardée sur le téléphone, même ancienne, avec son heure (C8 bis)
      if (netErr(e) && hit) { this.last = hit; this.log(`pas de réseau : fiche gardée de ${hm(hit.at)} (${hit.societe})`); return { ok: true, e: hit, cached: true, vieux: hit.at }; }
      throw e;
    }
    if (!r.ok) return r;
    if (!r.cle) {                                                                      // inconnu ou plusieurs possibles
      const liste = `${r.texte || ''} ${JSON.stringify(r.choix || [])}`;
      if (r.texte || (r.choix && r.choix.length)) this.dernierChoix = { at: Date.now(), dit: client, texte: liste };
      // Protocole voiture (journal du 05/11/26, 16h04 : « Gallet » → ART DU BOIS 72 ou GALLAIS SARL, alors qu'on parlait de
      // GALLAIS) : parmi les clients possibles, celui dont on parle depuis moins de 30 min est pris, et Wilson le fait confirmer.
      const L = this.last;
      if (L && this.lastAt && Date.now() - this.lastAt < 30 * 60000 && dansTexte(liste, L.societe)) {
        this.log(`plusieurs clients possibles pour « ${net} » : je prends ${L.societe}, celui dont on parlait (à faire confirmer)`);
        this.lastAt = Date.now();
        return { ok: true, e: L, cached: true, approx: true, parmi: r.texte || '' };
      }
      return { ok: true, texte: r.texte, choix: r.choix || [] };
    }
    const e = this._keep(r);
    // nom entendu loin du client trouvé (son mauvais, nom écorché) : Wilson cite d'abord le client, pour qu'on le corrige (C10)
    return { ok: true, e, approx: !cle && (ressemblance(net, e) < 0.9 || !confiant(net, e)) };
  }
  async agenda(jour, signal, { frais = false } = {}) {
    const d = parseJour(jour || "aujourd'hui") || new Date();
    const auj = minuit(new Date());
    const j = +minuit(d) === +auj ? 'aujourdhui' : +minuit(d) === +plus(auj, 1) ? 'demain' : frDate(d);
    const J = j === 'aujourdhui' && this.journee && this.journee.jourDe === frDate(auj) ? this.journee : null;
    if (J && !frais && Date.now() - J.at < JOURNEE_MS) { this.log(`journée gardée de ${hm(J.at)}`); return J; }
    let r;
    try { r = await this.ask({ action: 'crm_journee', jour: j }, signal); }
    catch (e) {
      if (netErr(e) && J) { this.log(`pas de réseau : journée gardée de ${hm(J.at)}`); return { ...J, texte: `(Pas de réseau vers le CRM : journée telle qu'elle était à ${hm(J.at)}.)\n${J.texte}` }; }
      throw e;
    }
    if (r.ok && j === 'aujourdhui') this.journee = { at: Date.now(), jourDe: frDate(auj), ...r };
    return r;
  }
  async bilan(signal) {
    const B = this._bilan;
    if (B && Date.now() - B.at < BILAN_MS) { this.log(`bilan gardé de ${hm(B.at)}`); return B; }
    let r;
    try { r = await this.ask({ action: 'crm_bilan' }, signal); }
    catch (e) {
      if (netErr(e) && B && Date.now() - B.at < 12 * 3600000) { this.log(`pas de réseau : bilan gardé de ${hm(B.at)}`); return { ...B, texte: `(Pas de réseau vers le CRM : chiffres de ${hm(B.at)}.)\n${B.texte}` }; }
      throw e;
    }
    if (r.ok) this._bilan = { at: Date.now(), ...r };
    return r;
  }
  produit(produit, question, signal) { return this.ask({ action: 'crm_produit', produit, question: question === 'infos' ? 'infos' : 'qui_achete' }, signal); }

  // Mode voiture : la journée et les fiches des rendez-vous du jour, chargées d'avance (C7).
  async prefetch() {
    if (!this.on || this._prefetching) return;
    this._prefetching = true; const t0 = performance.now();
    this.chargerAnnuaire();                                              // en arrière-plan, s'il a plus de 6 h
    const L0 = this.last, LA0 = this.lastAt, D0 = this.dernier;
    try {
      const j = await this.agenda("aujourd'hui");
      if (!j.ok) return;
      let n = 0;
      for (const r of (j.rdv || []).slice(0, 6)) {
        if (!(this.app.car || this.app._voitureBt) || !this.on) break;     // téléphone relié à la voiture aussi (05/11/26)
        if (this.cache.has(r.cle) && Date.now() - this.cache.get(r.cle).at < CACHE_MS) continue;
        const c = await this.client({ cle: r.cle });
        if (c.ok && c.e) n++;
      }
      this.log(`journée préparée : ${(j.rdv || []).length} rendez-vous, ${n} fiche(s) chargée(s) en ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    } catch (e) { this.log('préparation de la journée impossible : ' + e.message); }
    finally { this._prefetching = false; this.last = L0; this.lastAt = LA0; this.dernier = D0; }
  }

  // Résout un client pour écrire ou appeler : { e } (fiche), ou { texte, choix } à dire.
  async _resolve(client, signal) {
    const Q = await this._qui(client, signal);
    return Q.dire ? { texte: Q.dire, choix: Q.choix } : Q;
  }

  // crm_contacts : les contacts d'un client, tout de suite (annuaire), sinon par sa fiche.
  async contacts({ client = '' } = {}, signal) {
    const Q = await this._qui(client, signal);
    if (Q.dire) return { ok: false, dire: Q.dire };
    const S = Q.soc, un = (c) => `${c.nom}${c.fonction ? ' (' + c.fonction + ')' : ''}${c.tel ? ', tél. ' + c.tel : ''}`;
    const avant = Q.parmi ? `(${Q.parmi} J'ai pris ${S.societe}, celui dont vous parliez : commence par ce nom et demande-lui si c'est bien lui.)\n`
      : !Q.sur ? `(Nom entendu : « ${client} » ; j'ai trouvé ${S.societe}${S.ville ? ', ' + S.ville : ''}. Commence ta réponse par ce nom, pour qu'il puisse te corriger.)\n` : '';
    const texte = S.g ? this.annuaire.texte(S.g, { contact: Q.contact && S.g.contacts.find((c) => c.cle === Q.contact.cle) })
      : [`Client : ${S.societe}${S.ville ? ', ' + S.ville : ''}`, S.adresse ? 'Adresse : ' + S.adresse : '', Q.contact ? 'La personne dont il parle : ' + un(Q.contact) : '', `Contacts (${S.contacts.length}) : ` + S.contacts.slice(0, 14).map(un).join(' ; ')].filter(Boolean).join('\n');
    return { ok: true, texte: avant + texte, soc: S, contact: Q.contact };
  }

  // ---- écritures (C2, C3) ----
  async prepare(a, signal) {
    const type = ['tache', 'compte_rendu', 'rdv', 'note'].includes(a.type) ? a.type : 'tache';
    let e = null, habituel = false, nbContacts = 0;
    if (a.client || a.contact || type !== 'tache') {
      // Journal du 12/11/26, 09h53-09h57 : le compte rendu dicté pour une personne était préparé au nom du premier contact
      // de la fiche, et rien ne permettait de le corriger (« c'est nul »). Le client ET la personne viennent maintenant de ce
      // qu'il a dit : la personne citée (contact), ou celle par laquelle il a désigné le client.
      const Q = await this._qui(a.client || a.contact || '', signal);
      if (Q.dire) return { ok: false, dire: Q.dire };
      const S = Q.soc; let c = Q.contact || null; nbContacts = S.contacts.length;
      const libre = /^(peu importe|n'importe|je (ne )?sais pas|personne|le contact (habituel|principal)|comme d'habitude)/.test(plat(a.contact || '').trim());
      if (a.contact && a.client && !libre) {
        const P = personneParmi(S.contacts, a.contact);
        if (P.contact) c = P.contact;
        else if (P.plusieurs) return { ok: false, dire: `Chez ${S.societe}, « ${a.contact} » peut être ${P.plusieurs.map((x) => nomDit(x.nom) + (x.fonction ? ' (' + x.fonction + ')' : '')).join(' ou ')}. Demande-lui lequel, sans rien préparer, puis rappelle crm_noter avec ce contact.` };
        else if (!c) return { ok: false, dire: `Je ne trouve pas « ${a.contact} » parmi les contacts de ${S.societe} dans le CRM (${S.contacts.slice(0, 5).map((x) => nomDit(x.nom)).join(', ')}${S.contacts.length > 5 ? '…' : ''}). Dis-le-lui et demande-lui avec qui c'était (un nouveau contact se crée dans le CRM, pas ici), sans rien préparer.` };
      }
      // Personne citée nulle part, société à plusieurs contacts : le contact habituel est pris, et la relecture le nomme —
      // d'un mot (« non, avec Julien »), Timothée le corrige (le CRM compte les visites par contact).
      if (!c && S.contacts.length > 1 && type !== 'tache') habituel = true;
      else if (this.dernier && this.dernier.soc.societe === S.societe) this.dernier.contact = c;       // la personne dont on parle
      if (!c) c = S.principal;
      e = { cle: (c && c.cle) || (Q.e && Q.e.cle) || '', societe: S.societe, contact: c ? c.nom : '' };
      if (!e.cle) return { ok: false, dire: `Je n'ai pas de contact pour ${S.societe} dans le CRM. Dis-le simplement.` };
    }
    const texte = String(a.texte || '').trim();
    if (type !== 'rdv' && !texte) return { ok: false, dire: 'Il manque le texte à noter : demande-lui ce qu\'il veut noter.' };
    // at / turn : moment et tour de parole de la préparation ; seul un « oui » dit APRÈS compte (verrou C2)
    const p = { type, cle: e ? e.cle : '', societe: e ? e.societe : '', contact: e ? e.contact : '', texte, at: performance.now(), atMs: Date.now(), turn: this.app._turnN || 0 };
    const qui = e ? `${e.societe}${e.contact ? ' (' + e.contact + ')' : ''}` : '';
    if (type === 'tache') {
      // sans jour dit, on demande (avant : rappel mis à aujourd'hui d'office, journal du 25/10/26)
      if (!String(a.date || '').trim()) return { ok: false, dire: 'Il manque le jour du rappel : demande-lui pour quand (aujourd\'hui, demain, un jour précis), sans rien préparer.' };
      const d = parseJour(a.date);
      if (!d) return { ok: false, dire: `Je ne comprends pas la date « ${a.date} » : demande-lui le jour du rappel.` };
      p.date = frDate(d); p.relu = `Tâche pour le ${jourDit(d)}${qui ? ', ' + qui : ''} : « ${texte} ».`;
    } else if (type === 'rdv') {
      const d = parseJour(a.date || ''), h = parseHeure(a.heure || a.date || '');
      if (!d) return { ok: false, dire: 'Il manque le jour du rendez-vous : demande-le-lui.' };
      if (!h) return { ok: false, dire: 'Il manque l\'heure du rendez-vous : demande-la-lui.' };
      if (d < minuit(new Date())) return { ok: false, dire: 'Ce jour est déjà passé : redemande-lui la date du rendez-vous.' };
      p.date = frDate(d); p.heure = h; p.relu = `Rendez-vous avec ${p.contact || p.societe} (${p.societe}) le ${jourDit(d)} à ${h}.${texte ? ' Note : « ' + texte + ' ».' : ''}`;
    } else {
      const d = a.date ? parseJour(a.date, new Date(), { futur: false }) : null;
      if (a.date && !d) return { ok: false, dire: `Je ne comprends pas la date « ${a.date} » : demande-lui le jour de l'échange.` };
      if (d && d > minuit(new Date())) return { ok: false, dire: 'Un compte rendu ne peut pas être daté dans le futur : redemande la date.' };
      p.date = d ? frDate(d) : ''; p.echange = type === 'note' ? 'autre' : (a.echange === 'appel' ? 'appel' : 'visite');
      p.relu = type === 'note' ? `Note pour ${qui} : « ${texte} ».`
        : `Compte rendu ${p.echange === 'appel' ? 'd\'appel' : 'de visite'}${d ? ' du ' + jourDit(d) : ''}, ${qui} : « ${texte} ».`;
    }
    this.pending = p; this.dernierEnregistre = null;     // nouvelle préparation : « déjà enregistré » ne vaut plus
    this.log(`à confirmer : ${p.relu}`, true);
    if (this.app.showConfirm) this.app.showConfirm(p);
    return { ok: true, pending: p,
      dire: `Rien n'est encore écrit. Relis-lui exactement : « ${p.relu} » puis demande « Je l'enregistre ? ». N'appelle crm_confirmer qu'après son « oui » ; s'il corrige, rappelle crm_noter.${habituel ? ` (Il n'a cité personne : c'est le contact habituel, ${nomDit(p.contact)}, parmi ${nbContacts} contacts. Dis bien son nom en relisant ; s'il en cite un autre, rappelle crm_noter avec contact = cette personne.)` : ''}` };
  }

  // Verrou : y a-t-il un « oui » de Timothée APRÈS la préparation ? heard : [{ t, text, n }] (ce qu'il a dit, horodaté ;
  // n = tour de parole du direct, -1 en mode économique). En direct, seul un tour postérieur à la préparation compte :
  // « OK, note que… » (la demande elle-même) ne vaut jamais confirmation.
  gate(heard, { tapped = false } = {}) {
    const p = this.pending;
    if (!p) return { ok: false, why: 'rien à enregistrer' };
    if (Date.now() - p.atMs > PENDING_MS) { this.pending = null; return { ok: false, why: 'préparation trop ancienne' }; }
    if (tapped) return { ok: true };
    if (p.call) return { ok: false, why: 'appel téléphonique en cours : aucun « oui » ne compte' };
    const apres = (heard || []).filter((h) => (h.n == null || h.n < 0 ? h.t > p.at : h.n > p.turn) && String(h.text || '').trim());
    if (!apres.length) return { ok: false, why: 'pas de réponse de Timothée depuis la relecture' };
    const dit = apres[apres.length - 1].text;                 // sa DERNIÈRE réponse (« attends… » puis « oui, vas-y »)
    if (!estOui(dit)) return { ok: false, why: `pas de « oui » clair (« ${dit.slice(0, 80)} »)` };
    return { ok: true, dit };
  }

  async commit(signal) {
    const p = this.pending; if (!p) return { ok: false, dire: 'Il n\'y a rien à enregistrer.' };
    this.pending = null;
    if (this.app.hideCard) this.app.hideCard('confirm');
    // id : le même envoi n'est jamais enregistré deux fois (renvoi après une coupure de réseau)
    const id = p.id || (p.id = 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
    const payload = p.type === 'tache'
      ? { action: 'crm_tache', id, texte: p.texte, date: p.date, cle: p.cle, confirme: true }
      : { action: 'crm_brouillon', id, type: p.type, cle: p.cle, texte: p.texte, date: p.date, heure: p.heure || '', echange: p.echange || '', confirme: true };
    let r;
    try { r = await this.ask(payload, signal); }
    catch (e) {
      if (netErr(e)) {             // pas de réseau : la requête n'est pas partie → gardée et envoyée seule au retour du réseau (C8 bis)
        this._enqueue(p, payload);
        return { ok: false, queued: true, dire: 'Pas de réseau : ce n\'est PAS encore enregistré. C\'est gardé sur le téléphone et je l\'enregistrerai tout seul dès que le réseau revient. Dis-le en une phrase, sans dire « c\'est noté ».',
          phrase: 'Pas de réseau : je l\'enregistrerai dès qu\'il revient.' };
      }
      if (e.name === 'AbortError') {  // parti, mais sans réponse à temps : impossible de savoir s'il est passé, rien n'est renvoyé
        this.log(`écriture INCERTAINE (pas de réponse à temps) : ${p.relu}`, true);
        return { ok: false, dire: 'Le CRM n\'a pas répondu à temps : je ne sais pas si c\'est enregistré. Dis-lui de vérifier dans Mes tâches, sans réessayer tout de suite.', phrase: 'Le CRM n\'a pas répondu : vérifie dans Mes tâches si c\'est passé.' };
      }
      throw e;
    }
    if (!r.ok) { this.pending = p; return { ok: false, dire: `Le CRM a refusé : ${r.erreur || 'erreur'}. Rien n'est écrit ; dis-le simplement.`, phrase: 'Le CRM a refusé : rien n\'est écrit.' }; }
    this.log(`enregistré : ${p.relu}`, true);
    this.dernierEnregistre = { at: Date.now(), relu: p.relu };
    if (p.type === 'tache') this.journee = null;          // la journée gardée n'a pas cette tâche
    const jour = p.date ? jourDit(new Date(+p.date.slice(6), +p.date.slice(3, 5) - 1, +p.date.slice(0, 2))) : '';
    return p.type === 'tache'
      ? { ok: true, dire: `C'est noté dans Mes tâches pour le ${jour}. Confirme-le en une phrase.`, phrase: `C'est noté dans tes tâches pour le ${jour}.` }
      : { ok: true, dire: 'C\'est prêt dans le CRM, dans Mes tâches, rubrique « Dicté à Wilson » : il le validera une fois garé, avec Enregistrer. Dis-le en une phrase.',
        phrase: 'C\'est prêt : tu le valideras dans le CRM, dans Mes tâches.' };
  }

  // ---- écritures confirmées, en attente du réseau (C8 bis) ----
  _enqueue(p, payload) {
    this.queue.push({ payload, relu: p.relu, type: p.type, at: Date.now() });
    this._saveQueue();
    this.log(`pas de réseau : écriture gardée sur le téléphone, envoyée au retour du réseau : ${p.relu}`, true);
    clearTimeout(this._qT); this._qT = setTimeout(() => this.flushQueue(), 30000);
  }
  _saveQueue() { ecrireLocal(QUEUE_KEY, this.queue); }
  async flushQueue() {
    if (!this.queue.length || this._flushing || !this.on) return;
    if (!navigator.onLine) { clearTimeout(this._qT); this._qT = setTimeout(() => this.flushQueue(), 30000); return; }
    this._flushing = true;
    try {
      while (this.queue.length) {
        const q = this.queue[0];
        let r; const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 40000);
        try { r = await this.ask(q.payload, ctl.signal); }
        catch (e) {
          if (e.name !== 'AbortError' && netErr(e)) { clearTimeout(this._qT); this._qT = setTimeout(() => this.flushQueue(), 30000); return; }
          r = { ok: false, erreur: e.name === 'AbortError' ? 'pas de réponse à temps, je ne sais pas si c\'est passé : vérifie dans Mes tâches' : e.message };
        } finally { clearTimeout(tm); }
        this.queue.shift(); this._saveQueue();
        if (r.ok) { this.log(`enregistré au retour du réseau : ${q.relu}`, true); if (q.type === 'tache') this.journee = null; }
        else this.log(`refusé au retour du réseau (${r.erreur || 'erreur'}) : ${q.relu}`, true);
        if (this.app._crmQueued) this.app._crmQueued(q, !!r.ok, r.erreur);
      }
    } finally { this._flushing = false; }
  }

  // ---- itinéraire (C12) ----
  async routeTarget({ client = '' } = {}, signal, { confirme = false } = {}) {
    const Q = await this._qui(client, signal);
    if (Q.dire) return { ok: false, dire: Q.dire };
    const S = Q.soc, ou = `${S.societe}${S.ville && !plat(S.ville).includes(plat(S.societe)) ? ' à ' + S.ville : ''}`;
    // P8, journal du 12/11/26, 08h42 : nom entendu approximatif → le guidage ne part pas ; il demande d'abord (un « oui » suffit).
    const AC = this.aConfirmer, attendu = !!(AC && Date.now() - AC.at < 120000 && AC.societe === S.societe);
    if (Q.sur || (confirme && attendu)) this.aConfirmer = null;
    else {
      this.aConfirmer = { at: Date.now(), societe: S.societe, ville: S.ville || '', dit: client };
      this.log(`itinéraire : « ${client} » ressemble à ${ou}, pas assez pour lancer le guidage — je fais confirmer`);
      return { ok: false, aConfirmer: true, dire: `RIEN N'EST LANCÉ. Ce que tu as entendu (« ${client} ») ressemble à ${ou}, sans certitude. Demande-lui seulement : « Je te guide vers ${ou}, c'est bien ça ? ». S'il dit oui : rappelle itineraire avec client = « ${S.societe}${S.ville ? ' ' + S.ville : ''} ». Sinon, redemande-lui le nom du client.` };
    }
    let e = { societe: S.societe, cle: (Q.contact || S.principal || {}).cle || '', contact: (Q.contact || S.principal || {}).nom || '', adresse: (Q.contact && Q.contact.adresse) || S.adresse || '' };
    if (!e.adresse) {                                         // pas d'adresse dans l'annuaire (ou fiche ancienne) : la fiche du CRM
      const c = await this.ask({ action: 'crm_client', cle: e.cle }, signal).catch(() => null);
      if (c && c.ok && c.cle) e = this._keep(c);
    } else if (!this._ficheDeSociete(S.societe) && e.cle) {
      // Il y va : sa fiche est lue d'avance, en arrière-plan, pour que la question suivante n'attende pas le CRM.
      this.ask({ action: 'crm_client', cle: e.cle }).then((c) => { if (c && c.ok && c.cle) { const D = this.dernier; this._keep(c); if (D && D.soc.societe === c.societe) this.dernier = { ...D, e: this.last, at: Date.now() }; this.log(`fiche lue d'avance : ${c.societe}`); } }).catch(() => {});
    }
    if (!e.adresse) return { ok: false, dire: `La fiche de ${e.societe} n'a pas d'adresse dans le CRM. Dis-le simplement.` };
    const q = encodeURIComponent(e.adresse);
    // Choisi dans une liste de clients possibles il y a moins de 5 min (journal du 05/11/26, 14h36 : CREZE pris dans la liste
    // proposée pour « entreprise Galet ») : si le bon client est retrouvé ensuite, le bouton le suivra (app.js).
    const D = this.dernierChoix, douteux = !!(D && Date.now() - D.at < 5 * 60000 && dansTexte(D.texte, e.societe));
    const target = { societe: e.societe, cle: e.cle, contact: e.contact, adresse: e.adresse, douteux,
      maps: `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`, waze: `https://waze.com/ul?q=${q}&navigate=yes` };
    return { ok: true, target, dire: `Le bouton pour aller chez ${e.societe} (${e.adresse}) est affiché : dis-lui en une phrase d'appuyer sur « Y aller » ; le guidage s'ouvre sur le téléphone et sur l'écran de la voiture, et pour te reparler il reviendra sur Wilson.` };
  }

  // ---- appeler (C4) ----
  async callTarget({ client = '', contact = '' } = {}, signal) {
    const Q = await this._qui(client, signal);
    if (Q.dire) return { ok: false, dire: Q.dire };
    const S = Q.soc, e = { societe: S.societe, cle: (S.principal || {}).cle || '', contact: (S.principal || {}).nom || '' };
    const cs = S.contacts.filter((c) => c.tel && String(c.tel).replace(/\D/g, '').length >= 9);
    let c = null;
    if (contact) c = personneParmi(cs, contact).contact || null;
    if (c && this.dernier && this.dernier.soc.societe === S.societe) this.dernier.contact = c;
    if (!c && Q.contact) c = cs.find((x) => x.cle === Q.contact.cle) || null;      // la personne par laquelle il a désigné le client
    if (!c) c = cs.find((x) => x.nom === e.contact) || cs[0];
    if (!c) return { ok: false, dire: `Le CRM n'a pas de numéro pour ${e.societe}. Dis-le simplement.` };
    const tel = String(c.tel).replace(/[^\d+]/g, '');
    this.call = { nom: c.nom, societe: e.societe, cle: c.cle || e.cle, tel, aff: String(c.tel).trim() };
    return { ok: true, target: this.call,
      dire: `Le bouton vert pour appeler ${c.nom} (${e.societe}) au ${String(c.tel).trim()} est affiché : dis-lui d'appuyer dessus pour lancer l'appel.` };
  }
}

// Texte d'un résultat du CRM pour Gemini : l'info, puis la consigne d'oral.
export function pourGemini(texte, voiture) {
  return `${texte}\nRéponds à sa question à partir de ces informations seulement (n'invente rien, ne lis pas tout) : ${voiture ? 'une ou deux phrases très courtes, il conduit' : 'une à trois phrases'}, montants arrondis, dates dites naturellement (« jeudi 30 octobre »).`;
}
