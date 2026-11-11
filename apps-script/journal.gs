// Wilson — script de Timothée (application Web Apps Script, liée à la feuille « Wilson — journal ») :
//  1. journal à distance : reçoit le journal de la tablette et le range dans la feuille (Claude la lit pour diagnostiquer) ;
//  2. recherche Internet : Wilson lui envoie une question, le script interroge Tavily (gratuit : 1 000 recherches par mois)
//     et renvoie la réponse. La clé Tavily reste ici, dans le Drive de Timothée, jamais dans le code publié ;
//  3. réglages communs à tous les appareils (téléphone, tablette, PC) : rangés dans les propriétés du script, le plus récent gagne ;
//  4. CRM à la voix : les questions de Wilson (actions « crm_… ») sont relayées à l'application Web du CRM avec le jeton
//     de Timothée. Le CRM reste en accès « Moi uniquement » : sans ce jeton, personne d'autre ne peut l'ouvrir.
//  5. la famille et la garde (fichier famille.gs) : messages partagés entre ses appareils, garde, alertes par e-mail, agenda Famille,
//     la mémoire de Wilson (onglet « Mémoire ») et les questions de Claude à Timothée (onglet « Questions ») ;
//  6. les questions difficiles (fichier claude.gs) : file d'attente entre Wilson et le relais Claude du PC de la maison.
//  7. le suivi bourse (fichier bourse.gs) : Wilson et le relais du PC lisent la feuille du PEA, sans jamais y écrire.
// Déploiement : Déployer → Nouveau déploiement → Application Web → Exécuter en tant que « moi », accès « Tout le monde ».
// Sécurité (11/11/26) : « Tout le monde » est obligatoire (la tablette n'a pas de compte Google), donc le script exige une CLÉ
// SECRÈTE : elle fait partie de l'adresse que Wilson scanne (…/exec?k=…). Sans elle, rien n'est lu ni écrit, et l'adresse seule
// n'affiche plus que « Accès réservé ». Lancer « nouvelleCle » dans l'éditeur : il crée la clé (ou la change) et donne le lien
// de la page au QR code, à montrer à Wilson sur chaque appareil. « lienQR » redonne ce lien sans changer la clé.
// Le relais du PC (claude_prendre, claude_rendre et le CRM en lecture seule) passe aussi avec son propre secret.

var FEUILLE = 'COLLE_ICI_L_ID_DE_LA_FEUILLE';   // l'identifiant de « Wilson — journal » (dans son adresse, entre /d/ et /edit)
var MAX = { 'Journal': 20000, 'Délais': 5000 };   // au-delà, les lignes les plus anciennes sont effacées
var FORMAT_DATE = 'dd/mm/yy hh"h"mm:ss';
var TAVILY_CLE = 'COLLE_ICI_TA_CLE_TAVILY';      // ta clé Tavily (app.tavily.com, commence par tvly-)
var CRM_URL = 'COLLE_ICI_L_ADRESSE_DE_TON_CRM';   // l'adresse de ton CRM, celle que tu ouvres d'habitude (finit par /exec)

function doPost(e) {
  var d = {};
  try { d = JSON.parse((e && e.postData && e.postData.contents) || '{}') || {}; } catch (err) { return json_({ ok: false, erreur: 'requête illisible' }); }
  if (!accesOk_(e, d)) {
    return json_({ ok: false, erreur: cleScript_() ? 'clé refusée : rescanne le QR code du script (Réglages → Journal à distance)'
      : 'clé du script pas encore créée : lance « nouvelleCle » dans l\'éditeur du script' });
  }
  if (d.action) {
    try {
      if (d.action === 'chercher') return chercher_(d);
      if (d.action === 'reglages_lire') return json_(lireReglages_());
      if (d.action === 'reglages_ecrire') return json_(ecrireReglages_(d));
      if (String(d.action).indexOf('idees_') === 0) return json_(idees_(d));   // « Mes idées » (fichier idees.gs)
      if (/^(msg_|garde_|alerte|agenda_|mem_|q_)/.test(String(d.action))) return json_(famille_(d));   // messages, garde, alertes, agenda, mémoire, questions (fichier famille.gs)
      if (String(d.action).indexOf('claude_') === 0) return json_(claude_(d));   // questions difficiles pour Claude sur le PC (fichier claude.gs)
      if (String(d.action).indexOf('bourse_') === 0) return json_(bourse_(d));   // suivi bourse, en lecture seule (fichier bourse.gs)
      if (String(d.action).indexOf('crm_') === 0) return json_(crm_(d));
      return json_({ ok: false, erreur: 'action inconnue : ' + d.action });
    } catch (err) { return json_({ ok: false, erreur: 'script : ' + String(err && err.message || err) }); }   // ex. autorisation manquante
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.openById(FEUILLE);
    var v = String(d.version || '');
    var lignes = (d.lignes || []).map(function (l) { return [new Date(l.t), v, String(l.m).slice(0, 3000)]; });
    ajoute_(ss.getSheetByName('Journal'), lignes, 2);   // colonnes 2-3 en texte : « 1.8.0 » n'est pas une date
    var mesures = (d.mesures || []).map(function (m) {
      return [new Date(m.t), num_(m.envoi), num_(m.google), num_(m.phrase1), num_(m.voix), num_(m.complet),
        m.modele || '', m.reflexion || '', m.relance ? 'oui' : '', num_(m.recherche), m.anticipe ? 'oui' : '', num_(m.phrase)];
    });
    ajoute_(ss.getSheetByName('Délais'), mesures);
    if (d.bilan) etat_(ss.getSheetByName('État'), d.bilan, d.appareil);
  } finally {
    lock.releaseLock();
  }
  return ContentService.createTextOutput('ok');
}

// Les plus récentes en haut (ligne 2) : il suffit de lire le haut de la feuille.
function ajoute_(sh, rows, texteDes) {
  if (!sh || !rows.length) return;
  rows.reverse();
  sh.insertRowsBefore(2, rows.length);
  if (texteDes) sh.getRange(2, texteDes, rows.length, rows[0].length - texteDes + 1).setNumberFormat('@');
  var r = sh.getRange(2, 1, rows.length, rows[0].length);
  r.setValues(rows).setFontWeight('normal').setBackground(null);
  sh.getRange(2, 1, rows.length, 1).setNumberFormat(FORMAT_DATE);
  var max = MAX[sh.getName()] || 10000, last = sh.getLastRow();
  if (last > max + 500) sh.deleteRows(max + 2, last - max - 1);
}

// Dernier bilan de la tablette (version, état, vision, batterie…) : écrase le précédent.
function etat_(sh, b, appareil) {
  if (!sh) return;
  var rows = [['Mis à jour', Utilities.formatDate(new Date(), 'Europe/Paris', 'dd/MM/yy HH\'h\'mm:ss')], ['Appareil', appareil || '']];
  Object.keys(b).forEach(function (k) { rows.push([k, String(b[k])]); });
  var n = sh.getMaxRows();
  if (n < rows.length + 1) sh.insertRowsAfter(n, rows.length + 1 - n);
  sh.getRange(2, 1, sh.getMaxRows() - 1, 2).clearContent();
  sh.getRange(2, 2, rows.length, 1).setNumberFormat('@');
  sh.getRange(2, 1, rows.length, 2).setValues(rows);
}

// Recherche Internet par Tavily : réponse courte + extraits des meilleurs résultats, en français.
function chercher_(d) {
  var q = String(d.question || '').slice(0, 400);
  if (!/^tvly-/.test(TAVILY_CLE)) return json_({ ok: false, erreur: 'clé Tavily absente du script' });
  if (!q) return json_({ ok: false, erreur: 'question vide' });
  var r = UrlFetchApp.fetch('https://api.tavily.com/search', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + TAVILY_CLE },
    payload: JSON.stringify({ query: q, search_depth: 'basic', include_answer: 'basic', max_results: 5, country: 'france', topic: d.actualite ? 'news' : 'general' }),
  });
  var code = r.getResponseCode(), j = {};
  try { j = JSON.parse(r.getContentText() || '{}'); } catch (err) {}
  if (code !== 200) {
    var msg = (j.detail && (j.detail.error || j.detail)) || j.error || ('erreur ' + code);
    return json_({ ok: false, code: code, erreur: 'Tavily ' + code + ' : ' + msg });
  }
  return json_({
    ok: true, reponse: j.answer || '', temps: j.response_time || null,
    resultats: (j.results || []).slice(0, 5).map(function (x) { return { titre: x.title || '', url: x.url || '', extrait: String(x.content || '').slice(0, 500) }; }),
  });
}

// Réglages communs (un seul exemplaire, dans les propriétés du script : invisibles dans la feuille).
function lireReglages_() {
  var o = JSON.parse(PropertiesService.getScriptProperties().getProperty('reglages') || 'null');
  return { ok: true, reglages: o ? o.reglages : null, t: o ? o.t : 0 };
}
function ecrireReglages_(d) {
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var p = PropertiesService.getScriptProperties(), cur = JSON.parse(p.getProperty('reglages') || 'null'), t = +d.t || 0;
    if (cur && cur.t >= t) return { ok: true, applique: false, t: cur.t };            // déjà plus récent : on garde
    p.setProperty('reglages', JSON.stringify({ t: t, reglages: d.reglages || {} }));
    return { ok: true, applique: true, t: t };
  } finally { lock.releaseLock(); }
}

// Question au CRM : transmise à son application Web avec le jeton de Timothée (le CRM vérifie que c'est bien lui).
// Le jeton doit porter l'autorisation Google Drive : elle est demandée une fois en lançant « essaiCRM » dans l'éditeur.
function crm_(d) {
  if (!/^https:\/\/script\.google\.com\/.+\/exec\/?$/.test(CRM_URL)) return { ok: false, erreur: 'adresse du CRM absente du script (ligne CRM_URL)' };
  var r = UrlFetchApp.fetch(CRM_URL, {
    method: 'post', contentType: 'text/plain;charset=utf-8', payload: JSON.stringify(d), muteHttpExceptions: true, followRedirects: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
  });
  var code = r.getResponseCode(), txt = r.getContentText();
  try { return JSON.parse(txt); } catch (err) {}
  if (/doPost/.test(txt)) return { ok: false, erreur: 'le CRM en ligne n\'a pas encore la partie Wilson : colle le nouveau WebApp_autonome.gs et déploie une nouvelle version du CRM' };
  if (code === 401 || code === 403 || /ServiceLogin|accounts\.google\.com/.test(txt)) return { ok: false, erreur: 'le CRM refuse l\'accès : lance « essaiCRM » dans l\'éditeur du script de Wilson et accepte les autorisations' };
  return { ok: false, erreur: 'réponse illisible du CRM (' + code + ')' };
}
// Ne sert qu'à faire demander l'autorisation Google Drive, sans laquelle le CRM refuse le jeton.
function autoriserDrive_() { return DriveApp.getRootFolder().getName(); }

// Essai depuis l'éditeur : sélectionne « essaiCRM » puis « Exécuter » (accepte les autorisations la 1re fois).
function essaiCRM() {
  autoriserDrive_();
  Logger.log(JSON.stringify(crm_({ action: 'crm_etat' })));
  Logger.log(String(JSON.stringify(crm_({ action: 'crm_journee', jour: 'aujourdhui' }))).slice(0, 1500));
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// Essai de la recherche depuis l'éditeur : sélectionne « essaiRecherche » puis « Exécuter » (résultat dans « Journal d'exécution »).
function essaiRecherche() {
  Logger.log(chercher_({ question: 'Quel temps fera-t-il demain à Angers ?' }).getContent());
}

function num_(x) { return typeof x === 'number' && isFinite(x) ? Math.round(x * 10) / 10 : ''; }

// ---------- Clé secrète du script (11/11/26) ----------
// La clé est dans les propriétés du script (jamais dans le code ni dans le dépôt). Elle arrive dans l'adresse (?k=…) ou,
// à défaut, dans la requête (champ k). Le relais du PC peut aussi passer avec son secret, pour ses seules actions.
var ACTIONS_DU_PC = /^(claude_prendre|claude_rendre|claude_etat|crm_(schema|requete|client|journee|bilan|produit)|bourse_etat)$/;
function cleScript_() { return PropertiesService.getScriptProperties().getProperty('cle_wilson') || ''; }
function memes_(a, b) {   // comparaison en temps constant
  a = String(a || ''); b = String(b || '');
  if (!a || a.length !== b.length) return false;
  var x = 0; for (var i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
function accesOk_(e, d) {
  var cle = cleScript_(), k = (e && e.parameter && e.parameter.k) || (d && d.k) || '';
  if (cle.length >= 24 && memes_(k, cle)) return true;
  var pc = PropertiesService.getScriptProperties().getProperty('claude_secret') || '', s = String((d && d.secret) || '');
  return pc.length >= 24 && ACTIONS_DU_PC.test(String((d && d.action) || '')) && memes_(s, pc);
}
// À lancer dans l'éditeur : crée (ou change) la clé ; l'ancienne ne marche plus. Le lien est dans « Journal d'exécution ».
function nouvelleCle() {
  var cle = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('cle_wilson', cle);
  Logger.log('Nouvelle clé créée : l\'ancienne ne marche plus. Ouvre ce lien et montre le QR code à Wilson sur chaque appareil '
    + '(Réglages → Journal à distance → Scanner le QR code) :');
  lienQR();
}
// À lancer dans l'éditeur : redonne le lien de la page au QR code, sans changer la clé. Ce lien ne se partage pas.
function lienQR() {
  var cle = cleScript_();
  if (!cle) { Logger.log('Pas encore de clé : lance « nouvelleCle ».'); return ''; }
  var base = ScriptApp.getService().getUrl() || '';
  // Depuis l'éditeur, Google donne souvent l'adresse d'essai (…/dev), que la tablette ne peut pas ouvrir : il faut celle en …/exec.
  if (/\/exec$/.test(base)) { Logger.log(base + '?k=' + cle); return base + '?k=' + cle; }
  Logger.log('Prends l\'adresse du déploiement (Déployer → Gérer les déploiements → Application Web, elle finit par /exec) et ajoute à la fin : ?k=' + cle);
  return '';
}

// Avec la clé dans l'adresse (lien donné par « nouvelleCle » ou « lienQR ») : affiche le QR code à montrer à Wilson.
// Sans la clé : « Accès réservé », rien d'autre.
function doGet(e) {
  var cle = cleScript_(), k = (e && e.parameter && e.parameter.k) || '';
  if (cle.length < 24 || !memes_(k, cle)) {
    return HtmlService.createHtmlOutput('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">'
      + '<p style="font-family:system-ui,sans-serif;padding:24px;color:#444">Accès réservé.</p>').setTitle('Wilson');
  }
  var base = ScriptApp.getService().getUrl() || '';
  if (!/\/exec$/.test(base)) {   // adresse d'essai (…/dev) : le QR code ne marcherait pas sur la tablette
    return HtmlService.createHtmlOutput('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">'
      + '<p style="font-family:system-ui,sans-serif;padding:24px;color:#444">Ouvre plutôt l\'adresse du déploiement (elle finit par /exec), suivie de ?k=… : '
      + 'c\'est elle que Wilson doit garder.</p>').setTitle('Wilson');
  }
  var url = base + '?k=' + cle;
  var html = '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<style>body{font-family:system-ui,sans-serif;text-align:center;padding:24px;color:#222}#qr{display:inline-block;padding:18px;background:#fff;border:1px solid #ddd;border-radius:12px}'
    + 'p{max-width:560px;margin:12px auto;line-height:1.45}small{color:#777;word-break:break-all}</style></head><body>'
    + '<h2>Journal de Wilson : prêt ✓</h2>'
    + '<p>Sur chaque appareil (tablette, téléphone) : appui long sur le visage de Wilson → <b>Réglages</b> → <b>Journal à distance</b> → <b>Scanner le QR code</b>, puis montre-lui ce code (l’écran de l’ordinateur, ou une photo sur ton téléphone).</p>'
    + '<p><b>Ce code et cette page donnent accès à Wilson : ne les partage avec personne, et ne garde pas de photo du code.</b></p>'
    + '<div id="qr"></div>'
    + '<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>'
    + '<script>new QRCode(document.getElementById("qr"), { text: ' + JSON.stringify(url) + ', width: 320, height: 320, correctLevel: QRCode.CorrectLevel.M });</script>'
    + '</body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('Journal de Wilson');
}

// Essai depuis l'éditeur : sélectionne « essai » puis « Exécuter » → une ligne apparaît dans l'onglet Journal.
function essai() {
  doPost({ parameter: { k: cleScript_() }, postData: { contents: JSON.stringify({ version: 'essai', lignes: [{ t: Date.now(), m: 'Essai du journal depuis l\'éditeur Apps Script ✓' }] }) } });
}
