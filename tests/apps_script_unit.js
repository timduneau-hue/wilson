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
    deleteRow: (pos) => { data.splice(pos - 1, 1); sh.maxRows -= 1; },
    appendRow: (row) => { data[sh.getLastRow()] = row.slice(); if (data.length > sh.maxRows) sh.maxRows = data.length; return sh; },
    setFrozenRows: (n) => { sh.frozen = n; },
    getRange: (r, c, nr = 1, nc = 1) => {
      const rg = {
        setValues: (vals) => { if (vals.length !== nr || vals.some((x) => x.length !== nc)) throw new Error(`dimensions ${vals.length}x${vals[0].length} ≠ ${nr}x${nc}`);
          vals.forEach((row, i) => { data[r - 1 + i] = data[r - 1 + i] || []; row.forEach((v, j) => { data[r - 1 + i][c - 1 + j] = v; }); }); return rg; },
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const v = (data[r - 1 + i] || [])[c - 1 + j]; return v == null ? '' : v; })),
        setValue: (v) => { data[r - 1] = data[r - 1] || []; data[r - 1][c - 1] = v; return rg; },
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
let opened = null, locked = 0; const cache = {}; let dormi = 0; const fetched = [], logged = [], props = {}, mails = [], evs = [];
const evt = (o) => ({ ...o, getMyStatus: () => o.statut || 'OWNER', getId: () => o.id, getTitle: () => o.titre, getStartTime: () => o.d1, getEndTime: () => o.d2, isAllDayEvent: () => !!o.entier, getLocation: () => o.lieu || '', deleteEvent: () => { evs.splice(evs.indexOf(o), 1); } });
const evsPerso = [];
const perso = { getId: () => 'timothee@exemple.fr', getName: () => 'Timothée', getEvents: (a, b) => evsPerso.filter((e) => e.d1 < b && e.d2 > a).map(evt) };
const anniv = { getId: () => 'anniv@group.calendar.google.com', getName: () => 'Anniversaire', getEvents: () => [evt({ id: 'a1', titre: 'Anniversaire Léa', d1: new Date(2026, 10, 12, 10), d2: new Date(2026, 10, 12, 11) })] };
const cal = {
  getId: () => 'famille@group.calendar.google.com', getName: () => 'Famille',
  getEvents: (a, b) => evs.filter((e) => e.d1 < b && e.d2 > a).map(evt),
  createEvent: (titre, d1, d2, o) => { const e = { id: 'e' + evs.length, titre, d1, d2, lieu: o.location, note: o.description }; evs.push(e); return evt(e); },
  createAllDayEvent: (titre, d1, d2, o) => { if (!(d2 instanceof Date)) { o = d2; d2 = new Date(d1.getTime() + 86400000); } const e = { id: 'e' + evs.length, titre, d1, d2, entier: true, lieu: o.location }; evs.push(e); return evt(e); },
  getEventById: (id) => { const e = evs.find((x) => x.id === id); return e ? evt(e) : null; },
};
let tavily = () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ answer: 'Demain à Angers : éclaircies, 9 à 17 °C.', response_time: 0.8,
  results: [{ title: 'Météo Angers', url: 'https://meteo.example/angers', content: 'Samedi : éclaircies, minimales 9 °C, maximales 17 °C. '.repeat(20) }] }) });
let fauxTemps = 0;
class FDate extends Date { constructor(...a) { super(...(a.length ? a : [Date.now() + fauxTemps])); } static now() { return Date.now() + fauxTemps; } }
const ctx = {
  console, JSON, Date: FDate, Math, String, Object, isFinite,
  SpreadsheetApp: { openById: (id) => { opened = id; return { getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => { if (sheets[n]) throw new Error('existe déjà'); return (sheets[n] = fakeSheet(n)); } }; } },
  LockService: { getScriptLock: () => ({ waitLock: () => { locked++; }, tryLock: () => { locked++; return true; }, releaseLock: () => { locked--; } }) },
  CacheService: { getScriptCache: () => ({ get: (k) => (k in cache ? cache[k] : null), put: (k, v, ttl) => { if (String(v).length > 100000) throw new Error('trop grand pour le cache'); cache[k] = String(v); } }) },
  ContentService: { createTextOutput: (t) => ({ text: t, getContent() { return t; }, setMimeType(m) { this.mime = m; return this; } }), MimeType: { JSON: 'json' } },
  UrlFetchApp: { fetch: (url, o) => { fetched.push({ url, o }); return tavily(url, o); } },
  Logger: { log: (x) => logged.push(x) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { if (String(v).length > 9000) throw new Error('propriété trop grande'); props[k] = String(v); },
    getProperties: () => ({ ...props }), deleteProperty: (k) => { delete props[k]; } }) },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'moi@exemple.fr' }) },
  MailApp: { sendEmail: (o) => mails.push(o) },
  CalendarApp: { getCalendarsByName: (n) => (n === 'Famille' ? [cal] : []), getAllOwnedCalendars: () => [perso, cal, anniv], GuestStatus: { NO: 'NO', YES: 'YES', OWNER: 'OWNER' } },
  Utilities: { sleep: (ms) => { dormi += ms; fauxTemps += ms; }, formatDate: (d, tz, f) => (f === 'yyyy-MM-dd' ? '2026-11-04' : f === "HH'h'mm" ? '14h12' : '23/10/26 15h30:00'), base64Decode: (b) => Buffer.from(b, 'base64'), newBlob: (bytes, type, name) => ({ bytes, type, name }) },
  ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTEST/exec' }), getOAuthToken: () => 'JETON-DE-TIMOTHEE' },
  DriveApp: { getRootFolder: () => ({ getName: () => 'Mon Drive' }) },
  HtmlService: { createHtmlOutput: (h) => ({ html: h, setTitle(t) { this.title = t; return this; } }) },
};
vm.createContext(ctx);
const code = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'journal.gs'), 'utf8').replace('COLLE_ICI_L_ID_DE_LA_FEUILLE', 'ID_TEST');
vm.runInContext(code, ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'famille.gs'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'claude.gs'), 'utf8'), ctx);   // questions difficiles pour Claude (PLAN 10)   // messages, garde, alertes (PLAN 7 sexies)

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

// CRM à la voix : relais vers l'application Web du CRM, avec le jeton de Timothée
fetched.length = 0;
let c = JSON.parse(post({ action: 'crm_client', client: 'Gaudin' }).text);
check('CRM : adresse absente → message clair, rien d\'envoyé', c.ok === false && /CRM_URL/.test(c.erreur) && fetched.length === 0);
vm.runInContext("CRM_URL = 'https://script.google.com/macros/s/AKfycbCRMCRMCRMCRMCRMCRM/exec';", ctx);
tavily = (url, o) => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, texte: 'Client : Menuiserie Gaudin', recu: JSON.parse(o.payload) }) });
c = JSON.parse(post({ action: 'crm_client', client: 'Gaudin', histo: true }).text);
const fc = fetched[0] || { o: {} };
check('CRM : question transmise telle quelle, en POST, avec le jeton', fc.url.endsWith('AKfycbCRMCRMCRMCRMCRMCRM/exec') && fc.o.method === 'post' && fc.o.headers.Authorization === 'Bearer JETON-DE-TIMOTHEE'
  && c.ok && c.recu.action === 'crm_client' && c.recu.client === 'Gaudin' && fc.o.followRedirects === true, JSON.stringify(fc.o));
tavily = () => ({ getResponseCode: () => 200, getContentText: () => '<html>Fonction de script introuvable : doPost</html>' });
c = JSON.parse(post({ action: 'crm_etat' }).text);
check('CRM pas encore mis à jour : message clair', c.ok === false && /nouvelle version du CRM/.test(c.erreur), c.erreur);
tavily = () => ({ getResponseCode: () => 401, getContentText: () => 'Unauthorized' });
c = JSON.parse(post({ action: 'crm_etat' }).text);
check('Jeton refusé : il faut lancer essaiCRM', c.ok === false && /essaiCRM/.test(c.erreur), c.erreur);
tavily = () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, contacts: 437 }) });
logged.length = 0; ctx.essaiCRM();
check('Fonction essaiCRM (demande Drive, état, journée)', logged.length === 2 && /437/.test(logged[0]));
// La famille et la garde (famille.gs, PLAN 7 sexies)
const JF = (o) => JSON.parse(post(o).text);
let fa = JF({ action: 'msg_deposer', msg: { id: 'abc1', pour: 'Marie', de: 'Timothée', texte: 'je rentre vers 20h00', t: Date.now() } });
check('Message déposé (une propriété par message)', fa.ok && props.msg_abc1 && JSON.parse(props.msg_abc1).pour === 'Marie');
JF({ action: 'msg_deposer', msg: { id: 'abc1', pour: 'Marie', texte: 'autre chose', t: Date.now() } });
check('Message renvoyé après une coupure (même id) : pas de doublon, pas d\'écrasement', JSON.parse(props.msg_abc1).texte === 'je rentre vers 20h00');
check('Message incomplet refusé', JF({ action: 'msg_deposer', msg: { pour: 'Marie' } }).ok === false);
fa = JF({ action: 'msg_lire', noms: ['Timothée', 'Marie'] });
check('Lecture : messages et prénoms de la tablette (prénoms seulement)', fa.ok && fa.messages.length === 1 && JSON.parse(props.famille_noms).length === 2 && fa.noms.includes('Marie'));
fa = JF({ action: 'msg_remis', id: 'abc1', t: 2000, a: 'Marie' });
check('Remis : date et personne', fa.ok && JSON.parse(props.msg_abc1).remis.a === 'Marie');
JF({ action: 'msg_annuler', id: 'abc1' });
check('Annulé : n\'est plus lu', JF({ action: 'msg_lire' }).messages.length === 0);
props.msg_vieux = JSON.stringify({ id: 'vieux', pour: 'Louis', texte: 'x', t: Date.now() - 15 * 24 * 3600000 });
JF({ action: 'msg_lire' });
check('Message de plus de 14 jours effacé', !('msg_vieux' in props));
check('Garde : la plus récente gagne', JF({ action: 'garde_ecrire', garde: { on: true, t: 50, par: 'téléphone' } }).applique && !JF({ action: 'garde_ecrire', garde: { on: false, t: 40 } }).applique && JF({ action: 'msg_lire' }).garde.on === true);
fa = JF({ action: 'alerte', genre: 'fumee', texte: 'détecteur de fumée', details: 'Wilson a entendu : détecteur de fumée.', photo: Buffer.from('PHOTO').toString('base64'), t: 1, appareil: 'tablette' });
const m0 = mails[0] || {};
check('Alerte : e-mail à Timothée lui-même, avec la photo (jointe et dans le message)', fa.ok && fa.envoye && m0.to === 'moi@exemple.fr' && /alerte : détecteur de fumée/.test(m0.subject) && m0.inlineImages && m0.attachments.length === 1 && /cid:photo/.test(m0.htmlBody), JSON.stringify(fa));
fa = JF({ action: 'alerte', genre: 'fumee', texte: 'détecteur de fumée', t: 2 });
check('Même alerte moins de 10 min après : pas d\'e-mail', fa.ok && !fa.envoye && mails.length === 1, JSON.stringify(fa));
for (let i = 0; i < 25; i++) JF({ action: 'alerte', genre: 'g' + i, texte: 'essai ' + i, t: 3 });
check('20 alertes par jour au plus', mails.length === 20, String(mails.length));
check('Texte échappé dans l\'e-mail', JF({ action: 'alerte', genre: 'x', texte: '<b>', essai: true }) && !mails.slice(-1)[0].htmlBody.includes('<b><b>'));
check('Action inconnue de famille.gs : erreur lisible', /action inconnue/.test(JF({ action: 'msg_truc' }).erreur));
// Alertes aussi à Camille (adresse mise dans le script de Timothée, jamais dans le dépôt)
vm.runInContext("ALERTES_AUSSI = 'camille@exemple.fr, pas-une-adresse';", ctx); delete props.alertes;   // nouveau jour : compteur remis à zéro
JF({ action: 'alerte', genre: 'verre', texte: 'bris de verre', essai: true });
check('Alerte : copie aux adresses de ALERTES_AUSSI (et seulement aux adresses valides)', mails.slice(-1)[0].cc === 'camille@exemple.fr' && mails.slice(-1)[0].to === 'moi@exemple.fr', JSON.stringify(mails.slice(-1)[0].cc));
check('Dépôt : ALERTES_AUSSI vide (aucune adresse dans le code publié)', /var ALERTES_AUSSI = '';/.test(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'famille.gs'), 'utf8')));
// L'agenda « Famille »
const t1 = new Date(2026, 10, 12, 10, 0).getTime();
fa = JF({ action: 'agenda_ajouter', titre: 'Médecin Louis', debut: t1, lieu: 'Angers', note: 'Ajouté par Wilson' });
check('Agenda : rendez-vous ajouté (1 h par défaut)', fa.ok && evs.length === 1 && evs[0].d2 - evs[0].d1 === 3600000 && evs[0].lieu === 'Angers', JSON.stringify(fa));
fa = JF({ action: 'agenda_ajouter', titre: 'Week-end chez mamie', journee: true, debut: '2026-11-14', fin: '2026-11-15' });
check('Agenda : week-end en jours entiers (samedi et dimanche)', fa.ok && evs[1].entier && evs[1].d1.getDate() === 14 && evs[1].d2.getDate() === 16, JSON.stringify(evs[1]));
fa = JF({ action: 'agenda_lire', du: '2026-11-12', jours: 7 });
check('Agenda : lecture de la semaine', fa.ok && fa.evenements.length === 2 && fa.evenements[0].titre === 'Médecin Louis');
// Déjà quelque chose de prévu (demande du 06/11/26) : rien n'est ajouté, Wilson prévient ; ajouté seulement avec quand_meme.
fa = JF({ action: 'agenda_ajouter', titre: 'Coiffeur', debut: t1 + 1800000 });
check('Agenda : créneau déjà pris dans l\'agenda Famille → pas ajouté, conflit rendu', fa.ok && fa.conflit === true && fa.conflits.length === 1 && fa.conflits[0].titre === 'Médecin Louis' && fa.conflits[0].agenda === 'Famille' && evs.length === 2, JSON.stringify(fa));
fa = JF({ action: 'agenda_ajouter', titre: 'Coiffeur', debut: t1 + 1800000, quand_meme: true });
check('Agenda : ajouté quand même après son accord', fa.ok && !fa.conflit && evs.length === 3 && evs[2].titre === 'Coiffeur', JSON.stringify(fa));
evs.pop();
evsPerso.push({ id: 'p1', titre: 'Dentiste', d1: new Date(2026, 10, 13, 17, 0), d2: new Date(2026, 10, 13, 18, 0) }, { id: 'p2', titre: 'Réunion refusée', statut: 'NO', d1: new Date(2026, 10, 13, 9, 0), d2: new Date(2026, 10, 13, 10, 0) });
fa = JF({ action: 'agenda_ajouter', titre: 'Apéro chez Paul', debut: new Date(2026, 10, 13, 16, 30).getTime(), fin: new Date(2026, 10, 13, 17, 30).getTime() });
check('Agenda : conflit trouvé aussi dans son agenda à lui (avec le nom de l\'agenda)', fa.conflit && fa.conflits.length === 1 && fa.conflits[0].titre === 'Dentiste' && fa.conflits[0].agenda === 'Timothée' && evs.length === 2, JSON.stringify(fa));
evsPerso.push({ id: 'p3', titre: 'Anniversaire Paul', entier: true, d1: new Date(2026, 10, 13), d2: new Date(2026, 10, 14) });
fa = JF({ action: 'agenda_ajouter', titre: 'Garage', debut: new Date(2026, 10, 13, 9, 0).getTime() });
check('Agenda : un événement qu\'il a refusé, ou « toute la journée » dans son agenda à lui, ne compte pas', fa.ok && !fa.conflit && evs.length === 3, JSON.stringify(fa));
evs.pop();
fa = JF({ action: 'agenda_ajouter', titre: 'Anniversaire Léa', journee: true, debut: '2026-11-15' });
check('Agenda : jour entier déjà occupé (le week-end chez mamie) → conflit', fa.conflit && fa.conflits.some((e) => e.titre === 'Week-end chez mamie' && e.journee) && evs.length === 2, JSON.stringify(fa));
fa = JF({ action: 'agenda_ajouter', titre: 'Cinéma', debut: new Date(2026, 10, 12, 20, 30).getTime() });
check('Agenda : créneau libre → ajouté directement', fa.ok && !fa.conflit && evs.length === 3, JSON.stringify(fa));
evs.pop();
fa = JF({ action: 'agenda_annuler', id: evs[1].id });
check('Agenda : annuler un événement', fa.ok && evs.length === 1);
check('Agenda : titre manquant refusé', JF({ action: 'agenda_ajouter', debut: t1 }).ok === false);
logged.length = 0; ctx.essaiAgenda();
check('Fonction essaiAgenda', logged.length === 1 && /Famille/.test(logged[0]));
logged.length = 0; ctx.essaiFamille();
check('Fonction essaiFamille', logged.length === 1 && /Alerte d'essai/.test(logged[0]));
// La mémoire de Wilson (onglet « Mémoire ») et les questions de Claude (onglet « Questions ») — demande du 05/11/26
delete sheets['Mémoire']; delete sheets['Questions'];
fa = JF({ action: 'mem_lire' });
const MEM = () => sheets['Mémoire'].data;
check('Mémoire : onglet créé avec ses en-têtes', fa.ok && fa.souvenirs.length === 0 && MEM()[0].join('|') === 'Id|Catégorie|Souvenir|Qui|Date|Origine' && sheets['Mémoire'].frozen === 1, JSON.stringify(MEM()[0]));
fa = JF({ action: 'mem_ecrire', ajouter: [{ id: 'm1', cat: 'goûts', texte: 'Camille n\'aime pas la coriandre.', qui: 'Camille', t: Date.now(), origine: 'discussion' },
  { id: 'm2', cat: 'famille', texte: 'Louis est le fils de Timothée et Camille.', qui: 'Louis', origine: 'ancien' }] });
check('Mémoire : deux souvenirs ajoutés, relus', fa.ok && fa.ajoutes === 2 && fa.souvenirs.length === 2 && fa.souvenirs[0].texte === 'Camille n\'aime pas la coriandre.' && fa.souvenirs[0].t > 0 && MEM()[1][4] instanceof Date, JSON.stringify(fa));
fa = JF({ action: 'mem_ecrire', ajouter: [{ id: 'm1', texte: 'Camille n\'aime pas la coriandre.' }, { id: 'm3', texte: 'camille n\'aime pas la CORIANDRE' }] });
check('Mémoire : rien en double (même id, ou même phrase)', fa.ok && fa.ajoutes === 0 && fa.souvenirs.length === 2, JSON.stringify(fa));
fa = JF({ action: 'mem_ecrire', oublier: ['m1'], ajouter: [{ id: 'm4', cat: 'goûts', texte: 'Camille adore la coriandre finalement.', qui: 'Camille' }] });
check('Mémoire : corriger = oublier l\'ancien + ajouter le nouveau', fa.ok && fa.oublies === 1 && fa.ajoutes === 1 && fa.souvenirs.map((x) => x.id).join() === 'm2,m4', JSON.stringify(fa.souvenirs.map((x) => x.id)));
MEM().push(['', 'maison', 'Les piles sont dans le tiroir de l\'entrée.', '', '', '']);   // ligne écrite à la main par Timothée
fa = JF({ action: 'mem_lire' });
check('Mémoire : une ligne écrite à la main reçoit un id', fa.souvenirs.length === 3 && /^m/.test(fa.souvenirs[2].id) && MEM()[3][0] === fa.souvenirs[2].id, JSON.stringify(fa.souvenirs[2]));
check('Mémoire : phrase vide ou sans id refusée', JF({ action: 'mem_ecrire', ajouter: [{ id: 'm9', texte: '  ' }, { texte: 'sans id' }] }).ajoutes === 0);
check('Mémoire : verrou rendu', locked === 0);
vm.runInContext('MEM_MAX = 4;', ctx);
fa = JF({ action: 'mem_ecrire', ajouter: [{ id: 'a1', texte: 'Un.' }, { id: 'a2', texte: 'Deux.' }] });
check('Mémoire : pleine (400 au plus) → refusé, dit combien', fa.ajoutes === 1 && fa.refuses === 1, JSON.stringify(fa));
vm.runInContext('MEM_MAX = 400;', ctx);
// Questions
fa = JF({ action: 'q_lire' });
const QS = () => sheets['Questions'].data;
check('Questions : onglet créé avec ses en-têtes', fa.ok && fa.questions.length === 0 && QS()[0].join('|') === 'Id|Date|Question|Pourquoi|Réponse|Répondu le');
QS().push(['q1', new Date(), 'Quand tu dis « éteins tout », la télé aussi ?', 'Journal du 04/11 : la télé est restée allumée.', '', '']);
QS().push(['', new Date(), 'Préfères-tu un bip au réveil ?', '', '', '']);
QS().push(['q0', new Date(), 'Vieille question', '', 'Oui', new Date()]);
fa = JF({ action: 'q_lire' });
check('Questions : seulement celles sans réponse, une ligne sans id en reçoit un', fa.questions.length === 2 && fa.questions[0].id === 'q1' && /^q/.test(fa.questions[1].id) && QS()[2][0] === fa.questions[1].id && fa.questions[0].pourquoi.length > 5, JSON.stringify(fa));
fa = JF({ action: 'q_repondre', id: 'q1', reponse: 'Oui, la télé aussi.', t: Date.now() });
check('Questions : réponse écrite à côté de la question, avec la date', fa.ok && QS()[1][4] === 'Oui, la télé aussi.' && QS()[1][5] instanceof Date && /éteins tout/.test(fa.question), JSON.stringify(QS()[1]));
check('Questions : répondue → n\'est plus lue', JF({ action: 'q_lire' }).questions.length === 1);
check('Questions : réponse vide ou question inconnue refusée', JF({ action: 'q_repondre', id: 'q1', reponse: ' ' }).ok === false && JF({ action: 'q_repondre', id: 'zz', reponse: 'x' }).ok === false && locked === 0);
for (let i = 0; i < 5; i++) QS().push(['n' + i, new Date(), 'Question ' + i, '', '', '']);
check('Questions : 3 au plus à la fois', JF({ action: 'q_lire' }).questions.length === 3);
r = post({ action: 'mem_lire' });
check('doPost : mem_… passe par famille.gs', JSON.parse(r.getContent()).ok === true && JSON.parse(r.getContent()).souvenirs.length >= 3);
r = post({ action: 'q_lire' });
check('doPost : q_… passe par famille.gs', JSON.parse(r.getContent()).ok === true && Array.isArray(JSON.parse(r.getContent()).questions));

{
// ---------- Questions difficiles pour Claude sur le PC (PLAN 10, claude.gs) ----------
const C = (o) => JSON.parse(post(o).getContent());
const SECRET = 'secret-du-pc-tire-au-sort-0123456789';
let cq = C({ action: 'claude_etat' });
check('Claude : PC jamais vu → absent', cq.ok && cq.pc.vivant === false && cq.pc.vu === null);
cq = C({ action: 'claude_demander', id: 'q1', question: 'Compare la paumelle X à la Y', appareil: 'téléphone' });
check('Claude : PC absent → question refusée tout de suite (Wilson fait sans lui)', cq.ok && cq.accepte === false && cq.pc.vivant === false && !cache['claude_q_q1']);
cq = C({ action: 'claude_prendre', secret: 'court', attente: 0 });
check('Claude : secret trop court refusé', cq.ok === false && /secret/.test(cq.erreur));
cq = C({ action: 'claude_prendre', secret: SECRET, attente: 0, version: 'relais 1' });
check('Claude : 1er relais → secret retenu, PC vu, rien à prendre', cq.ok && cq.question === null && props.claude_secret === SECRET && C({ action: 'claude_etat' }).pc.vivant === true);
cq = C({ action: 'claude_prendre', secret: SECRET + 'x', attente: 0 });
check('Claude : un autre secret est refusé', cq.ok === false && /refusé/.test(cq.erreur));
cq = C({ action: 'claude_demander', id: 'q1', question: 'Compare la paumelle X à la Y', type: 'internet', voiture: true, appareil: 'téléphone' });
check('Claude : PC là → question acceptée, en attente', cq.ok && cq.accepte === true && cq.etat === 'attente' && JSON.parse(cache.claude_file).includes('q1'));
cq = C({ action: 'claude_demander', id: 'q1', question: 'Compare la paumelle X à la Y' });
check('Claude : même question renvoyée (coupure) → pas de doublon', cq.ok && cq.accepte && JSON.parse(cache.claude_file).filter((x) => x === 'q1').length === 1);
cq = C({ action: 'claude_resultat', id: 'q1', attente: 0 });
check('Claude : résultat → encore en attente', cq.ok && cq.etat === 'attente' && cq.dire === '');
cq = C({ action: 'claude_prendre', secret: SECRET, attente: 25 });
check('Claude : le relais prend la question (texte, type, voiture)', cq.ok && cq.question && cq.question.id === 'q1' && cq.question.type === 'internet' && cq.question.voiture === true && JSON.parse(cache.claude_file).length === 0);
check('Claude : sans « crm » de Wilson, pas de CRM pour Claude (seulement Timothée, 06/11/26)', cq.question.crm === false);
cq = C({ action: 'claude_resultat', id: 'q1', attente: 0 });
check('Claude : résultat → en cours', cq.ok && cq.etat === 'en_cours' && cq.pris !== null);
dormi = 0; cq = C({ action: 'claude_prendre', secret: SECRET, attente: 25 });
check('Claude : file vide → le relais attend 25 s puis rappelle', cq.ok && cq.question === null && dormi >= 24000 && dormi <= 26000, dormi + ' ms');
cq = C({ action: 'claude_rendre', secret: SECRET, id: 'q1', ok: true, dire: 'La X porte 80 kg, la Y 120 kg, d\'après les fiches Setin et Boschat.', detail: 'Détail…', duree: 42, etapes: 9 });
check('Claude : réponse déposée', cq.ok && cq.etat === 'faite');
cq = C({ action: 'claude_resultat', id: 'q1', attente: 15 });
check('Claude : Wilson reçoit la réponse', cq.ok && cq.etat === 'faite' && /120 kg/.test(cq.dire) && cq.duree === 42 && cq.detail === 'Détail…');
const HC = sheets['Claude'] ? sheets['Claude'].data : [];
check('Claude : historique dans l\'onglet « Claude » (date, appareil, type, question, réponse, détail, durée)', HC[0] && HC[0][3] === 'Question' && HC[1] && HC[1][0] instanceof Date && HC[1][1] === 'téléphone' && HC[1][2] === 'Internet (voiture)' && /paumelle X/.test(HC[1][3]) && /120 kg/.test(HC[1][4]) && HC[1][5] === 'Détail…' && HC[1][6] === '42' && HC[1][8] === 'réponse', JSON.stringify(HC.slice(0, 2)));
cq = C({ action: 'claude_rendre', secret: 'autre-secret-tout-aussi-long-0123456789', id: 'q1', dire: 'piratage' });
check('Claude : réponse sans le bon secret refusée', cq.ok === false && /piratage/.test(cache.claude_q_q1) === false);
C({ action: 'claude_demander', id: 'q2', question: 'Question annulée', type: 'crm', contexte: 'Dernier client : AD2M', regles: 'Règles du CRM' });
C({ action: 'claude_demander', id: 'q3', question: 'Question suivante', type: 'crm' });
cq = C({ action: 'claude_annuler', id: 'q2' });
check('Claude : annulation d\'une question pas encore prise', cq.ok && cq.etat === 'annulee');
cq = C({ action: 'claude_prendre', secret: SECRET, attente: 5 });
check('Claude : la question annulée est sautée, la suivante est prise', cq.ok && cq.question && cq.question.id === 'q3' && cq.question.type === 'crm' && cq.question.crm === true);
dormi = 0; cq = C({ action: 'claude_resultat', id: 'q3', attente: 15, etat: 'en_cours' });
check('Claude : Wilson attend au plus 15 s par appel', cq.ok && cq.etat === 'en_cours' && dormi >= 14000 && dormi <= 16000, dormi + ' ms');
C({ action: 'claude_rendre', secret: SECRET, id: 'q3', ok: false, erreur: 'Claude n\'a pas pu se connecter' });
cq = C({ action: 'claude_resultat', id: 'q3' });
check('Claude : erreur du relais transmise à Wilson', cq.ok && cq.etat === 'erreur' && /connecter/.test(cq.erreur));
check('Claude : l\'erreur aussi dans l\'historique, en haut', sheets['Claude'].data[1][8] === 'erreur' && /connecter/.test(sheets['Claude'].data[1][4]) && sheets['Claude'].data[2][8] === 'réponse');
cq = C({ action: 'claude_prendre', secret: SECRET, max: 0, occupe: 2 });
check('Claude : relais occupé → signe de vie seulement', cq.ok && cq.question === null && C({ action: 'claude_etat' }).pc.occupe === 2);
fauxTemps += 61000;
check('Claude : PC pas vu depuis plus d\'une minute → absent', C({ action: 'claude_etat' }).pc.vivant === false && C({ action: 'claude_etat' }).pc.vu >= 61);
check('Claude : question inconnue', C({ action: 'claude_resultat', id: 'zzz' }).ok === false && C({ action: 'claude_demander', id: '', question: 'x' }).ok === false);
check('Claude : verrou toujours rendu', locked === 0);
vm.runInContext('oublierPC()', ctx);
check('Claude : oublierPC efface le secret', !('claude_secret' in props));
}
console.log(`\n${ok}/${ok + ko} vérifications OK`);
process.exit(ko ? 1 : 0);
