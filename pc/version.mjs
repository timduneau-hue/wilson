// Wilson — un seul geste pour changer de version (lot 4, W17). Node 18 ou plus, sans bibliothèque.
//   node pc/version.mjs 1.38.4 "Une phrase : ce qui a changé"   → js/app.js, sw.js et version.json à jour, liste SHELL regénérée
//   node pc/version.mjs                                         → regénère seulement la liste SHELL de sw.js (fichier ajouté ou retiré)
//   node pc/version.mjs --verifier                              → ne modifie rien ; code 1 si les trois versions diffèrent ou si SHELL est périmée
// SHELL = ce que le service worker met en cache à l'installation : toute l'appli. Un fichier oublié ne marche plus hors ligne.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Fichiers de l'appli qui ne se trouvent pas par motif (le reste : css/*.css et js/**/*.js, pris sur le disque).
const FIXES_DEBUT = ['./', 'index.html', 'manifest.webmanifest', 'version.json'];
const FIXES_FIN = ['vendor/qrcode/qrcode.js', 'visages.html', 'icons/icon-192.png', 'icons/icon-512.png'];

const lister = (racine, dossier) => {
  const d = path.join(racine, dossier); if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? lister(racine, `${dossier}/${e.name}`) : [`${dossier}/${e.name}`]).sort();
};

// La liste SHELL attendue d'après les fichiers présents.
export function listeShell(racine = RACINE) {
  const css = lister(racine, 'css').filter((f) => f.endsWith('.css'));
  const js = lister(racine, 'js').filter((f) => f.endsWith('.js'));
  const haut = js.filter((f) => f.split('/').length === 2), bas = js.filter((f) => f.split('/').length > 2);
  const liste = [...FIXES_DEBUT, ...css, ...haut, ...FIXES_FIN.slice(0, 1), ...bas, ...FIXES_FIN.slice(1)];
  for (const f of liste) if (f !== './' && !fs.existsSync(path.join(racine, f))) throw new Error(`fichier de la liste SHELL introuvable : ${f}`);
  return liste;
}
const q = (a) => a.map((x) => `'${x}'`).join(', ');
export function texteShell(liste) {
  const dbut = liste.slice(0, FIXES_DEBUT.length + liste.filter((f) => f.startsWith('css/')).length);
  const reste = liste.slice(dbut.length);
  const haut = reste.filter((f) => /^js\/[^/]+$/.test(f) || f === 'vendor/qrcode/qrcode.js');
  const bas = reste.filter((f) => !haut.includes(f));
  return `const SHELL = [\n  ${q(dbut)},\n  ${q(haut)},\n  ${q(bas)},\n];`;
}
const RE_SHELL = /const SHELL = \[[\s\S]*?\n\];/;

// Ce que contiennent les trois fichiers.
export function lire(racine = RACINE) {
  const app = fs.readFileSync(path.join(racine, 'js/app.js'), 'utf8'), sw = fs.readFileSync(path.join(racine, 'sw.js'), 'utf8');
  const j = JSON.parse(fs.readFileSync(path.join(racine, 'version.json'), 'utf8'));
  const va = /^const VERSION = '([^']+)';/m.exec(app), vs = /^const VERSION = 'wilson-([^']+)';/m.exec(sw);
  const m = RE_SHELL.exec(sw);
  return { app: va && va[1], sw: vs && vs[1], json: j.version, shellActuelle: m ? m[0] : '', shellAttendue: texteShell(listeShell(racine)) };
}
export function verifier(racine = RACINE) {
  const e = lire(racine), pb = [];
  if (!(e.app && e.app === e.sw && e.sw === e.json)) pb.push(`versions différentes : app.js ${e.app}, sw.js ${e.sw}, version.json ${e.json}`);
  if (e.shellActuelle !== e.shellAttendue) pb.push('la liste SHELL de sw.js n\'est pas à jour (lancer : node pc/version.mjs)');
  return pb;
}

export function appliquer({ version, nouveautes, date, racine = RACINE } = {}) {
  const pa = path.join(racine, 'js/app.js'), ps = path.join(racine, 'sw.js'), pj = path.join(racine, 'version.json');
  let sw = fs.readFileSync(ps, 'utf8');
  sw = sw.replace(RE_SHELL, texteShell(listeShell(racine)));
  if (version) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`numéro de version attendu : 1.2.3 (reçu « ${version} »)`);
    const app = fs.readFileSync(pa, 'utf8');
    if (!/^const VERSION = '[^']+';/m.test(app) || !/^const VERSION = 'wilson-[^']+';/m.test(sw)) throw new Error('ligne « const VERSION » introuvable dans app.js ou sw.js');
    fs.writeFileSync(pa, app.replace(/^const VERSION = '[^']+';/m, `const VERSION = '${version}';`));
    sw = sw.replace(/^const VERSION = 'wilson-[^']+';/m, `const VERSION = 'wilson-${version}';`);
    const j = JSON.parse(fs.readFileSync(pj, 'utf8'));
    const d = new Date(), dd = date || `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
    const neuf = { version, date: dd, nouveautes: nouveautes || j.nouveautes };
    fs.writeFileSync(pj, JSON.stringify(neuf) + '\n');
  }
  fs.writeFileSync(ps, sw);
  return lire(racine);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    if (args.includes('--verifier')) {
      const pb = verifier();
      if (pb.length) { console.error(pb.map((x) => '✗ ' + x).join('\n')); process.exit(1); }
      console.log('✓ app.js, sw.js et version.json sont à la même version ; la liste SHELL est à jour');
    } else {
      const [version, nouveautes] = args[0] && /^\d/.test(args[0]) ? args : [];
      if (version && !nouveautes) console.log('Pas de phrase « nouveautés » donnée : l\'ancienne est gardée dans version.json (à réécrire : Wilson la dit une fois).');
      const e = appliquer({ version, nouveautes });
      console.log(`✓ version ${e.app} (app.js, sw.js, version.json) ; liste SHELL de sw.js : ${(e.shellAttendue.match(/'/g) || []).length / 2} fichiers`);
    }
  } catch (e) { console.error('✗ ' + e.message); process.exit(1); }
}
