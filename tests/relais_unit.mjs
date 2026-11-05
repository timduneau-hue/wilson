// Relais Claude du PC (pc/relais.mjs) et accès CRM en lecture seule (pc/crm-mcp.mjs), sans réseau ni Claude : `node relais_unit.mjs`
import { PassThrough } from 'node:stream';
import { decouper, demande, argumentsClaude, Relais } from '../pc/relais.mjs';
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
check('Claude : impression seule, JSON, Sonnet', a[0] === '-p' && val('--output-format') === 'json' && val('--model') === 'sonnet');
check('Claude : outils limités à la recherche et à la lecture de pages', val('--tools') === 'WebSearch,WebFetch' && !/Bash|Write|Edit|PowerShell/.test(val('--tools')));
check('Claude : seul le CRM en lecture seule en plus, le reste refusé', val('--allowedTools') === 'WebSearch,WebFetch,mcp__crm' && val('--permission-mode') === 'dontAsk' && a.includes('--strict-mcp-config') && a.includes('--no-session-persistence'));

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
check('Relais : question et réponse écrites dans le journal de Wilson', j && j.version === 'relais 1 · PC' && j.lignes.some((l) => /question reçue \(internet, en voiture\)/.test(l.m)) && j.lignes.some((l) => /réponse en \d+ s \(7 étape/.test(l.m)), JSON.stringify(j && j.lignes));
check('Relais : plus rien en cours', R.enCours === 0);
envoyes.length = 0;
await R.traiter({ id: 'q2', type: 'internet', question: 'plante' });
const rendu2 = envoyes.find((x) => x.action === 'claude_rendre');
check('Relais : Claude en échec → erreur rendue à Wilson (jamais de silence)', rendu2 && rendu2.ok === false && /4 min/.test(rendu2.erreur), JSON.stringify(rendu2));

// Une boucle : prend la question en attente puis s'arrête.
envoyes.length = 0; fileQ = [{ id: 'q3', type: 'crm', question: 'Mon CA du mois ?' }];
R.stop = false;
const tours = (async () => { await new Promise((res) => setTimeout(res, 50)); R.stop = true; })();
await Promise.race([R.boucle(), new Promise((res) => setTimeout(res, 300))]); await tours;
await new Promise((res) => setTimeout(res, 50));
const pris = envoyes.find((x) => x.action === 'claude_prendre');
check('Relais : attend une question 25 s, avec son secret et sa version', pris && pris.attente === 25 && pris.secret === 'x'.repeat(40) && pris.version === 'relais 1');
check('Relais : la question prise est traitée', envoyes.some((x) => x.action === 'claude_rendre' && x.id === 'q3'));

// ---------- Le CRM en lecture seule ----------
check('CRM : 6 outils, tous des lectures', OUTILS.length === 6 && OUTILS.every((o) => /^crm_(schema|requete|client|journee|bilan|produit)$/.test(o.action)));
check('CRM : aucun outil d\'écriture', !OUTILS.some((o) => /noter|tache|brouillon|confirmer|ecrire|ajouter/.test(o.name + o.action)));
const vus = [];
const fauxCRM = async (url, o) => { const b = JSON.parse(o.body); vus.push(b); return { status: 200, text: async () => JSON.stringify(b.action === 'crm_client' && b.client === 'inconnu' ? { ok: false, erreur: 'client introuvable' } : { ok: true, texte: `résultat de ${b.action}` }) }; };
let c = await appeler('crm_recherche', { requetes: Array.from({ length: 9 }, () => ({ table: 'commandes' })) }, { script: 'S', fetchImpl: fauxCRM });
check('CRM : recherche relayée (6 au plus)', c.content[0].text === 'résultat de crm_requete' && vus[0].action === 'crm_requete' && vus[0].requetes.length === 6);
c = await appeler('crm_fiche_client', { client: 'inconnu' }, { script: 'S', fetchImpl: fauxCRM });
check('CRM : refus du CRM rendu comme une erreur lisible', c.isError === true && /introuvable/.test(c.content[0].text));
c = await appeler('crm_tache', { texte: 'x' }, { script: 'S', fetchImpl: fauxCRM });
check('CRM : outil inconnu refusé, rien envoyé', c.isError === true && vus.length === 2);

// Protocole MCP (lignes JSON-RPC).
const entree = new PassThrough(), sortie = new PassThrough(); let lu = '';
sortie.on('data', (b) => { lu += b; });
serveur({ entree, sortie, script: 'S', fetchImpl: fauxCRM });
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
check('MCP : liste des outils, marqués lecture seule', reps[1].result.tools.length === 6 && reps[1].result.tools.every((t) => t.annotations.readOnlyHint && t.inputSchema));
check('MCP : appel d\'un outil', reps.find((x) => x.id === 3).result.content[0].text === 'résultat de crm_bilan');
check('MCP : méthode inconnue → erreur propre', reps.find((x) => x.id === 4).error.code === -32601);

console.log(`\n${ok}/${ok + ko} vérifications OK`);
process.exit(ko ? 1 : 0);
