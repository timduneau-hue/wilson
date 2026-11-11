// Wilson — écritures dans le stockage local de l'appareil (W18). Avant : `try { localStorage.setItem(...) } catch (_) {}` à une
// vingtaine d'endroits, donc un stockage plein (ou refusé) faisait perdre souvenirs, file d'attente du CRM ou réglages en silence.
// Ici : l'échec est compté et noté au journal (une ligne par clé et par quart d'heure, pour ne pas le remplir), et l'appelant
// sait si l'écriture a réussi (true / false).
let noteur = null;
const vus = new Map();           // clé → heure de la dernière note
export const bilanStockage = { echecs: 0, derniere: '' };

// app.js y branche son journal : (message) => void
export function brancherStockage(fn) { noteur = fn; }

function noter(cle, e) {
  bilanStockage.echecs++;
  const raison = e && (e.name === 'QuotaExceededError' || /quota/i.test(e.message || '')) ? 'stockage plein' : String((e && (e.name || e.message)) || 'refusé').slice(0, 60);
  bilanStockage.derniere = `${cle} (${raison})`;
  const maintenant = Date.now();
  if (maintenant - (vus.get(cle) || 0) < 15 * 60000) return;
  vus.set(cle, maintenant);
  const m = `Stockage de l'appareil : écriture impossible pour « ${cle} » (${raison}) ; ce qui devait y être gardé sera perdu au prochain redémarrage`;
  try { if (noteur) noteur(m); else console.warn(m); } catch (_) {}
}

// Écrit une valeur (texte brut si `brut`, sinon JSON). Rend true si elle est bien enregistrée.
export function ecrireLocal(cle, valeur, brut = false) {
  try { localStorage.setItem(cle, brut ? String(valeur) : JSON.stringify(valeur)); return true; }
  catch (e) { noter(cle, e); return false; }
}
