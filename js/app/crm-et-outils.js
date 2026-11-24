// Wilson — méthodes de la classe App (js/app.js) : outils du CRM, de la maison, de la famille, questions, analyste, Claude du PC, réponses en retard.
// Rangées ici le 24/11/26, recopiées telles quelles ; js/app.js les ajoute à App.prototype (même « this », même comportement).
import { deviceName } from '../remote.js';
import { CRM_TOOLS, pourGemini, parseJour } from '../crm.js';
import { Maison, MAISON_TOOLS } from '../maison.js';
import { OUTILS } from '../outils.js';
import { ANALYSE_MAX_MS, reglesCRM } from '../analyste.js';
import { CLAUDE_TOOL, MAIL_TOOL, phraseIndispo } from '../claude.js';
import { Qui } from '../qui.js';
import { Famille, FAMILLE_TOOLS, FAMILLE_PAS_A_LUI } from '../famille.js';
import { QUESTION_TOOL, PROPRIO as PROPRIO_NOM } from '../questions.js';
import * as VP from '../voiture.js';
import { hhmm, appli, pont, VOITURE_ETAT_MS, CRM_MAX_MS, FIN_PHRASE_MS, FIN_PHRASE_SUITE_MS, FIN_PHRASE_REPRISE_MS, FIN_PHRASE_MAX_MS, JOURS, pad, $, sleep, OBJECTIF_Q, MOIS, actifsDuBilan, actifsSimple, OBJECTIF_NB, nombre, shorten, isNetErr } from './commun.js';

export class CrmMethodes {

  // ---------- CRM à la voix (PLAN 2 quater) ----------
  _extraTools() { return [...OUTILS, ...FAMILLE_TOOLS, QUESTION_TOOL, ...(this.crm.on ? CRM_TOOLS : []), ...(this.claude.on ? [CLAUDE_TOOL, MAIL_TOOL] : []), ...(this.maison.on ? MAISON_TOOLS : [])]; }

  // Ce que Timothée dit, horodaté, avec le numéro du tour : le verrou n'accepte qu'un « oui » d'un tour APRÈS la relecture (C2).
  _noteHeard(text, whole = false) {
    const now = performance.now(), h = this._heard, last = h[h.length - 1];
    if (!whole && last && last.n === this._turnN) { last.text = text; last.t = now; }
    else h.push({ t: now, text: String(text || ''), n: whole ? -1 : this._turnN });
    if (h.length > 30) h.splice(0, h.length - 30);
  }

  // Règle de Timothée du 06/11/26, 00h39 : « il n'y a que moi, Timothée, qui peux poser des questions sur le CRM. Personne
  // d'autre. Analyse le visage. Sauf quand ça vient du téléphone et que je suis en voiture. » Le visage regardé, reconnu SUR
  // CET APPAREIL (sûr : 2 analyses sur 3), doit être celui de Timothée ; sur le téléphone en voiture (relié à la voiture, ou
  // mode voiture), pas besoin. Une tablette en « mode voiture » n'y échappe pas.
  _crmAutorise() {
    const tel = !!(this.famille && this.famille.telephone);
    if (tel && this.enVoiture) return { ok: true, pourquoi: 'téléphone en voiture' };
    const P = this.qui ? this.qui.qui() : null;
    if (P && P.sur && VP.plat(P.nom) === 'timothee') return { ok: true, pourquoi: 'visage de Timothée' };
    return { ok: false, tel, camera: !!this.vision, qui: P && P.sur ? P.nom : P && P.inconnu ? 'quelqu\'un que je ne connais pas' : '', appris: !!(this.qui && this.qui.trouver('Timothée')) };
  }

  // Résultat d'un outil du CRM : info (texte pour Gemini) et, pour le mode économique, dire (phrase toute prête).
  async _crmRun(name, a, signal, { heard } = {}) {
    const C = this.crm, car = this.enVoiture;
    if (!C.on) return { info: "Le CRM n'est pas relié à Wilson sur cet appareil (Réglages → CRM). Dis-le simplement.", dire: "Le CRM n'est pas relié sur cet appareil." };
    const aut = this._crmAutorise();
    if (!aut.ok) {
      this.log(`CRM refusé (${name}) : ${aut.qui ? `c'est ${aut.qui} qui me regarde` : 'je ne reconnais pas Timothée'} — le CRM est réservé à Timothée`, true);
      const dire = aut.qui && aut.qui !== 'quelqu\'un que je ne connais pas' ? `Désolé ${aut.qui}, le CRM, c'est seulement pour Timothée.`
        : !aut.camera ? `Le CRM, c'est seulement pour Timothée : ${aut.tel ? 'hors de la voiture, ' : ''}je dois voir ton visage, et la caméra est coupée${aut.tel ? ' (Réglages), ou relie le téléphone à la voiture' : ''}.`
          : !aut.appris ? (aut.tel ? "Le CRM, c'est seulement pour Timothée, et je n'ai pas encore reçu son visage de la tablette du salon : il arrive tout seul sur le téléphone quand il y est appris." : "Le CRM, c'est seulement pour Timothée, et je ne connais pas encore son visage sur cet appareil : Timothée, dis-moi « apprends mon visage, je suis Timothée ».")
          : "Le CRM, c'est seulement pour Timothée, et je ne le reconnais pas là : regarde-moi bien et redemande.";
      return { echec: true, info: `REFUSÉ : le CRM est réservé à Timothée (règle de Timothée) et ${aut.qui ? `c'est ${aut.qui} qui te regarde` : 'tu ne reconnais pas son visage en ce moment'}. Dis seulement : « ${dire} » Aucune information du CRM.`, dire };
    }
    const lu = (r) => (r.ok ? { info: pourGemini(r.texte, car) } : { info: `Le CRM ne répond pas : ${r.erreur || 'erreur'}. Dis-le simplement.`, dire: 'Le CRM ne répond pas pour le moment.' });
    switch (name) {
      case 'crm_client': {
        let r;
        try { r = await C.client({ client: a.client || '' }, signal); }
        catch (err) {
          // Pas de réseau vers le CRM : l'annuaire gardé sur le téléphone donne au moins ses coordonnées et ses contacts.
          if (!isNetErr(err) || !C.annuaire.pret) throw err;
          const k = await C.contacts({ client: a.client || '' }, signal).catch(() => null);
          if (!k || !k.ok) throw err;
          this.log('CRM sans réseau : coordonnées et contacts donnés depuis l\'annuaire gardé sur le téléphone');
          return { info: `(Pas de réseau vers le CRM pour l'instant : tu n'as que ses coordonnées et ses contacts, gardés sur le téléphone. Dis-le en quelques mots ; pour ses visites, ses commandes et ses chiffres, il faudra du réseau.)\n${k.texte}\nRéponds seulement avec ces informations, en une ou deux phrases.` };
        }
        if (!r.ok) return lu(r);
        if (!r.e) return { info: r.texte };                                         // inconnu, ou plusieurs clients possibles
        const P = r.contactDit;                                                     // la personne par laquelle il a désigné le client
        const e = r.e, qui = `${e.societe}${P ? ' (' + P.nom + ')' : e.contact ? ' (' + e.contact + ')' : ''}${e.ville ? ', ' + e.ville : ''}`;
        // C10 : nom entendu approximatif → il cite d'abord le client trouvé ; C8 bis : fiche gardée faute de réseau
        const avant = [r.parmi ? `(Le CRM propose plusieurs clients pour « ${a.client} » : ${r.parmi.slice(0, 300)} J'ai pris ${qui}, celui dont vous parliez : commence par ce nom et demande-lui si c'est bien lui avant toute autre chose.)`
          : r.approx ? `(Nom entendu : « ${a.client} » ; le CRM a trouvé ${qui}. Commence ta réponse par ce nom, pour qu'il puisse te corriger si ce n'est pas le bon client.)` : '',
          r.vieux ? `(Pas de réseau vers le CRM : fiche telle qu'elle était à ${new Date(r.vieux).getHours()}h${pad(new Date(r.vieux).getMinutes())} ; dis-le s'il demande un chiffre récent.)` : '',
          P && P.nom !== e.contact ? `(Il parle de ${P.nom}${P.fonction ? ', ' + P.fonction : ''}${P.tel ? ', tél. ' + P.tel : ''}, chez ${e.societe} : réponds pour cette personne.)` : '',
          await this._boutonSuit(e, signal)].filter(Boolean).join('\n');
        return { info: pourGemini((avant ? avant + '\n' : '') + e.texte, car) };
      }
      case 'crm_contacts': {                                                         // l'annuaire gardé sur l'appareil : immédiat
        const r = await C.contacts({ client: a.client || '' }, signal);
        if (!r.ok) return { info: r.dire };
        return { info: `${r.texte}\n${a.question ? `Sa question : « ${String(a.question).slice(0, 200)} ». ` : ''}Réponds à sa question avec ces informations seulement (n'invente rien) : ${car ? 'une ou deux phrases très courtes, il conduit' : 'une à deux phrases'} ; dis les noms comme on les dit (« Jean Dupont », pas « M DUPONT Jean ») et un numéro chiffre par chiffre seulement s'il le demande. Ce qui n'y est pas (visites, commandes, chiffres) : crm_client ou crm_question.` };
      }
      case 'crm_agenda': return lu(await this._journee(a.jour, signal));
      case 'crm_bilan': {
        const r = await C.bilan(signal), res = lu(r), A = r.ok ? actifsDuBilan(r.texte) : null;
        if (A) res.info += '\n' + this._actifsTexte(A).info;
        return res;
      }
      case 'crm_actifs': {                                                            // question simple sur les clients actifs
        const r = await this._actifs(a, signal);
        return r || { info: 'Le bilan du CRM ne donne pas les clients actifs : appelle crm_question avec sa question complète.' };
      }
      case 'crm_produit': return lu(await C.produit(a.produit || '', a.question, signal));
      case 'crm_question': {                                                          // C11 : toutes les autres questions
        const q = String(a.demande || (/^(qui_achete|infos)$/.test(a.question || '') ? '' : a.question) || '').trim();
        if (!q) return { info: 'Il manque la question : demande-lui ce qu\'il veut savoir.', dire: 'Qu\'est-ce que tu veux savoir exactement ?' };
        if (actifsSimple(q)) { const r = await this._actifs(a, signal); if (r) return r; }
        const DR = C.dernier && Date.now() - C.dernier.at < 30 * 60000 ? C.dernier : null;
        let last = DR ? `Dernier client dont vous avez parlé : ${DR.soc.societe}${DR.soc.ville ? ', ' + DR.soc.ville : ''}${DR.contact ? ` ; la personne : ${DR.contact.nom}${DR.contact.fonction ? ' (' + DR.contact.fonction + ')' : ''}` : ''}.`
          : C.last ? `Dernier client dont vous avez parlé : ${C.last.societe}${C.last.contact ? ' (' + C.last.contact + ')' : ''}.` : '';
        // Journal du 12/11/26, 09h35 : « je vais voir Yoann… il y a des sujets dont il faut que je lui parle ? » transmis « briefing
        // Yoann … » : la vraie question était perdue. Ses mots exacts accompagnent maintenant la question reformulée.
        const mots = (this._entenduRecent(20000) + ' ' + String(this.brain.inText || '')).replace(/\s+/g, ' ').trim();
        if (mots && this.mode === 'live') last += `${last ? '\n' : ''}Ses mots exacts (transcription de sa voix, parfois imparfaite) : « ${mots.slice(-500)} ». La question ci-dessus en est un résumé fait par Wilson : réponds à ce qu'il a vraiment demandé.`;
        if (OBJECTIF_Q.test(q)) last = (await this._contexteObjectif(q, signal)) + (last ? '\n' + last : '');   // 7 sexies, O
        // PLAN 10 : Claude, sur le PC de la maison, d'abord ; l'analyste Gemini si le PC ne répond pas.
        const pc = await this._parClaude({ question: q, type: 'crm', contexte: last, regles: reglesCRM({ voiture: car }), voiture: car, crm: true }, signal);
        if (pc.info) return pc;
        const indispo = pc.indispo ? `(${pc.indispo[0].toUpperCase() + pc.indispo.slice(1)} : c'est l'analyste qui a cherché. Dis-le d'abord en quelques mots.) ` : '';
        let r;
        try {
          r = await C.analyste.repondre({ key: this.settings.apiKey, question: q, contexte: last, voiture: car, signal,
            onEtape: (n, pourquoi, rq) => { this.log(`Analyste, étape ${n} : ${pourquoi || 'recherche'} (${rq.map((x) => x.table).join(', ')})`, true); this._pointAnalyse(signal, n, pourquoi); } });
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          this.log('Analyste impossible : ' + e.message);
          return { echec: true, info: e.crm ? `Impossible de chercher : ${e.message}. Dis-le simplement.` : `La recherche n'a pas abouti (${shorten(e.message)}). Dis-le simplement, en une phrase.`,
            dire: e.crm ? 'Le CRM n\'a pas encore le moteur de questions.' : 'Je n\'ai pas réussi à finir la recherche.' };
        }
        this.log(`Analyste : réponse en ${Math.round(r.ms / 1000)} s, ${r.etapes} étape(s), ${r.recherches} recherche(s) (${r.model}) : ${r.reponse.slice(0, 160)}`, true);
        return { info: `${indispo}Réponse de l'analyste du CRM (après ${r.recherches} recherche(s) dans ses données) : ${r.reponse}\nDis-la-lui à l'oral, sans rien ajouter ni inventer${car ? ', en une ou deux phrases très courtes' : ''}.`, dire: (pc.indispo ? `${pc.indispo[0].toUpperCase() + pc.indispo.slice(1)}, c'est l'analyste qui a cherché. ` : '') + r.reponse };
      }
      case 'itineraire': {                                                            // C12
        const PR = await this._prochainRdvDemande(a, signal, heard);
        if (PR && PR.dire) return { info: PR.info, dire: PR.dire };
        if (PR) a = { ...a, client: PR.client, cle: PR.cle };
        const r = await C.routeTarget(a, signal, { confirme: !!this._itiOui });
        // Appli Android (PLAN 9, A3) : le guidage part tout de suite, dans la voiture, et Wilson revient devant tout seul.
        if (r.ok && appli()) {
          const g = String(pont('naviguer', r.target.adresse || '', r.target.societe || '') || 'erreur');
          this.log(`Guidage lancé vers ${r.target.societe} (${r.target.adresse}) : ${g}`, true);
          if (/^ok/.test(g)) {
            this._guidage = { societe: r.target.societe, adresse: r.target.adresse, at: Date.now() };
            const revient = pont('peutRevenir') !== false && !/retour automatique impossible/.test(g);
            return { info: `Le guidage vers ${r.target.societe} (${r.target.adresse}) est lancé avec ${/Waze/.test(g) ? 'Waze' : 'Google Maps'} : il s'affiche sur l'écran de la voiture${revient ? ', et tu reviens tout seul sur l\'écran du téléphone' : ''}. Dis-le-lui en une phrase (« C'est parti, je te guide vers … »)${r.target.libre ? ` ; c'est ${/Waze/.test(g) ? 'Waze' : 'Google Maps'} qui a cherché l'endroit : ajoute qu'il vérifie la destination sur l'écran` : ''}.`,
              dire: `C'est parti, je te guide vers ${r.target.societe}.` };
          }
        }
        if (r.ok) this.showRoute(r.target);
        return { info: r.dire, dire: r.ok ? `J'affiche l'itinéraire vers ${r.target.societe} : appuie sur le bouton bleu.` : null };
      }
      case 'appeler': {
        const r = await C.callTarget(a, signal);
        if (r.ok) this.showCall(r.target);
        return { info: r.dire, dire: r.ok ? `J'affiche le numéro de ${r.target.nom} : appuie sur le bouton vert.` : null };
      }
      case 'crm_noter': {
        const r = await C.prepare(a, signal);
        return { info: r.dire, dire: r.ok ? `${r.pending.relu} Je l'enregistre ?` : null };
      }
      case 'crm_confirmer': {
        let g = C.gate(heard || this._heard, { turn: this._turnN });
        // transcription de son « oui » encore en route : on l'attend un peu (2 s au plus)
        for (let i = 0; !g.ok && !heard && /pas de réponse/.test(g.why) && i < 8; i++) { await sleep(250); g = C.gate(this._heard); }
        const D = C.dernierEnregistre;
        if (!g.ok && !C.pending && D && Date.now() - D.at < 120000) {
          // Déjà enregistré juste avant (il rappelait crm_confirmer et redisait « c'est enregistré », journal du 04/11/26, 10h49)
          this.log(`crm_confirmer de trop : déjà enregistré il y a ${Math.round((Date.now() - D.at) / 1000)} s, rien redit`);
          return { info: `DÉJÀ ENREGISTRÉ il y a quelques secondes (« ${D.relu} »). Tu l'as déjà dit : ne redis rien, attends qu'il parle.`, dire: null };
        }
        if (!g.ok) {
          this.log(`Écriture REFUSÉE par le verrou : ${g.why}`);
          const p = C.pending;
          // Journal du 20/11/26, 12h00:13 et 12h00:30 : « Rappelle crm_noter » ignoré deux fois (il lui reposait la question,
          // et il redisait « oui ») : rien n'avait été préparé. La consigne dit pourquoi et exige crm_noter tout de suite.
          return { info: p ? `NON ENREGISTRÉ (${g.why}). Relis-lui la phrase préparée et attends son « oui ».`
            : "NON ENREGISTRÉ : rien n'a été préparé dans le CRM (crm_noter n'a pas été appelé, ou il manquait le texte ou la date). Ne lui repose PAS la question et ne dis pas que c'est enregistré : appelle crm_noter MAINTENANT avec ce qu'il t'a dicté, puis relis-lui exactement la phrase que l'outil te donne et demande « Je l'enregistre ? ».",
            dire: p ? `${p.relu} Je l'enregistre ?` : "Il n'y a rien à enregistrer." };
        }
        const r = await C.commit(signal);
        return { info: r.dire, dire: r.phrase || null };
      }
    }
    return { info: 'outil inconnu' };
  }

  // Sa journée (demande de Timothée du 12/11/26 : « une parfaite connaissance de mon agenda ») : les rendez-vous et tâches du
  // CRM, et ce jour-là dans ses agendas Google (le sien, celui de Boschat Laveix, Famille) par son script. L'agenda Google
  // ne retarde jamais la réponse (6 s au plus) et ne la fait jamais échouer ; un rendez-vous client déjà dans le CRM n'est pas redit.
  async _journee(jour, signal) {
    const d = parseJour(jour || "aujourd'hui") || new Date(), iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const google = this.remote.on ? Promise.race([this.remote.ask({ action: 'agenda_lire', du: iso, jours: 1, tous: true }).catch(() => null), sleep(6000).then(() => null)]) : Promise.resolve(null);
    const [r, g] = await Promise.all([this.crm.agenda(jour, signal), google]);
    if (!r || !r.ok || !g || !g.ok) return r;
    const n = (x) => VP.plat(x).replace(/[^a-z0-9]+/g, ' ').trim(), crm = (r.rdv || []).flatMap((x) => [n(x.societe), n(String(x.contact || '').replace(/^(m|mme|mr)\s+/i, ''))]).filter((x) => x.length >= 3);
    const ev = (g.evenements || []).filter((e) => { const t = n(e.titre); return t && !crm.some((c) => t.includes(c) || c.includes(t)); });
    const h = (t) => { const x = new Date(t); return `${x.getHours()}h${pad(x.getMinutes())}`; };
    const lignes = ev.slice(0, 12).map((e) => `- ${e.journee ? 'toute la journée' : `${h(e.debut)}-${h(e.fin)}`} : ${e.titre}${e.lieu ? ' (' + e.lieu + ')' : ''}${e.agenda ? ` [agenda ${e.agenda}]` : ''}`);
    const titre = g.tous ? 'Dans ses agendas Google ce jour-là (hors rendez-vous clients déjà cités)' : 'Dans l\'agenda Famille ce jour-là (ses autres agendas Google ne sont pas encore lus : script à mettre à jour)';
    const fam = g.tous ? lignes.some((l) => /\[agenda [^\]]*famille[^\]]*\]$/i.test(l)) : lignes.length > 0;   // 19/11/26 : pas forcément les siens
    const titreFam = fam ? `${titre} — ${FAMILLE_PAS_A_LUI}` : titre;
    this.log(`Journée : ${(r.rdv || []).length} rendez-vous au CRM, ${ev.length} événement(s) dans ${g.tous ? 'ses agendas Google' : 'l\'agenda Famille'}`);
    return { ...r, texte: `${r.texte}\n${titreFam} : ${lignes.length ? '\n' + lignes.join('\n') : 'rien.'}` };
  }

  // Écriture gardée faute de réseau, envoyée au retour du réseau (C8 bis) : Wilson le dit.
  _crmQueued(q, ok, err) {
    const t = (q.payload && q.payload.texte) || '';
    const phrase = ok ? `C'est enregistré dans le CRM${t ? ' : « ' + t + ' »' : ''}.` : `Je n'ai pas pu enregistrer ce que j'avais gardé${t ? ', « ' + t + ' »' : ''} : vérifie dans Mes tâches.`;
    this.badge(ok ? 'Enregistré dans le CRM (après la coupure) ✓' : 'Écriture gardée pas enregistrée : vérifie dans Mes tâches', 8000, !ok);
    if (this.state === 'conversation' && this.mode === 'live' && this.brain.open)
      this.brain.sendText(`[Le réseau est revenu : ${ok ? `ce que tu avais gardé est maintenant enregistré dans le CRM (« ${q.relu} »)` : `ce que tu avais gardé (« ${q.relu} ») n'a pas pu être enregistré (${err || 'erreur'}) : dis-lui de vérifier dans Mes tâches`}. Dis-le en une phrase courte.]`);
    else if (this.state === 'conversation' || this.car) this._say(phrase);
  }

  // Outil du CRM en mode direct : Wilson a dit « je regarde dans le CRM », il répond quand le CRM a répondu (filet : 40 s).
  // La maison (PLAN 7 bis) : la demande part à Home Assistant, sa réponse revient à Gemini qui la dit.
  async _maisonTool(call, demande) {
    const conv = this.convId, ctl = new AbortController(), t0 = performance.now();
    ctl.maison = true;                                                                // (petit son seulement après 1 s d'attente)
    this._searches = this._searches || new Map(); this._searches.set(call.id, ctl);
    let res;
    try { res = await this.maison.dire(demande, ctl.signal); }
    catch (e) { if (!this._searches.has(call.id)) return; res = { ok: false, dire: 'Home Assistant ne répond pas.' }; }
    if (conv !== this.convId || !this._searches.has(call.id)) return;
    this._searches.delete(call.id); this._noteToolMs(performance.now() - t0);
    if (res.ok) this.face.play('nod');
    const liste = res.appareils ? ` Appareils de la maison et leur état : ${res.appareils}. Si l'un correspond à sa demande, rappelle tout de suite maison avec ce nom exact sans lui redemander ; si c'était une question d'état, réponds avec cette liste.` : '';
    this.brain.respond([{ id: call.id, name: call.name, response: { result: `${res.ok ? 'Fait' : 'Échec'} — Home Assistant : « ${res.dire} ».${liste} ${res.ok ? 'Dis-le en quelques mots.' : ''}`.trim() } }]);
  }

  // Maintenance de nuit du 31/10/26 (journal du 30/10/26, 22h44 : « pour les mises à jour de ce soir, tu intègres cette
  // information » → « C'est noté… », mais l'outil remarque n'avait pas été appelé : rien n'arrivait dans le journal).
  // S'il dit que c'est noté pour sa mise à jour sans avoir appelé remarque, l'appli la note elle-même avec ce qu'il venait
  // d'entendre.
  _remarqueOubliee(wilson) {
    if (!this.outils || !/(not[ée]|retenu|en compte|intègre).{0,80}mise à jour|mise à jour.{0,40}(not[ée]|en compte)/i.test(wilson || '')) return false;
    if (performance.now() - (this._remarqueAt || -1e9) < 60000) return false;
    if (!this._crmAutorise().ok) return false;                         // seul Timothée fait corriger le programme (16/11/26)
    const ctx = (this._entendus || []).join(' / ').slice(-500);
    if (!ctx) return false;
    this._remarqueAt = performance.now();
    this.outils.remarque({ texte: `(notée par l'appli : Wilson a dit « ${wilson.slice(0, 80)} » sans appeler l'outil remarque) Ce qu'il venait d'entendre : « ${ctx} »` });
    return true;
  }

  // Règle de Timothée du 16/11/26 : « Timothée est le seul à pouvoir faire des corrections de programme. » Une remarque lance
  // une correction du code : même vérification que pour le CRM (son visage reconnu sur cet appareil, ou le téléphone en
  // voiture). Renvoie la phrase à dire si ce n'est pas lui, '' sinon.
  _remarqueRefus() {
    const aut = this._crmAutorise(); if (aut.ok) return '';
    this.log(`Remarque refusée : ${aut.qui ? `c'est ${aut.qui} qui me regarde` : 'je ne reconnais pas Timothée'} — seul Timothée fait corriger le programme`, true);
    return aut.qui && aut.qui !== 'quelqu\'un que je ne connais pas' ? `Désolé ${aut.qui}, il n'y a que Timothée qui peut me faire corriger.`
      : !aut.camera ? "Il n'y a que Timothée qui peut me faire corriger, et je dois voir son visage : la caméra est coupée."
      : !aut.appris ? (aut.tel ? "Il n'y a que Timothée qui peut me faire corriger, et je n'ai pas encore reçu son visage de la tablette du salon : il arrive tout seul sur le téléphone quand il y est appris." : "Il n'y a que Timothée qui peut me faire corriger, et je ne connais pas encore son visage sur cet appareil : Timothée, dis-moi « apprends mon visage, je suis Timothée ».")
      : "Il n'y a que Timothée qui peut me faire corriger, et je ne te reconnais pas là : regarde-moi bien et redis ta remarque.";
  }

  // Remarque de Timothée du 20/11/26, 11h58:15 (voiture) : « attendre que j'aie complètement fini ma phrase avant d'appeler
  // l'outil de remarque ou de noter ». À 11h57:34, 11h57:41 et 11h57:43, Gemini a appelé remarque au milieu de sa phrase :
  // Google annulait l'outil 1 s après (il parlait encore), mais la correction était déjà partie, trois fois, sur une phrase
  // pas finie ; à 11h50:40 et 11h51:03, une note préparée et relue pendant qu'il dictait encore. Ces deux outils attendent
  // maintenant la fin de sa phrase (plus un mot depuis 1,2 s, 3,5 s sur « euh », « et »…, et le micro sans voix). Annulés
  // par Google entre-temps : ils attendent que Gemini les redemande avec toute la phrase (sinon ils partent quand même, comme
  // depuis le 04/11/26). Ce qu'il a dit après la demande est joint à la remarque, et signalé à Gemini avec la note.
  async _apresSaPhrase(c) {
    const conv = this.convId, t0 = performance.now(), tour = this._turnN, avant = String(this.brain.inText || '');
    const A = this._ecrituresEnAttente || (this._ecrituresEnAttente = new Map());
    for (const [id, Q] of A) if (Q.name === c.name) { Q.remplace = true; A.delete(id); }   // la même demande, redemandée
    const P = { name: c.name, annule: false, annuleAt: 0, remplace: false }; A.set(c.id, P);
    this._outilsEnCours = (this._outilsEnCours || 0) + 1;      // ni fin de phrase forcée ni mise à jour pendant l'attente
    let attente = false;
    try {
      for (;;) {
        if (conv !== this.convId || P.remplace) break;
        const now = performance.now(), calme = now - Math.max(this._heardAt || 0, P.annuleAt);
        const besoin = P.annule ? FIN_PHRASE_REPRISE_MS : VP.phraseEnCours(this.brain.inText) ? FIN_PHRASE_SUITE_MS : FIN_PHRASE_MS;
        const voix = this.audio.speaking && calme < besoin + 1500;            // bruit de la route : 1,5 s de plus au plus
        if ((calme >= besoin && !voix) || now - t0 > FIN_PHRASE_MAX_MS) break;
        if (!attente) { attente = true; this.log(`Outil ${c.name} : Timothée parle encore, j'attends la fin de sa phrase`); }
        await sleep(150);
      }
    } finally { this._outilsEnCours--; A.delete(c.id); }
    const s = ((performance.now() - t0) / 1000).toFixed(1);
    if (P.remplace) {
      this.log(`Outil ${c.name} pas lancé : redemandé avec la suite de sa phrase (${s} s)`, true);
      if (!P.annule && conv === this.convId && this.brain.open) this.brain.respond([{ id: c.id, name: c.name, response: { result: 'Remplacé par ta demande suivante : rien à dire pour celle-ci.' } }]);
      return;
    }
    if (conv !== this.convId) {                                               // discussion finie pendant l'attente (appel…)
      if (c.name === 'remarque') { this._remarqueAt = performance.now(); this.outils.run('remarque', c.args || {}).catch(() => {}); }   // sa remarque part quand même
      return;                                                                 // une note : rien n'était écrit, rien n'est préparé
    }
    const suite = (this._heard || []).filter((h) => h.n >= tour)
      .map((h) => (h.n === tour ? (h.text.startsWith(avant) ? h.text.slice(avant.length) : '') : h.text)).join(' ').replace(/\s+/g, ' ').trim();
    if (attente) this.log(`Outil ${c.name} lancé après la fin de sa phrase (${s} s${P.annule ? ', annulé par Google et pas redemandé' : ''})${suite ? ` ; dit après la demande : « ${suite.slice(0, 160)} »` : ''}`, true);
    const a = { ...(c.args || {}) };
    if (suite && c.name === 'remarque') a.texte = `${a.texte || ''} (suite de sa phrase : « ${suite.slice(0, 400)} »)`;
    const d = { ...c, args: a, apresPhrase: true, annule: P.annule, suite: c.name === 'crm_noter' ? suite : '' };
    if (c.name === 'remarque') this._outil(d); else this._crmTool(d);
  }

  // Plus d'outils (PLAN 7 quater).
  async _outil(call) {
    const conv = this.convId, t0 = performance.now(), lent = call.name === 'meteo' || (call.name === 'afficher' && (call.args || {}).image) || call.name === 'courses';
    const pid = lent || call.name === 'remarque' ? this.pill({ meteo: 'Je regarde la météo…', afficher: 'Je cherche une image…', courses: 'Liste de courses…', remarque: 'Je note ta remarque…' }[call.name]) : 0;
    let info, ok = true; if (call.name === 'remarque') this._remarqueAt = performance.now();
    this._outilsEnCours = (this._outilsEnCours || 0) + 1;                // petit son de réflexion en voiture pendant ce temps
    try { info = await this.outils.run(call.name, call.args || {}); }
    catch (e) { ok = false; info = `Impossible pour l'instant (${e.message || 'erreur'}). Dis-le simplement.`; this.log(`Outil ${call.name} : ${e.message}`); }
    finally { this._outilsEnCours--; }
    if (pid) this.pillEnd(pid, ok, call.name === 'remarque' ? 'Correction lancée' : '');
    if (conv !== this.convId) return;
    this._noteToolMs(performance.now() - t0);
    if (call.annule) {                       // annulé par Google pendant qu'il parlait (20/11/26) : pas de réponse à un outil annulé
      if (this.state === 'conversation' && this.mode === 'live' && this.brain.open) this.brain.sendText(`[Résultat de ${call.name} (demandé pendant qu'il parlait encore) : ${info}]`);
      return;
    }
    this.brain.respond([{ id: call.id, name: call.name, response: { result: info } }]);
  }

  // Clients actifs sans IA : chiffres du bilan du CRM, objectif = le plus grand de N-1 et de l'objectif donné (règle de
  // Timothée du 05/11/26), ce qu'il manque. null si le bilan ne les donne pas (l'analyste prend la question).
  async _actifs(a, signal) {
    const q = String((a && (a.question || a.demande)) || ''), S = actifsSimple(q);
    const m = OBJECTIF_NB.exec(q);
    if (m && +m[1] > 0 && +m[1] !== +this.settings.objectifActifs) { this.settings.objectifActifs = +m[1]; this.applySettings('objectifActifs'); this.log(`Objectif de clients actifs retenu : ${m[1]} par mois`); }
    let r;
    try { r = await this.crm.bilan(signal); } catch (e) { if (e.name === 'AbortError') throw e; return null; }
    const A = r && r.ok !== false ? actifsDuBilan(r.texte) : null;
    if (!A) return null;
    const T = this._actifsTexte(A, S && S.n1);
    this.log(`Clients actifs (bilan du CRM, sans IA) : ${T.dire}`, true);
    return { info: `${T.info}\nRéponds seulement à sa question, avec ces chiffres, en une ou deux phrases${this.enVoiture ? ' très courtes' : ''} ; ne propose rien d'autre.`, dire: T.dire };
  }
  _actifsTexte({ act, act1 }, n1 = false) {
    const d = new Date(), mois = MOIS[d.getMonth()], moisN1 = `${mois} ${d.getFullYear() - 1}`;
    const objDonne = +this.settings.objectifActifs || 0, obj = Math.max(objDonne, act1 || 0);
    const manque = obj ? Math.max(0, obj - act) : null;
    const objTxt = obj ? `Objectif du mois : ${obj} clients actifs (${objDonne && objDonne >= (act1 || 0) ? 'donné par Timothée' : `règle de Timothée : au moins N-1${objDonne ? `, plus que les ${objDonne} qu'il avait donnés` : ''}`}). ${manque ? `Il en manque ${manque}.` : 'Objectif atteint.'}` : 'Objectif du mois : pas connu.';
    const info = `Clients actifs (bilan du CRM, chiffres officiels, ne les recalcule pas) : ce mois-ci (${mois} ${d.getFullYear()}) ${act}${act1 != null ? ` ; ${moisN1}, mois entier (même mois l'an dernier, N-1 : ce n'est PAS le mois dernier) : ${act1}` : ''}. ${objTxt}`;
    const dire = n1 && act1 != null ? `En ${moisN1}, tu avais ${act1} clients actifs.`
      : `Tu as ${act} client${act > 1 ? 's' : ''} actif${act > 1 ? 's' : ''} ce mois-ci${obj ? `, pour un objectif de ${obj} : ${manque ? `il t'en manque ${manque}` : 'objectif atteint'}` : ''}.`;
    return { info, dire };
  }

  // L'objectif des clients actifs (PLAN 7 sexies, O) : le chiffre officiel du bilan du CRM, l'objectif (réglage, ou dit à la
  // voix : retenu), et les rendez-vous du prochain jour ouvré, donnés à l'analyste avec la question.
  async _contexteObjectif(q, signal) {
    // Journal du 05/11/26, 09h36:55 : « OBJECTIF CLIENTS ACTIFS 50 » n'était pas compris (12 lettres au plus entre
    // « objectif » et le chiffre) : l'objectif n'a jamais été retenu. Jusqu'à 30 lettres ; jamais « N-1 » ni une année.
    const C = this.crm, m = OBJECTIF_NB.exec(q);
    if (m && +m[1] > 0 && +m[1] !== +this.settings.objectifActifs) { this.settings.objectifActifs = +m[1]; this.applySettings('objectifActifs'); this.log(`Objectif de clients actifs retenu : ${m[1]} par mois`); }
    const obj = +this.settings.objectifActifs || 0;
    const j = new Date(); j.setDate(j.getDate() + 1); while (j.getDay() === 0 || j.getDay() === 6) j.setDate(j.getDate() + 1);
    const demain = (j.getDate() === new Date(Date.now() + 86400000).getDate()) ? 'demain' : JOURS[j.getDay()];
    let bilan = '', agenda = '';
    try { const b = await C.bilan(signal); bilan = b && b.ok !== false ? String(b.texte || '').slice(0, 1500) : `(bilan indisponible : ${(b && b.erreur) || '?'})`; } catch (e) { if (e.name === 'AbortError') throw e; bilan = '(bilan indisponible)'; }
    try { const a = await C.agenda(demain, signal); agenda = a && a.ok !== false ? String(a.texte || '').slice(0, 1500) : '(agenda indisponible)'; } catch (e) { if (e.name === 'AbortError') throw e; agenda = '(agenda indisponible)'; }
    this.log(`Objectif des clients actifs : objectif ${obj || 'pas encore donné'}, rendez-vous de ${demain} joints`, true);
    // Règle de Timothée du 05/11/26, 09h37 : « l'objectif de clients actifs, c'est au moins celui de N-1. Toujours. »
    return `OBJECTIF CLIENTS ACTIFS. Objectif du mois : ${obj ? obj + ' clients actifs (donné par Timothée)' : 'pas donné par Timothée'}. Règle de Timothée : l'objectif est TOUJOURS au moins le nombre de clients actifs du même mois l'an dernier (N-1) ; prends le plus grand des deux${obj ? '' : ' (sans objectif donné, c\'est le chiffre de N-1)'}.\nBilan du CRM (chiffre officiel des clients actifs du mois, ne le recalcule pas) :\n${bilan}\nRendez-vous du prochain jour ouvré (${demain}, ${pad(j.getDate())}/${pad(j.getMonth() + 1)}) :\n${agenda}`;
  }

  // Réponse de Timothée à une question de Claude (7 septies, D) : rangée à côté de la question dans la feuille.
  async _questionOutil(call) {
    const a = call.args || {}, conv = this.convId;
    let info;
    try { info = await this.questions.repondre(a.id, a.reponse, 'outil'); } catch (e) { info = 'Pas transmise pour l\'instant : remercie-le quand même.'; this.log('Question de Claude : ' + e.message); }
    if (conv !== this.convId) return;
    this.brain.respond([{ id: call.id, name: call.name, response: { result: info } }]);
  }

  // Après une discussion (7 septies, S2) : la passe de mémoire relit l'échange, en arrière-plan.
  async _passeMemoire(t0, t1, questions = []) {
    const echanges = this.memory.depuis(t0, t1);
    if (!echanges.length && !questions.length) return;
    const prev = this._passe || Promise.resolve();
    this._passe = prev.then(async () => {
      try {
        const ou = this.enVoiture ? 'en voiture, sur le téléphone de Timothée' : deviceName() === 'téléphone' ? 'sur le téléphone de Timothée' : 'sur la tablette du salon';
        const r = await this.memoire.passe({ echanges, questions, ou, depuis: t0 });
        if (r) for (const x of r.reponses) await this.questions.repondre(x.id, x.reponse, 'retrouvée en relisant la discussion');
      } catch (e) { this.log('Mémoire : relecture de la discussion impossible (' + (e.message || e) + ')'); }
    });
    return this._passe;
  }

  // La famille (PLAN 7 sexies) : messages, visages, garde. Apprendre un visage prend jusqu'à 20 s : compté comme une
  // recherche (pas de veille faute de regard pendant qu'il fait tourner la tête), annulé si la discussion s'arrête.
  async _familleOutil(call) {
    const conv = this.convId, t0 = performance.now(), a = call.args || {}, apprend = call.name === 'visages' && a.action === 'apprendre';
    const ctl = new AbortController(); this._searches = this._searches || new Map(); if (apprend) { this._searches.set(call.id, ctl); ctl.signal.addEventListener('abort', () => this.qui.annulerApprendre()); }
    const pid = apprend ? this.pill('Regarde-moi bien…') : 0;
    let info, ok = true;
    try { info = await this.famille.run(call.name, a, { onPas: (texte, n, total) => { if (pid) this.pill(texte ? `${texte} ${n}/${total}` : `J'apprends ton visage… ${n}/${total}`, 'run', 0, pid); } }); }
    catch (e) { ok = false; info = `Impossible pour l'instant (${e.message || 'erreur'}). Dis-le simplement.`; this.log(`Outil ${call.name} : ${e.message}`); }
    finally { this._searches.delete(call.id); }
    if (pid) this.pillEnd(pid, ok && /appris/.test(info), /appris/.test(info) ? 'Visage appris' : 'Pas appris');
    if (conv !== this.convId) return;
    this._noteToolMs(performance.now() - t0);
    this.brain.respond([{ id: call.id, name: call.name, response: { result: info } }]);
  }

  // La maison (PLAN 7 bis, D7) : Wilson a compris la demande ; l'appli agit et lui rend le résultat.
  // Ce qu'il a demandé en dernier pour les lumières et les prises : « allume… » ou « éteins… » (rien si la phrase dit les deux).
  _intentionMaison() {
    const now = performance.now();
    const h = (this._heard || []).slice().reverse().find((x) => now - x.t < 60000 && /allum|etein|eteign|coupe/.test(VP.plat(x.text)));
    if (!h) return null;
    const t = VP.plat(h.text), on = /allum/.test(t), off = /etein|eteign|coupe/.test(t);
    return on && !off ? { action: 'allumer', dit: h.text } : off && !on ? { action: 'eteindre', dit: h.text } : null;
  }

  async _maisonCmd(call) {
    const conv = this.convId, ctl = new AbortController(), t0 = performance.now(), a = call.args || {};
    ctl.maison = true;                                                                // (petit son seulement après 1 s d'attente)
    // Journal du 05/11/26, 20h18:43-20h18:52 : « Éteins toutes les lumières » → Gemini a d'abord ALLUMÉ les trois, puis envoyé
    // « allumer » et « éteindre » ensemble pour les mêmes lumières. Une commande contraire à sa dernière demande est refusée.
    // Journal du 16/11/26, 09h51:59 : « Éteins toutes les lumières et fais chauffer la voiture » → « allumer » le chauffage de la
    // voiture refusé (la phrase disait « éteins »), et Wilson a quand même annoncé « je lance le chauffage » : la voiture n'a
    // pas chauffé (09h58:43). Ce garde-fou ne vaut que pour les lumières et les prises : jamais pour la voiture ni un chauffage.
    const horsGarde = /voiture|climate|chauff|clim|degivr|thermostat|temperature/.test(VP.plat(String(a.appareil || '')));
    const voulu = call.name === 'maison_commande' && ['allumer', 'eteindre'].includes(a.action) && !horsGarde ? this._intentionMaison() : null;
    if (voulu && voulu.action !== a.action) {
      this.log(`Maison : « ${a.action} ${a.appareil} » refusé — sa dernière demande était « ${voulu.dit.slice(0, 80)} »`, true);
      this.brain.respond([{ id: call.id, name: call.name, response: { result: `Refusé, RIEN n'a été fait pour cet appareil : il a demandé d'${voulu.action === 'eteindre' ? 'éteindre' : 'allumer'} (« ${voulu.dit.slice(0, 100)} »), pas d'${a.action === 'eteindre' ? 'éteindre' : 'allumer'}. Ne fais que ce qu'il a demandé, une seule fois par appareil, et ne dis jamais que c'est fait ou en route pour cet appareil.` } }]);
      return;
    }
    this._searches = this._searches || new Map(); this._searches.set(call.id, ctl);
    let info, ok = false;
    const pid = this.pill(call.name === 'maison_etat' ? 'Je regarde la maison…' : this.maison.enCours(a));
    if (call.name === 'maison_commande') this.face.setEmotion('reflexion', 15000, 0.5);
    try {
      if (call.name === 'maison_etat') { info = await this.maison.etat(a.appareils || [], ctl.signal); ok = true; }
      else { const r = await this.maison.commande(a, ctl.signal); info = r.info; ok = r.ok; if (r.ok && r.voiture) this._suiviVoiture(a); }
    } catch (e) { if (!this._searches.has(call.id)) return; this.log('Maison : ' + (e.message || e.name)); info = await this.maison.diag(e); }
    if (conv !== this.convId || !this._searches.has(call.id)) return;
    this._searches.delete(call.id); this._noteToolMs(performance.now() - t0);
    if (call.name === 'maison_commande') { this.face.clearEmotion(); this.face.play(ok ? 'nod' : 'shake'); }
    this.pillEnd(pid, ok, call.name === 'maison_etat' ? '' : this._court(info));
    this.brain.respond([{ id: call.id, name: call.name, response: { result: `${ok ? 'OK' : 'Échec'} : ${info}` } }]);
  }

  // « Emmène-moi à mon prochain rendez-vous » (journal du 19/11/26, 11h17:14 : Gemini a choisi le rendez-vous de 11h00, déjà
  // fait, sans regarder l'agenda ; il a dû le reprendre). Sa phrase (ou le client donné à l'outil) parle de son prochain
  // rendez-vous sans nommer le client : l'appli prend le prochain rendez-vous du jour dans le CRM, d'après l'heure.
  // { client } à guider, { info, dire } s'il n'y en a plus, ou null (rien à changer).
  async _prochainRdvDemande(a, signal, heard) {
    const client = String((a && a.client) || ''), now = performance.now();
    const H = (heard && heard.length ? heard : (this._heard || [])).filter((h) => now - h.t < 90000).map((h) => h.text);
    const ent = String((this.brain && this.brain.inText) || '').trim(); if (ent && ent !== H[H.length - 1]) H.push(ent);
    const phrase = H[H.length - 1] || '';        // sa dernière phrase seulement : « non, l'autre d'après » → Gemini a choisi, on n'y touche pas
    const parClient = VP.prochainRdvDit(client);
    if (!parClient && !VP.prochainRdvDit(phrase)) return null;
    // il a nommé le client dans sa phrase (« mon prochain rendez-vous chez Gaudin ») : c'est lui qui décide
    const mots = VP.plat(client).split(/[^a-z0-9]+/).filter((m) => m.length >= 3 && !/^(rendez|vous|rdv|prochaine?|client|cliente|suivante?|apres|les|des|chez|mon|son|sarl|sas|ets)$/.test(m));
    if (!parClient && mots.some((m) => new RegExp('\\b' + m + '\\b').test(VP.plat(phrase)))) return null;
    let j = null;
    try { j = await this.crm.agenda("aujourd'hui", signal); } catch (_) { j = null; }
    if (!j || !j.ok) return null;
    // relié à la voiture après le début d'un rendez-vous : il en sort (journal du 19/11/26, 14h07:47)
    const opts = { voitureDepuis: this._voitureBt ? this._voitureBtDepuis : null }, quitte = VP.rdvQuitte(j.rdv || [], new Date(), 15, opts);
    const p = VP.prochainRdv(j.rdv || [], new Date(), 15, opts);
    if (!p) {
      if (!parClient) return null;
      this.log(`Itinéraire : il demande son prochain rendez-vous, mais il n'en a plus aujourd'hui dans le CRM`, true);
      return { info: "RIEN N'EST LANCÉ : il n'a plus de rendez-vous aujourd'hui dans le CRM après l'heure qu'il est. Dis-le-lui en une phrase et demande-lui chez qui il veut aller.", dire: "Je ne vois plus de rendez-vous aujourd'hui dans ton CRM : chez qui veux-tu aller ?" };
    }
    const n = (x) => VP.plat(x).replace(/[^a-z0-9]+/g, ' ').trim();
    if (!parClient && client && (n(client).includes(n(p.societe)) || n(p.societe).includes(n(client)))) return null;   // déjà le bon
    this.log(`Itinéraire : « ${(phrase || client).slice(0, 80)} » → son prochain rendez-vous, ${p.heure} ${p.societe}${client && !parClient ? ` (pas « ${client} »)` : ''}${quitte ? ` ; il sort de celui de ${quitte.heure} (${quitte.societe}) : relié à la voiture après son début` : ''}`, true);
    // + la personne du rendez-vous (remarque du 23/11/26) : le guidage va à SON adresse (une agence), pas au siège de la société
    return { client: p.societe, cle: p.cle || '' };
  }

  // Journal du 06/11/26, 08h43:18 et 08h45:13 : guidage vers Lebre lancé deux fois sans qu'il le demande (il avait seulement
  // dit le nom, puis « pourquoi tu as activé le GPS alors que j'ai pas dit que on allait à Lèbre ? ») ; remarque de Timothée à
  // 08h45:47 : « quand je parle d'une entreprise, ça ne veut pas dire que je veux y aller ». Le guidage ne part que s'il l'a
  // demandé (GPS, itinéraire, emmène-moi… dans ses phrases des 90 dernières secondes), ou s'il dit oui à la proposition.
  async _itinerairePermis(client = '') {
    const now = performance.now(), recents = () => (this._heard || []).filter((h) => now - h.t < 90000).map((h) => h.text);
    let ent = String(this.brain.inText || '').trim();
    for (let i = 0; !ent && !recents().length && i < 6; i++) { await sleep(250); ent = String(this.brain.inText || '').trim(); }   // transcription en route
    const H = recents(), dernier = ent || H[H.length - 1] || '';
    if (!dernier) return { ok: true, pourquoi: 'aucune transcription de sa phrase' };
    const suite = H.slice(-3).concat(ent && ent !== H[H.length - 1] ? [ent] : []);
    // « oui » à ce que Wilson vient de proposer (« Je te guide vers …, c'est bien ça ? »), ou à un client à faire confirmer
    const W = (this._ditWilson || []).filter((w) => now - w.t < 90000).pop(), AC = this.crm.aConfirmer;
    if (!VP.guidageDit(dernier) && VP.estOui(dernier) && ((W && VP.proposeGuidage(W.text)) || (AC && Date.now() - AC.at < 120000))) return { ok: true, oui: true, pourquoi: 'oui à sa proposition' };
    // sa dernière phrase qui en parle décide : demande, reproche, ou « arrête le guidage »
    for (let i = suite.length - 1; i >= 0; i--) {
      const g = VP.guidageDit(suite[i]);
      if (g === 'arret') return { ok: false, arret: true, dit: suite[i] };
      if (g === 'non') return { ok: false, dit: suite[i] };
      if (g === 'oui') return VP.clientRefuse(suite[i], client) ? { ok: false, dit: suite[i], autre: true } : { ok: true };
    }
    return { ok: false, dit: dernier };
  }

  // La réponse de la voiture (refus, ou chauffage confirmé), jusqu'à 80 s après la commande : dite dans la discussion, ou
  // à voix haute si elle est finie.
  async _suiviVoiture(a) {
    let s = null;
    // Remarque du 19/11/26, 08h55 (« il manque le chauffage et le dégivrage avant et arrière ») : une minute après, ce que Home
    // Assistant voit vraiment de la voiture est noté au journal, pour trouver la cause (rien n'est dit, rien n'est envoyé).
    setTimeout(async () => { try { const e = await this.maison.etatVoiture(); if (e) this.log(`Voiture, 1 min après la commande : ${e}`, true); } catch (_) {} }, VOITURE_ETAT_MS);
    try { s = await this.maison.suiviVoiture(Date.now() - 3000, { chauffage: /chauffage/i.test(String(a.appareil || '')) && a.action !== 'eteindre' }); } catch (_) { return; }
    if (!s) return;
    this.log(`Voiture : ${s.texte}${s.detail ? ` — réponse du module : ${String(s.detail).slice(0, 160)}` : ''}`, true);
    const phrase = s.texte[0].toUpperCase() + s.texte.slice(1);
    // 1.43.0 (journal du 13/11/26, 07h07:30 : le refus est arrivé pendant la discussion, mais Timothée ne regardait plus ;
    // la réponse a été retenue (R1) et la nouvelle perdue : à 07h08:15, « Alors cette voiture, on en est où ? » → « j'ai lancé
    // le chauffage ») : envoyée dans la discussion seulement s'il regarde ; sinon gardée, et redonnée si elle n'est pas dite.
    if (this.state === 'conversation' && this.mode === 'live' && this.brain.open && !this.paused) {
      this._nvEnvoi = { phrase, at: Date.now(), conv: this.convId };
      this.brain.sendText(`[Nouvelles de la voiture : ${phrase} Dis-le-lui en une phrase, sans rien ajouter.]`);
    } else if (this.enVoiture || (this.state === 'conversation' && !this.paused)) this._sayAfter(phrase);
    else this._garderNouvelleVoiture({ phrase, at: Date.now() });   // R1 : personne ne le regarde → à la prochaine discussion
  }
  // Gardée pour la prochaine discussion sur cet appareil, et déposée en message pour Timothée (remarque du 13/11/26,
  // 07h32:40 : « que l'information me soit donnée même si je ne reste pas devant la tablette ») : le premier appareil qui
  // le voit (son téléphone, ou la tablette qui le reconnaît) la lui dit ; une fois remise, l'autre ne la redit pas.
  _garderNouvelleVoiture(NV) {
    if (!NV.msgId && !this.famille.telephone && this.remote && this.remote.on) {
      try { NV.msgId = this.famille.deposer({ pour: PROPRIO_NOM, de: 'Wilson', texte: `Nouvelles de la voiture (${hhmm(NV.at)}) : ${NV.phrase}` }).id; } catch (_) {}
    }
    this._nouvelleVoiture = NV; this._nvEnvoi = null;
    this.log(`Voiture : personne ne me regarde, je le dirai au début de la prochaine discussion (R1)${NV.msgId ? ', et en message pour Timothée (son téléphone)' : ''}`, true);
  }
  // Dite pour de bon : sa phrase parle de la voiture. Retenue ou discussion finie sans l'avoir dite : gardée de nouveau.
  _nvSuivi(wilson, retenue = false) {
    const N = this._nvEnvoi; if (!N) return;
    const parle = /voiture|chauffage|d[ée]givr|refus|MG\b/i.test(wilson || '');
    if (retenue && wilson && !parle && N.conv === this.convId) return;   // une autre réponse retenue : la nouvelle attend encore
    if (!retenue && parle) {
      this._nvEnvoi = null;
      if (N.msgId) { try { this.famille._marquer([N.msgId], PROPRIO_NOM); } catch (_) {} }
      return;
    }
    if (retenue || N.conv !== this.convId) this._garderNouvelleVoiture(N);
  }

  async _crmTool(call) {
    if (call.name === 'itineraire') {
      const P = await this._itinerairePermis((call.args || {}).client || (call.args || {}).lieu || '');
      this._itiOui = !!P.oui;
      if (!P.ok && P.arret) {
        // « supprime la destination », « enlève le GPS » : rien n'est relancé ; il dit comment arrêter (une appli ne peut pas arrêter Maps).
        this.log(`Itinéraire refusé : il demande d'ARRÊTER le guidage (« ${P.dit.slice(0, 120)} »)`, true);
        if (this.brain.open) this.brain.respond([{ id: call.id, name: call.name, response: { result: "REFUSÉ, rien n'a été lancé : il demande d'ARRÊTER le guidage, pas d'y aller. Tu ne peux pas arrêter Google Maps toi-même. Dis-lui seulement : « Je ne peux pas arrêter le guidage moi-même : dis « OK Google, arrête la navigation », ou touche la croix sur l'écran de la voiture. » Ne relance aucun guidage." } }]);
        return;
      }
      if (!P.ok) {
        this.log(`Itinéraire vers « ${(call.args || {}).client || (call.args || {}).lieu || '?'} » refusé : il ne l'a pas demandé (il a dit : « ${P.dit.slice(0, 120)} »)`, true);
        if (this.brain.open) this.brain.respond([{ id: call.id, name: call.name, response: { result: `REFUSÉ, rien n'a été lancé : il n'a pas demandé d'y aller (il a dit : « ${P.dit.slice(0, 160)} »). Citer un client n'est pas une demande de GPS. Ne lance pas le guidage et ne propose pas de le lancer : réponds seulement à ce qu'il a dit (s'il se plaint du GPS, dis « Pardon, je ne lance rien. »)${P.autre ? " ; il a dit qu'il ne veut PAS aller chez ce client-là : s'il en a cité un autre, rappelle itineraire pour celui qu'il veut" : ''}.` } }]);
        return;
      }
      if (P.pourquoi) this.log(`Itinéraire permis : ${P.pourquoi}`);
      // « mon prochain rendez-vous » : le client est choisi ici, avant la mémoire des 20 s ci-dessous (sinon « non, chez ABM »
      // redemandé avec le même nom rendrait le guidage d'avant)
      const PR = await this._prochainRdvDemande(call.args || {}, null);
      if (PR && PR.dire) { if (this.brain.open) this.brain.respond([{ id: call.id, name: call.name, response: { result: PR.info } }]); return; }
      if (PR) call = { ...call, args: { ...(call.args || {}), client: PR.client, cle: PR.cle } };
    }
    if (call.name === 'crm_question') {
      const qa = String((call.args || {}).question || (call.args || {}).demande || '');
      if (VP.ordreEcriture(qa)) {
        this.log(`crm_question refusé : « ${qa.slice(0, 80)} » est une écriture, pas une question`, true);
        if (this.brain.open) this.brain.respond([{ id: call.id, name: call.name, response: { result: "REFUSÉ : c'est une écriture, pas une question (crm_question ne peut rien enregistrer). Appelle crm_noter : type (compte_rendu pour une visite ou un appel), client = la société, contact = la personne vue s'il l'a citée, texte = ce qu'il a dicté ; puis relis-lui la phrase préparée et demande « Je l'enregistre ? »." } }]);
        return;
      }
      // Qui, fonction, numéro, adresse : l'annuaire gardé sur l'appareil répond tout de suite, sans IA.
      if (this.crm.on && this.crm.annuaire.pret && VP.questionContacts(qa) && this._crmAutorise().ok) {
        const X = this.crm.annuaire.dansPhrase(qa);
        if (X) return this._crmTool0({ ...call, args: { client: X.contact ? `${X.contact.nom} ${X.g.societe}` : X.g.societe, question: qa } }, null, 'crm_contacts');
      }
      // Réponse tout de suite, sans IA, si le bilan du CRM donne les clients actifs (sinon : l'analyste, comme avant).
      if (this.crm.on && actifsSimple(qa) && this._crmAutorise().ok) {
        const b = await this.crm.bilan().catch(() => null);
        if (b && b.ok !== false && actifsDuBilan(b.texte)) return this._crmTool0(call, null, 'crm_actifs');
      }
      return this._analyse(call);
    }
    // Journal du 05/11/26, 15h53:24-15h53:34 : itineraire demandé 3 fois pour Miroiterie 35 (Google l'annulait quand
    // Timothée disait « oui » par-dessus) : 3 boutons, 2 messages « résultat », puis « C'est affiché, » coupé. La même
    // lecture demandée de nouveau dans les 20 s : même résultat, rien de réaffiché, rien de redit en message.
    const lect = ['crm_client', 'crm_contacts', 'crm_agenda', 'crm_bilan', 'crm_produit', 'itineraire', 'appeler'].includes(call.name);
    const R = this._crmRecents || (this._crmRecents = new Map()), nowD = performance.now();
    for (const [k, v] of R) if (nowD - v.at > 20000) R.delete(k);
    const cleD = call.name + ' ' + VP.plat(JSON.stringify(call.args || {})).replace(/[^a-z0-9]+/g, ' ').trim();
    const D = lect && R.get(cleD);
    if (D) {
      D.repris = true;
      this.log(`CRM : ${call.name} redemandé (même demande il y a ${((nowD - D.at) / 1000).toFixed(0)} s) : même résultat, rien de réaffiché`, true);
      const res0 = await D.p; const conv0 = this.convId;
      if (conv0 === this.convId && this.brain.open) this.brain.respond([{ id: call.id, name: call.name, response: { result: res0.info } }]);
      return;
    }
    let finD; const entree = lect ? { at: nowD, p: new Promise((r) => { finD = r; }), repris: false } : null;
    if (entree) R.set(cleD, entree);
    try { return await this._crmTool0(call, entree); } finally { if (finD) finD({ info: (entree && entree.info) || 'Le CRM n\'a pas répondu.' }); }
  }
  async _crmTool0(call, entree, run = call.name) {
    const conv = this.convId, ctl = new AbortController(), t0 = performance.now();
    ctl.crm = call.name;                    // outil du CRM : jamais abandonné en route (voir 'toolcancel')
    if (call.annule) ctl.annule = true;     // annulé par Google pendant qu'il finissait sa phrase (_apresSaPhrase, 20/11/26)
    this._searches = this._searches || new Map(); this._searches.set(call.id, ctl);
    const lecture = ['crm_client', 'crm_contacts', 'crm_agenda', 'crm_bilan', 'crm_produit', 'crm_actifs'].includes(run);
    if (lecture) this.face.setEmotion('reflexion', CRM_MAX_MS + 2000, 0.6);
    this.log(`CRM (direct) : ${run} ${JSON.stringify(call.args || {}).slice(0, 160)}`, true);
    if (call.name === 'itineraire') this._itiTurn = this._turnN; else if (call.name === 'appeler') this._appelTurn = this._turnN;
    if (['itineraire', 'appeler', 'crm_noter'].includes(call.name)) {
      const ent = String(this.brain.inText || '').trim() || ((this._heard || [])[this._heard.length - 1] || {}).text || '';
      if (this._echoPossible(ent)) this.log(`Écho possible : « ${ent.slice(0, 80)} » reprend mot pour mot sa propre phrase d'avant (${call.name})`, true);
    }
    const pid = lecture ? this.pill('Je regarde dans le CRM…') : 0;
    const timer = setTimeout(() => ctl.abort(), CRM_MAX_MS);
    let res;
    try { res = await this._crmRun(run, call.args || {}, ctl.signal); }
    catch (e) {
      if (!this._searches.has(call.id)) return;                                  // annulé (on l'a coupé)
      res = { info: e.name === 'AbortError' ? 'Le CRM a mis trop de temps à répondre (réseau faible ?). Dis-le simplement, en une phrase.'
        : isNetErr(e) ? 'Pas de réseau vers le CRM pour l\'instant. Dis-le simplement, en une phrase.' : `Le CRM ne répond pas (${e.message}). Dis-le simplement.` };
      this.log(`CRM impossible (${((performance.now() - t0) / 1000).toFixed(1)} s) : ${e.name === 'AbortError' ? 'trop long' : e.message}`);
    } finally { clearTimeout(timer); }
    if (entree) entree.info = res.info;
    if (conv !== this.convId || !this._searches.has(call.id)) {
      if (conv !== this.convId) this.log(`CRM : ${call.name} fini après la fin de la discussion (${((performance.now() - t0) / 1000).toFixed(1)} s) : « ${String(res.info || '').slice(0, 140)} »`);
      return;
    }
    this._searches.delete(call.id); this._noteToolMs(performance.now() - t0);
    this.face.clearEmotion(); if (pid) this.pillEnd(pid, true, '');
    // Il a continué de dicter après la demande (20/11/26, 11h50:40 : « … le reste de la commande qui était », puis les crémones)
    if (call.suite && res.info) res.info = `Attention, il a continué de parler après ta demande (« ${call.suite.slice(0, 300)} ») : si cela complète ou corrige sa note, rappelle crm_noter avec le texte complet au lieu de relire celle-ci. Sinon : ${res.info}`;
    if (ctl.annule) {
      // Journal du 04/11/26, 11h45:53 : crm_noter (tâche Karine Viola) annulé par Google parce qu'il parlait encore → rien
      // de préparé, puis Wilson a dit « c'est bon » sans rien enregistrer. Désormais l'outil va au bout et Gemini reçoit le
      // résultat en message.
      if (entree && entree.repris) { this.log(`CRM : ${call.name} fini malgré l'annulation, mais redemandé entre-temps : résultat déjà donné`); return; }
      this.log(`CRM : ${call.name} fini malgré l'annulation : résultat donné à Gemini en message`);
      if (this.state === 'conversation' && this.mode === 'live' && this.brain.open) this.brain.sendText(`[Résultat de ${call.name} (demandé juste avant, il parlait encore) : ${res.info} Dis-le-lui maintenant, brièvement.]`);
      return;
    }
    this.brain.respond([{ id: call.id, name: call.name, response: { result: res.info } }]);
    const n = this._modelOut;
    setTimeout(() => {
      if (conv !== this.convId || this._modelOut !== n || !this.brain.open || this.audio.playing) return;
      this.log('Pas de réponse 6 s après le CRM : relance');
      this.brain.sendText('[Réponds maintenant à voix haute, en français, à partir de la réponse du CRM.]');
    }, 6000);
  }

  // Question libre (C11) : l'analyste cherche aussi longtemps qu'il faut (10 min au plus), tête qui réfléchit pendant ce temps.
  // Elle n'est pas arrêtée par la fin de la discussion : la réponse arrive quand même (C11 bis).
  // quoi : 'crm' (crm_question : Claude sur le PC s'il répond, sinon l'analyste Gemini) ou 'claude' (question_difficile, PLAN 10).
  async _analyse(call, quoi = 'crm') {
    const a = call.args || {};
    const A = { id: call.id, name: call.name, quoi, question: String(a.question || a.demande || '').trim(), t0: performance.now(), conv: this.convId, gen: this._liveGen || 0, ctl: new AbortController(), cancelled: false };
    this._analyses = this._analyses || new Map(); this._analyses.set(call.id, A);
    this.face.setEmotion('reflexion', ANALYSE_MAX_MS, 0.7);
    A.pid = this.pill(quoi === 'mail' ? 'Je regarde tes e-mails…' : quoi === 'claude' ? 'Je cherche…' : 'Je cherche dans le CRM…');
    this.log(quoi === 'mail' ? `Question sur ses e-mails (${a.boite || 'les_deux'}) : « ${A.question.slice(0, 160)} »` : quoi === 'claude' ? `Question difficile : « ${A.question.slice(0, 160)} »` : `Question au CRM : « ${A.question.slice(0, 160)} »`, true);
    const timer = setTimeout(() => A.ctl.abort(), ANALYSE_MAX_MS + 5000);
    // En arrière-plan (question de Timothée du 04/11/26, 12h19 : « il peut travailler en arrière-plan et me répondre sur ce
    // qu'il fait ? ») : sur Gemini 3.1, un outil en cours le rend muet jusqu'au résultat (15 à 30 s pour l'analyste). Le
    // résultat de l'outil part donc tout de suite (« je cherche, je te tiens au courant »), la discussion continue, il dit
    // où il en est, et la réponse arrive en message dès qu'elle est prête (même chemin qu'une réponse tardive).
    if (this.brain.syncTools && this.mode === 'live' && this.brain.open) {
      A.fond = true; A.cancelled = true; A.dernierPoint = performance.now();
      this.log('Analyste en arrière-plan : Wilson reste libre, la réponse viendra en message');
      // Remarque de Timothée du 05/11/26, 19h23 (« pendant que tu recherches, le petit bip-bip, c'est pas la peine de me
      // redemander si je veux autre chose, j'attends ») : « Je cherche. » et rien d'autre (K5).
      this.brain.respond([{ id: call.id, name: call.name, response: { result: `Recherche lancée en arrière-plan (${quoi === 'mail' ? 'elle peut prendre de une à cinq minutes' : quoi === 'claude' ? 'elle peut prendre une à deux minutes' : 'elle peut prendre une demi-minute'}). Dis seulement « ${quoi === 'mail' ? 'Je regarde tes e-mails.' : 'Je cherche.'} » et RIEN d'autre : aucune question, ne lui demande pas s'il veut autre chose, ne propose rien ; il attend la réponse en silence. S'il te parle entre-temps, réponds-lui normalement. La réponse te sera donnée en message dès qu'elle arrive ; n'invente rien en attendant.` } }]);
    }
    let res;
    try { res = quoi === 'mail' ? await this._mails(a, A.ctl.signal) : quoi === 'claude' ? await this._questionDifficile(a, A.ctl.signal) : await this._crmRun('crm_question', a, A.ctl.signal); }
    catch (e) { res = { echec: true, info: 'La recherche a pris trop de temps. Dis-le simplement.', dire: 'La recherche a pris trop de temps, je n\'ai pas de réponse.' }; this.log('Recherche : abandon (' + e.message + ')'); }
    finally { clearTimeout(timer); this._analyses.delete(call.id); }
    if (!this._analyses.size && this.face.emotion === 'reflexion') this.face.clearEmotion();
    this.pillEnd(A.pid, !res.echec, res.echec ? (quoi !== 'crm' ? 'Pas de réponse' : 'Pas de réponse du CRM') : 'Réponse trouvée');
    this._livrer(A, res);
  }

  // ---------- Claude sur le PC de la maison (PLAN 10) ----------
  // { info, dire } si Claude a répondu ; { indispo } si le PC ne peut pas (Wilson le dit et fait sans lui, K6).
  async _parClaude(o, signal) {
    if (!this.claude.on) return { indispo: '' };
    const t0 = performance.now();
    this.log(`Claude (PC) : question ${o.type === 'crm' ? 'sur le CRM' : o.type === 'mail' ? 'sur ses e-mails' : 'difficile'} envoyée`, true);
    const r = await this.claude.repondre({ ...o, appareil: deviceName(), signal, onPris: (s) => this.log(`Claude (PC) : question prise par le PC${s != null ? ` après ${s} s` : ''}`) });
    const s = Math.round((performance.now() - t0) / 1000);
    if (!r.ok) {
      this.log(`Claude (PC) indisponible (${r.raison} : ${r.message}) : ${o.type === 'crm' ? 'analyste Gemini à la place' : o.type === 'mail' ? 'pas d\'e-mails sans lui' : 'recherche simple à la place'}`);
      if (o.type === 'mail') return { indispo: phraseIndispo(r.raison) };   // e-mails : pas de solution de secours, il faut toujours le dire
      // Une phrase au plus par demi-heure, et pas si le relais n'a jamais été vu (pas encore installé) : sinon c'est du bruit.
      const dire = !!(this.claude.pc && this.claude.pc.vu != null) && Date.now() - (this._indispoDitAt || 0) > 30 * 60000;
      if (dire) this._indispoDitAt = Date.now();
      return { indispo: dire ? phraseIndispo(r.raison) : '' };
    }
    this.log(`Claude (PC) : réponse en ${s} s (${r.etapes} étape(s)) : ${r.dire.slice(0, 200)}`, true);
    this._claudeDernier = { question: o.question, dire: r.dire, detail: r.detail, at: Date.now() };
    const detail = r.detail ? `\nDétail (seulement s'il demande à le voir écrit, « montre-moi » : appelle afficher avec ce texte) : ${r.detail.slice(0, 1800)}` : '';
    return { info: `Réponse de Claude (il a cherché ${s} s ${o.type === 'crm' ? 'dans le CRM' : o.type === 'mail' ? 'dans ses e-mails' : 'sur Internet'}) : « ${r.dire} »\nRépète-la MOT POUR MOT, sans rien ajouter, retirer ni inventer.${o.type === 'mail' ? ' Si elle finit par « Je l\'envoie ? » : attends sa réponse ; « oui » → appelle mail_envoyer (action envoyer) ; « non » → mail_envoyer (action annuler) ; une correction → rappelle mails avec la correction.' : ''}${detail}`, dire: r.dire };
  }
  // mails (demande du 11/11/26) : ses e-mails, lus par Claude sur le PC (Gmail perso par le script, Outlook pro dans Chrome).
  // Réservés à Timothée, comme le CRM. Pas de solution de secours : sans le PC, Wilson le dit.
  async _mails(a, signal) {
    const q = String(a.demande || a.question || '').trim();
    if (!q) return { info: 'Il manque la demande : demande-lui ce qu\'il veut savoir sur ses e-mails.', dire: 'Qu\'est-ce que tu veux savoir sur tes e-mails ?' };
    let boite = ['perso', 'pro'].includes(a.boite) ? a.boite : 'les_deux';
    // 1.43.0 (remarque de Timothée du 13/11/26, 07h34:40 : « désactiver la recherche des e-mails pro, trop contraignant de
    // devoir laisser le PC allumé ») : la boîte pro (Outlook dans Chrome, sur le PC) n'est plus regardée ; le Gmail perso, si.
    // 1.43.2 (journal du 14/11/26, 16h41:41-16h42:21, téléphone) : dit AVANT de vérifier le visage (rien de privé) ; avant,
    // « accède à ma boîte pro » donnait deux fois « regarde-moi bien et redemande », pour une boîte de toute façon coupée.
    if (!this.settings.mailsPro && boite === 'pro') {
      this.log('E-mails : boîte pro demandée, mais coupée à la demande de Timothée (13/11/26)', true);
      return { echec: true, info: "Sa boîte pro n'est plus regardée : il l'a demandé le 13/11/26 (trop contraignant de laisser le PC allumé). Dis-le simplement, en une phrase ; s'il veut la remettre, il te le dit comme une remarque pour ta prochaine mise à jour.", dire: "Ta boîte pro, je ne la regarde plus : tu me l'as demandé le 13 novembre." };
    }
    const aut = this._crmAutorise();
    if (!aut.ok) {
      this.log(`E-mails refusés : ${aut.qui ? `c'est ${aut.qui} qui me regarde` : 'je ne reconnais pas Timothée'} — réservés à Timothée`, true);
      // Même explication que pour le CRM : visage pas encore appris sur cet appareil → comment l'apprendre (14/11/26, 16h42:48 :
      // sur le téléphone, « C'est moi là, regarde, c'est Timothée » → « on essaiera d'apprendre ton visage plus tard »).
      const dire = aut.qui && aut.qui !== 'quelqu\'un que je ne connais pas' ? `Désolé ${aut.qui}, les e-mails, c'est seulement pour Timothée.`
        : aut.camera && !aut.appris ? (aut.tel ? "Les e-mails, c'est seulement pour Timothée, et je n'ai pas encore reçu son visage de la tablette du salon : il arrive tout seul sur le téléphone quand il y est appris." : "Les e-mails, c'est seulement pour Timothée, et je ne connais pas encore son visage sur cet appareil : Timothée, dis-moi « apprends mon visage, je suis Timothée ».")
          : 'Les e-mails, c\'est seulement pour Timothée : regarde-moi bien et redemande.';
      return { echec: true, info: `REFUSÉ : ses e-mails sont privés, réservés à Timothée. Dis seulement : « ${dire} » Aucun contenu d'e-mail.`, dire };
    }
    if (!this.settings.mailsPro) boite = 'perso';
    const r = await this._parClaude({ question: q, type: 'mail', boite, voiture: this.enVoiture, crm: true }, signal);
    if (r.info) return r;
    const p = r.indispo || 'Claude, sur l\'ordinateur de la maison, n\'est pas relié sur cet appareil';
    return { echec: true, info: `Impossible de lire ses e-mails : ${p}. Dis-le simplement, sans rien inventer sur ses e-mails.`, dire: `Je ne peux pas lire tes e-mails pour le moment : ${p}.` };
  }
  // question_difficile : Claude ; si le PC ne répond pas, une recherche simple (Tavily), en le disant.
  async _questionDifficile(a, signal) {
    const q = String(a.question || '').trim();
    if (!q) return { info: 'Il manque la question : demande-lui ce qu\'il veut savoir.', dire: 'Qu\'est-ce que tu veux savoir exactement ?' };
    const r = await this._parClaude({ question: q, type: 'internet', voiture: this.enVoiture, crm: this._crmAutorise().ok }, signal);
    if (r.info) return r;
    const t0 = performance.now();
    let dire;
    try { dire = await this._lookup(q, signal, t0); }
    catch (e) { if (e.name === 'AbortError') throw e; return { echec: true, info: `${r.indispo ? r.indispo[0].toUpperCase() + r.indispo.slice(1) + ', et ' : ''}la recherche simple a échoué aussi. Dis-le simplement.`, dire: `${r.indispo ? r.indispo[0].toUpperCase() + r.indispo.slice(1) + ', et ' : ''}je n'ai pas réussi à chercher.` }; }
    const avant = r.indispo ? `${r.indispo[0].toUpperCase() + r.indispo.slice(1)}, alors j'ai fait une recherche rapide. ` : 'Recherche rapide : ';
    return { info: `${avant}Résultat : ${dire}\nDis d'abord, en quelques mots, que c'est une recherche rapide (${r.indispo || 'Claude n\'est pas joignable'}), puis ce résultat, sans rien inventer.`, dire: avant + dire };
  }
  // Point d'avancement d'une recherche en arrière-plan : quelques mots, au plus toutes les 12 s, seulement si personne ne parle.
  _pointAnalyse(signal, n, pourquoi) {
    const A = [...(this._analyses || new Map()).values()].find((x) => x.ctl.signal === signal);
    if (!A || !A.fond || n < 2 || !pourquoi) return;
    const now = performance.now();
    if (now - (A.dernierPoint || 0) < 12000) { this.log(`Point d'avancement pas dit (le précédent date de moins de 12 s) : ${pourquoi}`); return; }
    if (this.state !== 'conversation' || this.mode !== 'live' || !this.brain.open || this.audio.playing || this.audio.speaking || now - (this.audio.lastVoicedAt || 0) < 1500) {
      this.log(`Point d'avancement pas dit (on parle en ce moment) : ${pourquoi}`); return;
    }
    A.dernierPoint = now;
    this.brain.sendText(`[Point d'avancement de ta recherche (« ${A.question.slice(0, 100)} ») : ${pourquoi}. Dis-le en quelques mots seulement (« Je regarde … »), sans donner de résultat, puis reste disponible.]`);
  }
  // La réponse : dans la même discussion, comme résultat de l'outil ; sinon il la dit dès que possible (C11 bis). À l'écran seulement s'il le demande.
  _livrer(A, res) {
    const s = Math.round((performance.now() - A.t0) / 1000);
    // Plus de carte « Réponse du CRM » d'office (règle du 04/11/26 : du texte à l'écran seulement s'il le demande).
    const meme = !A.cancelled && A.conv === this.convId && this.state === 'conversation' && this.mode === 'live' && this.brain.open && A.gen === (this._liveGen || 0);
    if (meme) {
      this.brain.respond([{ id: A.id, name: A.name || 'crm_question', response: { result: res.info } }]);
      const n = this._modelOut, conv = this.convId;
      setTimeout(() => {
        if (conv !== this.convId || this._modelOut !== n || !this.brain.open || this.audio.playing) return;
        this.log(`Pas de réponse 6 s après ${A.quoi !== 'crm' ? 'la réponse de Claude' : 'l\'analyste'} : relance`);
        this.brain.sendText(A.quoi !== 'crm' ? '[Donne maintenant à voix haute la réponse de Claude, mot pour mot.]' : '[Donne maintenant à voix haute la réponse de l\'analyste du CRM.]');
      }, 6000);
      return;
    }
    this._lateAnswer(A, res, s);
  }
  _lateAnswer(A, res, s, n = 0) {
    const again = (ms) => { if (n < 400) setTimeout(() => this._lateAnswer(A, res, s, n + 1), ms); };
    const dire = res.dire || res.info;
    if (!n) {                                                                              // à dire, quoi qu'il arrive
      const P0 = this._aDire;                                                              // une autre réponse attend encore : les deux ensemble
      // journal du 12/11/26, 19h47:43 : une réponse sur ses e-mails était annoncée à Gemini comme « la recherche dans le CRM »
      const propre = A.quoi === 'mail' ? 'dans ses e-mails ' : A.quoi === 'claude' ? '' : 'dans le CRM ';
      const ou = P0 && P0.ou !== propre ? '' : propre;
      this._aDire = P0 ? { question: `${P0.question} » puis « ${A.question}`, dire: `${P0.dire} Et pour ta question « ${A.question} » : ${dire}`, s, at: Date.now(), conv: null, envoyeAt: 0, cle: A.id, ou }
        : { question: A.question, dire, s, at: Date.now(), conv: null, envoyeAt: 0, cle: A.id, ou };
      this._noteChiffres(dire);
    }
    if (this._aDire && this._aDire.cle !== A.id) return;                                   // une réponse plus récente l'a reprise avec elle
    // pendant un appel, une reconnexion, ou l'appli cachée (GPS devant, écran éteint : il ne serait pas entendu) : après
    if (this.phone || this.state === 'eveil' || this.netWait || (document.hidden && this.state !== 'conversation')) return again(3000);
    if (!this._aDire) return;                                                              // déjà dite entre-temps (discussion suivante)
    this.log(`Réponse à « ${A.question.slice(0, 80)} » arrivée après ${s} s${this.state === 'conversation' ? '' : ' : je me réveille pour la dire'}`, true);
    this._lateText = this._aDireTexte(this._aDire);
    this._lateSay = `J'ai la réponse à ta question. ${dire}`;
    if (this.state === 'conversation' && this.mode === 'live' && this.brain.open) { this._aDireEnvoyer(); return; }
    if (this.state === 'conversation') { this._aDire = null; this._say(this._lateSay); return; }
    this.startConversation('reponse_tardive');
  }
}
