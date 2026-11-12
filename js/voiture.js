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
export function estItineraire(t) {
  const x = plat(t);
  // Journal du 12/11/26, 08h43-08h46 : « Je veux aller chez … », « tu vas naviguer vers… », « définis la destination dans le
  // GPS » n'étaient pas reconnus comme des demandes d'y aller.
  return /\b(itineraire|gps|guide[- ]moi|emmene[- ]moi|amene[- ]moi|conduis[- ]moi|navigation|y aller|route vers|emmenes?|amenes?|me guides?|me guider|waze|google maps|guidage|on y va|allons chez|on va chez|comment aller|destination|navigue[sz]?|naviguer)\b/.test(x)
    || /\b(je (veux|voudrais|souhaite|dois|voulais)|j'aimerais|il faut que j'aille|faut que j'aille)\b[^.!?]{0,12}\b(aller|me rendre|passer|aille)\b[^.!?]{0,8}\b(chez|a|au|aux|vers|voir)\b/.test(x)
    || /\bfaut que j'aille (chez|a|au|aux|vers|voir)\b/.test(x);
}
// Il demande d'ARRÊTER le guidage (journal du 12/11/26, 08h45:08 et 08h45:17 : « tu supprimes la destination dans le GPS »,
// « enlève-le » → Wilson a RELANCÉ le guidage, deux fois). Une page ne peut pas arrêter Maps : il le dit, et ne lance rien.
export function estArretGuidage(t) {
  const x = plat(t);
  return /\b(supprime[sz]?|enleve[sz]?|arrete[sz]?|annule[sz]?|coupe[sz]?|stoppe[sz]?|vire[sz]?|retire[sz]?|efface[sz]?|ferme[sz]?|desactive[sz]?|eteins|stop)\b[^.!?]{0,40}\b(gps|guidage|navigation|itineraire|destination|trajet|maps|waze)\b/.test(x)
    || /\b(gps|guidage|navigation|itineraire|destination)\b[^.!?]{0,25}\b(arrete[sz]?|coupe[sz]?|supprime[sz]?|enleve[sz]?|stop)\b/.test(x)
    || /\b(plus|pas) besoin (du|de) (gps|guidage|l'itineraire)\b/.test(x);
}
// Dans ce qu'il vient de dire, demande-t-il d'y aller ? 'oui', 'non' (reproche, refus), 'arret' (arrêter le guidage) ou ''
// (il n'en parle pas). Morceau par morceau, le dernier l'emporte : « Je veux pas aller chez A. Je veux aller chez B. » = oui
// (08h45:25, refusé à tort : « Pardon, je ne lance rien »).
const VOEU = /\b(je (veux|voudrais|souhaite|dois|voulais)|j'aimerais|faut que j'aille|emmene[- ]moi|amene[- ]moi|guide[- ]moi|conduis[- ]moi|lance|mets|met|definis?|on y va|allons|vas-y)\b/;
export function guidageDit(t) {
  if (estArretGuidage(t)) return 'arret';
  const morceaux = plat(t).split(/[.!?;]+|,\s*|\bmais\b|\bplutot\b|\bpar contre\b/).map((c) => c.trim()).filter(Boolean);
  const vus = morceaux.map((c) => {
    const neg = refusItineraire(c) || /\b(pas|plus|jamais)\b/.test(c);
    if (estItineraire(c)) return neg ? 'non' : VOEU.test(c) ? 'OUI' : 'oui';
    return neg && /\b(aller|emmen|amen|guid|navig|gps|chez)/.test(c) ? 'non' : '';
  }).filter(Boolean);
  if (!vus.length) return refusItineraire(t) ? 'non' : '';
  if (!vus.includes('non') && !vus.includes('OUI') && refusItineraire(t)) return 'non';       // « là, tu m'emmènes chez A, je veux pas ! »
  // un reproche dans la phrase : « là, tu m'emmènes chez A » est un constat, pas une demande ; seul un vœu net compte
  const d = vus.includes('non') ? vus.filter((v) => v !== 'oui').pop() : vus[vus.length - 1];
  return d === 'non' ? 'non' : 'oui';
}
// Le client demandé à l'outil est-il celui dont il ne veut PAS ? (« je veux pas aller chez A, je veux aller chez B » : A refusé)
export function clientRefuse(t, client) {
  const mots = plat(client).split(/[^a-z0-9]+/).filter((m) => m.length >= 3); if (!mots.length) return false;
  const morceaux = plat(t).split(/[.!?;]+|,\s*|\bmais\b|\bplutot\b|\bpar contre\b/).map((c) => c.trim()).filter(Boolean);
  const dans = (c) => mots.some((m) => new RegExp('\\b' + m + '\\b').test(c));
  const non = morceaux.filter((c) => (refusItineraire(c) || /\b(pas|plus)\b/.test(c)) && dans(c)), oui = morceaux.filter((c) => !(refusItineraire(c) || /\b(pas|plus)\b/.test(c)) && VOEU.test(c) && dans(c));
  return non.length > 0 && !oui.length;
}
// Ce que Wilson vient de dire propose-t-il d'y aller ? (son « oui » vaut alors demande)
export function proposeGuidage(t) { return /\b(guid\w*|itineraire|gps|y aller|emmen\w*|on y va|navigu\w*|aller chez|destination|te conduire)\b/.test(plat(t)) && /\?/.test(String(t || '')); }

// A-t-il demandé l'heure ou la date (ou quelque chose qui en a besoin : rappel, minuteur, agenda) ? Journal du 12/11/26,
// 08h44-08h47 : « Voilà. », « Bah, c'est pas trop tôt. » → date_et_heure → « Il est 8h46. », cinq fois ; « je m'en fous de
// l'heure, arrête de me dire l'heure à chaque fois ».
export function demandeHeure(t) {
  const x = plat(t);
  if (/\b(m'en fous|me fous|pas demande|arrete|t'ai rien demande)\b[^.!?]{0,40}\b(heure|date)\b/.test(x)) return false;
  return /\b(heure|quel jour|quelle date|la date|on est (le )?(quel|combien)|quand est-ce|dans combien de temps|en retard|en avance|rappel|rappelle|minuteur|agenda|rendez-vous|rdv|tache|demain|ce soir|ce matin|cet apres-midi|aujourd'hui|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|semaine|mois)\b/.test(x);
}

// Une simple réaction (« Voilà. », « Bah, c'est pas trop tôt. », « Ah, tu bugues. », un bruit mal transcrit) : même juste
// après une demande de travail, ce n'en est pas une — elle ne verrouille pas le tour. (Avant : verrou → il fallait un outil
// → date_et_heure → « Il est 8h44 ».) Une question, un chiffre, un nom propre, un mot du métier ou une suite (« et lui ? »,
// « son numéro ») restent du travail.
export function estReaction(t) {
  const brut = String(t || ''), x = plat(brut).replace(/[^a-z0-9' ?-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!x) return true;
  if (MOTS_TRAVAIL.test(x) || RACINES_TRAVAIL.test(x) || /\d/.test(x)) return false;
  if (/\b(tu bugues?|tu beugues?|ca (ne )?va pas|c'est nul|n'importe quoi|m'en fous|t'ai pas demande|pas demande|c'est pas (trop tot|possible|vrai|ca)|bordel|putain|merde|laisse tomber|tant pis|c'est quoi ce bazar|tu m'ecoutes pas|tu comprends rien)\b/.test(x)) return true;
  if (/\?/.test(brut) || x.split(' ').length > 4 || nomsPropres(brut).length) return false;
  return !/^(et|qui|que|quoi|quand|ou|combien|comment|pourquoi|quel|quelle|quels|quelles|est-ce|c'est quoi|son|sa|ses|leur|leurs|lui|elle|eux|hier|demain|pareil|meme chose|aussi|pour|avec|chez)\b/.test(x);
}

// Il finit par « Autre chose ? », « Tu as besoin d'autre chose ? », « Tu as une autre question ? » : Timothée l'a interdit
// le 05/11 (19h23, 23h58), le 06/11 (08h47), et c'est revenu le 12/11 (08h47, 09h56, 09h57) malgré la consigne. L'appli
// coupe cette fin de phrase elle-même. Rend la question de trop (texte), ou ''.
export function finDeTrop(t) {
  const x = String(t || '').trim(), m = /(?:^|[.!?…:;»"]\s*)([^.!?…]{0,70}\?)\s*$/.exec(x);
  if (!m) return '';
  const q = plat(m[1]);
  return /\b(autre chose|quelque chose d'autre|autres? questions?|autre demande|besoin d'autre|d'autres? (questions?|choses?)|que puis-je faire d'autre|je peux (faire|t'aider)[^?]{0,20}(d'autre|autre chose)|encore besoin de moi)\b/.test(q) ? m[1].trim() : '';
}
// Didascalie lue à voix haute (journal du 09/11/26, 17h52:33 et 17h59:07 : « (Wilson reste silencieux car la conversation
// ne semble pas s'adresser à lui.) ») : pour se taire, Gemini ne doit rien dire du tout ; l'appli coupe ce qui ressemble à ça.
export function estDidascalie(t) {
  const x = plat(t);
  return /^\s*[([*]/.test(x) || /\b(je reste|il reste|wilson reste|reste|rester|demeure) (silencieux|muet)\b|ne (me )?semble pas s'adresser a (lui|moi)|[([*]\s*(silence|pause|wilson|il se tait|se tait|attend|ne dit rien|ne repond pas)\b/.test(x);
}

// Il dit qu'il n'a PAS demandé le guidage (journal du 06/11/26, 08h45:13 : « Et pourquoi tu as activé le GPS alors que j'ai pas
// dit que on allait à Lèbre ? » → Gemini a relancé le guidage, à cause du mot « GPS »).
export function refusItineraire(t) { return /\b(pas demande|pas dit|pourquoi (tu|t'as|as-tu|il)|arrete|annule|coupe|eteins|enleve|ferme|n'y (vais|va|allons) pas|on y va pas|j'y vais pas|pas besoin|pas la peine|je (ne )?veux pas|non non)\b/.test(plat(t)); }
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

// Une question sur les CONTACTS d'un client (qui, fonction, numéro, adresse) : l'annuaire gardé sur l'appareil y répond tout
// de suite, sans IA (journal du 12/11/26, 09h26 : « qui est le magasinier de … ? » → 46 s par Claude ; remarque du 10/11,
// 08h51 : « l'accès aux données du CRM devrait être possible sans passer par l'IA »). Pas une question sur l'activité.
export function questionContacts(t) {
  const x = plat(t);
  if (/\b(commandes?|devis|chiffre|ca|visites?|vu|vus|dernier|derniere|dernieres|achete|achat|achats|comptes?[- ]rendus?|taches?|rendez-vous|rdv|quand|combien|sujets?|briefing|mails?|e-mails?|relance|objectif)\b/.test(x)) return false;
  return /\b(qui (est|sont|s'occupe|gere|fait)|c'est qui|comment s'appelle|le nom d|numero|telephone|portable|adresse|ou (est|sont|se trouve)|quelle ville|contacts?|interlocuteurs?|magasinier|acheteu\w*|dirigeant\w*|gerant\w*|patron\w*|responsable|comptable|secretaire|fonction)\b/.test(x);
}
// crm_question avec une écriture (journal du 12/11/26, 09h55 : « Enregistre la visite chez … » envoyé à Claude, en lecture
// seule : « je ne peux pas enregistrer »). Une demande d'écrire n'est jamais une question.
export function ordreEcriture(t) { return /^\s*(enregistre[rsz]?|note[rsz]?|ajoute[rsz]?|indique[rsz]?|cree[rsz]?|saisi[srt]?|saisir|marque[rsz]?|inscri[srt]|mets|mettre)\b/.test(plat(t)); }
