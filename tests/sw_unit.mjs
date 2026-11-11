// Service worker (sw.js, W14 : retour arrière automatique) et script de version (pc/version.mjs, W17), sans navigateur : `node sw_unit.mjs`
import vm from 'node:vm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifier, appliquer, lire, listeShell } from '../pc/version.mjs';

const ici = path.dirname(fileURLToPath(import.meta.url)), racine = path.join(ici, '..');
let ok = 0, ko = 0;
const check = (n, c, d = '') => { c ? ok++ : ko++; console.log(c ? '✅' : '❌', n, d); };

// ---------- Faux navigateur ----------
class Res { constructor(corps = '', o = {}) { this.corps = corps; this.ok = o.ok !== false; this.tag = o.tag || ''; } clone() { return new Res(this.corps, { ok: this.ok, tag: this.tag }); } async json() { return JSON.parse(this.corps); } }
class Req { constructor(u, o = {}) { this.url = typeof u === 'string' ? new URL(u, 'https://w.test/').href : u.url; this.method = (u && u.method) || 'GET'; this.mode = o.mode || (u && u.mode) || 'cors'; } }
function monde(versionSw, anciens) {
  const stock = new Map(), timers = [], ecouteurs = {}, naviguees = [];
  const cle = (r) => (typeof r === 'string' ? new URL(r, 'https://w.test/').href : r.url);
  const cache = (nom) => { if (!stock.has(nom)) stock.set(nom, new Map()); const m = stock.get(nom);
    return { put: async (r, res) => { m.set(cle(r), res); }, match: async (r, o = {}) => m.get(cle(r)) || (o.ignoreSearch ? [...m].find(([k]) => k.split('?')[0] === cle(r).split('?')[0])?.[1] : undefined), addAll: async (rs) => { for (const r of rs) m.set(cle(r), new Res('neuf ' + versionSw + ' ' + cle(r))); } }; };
  const caches = { open: async (n) => cache(n), keys: async () => [...stock.keys()], has: async (n) => stock.has(n), delete: async (n) => stock.delete(n) };
  for (const v of anciens) { const c = cache(v); c.put('index.html', new Res('ancienne page ' + v)); c.put('version.json', new Res('{"version":"' + v + '"}')); }
  const clients = { claim: async () => {}, matchAll: async () => [{ url: 'https://w.test/', navigate: async (u) => { naviguees.push(u); } }] };
  const self = { addEventListener: (t, f) => { ecouteurs[t] = f; }, skipWaiting: async () => {}, clients, location: { origin: 'https://w.test' } };
  const ctx = vm.createContext({ self, caches, Request: Req, Response: Res, URL, JSON, Promise, Date, console, location: self.location,
    fetch: async (r) => new Res('réseau ' + cle(r)), setTimeout: (f, ms) => { const t = { f, ms }; timers.push(t); return t; }, clearTimeout: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); } });
  vm.runInContext(fs.readFileSync(path.join(racine, 'sw.js'), 'utf8').replace(/^const VERSION = '[^']+';/m, `const VERSION = '${versionSw}';`), ctx);
  const attendre = []; const evt = (extra) => ({ waitUntil: (p) => { attendre.push(p); }, ...extra });
  const api = {
    stock, timers, naviguees,
    semer: (o) => { if (!stock.has('wilson-etat')) stock.set('wilson-etat', new Map()); stock.get('wilson-etat').set(cle('etat'), new Res(JSON.stringify(o))); },
    installer: async () => { const e = evt({}); ecouteurs.install(e); await Promise.all(attendre.splice(0)); },
    activer: async () => { const e = evt({}); ecouteurs.activate(e); await Promise.all(attendre.splice(0)); },
    demander: async (url, mode = 'navigate') => { let rep; const e = evt({ request: new Req(url, { mode }), respondWith: (p) => { rep = p; } }); ecouteurs.fetch(e); const r = await rep; await new Promise((res) => setImmediate(res)); return { r, attente: attendre.splice(0) }; },
    message: async (data) => { const recus = []; const e = evt({ data, source: { postMessage: (m) => recus.push(m) } }); ecouteurs.message(e); await Promise.all(attendre.splice(0)); return recus; },
    etat: async () => JSON.parse((await caches.open('wilson-etat').then((c) => c.match('etat'))).corps),
  };
  return api;
}

// ---------- Une version qui s'installe : l'ancienne est gardée, les plus vieilles disparaissent ----------
{
  const w = monde('wilson-1.39.0', ['wilson-1.37.0', 'wilson-1.38.3', 'wilson-lourd-v2']);
  await w.installer(); await w.activer();
  const e = await w.etat(), noms = [...w.stock.keys()].sort();
  check('W14 : nouvelle version → à l\'essai, avec la précédente gardée', e.statut === 'essai' && e.version === 'wilson-1.39.0' && e.precedente === 'wilson-1.38.3', JSON.stringify(e));
  check('W14 : seules la courante, la précédente, le cache lourd et l\'état restent', noms.join() === ['wilson-1.38.3', 'wilson-1.39.0', 'wilson-etat', 'wilson-lourd-v2'].join(), noms.join());

  // La page ne dit jamais « prête » : après 20 s, retour à la précédente.
  const nav = await w.demander('https://w.test/');
  check('W14 : version à l\'essai → la page vient du réseau, un compte à rebours de 20 s démarre', /réseau/.test(nav.r.corps) && w.timers.length === 1 && w.timers[0].ms === 20000 && nav.attente.length === 1);
  w.timers[0].f(); await Promise.all(nav.attente);
  const e2 = await w.etat();
  check('W14 : pas « prête » à temps → retour arrière noté (version abandonnée, raison)', e2.statut === 'retour' && e2.echec === 'wilson-1.39.0' && /prête/.test(e2.raison), JSON.stringify(e2));
  check('W14 : les pages ouvertes sont rechargées', w.naviguees.length === 1);
  const idx = await w.demander('https://w.test/index.html', 'navigate');
  check('W14 : en retour, l\'appli est servie par la version précédente', /ancienne page wilson-1.38.3/.test(idx.r.corps), idx.r.corps);
  const vj = await w.demander('https://w.test/version.json?t=5', 'cors');
  check('W14 : version.json aussi (pas de rechargement en boucle)', /1\.38\.3/.test(vj.r.corps), vj.r.corps);
  const rep = await w.message({ type: 'etat' });
  check('W14 : la page apprend le retour arrière, une seule fois', rep[0].etat.statut === 'retour' && rep[0].etat.echec === 'wilson-1.39.0' && rep[0].etat.signale === undefined && (await w.etat()).signale === true);
  await w.message({ type: 'prete', version: '1.38.3' });
  check('W14 : « prête » de l\'ancienne page ne change rien au mode retour', (await w.etat()).statut === 'retour');
}

// ---------- La page dit « prête » à temps ----------
{
  const w = monde('wilson-1.39.0', ['wilson-1.38.3']);
  await w.installer(); await w.activer();
  const nav = await w.demander('https://w.test/');
  await w.message({ type: 'prete', version: '1.39.0' });
  await Promise.all(nav.attente);
  const e = await w.etat();
  check('W14 : « prête » à temps → version confirmée, plus de compte à rebours', e.statut === 'ok' && e.bonne === 'wilson-1.39.0' && w.timers.length === 0 && w.naviguees.length === 0, JSON.stringify(e));
  await w.demander('https://w.test/');
  check('W14 : version confirmée → plus de surveillance', w.timers.length === 0);
}
{
  const w = monde('wilson-1.39.0', ['wilson-1.38.3']);
  await w.installer(); await w.activer();
  await w.message({ type: 'prete', version: '1.38.3' });
  check('W14 : « prête » venant d\'une autre version ne confirme pas la nouvelle', (await w.etat()).statut === 'essai');
  const r = await w.message({ type: 'retour', raison: 'demandé dans les réglages' });
  check('W14 : retour demandé à la main (réglages) → on sert la précédente', r[0].fait === true && (await w.etat()).statut === 'retour' && /ancienne page/.test((await w.demander('https://w.test/index.html')).r.corps));
}

// ---------- Premier lancement : rien à quoi revenir ----------
{
  const w = monde('wilson-1.39.0', []);
  await w.installer(); await w.activer();
  const e = await w.etat(); const nav = await w.demander('https://w.test/');
  check('W14 : toute première installation → pas d\'essai ni de retour possible', e.statut === 'ok' && e.precedente === null && w.timers.length === 0 && nav.attente.length === 0);
  const r = await w.message({ type: 'retour' });
  check('W14 : retour demandé sans version précédente → refusé', r[0].fait === false);
}

// ---------- La suivante : on revient à la dernière version CONFIRMÉE, pas à celle qui a échoué ----------
{
  const w = monde('wilson-1.39.1', ['wilson-1.38.3', 'wilson-1.39.0']);
  w.semer({ statut: 'retour', version: 'wilson-1.39.0', precedente: 'wilson-1.38.3', echec: 'wilson-1.39.0', bonne: 'wilson-1.38.3' });
  await w.installer(); await w.activer();
  const e = await w.etat();
  check('W14 : nouvelle publication après un retour → précédente = la dernière version confirmée', e.statut === 'essai' && e.precedente === 'wilson-1.38.3' && !w.stock.has('wilson-1.39.0'), JSON.stringify(e));
}

// ---------- W17 : une seule version, une liste SHELL toujours complète ----------
check('W17 : app.js, sw.js et version.json à la même version, liste SHELL à jour (dépôt)', verifier(racine).length === 0, verifier(racine).join(' | '));
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wilson-version-'));
  for (const f of ['js/app.js', 'sw.js', 'version.json', 'index.html', 'manifest.webmanifest', 'visages.html', 'css/wilson.css', 'vendor/qrcode/qrcode.js', 'icons/icon-192.png', 'icons/icon-512.png', ...listeShell(racine).filter((x) => x.startsWith('js/'))]) {
    fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true });
    fs.writeFileSync(path.join(tmp, f), f === 'js/app.js' || f === 'sw.js' || f === 'version.json' ? fs.readFileSync(path.join(racine, f)) : 'x');
  }
  const e = appliquer({ version: '9.8.7', nouveautes: 'Essai.', date: '01/02/27', racine: tmp });
  check('W17 : un geste met à jour app.js, sw.js et version.json', e.app === '9.8.7' && e.sw === '9.8.7' && e.json === '9.8.7' && /Essai\./.test(fs.readFileSync(path.join(tmp, 'version.json'), 'utf8')) && /01\/02\/27/.test(fs.readFileSync(path.join(tmp, 'version.json'), 'utf8')) && verifier(tmp).length === 0);
  fs.writeFileSync(path.join(tmp, 'js/nouveau.js'), 'x');
  check('W17 : un fichier ajouté est détecté (SHELL périmée), puis ajouté à la liste', verifier(tmp).length === 1 && appliquer({ racine: tmp }) && verifier(tmp).length === 0 && /js\/nouveau\.js/.test(fs.readFileSync(path.join(tmp, 'sw.js'), 'utf8')));
  let refus = false; try { appliquer({ version: 'abc', racine: tmp }); } catch (_) { refus = true; }
  check('W17 : numéro de version mal écrit refusé', refus);
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${ok}/${ok + ko} vérifications OK`);
process.exit(ko ? 1 : 0);
