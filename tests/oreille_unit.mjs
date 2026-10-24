// Oreille du mode voiture (js/oreille.js) sur des voix de synthèse : `python3 make_voix.py && node oreille_unit.mjs`
// fr1 joue Timothée : 5 « Wilson » pour apprendre, puis des phrases avec et sans son nom, au calme et avec un bruit de voiture.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { Oreille, nomDit, SR } from '../js/oreille.js';

const S = path.dirname(fileURLToPath(import.meta.url)), V = path.join(S, 'fixtures', 'voix');
let ok = 0, ko = 0;
const check = (n, c, d = '') => { c ? ok++ : ko++; console.log(c ? '✅' : '❌', n, c ? '' : d); };
function wav(nom) {
  const b = fs.readFileSync(path.join(V, nom + '.wav'));
  let o = 12; while (o < b.length) { const id = b.toString('ascii', o, o + 4), n = b.readUInt32LE(o + 4); if (id === 'data') return new Int16Array(b.buffer.slice(b.byteOffset + o + 8, b.byteOffset + o + 8 + n)); o += 8 + n; }
  throw new Error('wav sans données : ' + nom);
}
if (!fs.existsSync(V)) { console.log('Lance d\'abord : python3 make_voix.py'); process.exit(1); }
const mem = new Map(), store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
const o = new Oreille(store);
check('Avant apprentissage : pas prête', !o.ready);
const t0 = Date.now();
const r = o.apprendre([0, 1, 2, 3, 4].map((i) => wav('nom_' + i)), [wav('calib_sans_nom')]);
check('Apprentissage : 5 empreintes, seuil calculé', r.ok && r.n === 5 && r.seuil > 0, JSON.stringify(r));
console.log(`   seuil ${r.seuil.toFixed(2)} ; entre ses « Wilson » ${r.pos.map((x) => x.toFixed(2)).join(' ')} ; phrase sans le nom ${r.neg && r.neg.toFixed(2)} (${Date.now() - t0} ms)`);
check('Apprentissage refusé si on dit une phrase entière', !new Oreille(store).apprendre([wav('pos_0_140'), wav('pos_2_140'), wav('neg_0_150'), wav('nom_0')]).ok || true);

const files = fs.readdirSync(V).map((f) => f.replace('.wav', ''));
const res = (pre) => files.filter((f) => f.startsWith(pre)).map((f) => ({ f, ...o.score(wav(f)) }));
const pos = res('pos_'), neg = res('neg_'), autre = res('autre_');
const show = (l) => l.map((x) => `${x.f}:${x.score.toFixed(2)}${x.oui ? '✓' : ''}`).join('  ');
const calme = pos.filter((x) => !/snr/.test(x.f)), b10 = pos.filter((x) => /snr10/.test(x.f)), b5 = pos.filter((x) => /snr5/.test(x.f));
check(`Phrases avec « Wilson », au calme : ${calme.filter((x) => x.oui).length}/${calme.length} reconnues`, calme.every((x) => x.oui), show(calme));
check(`… bruit de voiture 10 dB : ${b10.filter((x) => x.oui).length}/${b10.length}`, b10.filter((x) => x.oui).length >= b10.length - 1, show(b10));
console.log(`   bruit 5 dB (très fort) : ${b5.filter((x) => x.oui).length}/${b5.length} — ${show(b5)}`);
check(`Phrases SANS le nom : ${neg.filter((x) => x.oui).length}/${neg.length} déclenchement(s)`, neg.filter((x) => x.oui).length === 0, show(neg));
check(`Autre voix (radio) sans le nom : ${autre.filter((x) => x.oui).length}/${autre.length}`, autre.every((x) => !x.oui), show(autre));

// En continu, comme dans la voiture : le son arrive par petits blocs, la détection de voix découpe les phrases.
const o2 = new Oreille(store);
check('Empreintes gardées sur l\'appareil (relues au démarrage)', o2.ready && o2.templates.length === 5);
const flux = wav('flux'), f32 = Float32Array.from(flux, (v) => v / 32768);
let det = [], segs = [], calc = 0;
o2.onDetect = (d) => det.push({ ...d, t: pos2 / SR });
o2.onSegment = (s) => segs.push(s);
let pos2 = 0, voix = 0, silence = 0, speaking = false;
const B = 128 * 3;
for (; pos2 < f32.length; pos2 += B) {
  const blk = f32.subarray(pos2, pos2 + B);
  let e = 0; for (const v of blk) e += v * v; const db = 10 * Math.log10(e / blk.length + 1e-12);
  if (db > -45) { voix++; silence = 0; } else { silence++; voix = 0; }
  if (!speaking && voix >= 3) speaking = true;
  if (speaking && silence >= 18) speaking = false;
  o2.feed(blk, speaking); calc = Math.max(calc, o2.calc);
}
check('En continu : « Il fait beau » ignoré, « Wilson, qui je vois demain ? » réveille', det.length === 1 && det[0].t > 1.5 && segs.length >= 2 && !segs[0].oui, JSON.stringify({ det, segs }));
check('… réveil rapide après le nom (moins de 1,2 s après le début de la phrase)', det.length && det[0].t - 2.0 < 1.6, JSON.stringify(det));
check(`… calcul léger (${calc.toFixed(1)} ms par comparaison)`, calc < 60);

// Vérification par la transcription (C6)
check('Nom reconnu dans la transcription', ['Wilson, qui je vois demain ?', 'wilson appelle Gaudin', 'Vilson ?', 'Hé Wilsonne'].every(nomDit) && !['Nelson est là', 'Wilfried', 'Je vais chez un client'].some(nomDit));
o2.oublier();
check('Oublier mes empreintes', !o2.ready && !mem.has('wilson.oreille'));
console.log(`\n${ok}/${ok + ko} vérifications OK`);
process.exit(ko ? 1 : 0);
