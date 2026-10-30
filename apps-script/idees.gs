// Wilson — « Mes idées » (PLAN.md, section 7 quater, F6). À ajouter au script « Wilson journal » comme second fichier
// (dans l'éditeur Apps Script : + → Script → nommer « idees »), avec une ligne dans doPost de journal.gs (voir plus bas).
//  - noter : l'idée dictée à Wilson est ajoutée, datée, au document Google « Wilson — mes idées » (créé la 1re fois
//    dans le Drive de Timothée) ;
//  - lire : les dernières idées, pour que Wilson les relise ou les affiche ;
//  - envoyer : un e-mail à Timothée (son propre compte : celui qui a déployé le script) avec les idées et le lien du document.
// Ligne à ajouter dans doPost (journal.gs), juste avant « if (String(d.action).indexOf('crm_') === 0) … » :
//      if (String(d.action).indexOf('idees_') === 0) return json_(idees_(d));
// Puis Déployer → Gérer les déploiements → modifier → Nouvelle version (et accepter les autorisations Docs et e-mail).

function idees_(d) {
  var a = String(d.action);
  if (a === 'idees_noter') return ideesNoter_(String(d.texte || '').trim());
  if (a === 'idees_lire') return { ok: true, idees: ideesListe_(Number(d.n) || 20), lien: ideesDoc_().getUrl() };
  if (a === 'idees_envoyer') return ideesEnvoyer_(Number(d.n) || 0);
  return { ok: false, erreur: 'action inconnue : ' + a };
}

function ideesDoc_() {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty('IDEES_DOC'), doc = null;
  if (id) { try { doc = DocumentApp.openById(id); } catch (e) { doc = null; } }
  if (!doc) {
    doc = DocumentApp.create('Wilson — mes idées');
    var b = doc.getBody();
    b.clear();
    b.appendParagraph('Mes idées').setHeading(DocumentApp.ParagraphHeading.TITLE);
    b.appendParagraph('Notées par Wilson quand je les lui dicte (la plus récente en bas).').setItalic(true);
    doc.saveAndClose(); doc = DocumentApp.openById(doc.getId());
    p.setProperty('IDEES_DOC', doc.getId());
  }
  return doc;
}

function ideesNoter_(texte) {
  if (!texte) return { ok: false, erreur: 'idée vide' };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var doc = ideesDoc_(), b = doc.getBody();
    var date = Utilities.formatDate(new Date(), 'Europe/Paris', 'dd/MM/yy HH\'h\'mm');
    var li = b.appendListItem(texte).setGlyphType(DocumentApp.GlyphType.BULLET);
    li.appendText('  — ' + date).setItalic(true).setForegroundColor('#888888');
    li.editAsText().setItalic(0, texte.length - 1, false).setForegroundColor(0, texte.length - 1, null);
    doc.saveAndClose();
    return { ok: true, lien: doc.getUrl(), n: ideesListe_(1000).length };
  } finally { lock.releaseLock(); }
}

function ideesListe_(n) {
  var b = ideesDoc_().getBody(), l = [];
  for (var i = 0; i < b.getNumChildren(); i++) {
    var c = b.getChild(i);
    if (c.getType() === DocumentApp.ElementType.LIST_ITEM) l.push(c.asListItem().getText());
  }
  return l.slice(-n);
}

function ideesEnvoyer_(n) {
  var doc = ideesDoc_(), l = ideesListe_(n || 1000), moi = Session.getEffectiveUser().getEmail();
  if (!moi) return { ok: false, erreur: 'adresse e-mail introuvable' };
  if (!l.length) return { ok: false, erreur: 'aucune idée notée' };
  var html = '<p>Voici tes idées notées par Wilson :</p><ul>' + l.map(function (x) { return '<li>' + x.replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]; }) + '</li>'; }).join('')
    + '</ul><p><a href="' + doc.getUrl() + '">Ouvrir le document « Wilson — mes idées »</a></p>';
  MailApp.sendEmail({ to: moi, subject: 'Wilson — tes idées (' + l.length + ')', htmlBody: html, body: l.map(function (x) { return '- ' + x; }).join('\n') + '\n\n' + doc.getUrl() });
  return { ok: true, n: l.length, lien: doc.getUrl() };
}

// À lancer une fois dans l'éditeur (menu des fonctions → essaiIdees → Exécuter) pour donner les autorisations Docs et e-mail.
function essaiIdees() {
  var doc = ideesDoc_();
  Logger.log('Document des idées : ' + doc.getUrl() + ' — ' + ideesListe_(1000).length + ' idée(s). E-mail : ' + Session.getEffectiveUser().getEmail() + ' (quota ' + MailApp.getRemainingDailyQuota() + ')');
}
