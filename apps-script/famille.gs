// Wilson — la famille et la garde (PLAN.md, section 7 sexies, M et G). À ajouter au script « Wilson journal » comme fichier
// (dans l'éditeur Apps Script : + → Script → nommer « famille »), avec la ligne correspondante dans doPost de journal.gs :
//      if (/^(msg_|garde_|alerte|agenda_|mem_|q_)/.test(String(d.action))) return json_(famille_(d));
// Puis Déployer → Gérer les déploiements → modifier → Nouvelle version.
//  - messages de la famille (msg_…) : déposés par un appareil (téléphone), remis par un autre (tablette du salon). Un message
//    par propriété du script (une propriété ne peut pas dépasser 9 ko) ; effacés 14 jours après ;
//  - prénoms des visages appris sur la tablette (prénoms seulement, jamais les empreintes), pour que le téléphone les connaisse ;
//  - garde de la maison (garde_ecrire) : demandée sur un appareil, appliquée par la tablette ;
//  - alerte : e-mail à Timothée (son propre compte, celui qui a déployé le script), avec la photo de la pièce si elle est jointe,
//    et en copie aux adresses de ALERTES_AUSSI. 20 alertes par jour au plus, une du même genre toutes les 10 minutes au plus ;
//  - agenda (agenda_…) : l'agenda Google « Famille » de Timothée, partagé avec Camille (lire, ajouter ; annuler seulement ce que
//    Wilson vient d'ajouter). La 1re fois, lancer « essaiAgenda » dans l'éditeur et accepter l'accès à Google Agenda ;
//  - mémoire (mem_…) : ce que Wilson retient d'utile, dans l'onglet « Mémoire » de la feuille du journal (partagé par tous
//    les appareils ; Timothée peut y corriger ou effacer une ligne à la main) ;
//  - questions (q_…) : les questions que Claude pose à Timothée pour la prochaine mise à jour (onglet « Questions », remplies
//    la nuit par Claude) ; Wilson les lui pose et écrit sa réponse à côté.

var GARDER_MS = 14 * 24 * 3600 * 1000;
var ALERTES_AUSSI = '';      // autres adresses qui reçoivent les alertes (séparées par des virgules) : à remplir ICI, jamais dans le dépôt
var AGENDA_NOM = 'Famille';  // le nom de l'agenda partagé de la famille

function famille_(d) {
  var a = String(d.action);
  if (a === 'msg_lire') return msgLire_(d);
  if (a === 'msg_deposer') return msgDeposer_(d.msg || {});
  if (a === 'msg_remis') return msgChanger_(d.id, function (m) { m.remis = { t: +d.t || Date.now(), a: String(d.a || '').slice(0, 40) }; });
  if (a === 'msg_annuler') return msgChanger_(d.id, function (m) { m.annule = Date.now(); });
  if (a === 'garde_ecrire') return gardeEcrire_(d.garde || {});
  if (a === 'alerte') return alerte_(d);
  if (a.indexOf('agenda_') === 0) return agenda_(d);
  if (a === 'mem_lire') return memLire_();
  if (a === 'mem_ecrire') return memEcrire_(d);
  if (a === 'q_lire') return qLire_();
  if (a === 'q_repondre') return qRepondre_(d);
  return { ok: false, erreur: 'action inconnue : ' + a };
}

function msgTous_() {
  var p = PropertiesService.getScriptProperties(), all = p.getProperties(), l = [], now = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('msg_') !== 0) return;
    var m = null; try { m = JSON.parse(all[k]); } catch (e) {}
    if (!m || now - (+m.t || 0) > GARDER_MS) { p.deleteProperty(k); return; }
    l.push(m);
  });
  return l.sort(function (x, y) { return x.t - y.t; });
}

function msgLire_(d) {
  var p = PropertiesService.getScriptProperties();
  if (d.noms && d.noms.length) p.setProperty('famille_noms', JSON.stringify(d.noms.slice(0, 20).map(function (n) { return String(n).slice(0, 30); })));
  var noms = []; try { noms = JSON.parse(p.getProperty('famille_noms') || '[]'); } catch (e) {}
  var garde = null; try { garde = JSON.parse(p.getProperty('garde') || 'null'); } catch (e) {}
  return { ok: true, messages: msgTous_().filter(function (m) { return !m.annule; }), noms: noms, garde: garde };
}

function msgDeposer_(m) {
  var texte = String(m.texte || '').trim();
  if (!texte || !m.pour) return { ok: false, erreur: 'message incomplet' };
  var id = String(m.id || Date.now()).replace(/[^\w-]/g, '').slice(0, 40);
  var o = { id: id, pour: String(m.pour).slice(0, 30), de: String(m.de || '').slice(0, 30), texte: texte.slice(0, 600), t: +m.t || Date.now(), par: String(m.par || '').slice(0, 20), remis: null };
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var p = PropertiesService.getScriptProperties();
    if (!p.getProperty('msg_' + id)) p.setProperty('msg_' + id, JSON.stringify(o));   // déjà déposé (renvoi après une coupure) : rien en double
    return { ok: true, id: id };
  } finally { lock.releaseLock(); }
}

function msgChanger_(id, f) {
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var p = PropertiesService.getScriptProperties(), k = 'msg_' + String(id || ''), v = p.getProperty(k);
    if (!v) return { ok: false, erreur: 'message introuvable' };
    var m = JSON.parse(v); f(m); p.setProperty(k, JSON.stringify(m));
    return { ok: true, msg: m };
  } finally { lock.releaseLock(); }
}

function gardeEcrire_(g) {
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var p = PropertiesService.getScriptProperties(), cur = null; try { cur = JSON.parse(p.getProperty('garde') || 'null'); } catch (e) {}
    if (cur && (+cur.t || 0) >= (+g.t || 0)) return { ok: true, applique: false, garde: cur };   // plus récent déjà là
    var o = { on: !!g.on, mode: String(g.mode || 'demandee'), t: +g.t || Date.now(), par: String(g.par || '').slice(0, 20) };
    p.setProperty('garde', JSON.stringify(o));
    return { ok: true, applique: true, garde: o };
  } finally { lock.releaseLock(); }
}

function alerte_(d) {
  var moi = Session.getEffectiveUser().getEmail();
  if (!moi) return { ok: false, erreur: 'adresse e-mail introuvable' };
  var genre = String(d.genre || 'alerte').replace(/[^\w]/g, '').slice(0, 20), texte = String(d.texte || 'Alerte').slice(0, 300), now = Date.now();
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var p = PropertiesService.getScriptProperties(), jour = Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd'), c = null;
    try { c = JSON.parse(p.getProperty('alertes') || 'null'); } catch (e) {}
    if (!c || c.jour !== jour) c = { jour: jour, n: 0, der: {} };
    if (c.n >= 20) return { ok: true, envoye: false, raison: '20 alertes déjà envoyées aujourd\'hui' };
    if (!d.essai && c.der[genre] && now - c.der[genre] < 10 * 60000) return { ok: true, envoye: false, raison: 'même alerte il y a moins de 10 minutes' };
    var heure = Utilities.formatDate(new Date(+d.t || now), 'Europe/Paris', 'HH\'h\'mm');
    var sujet = (d.essai ? 'Wilson — essai d\'alerte' : 'Wilson — alerte : ' + texte) + ' (' + heure + ')';
    var html = '<p><b>' + echappe_(texte) + '</b> — ' + heure + (d.appareil ? ' (' + echappe_(d.appareil) + ')' : '') + '</p>'
      + (d.details ? '<p>' + echappe_(d.details) + '</p>' : '')
      + (d.photo ? '<p><img src="cid:photo" style="max-width:100%"></p>' : '')
      + '<p style="color:#888">Wilson n\'est pas un système d\'alarme : il prévient seulement de ce qu\'il entend ou voit.</p>';
    var o = { to: moi, subject: sujet, htmlBody: html, body: texte + ' — ' + heure + (d.details ? '\n' + d.details : '') };
    var aussi = String(ALERTES_AUSSI || '').split(/[,;\s]+/).filter(function (x) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); });
    if (aussi.length) o.cc = aussi.join(',');
    if (d.photo) { var b = Utilities.newBlob(Utilities.base64Decode(String(d.photo)), 'image/jpeg', 'wilson-' + heure.replace('h', '-') + '.jpg'); o.inlineImages = { photo: b }; o.attachments = [b]; }
    MailApp.sendEmail(o);
    c.n++; c.der[genre] = now; p.setProperty('alertes', JSON.stringify(c));
    return { ok: true, envoye: true, n: c.n };
  } finally { lock.releaseLock(); }
}
// ---------- L'agenda « Famille » (demande de Timothée du 04/11/26) ----------
function agendaFamille_() {
  var l = CalendarApp.getCalendarsByName(AGENDA_NOM);
  if (!l.length) throw new Error('agenda « ' + AGENDA_NOM + ' » introuvable');
  return l[0];
}
function jour_(s) { var p = String(s).slice(0, 10).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function agenda_(d) {
  var a = String(d.action), cal = agendaFamille_();
  if (a === 'agenda_lire') {
    var du = d.du ? jour_(d.du) : new Date(), jours = Math.max(1, Math.min(+d.jours || 7, 62));
    if (d.du) du.setHours(0, 0, 0, 0);
    var au = new Date(du.getTime() + jours * 86400000);
    return { ok: true, evenements: cal.getEvents(du, au).slice(0, 40).map(function (e) {
      return { id: e.getId(), titre: e.getTitle(), debut: +e.getStartTime(), fin: +e.getEndTime(), journee: e.isAllDayEvent(), lieu: e.getLocation() || '' };
    }) };
  }
  if (a === 'agenda_ajouter') {
    var titre = String(d.titre || '').trim().slice(0, 120);
    if (!titre || !d.debut) return { ok: false, erreur: 'titre ou date manquant' };
    var opts = { description: String(d.note || '').slice(0, 500), location: String(d.lieu || '').slice(0, 200) }, e;
    if (d.journee) {
      var j1 = jour_(d.debut), j2 = d.fin ? jour_(d.fin) : null;
      e = j2 && j2 > j1 ? cal.createAllDayEvent(titre, j1, new Date(j2.getFullYear(), j2.getMonth(), j2.getDate() + 1), opts) : cal.createAllDayEvent(titre, j1, opts);
    } else {
      var t1 = new Date(+d.debut), t2 = d.fin ? new Date(+d.fin) : new Date(t1.getTime() + 3600000);
      if (isNaN(t1.getTime())) return { ok: false, erreur: 'date illisible' };
      e = cal.createEvent(titre, t1, t2 > t1 ? t2 : new Date(t1.getTime() + 3600000), opts);
    }
    return { ok: true, id: e.getId(), titre: titre };
  }
  if (a === 'agenda_annuler') {
    var ev = cal.getEventById(String(d.id || ''));
    if (!ev) return { ok: false, erreur: 'événement introuvable' };
    var t = ev.getTitle(); ev.deleteEvent();
    return { ok: true, titre: t };
  }
  return { ok: false, erreur: 'action inconnue : ' + a };
}
// À lancer une fois dans l'éditeur (essaiAgenda → Exécuter) : demande l'accès à Google Agenda et lit la semaine.
function essaiAgenda() {
  var r = agenda_({ action: 'agenda_lire', jours: 7 });
  Logger.log('Agenda « ' + AGENDA_NOM + ' » : ' + r.evenements.length + ' événement(s) dans les 7 jours');
}

// ---------- La mémoire de Wilson et les questions de Claude (demande de Timothée du 05/11/26) ----------
var MEM_COLS = ['Id', 'Catégorie', 'Souvenir', 'Qui', 'Date', 'Origine'];
var Q_COLS = ['Id', 'Date', 'Question', 'Pourquoi', 'Réponse', 'Répondu le'];
var MEM_MAX = 400;   // au-delà, Wilson n'ajoute plus rien (il doit d'abord oublier ce qui ne sert plus)

function onglet_(nom, cols) {
  var ss = SpreadsheetApp.openById(FEUILLE), sh = ss.getSheetByName(nom);
  if (!sh) {
    sh = ss.insertSheet(nom);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function lignes_(sh, n) { var last = sh.getLastRow(); return last < 2 ? [] : sh.getRange(2, 1, last - 1, n).getValues(); }
function memNorm_(x) { return String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
function nouvelId_(p, i) { return p + (Date.now() + (i || 0)).toString(36); }

function memLire_() {
  var sh = onglet_('Mémoire', MEM_COLS), l = [];
  lignes_(sh, 6).forEach(function (r, i) {
    var texte = String(r[2] || '').trim(); if (!texte) return;
    var id = String(r[0] || '').trim();
    if (!id) { id = nouvelId_('m', i); sh.getRange(i + 2, 1).setValue(id); }   // ligne ajoutée à la main par Timothée
    l.push({ id: id, cat: String(r[1] || '').trim(), texte: texte.slice(0, 300), qui: String(r[3] || '').trim(), t: r[4] instanceof Date ? r[4].getTime() : 0, origine: String(r[5] || '').trim() });
  });
  return { ok: true, souvenirs: l };
}

function memEcrire_(d) {
  var ajoutes = 0, oublies = 0, refuses = 0;
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sh = onglet_('Mémoire', MEM_COLS), rows = lignes_(sh, 6), oublier = (d.oublier || []).map(String);
    for (var i = rows.length - 1; i >= 0; i--) {
      if (oublier.indexOf(String(rows[i][0])) < 0) continue;
      sh.deleteRow(i + 2); rows.splice(i, 1); oublies++;
    }
    var ids = {}, textes = {};
    rows.forEach(function (r) { ids[String(r[0])] = 1; textes[memNorm_(r[2])] = 1; });
    (d.ajouter || []).slice(0, 30).forEach(function (m) {
      var texte = String(m.texte || '').replace(/\s+/g, ' ').trim().slice(0, 300), id = String(m.id || '').replace(/[^\w-]/g, '').slice(0, 30), n = memNorm_(texte);
      if (!texte || !id || ids[id] || textes[n]) return;          // déjà là (renvoi après une coupure, ou même phrase)
      if (rows.length + ajoutes >= MEM_MAX) { refuses++; return; }
      ids[id] = 1; textes[n] = 1;
      sh.appendRow([id, String(m.cat || 'autre').slice(0, 20), texte, String(m.qui || '').slice(0, 40), new Date(+m.t || Date.now()), String(m.origine || '').slice(0, 30)]);
      ajoutes++;
    });
    if (ajoutes) sh.getRange(2, 5, Math.max(1, sh.getLastRow() - 1), 1).setNumberFormat('dd/mm/yy');
  } finally { lock.releaseLock(); }
  var r = memLire_(); r.ajoutes = ajoutes; r.oublies = oublies; if (refuses) r.refuses = refuses;
  return r;
}

// Questions encore sans réponse (3 au plus). Une ligne écrite sans Id (par Claude ou à la main) en reçoit un.
function qLire_() {
  var sh = onglet_('Questions', Q_COLS), l = [];
  lignes_(sh, 6).forEach(function (r, i) {
    var q = String(r[2] || '').trim(); if (!q) return;
    var id = String(r[0] || '').trim();
    if (!id) { id = nouvelId_('q', i); sh.getRange(i + 2, 1).setValue(id); }
    if (String(r[4] || '').trim()) return;
    l.push({ id: id, question: q.slice(0, 400), pourquoi: String(r[3] || '').trim().slice(0, 300), t: r[1] instanceof Date ? r[1].getTime() : 0 });
  });
  return { ok: true, questions: l.slice(0, 3) };
}

function qRepondre_(d) {
  var rep = String(d.reponse || '').trim().slice(0, 1000);
  if (!rep || !d.id) return { ok: false, erreur: 'réponse vide' };
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sh = onglet_('Questions', Q_COLS), rows = lignes_(sh, 6);
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim() !== String(d.id)) continue;
      var deja = String(rows[i][4] || '').trim();
      sh.getRange(i + 2, 5).setNumberFormat('@');
      sh.getRange(i + 2, 5, 1, 2).setValues([[deja ? deja + ' / ' + rep : rep, new Date(+d.t || Date.now())]]);
      sh.getRange(i + 2, 6).setNumberFormat('dd/mm/yy hh"h"mm');
      return { ok: true, question: String(rows[i][2]) };
    }
    return { ok: false, erreur: 'question introuvable' };
  } finally { lock.releaseLock(); }
}

function echappe_(x) { return String(x).replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }); }

// À lancer une fois dans l'éditeur (essaiFamille → Exécuter) : vérifie les autorisations (e-mail) et envoie un e-mail d'essai.
function essaiFamille() {
  var r = alerte_({ genre: 'essai', essai: true, texte: 'Essai : les alertes de Wilson arrivent bien ici', t: Date.now() });
  Logger.log('Alerte d\'essai : ' + JSON.stringify(r) + ' — messages en attente : ' + msgTous_().filter(function (m) { return !m.remis && !m.annule; }).length);
}
