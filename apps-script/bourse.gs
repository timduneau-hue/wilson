// Wilson — le suivi bourse de Timothée (PLAN.md, section 7 quater, F7), EN LECTURE SEULE. À ajouter au script « Wilson journal »
// comme fichier de plus (dans l'éditeur Apps Script : + → Script → nommer « bourse »), avec une ligne dans doPost de journal.gs.
//  - bourse_etat : lit la feuille Google du suivi bourse (onglets Config, Positions, Historique) et rend un texte que Wilson
//    (ou Claude sur le PC) lit pour répondre : PEA, liquidités, positions, plus-values, limites de vente, historique récent.
//  - Rien n'est jamais écrit dans la feuille : elle reste remplie par son propre script (cours, historique, e-mails).
// L'identifiant de la feuille n'est pas dans le dépôt public : le coller ci-dessous (dans son adresse, entre /d/ et /edit).
// Ligne à ajouter dans doPost (journal.gs), juste avant « if (String(d.action).indexOf('crm_') === 0) … » :
//      if (String(d.action).indexOf('bourse_') === 0) return json_(bourse_(d));
// Puis Déployer → Gérer les déploiements → modifier → Nouvelle version (et accepter l'autorisation Sheets si Google la demande).

var BOURSE_FEUILLE = 'COLLE_ICI_L_ID_DU_SUIVI_BOURSE';
var BOURSE_HISTORIQUE = 15;   // lignes d'historique rendues (les plus récentes)

function bourse_(d) {
  var a = String(d.action);
  if (a === 'bourse_etat') return bourseEtat_(Number(d.jours) || BOURSE_HISTORIQUE);
  return { ok: false, erreur: 'action inconnue : ' + a };
}

function bourseEtat_(jours) {
  if (!BOURSE_FEUILLE || BOURSE_FEUILLE.indexOf('COLLE_ICI') === 0) return { ok: false, erreur: 'le suivi bourse n\'est pas encore relié au script (identifiant à coller dans bourse.gs)' };
  var ss = SpreadsheetApp.openById(BOURSE_FEUILLE), parts = [];
  var tz = ss.getSpreadsheetTimeZone() || 'Europe/Paris';
  parts.push('Suivi bourse de Timothée (feuille Google « ' + ss.getName() + ' »), lu le ' + Utilities.formatDate(new Date(), tz, 'dd/MM/yy à HH:mm') + '.');

  // Config : paramètre → valeur (capital versé, liquidités, date d'ouverture du PEA, LDD, marge, taux).
  var cfg = ss.getSheetByName('Config');
  if (cfg && cfg.getLastRow() > 1) {
    var c = cfg.getRange(2, 1, cfg.getLastRow() - 1, 2).getDisplayValues().filter(function (r) { return r[0] && r[1] !== ''; });
    var c2 = c.filter(function (r) { return !/e-?mail/i.test(r[0]); });   // l'adresse e-mail n'a rien à faire dans une réponse
    parts.push('\nPARAMÈTRES :\n' + c2.map(function (r) { return '- ' + r[0] + ' : ' + r[1]; }).join('\n'));
  }

  // Positions : une ligne par action, toutes les colonnes de la feuille, plus des totaux calculés ici.
  var pos = ss.getSheetByName('Positions');
  if (pos && pos.getLastRow() > 1) {
    var rg = pos.getRange(1, 1, pos.getLastRow(), pos.getLastColumn());
    var aff = rg.getDisplayValues(), val = rg.getValues(), tete = aff[0];
    var col = function (re) { for (var i = 0; i < tete.length; i++) if (re.test(tete[i])) return i; return -1; };
    var iNom = col(/^action/i), iQte = col(/quantit/i), iPru = col(/^PRU/i), iVal = col(/valorisation/i);
    var lignes = [], totVal = 0, totCout = 0, n = 0;
    for (var r = 1; r < aff.length; r++) {
      if (!aff[r][iNom >= 0 ? iNom : 0]) continue;
      n++;
      lignes.push('- ' + tete.map(function (h, i) { return h && aff[r][i] !== '' && !/ticker/i.test(h) ? h + ' : ' + aff[r][i] : ''; }).filter(Boolean).join(' ; '));
      if (iVal >= 0 && typeof val[r][iVal] === 'number') totVal += val[r][iVal];
      if (iQte >= 0 && iPru >= 0 && typeof val[r][iQte] === 'number' && typeof val[r][iPru] === 'number') totCout += val[r][iQte] * val[r][iPru];
    }
    parts.push('\nPOSITIONS DU PEA (' + n + ' lignes ; cours de Google Finance, avec jusqu\'à 20 min de retard) :\n' + lignes.join('\n'));
    if (totVal) {
      var pv = totVal - totCout;
      parts.push('TOTAL DES TITRES : valorisation ' + eur_(totVal) + ', prix de revient ' + eur_(totCout) + ', plus ou moins-value latente '
        + (pv >= 0 ? '+' : '') + eur_(pv) + ' (' + (totCout ? (pv / totCout * 100).toFixed(2).replace('.', ',') : '?') + ' %).');
    }
  }

  // Historique : un relevé par jour de bourse (valeur, tout vendu frais déduits, écart avec le capital, gain net, statut).
  var hist = ss.getSheetByName('Historique');
  if (hist && hist.getLastRow() > 1) {
    var nb = Math.min(Math.max(jours, 1), 60), der = hist.getLastRow(), deb = Math.max(2, der - nb + 1);
    var th = hist.getRange(1, 1, 1, hist.getLastColumn()).getDisplayValues()[0];
    var h = hist.getRange(deb, 1, der - deb + 1, hist.getLastColumn()).getDisplayValues();
    parts.push('\nHISTORIQUE (' + h.length + ' derniers relevés, du plus ancien au plus récent ; colonnes : ' + th.join(' | ') + ') :\n'
      + h.map(function (x) { return x.join(' | '); }).join('\n'));
    parts.push('Premier relevé de l\'historique : ' + hist.getRange(2, 1, 1, hist.getLastColumn()).getDisplayValues()[0].join(' | ') + '.');
  }
  return { ok: true, texte: parts.join('\n'), lien: ss.getUrl() };
}

function eur_(x) { return (Math.round(x * 100) / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €'; }

// Essai depuis l'éditeur : sélectionne « essaiBourse » puis « Exécuter » (résultat dans « Journal d'exécution »).
function essaiBourse() { Logger.log(JSON.stringify(bourse_({ action: 'bourse_etat' }), null, 1)); }
