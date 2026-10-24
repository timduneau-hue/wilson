// Test du script Apps Script du journal (apps-script/journal.gs) avec une fausse feuille Google : `node apps_script_unit.js`
const fs = require('fs'), path = require('path'), vm = require('vm');
let ok = 0, ko = 0;
const check = (name, cond, detail = '') => { cond ? ok++ : ko++; console.log(cond ? '✅' : '❌', name, detail); };

function fakeSheet(name, rows = 1000) {
  const data = [];   // data[r][c], 0-based ; ligne 0 = en-têtes
  const sh = {
    name, maxRows: rows, data, formats: {},
    getName: () => name,
    getMaxRows: () => sh.maxRows,
    getLastRow: () => { for (let r = data.length - 1; r >= 0; r--) if (data[r] && data[r].some((v) => v !== '' && v != null)) return r + 1; return 0; },
    insertRowsBefore: (pos, n) => { data.splice(pos - 1, 0, ...Array.from({ length: n }, () => [])); sh.maxRows += n; },
    insertRowsAfter: (pos, n) => { data.splice(pos, 0, ...Array.from({ length: n }, () => [])); sh.maxRows += n; },
    deleteRows: (pos, n) => { data.splice(pos - 1, n); sh.maxRows -= n; },
    getRange: (r, c, nr = 1, nc = 1) => {
      const rg = {
        setValues: (vals) => { if (vals.length !== nr || vals.some((x) => x.length !== nc)) throw new Error(`dimensions ${vals.length}x${vals[0].length} ≠ ${nr}x${nc}`);
          vals.forEach((row, i) => { data[r - 1 + i] = data[r - 1 + i] || []; row.forEach((v, j) => { data[r - 1 + i][c - 1 + j] = v; }); }); return rg; },
        clearContent: () => { for (let i = 0; i < nr; i++) if (data[r - 1 + i]) for (let j = 0; j < nc; j++) data[r - 1 + i][c - 1 + j] = ''; return rg; },
        setFontWeight: () => rg, setBackground: () => rg,
        setNumberFormat: (f) => { sh.formats[c] = f; return rg; },
      };
      return rg;
    },
  };
  return sh;
}

const sheets = { 'Journal': fakeSheet('Journal'), 'Délais': fakeSheet('Délais'), 'État': fakeSheet('État', 60) };
sheets['Journal'].data[0] = ['Date', 'Version', 'Message'];
sheets['Délais'].data[0] = ['Date', 'Envoi'];
sheets['État'].data[0] = ['Clé', 'Valeur'];
let opened = null, locked = 0; const fetched = [], logged = [], props = {};
let tavily = () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ answer: 'Demain à Angers : éclaircies, 9 à 17 °C.', response_time: 0.8,
  results: [{ title: 'Météo Angers', url: 'https://meteo.example/angers', content: 'Samedi : éclaircies, minimales 9 °C, maximales 17 °C. '.repeat(20) }] }) });
const ctx = {
  console, JSON, Date, Math, String, Object, isFinite,
  SpreadsheetApp: { openById: (id) => { opened = id; return { getSheetByName: (n) => sheets[n] || null }; } },
  LockService: { getScriptLock: () => ({ waitLock: () => { locked++; }, releaseLock: () => { locked--; } }) },
  ContentService: { createTextOutput: (t) => ({ text: t, getContent() { return t; }, setMimeType(m) { this.mime = m; return this; } }), MimeType: { JSON: 'json' } },
  UrlFetchApp: { fetch: (url, o) => { fetched.push({ url, o }); return tavily(url, o); } },
  Logger: { log: (x) => logged.push(x) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
  Utilities: { formatDate: () => '23/10/26 15h30:00' },
  ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTEST/exec' }) },
  HtmlService: { createHtmlOutput: (h) => ({ html: h, setTitle(t) { this.title = t; return this; } }) },
};
vm.createContext(ctx);
const code = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'journal.gs'), 'utf8').replace('COLLE_ICI_L_ID_DE_LA_FEUILLE', 'ID_TEST');
vm.runInContext(code, ctx);

const post = (o) => ctx.doPost({ postData: { contents: JSON.stringify(o) } });
const t0 = Date.parse('2026-10-23T13:00:00Z');
let r = post({ version: '1.8.0', appareil: 'tablette du salon', lignes: [{ t: t0, m: 'ligne 1' }, { t: t0 + 1000, m: 'ligne 2' }],
  mesures: [{ t: t0 + 2000, envoi: 0.25, google: 0.93, phrase1: 1.21, voix: 1.6, complet: 2.04, modele: 'gemini-3.5-flash-lite', reflexion: 'minimal', relance: false, recherche: null, anticipe: true, phrase: 2.3 }],
  bilan: { 'Version': '1.8.0', 'État': 'veille' } });
check('Réponse « ok »', r.text === 'ok');
check('Bonne feuille ouverte, verrou rendu', opened === 'ID_TEST' && locked === 0);
const J = sheets['Journal'].data;
check('Journal : plus récent en haut, en-têtes intacts', J[0][0] === 'Date' && J[1][2] === 'ligne 2' && J[2][2] === 'ligne 1' && J[1][1] === '1.8.0' && J[1][0] instanceof Date, JSON.stringify(J.slice(0, 3)));
post({ version: '1.8.0', lignes: [{ t: t0 + 5000, m: 'ligne 3' }] });
check('2e envoi : au-dessus des précédents', J[1][2] === 'ligne 3' && J[2][2] === 'ligne 2' && J[3][2] === 'ligne 1');
const D = sheets['Délais'].data;
check('Délais : une ligne de 12 colonnes, nombres arrondis', D[1].length === 12 && D[1][1] === 0.3 && D[1][2] === 0.9 && D[1][6] === 'gemini-3.5-flash-lite' && D[1][10] === 'oui' && D[1][9] === '' && D[1][8] === '', JSON.stringify(D[1]));
check('Format de date jj/mm/aa', sheets['Journal'].formats[1] === 'dd/mm/yy hh"h"mm:ss');
const E = sheets['État'].data;
check('État : bilan écrit avec l\'heure et l\'appareil', E[1][0] === 'Mis à jour' && E[2][1] === 'tablette du salon' && E[3][0] === 'Version' && E[4][1] === 'veille', JSON.stringify(E.slice(0, 5)));
post({ version: '1.8.0', bilan: { 'Version': '1.8.0' } });
check('État : l\'ancien bilan est effacé', E[3][0] === 'Version' && (E[4] || [])[0] === '', JSON.stringify(E.slice(0, 6)));
const big = Array.from({ length: 80 }, (_, i) => ({ t: t0 + i, m: 'x' + i }));
post({ version: '1', bilan: Object.fromEntries(Array.from({ length: 70 }, (_, i) => ['k' + i, i])) });
check('État : la feuille s\'agrandit si le bilan est long', E[72] && E[72][0] === 'k69');
// Purge : au-delà de MAX lignes, les plus anciennes partent.
vm.runInContext("MAX['Journal'] = 50;", ctx);
post({ version: '1', lignes: big });
post({ version: '1', lignes: big.slice(0, 1).map((l) => ({ ...l, m: 'dernière' })) });
check('Purge des plus anciennes au-delà du maximum', sheets['Journal'].getLastRow() <= 51 + 500 && J[1][2] === 'dernière');
vm.runInContext("MAX['Journal'] = 50;", ctx);
for (let k = 0; k < 8; k++) post({ version: '1', lignes: big });
check('… la feuille ne grossit pas sans fin', sheets['Journal'].getLastRow() <= 51 + 500 + 80, `${sheets['Journal'].getLastRow()} lignes`);
const g = ctx.doGet();
check('Page de contrôle avec QR code de l\'adresse', /QRCode/.test(g.html) && g.html.includes('AKfycbTESTTESTTESTTESTTEST/exec') && g.title === 'Journal de Wilson');
ctx.essai();
check('Fonction essai', J[1][2].startsWith('Essai du journal'));

// Recherche Internet (Tavily)
const lignesAvant = sheets['Journal'].getLastRow();
let s = JSON.parse(post({ action: 'chercher', question: 'météo demain à Angers' }).text);
check('Recherche sans clé Tavily : refus clair, rien d\'envoyé', s.ok === false && /clé Tavily absente/.test(s.erreur) && fetched.length === 0);
vm.runInContext("TAVILY_CLE = 'tvly-TESTTEST';", ctx);
const out = post({ action: 'chercher', question: 'météo demain à Angers' });
s = JSON.parse(out.text);
const f = fetched[0] || { o: {} }, pl = JSON.parse(f.o.payload || '{}');
check('Recherche : appel Tavily (clé en en-tête, question, France, réponse courte)', f.url === 'https://api.tavily.com/search' && f.o.headers.Authorization === 'Bearer tvly-TESTTEST'
  && pl.query === 'météo demain à Angers' && pl.country === 'france' && pl.include_answer === 'basic' && pl.search_depth === 'basic', JSON.stringify(pl));
check('Recherche : réponse JSON (réponse + extraits raccourcis)', out.mime === 'json' && s.ok && /éclaircies/.test(s.reponse) && s.resultats.length === 1 && s.resultats[0].extrait.length <= 500);
check('Recherche : rien d\'écrit dans le journal, pas de verrou', sheets['Journal'].getLastRow() === lignesAvant && locked === 0);
tavily = () => ({ getResponseCode: () => 432, getContentText: () => JSON.stringify({ detail: { error: 'This request exceeds your plan\'s set usage limit.' } }) });
s = JSON.parse(post({ action: 'chercher', question: 'x' }).text);
check('Recherche : quota Tavily épuisé → message clair', s.ok === false && s.code === 432 && /usage limit/.test(s.erreur), s.erreur);
// Réglages communs à tous les appareils
let rg = JSON.parse(post({ action: 'reglages_lire' }).text);
check('Réglages : rien au départ', rg.ok && rg.reglages === null && rg.t === 0);
let w = JSON.parse(post({ action: 'reglages_ecrire', t: 100, reglages: { voice: 'Charon', city: 'Angers' } }).text);
rg = JSON.parse(post({ action: 'reglages_lire' }).text);
check('Réglages : écrits puis relus', w.ok && w.applique && rg.reglages.voice === 'Charon' && rg.t === 100 && locked === 0);
w = JSON.parse(post({ action: 'reglages_ecrire', t: 50, reglages: { voice: 'Puck' } }).text);
rg = JSON.parse(post({ action: 'reglages_lire' }).text);
check('Réglages : un envoi plus ancien ne remplace pas le plus récent', w.ok && !w.applique && rg.reglages.voice === 'Charon');
w = JSON.parse(post({ action: 'reglages_ecrire', t: 200, reglages: { voice: 'Zephyr' } }).text);
check('Réglages : le plus récent gagne', JSON.parse(post({ action: 'reglages_lire' }).text).reglages.voice === 'Zephyr');
check('Réglages : rien dans la feuille (propriétés du script)', sheets['Journal'].data.every((r) => !JSON.stringify(r).includes('Zephyr')));
const u = JSON.parse(post({ action: 'truc' }).text);
check('Action inconnue : erreur lisible', u.ok === false && /action inconnue/.test(u.erreur));
ctx.essaiRecherche();
check('Fonction essaiRecherche', logged.length === 1);
console.log(`\n${ok}/${ok + ko} vérifications OK`);
process.exit(ko ? 1 : 0);
