// Wilson — constantes et petites fonctions partagées par js/app.js et les méthodes rangées dans js/app/.
// Déplacées telles quelles de js/app.js le 24/11/26 (aucun changement de comportement).
import * as VP from '../voiture.js';

const hhmm = (t) => { const d = new Date(t); return `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`; };

// Protocole voiture (PLAN 2 quinquies) : les seuls outils déclarés à Gemini quand le téléphone est relié à la voiture.
const OUTILS_VOITURE = ['crm_client', 'crm_contacts', 'crm_agenda', 'crm_bilan', 'crm_produit', 'crm_question', 'question_difficile', 'mails', 'mail_envoyer','itineraire', 'appeler', 'crm_noter', 'crm_confirmer',
  'date_et_heure', 'batterie', 'chercher', 'meteo', 'rappel', 'minuteur', 'remarque', 'mes_remarques', 'idees', 'bourse', 'messages', 'agenda', 'memoriser', 'oublier',
  'terminer_conversation', 'repondre_question'];
// L'appli Android (PLAN 9) : son pont, s'il est là (null dans Chrome). Jamais d'erreur vers Wilson.
const appli = () => { try { return window.WilsonAndroid || null; } catch (_) { return null; } };
const pont = (f, ...a) => { try { const A = appli(); return A && typeof A[f] === 'function' ? A[f](...a) : null; } catch (_) { return null; } };
const VOITURE_QUITTE_MS = 20000;
// Consignes qui portent un résultat (ou une phrase dictée par l'appli) : ce que Wilson dit ensuite a une source.
const RE_CONSIGNE_FONDEE = /^\[(Nouvelles de la voiture|Dis-lui seulement|Dis-lui exactement|Dis seulement|Point d'avancement|Tu as le résultat|Résultat de|La recherche|ATTENTION|Donne-lui maintenant|Donne maintenant|Le réseau est revenu)|Résultat :|[Rr]éponse de l'analyste|enregistré dans le CRM/;  // Bluetooth perdu moins de 20 s (reconnexion d'Android Auto) : toujours en voiture
// Mises à jour : TOUT DE SUITE (décision de Timothée du 16/11/26, 12h45, qui remplace la règle du 04/11/26 « une fois par
// jour, la nuit, 4h00-5h00 ») : « on le fait tout de suite et on dit que Wilson n'est pas disponible ; il pourrait changer un peu
// de tête, le temps que la mise à jour se règle ». Wilson regarde s'il y a une nouvelle version toutes les 5 minutes ; il finit
// la phrase ou l'outil en cours (2 min au plus ; jamais pendant un appel téléphonique), affiche sa tête de mise à jour, le dit
// s'il était en pleine discussion, puis se recharge.
const MAJ_VERIF_MS = 5 * 60000;
const PREROLL_MS = 1600;          // R2 : le début de la phrase (avant que le regard soit confirmé, 0,6 s au moins) est transmis
const VISAGE_ATTENTE_MS = 2000;  // 18/11/26 : au regard, attente de la reconnaissance du visage avant d'ouvrir (consigne de Gemini)
const SEG_GAP_MS = 700;           // R1 (01/11/26) : deux morceaux de voix séparés de plus de 0,7 s = deux phrases
const SEG_VU_MIN = 8;             // R1 : une phrase « dite en le regardant » = au moins 8 blocs de 20 ms de voix avec le regard confirmé
const TAIL_MS = 300;              // ne pas renvoyer la fin de sa propre voix
const TAIL_NOAEC_MS = 700;        // idem sans annulation d'écho (coupure « prudente ») : l'écho de la pièce et du haut-parleur dure plus
const TURN_GATE_MS = 5000;        // micro coupé pendant tout le tour de parole de Wilson (trous de réseau compris), 5 s max sans son
const LOOK_GRACE_MS = 3000;       // R3 : on peut détourner les yeux 3 s ; au-delà, il se met en veille (règle de Timothée, 24/10/26)
const VOITURE_ETAT_MS = 60000;     // voiture : ce que Home Assistant en voit, noté au journal 1 min après une commande (19/11/26, 08h55)
const REGARD_DIALOGUE_MS = 30000; // … sur la tablette, une fois la discussion engagée : 30 s (remarque de Timothée du 19/11/26, 08h44)
const LOOKED_IDLE_MS = 60000;     // tant qu'on le regarde, il reste à l'écoute, 60 s de silence au plus
const SEARCH_MAX_MS = 30000;      // outil « chercher » : Wilson a dit qu'il cherchait, il répond quand il a l'info (filet : 30 s)
const CRM_MAX_MS = 40000;         // question au CRM (script → CRM) : filet de sécurité
// Demande de Timothée du 01/11/26 : « supprime le mode voiture ». Plus de bouton, plus de réglage, plus de démarrage en
// roulant : le mode voiture ne peut plus s'allumer (le code reste en sommeil, testé, pour pouvoir le remettre).
const VOITURE = false;
const NOM_DELAI_VOITURE_MS = 10000, NOM_DELAI_MAISON_MS = 8000;   // 04/11/26, 17h57 : 4 s était trop court en voiture (réveils sur des bruits)
const NOM_RELAIS_MS = 3000;       // vérification de « Wilson » sans réponse après 3 s : un 2e modèle en même temps (05/11/26)
const APRES_OUTIL_MS = 3000;      // muet après le résultat d'un outil : relance au bout de 3 s (5 s avant le 05/11/26)
const MESSAGE_CALME_MS = 3000;    // message de la famille : dit pendant la discussion après 3 s de calme (journal du 18/11/26, 21h45)
const QUESTION_CALME_MS = 5000;   // question de Claude : posée après 5 s de calme, sa demande réglée (journal du 18/11/26)
const ATTENTE_GOOGLE_MS = 3000;   // voiture : phrase transcrite, plus un mot depuis 3 s et pas de réponse → fin de phrase forcée (« réponds » au bout de 5 s avant la 1.29.0)
const ATTENTE_EXPLIQUE_MS = 6000; // … 6 s (9 s si le micro croit encore entendre une voix) quand il explique encore quelque chose (remarque du 18/11/26, 17h58)
// Remarque de Timothée du 20/11/26, 11h58 (voiture) : remarque et crm_noter attendent la fin de sa phrase avant de partir.
const FIN_PHRASE_MS = 1200;         // plus un mot transcrit depuis 1,2 s (et le micro n'entend plus sa voix)
const FIN_PHRASE_SUITE_MS = 3500;   // … 3,5 s si la phrase s'arrête sur « euh », « et », une virgule, ou annonce une suite
const FIN_PHRASE_REPRISE_MS = 4000; // … annulé par Google (il parlait encore) : 4 s de calme, le temps que Gemini le redemande en entier
const FIN_PHRASE_MAX_MS = 15000;    // filet : 15 s au plus
const MICRO_RETENU_MS = 1500;     // après une fin de phrase forcée : micro retenu, pour que Google ne reparte pas sur le bruit
const REPONDS_APRES_MS = 2500;    // … et toujours rien : « réponds-lui maintenant »
const LENT_APRES_FORCE_MS = 3500; // … et toujours rien 3,5 s après la fin forcée : « le réseau est lent » dit tout de suite (20/11/26)
const NOM_SON_MAX_MS = 12000;     // son envoyé pour la vérification : tout ce qui a été dit depuis la précédente, 12 s au plus
const huitK = (p) => { const n = Math.floor(p.length / 2), o = new Int16Array(n); for (let i = 0; i < n; i++) o[i] = (p[2 * i] + p[2 * i + 1]) >> 1; return o; };   // 16 kHz → 8 kHz
const PREVENIR_MS = 5 * 60000;                                    // « je n'arrive pas à vérifier » : une fois toutes les 5 min au plus   // vérification de « Wilson » par Gemini : délai maximal (journal du 04/11/26)
const CAR_IDLE_MS = 60000;        // mode voiture : il se rendort après 1 min de silence (PLAN 2 quater, C5)
const BYNAME_IDLE_MS = 45000;     // appelé par son prénom, pas regardé : 45 s sans rien dire → veille, même si on parle autour (journal du 30/10/26, 23h06)
const NAME_GATE_MS = 7000;        // mode voiture : la 1re phrase doit contenir « Wilson » (vérifié sur la transcription, C6)
const ECO_SILENCE_MS = 500;       // mode économique : silence qui marque la fin d'une phrase
const ECO_SPEC_MS = 250;          // envoi anticipé : la phrase part dès ce silence, Wilson ne parle qu'à la fin confirmée (PLAN 6 bis)
const ECO_TAIL_MS = 1000;         // après avoir parlé : le son de la tablette finit de sortir après l'annonce « fini »
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d = new Date()) => `${JOURS[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}, ${d.getHours()}h${pad(d.getMinutes())}`;
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OBJECTIF_Q = /OBJECTIF CLIENTS ACTIFS|clients? actifs/i;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
// Clients actifs sans IA (journal du 06/11/26, 08h41 et 08h46 : 84 s puis 80 s pour « combien de clients actifs ce mois-ci » ;
// 10/11/26, 08h47-08h51 : Claude à sa limite, et remarque de Timothée à 08h51 : « l'accès aux données du CRM devrait être
// possible sans passer par l'IA ») : le nombre du mois et celui du même mois l'an dernier sont dans le bilan du CRM.
function actifsDuBilan(texte) {
  const t = String(texte || ''), m = /clients actifs ce mois-ci[^:\n]*:\s*(\d+)/i.exec(t), n1 = /m[êe]me mois l'an dernier[^:\n]*:\s*(\d+)/i.exec(t);
  return m ? { act: +m[1], act1: n1 ? +n1[1] : null } : null;
}
// Une question simple sur le nombre de clients actifs (ce mois-ci, ou le même mois l'an dernier) : { n1 } ; sinon null (analyste).
function actifsSimple(q, maintenant = new Date()) {
  const x = VP.plat(q);
  if (!/clients? actifs?/.test(x)) return null;
  if (/\b(qui|quels?|quelles?|lesquels|lesquelles|liste|lister|noms?|faire commander|relancer|pas encore|n'ont pas|pas commande|rendez-vous|rdv|demain|lundi|mardi|mercredi|jeudi|vendredi|semaine|secteur|ville|departement|pourcentage|taux|evolution|depuis|exercice|trimestre|annee entiere|sur l'annee|par mois|chaque mois)\b/.test(x)) return null;
  const ici = VP.plat(MOIS[maintenant.getMonth()]);
  if (MOIS.map((m) => VP.plat(m)).some((m) => m !== ici && new RegExp('\\b' + m + '\\b').test(x))) return null;
  if (/mois (dernier|precedent|passe)|20\d\d|il y a deux ans/.test(x)) return null;
  return { n1: /\b(l'an dernier|l'an passe|l'annee derniere|annee derniere|annee passee|n ?- ?1)\b/.test(x) && !/ce mois-ci/.test(x.replace(/^objectif clients actifs/, '')) };
}
const OBJECTIF_NB = /objectif\b[^\d\n]{0,30}?(?<![nN]\s?-\s?)(\d{1,3})\b(?!\s?%)/i;   // « objectif clients actifs 50 », « objectif de 60 »
// Chiffres du CRM dits par Wilson (garde du 05/11/26) : un nombre suivi d'un mot du CRM, ou après « objectif », « il t'en manque ».
const NB = String.raw`\d{1,3}(?:[   .]\d{3})+(?:,\d+)?|\d+(?:,\d+)?`;
const RE_CHIFFRE_CRM = new RegExp(`(${NB})\\s*(k€|k\\b|mille\\b)?\\s*(€|euros?\\b|clients?\\b|commandes?\\b|devis\\b|rendez-vous\\b|visites?\\b|tâches?\\b|%|pour ?cents?\\b)`, 'gi');
const RE_OBJECTIF_DIT = /\b(objectif|il (?:t['’]en|te) manque|manque encore)\D{0,25}?(\d{1,4})\b/gi;
const nombre = (m) => parseFloat(String(m).replace(/[   .]/g, '').replace(',', '.'));
// Les nombres d'un texte (« 12 500 », « 12,5 », « 19 »), sans les dates, les heures ni les durées (« 05/11/26 », « 18h00 »,
// « 2026-11-05T18:00 », « (9 s) ») : ce ne sont pas des chiffres du CRM, et ils feraient passer un chiffre inventé (19 − 9 = 10).

function nombresDans(t) {
  const s = String(t || '').replace(/\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b\d{1,2}\s?h\s?\d{0,2}\b|\b\d+(?:[.,]\d+)?\s?(?:s|ms|min|secondes?|minutes?)\b/g, ' ');
  const out = []; for (const m of s.matchAll(new RegExp(NB, 'g'))) { const x = nombre(m[0]); if (isFinite(x)) out.push(x); }
  return out;
}
function lireChiffres() {
  try { const l = JSON.parse(localStorage.getItem('wilson.chiffres') || '[]'); return Array.isArray(l) ? l.filter((x) => x && isFinite(x.n) && Date.now() - x.t < 8 * 3600000) : []; } catch (_) { return []; }
}
// Une chose à faire ou à rappeler (pas un souvenir) : « rappeler », « ce soir », « demain », « quand tu nous verras »…
const CHOSE_A_RAPPELER = /\b(?:rappel(?:er|le|les|ez)?(?![a-z])|ce soir|demain|tout à l'heure|cet après-midi|en rentrant|quand (?:tu|vous|on|il|elle|ils) (?:me |nous |les? |la |lui )?(?:verr|voi|rentr)|penser? à|n'oublie pas de|ne pas oublier de)/i;
const dureeTexte = (ms) => (ms < 90000 ? `${Math.max(1, Math.round(ms / 1000))} s` : `${Math.round(ms / 60000)} min`);

function nextPacificMidnight() {
  // Heure actuelle à Los Angeles, puis minuit suivant là-bas, converti en heure locale.
  const now = new Date();
  const la = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const ms = (24 * 3600 - (la.getHours() * 3600 + la.getMinutes() * 60 + la.getSeconds())) * 1000;
  return now.getTime() + ms + 60000;
}

function quotaInfo(msg, what) {
  const m = /retry in ([\d.]+)\s*s/i.exec(msg || ''), now = Date.now();
  // Limite 0 : ce projet n'a pas du tout accès à ce service ; inutile de réessayer chaque jour (on revérifie chaque semaine, ou avec « Vérifier »).
  if (/limit:\s*0\b/i.test(msg || '')) return { until: now + 7 * 24 * 3600000, txt: `Google n'accorde aucun quota gratuit à ce projet pour ${what} (limite 0).` };
  if (m && +m[1] < 3600) return { until: now + Math.ceil(+m[1]) * 1000, txt: `Google me demande de patienter ${Math.ceil(+m[1])} s (limite par minute du compte gratuit).` };
  const until = nextPacificMidnight(), d = new Date(until);
  return { until, txt: `Mon quota gratuit Google pour ${what} est épuisé pour aujourd'hui. Je pourrai reparler à ${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}.` };
}

// Retire les silences du début et de la fin (envoi plus léger, réponse plus rapide). null si rien d'audible.
function trimSilence(i16, floorDb) {
  const W = 320, n = Math.floor(i16.length / W); if (n < 3) return i16;
  const thr = Math.max(-58, floorDb + 8); let first = -1, last = -1;
  for (let k = 0; k < n; k++) {
    let e = 0; for (let j = k * W; j < (k + 1) * W; j++) { const v = i16[j] / 32768; e += v * v; }
    const db = 10 * Math.log10(e / W + 1e-12);
    if (db > thr) { if (first < 0) first = k; last = k; }
  }
  if (first < 0) return null;
  const a = Math.max(0, (first - 15) * W), b = Math.min(i16.length, (last + 13) * W);
  return i16.subarray(a, b);
}

// Retire les marques techniques que Gemini Live met parfois dans sa transcription (« <no speech>{pause} »).
// Réponse en anglais ? (plusieurs mots anglais courants, presque aucun mot français)
const MOTS_EN = new Set(['the', 'you', 'your', 'to', 'is', 'are', 'i', "i'm", 'it', "it's", 'just', 'let', 'know', 'what', 'this', 'that', 'with', 'for', 'can', 'of', 'and', 'check', 'need', 'hear', 'thoughts', 'something', 'specific', 'will', 'have', 'do', 'sure', 'here', 'there', 'how', 'help', 'please', 'sorry', 'right', 'now', 'be', 'my', 'about', 'if', 'would', 'like', 'want']);
const MOTS_FR = new Set(['le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'je', 'tu', 'il', 'elle', 'est', 'et', 'à', 'que', 'qui', 'pas', 'ne', 'pour', 'en', "c'est", 'ça', 'oui', 'non', 'mais', 'avec', 'sur', 'dans', 'te', 'ton', 'ta', 'tes', 'mon', 'ma', 'au', 'bien', 'fait', 'voilà', "j'ai", 'peux', 'veux']);
function enAnglais(t) {
  const w = String(t || '').toLowerCase().replace(/[’]/g, "'").match(/[a-zàâçéèêëîïôûùüÿœ']+/g) || [];
  if (w.length < 4) return false;
  const en = w.filter((x) => MOTS_EN.has(x)).length, fr = w.filter((x) => MOTS_FR.has(x)).length;
  return en >= 3 && en > 2 * fr;
}

function cleanSpeech(t) {
  t = String(t || '').replace(/<[^>]{0,40}>|\{[^}]{0,40}\}/g, ' ')
    // bouts de code ou de consigne lus par le modèle (journal du 04/11/26 : « response:exprimer_emotion », « try{ »,
    // « Wait for the result of mes_remarques before responding. »)
    .replace(/\b(?:response|tool_code|default_api|print|call)\s*[:.]\s*[a-z_]+(?:\([^)]{0,80}\))?/gi, ' ')
    .replace(/\btry\s*\{/g, ' ').replace(/\bWait for the result of [a-z_]+[^.]*\.?/gi, ' ').replace(/\s*\[…\]\s*$/, '').replace(/\s+/g, ' ').trim();
  return /^[\s.…!?,;:-]*$/.test(t) ? '' : t;      // « ... » seul : il n'a rien dit
}
// Expression du visage d'après ce qu'il dit (modèles sans outil du visage). null : rien de net.
export function emotionDuTexte(t) {
  t = String(t || '').toLowerCase();
  if (t.length < 6) return null;
  if (/\b(ha ?ha|hi ?hi|mdr)\b/.test(t)) return 'rire';
  if (/\b(d[ée]sol[ée]|pardon|excuse)/.test(t)) return 'gene';
  if (/\b(oh l[àa]|oula|houla|waouh|wow|ah bon|incroyable)\b/.test(t)) return 'surprise';
  if (/\b(dommage|malheureusement|triste)\b/.test(t)) return 'triste';
  if (/\b(je regarde|je cherche|voyons|attends?)\b/.test(t) && t.length < 60 && !/\?\s*$/.test(t)) return 'reflexion';
  if (/\b(g[ée]nial|super|bravo|parfait|ravi|chouette|avec plaisir|top)\b/.test(t)) return 'joie';
  if (/\?\s*$/.test(t)) return 'curieux';
  return null;
}
// Texte comparable : sans la phrase d'attente du début (« Je regarde dans le CRM… »), lettres et chiffres seuls.
export function texteCompare(t) {
  return String(t || '').toLowerCase().replace(/^\s*(je (regarde|cherche)[^.…!?]*[.…!?]+\s*)+/, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}
// La réponse en cours redit-elle la précédente ? (au moins 20 lettres identiques au début)
export function memeDebut(cur, prec) {
  const a = texteCompare(cur), b = texteCompare(prec);
  return a.length >= 20 && b.length >= 20 && b.startsWith(a.slice(0, 40));
}
// Une vraie phrase (et pas un bruit transcrit au hasard : « Eh », « Aí. ») : au moins 3 mots, ou une question de 2 mots.
function realPhrase(t) {
  const w = String(t || '').trim().split(/\s+/).filter((x) => /[a-zà-ÿ]{2,}/i.test(x));
  if (/\b(salut|coucou|bonjour|bonsoir|hello|wilson|merci|au revoir|bonne nuit)\b/i.test(t)) return true;   // salutations : on y répond
  return w.length >= 3 || (w.length >= 2 && /\?/.test(t));
}

function shorten(m) { m = (m || 'erreur inconnue').replace(/\s+/g, ' ').trim(); return m.length > 140 ? m.slice(0, 137) + '…' : m; }

// Erreur de réseau (pas de couverture, réseau trop faible) plutôt qu'un refus de Google : on attend le réseau (C8).
function isNetErr(e) {
  if (!navigator.onLine) return true;
  const m = String((e && e.message) || e || '');
  return (e && e.code === 1006) || /code 1006|Délai de connexion|Failed to fetch|NetworkError|Load failed|network|ERR_INTERNET|ERR_NAME|ERR_CONNECTION|ERR_TIMED_OUT|Jeton refusé \(0\)/i.test(m);
}

function concat(list) {
  let n = 0; for (const a of list) n += a.length;
  const out = new Int16Array(n); let o = 0; for (const a of list) { out.set(a, o); o += a.length; }
  return out;
}

export { hhmm, OUTILS_VOITURE, appli, pont, VOITURE_QUITTE_MS, RE_CONSIGNE_FONDEE, MAJ_VERIF_MS, PREROLL_MS, VISAGE_ATTENTE_MS, SEG_GAP_MS, SEG_VU_MIN, TAIL_MS, TAIL_NOAEC_MS, TURN_GATE_MS, LOOK_GRACE_MS, VOITURE_ETAT_MS, REGARD_DIALOGUE_MS, LOOKED_IDLE_MS, SEARCH_MAX_MS, CRM_MAX_MS, VOITURE, NOM_DELAI_VOITURE_MS, NOM_DELAI_MAISON_MS, NOM_RELAIS_MS, APRES_OUTIL_MS, MESSAGE_CALME_MS, QUESTION_CALME_MS, ATTENTE_GOOGLE_MS, ATTENTE_EXPLIQUE_MS, FIN_PHRASE_MS, FIN_PHRASE_SUITE_MS, FIN_PHRASE_REPRISE_MS, FIN_PHRASE_MAX_MS, MICRO_RETENU_MS, REPONDS_APRES_MS, LENT_APRES_FORCE_MS, NOM_SON_MAX_MS, huitK, PREVENIR_MS, CAR_IDLE_MS, BYNAME_IDLE_MS, NAME_GATE_MS, ECO_SILENCE_MS, ECO_SPEC_MS, ECO_TAIL_MS, JOURS, pad, fmtDate, $, esc, sleep, OBJECTIF_Q, MOIS, actifsDuBilan, actifsSimple, OBJECTIF_NB, NB, RE_CHIFFRE_CRM, RE_OBJECTIF_DIT, nombre, nombresDans, lireChiffres, CHOSE_A_RAPPELER, dureeTexte, nextPacificMidnight, quotaInfo, trimSilence, MOTS_EN, MOTS_FR, enAnglais, cleanSpeech, realPhrase, shorten, isNetErr, concat };
