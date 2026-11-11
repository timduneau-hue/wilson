// Wilson — les questions difficiles passent par Claude, sur le PC de la maison (PLAN.md, section 10).
// À ajouter au script « Wilson journal » comme fichier (dans l'éditeur Apps Script : + → Script → nommer « claude »), avec la
// ligne correspondante dans doPost de journal.gs :
//      if (String(d.action).indexOf('claude_') === 0) return json_(claude_(d));
// Puis Déployer → Gérer les déploiements → modifier → Nouvelle version.
//  - claude_demander (Wilson) : la question entre dans la file ; refusée tout de suite si le PC n'a pas donné signe de vie
//    depuis 60 s (Wilson fait alors au mieux sans lui) ;
//  - claude_prendre (relais du PC, avec son secret) : attend jusqu'à 25 s qu'une question arrive et la prend ; chaque appel
//    dit « le PC est là » ;
//  - claude_rendre (relais du PC) : dépose la réponse ;
//  - claude_resultat (Wilson) : où en est la question (attente, en cours, faite, erreur), en attendant jusqu'à 15 s qu'elle avance ;
//  - claude_annuler (Wilson) : la question ne sert plus (PC trop lent, on fait autrement) ;
//  - claude_etat (Wilson) : le PC est-il là ?
// La file est dans le cache du script (6 h au plus) : rien n'est écrit dans la feuille. Le secret du PC est gardé dans les
// propriétés du script la première fois qu'il se présente ; pour en changer, lancer « oublierPC » dans l'éditeur.
// Depuis le 11/11/26, cette première présentation doit passer par l'adresse avec la clé du script (…/exec?k=…, voir journal.gs) :
// ensuite, le relais passe avec son seul secret, pour claude_prendre, claude_rendre, claude_etat et le CRM en lecture seule.

var CLAUDE_VIVANT_MS = 60000;     // PC vu il y a plus d'une minute : absent
var CLAUDE_TTL = 21600;           // 6 h dans le cache
var CLAUDE_PRENDRE_MAX_S = 25;    // attente d'une question par le relais
var CLAUDE_RESULTAT_MAX_S = 15;   // attente d'une réponse par Wilson

function claude_(d) {
  var a = String(d.action);
  if (a === 'claude_demander') return claudeDemander_(d);
  if (a === 'claude_resultat') return claudeResultat_(d);
  if (a === 'claude_annuler') return claudeChanger_(d.id, function (q) { if (q.etat === 'attente' || q.etat === 'en_cours') q.etat = 'annulee'; });
  if (a === 'claude_etat') return { ok: true, pc: claudePc_() };
  if (a === 'claude_prendre' || a === 'claude_rendre') {
    var s = claudeSecret_(d.secret); if (!s.ok) return s;
    return a === 'claude_prendre' ? claudePrendre_(d) : claudeRendre_(d);
  }
  return { ok: false, erreur: 'action inconnue : ' + a };
}

function claudeCache_() { return CacheService.getScriptCache(); }
function claudeLire_(id) { var v = claudeCache_().get('claude_q_' + id); try { return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function claudeEcrire_(q) { claudeCache_().put('claude_q_' + q.id, JSON.stringify(q), CLAUDE_TTL); }
function claudeFile_() { var v = claudeCache_().get('claude_file'); try { return v ? JSON.parse(v) : []; } catch (e) { return []; } }
function claudeId_(x) { return String(x || '').replace(/[^\w-]/g, '').slice(0, 40); }

// Le secret du relais : le premier qui se présente (l'installateur, sur le PC de Timothée) le fixe.
function claudeSecret_(secret) {
  secret = String(secret || '');
  if (secret.length < 24) return { ok: false, erreur: 'secret du PC absent ou trop court' };
  var p = PropertiesService.getScriptProperties(), connu = p.getProperty('claude_secret');
  if (!connu) { p.setProperty('claude_secret', secret); return { ok: true, nouveau: true }; }
  return memes_(connu, secret) ? { ok: true } : { ok: false, erreur: 'secret du PC refusé (lancer « oublierPC » dans l\'éditeur pour en changer)' };
}

function claudePc_() {
  var o = null; try { o = JSON.parse(claudeCache_().get('claude_pc') || 'null'); } catch (e) {}
  if (!o) return { vivant: false, vu: null };
  var depuis = Date.now() - (+o.t || 0);
  var r = { vivant: depuis < CLAUDE_VIVANT_MS, vu: Math.round(depuis / 1000), version: o.version || '', occupe: +o.occupe || 0 };
  // W16 : limite d'utilisation de Claude signalée par le relais (jusqua = heure de reprise, en ms) : Wilson bascule sans attendre.
  if (o.limite && +o.limite.jusqua > Date.now()) r.limite = { jusqua: +o.limite.jusqua, texte: String(o.limite.texte || '') };
  return r;
}

function claudeDemander_(d) {
  var id = claudeId_(d.id), question = String(d.question || '').trim().slice(0, 2000);
  if (!id || !question) return { ok: false, erreur: 'question vide' };
  var pc = claudePc_(), deja = claudeLire_(id);
  if (deja) return { ok: true, accepte: deja.etat !== 'annulee', id: id, etat: deja.etat, pc: pc };   // renvoi après une coupure : rien en double
  if (!pc.vivant) return { ok: true, accepte: false, id: id, pc: pc };
  if (pc.limite) return { ok: true, accepte: false, id: id, limite: pc.limite, pc: pc };   // limite atteinte : rien n'entre dans la file
  var q = {
    id: id, question: question, type: d.type === 'crm' ? 'crm' : d.type === 'mail' ? 'mail' : 'internet', voiture: !!d.voiture, crm: d.type === 'crm' || d.crm === true,   // CRM : seulement pour Timothée (06/11/26)
    boite: d.type === 'mail' ? (/^(perso|pro)$/.test(String(d.boite)) ? String(d.boite) : 'les_deux') : '',   // e-mails (11/11/26) : Gmail perso, Outlook pro, ou les deux
    contexte: String(d.contexte || '').slice(0, 8000), regles: String(d.regles || '').slice(0, 8000),
    appareil: String(d.appareil || '').slice(0, 40), t: Date.now(), etat: 'attente',
  };
  var lock = LockService.getScriptLock(); if (!lock.tryLock(8000)) return { ok: false, erreur: 'script occupé, réessaie' };
  try {
    claudeEcrire_(q);
    var f = claudeFile_(); f.push(id);
    claudeCache_().put('claude_file', JSON.stringify(f.slice(-50)), CLAUDE_TTL);
  } finally { lock.releaseLock(); }
  compter_('claude', false);   // W20 : compteur du jour, montré dans l'onglet État
  return { ok: true, accepte: true, id: id, etat: 'attente', pc: pc };
}

// Le relais attend une question (jusqu'à 25 s) ; max = 0 : il est occupé, il dit seulement qu'il est là.
function claudePrendre_(d) {
  var c = claudeCache_(), fin = Date.now() + Math.min(Math.max(+d.attente || 0, 0), CLAUDE_PRENDRE_MAX_S) * 1000;
  var lim = d.limite && +d.limite.jusqua > Date.now() ? { jusqua: +d.limite.jusqua, texte: String(d.limite.texte || '').slice(0, 200) } : null;
  c.put('claude_pc', JSON.stringify({ t: Date.now(), version: String(d.version || '').slice(0, 20), occupe: +d.occupe || 0, limite: lim }), CLAUDE_TTL);
  if (d.max === 0) return { ok: true, question: null };
  for (;;) {
    if (claudeFile_().length) {
      var lock = LockService.getScriptLock();
      if (lock.tryLock(5000)) {
        try {
          var f = claudeFile_(), q = null;
          while (f.length && !q) {
            var x = claudeLire_(f.shift());
            if (x && x.etat === 'attente') q = x;                  // annulée ou expirée : on passe
          }
          c.put('claude_file', JSON.stringify(f), CLAUDE_TTL);
          if (q) { q.etat = 'en_cours'; q.pris = Date.now(); claudeEcrire_(q); return { ok: true, question: q }; }
        } finally { lock.releaseLock(); }
      }
    }
    if (Date.now() >= fin) return { ok: true, question: null };
    Utilities.sleep(700);
  }
}

function claudeRendre_(d) {
  var fini = null;
  var r = claudeChanger_(d.id, function (q) {
    if (q.etat === 'annulee') return;
    q.etat = d.ok === false ? 'erreur' : 'faite';
    q.dire = String(d.dire || '').slice(0, 3000); q.detail = String(d.detail || '').slice(0, 12000);
    q.erreur = String(d.erreur || '').slice(0, 500); q.duree = +d.duree || 0; q.etapes = +d.etapes || 0; q.fini = Date.now();
    fini = q;
  });
  if (fini) { try { claudeHistorique_(fini); } catch (e) {} }   // l'historique ne doit jamais bloquer la réponse
  return r;
}

// Onglet « Claude » de la feuille du journal (demande de Timothée du 05/11/26, 23h58 : « où est-ce que je peux voir les
// requêtes Claude via Wilson ? ») : une ligne par question, la plus récente en haut, avec la réponse dite et le détail.
var CLAUDE_COLS = ['Date', 'Appareil', 'Type', 'Question', 'Réponse dite', 'Détail et sources', 'Durée (s)', 'Étapes', 'État'];
var CLAUDE_HISTO_MAX = 2000;
function claudeHistorique_(q) {
  var sh = onglet_('Claude', CLAUDE_COLS);
  sh.insertRowsBefore(2, 1);
  sh.getRange(2, 2, 1, 8).setNumberFormat('@');
  sh.getRange(2, 1, 1, 9).setValues([[new Date(q.t || Date.now()), q.appareil || '', (q.type === 'crm' ? 'CRM' : q.type === 'mail' ? 'E-mails' : 'Internet') + (q.voiture ? ' (voiture)' : ''),
    q.question || '', q.etat === 'erreur' ? 'Erreur : ' + (q.erreur || '') : (q.dire || ''), q.detail || '', String(q.duree || ''), String(q.etapes || ''), q.etat === 'faite' ? 'réponse' : 'erreur']]);
  sh.getRange(2, 1).setNumberFormat('dd/mm/yy hh"h"mm');
  var last = sh.getLastRow(); if (last > CLAUDE_HISTO_MAX + 100) sh.deleteRows(CLAUDE_HISTO_MAX + 2, last - CLAUDE_HISTO_MAX - 1);
}

function claudeChanger_(id, f) {
  id = claudeId_(id); if (!id) return { ok: false, erreur: 'question inconnue' };
  var lock = LockService.getScriptLock(); if (!lock.tryLock(8000)) return { ok: false, erreur: 'script occupé, réessaie' };
  try {
    var q = claudeLire_(id); if (!q) return { ok: false, erreur: 'question inconnue (plus de 6 h ?)' };
    f(q); claudeEcrire_(q);
    return { ok: true, etat: q.etat };
  } finally { lock.releaseLock(); }
}

// Wilson attend la réponse (jusqu'à 15 s par appel) : il a l'état dès qu'il change.
function claudeResultat_(d) {
  var id = claudeId_(d.id), fin = Date.now() + Math.min(Math.max(+d.attente || 0, 0), CLAUDE_RESULTAT_MAX_S) * 1000, avant = String(d.etat || '');
  for (;;) {
    var q = claudeLire_(id);
    if (!q) return { ok: false, erreur: 'question inconnue (plus de 6 h ?)', pc: claudePc_() };
    var fini = q.etat === 'faite' || q.etat === 'erreur' || q.etat === 'annulee';
    if (fini || (avant && q.etat !== avant) || Date.now() >= fin) {
      return { ok: true, id: id, etat: q.etat, pris: q.pris ? Math.round((q.pris - q.t) / 1000) : null, depuis: Math.round((Date.now() - q.t) / 1000),
        dire: q.dire || '', detail: q.detail || '', erreur: q.erreur || '', duree: q.duree || 0, etapes: q.etapes || 0, pc: claudePc_() };
    }
    Utilities.sleep(800);
  }
}

// À lancer dans l'éditeur pour changer de PC (ou de secret) : le prochain relais qui se présente devient le bon.
function oublierPC() { PropertiesService.getScriptProperties().deleteProperty('claude_secret'); Logger.log('Secret du PC oublié : le prochain relais qui se présente sera accepté.'); }

// Essai depuis l'éditeur : état du PC et de la file.
function essaiClaude() { Logger.log(JSON.stringify({ pc: claudePc_(), file: claudeFile_() })); }
