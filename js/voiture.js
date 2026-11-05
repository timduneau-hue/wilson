// Wilson — le protocole voiture (PLAN.md, section 2 quinquies). Règles pures, sans état, testées seules
// (tests/voiture_unit.mjs) ; app.js les applique à chaque tour de parole quand le téléphone est relié à la voiture.
//
// Journal du 05/11/26, 15h52-16h04 (1.29.0) : en deux minutes, sans appeler un seul outil, Wilson a dit « je regarde dans
// le CRM… » puis inventé deux contacts (« Sylvain Rault », « Marie-Laure Gallet et Sébastien Gallet »), une ville
// (« Miroiterie 35 à Rennes », la fiche dit Bruz) et un enregistrement (« j'ai ajouté la visite de Sylvain Motel ») qui
// n'avait jamais eu lieu. Une consigne ne suffit pas : c'est le code qui décide ce qui peut être dit.

export const plat = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’ʼ]/g, "'");

// Une demande de travail : ses clients, ses contacts, ses visites, ses chiffres, son agenda, une écriture, un GPS, un appel.
const MOTS_TRAVAIL = /\b(crm|negos|clients?|cliente|fiches?|contacts?|interlocuteurs?|commandes?|commande|commandee?s?|devis|visites?|rendez-vous|rdv|comptes?[- ]rendus?|chiffre|chiffres|marge|ventes?|vendu|achete|achetee?s?|achats?|articles?|references?|prix|tarifs?|remises?|stock|livraisons?|factures?|objectif|actifs|entreprise|entreprises|societe|sarl|sas|ets|etablissements?|miroiterie|menuiserie|fabricant|poseur|artisan|chantier|itineraire|gps|adresse|numero|telephone de|prospects?|concurrents?|foussier|legallais|setin|champion|prolians|briefing|journee|agenda pro)\b/;
const RACINES_TRAVAIL = /\b(relanc|enregistr|factur|command|guide[- ]moi|emmene|amene|conduis[- ]moi|note[sr]?\b|noter|indique|j'ai vu|je reviens de|je suis passe|je sors de)/;
// tout ce qui n'est PAS du travail, même avec un mot ambigu (« l'heure », « la météo », « une remarque sur toi »)
const PAS_TRAVAIL = /^(\s*(oui|non|ouais|ok|d'accord|merci|c'est bon|ca va|salut|coucou)[\s,.!?]*)+$/;

export function estTravail(t, { clients = [] } = {}) {
  const x = plat(t).trim();
  if (!x || PAS_TRAVAIL.test(x)) return false;
  if (/prochaine mise a jour|remarque|pour ta mise a jour/.test(x)) return false;        // une remarque sur Wilson : outil remarque
  if (MOTS_TRAVAIL.test(x) || RACINES_TRAVAIL.test(x)) return true;
  // « Appelle Pipard » (un client) — mais pas « s'il faut que je t'appelle dix fois » (c'est Wilson qu'il appelle)
  if (/(^|[^'a-z])(appelle|appeler|telephone a|telephoner a) (?!moi\b|toi\b|wilson\b)/.test(x)) return true;
  return clients.some((c) => { const n = plat(c).replace(/[^a-z0-9 ]+/g, ' ').trim(); return n.length >= 4 && n.split(' ').some((m) => m.length >= 4 && new RegExp('\\b' + m + '\\b').test(x)); });
}
// Une écriture demandée (visite, compte rendu, tâche, rendez-vous) : jamais l'analyste (lecture seule) à sa place.
export function estEcriture(t) {
  return /\b(note|notes|noter|enregistre|enregistrer|indique|indiquer|ajoute|ajouter|mets|mettre|marque|marquer|compte[- ]rendu|tache|cree|creer)\b|j'ai vu|je suis passe|je reviens de/.test(plat(t));
}
export function estItineraire(t) { return /\b(itineraire|gps|guide[- ]moi|emmene[- ]moi|amene[- ]moi|conduis[- ]moi|navigation|y aller|route vers)\b/.test(plat(t)); }

// Ce que Wilson dit pour annoncer une recherche (« Je regarde dans le CRM… ») : sans outil derrière, rien de vrai ne suit.
export function annonceRecherche(t) { return /\b(je (re)?regarde|je cherche|je verifie|je consulte|je jette un (oeil|coup d'oeil))\b|dans (le|ton) crm|dans (la|sa) fiche/.test(plat(t)); }

// Ce qui, dans sa bouche, affirme un fait du CRM (même sans nom propre ni chiffre).
export function affirmeFait(t) {
  return /\b(je vois|j'ai trouve|il y a|tu as (un|une|des|deux|trois|\d)|j'ai (ajoute|note|enregistre|mis|indique|marque|cree)|c'est (note|fait|enregistre|ajoute)|derniere (visite|commande)|dernier (devis|rendez-vous)|son (numero|telephone|adresse)|leur (numero|adresse)|ses contacts?|le contact|la visite (de|du|d')|a commande|ont commande|a achete|ont achete)\b/.test(plat(t));
}

// Mots qui ont une majuscule sans être des noms propres ni des inventions possibles.
const COMMUNS = new Set(['je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'oui', 'non', 'ok', 'okay', 'd\'accord', 'bon', 'bien', 'alors', 'pour', 'par', 'avec', 'dans', 'sur', 'et', 'ou', 'mais', 'donc', 'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'au', 'aux', 'ce', 'cette', 'ces', 'c\'est', 'il y a', 'merci', 'pardon', 'désolé', 'desole', 'attends', 'voilà', 'voila',
  'crm', 'gps', 'sms', 'wilson', 'timothée', 'timothee', 'camille', 'louis', 'boschat', 'laveix', 'negos', 'google', 'maps', 'waze', 'android', 'auto', 'gemini', 'claude', 'internet', 'bluetooth',
  'monsieur', 'madame', 'mme', 'mr', 'm', 'mlle', 'sarl', 'sas', 'eurl', 'sa', 'ets', 'sci', 'ttc', 'ht', 'eur', 'euros', 'france',
  'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche', 'janvier', 'février', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'aout', 'septembre', 'octobre', 'novembre', 'décembre', 'decembre']);

// Les noms propres d'une phrase de Wilson (transcription de sa voix) : mots à majuscule au milieu d'une phrase, ou en capitales.
export function nomsPropres(t) {
  const out = [];
  for (const phrase of String(t || '').split(/(?<=[.!?…:;])\s+|\n+/)) {
    const mots = phrase.match(/[\p{L}][\p{L}'’-]*/gu) || [];
    mots.forEach((m, i) => {
      const nu = m.replace(/[’]/g, "'").replace(/^(l'|d'|qu')/i, '');
      if (!nu || !/^\p{Lu}/u.test(nu)) return;
      const capitales = nu.length >= 2 && nu === nu.toUpperCase();
      if (i === 0 && !capitales) return;                                   // début de phrase : majuscule ordinaire
      if (COMMUNS.has(plat(nu))) return;
      if (nu.length < 3 && !capitales) return;
      out.push(nu);
    });
  }
  return [...new Set(out)];
}

// Jaro-Winkler (noms écrits un peu autrement : « Crézé » / « CREZE », « Gallais » / « Galais »).
export function jaroWinkler(a, b) {
  if (a === b) return 1;
  const la = a.length, lb = b.length; if (!la || !lb) return 0;
  const win = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1), ma = new Array(la).fill(false), mb = new Array(lb).fill(false);
  let m = 0;
  for (let i = 0; i < la; i++) for (let j = Math.max(0, i - win); j < Math.min(lb, i + win + 1); j++) if (!mb[j] && a[i] === b[j]) { ma[i] = mb[j] = true; m++; break; }
  if (!m) return 0;
  let k = 0, tr = 0;
  for (let i = 0; i < la; i++) if (ma[i]) { while (!mb[k]) k++; if (a[i] !== b[k]) tr++; k++; }
  const j = (m / la + m / lb + (m - tr / 2) / m) / 3;
  let p = 0; while (p < 4 && a[p] === b[p]) p++;
  return j + p * 0.1 * (1 - j);
}

// Un nom a-t-il une source (résultats d'outils, ce que Timothée a dit, sa mémoire) ? Chaque partie du nom doit s'y trouver.
export function nomAncre(nom, mots) {
  const parts = plat(nom).split(/[-' ]+/).filter((p) => p.length >= 3);
  if (!parts.length) return true;
  return parts.every((p) => mots.has(p) || [...mots].some((w) => w.length >= 4 && Math.abs(w.length - p.length) <= 2 && jaroWinkler(p, w) >= 0.92));
}
export function motsDe(texte) { return new Set(plat(texte).split(/[^a-z0-9]+/).filter((w) => w.length >= 3)); }

// Les noms dits par Wilson qui ne viennent de nulle part.
export function nomsInventes(t, mots) { return nomsPropres(t).filter((n) => !nomAncre(n, mots)); }

// Clairement pas du travail : l'heure, la météo, une remarque sur Wilson, merci / au revoir / ça va.
export function horsTravail(t) {
  const x = plat(t).trim();
  return !x || PAS_TRAVAIL.test(x) || /\b(quelle heure|l'heure|meteo|quel temps|il fait (beau|froid|chaud)|pleuvoir|pluie|prochaine mise a jour|remarque|au revoir|bonne (journee|soiree|route)|merci|c'est tout|c'est bon|laisse tomber|tais-toi|stop)\b/.test(x);
}

// Une réponse sans outil qu'on peut laisser passer : rien d'affirmé (pas de chiffre, pas de nom inventé, pas de « je vois… »,
// pas de « je regarde dans le CRM »). « Ça marche, je te fais signe dès que j'ai l'info », « Pour quel client ? », « Tu parles
// de Gallais à Chavagne ? » (si ces noms ont une source) passent ; « j'ai Miroiterie 35 à Rennes » ne passe pas.
export function sansFait(t, mots) {
  const x = String(t || '').trim();
  if (!x) return true;
  if (x.split(/\s+/).length > 35 || /\d/.test(x) || affirmeFait(x) || annonceRecherche(x)) return false;
  return nomsInventes(x, mots).length === 0;
}

// Une réponse sans outil qu'on peut quand même laisser passer : une simple question pour comprendre (« Pour quel client ? »,
// « Tu parles de Gallais à Chavagne ? » si ces noms ont une source), sans chiffre, sans fait affirmé, sans nom inventé.
export function questionSansFait(t, mots) {
  const x = String(t || '').trim();
  if (!x) return true;
  const phrases = x.split(/(?<=[.!?…])\s+/).filter(Boolean);
  const courtoisie = /^(oui|non|d'accord|ok|pardon|excuse-moi|desole|attends|bien sur|tres bien|entendu)\b[^.!?]{0,30}[.!]?$/;
  const ok = phrases.every((p) => /\?\s*$/.test(p) || courtoisie.test(plat(p).trim()));
  if (!ok || x.split(/\s+/).length > 30) return false;
  if (/\d/.test(x) || affirmeFait(x) || annonceRecherche(x)) return false;
  return nomsInventes(x, mots).length === 0;
}
