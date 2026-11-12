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
// Un ordre d'écrire (« Enregistre la visite chez… », « note que… ») : jamais une question pour l'analyste ou Claude (lecture seule).
export function ordreEcriture(t) { return /^\s*(?:(?:tu peux|peux-tu|est-ce que tu peux|il faut|faut) )?(?:m'|me |lui )?(enregistre[rsz]?|note[rsz]?|ajoute[rsz]?|mets|mettre|marque[rsz]?|cree[rsz]?|indique[rsz]?|saisi[rst]?|ecri[rst]|ecrire|redige[rsz]?|fais (un|le) compte[- ]rendu)\b/.test(plat(t)); }
export function estItineraire(t) { return /\b(itineraire|gps|guide[- ]moi|emmene[- ]moi|amene[- ]moi|conduis[- ]moi|navigation|y aller|route vers|emmenes?|amenes?|me guides?|me guider|waze|google maps|guidage|on y va|allons chez|on va chez|comment aller)\b/.test(plat(t)); }
// Didascalie lue à voix haute (journal du 09/11/26, 17h52:33 et 17h59:07 : « (Wilson reste silencieux car la conversation
// ne semble pas s'adresser à lui.) ») : pour se taire, Gemini ne doit rien dire du tout ; l'appli coupe ce qui ressemble à ça.
export function estDidascalie(t) {
  const x = plat(t);
  return /^\s*[([*]/.test(x) || /\b(je reste|il reste|wilson reste|reste|rester|demeure) (silencieux|muet)\b|ne (me )?semble pas s'adresser a (lui|moi)|[([*]\s*(silence|pause|wilson|il se tait|se tait|attend|ne dit rien|ne repond pas)\b/.test(x);
}

// Il dit qu'il n'a PAS demandé le guidage (journal du 06/11/26, 08h45:13 : « Et pourquoi tu as activé le GPS alors que j'ai pas
// dit que on allait à Lèbre ? » → Gemini a relancé le guidage, à cause du mot « GPS »).
// Journal du 12/11/26, 08h45:03 et 08h45:13 : « tu supprimes la destination dans le GPS », « enlève-le » → guidage RELANCÉ
// (le mot « GPS » suffisait) : supprimer, retirer, effacer, stop sont des refus.
export function refusItineraire(t) { return /\b(pas demande|pas dit|pourquoi (tu|t'as|as-tu|il)|arrete|annule|coupe|eteins|enleve|enlever|ferme|supprim\w*|retire|retirer|efface|effacer|stop|n'y (vais|va|allons) pas|on y va pas|j'y vais pas|pas besoin|pas la peine|je (ne )?veux pas|j'veux pas|non non|pas (au|le) bon)\b/.test(plat(t)); }
// Journal du 12/11/26, 08h44:11, 08h45:25, 08h45:53 et 08h46:17 : « je veux aller voir la société FMA », « Je veux aller chez
// FMA », « tu vas naviguer vers… » puis le nom, « Oui. Oui. » à « tu confirmes que tu veux aller chez… ? » : tous refusés
// (« il n'a pas demandé d'y aller ») parce que « aller chez », « naviguer » n'étaient pas reconnus, et qu'une phrase qui
// commence par « je veux pas aller chez Bouygues » était refusée en entier. Une demande d'y aller se dit aussi comme ça.
const DEMANDE_ALLER = /\b(je veux|je voudrais|j'aimerais|je souhaite|je dois|il faut que j'|on veut|on doit|on va|tu peux m'|peux-tu m'|tu m'emmenes|tu m'amenes|tu vas m'emmener|tu vas m'amener) ?(y )?aller\b|\b(navigue[rsz]?|naviguer|destination|direction)\b/;
export function estDemandeAller(t) { return estItineraire(t) || DEMANDE_ALLER.test(plat(t)); }
// Sa phrase parle-t-elle du guidage, et dans quel sens ? true : il veut y aller ; false : il n'en veut pas (ou veut l'arrêter) ;
// null : rien sur le guidage (un nom seul, « oui »…). C'est sa DERNIÈRE proposition qui compte : « je veux pas aller chez
// Bouygues, je veux aller chez FMA » est une demande ; « emmène-moi chez X… non, annule » est un refus.
export function demandeItineraire(t) {
  const parts = plat(t).split(/[.!?;,]+|\b(?:mais|plutot|par contre)\b/).map((x) => x.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (refusItineraire(parts[i])) return false;
    if (estDemandeAller(parts[i])) return true;
  }
  return null;
}
// Il veut arrêter le guidage en cours (« supprime la destination », « enlève le GPS », « arrête la navigation »).
export function arretGuidage(t) { const x = plat(t); return /\b(arrete|annule|coupe|enleve|ferme|supprim\w*|retire|efface|stop)\b/.test(x) && /\b(gps|guidage|destination|navigation|itineraire|maps|waze|le trajet)\b|\benleve[- ]le\b/.test(x); }
// Il demande l'heure ou la date (journal du 12/11/26, 08h44:33, 08h45:34 et 08h46:58 : « お », « Voilà. », « Bah, c'est pas
// trop tôt. » → date_et_heure et « Il est 8h44. » ; Timothée, furieux : « je t'ai pas demandé l'heure »). Aussi quand il faut
// la date pour un rappel ou un minuteur (« demain », « ce soir », « dans 10 minutes »).
export function demandeHeure(t) { return /\b(heures?|date|quel jour|on est (le|quel|quand)|sommes[- ]nous|quel mois|quelle annee|aujourd'hui|demain|hier|ce soir|ce matin|cet apres-midi|semaine|rappel\w*|rappelle|minuteur|reveil|dans \d+|combien de temps|quand)\b/.test(plat(t)); }
// Un simple « oui » (à une proposition de Wilson).
export function estOui(t) { const x = plat(t).trim(); return x.split(/\s+/).length <= 6 && /^(oui|ouais|ok|okay|d'accord|vas-y|vas y|allez|go|volontiers|bien sur|c'est parti|carrement|parfait|yes)\b/.test(x); }

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
// Journal du 12/11/26, 08h46:03 : « Angibaud » coupé alors que Timothée venait de dire « Ongibaud » (une voyelle de différence,
// 0,917) : pour un nom de 6 lettres ou plus, 0,90 suffit.
export function nomAncre(nom, mots) {
  const parts = plat(nom).split(/[-' ]+/).filter((p) => p.length >= 3);
  if (!parts.length) return true;
  return parts.every((p) => mots.has(p) || [...mots].some((w) => w.length >= 4 && Math.abs(w.length - p.length) <= 2 && jaroWinkler(p, w) >= (p.length >= 6 ? 0.9 : 0.92)));
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

// Journal du 06/11/26, 08h46:06 : il redemande « le nombre de clients actifs ce mois-ci » une minute après la réponse de
// Claude ; Wilson la répète (23, 49, 26 : tous dans cette réponse) et le verrou l'a jetée, puis la même recherche a repris
// 80 s. Une REPRISE d'un résultat récent peut être dite sans nouvel outil : tous ses chiffres et au moins 70 % de ses mots
// sont dans un même résultat d'outil (ou réponse donnée en message), aucun nom inventé, rien d'écrit dans le CRM.
export const nombresDe = (t) => (String(t || '').match(/\d+(?:[\u00a0\u202f .]\d{3})*(?:,\d+)?/g) || []).map((n) => n.replace(/[\u00a0\u202f .]/g, ''));
export function repriseFondee(t, mots, sources = []) {
  const x = String(t || '').trim();
  if (!x || x.split(/\s+/).length > 90 || annonceRecherche(x)) return false;
  if (/\b(j'ai (ajoute|note|enregistre|mis|indique|marque|cree)|c'est (note|fait|enregistre|ajoute))\b/.test(plat(x))) return false;
  const ns = nombresDe(x), ws = [...motsDe(x)].filter((w) => w.length >= 4);
  if (!ns.length || ws.length < 3 || nomsInventes(x, mots).length) return false;
  return sources.some((src) => {
    const N = new Set(nombresDe(src)); if (!ns.every((n) => N.has(n))) return false;
    const W = motsDe(src); return ws.filter((w) => W.has(w)).length >= 0.7 * ws.length;
  });
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
