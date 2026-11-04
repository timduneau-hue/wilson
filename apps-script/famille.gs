// Wilson — la famille et la garde (PLAN.md, section 7 sexies, M et G). À ajouter au script « Wilson journal » comme fichier
// (dans l'éditeur Apps Script : + → Script → nommer « famille »), avec la ligne correspondante dans doPost de journal.gs :
//      if (/^(msg_|garde_|alerte)/.test(String(d.action))) return json_(famille_(d));
// Puis Déployer → Gérer les déploiements → modifier → Nouvelle version.
//  - messages de la famille (msg_…) : déposés par un appareil (téléphone), remis par un autre (tablette du salon). Un message
//    par propriété du script (une propriété ne peut pas dépasser 9 ko) ; effacés 14 jours après ;
//  - prénoms des visages appris sur la tablette (prénoms seulement, jamais les empreintes), pour que le téléphone les connaisse ;
//  - garde de la maison (garde_ecrire) : demandée sur un appareil, appliquée par la tablette ;
//  - alerte : e-mail à Timothée (son propre compte, celui qui a déployé le script), avec la photo de la pièce si elle est jointe.
//    20 alertes par jour au plus, une du même genre toutes les 10 minutes au plus.

var GARDER_MS = 14 * 24 * 3600 * 1000;

function famille_(d) {
  var a = String(d.action);
  if (a === 'msg_lire') return msgLire_(d);
  if (a === 'msg_deposer') return msgDeposer_(d.msg || {});
  if (a === 'msg_remis') return msgChanger_(d.id, function (m) { m.remis = { t: +d.t || Date.now(), a: String(d.a || '').slice(0, 40) }; });
  if (a === 'msg_annuler') return msgChanger_(d.id, function (m) { m.annule = Date.now(); });
  if (a === 'garde_ecrire') return gardeEcrire_(d.garde || {});
  if (a === 'alerte') return alerte_(d);
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
    if (d.photo) { var b = Utilities.newBlob(Utilities.base64Decode(String(d.photo)), 'image/jpeg', 'wilson-' + heure.replace('h', '-') + '.jpg'); o.inlineImages = { photo: b }; o.attachments = [b]; }
    MailApp.sendEmail(o);
    c.n++; c.der[genre] = now; p.setProperty('alertes', JSON.stringify(c));
    return { ok: true, envoye: true, n: c.n };
  } finally { lock.releaseLock(); }
}
function echappe_(x) { return String(x).replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }); }

// À lancer une fois dans l'éditeur (essaiFamille → Exécuter) : vérifie les autorisations (e-mail) et envoie un e-mail d'essai.
function essaiFamille() {
  var r = alerte_({ genre: 'essai', essai: true, texte: 'Essai : les alertes de Wilson arrivent bien ici', t: Date.now() });
  Logger.log('Alerte d\'essai : ' + JSON.stringify(r) + ' — messages en attente : ' + msgTous_().filter(function (m) { return !m.remis && !m.annule; }).length);
}
