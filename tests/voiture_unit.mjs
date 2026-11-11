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

console.log(`\n${ok}/${ok + ko} vérifications réussies`);
process.exit(ko ? 1 : 0);
