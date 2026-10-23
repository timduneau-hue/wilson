// Wilson — journal à distance : reçoit le journal de la tablette et le range dans la feuille Google « Wilson — journal ».
// Claude lit cette feuille (via le Google Drive de Timothée) pour diagnostiquer Wilson sans capture d'écran.
// Déploiement : Déployer → Nouveau déploiement → Application Web → Exécuter en tant que « moi », accès « Tout le monde ».
// Ouvrir ensuite l'adresse du déploiement : la page affiche un QR code que Wilson scanne (Réglages → Journal à distance).

var FEUILLE = 'COLLE_ICI_L_ID_DE_LA_FEUILLE';   // l'identifiant de « Wilson — journal » (dans son adresse, entre /d/ et /edit)
var MAX = { 'Journal': 20000, 'Délais': 5000 };   // au-delà, les lignes les plus anciennes sont effacées
var FORMAT_DATE = 'dd/mm/yy hh"h"mm:ss';

function doPost(e) {
  var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.openById(FEUILLE);
    var v = String(d.version || '');
    var lignes = (d.lignes || []).map(function (l) { return [new Date(l.t), v, String(l.m).slice(0, 3000)]; });
    ajoute_(ss.getSheetByName('Journal'), lignes);
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
function ajoute_(sh, rows) {
  if (!sh || !rows.length) return;
  rows.reverse();
  sh.insertRowsBefore(2, rows.length);
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
  sh.getRange(2, 1, rows.length, 2).setValues(rows);
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
