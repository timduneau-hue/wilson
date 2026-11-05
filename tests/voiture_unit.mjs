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

console.log(`\n${ok}/${ok + ko} vérifications réussies`);
process.exit(ko ? 1 : 0);
