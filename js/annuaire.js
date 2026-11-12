// Wilson — l'annuaire du CRM, gardé sur l'appareil (PLAN.md, section 2 sexies, règles N1 à N6).
//
// Journal du 12/11/26, 08h41-08h47 (téléphone en voiture ; les noms sont changés ici) : « amène-moi chez ABM » → 18,5 s d'attente, puis le guidage part
// vers GRANDBAT E ET S AB FRANCE ; quatre essais et cinq minutes pour arriver à A B M. À 09h26, « qui est le magasinier de
// ABM ? » → 46 s (Claude, sur le PC). À 09h53, le compte rendu dicté pour Yoann Moreau est préparé au nom de Mathieu
// Anjubault (premier contact de la fiche). Cause commune : Wilson ne connaissait ni les clients ni leurs contacts ; il
// demandait tout au CRM, nom mal entendu compris, et prenait ce qui revenait.
//
// Ici : la liste de tous les contacts du CRM (société, contact, fonction, code, ville, adresse, téléphone, e-mail) est lue
// une fois par jour (action crm_annuaire du CRM, lecture seule) et gardée sur l'appareil. Wilson y retrouve lui-même le
// client ET la personne dont on parle (sigles, noms mal entendus, ville), tout de suite et sans réseau ; s'il hésite entre
// plusieurs, il les cite au lieu de choisir. Les chiffres, visites, commandes, devis et comptes rendus ne viennent JAMAIS
// d'ici : ils sont demandés au CRM à chaque fois (règle C1).
//
// Module sans état caché ni accès direct au réseau : testé seul (tests/annuaire_unit.mjs).

import { ecrireLocal } from './stockage.js';

export const CLE_ANNUAIRE = 'wilson.annuaire';
export const ANNUAIRE_MAX_MS = 6 * 3600000;        // au-delà, il est relu (en arrière-plan) à la prochaine occasion
export const ANNUAIRE_VIEUX_MS = 20 * 3600000;     // au-delà, Wilson dit de quand il date

const plat = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’ʼ]/g, "'").replace(/\s+/g, ' ').trim();
// Les mêmes listes que le CRM (WebApp, section 53) : mots qui ne désignent personne, mots trop communs pour départager.
const VIDES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'a', 'au', 'aux', 'chez', 'sarl', 'sas', 'sasu', 'eurl', 'sa', 'sci', 'snc', 'ets',
  'etablissements', 'etablissement', 'ste', 'societe', 'groupe', 'monsieur', 'madame', 'mr', 'mme', 'm', 'client', 'mon', 'ma']);
const FAIBLES = new Set(['menuiserie', 'menuiseries', 'fermeture', 'fermetures', 'serrurerie', 'metallerie', 'batiment', 'batiments', 'construction', 'constructions',
  'renovation', 'agencement', 'charpente', 'alu', 'aluminium', 'pvc', 'bois', 'entreprise', 'atelier', 'ateliers', 'service', 'services', 'habitat', 'bati', 'fils',
  'freres', 'france', 'ouest', 'industrie', 'industries']);

// Les mots d'un nom. Un sigle écrit ou dit lettre par lettre (« A B M », « A D 2 M ») devient un seul mot (« abm », « ad2m ») :
// sinon « A B M » ne laissait que « b » (« a » et « m » sont des mots vides) et « ABM » ne le retrouvait jamais.
export function motsNom(s) {
  const brut = plat(String(s || '').replace(/ç/gi, 's')).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean), out = [];
  for (let i = 0; i < brut.length; i++) {
    if (brut[i].length === 1) {
      let j = i, sigle = '';
      while (j < brut.length && brut[j].length === 1) sigle += brut[j++];
      if (sigle.length >= 2) { out.push(sigle); i = j - 1; continue; }
    }
    out.push(brut[i]);
  }
  return out.filter((m) => !VIDES.has(m));
}
// Clé phonétique française simplifiée (« Gaudin » = « Godin », « Yohan » = « Yoann »).
const PHON = new Map();
export function phon(m) {
  const k = String(m || ''); let v = PHON.get(k);
  if (v === undefined) { v = phon0(k); if (PHON.size > 30000) PHON.clear(); PHON.set(k, v); }
  return v;
}
function phon0(m) {
  let s = plat(String(m || '').replace(/ç/gi, 's')).replace(/[^a-z0-9]/g, '');
  if (!s || /^\d+$/.test(s)) return s;
  return s.replace(/ph/g, 'f').replace(/sch|ch|sh/g, 'S').replace(/qu|ck|q/g, 'k')
    .replace(/gu(?=[eiy])/g, 'G').replace(/g(?=[eiy])/g, 'j').replace(/G/g, 'g')
    .replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/w/g, 'v').replace(/y/g, 'i').replace(/z/g, 's').replace(/h/g, '')
    .replace(/eau|au/g, 'o').replace(/ou/g, 'U').replace(/oi/g, 'wa')
    .replace(/(ai|ei)(?=[^n]|$)/g, 'e').replace(/(et|er|ez)$/g, 'e')
    .replace(/(ain|ein|in|un|im)(?=[^aeiouU]|$)/g, 'I')
    .replace(/(an|en)(?=[^aeiouU]|$)|(am|em)(?=[bp])/g, 'A')
    .replace(/on(?=[^aeiouU]|$)|om(?=[bp])/g, 'O')
    .replace(/(.)\1+/g, '$1').replace(/([^A-Z])[estdxp]$/, '$1');
}
export function jw(a, b) {
  if (a === b) return 1;
  const la = a.length, lb = b.length; if (!la || !lb) return 0;
  const fen = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1), ma = new Array(la).fill(false), mb = new Array(lb).fill(false);
  let m = 0;
  for (let i = 0; i < la; i++) for (let j = Math.max(0, i - fen); j < Math.min(lb, i + fen + 1); j++) { if (mb[j] || a[i] !== b[j]) continue; ma[i] = mb[j] = true; m++; break; }
  if (!m) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < la; i++) { if (!ma[i]) continue; while (!mb[k]) k++; if (a[i] !== b[k]) t++; k++; }
  const jaro = (m / la + m / lb + (m - t / 2) / m) / 3;
  let p = 0; while (p < Math.min(4, la, lb) && a[p] === b[p]) p++;
  return jaro + p * 0.1 * (1 - jaro);
}
// Ressemblance de deux mots (0 à 1). Un mot très court (sigle : « ABM », « AB ») est le même ou ne ressemble à rien :
// le 12/11/26, « abm » ressemblait à « ab » à 0,91 et a envoyé Timothée chez Grandbat E et S AB France.
export function sim(a, b) {
  if (a === b) return 1;
  if (!a || !b || /^\d+$/.test(a) || /^\d+$/.test(b)) return 0;
  const pa = phon(a), pb = phon(b);
  if (a.length >= 3 && b.length >= 3 && pa && pa === pb) return 0.93;
  if (Math.min(a.length, b.length) <= 3) return 0;
  let s = jw(a, b);
  if (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a))) s = Math.max(s, 0.86);
  return pa.length >= 4 && pb.length >= 4 ? Math.max(s, jw(pa, pb) * 0.93) : s;
}
// Tout ce qui a été dit est-il expliqué par ce client ? Chaque mot utile retrouvé (0,78), et soit tous nettement (0,86),
// soit au moins la moitié à l'identique ou à l'oreille (0,92) : « Mathieu Onjubaud » = Mathieu ANJUBAULT, « Johann Moreau »
// = Yoann MOREAU ; « Tech Metallu » retrouve TECMETALU mais reste à faire confirmer.
const compter = (E, w, b) => { if (FAIBLES.has(w)) return; E.utiles++; if (b >= 0.78) E.vus++; if (b >= 0.86) E.nets++; if (b >= 0.92) E.surs++; };
const complet = (E) => E.utiles > 0 && E.vus === E.utiles && (E.nets === E.utiles || (E.utiles >= 2 && E.surs * 2 >= E.utiles));
const meilleur = (w, liste, k = 1) => { let b = 0; for (const t of liste) { const s = sim(w, t) * k; if (s > b) b = s; } return b; };
const poids = (w) => (FAIBLES.has(w) ? 0.35 : 1) * Math.min(1, Math.max(0.4, w.length / 4));
export const cleContact = (contact, societe) => JSON.stringify([String(contact || '').trim(), String(societe || '').trim()]);
// « M MOREAU Yoann » → « Yoann Moreau » (pour le dire à voix haute).
export function nomDit(nom) {
  const m = String(nom || '').trim().replace(/^(m|mr|mme|mlle|monsieur|madame)\.?\s+/i, '').split(/\s+/).filter(Boolean);
  if (m.length < 2) return m.join(' ');
  const maj = m.filter((x) => x.length > 1 && x === x.toUpperCase() && /[A-ZÀ-Ý]/.test(x)), reste = m.filter((x) => !maj.includes(x));
  const cap = (x) => x.split('-').map((p) => (p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p)).join('-');
  return maj.length && reste.length ? [...reste, ...maj.map(cap)].join(' ') : m.join(' ');
}

// Une personne parmi des contacts ([{ nom, fonction, … }] : ceux de l'annuaire ou d'une fiche du CRM), par son nom
// (« Moreau », « Yohan ») ou sa fonction (« le magasinier », « l'acheteur »).
// { contact } si une seule ressort ; { plusieurs } si on ne peut pas départager ; {} si personne.
const TITRES = ['responsable', 'chef', 'directeur', 'directrice', 'gerant', 'gerante'];
export function personneParmi(contacts, dit) {
  const tous = motsNom(dit), Q = tous.length === 1 ? tous : tous.filter((w) => !TITRES.includes(w));
  if (!Q.length) return {};
  const L = (contacts || []).map((c) => {
    const mc = c.mc || motsNom(c.nom), mf = c.mf || motsNom(c.fonction);
    let tot = 0, pds = 0;
    for (const w of Q) { let b = Math.max(meilleur(w, mc), meilleur(w, mf, 0.95)); if (b < 0.78) b = 0; const p = poids(w); tot += b * p; pds += p; }
    return { c, s: pds ? tot / pds : 0 };
  }).filter((x) => x.s >= 0.7).sort((a, b) => b.s - a.s);
  if (!L.length) return {};
  const proches = L.filter((x) => x.s >= L[0].s - 0.05);
  return proches.length === 1 ? { contact: L[0].c } : { plusieurs: proches.slice(0, 4).map((x) => x.c) };
}

export class Annuaire {
  // stockage : { lire(cle) → texte ou null, ecrire(cle, objet) } ; par défaut le stockage local de l'appareil.
  constructor({ stockage = null, log = () => {} } = {}) {
    this.log = log; this.groupes = []; this.n = 0; this.at = 0; this.le = '';
    this.stockage = stockage || { lire: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } }, ecrire: (k, v) => ecrireLocal(k, v) };
    try { const o = JSON.parse(this.stockage.lire(CLE_ANNUAIRE) || 'null'); if (o && Array.isArray(o.contacts)) this._construire(o.contacts, o.at || 0, o.le || ''); } catch (_) {}
  }
  get pret() { return this.groupes.length > 0; }
  age(maintenant = Date.now()) { return this.at ? maintenant - this.at : Infinity; }
  aRelire(maintenant = Date.now()) { return this.age(maintenant) > ANNUAIRE_MAX_MS; }
  // « (annuaire du CRM de 8h40) », dit seulement quand il est vieux.
  date() { const d = new Date(this.at); return this.at ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} à ${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}` : ''; }

  // Réponse de l'action crm_annuaire du CRM : { ok, contacts: [[societe, contact, fonction, code, ville, adresse, tel, mail, visite], …] }.
  charger(r, maintenant = Date.now()) {
    if (!r || !r.ok || !Array.isArray(r.contacts)) return false;
    const lignes = r.contacts.filter((l) => Array.isArray(l) && String(l[1] || '').trim());
    if (!lignes.length) return false;
    this._construire(lignes, maintenant, String(r.le || ''));
    const texte = JSON.stringify({ v: 1, at: this.at, le: this.le, contacts: lignes });
    if (texte.length < 3000000) this.stockage.ecrire(CLE_ANNUAIRE, JSON.parse(texte)); else this.log(`Annuaire trop gros pour être gardé sur l'appareil (${Math.round(texte.length / 1000)} ko) : relu à chaque démarrage`);
    return true;
  }
  _construire(lignes, at, le) {
    const G = new Map();
    for (const l of lignes) {
      const [societe, contact, fonction, code, ville, adresse, tel, mail, visite] = l.map((x) => String(x == null ? '' : x).trim());
      if (!contact) continue;
      const id = code || 'S:' + (motsNom(societe).join('') || plat(societe) || plat(contact));
      let g = G.get(id);
      if (!g) { g = { id, societe: societe || contact, code, ville: '', adresse: '', ms: motsNom(societe || contact), contacts: [] }; g.forts = g.ms.filter((t) => !FAIBLES.has(t) && t.length >= 2); g.compact = g.ms.join(''); G.set(id, g); }
      if (!g.adresse && adresse) { g.adresse = adresse; g.ville = ville; }
      g.contacts.push({ nom: contact, fonction, tel, mail, visite, adresse, ville, societe: societe || contact, cle: cleContact(contact, societe), mc: motsNom(contact), mf: motsNom(fonction) });
    }
    this.groupes = [...G.values()]; for (const g of this.groupes) g.mv = motsNom(g.ville);
    this.n = this.groupes.reduce((n, g) => n + g.contacts.length, 0); this.at = at; this.le = le;
  }

  // Ce qui a été dit (« ABM », « Yoann Moreau », « Dupont à Cholet ») contre un client et un de ses contacts.
  _note(Q, qCompact, code, g, c) {
    if (code && g.code && g.code.toUpperCase() === code) return { score: 1, exact: true, complet: true, parContact: false };
    // 1. la société (et sa ville)
    let tot = 0, pds = 0; const E = { utiles: 0, vus: 0, nets: 0, surs: 0 };
    for (const w of Q) {
      let b = Math.max(meilleur(w, g.ms), meilleur(w, g.mv, 0.9)); if (b < 0.78) b = 0;
      const p = poids(w); tot += b * p; pds += p; compter(E, w, b);
    }
    let sSoc = pds ? tot / pds : 0, exact = false;
    if (g.forts.length) sSoc = sSoc * 0.8 + 0.2 * (g.forts.filter((t) => Q.some((w) => sim(w, t) >= 0.86)).length / g.forts.length);
    if (qCompact.length >= 2 && qCompact === g.compact) { sSoc = 1; exact = true; }
    else if (qCompact.length >= 5 && g.compact.length >= 5) sSoc = Math.max(sSoc, jw(qCompact, g.compact) * 0.9);   // « la pierre » → « lapierre »
    const socComplet = exact || complet(E);
    // 2. la personne (avec sa société et sa ville pour départager)
    let sCon = 0, conComplet = false;
    if (c && c.mc.length) {
      let t2 = 0, p2 = 0, vus = 0; const E2 = { utiles: 0, vus: 0, nets: 0, surs: 0 };
      for (const w of Q) {
        const bc = meilleur(w, c.mc); let b = Math.max(bc, meilleur(w, g.ms), meilleur(w, g.mv, 0.9)); if (b < 0.78) b = 0;
        if (bc >= 0.78) vus++;
        const p = poids(w); t2 += b * p; p2 += p; compter(E2, w, b);
      }
      if (vus) {
        const couvert = c.mc.filter((t) => Q.some((w) => sim(w, t) >= 0.86)).length / c.mc.length;      // prénom ET nom, ou le nom seul
        sCon = (p2 ? t2 / p2 : 0) * (0.85 + 0.15 * couvert);
        conComplet = complet(E2);
      }
    }
    return sCon > sSoc ? { score: sCon, exact: false, complet: conComplet, parContact: true } : { score: sSoc, exact, complet: socComplet, parContact: false };
  }

  // Les clients qui ressemblent à ce qui a été dit, du plus probable au moins probable :
  // [{ g, contact (la personne reconnue, ou null), score, exact, complet }]. Un seul par société.
  chercher(q, n = 6) {
    const brut = String(q || '').trim(), Q = motsNom(brut);
    if (!Q.length || !this.pret) return [];
    const code = (brut.toUpperCase().match(/\bC\d{4,}\b/) || [])[0] || '', qCompact = Q.join('');
    const L = [];
    for (const g of this.groupes) {
      let top = null;
      for (const c of g.contacts) {
        const r = this._note(Q, qCompact, code, g, c);
        if (!top || r.score > top.score + 0.001) top = { ...r, contact: r.parContact ? c : null };
        if (r.exact && !r.parContact) break;
      }
      if (top && top.score >= 0.45) L.push({ g, contact: top.contact, score: Math.round(top.score * 1000) / 1000, exact: top.exact, complet: top.complet });
    }
    L.sort((a, b) => b.score - a.score || (b.exact ? 1 : 0) - (a.exact ? 1 : 0));
    // deux fiches du même nom dans la même ville (deux comptes) : un seul client
    const vus = [], out = [];
    for (const x of L) {
      const k = x.g.compact + '|' + plat(x.g.ville);
      if (vus.some((v) => v === k || (v.split('|')[0] === x.g.compact && (!plat(x.g.ville) || !v.split('|')[1])))) continue;
      vus.push(k); out.push(x);
      if (out.length >= n) break;
    }
    return out;
  }

  // Un seul client clairement désigné ? { un, sur } — sinon { plusieurs } (à citer : nom et ville) ou { rien, proches }.
  // sur : assez certain pour AGIR sans redemander (lancer le GPS, préparer une écriture) ; sinon Wilson fait confirmer (P8).
  choisir(q) {
    const L = this.chercher(q, 8), top = L[0];
    if (!top || top.score < 0.6) return { rien: true, proches: L.slice(0, 3) };
    const autres = L.filter((c) => c !== top && c.score >= 0.6 && c.score >= top.score - 0.08 && !(top.exact && !c.exact));
    if (autres.length) return { plusieurs: [top, ...autres].slice(0, 4) };
    const seul = !L.some((c) => c !== top && c.score >= 0.6 && c.score >= top.score - 0.15);
    return { un: top, sur: top.exact || (top.complet && top.score >= 0.8 && seul) };
  }

  // Le client nommé dans une phrase entière (« qui est le magasinier de l'entreprise ABM ? ») : la société dont tous les
  // mots forts y sont, ou la personne dont le prénom et le nom y sont. null si aucun, ou si deux sociétés conviennent.
  dansPhrase(texte) {
    const Q = motsNom(texte); if (!Q.length || !this.pret) return null;
    const a = (t) => Q.some((w) => sim(w, t) >= 0.92), L = [];
    for (const g of this.groupes) {
      if (g.forts.length && g.forts.every(a)) L.push({ g, contact: null, n: g.forts.length + 0.5 });
      for (const c of g.contacts) if (c.mc.length >= 2 && c.mc.every(a)) L.push({ g, contact: c, n: c.mc.length });
    }
    if (!L.length) return null;
    L.sort((x, y) => y.n - x.n);
    const top = L[0];
    if (L.some((x) => x.g !== top.g && x.n >= top.n)) return null;
    return { g: top.g, contact: (L.find((x) => x.g === top.g && x.contact) || {}).contact || null };
  }

  parCle(cle) { for (const g of this.groupes) { const c = g.contacts.find((x) => x.cle === cle); if (c) return { g, contact: c }; } return null; }
  parSociete(societe) { const k = motsNom(societe).join(''); return (k && this.groupes.find((g) => g.compact === k)) || null; }
  // Le contact habituel d'une société : celui qui a un rendez-vous à venir, sinon le premier de la base.
  principal(g, maintenant = Date.now()) {
    const t = (v) => { const m = /^(\d\d)\/(\d\d)\/(\d{4})(?:\s+(\d\d)h(\d\d))?/.exec(String(v || '')); return m ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 23), +(m[5] || 59)).getTime() : 0; };
    return g.contacts.filter((c) => t(c.visite) >= maintenant).sort((a, b) => t(a.visite) - t(b.visite))[0] || g.contacts[0];
  }
  // Une personne de cette société, par son nom ou sa fonction : voir personneParmi.
  personne(g, dit) { return personneParmi(g.contacts, dit); }

  // Comment nommer un client à voix haute, et le texte de ses contacts pour Gemini.
  qui(g, contact = null) { return `${g.societe}${g.ville && plat(g.ville) !== plat(g.societe) && !plat(g.ville).includes(plat(g.societe)) ? ' à ' + g.ville : g.ville ? ' (' + g.ville + ')' : ''}${contact ? `, ${nomDit(contact.nom)}${contact.fonction ? ' (' + contact.fonction + ')' : ''}` : ''}`; }
  texte(g, { contact = null, mails = false } = {}) {
    const un = (c) => `${c.nom}${c.fonction ? ' (' + c.fonction + ')' : ''}${c.tel ? ', tél. ' + c.tel : ''}${mails && c.mail ? ', ' + c.mail : ''}`;
    const L = [`Client : ${g.societe}${g.code ? ' (compte ' + g.code + ')' : ''}${g.ville ? ', ' + g.ville : ''}`];
    if (g.adresse) L.push('Adresse : ' + g.adresse);
    if (contact) L.push('La personne dont il parle : ' + un(contact));
    L.push(`Contacts (${g.contacts.length}) : ` + g.contacts.slice(0, 14).map(un).join(' ; ') + (g.contacts.length > 14 ? ' ; …' : ''));
    if (this.age() > ANNUAIRE_VIEUX_MS) L.push(`(Annuaire du CRM lu le ${this.date()} : s'il doute d'un numéro, le CRM fait foi.)`);
    return L.join('\n');
  }
}
