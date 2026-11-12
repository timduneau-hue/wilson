// L'annuaire du CRM gardé sur l'appareil (js/annuaire.js) : retrouver le client ET la personne, sur les phrases du
// journal du 12/11/26 (téléphone en voiture). Noms de société et de personnes inventés, sauf la forme des cas vécus.
import { Annuaire, motsNom, sim, nomDit, cleContact, CLE_ANNUAIRE } from '../js/annuaire.js';

let ok = 0, ko = 0;
const check = (nom, cond, det = '') => { if (cond) { ok++; console.log('✅', nom); } else { ko++; console.log('❌', nom, det); } };

// champs : societe, contact, fonction, code, ville, adresse, tel, mail, visite
const L = (societe, contact, fonction, code, ville, adresse, tel = '', visite = '') => [societe, contact, fonction, code, ville, adresse, tel, '', visite];
const CONTACTS = [
  L('A B M', 'M ANJUBAULT Mathieu', 'BE', 'C2000001', 'A B M LA ROCHE', 'A B M LA ROCHE', '02 40 00 00 01'),
  L('A B M', 'M MOREAU Yoann', 'Responsable magasin', 'C2000001', 'A B M LA ROCHE', 'A B M LA ROCHE', '02 40 00 00 01'),
  L('A B M', 'M LEMERCIER Valentin', 'Resp. commercial', 'C2000001', 'A B M LA ROCHE', 'A B M LA ROCHE', '06 00 00 00 02'),
  L('A B M', 'MME PERROT Carole', "Chargée d'étude de prix", 'C2000001', 'A B M LA ROCHE', 'A B M LA ROCHE', '02 55 00 00 03'),
  L('GRANDBAT E ET S AB FRANCE 548X', 'M DURAND Paul', 'Acheteur', 'C1000001', 'Verrières-en-Anjou', 'FGV6+P8 Verrières-en-Anjou', '02 41 00 00 04'),
  L('GALLOIS SARL', 'M MOREAU Christophe', 'Gérant', 'C1000002', 'Chavagne', '3 rue des Lilas 35310 Chavagne', '02 99 00 00 05'),
  L('LES ATELIERS GOUDET', 'M MOREAU Clément', '', 'C1000003', 'Angers', '49000 Angers'),
  L('TECMETALU SARL', 'M BESSIERE Romain', 'Dirigeant', 'C1000004', 'Janzé', '35150 Janzé', '02 99 00 00 06', '17/11/2099 11h00'),
  L('TECMETALU SARL', 'MME MARTIN Julie', 'Comptable', 'C1000004', 'Janzé', '35150 Janzé'),
  L('LEBRE', 'M LEBRE Jean', '', 'C1000005', 'Vigneux-de-Bretagne', '44360 Vigneux-de-Bretagne', '06 11 22 33 44'),
  L('A D 2 M', 'M MARTIN Luc', '', 'C1000006', 'Le Mans', '72000 Le Mans'),
  L('MIROITERIE 35', 'M CHEVANCE Benoit', '', 'C1000007', 'Bruz', '35170 Bruz'),
  L('ENTREPRISE CREZE', 'M CREZE Yann', '', 'C1000008', 'Saint-Jacques-de-la-Lande', '35136 Saint-Jacques-de-la-Lande'),
  L('ENTREPRISE VIOLIN', 'M VIOLIN Marc', '', 'C1000009', 'Rennes', '35000 Rennes'),
  L('LAPIERRE MENUISERIE', 'M LAPIERRE Guy', '', 'C1000010', 'Cholet', '49300 Cholet'),
  L('DUPONT FERMETURES', 'M DUPONT Alain', '', 'C1000011', 'Saumur', '49400 Saumur'),
  L('DUPONT FERMETURES', 'M DUPONT Eric', '', 'C1000012', 'Cholet', '49300 Cholet'),
  L('', 'M PROSPECT Seul', '', '', '', ''),
];
const boite = new Map(), stockage = { lire: (k) => (boite.has(k) ? boite.get(k) : null), ecrire: (k, v) => { boite.set(k, JSON.stringify(v)); return true; } };
const A = new Annuaire({ stockage });
check('Vide au départ : pas prêt, à relire', !A.pret && A.aRelire());
check('Réponse du CRM refusée ou vide : rien de chargé', !A.charger({ ok: false, erreur: 'action inconnue' }) && !A.charger({ ok: true, contacts: [] }) && !A.pret);
check('Chargé depuis la réponse du CRM', A.charger({ ok: true, contacts: CONTACTS, le: '12/11/2026 08h40' }) && A.pret && A.n === CONTACTS.length, `${A.n}`);
check('Une société = un client (ses contacts regroupés)', A.groupes.find((g) => g.societe === 'A B M').contacts.length === 4);
check('Gardé sur l’appareil, relu au démarrage suivant', new Annuaire({ stockage }).n === CONTACTS.length && !new Annuaire({ stockage }).aRelire());
check('Clé de contact = celle du CRM', cleContact('M MOREAU Yoann', 'A B M') === '["M MOREAU Yoann","A B M"]');

// --- les mots ---
check('« A B M » = un seul mot « abm » (sigle lettre par lettre)', motsNom('A B M').join() === 'abm' && motsNom('la société A B M').join() === 'abm');
check('« A D 2 M » = « ad2m »', motsNom('A D 2 M').join() === 'ad2m');
check('« M MOREAU Yoann » : la civilité ne compte pas', motsNom('M MOREAU Yoann').join() === 'moreau,yoann');
check('« abm » ne ressemble pas à « ab » (12/11/26, 08h42 : Grandbat … AB France)', sim('abm', 'ab') === 0 && sim('abm', 'abm') === 1);
check('« Yohan » ≈ « Yoann », « Gallet » ≈ « Gallois » (retrouvés à l’oreille)', sim('yohan', 'yoann') >= 0.86 && sim('gallet', 'gallois') >= 0.78);
check('Nom à dire : « M MOREAU Yoann » → « Yoann Moreau »', nomDit('M MOREAU Yoann') === 'Yoann Moreau' && nomDit('MME PERROT Carole') === 'Carole Perrot');

// --- le client ---
const un = (q) => { const r = A.choisir(q); return r.un ? r.un.g.societe + (r.un.contact ? ' / ' + r.un.contact.nom : '') + (r.sur ? ' ✓' : ' ?') : r.plusieurs ? 'PLUSIEURS : ' + r.plusieurs.map((x) => x.g.societe).join(' | ') : 'RIEN'; };
check('« ABM » → A B M, sûr (pas Grandbat E et S AB France)', un('ABM') === 'A B M ✓', un('ABM'));
check('« chez ABM » → A B M', un('chez ABM') === 'A B M ✓', un('chez ABM'));
check('« A B M » → A B M', un('A B M') === 'A B M ✓', un('A B M'));
check('« Grandbat » → Grandbat, sûr', un('Grandbat') === 'GRANDBAT E ET S AB FRANCE 548X ✓', un('Grandbat'));
check('« Mathieu Onjubaud » → A B M, Mathieu Anjubault, sûr (prénom exact, nom proche, un seul)', un('Mathieu Onjubaud') === 'A B M / M ANJUBAULT Mathieu ✓', un('Mathieu Onjubaud'));
check('« Yoann Moreau » → A B M et Yoann Moreau (pas le premier contact de la fiche)', un('Yoann Moreau') === 'A B M / M MOREAU Yoann ✓', un('Yoann Moreau'));
check('« Yohan Moreau » (mal écrit) → le même', un('Yohan Moreau') === 'A B M / M MOREAU Yoann ✓', un('Yohan Moreau'));
check('« Johann Moreau » (09h57) → le même, sûr', un('Johann Moreau') === 'A B M / M MOREAU Yoann ✓', un('Johann Moreau'));
check('« Yoann Moreau ABM » → le même', un('Yoann Moreau ABM') === 'A B M / M MOREAU Yoann ✓', un('Yoann Moreau ABM'));
check('« Moreau » seul : trois sociétés possibles → il les cite', /^PLUSIEURS/.test(un('Moreau')) && ['A B M', 'GALLOIS SARL', 'LES ATELIERS GOUDET'].every((s) => un('Moreau').includes(s)), un('Moreau'));
check('« Moreau chez Gallois » → Gallois, Christophe', un('Moreau chez Gallois') === 'GALLOIS SARL / M MOREAU Christophe ✓', un('Moreau chez Gallois'));
check('« Gallet » → Gallois, à faire confirmer (nom approximatif)', un('Gallet') === 'GALLOIS SARL ?', un('Gallet'));
check('« Tech Metallu » → Tecmetalu, à faire confirmer', un('Tech Metallu') === 'TECMETALU SARL ?', un('Tech Metallu'));
check('« AB » → Grandbat … AB France (le sigle exact), pas A B M', un('AB').startsWith('GRANDBAT'), un('AB'));
check('« AD2M » → A D 2 M', un('AD2M') === 'A D 2 M ✓', un('AD2M'));
check('« Lebre » → Lebre', un('Lebre').startsWith('LEBRE'), un('Lebre'));
check('« Miroiterie 35 » → Miroiterie 35', un('Miroiterie 35') === 'MIROITERIE 35 ✓', un('Miroiterie 35'));
check('« la pierre » → Lapierre', un('la pierre').startsWith('LAPIERRE MENUISERIE'), un('la pierre'));
check('« Dupont » : deux Dupont Fermetures (Saumur, Cholet) → il demande lequel', /^PLUSIEURS/.test(un('Dupont')), un('Dupont'));
check('« Dupont à Cholet » → celui de Cholet', un('Dupont à Cholet').startsWith('DUPONT FERMETURES') && A.choisir('Dupont à Cholet').un.g.ville === 'Cholet', un('Dupont à Cholet'));
check('« Crézé » → Entreprise Crézé (« entreprise » ne pèse pas)', un('Crézé').startsWith('ENTREPRISE CREZE'), un('Crézé'));
check('Code client dit : « C1000005 » → Lebre', un('le compte C1000005') === 'LEBRE ✓', un('le compte C1000005'));
check('Inconnu : « Zorglub » → rien (le CRM sera interrogé)', un('Zorglub') === 'RIEN', un('Zorglub'));
check('Nom vide ou mots vides → rien', un('') === 'RIEN' && un('chez le client') === 'RIEN');
check('Nom à moitié reconnu : pas « sûr » (il fera confirmer)', (() => { const r = A.choisir('Tecmétal Industrie Rennes'); return !r.un || !r.sur; })(), un('Tecmétal Industrie Rennes'));

// --- la personne ---
const abm = A.choisir('ABM').un.g;
check('« le magasinier » chez A B M → Yoann Moreau (par sa fonction)', (A.personne(abm, 'le magasinier').contact || {}).nom === 'M MOREAU Yoann', JSON.stringify(A.personne(abm, 'le magasinier')));
check('« Moreau » chez A B M → Yoann', (A.personne(abm, 'Moreau').contact || {}).nom === 'M MOREAU Yoann');
check('« Carole » chez A B M → Carole Perrot', (A.personne(abm, 'Carole').contact || {}).nom === 'MME PERROT Carole');
check('Personne inconnue chez A B M → rien', !A.personne(abm, 'Sylvain Motel').contact && !A.personne(abm, 'Sylvain Motel').plusieurs);
check('Contact habituel : celui qui a un rendez-vous à venir', A.principal(A.choisir('Tecmetalu').un.g).nom === 'M BESSIERE Romain' && A.principal(abm).nom === 'M ANJUBAULT Mathieu');
check('Retrouvé par sa clé du CRM', A.parCle('["M MOREAU Yoann","A B M"]').contact.fonction === 'Responsable magasin' && !A.parCle('["X","Y"]'));
check('Retrouvé par le nom exact de la société', A.parSociete('A B M') === abm && A.parSociete('ABM') === abm && !A.parSociete('Inconnue'));

// --- ce que Gemini reçoit ---
const t = A.texte(abm, { contact: abm.contacts[1] });
check('Texte des contacts : société, adresse, la personne, fonctions et téléphones', /Client : A B M \(compte C2000001\)/.test(t) && /Adresse : A B M LA ROCHE/.test(t) && /La personne dont il parle : M MOREAU Yoann \(Responsable magasin\), tél\. 02 40 00 00 01/.test(t) && /MME PERROT Carole/.test(t), t);
check('… sans les e-mails (sauf demande)', !/@/.test(A.texte(abm)));
check('Comment le nommer : société, ville, personne', A.qui(A.choisir('Gallet').un.g) === 'GALLOIS SARL à Chavagne' && /Yoann Moreau \(Responsable magasin\)/.test(A.qui(abm, abm.contacts[1])), A.qui(abm, abm.contacts[1]));
const vieux = new Annuaire({ stockage: { lire: () => JSON.stringify({ at: Date.now() - 30 * 3600000, contacts: CONTACTS }), ecrire: () => true } });
check('Annuaire d’hier : prêt (sans réseau), à relire, et il dit de quand il date', vieux.pret && vieux.aRelire() && /Annuaire du CRM lu le/.test(vieux.texte(vieux.groupes[0])));
check('Stockage illisible : annuaire vide, sans erreur', !new Annuaire({ stockage: { lire: () => '{pas du json', ecrire: () => true } }).pret);
check('Clé de stockage', CLE_ANNUAIRE === 'wilson.annuaire' && boite.has(CLE_ANNUAIRE));

console.log(`\n${ok}/${ok + ko} vérifications réussies`);
process.exit(ko ? 1 : 0);
