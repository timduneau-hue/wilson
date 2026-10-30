// Wilson — script de Timothée (application Web Apps Script, liée à la feuille « Wilson — journal ») :
//  1. journal à distance : reçoit le journal de la tablette et le range dans la feuille (Claude la lit pour diagnostiquer) ;
//  2. recherche Internet : Wilson lui envoie une question, le script interroge Tavily (gratuit : 1 000 recherches par mois)
//     et renvoie la réponse. La clé Tavily reste ici, dans le Drive de Timothée, jamais dans le code publié ;
//  3. réglages communs à tous les appareils (téléphone, tablette, PC) : rangés dans les propriétés du script, le plus récent gagne ;
//  4. CRM à la voix : les questions de Wilson (actions « crm_… ») sont relayées à l'application Web du CRM avec le jeton
//     de Timothée. Le CRM reste en accès « Moi uniquement » : sans ce jeton, personne d'autre ne peut l'ouvrir.
// Déploiement : Déployer → Nouveau déploiement → Application Web → Exécuter en tant que « moi », accès « Tout le monde ».
// Ouvrir ensuite l'adresse du déploiement : la page affiche un QR code que Wilson scanne (Réglages → Journal à distance).

var FEUILLE = 'COLLE_ICI_L_ID_DE_LA_FEUILLE';   // l'identifiant de « Wilson — journal » (dans son adresse, entre /d/ et /edit)
var MAX = { 'Journal': 20000, 'Délais': 5000 };   // au-delà, les lignes les plus anciennes sont effacées
var FORMAT_DATE = 'dd/mm/yy hh"h"mm:ss';
var TAVILY_CLE = 'COLLE_ICI_TA_CLE_TAVILY';      // ta clé Tavily (app.tavily.com, commence par tvly-)
var CRM_URL = 'COLLE_ICI_L_ADRESSE_DE_TON_CRM';   // l'adresse de ton CRM, celle que tu ouvres d'habitude (finit par /exec)

function doPost(e) {
  var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  if (d.action) {
    try {
      if (d.action === 'chercher') return chercher_(d);
      if (d.action === 'reglages_lire') return json_(lireReglages_());
      if (d.action === 'reglages_ecrire') return json_(ecrireReglages_(d));
      if (String(d.action).indexOf('idees_') === 0) return json_(idees_(d));   // « Mes idées » (fichier idees.gs)
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

// Ouvrir l'adresse du déploiement : vérifie que tout marche et affiche le QR code à montrer à Wilson.
function doGet() {
  var url = ScriptApp.getService().getUrl();
  var html = '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<style>body{font-family:system-ui,sans-serif;text-align:center;padding:24px;color:#222}#qr{display:inline-block;padding:18px;background:#fff;border:1px solid #ddd;border-radius:12px}'
    + 'p{max-width:560px;margin:12px auto;line-height:1.45}small{color:#777;word-break:break-all}</style></head><body>'
    + '<h2>Journal de Wilson : prêt ✓</h2>'
    + '<p>Sur la tablette : appui long sur le visage de Wilson → <b>Réglages</b> → <b>Journal à distance</b> → <b>Scanner le QR code</b>, puis montre-lui ce code (l’écran de l’ordinateur, ou une photo sur ton téléphone).</p>'
    + '<div id="qr"></div><p><small>' + url + '</small></p>'
    + '<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>'
    + '<script>new QRCode(document.getElementById("qr"), { text: ' + JSON.stringify(url) + ', width: 320, height: 320, correctLevel: QRCode.CorrectLevel.M });</script>'
    + '</body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('Journal de Wilson');
}

// Essai depuis l'éditeur : sélectionne « essai » puis « Exécuter » → une ligne apparaît dans l'onglet Journal.
function essai() {
  doPost({ postData: { contents: JSON.stringify({ version: 'essai', lignes: [{ t: Date.now(), m: 'Essai du journal depuis l\'éditeur Apps Script ✓' }] }) } });
}
