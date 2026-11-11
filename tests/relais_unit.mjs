// Relais Claude du PC (pc/relais.mjs) et accès CRM en lecture seule (pc/crm-mcp.mjs), sans réseau ni Claude : `node relais_unit.mjs`
import { PassThrough } from 'node:stream';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decouper, demande, argumentsClaude, Relais, limiteAtteinte, repriseLimite, effortPour, commandeArret, arreterArbre, GardeHA, HA_ACTION_MS } from '../pc/relais.mjs';
import { OUTILS, appeler, serveur } from '../pc/crm-mcp.mjs';

let ok = 0, ko = 0;
const check = (n, c, d = '') => { c ? ok++ : ko++; console.log(c ? '✅' : '❌', n, d); };

// ---------- Découpage de la réponse ----------
let r = decouper("À DIRE :\nLa Tectus TE 340 3D porte 80 kilos, d'après la fiche Simonswerk.\n\nDÉTAIL :\n- Charge : 80 kg (2 paumelles)\n- Source : https://www.simonswerk.fr/tectus");
check('Découpage : à dire / détail', r.dire === "La Tectus TE 340 3D porte 80 kilos, d'après la fiche Simonswerk." && /80 kg/.test(r.detail) && /simonswerk\.fr/.test(r.detail), JSON.stringify(r));
r = decouper('**À DIRE :**\n**Je n\'ai pas trouvé** la fiche, voir https://x.fr/a\n- point\n**DÉTAIL :**\nrien');
check('Découpage : gras, liens et puces retirés de ce qui est dit', r.dire === "Je n'ai pas trouvé la fiche, voir point" && r.detail === 'rien', JSON.stringify(r));
r = decouper('Réponse sans les marques demandées.');
check('Découpage : sans marques → tout est à dire', r.dire === 'Réponse sans les marques demandées.' && r.detail === '');

// ---------- La demande ----------
const d = demande({ type: 'crm', voiture: true, question: 'qui n\'a pas commandé de serrures depuis mars ?', contexte: 'Dernier client : AD2M', regles: '- Ne devine jamais' }, new Date(2026, 10, 6, 8, 5));
check('Demande : date, type, voiture, question, contexte, règles', /vendredi 06\/11\/26 08h05/.test(d) && /CRM/.test(d) && /en voiture : oui/.test(d) && /serrures depuis mars/.test(d) && /AD2M/.test(d) && /Ne devine jamais/.test(d), d);

// ---------- Les droits de Claude ----------
const a = argumentsClaude({ mcp: 'C:\\W\\mcp.json', consigne: 'C:\\W\\consigne.md' });
const val = (f) => a[a.indexOf(f) + 1];
check('Claude : impression seule, JSON, Sonnet, effort élevé', a[0] === '-p' && val('--output-format') === 'json' && val('--model') === 'sonnet' && val('--effort') === 'high');
check('Claude : outils limités à la recherche et à la lecture de pages', val('--tools') === 'WebSearch,WebFetch' && !/Bash|Write|Edit|PowerShell/.test(val('--tools')));
check('Claude : seul le CRM en lecture seule en plus, le reste refusé', val('--allowedTools') === 'WebSearch,WebFetch,mcp__crm' && val('--permission-mode') === 'dontAsk' && a.includes('--strict-mcp-config') && a.includes('--no-session-persistence'));

// Pas Timothée (Camille à la tablette, un visage inconnu) : Claude n'a que la recherche, pas le CRM (règle du 06/11/26).
const a2 = argumentsClaude({ mcp: 'C:\\W\\mcp.json', consigne: 'C:\\W\\consigne.md', crm: false });
check('Claude sans le CRM : ni outil CRM ni configuration MCP', a2[a2.indexOf('--allowedTools') + 1] === 'WebSearch,WebFetch' && !a2.includes('--mcp-config') && a2.includes('--strict-mcp-config') && !a2.some((x) => /mcp\.json|mcp__crm/.test(x)));
const d2 = demande({ type: 'internet', crm: false, question: 'Compare deux perceuses' }, new Date(2026, 10, 6, 8, 5));
check('Demande sans le CRM : Claude sait que ce n\'est pas Timothée', /pas Timothée qui demande/.test(d2) && !/pas Timothée/.test(demande({ type: 'internet', crm: true, question: 'x' })));

// ---------- Le relais avec un faux script et un faux Claude ----------
const envoyes = [];
let fileQ = [{ id: 'q1', type: 'internet', question: 'Compare deux paumelles', voiture: true }];
const fauxFetch = async (url, o) => {
  const b = JSON.parse(o.body); envoyes.push(b);
  const rep = (x) => ({ status: 200, text: async () => (typeof x === 'string' ? x : JSON.stringify(x)) });
  if (!b.action) return rep('ok');
  if (b.action === 'claude_prendre') return rep({ ok: true, question: b.max === 0 ? null : fileQ.shift() || null });
  if (b.action === 'claude_rendre') return rep({ ok: true, etat: b.ok === false ? 'erreur' : 'faite' });
  return rep({ ok: false, erreur: 'action inconnue' });
};
const logs = [];
const R = new Relais({ config: { script: 'https://script.google.com/macros/s/TEST/exec', secret: 'x'.repeat(40) }, fetchImpl: fauxFetch, log: (m) => logs.push(m),
  lancer: async (q) => (q.question === 'plante' ? Promise.reject(new Error('Claude n\'a pas fini en 4 min')) : { dire: 'La première porte 80 kilos, la seconde 120.', detail: 'Sources…', etapes: 7 }) });
await R.traiter(fileQ.shift());
const rendu = envoyes.find((x) => x.action === 'claude_rendre');
check('Relais : réponse rendue avec le secret, l\'id, ce qu\'il faut dire et la durée', rendu && rendu.secret === 'x'.repeat(40) && rendu.id === 'q1' && rendu.ok === true && /120/.test(rendu.dire) && rendu.etapes === 7 && typeof rendu.duree === 'number', JSON.stringify(rendu));
const j = envoyes.find((x) => !x.action);
check('Relais : question et réponse écrites dans le journal de Wilson', j && j.version === 'relais 7 · PC' && j.lignes.some((l) => /question reçue \(internet, en voiture\)/.test(l.m)) && j.lignes.some((l) => /réponse en \d+ s \(7 étape/.test(l.m)), JSON.stringify(j && j.lignes));
check('Relais : plus rien en cours', R.enCours === 0);
envoyes.length = 0;
await R.traiter({ id: 'q2', type: 'internet', question: 'plante' });
const rendu2 = envoyes.find((x) => x.action === 'claude_rendre');
check('Relais : Claude en échec → erreur rendue à Wilson (jamais de silence)', rendu2 && rendu2.ok === false && /4 min/.test(rendu2.erreur), JSON.stringify(rendu2));

// Limite d'utilisation de l'abonnement (journal du 10/11/26, 08h47:23) : une erreur, plus une « réponse ».
check('Limite : « You\'ve hit your weekly limit · resets 4am (Europe/Paris) » reconnue', limiteAtteinte("You've hit your weekly limit · resets 4am (Europe/Paris)") && !limiteAtteinte('La première porte 80 kilos, la seconde 120.'));
{
  const bin = path.join(os.tmpdir(), 'faux-claude-' + process.pid + (process.platform === 'win32' ? '.cmd' : ''));
  fs.writeFileSync(bin, '#!/bin/sh\ncat > /dev/null\necho \'{"type":"result","is_error":true,"result":"You\\u0027ve hit your weekly limit · resets 4am (Europe/Paris)","num_turns":1}\'\n', { mode: 0o755 });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relais-'));
  fs.writeFileSync(path.join(dir, 'consigne.md'), 'consigne'); fs.writeFileSync(path.join(dir, 'mcp.json'), '{}');
  const R3 = new Relais({ config: { script: 'S', secret: 'x'.repeat(40), claude: bin }, dir, fetchImpl: fauxFetch, log: () => {} });
  let err = null; try { await R3._claude({ id: 'q9', type: 'crm', question: 'Combien de clients actifs ?' }); } catch (e) { err = e; }
  check('Limite : le relais la rend comme une ERREUR (« limite d\'utilisation de Claude atteinte »), pas comme une réponse', err && /limite d'utilisation de Claude atteinte/.test(err.message) && /resets 4am/.test(err.message), err ? err.message : 'pas d\'erreur');
  fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(bin, { force: true });
}

// Une boucle : prend la question en attente puis s'arrête.
envoyes.length = 0; fileQ = [{ id: 'q3', type: 'crm', question: 'Mon CA du mois ?' }];
R.stop = false;
const tours = (async () => { await new Promise((res) => setTimeout(res, 50)); R.stop = true; })();
await Promise.race([R.boucle(), new Promise((res) => setTimeout(res, 300))]); await tours;
await new Promise((res) => setTimeout(res, 50));
const pris = envoyes.find((x) => x.action === 'claude_prendre');
check('Relais : attend une question 25 s, avec son secret et sa version', pris && pris.attente === 25 && pris.secret === 'x'.repeat(40) && pris.version === 'relais 7');
check('Relais : la question prise est traitée', envoyes.some((x) => x.action === 'claude_rendre' && x.id === 'q3'));

// ---------- Lot 4 : arrêt de tout l'arbre (W15), limite signalée au script (W16), effort réduit (W16) ----------
{
  const c = commandeArret(4242, 'win32');
  check('W15 : Windows → taskkill /T /F sur tout l’arbre de processus', c && c[0] === 'taskkill' && c[1].join(' ') === '/pid 4242 /T /F', JSON.stringify(c));
  check('W15 : ailleurs → pas de taskkill (groupe de processus)', commandeArret(4242, 'linux') === null);
  let lance = null, tue = null;
  arreterArbre({ pid: 77, kill: () => {} }, { plateforme: 'win32', executer: (cmd, a) => { lance = [cmd, a]; }, tuer: () => {} });
  arreterArbre({ pid: 88, kill: () => {} }, { plateforme: 'linux', executer: () => {}, tuer: (pid, sig) => { tue = [pid, sig]; } });
  check('W15 : arrêt effectif (taskkill sous Windows, kill du groupe ailleurs)', lance && lance[1].includes('77') && tue && tue[0] === -88 && tue[1] === 'SIGKILL');
  let simple = false; arreterArbre({ pid: 99, kill: () => { simple = true; } }, { plateforme: 'linux', executer: () => {}, tuer: () => { throw new Error('ESRCH'); } });
  check('W15 : si l’arrêt du groupe échoue, repli sur kill simple', simple);
  const t4 = new Date(2026, 10, 11, 20, 0);
  check('W16 : reprise « resets 4am » → 4 h le lendemain', new Date(repriseLimite("You've hit your weekly limit · resets 4am (Europe/Paris)", t4)).getHours() === 4 && repriseLimite('resets 4am', t4) > t4.getTime());
  check('W16 : sans heure annoncée → dans une heure', repriseLimite('limit reached', t4) === t4.getTime() + 3600000);
  check('W16 : effort « medium » pour une question CRM courte et simple', effortPour({ type: 'crm', question: 'Combien de clients actifs ?' }) === 'medium');
  check('W16 : effort « high » pour une question CRM d’analyse, une recherche Internet ou une question longue', effortPour({ type: 'crm', question: 'Compare mon CA par famille avec l’an dernier' }) === 'high' && effortPour({ type: 'internet', question: 'Charge max Tectus TE 340 ?' }) === 'high' && effortPour({ type: 'crm', question: 'x'.repeat(200) }) === 'high');
  check('W16 : « effort » écrit dans config.json l’emporte', effortPour({ type: 'crm', question: 'Combien ?' }, 'xhigh') === 'xhigh');

  // Limite atteinte : signalée au script à l'appel suivant, et les questions suivantes ne lancent plus Claude.
  const env2 = []; let lances = 0;
  const R4 = new Relais({ config: { script: 'S', secret: 'x'.repeat(40) }, log: () => {},
    fetchImpl: async (u, o) => { const b = JSON.parse(o.body); env2.push(b); return { status: 200, text: async () => JSON.stringify({ ok: true }) }; },
    lancer: async () => { lances++; throw new Error("limite d'utilisation de Claude atteinte : You've hit your weekly limit · resets 4am (Europe/Paris)"); } });
  await R4.traiter({ id: 'l1', type: 'crm', question: 'Combien ?' });
  const lim = R4.limiteActive();
  check('W16 : limite atteinte → heure de reprise retenue', lim && lim.jusqua > Date.now() && /weekly limit/.test(lim.texte), JSON.stringify(lim));
  await R4.traiter({ id: 'l2', type: 'crm', question: 'Encore ?' });
  const r2 = env2.filter((x) => x.action === 'claude_rendre').pop();
  check('W16 : question suivante pendant la limite → refusée tout de suite, Claude pas relancé', lances === 1 && r2.id === 'l2' && r2.ok === false && /limite d'utilisation de Claude atteinte/.test(r2.erreur), JSON.stringify(r2));
  R4.limite = { jusqua: Date.now() - 1, texte: 'vieille' };
  check('W16 : limite dépassée → plus signalée', R4.limiteActive() === null);
}
// W15 : appels vides à la suite → la pause double (2 s, 4 s…), elle n'est jamais nulle.
{
  const pris2 = []; let n = 0;
  const R5 = new Relais({ config: { script: 'S', secret: 'x'.repeat(40) }, log: () => {},
    fetchImpl: async (u, o) => { const b = JSON.parse(o.body); if (b.action === 'claude_prendre') { pris2.push({ t: Date.now(), limite: b.limite }); if (++n >= 3) R5.stop = true; } return { status: 200, text: async () => JSON.stringify({ ok: true, question: null }) }; } });
  R5.limite = { jusqua: Date.now() + 3600000, texte: 'x' };
  const t0 = Date.now(); await R5.boucle();
  check('W15 : trois appels vides rapides → pauses croissantes (≥ 2 s puis ≥ 4 s)', pris2.length === 3 && pris2[1].t - pris2[0].t >= 1900 && pris2[2].t - pris2[1].t >= 3900, pris2.map((x) => x.t - t0).join(','));
  check('W16 : la limite en cours est envoyée au script à chaque appel', pris2.every((x) => x.limite && x.limite.texte === 'x'));
}

// ---------- Home Assistant surveillé par le relais (11/11/26 : machine virtuelle sans adresse du 07/11 au 11/11) ----------
{
  let t = 1e9, haOk = false, enRoute = true; const cmds = [], notes = [];
  const G = new GardeHA({ cfg: {}, vbox: 'VBoxManage', pauseMs: 0, maintenant: () => t, journal: (m) => notes.push(m),
    fetchImpl: async () => { if (!haOk) throw new TypeError('fetch failed'); return { status: 200 }; },
    run: async (a) => { cmds.push(a.join(' ')); return { ok: true, out: a[1] === 'vms' ? '"HomeAssistant" {1234}\n"Autre" {5678}\n' : a[1] === 'runningvms' ? (enRoute ? '"HomeAssistant" {1234}\n' : '') : '', err: '' }; } });
  haOk = false; enRoute = true;
  check('HA : jamais vu répondre depuis le PC → on ne touche pas au câble (pont Wi-Fi)', (await G.verifier()) === 'jamais vu' && (t += 5 * 60000, await G.verifier()) === 'jamais vu' && !cmds.some((c) => /controlvm/.test(c)), cmds.join(' | '));
  G.muet = 0; G.enPanne = 0; cmds.length = 0;
  check('HA : répond → rien à faire', (haOk = true, await G.verifier()) === 'ok' && !cmds.length);
  haOk = false;
  check('HA : muet une fois, machine en route → on attend (pas d\'action sur un raté)', (await G.verifier()) === 'muet' && !cmds.some((c) => /controlvm|startvm/.test(c)), cmds.join(' | '));
  t += 5 * 60000;
  check('HA : muet deux fois → câble réseau virtuel débranché puis rebranché (machine trouvée toute seule)', (await G.verifier()) === 'câble rebranché'
    && cmds.includes('controlvm HomeAssistant setlinkstate1 off') && cmds.includes('controlvm HomeAssistant setlinkstate1 on') && notes.some((n) => /câble réseau virtuel débranché puis rebranché/.test(n)), cmds.join(' | '));
  const n0 = cmds.length; t += 5 * 60000;
  check('HA : au plus une action par 30 min', (await G.verifier()) === 'attente' && cmds.length === n0);
  t += HA_ACTION_MS; enRoute = false;
  check('HA : machine arrêtée → démarrée sans fenêtre', (await G.verifier()) === 'démarrée' && cmds.includes('startvm HomeAssistant --type headless') && notes.some((n) => /arrêtée, je l'ai démarrée/.test(n)), cmds.join(' | '));
  const n1 = cmds.length; t += HA_ACTION_MS;
  check('HA : PC sans réseau → on ne touche à rien', (await G.verifier({ pcEnLigne: false })) === 'pc hors ligne' && cmds.length === n1);
  haOk = true;
  check('HA : de nouveau là → noté au journal', (await G.verifier()) === 'ok' && notes.some((n) => /répond de nouveau/.test(n)));
  const G2 = new GardeHA({ cfg: { ha: false }, vbox: 'x' });
  check('HA : « ha »: false dans config.json → pas de surveillance', (await G2.verifier()) === 'coupé');
  const n3 = []; const G3 = new GardeHA({ cfg: {}, vbox: '', journal: (m) => n3.push(m) });
  check('HA : pas de VirtualBox sur le PC → dit une fois, rien d\'autre', (await G3.verifier()) === 'coupé' && (await G3.verifier()) === 'coupé' && n3.length === 1);
}

// ---------- Le CRM en lecture seule ----------
check('CRM : 7 outils (6 du CRM + bourse), tous des lectures', OUTILS.length === 7 && OUTILS.every((o) => /^(crm_(schema|requete|client|journee|bilan|produit)|bourse_etat)$/.test(o.action)));
check('CRM : aucun outil d\'écriture', !OUTILS.some((o) => /noter|tache|brouillon|confirmer|ecrire|ajouter/.test(o.name + o.action)));
const vus = [];
const fauxCRM = async (url, o) => { const b = JSON.parse(o.body); vus.push(b); return { status: 200, text: async () => JSON.stringify(b.action === 'crm_client' && b.client === 'inconnu' ? { ok: false, erreur: 'client introuvable' } : { ok: true, texte: `résultat de ${b.action}` }) }; };
let c = await appeler('crm_recherche', { requetes: Array.from({ length: 9 }, () => ({ table: 'commandes' })) }, { script: 'S', fetchImpl: fauxCRM });
check('CRM : recherche relayée (6 au plus)', c.content[0].text === 'résultat de crm_requete' && vus[0].action === 'crm_requete' && vus[0].requetes.length === 6);
c = await appeler('crm_fiche_client', { client: 'inconnu' }, { script: 'S', fetchImpl: fauxCRM });
check('CRM : refus du CRM rendu comme une erreur lisible', c.isError === true && /introuvable/.test(c.content[0].text));
c = await appeler('crm_tache', { texte: 'x' }, { script: 'S', fetchImpl: fauxCRM });
check('CRM : outil inconnu refusé, rien envoyé', c.isError === true && vus.length === 2);
c = await appeler('crm_bilan', {}, { script: 'S', secret: 'x'.repeat(40), fetchImpl: fauxCRM });
check('CRM : le secret du relais part avec la question (le script exige clé ou secret, 11/11/26)', !c.isError && vus[vus.length - 1].secret === 'x'.repeat(40) && !('secret' in vus[0]));

// Protocole MCP (lignes JSON-RPC).
const entree = new PassThrough(), sortie = new PassThrough(); let lu = '';
sortie.on('data', (b) => { lu += b; });
serveur({ entree, sortie, script: 'S', secret: 's'.repeat(40), fetchImpl: fauxCRM });
const env = (m) => entree.write(JSON.stringify(m) + '\n');
env({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: 'x' } } });
env({ jsonrpc: '2.0', method: 'notifications/initialized' });
env({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
env({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'crm_bilan', arguments: {} } });
env({ jsonrpc: '2.0', id: 4, method: 'resources/list' });
await new Promise((res) => setTimeout(res, 100));
const reps = lu.trim().split('\n').map((l) => JSON.parse(l));
check('MCP : initialisation', reps[0].id === 1 && reps[0].result.protocolVersion === '2025-06-18' && reps[0].result.capabilities.tools);
check('MCP : pas de réponse à une notification', reps.length === 4);
check('MCP : liste des outils, marqués lecture seule', reps[1].result.tools.length === 7 && reps[1].result.tools.every((t) => t.annotations.readOnlyHint && t.inputSchema));
check('MCP : appel d\'un outil, avec le secret du relais', reps.find((x) => x.id === 3).result.content[0].text === 'résultat de crm_bilan' && vus[vus.length - 1].secret === 's'.repeat(40));
check('MCP : méthode inconnue → erreur propre', reps.find((x) => x.id === 4).error.code === -32601);


// ---------- Le relais se met à jour tout seul depuis GitHub ----------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relais-'));
  for (const f of ['relais.mjs', 'crm-mcp.mjs', 'consigne.md']) fs.writeFileSync(path.join(dir, f), 'ancien ' + f + ' '.repeat(300));
  let distant = { 'relais.mjs': 'export const x = 1;\n' + '// '.repeat(100), 'crm-mcp.mjs': 'ancien crm-mcp.mjs' + ' '.repeat(300), 'consigne.md': 'Nouvelle consigne' + '.'.repeat(300) };
  const fx = async (u) => { const f = u.split('/pc/')[1].split('?')[0]; return { ok: true, text: async () => distant[f] || '' }; };
  const R2 = new Relais({ dir, config: { script: 'S', secret: 'x'.repeat(40) }, fetchImpl: async (u, o) => (u.includes('raw.githubusercontent.com') ? fx(u) : { status: 200, text: async () => 'ok' }), log: () => {} });
  check('Mise à jour : fichiers changés remplacés (code vérifié avant)', (await R2.miseAJour()) === true && /export const x/.test(fs.readFileSync(path.join(dir, 'relais.mjs'), 'utf8')) && /Nouvelle consigne/.test(fs.readFileSync(path.join(dir, 'consigne.md'), 'utf8')) && /ancien crm/.test(fs.readFileSync(path.join(dir, 'crm-mcp.mjs'), 'utf8')));
  check('Mise à jour : rien de changé → rien à faire', (await R2.miseAJour()) === false);
  distant['crm-mcp.mjs'] = 'export const = cassé ;' + ' '.repeat(300);
  check('Mise à jour : code cassé refusé, rien remplacé', (await R2.miseAJour()) === false && /ancien crm/.test(fs.readFileSync(path.join(dir, 'crm-mcp.mjs'), 'utf8')) && !fs.readdirSync(dir).some((f) => /neuf/.test(f)));
  R2.enCours = 1; distant['crm-mcp.mjs'] = 'export const y = 2;' + ' '.repeat(300);
  check('Mise à jour : jamais pendant une question', (await R2.miseAJour()) === false);
  fs.rmSync(dir, { recursive: true, force: true });
}
// ---------- E-mails (11/11/26) : Claude sans Internet, Chrome limité à Outlook, aucun outil d'envoi ----------
{
  const { adresseOk, refus } = await import('../pc/garde-chrome.mjs');
  const M = await import('../pc/mail-mcp.mjs');
  const pro = argumentsClaude({ mcp: 'M', consigne: 'C', mail: { pro: true, reglages: 'R' } }), perso = argumentsClaude({ mcp: 'M', consigne: 'C', mail: { pro: false, reglages: 'R' } });
  const val = (a, n) => a[a.indexOf(n) + 1];
  check('E-mails : Claude n\'a ni recherche Internet ni lecture de pages', val(pro, '--tools') === '' && val(perso, '--tools') === '' && !/Web/.test(pro.join(' ') + perso.join(' ')));
  check('E-mails pro : Chrome, avec la garde et les outils dangereux interdits', pro.includes('--chrome') && val(pro, '--settings') === 'R' && /javascript_tool/.test(val(pro, '--disallowedTools')) && /mcp__claude-in-chrome/.test(val(pro, '--allowedTools')));
  check('E-mails perso : pas de Chrome du tout', perso.includes('--no-chrome') && !perso.includes('--chrome') && val(perso, '--allowedTools') === 'mcp__mail,mcp__crm');
  check('E-mails : la demande dit quelle boîte regarder', /PRO seulement/.test(demande({ type: 'mail', boite: 'pro', question: 'x' })) && /les deux/.test(demande({ type: 'mail', boite: 'les_deux', question: 'x' })));
  check('Garde Chrome : Outlook permis', adresseOk('https://outlook.office.com/mail/') && adresseOk('outlook.office.com/mail/inbox') && adresseOk('back') && refus('mcp__claude-in-chrome__navigate', { url: 'https://outlook.office365.com/mail/' }) === '');
  check('Garde Chrome : toute autre adresse refusée', !adresseOk('https://exemple.com/?d=secret') && !adresseOk('http://outlook.office.com/') && !adresseOk('https://outlook.office.com.exemple.com/') && !adresseOk('javascript:alert(1)') && !adresseOk('')
    && /hors d'Outlook/.test(refus('mcp__claude-in-chrome__navigate', { url: 'https://exemple.com' })));
  check('Garde Chrome : une adresse cachée dans un lot d\'actions est refusée aussi', /hors d'Outlook/.test(refus('mcp__claude-in-chrome__browser_batch', { actions: [{ name: 'computer', input: { action: 'screenshot' } }, { name: 'navigate', input: { url: 'https://exemple.com' } }] }))
    && /interdit/.test(refus('mcp__claude-in-chrome__browser_batch', { actions: [{ name: 'javascript_tool', input: {} }] })) && refus('mcp__claude-in-chrome__computer', { action: 'left_click' }) === '');
  check('Gmail (MCP) : chercher, lire, brouillon — aucun outil d\'envoi ni de suppression', M.OUTILS.map((o) => o.name).join() === 'mail_chercher,mail_lire,mail_brouillon');
  let vu = null;
  const rep = await M.appeler('mail_chercher', { q: 'from:x', n: 99 }, { script: 'S', secret: 's'.repeat(40), fetchImpl: async (u, o) => { vu = JSON.parse(o.body); return { text: async () => JSON.stringify({ ok: true, texte: 'Gmail : 0 fil' }) }; } });
  check('Gmail (MCP) : passe par le script avec le secret du relais', vu && vu.action === 'mail_chercher' && vu.secret === 's'.repeat(40) && vu.q === 'from:x' && /0 fil/.test(rep.content[0].text));
  check('Gmail (MCP) : outil inconnu refusé', (await M.appeler('mail_envoyer', {}, { script: 'S', secret: 'x' })).isError === true);
}

console.log(`\n${ok}/${ok + ko} vérifications OK`);
process.exit(ko ? 1 : 0);
