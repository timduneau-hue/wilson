// Journal du 12/11/26 (téléphone en voiture, 08h40-09h57, et tablette, 08h25-08h27) : règles et CRM rejoués sans navigateur.
globalThis.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
const V = await import('../js/voiture.js');
const C = await import('../js/crm.js');

let ok = 0, ko = 0;
const check = (nom, cond, det = '') => { if (cond) { ok++; console.log('✅', nom); } else { ko++; console.log('❌', nom, det); } };

// ---------- GPS ----------
for (const t of ['Wilson, amène-moi chez FMA.', 'Je veux aller chez FMA.', 'Défini la destination dans le GPS là.',
  'Et ben, tu m\'emmènes pas au bon endroit. Là, tu m\'emmènes chez Bouygues. Moi, je veux pas aller voir Bouygues, je veux aller voir la société FMA.',
  'Je veux pas aller chez Bouygues Telecom France. Je veux aller chez FMA.', 'Maintenant, tu vas naviguer vers euh', 'Oui, je veux y aller.'])
  check(`GPS demandé : « ${t.slice(0, 60)} »`, V.demandeItineraire(t) === true, String(V.demandeItineraire(t)));
for (const t of ['tu supprime la destination dans le GPS là.', 'Tu supprimes toutes les le GPS là, enlève-le.'])
  check(`GPS à arrêter (jamais relancé) : « ${t} »`, V.demandeItineraire(t) === false && V.arretGuidage(t));
check('« Pourquoi tu as activé le GPS… » reste un refus (06/11/26)', V.demandeItineraire("Et pourquoi tu as activé le GPS alors que j'ai pas dit que on allait à Lèbre ?") === false);
for (const t of ['Mathieu Ongibaud', 'Oui. Oui.', "Et je vais voir Yoann Riou là. Est-ce qu'il y a des sujets auxquels il faut que je pense à lui parler ?"])
  check(`rien sur le GPS : « ${t.slice(0, 50)} »`, V.demandeItineraire(t) === null);

// ---------- L'heure ----------
for (const t of ['お', 'Voilà.', "Bah, c'est pas trop tôt.", "Ça va. Tu peux faire chauffer la voiture, s'il te plaît ?"])
  check(`heure PAS demandée : « ${t} »`, !V.demandeHeure(t));
for (const t of ['Il est quelle heure ?', 'On est quel jour ?', 'Rappelle-moi demain à 8h de rappeler Gallais', 'Mets un minuteur de 10 minutes'])
  check(`heure demandée : « ${t} »`, V.demandeHeure(t));

// ---------- Écriture envoyée à Claude ----------
check('« Enregistre la visite chez Yoann Rousseau… » est une écriture (jamais crm_question)', V.ordreEcriture('Enregistre la visite chez Yoann Rousseau : le client recherche des vis de rechange'));
for (const t of ['briefing Yoann Rousseau FMA', "Qu'est-ce que j'ai noté chez FMA ?", 'sujets boîtes Yoann Rousseau FMA', 'Qui est le magasinier de l\'entreprise FMA ?'])
  check(`question, pas une écriture : « ${t} »`, !V.ordreEcriture(t));

// ---------- Nom dit par Timothée, à une voyelle près ----------
check('« Angibaud » a une source quand Timothée a dit « Ongibaud » (08h46:03)', V.nomsInventes('Tu veux que j\'essaie de naviguer vers Mathieu Angibaud finalement ?', V.motsDe('Mathieu Ongibaud')).length === 0);
check('… mais « Rault » inventé reste repéré', V.nomsInventes('Je vois Sylvain Rault.', V.motsDe('Sylvain Roux Sylvain Motel')).length === 1);

// ---------- CRM : FMA n'est pas Bouygues ----------
const BOUYGUES = { cle: 'C1', societe: 'BOUYGUES E ET S FM FRANCE 548X', contact: 'M DUPONT Paul', ville: 'Verrières-en-Anjou', adresse: 'FGV6+P8 Verrières-en-Anjou', contacts: [], texte: 'Client : BOUYGUES E ET S FM FRANCE 548X' };
const FMA = { cle: 'C2', societe: 'F M A', contact: 'M ANGIBAULT Mathieu', ville: 'La Regrippière', adresse: 'F M A LA REGRIPPIERE',
  contacts: [{ nom: 'M ANGIBAULT Mathieu', tel: '0240565446' }, { nom: 'M ROUSSEAU Yoann', tel: '0240565446', cle: 'C2b' }], texte: 'Client : F M A. Contact : M ANGIBAULT Mathieu (BE). Yoann Rousseau, responsable magasin.' };
check('« FMA » ressemble à « F M A » (sigle écrit lettre par lettre)', C.ressemblance('FMA', { societe: 'F M A', noms: [] }) >= 0.9, C.ressemblance('FMA', { societe: 'F M A', noms: [] }));
check('« FMA » ne ressemble pas à BOUYGUES E ET S FM FRANCE', C.ressemblance('FMA', { societe: BOUYGUES.societe, noms: [BOUYGUES.contact] }) < 0.5, C.ressemblance('FMA', { societe: BOUYGUES.societe, noms: [] }));
check('« Gallet » ressemble toujours à GALLAIS SARL (comme avant)', C.ressemblance('Gallet', { societe: 'GALLAIS SARL', noms: [] }) >= 0.8);
check('« Mathieu Ongibaud » ressemble à F M A (contact Angibault)', C.ressemblance('Mathieu Ongibaud', { societe: FMA.societe, noms: [FMA.contact] }) >= 0.8);

function fauxApp() {
  const L = [];
  return { L, settings: { crm: true }, remote: { on: true }, log: (m) => L.push(m), _turnN: 3, showConfirm: () => {} };
}
async function crmAvec(reponses) {
  localStorage._m = {};                                     // chaque scène part d'un téléphone sans fiche gardée
  const app = fauxApp(), crm = new C.Crm(app), envoyes = [];
  crm.ask = async (p) => { envoyes.push(p); const r = reponses(p); return r ? { ok: true, ...r } : { ok: true, texte: 'Aucun client.' }; };
  return { app, crm, envoyes };
}
{ // le CRM rend Bouygues pour « FMA » ; « F M A » rend le bon client
  const { crm, envoyes } = await crmAvec((p) => (p.client === 'F M A' ? FMA : p.action === 'crm_client' ? BOUYGUES : null));
  const r = await crm.routeTarget({ client: 'FMA' });
  check('GPS « FMA » : réessayé en « F M A » → F M A (La Regrippière), pas Bouygues', r.ok && r.target.societe === 'F M A', JSON.stringify(r).slice(0, 200));
  check('… deux questions au CRM (FMA, puis F M A)', envoyes.map((p) => p.client).join('|') === 'FMA|F M A', envoyes.map((p) => p.client).join('|'));
  const r2 = await crm.routeTarget({ client: 'FMA' });
  check('… et la fiche gardée sert ensuite (« FMA » → F M A, sans Bouygues)', r2.ok && r2.target.societe === 'F M A' && envoyes.length === 2);
}
{ // le CRM ne rend que Bouygues : rien ne part sans confirmation
  const { crm } = await crmAvec((p) => (p.action === 'crm_client' ? BOUYGUES : null));
  const r = await crm.routeTarget({ client: 'FMA' });
  check('GPS « FMA » quand le CRM ne rend que Bouygues : guidage NON lancé, Wilson demande', !r.ok && /ne ressemble pas/.test(r.dire) && /BOUYGUES/.test(r.dire), JSON.stringify(r).slice(0, 200));
  const n = await crm.prepare({ type: 'compte_rendu', client: 'FMA', texte: 'Visite.' });
  check('… et pas de compte rendu sur Bouygues non plus', !n.ok);
  const c = await crm.routeTarget({ client: 'BOUYGUES E ET S FM FRANCE 548X' });
  check('… s\'il confirme Bouygues (nom exact), le guidage part', c.ok && c.target.societe === BOUYGUES.societe);
}
{ // compte rendu pour Yoann Rousseau chez F M A
  const { crm } = await crmAvec((p) => (p.action === 'crm_client' ? FMA : null));
  const r = await crm.prepare({ type: 'compte_rendu', client: 'Yoann Rousseau', texte: "Visite. Le client juge les chaussures de sécurité d'essai trop lourdes.", echange: 'visite' });
  check('Compte rendu « pour Yoann Rousseau » : à son nom, pas à M ANGIBAULT Mathieu (09h53-09h57)', r.ok && /ROUSSEAU Yoann/.test(r.pending.relu) && !/ANGIBAULT/.test(r.pending.relu), r.pending && r.pending.relu);
  check('… sur sa fiche de contact', r.pending.cle === 'C2b' && r.pending.contact === 'M ROUSSEAU Yoann');
  check('… le texte dit avec qui', /^Visite avec M ROUSSEAU Yoann\. Le client/.test(r.pending.texte), r.pending.texte);
  check('… et Gemini sait que la fiche est affichée à l\'écran (09h54:31 « Je ne peux pas l\'afficher »)', /AFFICHÉE à l'écran/.test(r.dire));
  const r2 = await crm.prepare({ type: 'compte_rendu', texte: 'Visite. Vis de ferme-porte GEZE.', echange: 'visite' });
  check('Corrigé sans redire le client : toujours Yoann Rousseau (la personne dont on parle)', r2.ok && /ROUSSEAU Yoann/.test(r2.pending.relu), r2.pending && r2.pending.relu);
  let envoye = null; crm.ask = async (p) => { envoye = p; return { ok: true }; };
  await crm.commit();
  check('… et le contact part avec l\'enregistrement', envoye && envoye.contact === 'M ROUSSEAU Yoann' && envoye.cle === 'C2b', JSON.stringify(envoye));
}
{ // contact nommé à part
  const { crm } = await crmAvec((p) => (p.action === 'crm_client' ? FMA : null));
  const r = await crm.prepare({ type: 'compte_rendu', client: 'FMA', contact: 'Mathieu Angibault', texte: 'Visite.' });
  check('Contact nommé à part (paramètre contact) : le bon contact, texte inchangé', r.ok && /ANGIBAULT/.test(r.pending.relu) && r.pending.texte === 'Visite.', r.pending && r.pending.relu);
}

console.log(`\n${ok}/${ok + ko} vérifications réussies`);
process.exit(ko ? 1 : 0);
