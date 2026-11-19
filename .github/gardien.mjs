// Wilson — le gardien de la publication automatique (PLAN.md, section 11, S9 ; décisions de Timothée du 15/11/26 :
// « plus de clic mais un petit compte rendu de ce qui a été mis à jour », et du 19/11/26 : « je ne veux plus de merge du tout ;
// si tu vois quelque chose de bizarre tu m'en parles et me fais confirmer »).
// Depuis le 19/11/26, toute demande dont « Vérifier » est vert est fusionnée toute seule, à condition seulement :
//   - qu'elle vienne de ce dépôt (pas d'une copie), de son propriétaire, vers main, qu'elle soit ouverte et pas un brouillon.
// Ce qui demandait autrefois son Merge ne bloque plus, mais est signalé « à surveiller » (commentaire sur la demande, lu par
// Claude à chaque passage, qui en parle à Timothée et lui fait confirmer) :
//   - .github/ (ce gardien et les automatismes), pc/ (s'exécute sur le PC de la maison), apps-script/ (script avec la clé, le
//     CRM, la famille), android/, vendor/, les workers ;
//   - la politique de sécurité de la page (ligne Content-Security-Policy : le verrou réseau) ;
//   - une adresse Internet hors de la liste ci-dessous ; eval, new Function, document.write, script chargé depuis Internet ;
//   - plus de 2 000 lignes ajoutées, ou un fichier dont GitHub ne donne pas le détail.
// Ce fichier est lu depuis main (déclencheur workflow_run) : une demande ne peut pas le modifier pour se fusionner elle-même.

// Les « workers » (js/*-worker.js) et le service worker (sw.js) échappent au verrou réseau de la page : on les protège à part.
export const INTERDITS = [/^\.github\//, /^pc\//, /^apps-script\//, /^android\//, /^vendor\//, /^js\/.*worker\.js$/];
// Dans sw.js, une publication automatique ne peut changer que le numéro de version et la liste des fichiers mis en cache.
const SW_PERMIS = (l) => /^[+-]const VERSION = 'wilson-[0-9.]+';\s*$/.test(l) || /^[+-]\s*('[A-Za-z0-9_./-]+',?\s*)+(\];?)?\s*$/.test(l) || /^[+-]const SHELL = \[\s*$/.test(l);
// Fichiers servis aux appareils, dont on surveille les adresses et le code ajouté.
const APPLI = (f) => /^(js\/|css\/)/.test(f) || /\.html$/.test(f) || f === 'sw.js';
export const HOTES = [
  'generativelanguage.googleapis.com', 'aistudio.google.com', 'script.google.com', 'script.googleusercontent.com',
  'api.open-meteo.com', 'geocoding-api.open-meteo.com', 'all.api.radio-browser.info',
  'fr.wikipedia.org', 'commons.wikimedia.org', 'upload.wikimedia.org',
  'www.google.com', 'waze.com', 'www.netflix.com', 'www.youtube.com', 'app.primevideo.com', 'www.france.tv',
  'timduneau-hue.github.io', 'github.com', 'www.w3.org',
];
const hoteOk = (h) => HOTES.includes(h) || /\.ts\.net$/.test(h) || /^homeassistant\.?$/.test(h) || /\.api\.radio-browser\.info$/.test(h);
const DANGER = [[/\beval\s*\(/, 'eval('], [/new\s+Function\s*\(/, 'new Function('], [/document\.write\s*\(/, 'document.write('],
  [/importScripts\s*\(\s*['"`]https?:/, 'script chargé depuis Internet'], [/new\s+(Shared)?Worker\s*\(/, 'nouveau worker'],
  [/\.addModule\s*\(/, 'nouveau worklet'], [/serviceWorker\.register\s*\(/, 'service worker enregistré'], [/<script[^>]+src\s*=\s*['"]?https?:/i, 'script chargé depuis Internet']];
export const MAX_AJOUTS = 2000;

// pr : réponse de GET /pulls/{n} ; fichiers : réponse de GET /pulls/{n}/files ; depot : « propriétaire/nom ».
// Ce qui empêche la fusion automatique (seulement l'origine de la demande, 19/11/26).
export function examiner(pr, fichiers, depot) {
  const refus = [];
  const proprio = depot.split('/')[0];
  if (!pr.head || !pr.head.repo || pr.head.repo.full_name !== depot) refus.push('la demande ne vient pas de ce dépôt');
  if (!pr.user || pr.user.login !== proprio) refus.push(`la demande n'a pas été ouverte par ${proprio}`);
  if (!pr.base || pr.base.ref !== 'main') refus.push('la demande ne vise pas main');
  if (pr.draft) refus.push('la demande est un brouillon');
  if (pr.state !== 'open') refus.push('la demande est fermée');
  if (!fichiers.length) refus.push('aucun fichier modifié');
  return refus;
}

// Ce qui est publié quand même mais signalé « à surveiller » (autrefois : Merge de Timothée obligatoire).
export function aSurveiller(fichiers) {
  const alertes = [];
  if (fichiers.length >= 300) alertes.push('beaucoup de fichiers (300 ou plus)');
  let ajouts = 0;
  for (const f of fichiers) {
    const noms = [f.filename, f.previous_filename].filter(Boolean);
    for (const n of noms) if (INTERDITS.some((re) => re.test(n))) alertes.push(`${n} : zone sensible`);
    ajouts += f.additions || 0;
    // Une nouvelle page n'aurait pas le verrou réseau d'index.html.
    if (/\.html?$/.test(f.filename) && (f.status === 'added' || f.status === 'renamed' || f.status === 'copied')) alertes.push(`${f.filename} : nouvelle page`);
    if (!noms.some(APPLI) && !/^tests\//.test(f.filename)) continue;
    if (f.patch == null) { if (noms.some(APPLI)) alertes.push(`${f.filename} : détail du changement indisponible`); continue; }
    const lignes = f.patch.split('\n');
    if (f.filename === 'sw.js' && lignes.some((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l) && !SW_PERMIS(l))) alertes.push('sw.js : autre chose que la version ou la liste des fichiers');
    if (lignes.some((l) => /^[+-]/.test(l) && /Content-Security-Policy/i.test(l))) alertes.push(`${f.filename} : verrou réseau (Content-Security-Policy) modifié`);
    if (!noms.some(APPLI)) continue;
    for (const l of lignes.filter((x) => x.startsWith('+') && !x.startsWith('+++'))) {
      for (const m of l.matchAll(/\b(?:https?|wss?):\/\/([a-z0-9.-]+)/gi)) {
        const h = m[1].toLowerCase().replace(/\.$/, '');
        if (!hoteOk(h)) alertes.push(`${f.filename} : nouvelle adresse Internet ${h}`);
      }
      for (const [re, nom] of DANGER) if (re.test(l)) alertes.push(`${f.filename} : ${nom} ajouté`);
    }
  }
  if (ajouts > MAX_AJOUTS) alertes.push(`${ajouts} lignes ajoutées (plus de ${MAX_AJOUTS})`);
  return [...new Set(alertes)];
}

// Lancé par .github/workflows/publication.yml (variables : GH_TOKEN, DEPOT, SHA, BRANCHE). Écrit ok=1 et pr=… dans GITHUB_OUTPUT.
async function principal() {
  const fs = await import('node:fs');
  const { GH_TOKEN, DEPOT, SHA, BRANCHE, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY } = process.env;
  const api = async (chemin, o = {}) => {
    const r = await fetch('https://api.github.com/repos/' + DEPOT + chemin, { ...o, headers: { Authorization: 'Bearer ' + GH_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(o.headers || {}) } });
    if (!r.ok) throw new Error(`GitHub ${r.status} sur ${chemin}`);
    return r.json();
  };
  const sortie = (k, v) => GITHUB_OUTPUT && fs.appendFileSync(GITHUB_OUTPUT, `${k}=${v}\n`);
  const resume = (t) => GITHUB_STEP_SUMMARY && fs.appendFileSync(GITHUB_STEP_SUMMARY, t + '\n');
  const proprio = DEPOT.split('/')[0];
  const liste = await api(`/pulls?state=open&head=${encodeURIComponent(proprio + ':' + BRANCHE)}&per_page=10`);
  const pr0 = liste.find((p) => p.head.sha === SHA);
  if (!pr0) { resume(`Aucune demande ouverte pour ${BRANCHE} à la version vérifiée : rien à publier.`); sortie('ok', '0'); return; }
  const pr = await api(`/pulls/${pr0.number}`);
  let fichiers = [];
  for (let page = 1; page <= 4; page++) { const p = await api(`/pulls/${pr.number}/files?per_page=100&page=${page}`); fichiers = fichiers.concat(p); if (p.length < 100) break; }
  const refus = pr.head.sha === SHA ? examiner(pr, fichiers, DEPOT) : ['la demande a changé depuis la vérification'];
  sortie('pr', String(pr.number));
  const commenter = async (texte) => {
    const deja = await api(`/issues/${pr.number}/comments?per_page=100`).catch(() => []);
    if (!deja.some((c) => c.body === texte)) await api(`/issues/${pr.number}/comments`, { method: 'POST', body: JSON.stringify({ body: texte }) }).catch(() => {});
  };
  if (!refus.length) {
    const alertes = aSurveiller(fichiers);
    resume(`Demande n°${pr.number} : publication automatique${alertes.length ? ' (à surveiller : ' + alertes.join(' ; ') + ')' : ''}.`); sortie('ok', '1');
    if (alertes.length) await commenter(`⚠️ **À surveiller** (publiée automatiquement, plus de Merge depuis le 19/11/26 : Claude en parle à Timothée et lui fait confirmer) :\n\n${alertes.map((x) => '- ' + x).join('\n')}`);
    return;
  }
  const texte = `🛡️ **Pas de publication automatique** pour cette demande :\n\n${refus.map((x) => '- ' + x).join('\n')}`;
  resume(texte); sortie('ok', '0');
  await commenter(texte);
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) principal().catch((e) => { console.error(e.message); process.exit(1); });
