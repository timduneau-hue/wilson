// Protocole voiture (js/voiture.js) sur les phrases du journal du 05/11/26, 14h35-16h04.
import * as V from '../js/voiture.js';

let ok = 0, ko = 0;
const check = (nom, cond, det = '') => { if (cond) { ok++; console.log('✅', nom); } else { ko++; console.log('❌', nom, det); } };

const clients = ['GALLAIS SARL', 'MIROITERIE 35', 'ENTREPRISE CREZE S.A.R.L'];
// Demandes de travail
for (const u of ["Là, je reviens de l'entreprise Gallet. Et où j'ai vu Christophe, mais j'ai aussi vu les deux Sylvain",
  'Vas-y, guide-moi vers euh, Miroiterie 35.', "Donne-moi les autres contacts de l'entreprise Galet.",
  "quelle était la dernière commande de l'entreprise Galet", "Il y a pas besoin d'enregistrer un compte rendu, juste indiquer la date de visite",
  'Oui, tu peux… je vais voir Gallais, tu peux activer le GPS ?', "J'en suis où dans mes clients actifs ce mois-ci ?", 'Appelle Pipard'])
  check(`travail : « ${u.slice(0, 50)} »`, V.estTravail(u, { clients }));
for (const u of ['Il est quelle heure ?', 'Oui.', 'Non, ça va.', "Pour la prochaine mise à jour, en mode voiture ça sert à rien d'activer la caméra", "il fait quel temps demain ?", 'Mais c\'est pas possible ce que tu me racontes là.'])
  check(`pas du travail : « ${u.slice(0, 50)} »`, !V.estTravail(u, { clients }));
check('« Tu peux dire que » n\'est pas « hors travail » (suite d\'une demande de travail)', !V.horsTravail('Tu peux dire que'));
check('« Il est quelle heure ? » est hors travail', V.horsTravail('Il est quelle heure ?'));
check('Écriture : « je reviens de l\'entreprise Gallet, j\'ai vu Christophe »', V.estEcriture("Là, je reviens de l'entreprise Gallet. J'ai vu Christophe"));
check('Itinéraire : « guide-moi vers Miroiterie 35 »', V.estItineraire('Vas-y, guide-moi vers euh, Miroiterie 35.'));

// Ce que Wilson a dit sans outil
const src = V.motsDe("Là, je reviens de l'entreprise Gallet. Et où j'ai vu Christophe, mais j'ai aussi vu les deux Sylvain qu'il y a. Euh Sylvain Roux, il y a pas de Sylvain Roux, j'ai un Sylvain Motel. Client : GALLAIS SARL (compte C2015141), GALLAIS SARL CHAVAGNE Contact : MME AUDRAN Valerie (Directrice). MIROITERIE 35 BRUZ");
const faux = [
  ["Je regarde dans le CRM... Pour l'entreprise Gallet, je vois Christophe et Sylvain Rault, mais je trouve pas de deuxième Sylvain.", ['Rault']],
  ["Je regarde dans le CRM... En plus de Christophe et Sylvain Motel, il y a Marie-Laure Gallet et Sébastien Gallet.", ['Marie-Laure', 'Sébastien']],
  ["Je regarde dans le CRM... j'ai Miroiterie 35 à Rennes. J'affiche l'itinéraire ?", ['Rennes']],
];
for (const [w, noms] of faux) {
  check(`noms inventés repérés : ${noms.join(', ')}`, JSON.stringify(V.nomsInventes(w, src)) === JSON.stringify(noms), JSON.stringify(V.nomsInventes(w, src)));
  check(`… et la phrase ne passe pas sans outil`, !V.sansFait(w, src));
}
check('« C\'est noté, j\'ai ajouté la visite de Sylvain Motel » : affirme un fait (ne passe pas sans outil)', !V.sansFait("C'est noté, j'ai ajouté la visite de Sylvain Motel aujourd'hui pour l'entreprise Gallet.", src));
for (const w of ['Pour quel client ?', 'Tu peux répéter ?', 'Oui ?', 'Tu parles bien de Gallais à Chavagne ?', "Ça marche. Je te fais signe dès que j'ai l'info.", 'Bien reçu. La route continue !'])
  check(`passe sans outil (n'affirme rien) : « ${w} »`, V.sansFait(w, src));
check('Après l\'outil : « Valérie Audran, à Chavagne » a une source', V.nomsInventes('Chez Gallais SARL, à Chavagne, le contact est Valérie Audran.', src).length === 0);
check('Noms propres : début de phrase ordinaire ignoré, capitales gardées', JSON.stringify(V.nomsPropres('Pour Gallais, voilà. MIROITERIE 35 aussi.')) === JSON.stringify(['Gallais', 'MIROITERIE']), JSON.stringify(V.nomsPropres('Pour Gallais, voilà. MIROITERIE 35 aussi.')));
check('Annonce de recherche : « Je regarde dans le CRM… »', V.annonceRecherche('Je regarde dans le CRM...') && !V.annonceRecherche('Tu veux que je note ?'));

// ---------- Journal du 06/11/26 au 10/11/26 (version 1.37.0) ----------
// Guidage lancé sans qu'il le demande (06/11, 08h43:18 et 08h45:13)
check('« le verre » (le nom d\'un client seul) n\'est pas une demande de GPS', !V.estItineraire('le verre'));
check('« Et pourquoi tu as activé le GPS alors que j\'ai pas dit… » : refus du guidage', V.refusItineraire("Et pourquoi tu as activé le GPS alors que j'ai pas dit que on allait à Lèbre ?"));
check('« Arrête, je t\'ai pas demandé d\'y aller » : refus du guidage', V.refusItineraire("Arrête, je t'ai pas demandé d'y aller."));
for (const u of ["tu m'emmènes chez Lebre ?", 'Emmène-moi chez AD2M.', 'Lance le GPS pour Gallais', 'Tu peux me guider vers Miroiterie 35 ?'])
  check(`demande de guidage : « ${u} »`, V.estItineraire(u) && !V.refusItineraire(u));
check('« Oui vas-y » : un oui', V.estOui('Oui vas-y') && !V.estOui('Oui mais pas maintenant, on verra plus tard dans la journée'));
// Didascalies lues à voix haute (09/11, 17h52:33)
check('« (Wilson reste silencieux…) » : didascalie', V.estDidascalie("(Wilson reste silencieux car la conversation ne semble pas s'adresser à lui.)"));
check('« *attend* », « [silence] » : didascalies', V.estDidascalie('*attend*') && V.estDidascalie('[silence]'));
check('Une vraie réponse n\'est pas une didascalie', !V.estDidascalie('Tu as 23 clients actifs ce mois-ci.') && !V.estDidascalie('Je te guide (enfin, Maps te guide).'));
// Reprise d'un résultat déjà reçu (06/11, 08h46:06)
const res0611 = "[La recherche dans le CRM que tu avais lancée pour la question « OBJECTIF CLIENTS ACTIFS Combien de clients actifs ce mois-ci ? » est terminée (84 s). Résultat : Réponse de Claude : « Tu as 23 clients actifs sur 49, donc il t'en manque 26. C'est le chiffre de novembre de l'an dernier qui fixe l'objectif, puisque tu n'en as pas donné. » Dis-la-lui.]";
const rep0611 = "J'ai la réponse à ta question sur les clients actifs. Tu as 23 clients actifs sur 49, donc il t'en manque 26. C'est le chiffre de novembre de l'an dernier qui fixe l'objectif, puisque tu n'en as pas donné.";
check('Reprise mot pour mot d\'un résultat reçu : peut être dite', V.repriseFondee(rep0611, V.motsDe(res0611), [res0611]));
check('… mais pas avec un chiffre changé (27 au lieu de 26)', !V.repriseFondee(rep0611.replace('26', '27'), V.motsDe(res0611), [res0611]));
check('… ni un chiffre qui n\'est nulle part', !V.repriseFondee('Tu as 31 clients actifs.', V.motsDe(res0611), [res0611]));
check('… ni « c\'est noté » (rien n\'est enregistré sans outil)', !V.repriseFondee("C'est noté, 23 clients actifs.", V.motsDe(res0611), [res0611]));
check('Nombres : « 258 576 € » lu comme 258576', JSON.stringify(V.nombresDe('258 576 € et 23 clients')) === '["258576","23"]', JSON.stringify(V.nombresDe('258 576 € et 23 clients')));

// Garde : plus d'aboiements (remarque du 09/11/26, 15h08)
const G = await import('../js/garde.js');
check('Garde : un aboiement n\'est plus noté', G.jugerSons([[69, 0.8], [70, 0.7]], {}, 1e6).length === 0);
check('Garde : la sonnette, toujours', G.jugerSons([[349, 0.6]], {}, 1e6).some((e) => e.genre === 'sonnette'));

// Limite d'utilisation de Claude (10/11, 08h47:23)
const C = await import('../js/claude.js');
check('« You\'ve hit your weekly limit · resets 4am » : limite', C.limiteAtteinte("You've hit your weekly limit · resets 4am (Europe/Paris)"));
check('Une vraie réponse n\'est pas la limite', !C.limiteAtteinte('Tu as 23 clients actifs, la limite de crédit de Gallais est de 5 000 €.') && !C.limiteAtteinte("La température limite d'utilisation de ce joint est de 120 °C."));
check('Erreur du relais 4 : « limite d\'utilisation de Claude atteinte »', C.limiteAtteinte("limite d'utilisation de Claude atteinte : You've hit your weekly limit · resets 4am"));
const r4 = new Date(C.repriseLimite("You've hit your weekly limit · resets 4am (Europe/Paris)", new Date(2026, 10, 10, 8, 47)));
check('Reprise : le lendemain à 4 h', r4.getDate() === 11 && r4.getHours() === 4 && r4.getMinutes() === 0, r4.toString());
const r5 = new Date(C.repriseLimite('limit · resets 5:30pm', new Date(2026, 10, 10, 8, 47)));
check('Reprise : « 5:30pm » → 17 h 30 le jour même', r5.getDate() === 10 && r5.getHours() === 17 && r5.getMinutes() === 30, r5.toString());
check('Phrase dite : « Claude a atteint sa limite d\'utilisation »', /limite d'utilisation/.test(C.phraseIndispo('limite')));

// Réglages communs : l'adresse du script (avec sa clé) ne se partage jamais (11/11/26, 08h42 : remplacée par l'ancienne)
const S = await import('../js/sync.js');
const local = { apiKey: 'A', logUrl: 'https://script.google.com/macros/s/AKfycbTEST/exec?k=0123456789abcdef0123456789abcdef', crm: true, _t: 5 };
const chg = S.mergeInto(local, { apiKey: 'A', logUrl: 'https://script.google.com/macros/s/AKfycbTEST/exec', crm: false, _t: 9 }, S.HORS_SYNCHRO);
check('Synchronisation : l\'adresse du script avec sa clé n\'est jamais remplacée par celle des réglages communs', /\?k=/.test(local.logUrl) && !chg.includes('logUrl') && local.crm === false, JSON.stringify(local));
check('… ni envoyée aux autres appareils par la synchronisation', !('logUrl' in S.shareable(local, S.HORS_SYNCHRO)));
check('… mais gardée dans le lien de copie des réglages (geste volontaire)', 'logUrl' in S.shareable(local));
{ // W10 : lien de copie chiffré par un code à 4 chiffres
  const reg = { apiKey: 'AIzaSECRETSECRETSECRET', logUrl: 'https://script.google.com/macros/s/AKfycbX/exec?k=CLESECRETE', haToken: 'jeton-ha', voice: 'Charon', _t: 5 };
  const code = S.nouveauCodeCopie(), BASE = 'https://exemple.github.io/wilson/';
  check('W10 : code de copie à 4 chiffres', /^\d{4}$/.test(code) && new Set(Array.from({ length: 30 }, () => S.nouveauCodeCopie())).size > 5);
  const lien = await S.settingsLinkChiffre(reg, { voice: 'Aoede' }, code, BASE);
  check('W10 : le lien chiffré commence par #reglages2= et ne montre ni clé, ni adresse, ni jeton', lien.startsWith(BASE + '#reglages2=') && !/AIza|SECRET|CLESECRETE|jeton-ha|Charon/.test(lien));
  const lu = await S.dechiffrerReglages(lien.split('#reglages2=')[1], code);
  check('W10 : avec le bon code, tout revient (clé, adresse du script, jeton Home Assistant, voix)', lu.apiKey === reg.apiKey && lu.logUrl === reg.logUrl && lu.haToken === 'jeton-ha' && lu.voice === 'Charon' && lu._t === 5);
  const faux = code === '0000' ? '1111' : '0000';
  check('W10 : avec un mauvais code → refusé', await S.dechiffrerReglages(lien.split('#reglages2=')[1], faux).then(() => false, () => true));
  const p = lien.split('#reglages2=')[1], alt = p.slice(0, -4) + (p.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');
  check('W10 : lien abîmé ou modifié → refusé', await S.dechiffrerReglages(alt, code).then(() => false, () => true) && await S.dechiffrerReglages('abc', code).then(() => false, () => true));
  const lien2 = await S.settingsLinkChiffre(reg, {}, code, BASE);
  check('W10 : deux liens du même contenu sont différents (sel et vecteur aléatoires)', lien2 !== lien); }
{ const m = { haUrl: 'https://ha.exemple.ts.net', haToken: 'secret', voice: 'Aoede', _t: 1 };
  check('W9 : l’adresse et le jeton Home Assistant ne partent pas par la synchronisation', !('haToken' in S.shareable(m, S.HORS_SYNCHRO)) && !('haUrl' in S.shareable(m, S.HORS_SYNCHRO)) && 'voice' in S.shareable(m, S.HORS_SYNCHRO));
  const l2 = { haToken: 'local', voice: 'x' }; S.mergeInto(l2, { haToken: 'distant', haUrl: 'https://autre', voice: 'Aoede', _t: 2 }, S.HORS_SYNCHRO);
  check('W9 : et ceux des autres appareils ne remplacent pas ceux de l’appareil', l2.haToken === 'local' && !l2.haUrl && l2.voice === 'Aoede');
  check('W9 : mais le lien de copie les garde (geste volontaire)', 'haToken' in S.shareable(m)); }


// ---------- Journal du 12/11/26, 08h41-09h57 (téléphone en voiture, 1.41.1) ; noms de clients changés ----------
// Demander d'y aller
for (const u of ['Wilson, amène-moi chez ABM.', 'Je veux aller chez ABM.', 'Défini la destination dans le GPS là.', 'Maintenant, tu vas naviguer vers euh', 'Oui, je veux y aller.', "Il faut que j'aille chez Lebre"])
  check(`demande d'y aller : « ${u} »`, V.guidageDit(u) === 'oui', V.guidageDit(u));
check('« Je veux pas aller chez Grandbat. Je veux aller chez ABM. » : demande (refusée à tort le 12/11, 08h45:25)', V.guidageDit('Je veux pas aller chez Grandbat Telecom France. Je veux aller chez ABM.') === 'oui');
check("« tu m'emmènes pas au bon endroit… je veux pas aller voir Grandbat, je veux aller voir la société ABM » : demande (08h44:11)",
  V.guidageDit("Et ben, tu m'emmènes pas au bon endroit. Là, tu m'emmènes chez Grandbat. Moi, je veux pas aller voir Grandbat, je veux aller voir la société ABM.") === 'oui');
check('… et le client refusé est Grandbat, pas ABM', V.clientRefuse("Moi, je veux pas aller voir Grandbat, je veux aller voir la société ABM.", 'Grandbat E et S') && !V.clientRefuse("Moi, je veux pas aller voir Grandbat, je veux aller voir la société ABM.", 'ABM'));
check('« Là, tu m\'emmènes chez Grandbat, je veux pas ! » : reproche', V.guidageDit("Là, tu m'emmènes chez Grandbat, je veux pas !") === 'non');
check('« pourquoi tu as activé le GPS alors que j\'ai pas dit qu\'on allait à Lèbre ? » : reproche (06/11)', V.guidageDit("Et pourquoi tu as activé le GPS alors que j'ai pas dit que on allait à Lèbre ?") === 'non');
check('« Tu m\'emmènes chez Lebre ? » : demande', V.guidageDit("Tu m'emmènes chez Lebre ?") === 'oui');
for (const u of ['tu supprime la destination dans le GPS là.', 'Tu supprimes toutes les le GPS là, enlève-le.', 'Arrête le guidage', 'Coupe la navigation', "J'ai plus besoin du GPS"])
  check(`arrêter le guidage : « ${u} » (relancé deux fois le 12/11)`, V.guidageDit(u) === 'arret' && V.estArretGuidage(u), V.guidageDit(u));
for (const u of ['Mathieu Onjubaud', 'Oui. Oui.', 'Voilà.', 'Qui est le magasinier chez ABM ?', 'Je vais voir Yoann là, il y a des sujets à aborder ?'])
  check(`ni demande ni refus de guidage : « ${u} »`, V.guidageDit(u) === '', V.guidageDit(u));
check('Wilson propose d\'y aller : « Tu veux que j\'essaie de naviguer vers Mathieu Onjubaud finalement ? » (son « oui » refusé le 12/11, 08h46:17)',
  V.proposeGuidage("Pardon, je me suis trompé. Je ne lance rien. Tu veux que j'essaie de naviguer vers Mathieu Onjubaud finalement ?") && V.proposeGuidage('Je te guide vers ABM à La Roche, c\'est bien ça ?') && !V.proposeGuidage("C'est parti, je te guide vers ABM."));
// L'heure non demandée
for (const u of ['Voilà.', "Bah, c'est pas trop tôt.", 'お', 'Défini la destination dans le GPS là.', "Et je m'en fous de l'heure. Je t'ai pas demandé l'heure.", "Arrête de me dire l'heure à chaque fois, bordel."])
  check(`il n'a pas demandé l'heure : « ${u} »`, !V.demandeHeure(u));
for (const u of ['Il est quelle heure ?', 'On est quel jour ?', 'Rappelle-moi à 18h de sortir les poubelles', "C'est quoi la date d'aujourd'hui ?", 'Mets un minuteur de dix minutes'])
  check(`il a demandé l'heure, ou un outil qui en a besoin : « ${u} »`, V.demandeHeure(u));
// Réactions : pas des demandes de travail, même juste après une
for (const u of ['Voilà.', "Bah, c'est pas trop tôt.", 'お', 'Bon maintenant euh', 'Ah, tu bugues, hein. Et tu mettras ça dans les mises à jour. Ça va pas du tout.', "Et je m'en fous de l'heure. Je t'ai pas demandé l'heure.", "Mais c'est nul ça."])
  check(`réaction (ne verrouille pas le tour) : « ${u} »`, V.estReaction(u));
for (const u of ['Mathieu Onjubaud', 'Et son numéro ?', 'Et lui ?', 'Il y a aucun sujet concernant des boîtes ?', 'Oui, vas-y, enregistre-le.', 'Combien ?', 'Chez Lebre', 'Et hier ?', 'Je viens de rencontrer Yohan Moreau.'])
  check(`pas une simple réaction (reste du travail après une demande de travail) : « ${u} »`, !V.estReaction(u));
// « Autre chose ? »
for (const u of ["C'est noté. Je comprends. Excuse-moi. Tu as besoin de quelque chose d'autre maintenant ?", "C'est noté. j'ai pris en note ta remarque pour l'amélioration de Wilson. Tu as besoin d'autre chose ?",
  "C'est prêt dans le CRM, dans tes tâches : tu pourras le valider quand tu seras garé. Autre chose ?", 'Tu as une autre question ?', 'Je cherche. Tu veux autre chose pendant ce temps ?', "Est-ce que je peux faire autre chose pour toi ?"])
  check(`fin de trop : « …${u.slice(-45)} »`, !!V.finDeTrop(u), V.finDeTrop(u));
check('… et c\'est seulement la question finale', V.finDeTrop("C'est noté. Tu as besoin d'autre chose ?") === "Tu as besoin d'autre chose ?");
for (const u of ['Pour quel client ?', "Je l'enregistre ?", 'Je te guide vers ABM à La Roche, c\'est bien ça ?', 'Avec qui, chez ABM ?', "Tu as trois non lus, et aucun n'est important.", 'Tu veux noter autre chose. Je le relis.', "Qu'est-ce que tu veux changer dans ce compte rendu ?"])
  check(`pas une fin de trop : « ${u} »`, !V.finDeTrop(u), V.finDeTrop(u));

console.log(`\n${ok}/${ok + ko} vérifications réussies`);
process.exit(ko ? 1 : 0);
