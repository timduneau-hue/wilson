// Reconnaissance des visages (js/qui.js, PLAN 7 sexies, V3-V4) : règle « sûr », sans modèle ni caméra.
// Journal du 18/11/26 : « sûr » tombait à chaque nouvelle analyse (toutes les 20 s une fois sûr), car les analyses d'avant
// avaient plus de 15 s ; sa remarque a été refusée dans ce trou (09h23:54) et l'outil visages a dit « pas assez sûr » (09h22:03).
let T = 0;
Object.defineProperty(globalThis, 'performance', { value: { now: () => T }, configurable: true, writable: true });
const { Qui, coderVisage, decoderVisage, distance } = await import('../js/qui.js');

let ok = 0, ko = 0;
const check = (nom, cond, detail = '') => { if (cond) { ok++; console.log('✅', nom); } else { ko++; console.log('❌', nom, detail); } };

function nouveau() {
  const logs = [];
  const Q = new Qui({ log: (m) => logs.push(m) });
  Q.personnes = [{ nom: 'Timothée', desc: [[0, 0]] }, { nom: 'Camille', desc: [[1, 0]] }];
  Q.vision = { faces: 1 };
  Q.logs = logs;
  return Q;
}
let n = 0;
const analyse = (Q, x, t) => { T = t; Q._meta = { n: ++n, faces: 1, facing: true }; Q._message({ type: 'empreinte', n, desc: [x, 0], ms: 30 }); return Q.actuel; };

// 1. Deux analyses proches : sûr ; revu 20 s plus tard (V4) : reste sûr, sans nouveau « c'est Timothée » au journal.
let Q = nouveau();
check('Une seule analyse : pas encore sûr (V3)', !analyse(Q, 0.3, 0).sur);
check('Deux analyses à 1,5 s : Timothée sûr', analyse(Q, 0.3, 1500).sur && Q.actuel.nom === 'Timothée');
const nLogs = Q.logs.filter((l) => l.includes("c'est Timothée")).length;
let A = analyse(Q, 0.35, 21600);
check('Revu 20 s plus tard (analyses d\'avant de plus de 15 s) : reste sûr', A.sur && A.nom === 'Timothée', JSON.stringify(A));
check('… et qui() le dit toujours (CRM, remarques, e-mails, outil visages)', !!(Q.qui(21700) && Q.qui(21700).sur));
A = analyse(Q, 0.38, 43200);
check('Encore 20 s plus tard : toujours sûr', A.sur);
check('Pas de « c\'est Timothée » répété toutes les 22 s au journal', Q.logs.filter((l) => l.includes("c'est Timothée")).length === nLogs, JSON.stringify(Q.logs));

// 2. Ce qui ne suffit pas pour rester sûr.
A = analyse(Q, 0.53, 64800);
check('Revu moins proche (distance 0,53 > 0,5) : plus sûr', !A.sur);
Q = nouveau(); analyse(Q, 0.3, 0); analyse(Q, 0.3, 1500);
A = analyse(Q, 0.7, 21600);
check('Quelqu\'un d\'autre (Camille plus proche) : Timothée n\'est plus sûr', !A.sur && A.nom !== 'Timothée');
Q = nouveau(); analyse(Q, 0.3, 0); analyse(Q, 0.3, 1500);
A = analyse(Q, 0.49, 21600);
check('Revu entre les deux (Camille presque aussi proche) : plus sûr', !A.sur);
Q = nouveau(); analyse(Q, 0.3, 0); analyse(Q, 0.3, 1500);
A = analyse(Q, 0.3, 40000);
check('Revu longtemps après (38 s) : une seule analyse ne suffit plus', !A.sur);
check('… la suivante le confirme', analyse(Q, 0.3, 41500).sur);

// 3. Camille sûre puis Timothée : il faut deux analyses pour lui (rien n'est hérité de Camille).
Q = nouveau(); analyse(Q, 0.7, 0); analyse(Q, 0.7, 1500);
check('Camille sûre', Q.actuel.sur && Q.actuel.nom === 'Camille');
check('Timothée juste après : une analyse ne suffit pas', !analyse(Q, 0.3, 3000).sur);
check('… deux, oui', analyse(Q, 0.3, 4500).sur && Q.actuel.nom === 'Timothée');

// 4. Copie du visage de Timothée de la tablette vers son téléphone (réponse du 18/11/26, 14h38, question q261115a ; V1).
const vrai = Array.from({ length: 128 }, (_, i) => Math.sin(i * 1.7) * 0.18);
const code = coderVisage(vrai), retour = decoderVisage(code);
check('Empreinte codée courte (une propriété du script : 9 ko pour 24 empreintes)', code.length < 200, String(code.length));
check('… et relue presque à l\'identique (écart très loin du seuil 0,5)', retour && retour.length === 128 && distance(vrai, retour) < 0.01, retour && distance(vrai, retour));
check('Code abîmé : rien', decoderVisage('abc') === null && decoderVisage('') === null);
const tab = nouveau(); tab.personnes = [{ nom: 'Timothée', desc: [vrai, vrai.map((x) => -x)], t: 111 }, { nom: 'Camille', desc: [vrai.map((x) => x / 2)], t: 5 }];
const ex = tab.exporter('Timothée');
check('Tablette : seul le visage demandé part (Timothée), codé, avec son heure', ex && ex.t === 111 && ex.desc.length === 2 && ex.desc.every((c) => typeof c === 'string'), JSON.stringify(ex).slice(0, 80));
let tel = nouveau(); tel.personnes = [];
check('Téléphone : copie reçue', tel.copier('Timothée', ex) === 'copie' && tel.liste().join() === 'Timothée' && tel.trouver('Timothée').copie);
check('… reconnu avec la copie (deux analyses proches)', (() => { tel.personnes[0].desc.push([0, 0]); analyse(tel, 0.3, 100000); return analyse(tel, 0.3, 101500).sur && tel.actuel.nom === 'Timothée'; })());
check('Une copie n\'est jamais renvoyée par le téléphone', tel.exporter('Timothée') === null);
check('Oublié sur la tablette (empreintes vides) : copie effacée', tel.copier('Timothée', { t: 222, desc: [] }) === 'oublie' && !tel.liste().length);
tel = nouveau();
check('Visage appris sur le téléphone lui-même : jamais écrasé par la copie', tel.copier('Timothée', ex) === '' && tel.trouver('Timothée').desc.length === 1 && !tel.trouver('Timothée').copie);

console.log(`\n${ok}/${ok + ko} vérifications OK`);
process.exit(ko ? 1 : 0);
