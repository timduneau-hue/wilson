"""Journal du 26/11/26 (téléphone en voiture, 1.45.32) — corrections de la 1.45.33.
 1. Dictée (remarque de Timothée, 09h25-09h26 : « un petit bouton ; j'appuie et là tu compiles tout, au lieu d'envoyer toutes
    les infos tout de suite, parce que j'ai pas le temps de finir mes phrases ») : 09h12-09h15, chaque pause de son compte rendu
    finissait son tour, et Wilson relisait tout et redemandait « Je l'enregistre ? » cinq fois.
    → crm_noter sans le contenu ouvre la dictée : bouton « J'ai fini », Wilson se tait, ses outils sont refusés, tout est mis
      bout à bout ; « J'ai fini » (bouton, « j'ai fini », écran touché) donne tout le texte d'un coup ; annuler ; appel : reprise.
 2. Remarque (09h24-09h26) : l'ordinateur de la maison était éteint, l'outil le disait, Wilson a promis « compte une heure »
    (phrase toute faite des consignes) ; 11h38 : « c'est où la mise à jour ? » envoyé à l'analyste du CRM (« rien pour ce client »).
    → crm_question refusé pour une question sur Wilson lui-même (remarque ou mes_remarques).
 3. Écran (09h24:41 : suivi bourse affiché sur une phrase mal comprise ; « tu laisses ta petite tête ») : en voiture, plus de
    fenêtre d'information ; les boutons à toucher restent.
 4. 09h17:23-09h18:17 : tâche enregistrée par « Oui » à l'écran ; « elle est enregistrée ? » → réponse retenue par le verrou,
    la même tâche repréparée (« il faudra supprimer la précédente »), puis « Non » touché → « qu'est-ce que tu veux changer ? ».
    → confirmer une écriture faite à l'instant est dit ; la même écriture n'est pas repréparée ; « Non » après « pas besoin » :
      aucune question.
 5. 09h28 : « plusieurs clients possibles » sans ville dans le CRM, mais le résultat demandait « cite le nom et la ville » :
    deux villes inventées, phrase coupée par le verrou, « Pardon, je me suis trompé ». → la ville n'est demandée que si le CRM la donne.
 6. 10h29 : « tu peux me rappeler ce qu'il y avait dans cet email ? » → le verrou a exigé crm_question (comptes rendus du CRM).
    → une demande sur ses e-mails exige l'outil mails.
"""
import asyncio, re, json, os, base64
import numpy as np
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, '' if ok else detail, flush=True)

STUB = """(() => {
  const md = navigator.mediaDevices, gum0 = md.getUserMedia.bind(md);
  md.enumerateDevices = async () => [
    { deviceId: 'id-speaker', kind: 'audioinput', label: 'Speakerphone', groupId: 'g1' },
    { deviceId: 'id-bt', kind: 'audioinput', label: 'Bluetooth headset', groupId: 'g3' },
    { deviceId: 'cam', kind: 'videoinput', label: 'camera 1, facing front', groupId: 'g4' }].map((d) => ({ ...d, toJSON() { return d; } }));
  md.getUserMedia = async (c) => gum0(c && c.audio ? { audio: true, video: false } : c);
})();"""
GAZE = """setInterval(() => { const v = window.wilson && wilson.vision; if (!v) return;
  v.gazeReady = true; v.modelsDone = true; v.forceLook = false; v._lastResult = performance.now();
  v.looking = false; v.faceAt = performance.now(); v.hasPerson = true; v.faces = 1; }, 30);
window.__parle = (ms) => { const A = wilson.audio; const iv = setInterval(() => { A.lastVoicedAt = performance.now(); A.speaking = true; A._offCnt = 0; }, 15); setTimeout(() => clearInterval(iv), ms); };"""
PHONE_UA = 'Mozilla/5.0 (Linux; Android 15; SM-A266B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36'


def audio_chunks(seconds):
    sr = 24000; t = np.arange(int(sr * seconds)) / sr
    pcm = (np.sin(2 * np.pi * 180 * t) * 8000).astype(np.int16)
    return [base64.b64encode(pcm[i:i + 4800].tobytes()).decode() for i in range(0, len(pcm), 4800)]


def send(conn, **sc):
    conn['ws'].send(json.dumps({'serverContent': sc}))


def reponse(conn, texte, entendu=None, sec=0.8):
    if entendu: send(conn, inputTranscription={'text': entendu})
    ch = audio_chunks(sec)
    for c in ch[:2]: send(conn, modelTurn={'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': c}}]})
    if texte: send(conn, outputTranscription={'text': texte})
    for c in ch[2:]: send(conn, modelTurn={'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': c}}]})
    send(conn, turnComplete=True)


async def main():
    conns = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(bypass_csp=True, viewport={'width': 412, 'height': 900}, permissions=['microphone', 'camera'], service_workers='block', user_agent=PHONE_UA)
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AIzaTESTTESTTESTTESTTESTTESTTEST', listenMode:'regard', model:'gemini-3.1-flash-live-preview', logUrl:'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTEST/exec', crm:true, v:4}));")
        await ctx.add_init_script(STUB)
        await ctx.add_init_script(GAZE)
        page = await ctx.new_page(); logs = []
        async def script(route):
            await route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'},
                                body=json.dumps({'ok': True, 'contacts': 10, 'brouillons': 0, 'reglages': None, 't': 0}))
        await page.route(re.compile(r'https://script\.google\.com/.*'), script)
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
        page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))

        def handler(ws):
            conn = {'ws': ws, 'texts': [], 'setup': None, 'resp': {}}; conns.append(conn)
            def on_msg(m):
                d = json.loads(m)
                if 'setup' in d: conn['setup'] = d['setup']; ws.send(json.dumps({'setupComplete': {}}))
                elif 'realtimeInput' in d and 'text' in d['realtimeInput']: conn['texts'].append(d['realtimeInput']['text'])
                elif 'toolResponse' in d:
                    for fr in d['toolResponse'].get('functionResponses', []): conn['resp'][fr.get('id')] = json.dumps(fr.get('response'), ensure_ascii=False)
            ws.on_message(on_msg)
        await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)
        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
        await page.wait_for_function('wilson._voitureBt === true', timeout=8000)
        await page.evaluate("""() => { window.__joue = 0; const A = wilson.audio, p0 = A.play.bind(A); A.play = (a, r) => { window.__joue++; return p0(a, r); }; }""")
        has = lambda t: any(t in l for l in logs)

        async def attendre(cond, s=8.0):
            for _ in range(int(s * 10)):
                if cond(): return True
                await page.wait_for_timeout(100)
            return False

        async def ouvrir():
            await page.evaluate("wilson.startConversation('toucher')")
            await page.wait_for_function('wilson.state === "conversation" && wilson.brain.open', timeout=8000)
            await page.wait_for_timeout(300)
            return conns[-1]

        async def demande(conn, fid, phrase, args):
            send(conn, inputTranscription={'text': phrase})
            await page.evaluate("window.__parle(300)")
            conn['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': fid, 'name': 'crm_noter', 'args': args}]}}))
            send(conn, turnComplete=True)
            await attendre(lambda: fid in conn['resp'], 10)
            return conn['resp'].get(fid, '')

        async def dicter(conn, phrase, wilson="Compte rendu de visite… Je l'enregistre ?"):
            await page.wait_for_function('!wilson.audio.playing', timeout=8000)
            reponse(conn, wilson, phrase)
            await page.wait_for_timeout(500)

        # ---------- 1. Dictée : « note un compte rendu de visite pour Dupont » ----------
        conn = await ouvrir()
        reponse(conn, 'Oui ?'); await page.wait_for_timeout(700)
        n0 = len(conn['texts'])
        r = await demande(conn, 'd1', 'Note un compte rendu de visite pour la société Dupont.', {'type': 'compte_rendu', 'client': 'Dupont', 'echange': 'visite', 'texte': 'Visite'})
        carte = await page.evaluate("(() => { const c = document.querySelector('#cards .card.dictee'); return c && !document.getElementById('cards').hidden ? c.textContent : ''; })()")
        check('Compte rendu annoncé sans son contenu : la dictée s\'ouvre, rien n\'est préparé dans le CRM', 'Dictée ouverte' in r and 'tu ne dis RIEN' in r and 'J\'ai fini' in r, r)
        check('… bouton « J\'ai fini » à l\'écran (et « Annuler »)', "J'ai fini" in carte and 'Annuler' in carte and 'Dupont' in carte, carte)
        pending = await page.evaluate('!!wilson.crm.pending')
        check('… aucune écriture préparée (pas de « Je l\'enregistre ? » à chaque phrase)', not pending)
        await page.wait_for_function('!wilson.audio.playing', timeout=8000)
        j0 = await page.evaluate('window.__joue')
        reponse(conn, "Je t'écoute pour Dupont. Prends ton temps, et touche « J'ai fini » quand tu as terminé.")
        await attendre(lambda: has('Dictée : annonce faite'), 5)
        j1 = await page.evaluate('window.__joue')
        check('… l\'annonce est dite, puis il écoute sans rien dire', j1 > j0 and has('Dictée : annonce faite'), f'{j0} {j1}')
        await dicter(conn, "Alors pour le compte-rendu, elle va nous repasser commande sur des joints prochainement.")
        await dicter(conn, "Ils ont l'habitude de travailler avec une centrale d'achat régionale.")
        j2 = await page.evaluate('window.__joue')
        check('Pendant la dictée : sa voix est coupée (rien n\'est joué), rien n\'est relu à chaque pause', j2 == j1 and has('Dictée : Wilson se tait'), f'{j1} {j2}')
        check('… chaque morceau est noté au journal', has('Dictée : « Alors pour le compte-rendu') and has('Dictée : « Ils ont l\'habitude'))
        conn['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': 'd2', 'name': 'crm_noter', 'args': {'type': 'compte_rendu', 'client': 'Dupont', 'texte': 'Commande de joints.'}}]}}))
        await attendre(lambda: 'd2' in conn['resp'], 5)
        check('… un outil demandé pendant la dictée est refusé (« ne dis rien »)', 'Dictée en cours' in conn['resp'].get('d2', '') and not await page.evaluate('!!wilson.crm.pending'), conn['resp'].get('d2', ''))
        await page.evaluate("wilson._heardAt = performance.now() - 70000; wilson.playEndAt = performance.now() - 70000; wilson._convAt = performance.now() - 70000; wilson._resumedAt = 0; wilson.lastActivity = performance.now() - 70000; wilson.lastUserSpeech = 0")
        await page.wait_for_timeout(1500)
        check('… la discussion ne se ferme pas après 1 min de silence pendant la dictée', await page.evaluate('wilson.state') == 'conversation')
        n1 = len(conn['texts'])
        await dicter(conn, "Pour la quincaillerie, ils ont déjà tout commandé. Voilà, j'ai fini.")
        t = [x for x in conn['texts'][n1:] if x.startswith('[Dictée finie')]
        dicte = t[0].split('approximative) : « ', 1)[-1].split(' ». ', 1)[0] if t else ''
        check('« … Voilà, j\'ai fini » : la dictée se termine, tout le texte est donné d\'un coup à Gemini (sans « voilà, j\'ai fini »)', len(t) == 1 and 'joints' in dicte and "centrale d'achat régionale" in dicte and "ils ont déjà tout commandé" in dicte and "fini" not in dicte and 'Voilà' not in dicte, dicte)
        check('… avec une seule écriture à préparer (client, échange) et une seule relecture', t and 'crm_noter UNE seule fois' in t[0] and 'client « Dupont »' in t[0] and 'échange visite' in t[0] and 'une fois' in t[0], str(t)[:400])
        gone = await page.evaluate("!document.querySelector('#cards .card.dictee')")
        check('… le bouton disparaît, Wilson reparle normalement', gone and await page.evaluate('!wilson._dictee'))
        await page.wait_for_function('!wilson.audio.playing', timeout=8000)
        j3 = await page.evaluate('window.__joue')
        reponse(conn, "Compte rendu de visite, MENUISERIE DUPONT : « Prochaine commande de joints… » Je l'enregistre ?")
        await page.wait_for_timeout(600)
        check('… sa relecture est jouée', await page.evaluate('window.__joue') > j3)

        # ---------- 2. Le bouton « J'ai fini » ----------
        await page.wait_for_function('!wilson.audio.playing', timeout=8000)
        r = await demande(conn, 'd3', "Je vais te dicter un compte rendu d'appel pour Dupont.", {'type': 'compte_rendu', 'client': 'Dupont', 'echange': 'appel', 'texte': ''})
        check('Texte vide (« je vais te dicter ») : dictée ouverte', 'Dictée ouverte' in r, r)
        reponse(conn, "Je t'écoute pour Dupont."); await attendre(lambda: sum('annonce faite' in l for l in logs) >= 2, 5)
        await dicter(conn, "Elle rappelle lundi pour le devis des poignées.")
        n2 = len(conn['texts'])
        await page.click('#cards .card-fini')
        await page.wait_for_timeout(400)
        t = [x for x in conn['texts'][n2:] if x.startswith('[Dictée finie')]
        check('Bouton « J\'ai fini » touché : tout le texte part d\'un coup', len(t) == 1 and 'poignées' in t[0] and 'bouton' in t[0] and 'échange appel' in t[0], str(t)[:300])

        # ---------- 3. Annuler ----------
        await page.wait_for_function('!wilson.audio.playing', timeout=8000)
        await demande(conn, 'd4', 'Note un compte rendu pour Dupont.', {'type': 'compte_rendu', 'client': 'Dupont', 'texte': ''})
        reponse(conn, "Je t'écoute."); await attendre(lambda: sum('annonce faite' in l for l in logs) >= 3, 5)
        n3 = len(conn['texts'])
        await dicter(conn, 'Non, laisse tomber.')
        check('« Laisse tomber » pendant la dictée : rien n\'est noté', any('je ne note rien' in x for x in conn['texts'][n3:]) and has('Dictée annulée') and await page.evaluate('!wilson._dictee'), str(conn['texts'][n3:])[:200])

        # ---------- 4. Coupée par un appel : reprise, rien de perdu ----------
        await page.wait_for_function('!wilson.audio.playing', timeout=8000)
        await demande(conn, 'd5', 'Note un compte rendu de visite pour Dupont.', {'type': 'compte_rendu', 'client': 'Dupont', 'echange': 'visite', 'texte': 'Visite'})
        reponse(conn, "Je t'écoute."); await attendre(lambda: sum('annonce faite' in l for l in logs) >= 4, 5)
        await dicter(conn, 'Projet de garde-corps, ils vont nous consulter.')
        await page.evaluate("wilson.endConversation('appel téléphonique')")
        await page.wait_for_timeout(300)
        check('Appel pendant la dictée : ce qui est dicté est gardé', has('Dictée coupée (fin de la discussion)') and await page.evaluate("wilson._dictee && wilson._dictee.etat === 'coupee'"))
        await page.evaluate("wilson.startConversation('apres_appel_entrant')")
        await page.wait_for_function('wilson.state === "conversation" && wilson.brain.open', timeout=8000)
        await page.wait_for_timeout(400)
        conn = conns[-1]
        check('… au retour : « On reprend ta dictée », bouton revenu (et pas la phrase d\'après un appel)', any('On reprend ta dictée' in x for x in conn['texts']) and not any('discussion a été coupée' in x for x in conn['texts'])
              and await page.evaluate("!!document.querySelector('#cards .card.dictee')"), str(conn['texts'])[:300])
        reponse(conn, "On reprend ta dictée, je t'écoute."); await attendre(lambda: sum('annonce faite' in l for l in logs) >= 5, 5)
        await dicter(conn, "Et ils veulent un échantillon. J'ai fini.")
        t = [x for x in conn['texts'] if x.startswith('[Dictée finie')]
        check('… la fin contient ce qui était dicté avant l\'appel et après', t and 'garde-corps' in t[-1] and 'échantillon' in t[-1], str(t)[-300:])

        # ---------- 5. Quand la dictée s'ouvre ----------
        v = await page.evaluate("""() => { const W = wilson, d = (args, heard) => { W._heard.length = 0; if (heard) W._noteHeard(heard, true); return W._dicteeVoulue({ args }); };
          return [d({ type: 'compte_rendu', client: 'Dupont', texte: 'Prochaine commande de joints.' }, 'note que la prochaine commande sera des joints'),
                  d({ type: 'compte_rendu', client: 'Dupont', echange: 'visite', texte: 'Visite' }, "Indique que je suis passé chez Dupont aujourd'hui."),
                  d({ type: 'compte_rendu', client: 'Dupont', echange: 'visite', texte: 'Visite avec Marie Durand' }, 'note un compte rendu de visite avec Marie Durand'),
                  d({ type: 'rdv', client: 'Dupont', texte: '' }, 'note un rendez-vous'),
                  d({ type: 'tache', texte: '' }, 'je vais te dicter une longue tâche')]; }""")
        check('Dictée seulement sans contenu : contenu déjà dit → relecture comme avant ; « indique que je suis passé » → simple visite ; rendez-vous jamais', v == [False, False, True, False, True], str(v))

        # ---------- 6. Remarques sur Wilson : pas pour le CRM ----------
        await page.wait_for_function('!wilson.audio.playing', timeout=8000)
        await page.evaluate("window.__parle(300)")
        send(conn, inputTranscription={'text': "C'est où la mise à jour que j'avais demandé tout à l'heure ?"})
        conn['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': 'q1', 'name': 'crm_question', 'args': {'question': "C'est où la mise à jour que j'avais demandé tout à l'heure ?"}}]}}))
        send(conn, turnComplete=True)
        await attendre(lambda: 'q1' in conn['resp'], 6)
        r = conn['resp'].get('q1', '')
        check('11h38 : « c\'est où la mise à jour ? » → pas à l\'analyste du CRM : mes_remarques', 'REFUSÉ' in r and 'mes_remarques' in r and not has('Question au CRM : « C\'est où la mise à jour'), r)
        conn['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': 'q2', 'name': 'crm_question', 'args': {'question': 'Correction immédiate du problème de coupure de parole lors de la dictée.'}}]}}))
        await attendre(lambda: 'q2' in conn['resp'], 6)
        send(conn, turnComplete=True); await page.wait_for_timeout(300)
        check('09h27 : « correction immédiate du problème de coupure de parole » → remarque, aucune promesse', 'remarque' in conn['resp'].get('q2', '') and 'Ne promets aucune correction' in conn['resp'].get('q2', ''), conn['resp'].get('q2', ''))
        sysv = await page.evaluate('wilson._system()')
        check('Consigne voiture : dire le délai de l\'outil remarque et aucun autre ; plus de « compte une heure environ »', 'compte une heure environ.' not in sysv and 'aucun autre' in sysv and 'mes_remarques' in sysv)

        # ---------- 7. En voiture, plus de fenêtre d'information ----------
        e = await page.evaluate("(() => { const r = wilson.outils._montrer('<p>PEA</p>', { titre: '📈 Suivi bourse' }); return { r, cache: document.getElementById('ecran').hidden }; })()")
        check('09h24:41 : en voiture, le suivi bourse (ou la météo…) n\'ouvre plus de fenêtre', e['r'] is False and e['cache'] is True and has('pas affiché en voiture'), str(e))
        check('… la consigne le dit (seulement sa tête ; restent Oui / Non, appeler, J\'ai fini)', 'ne dis jamais « j\'affiche »' in sysv and 'J\'ai fini' in sysv)

        # ---------- 8. 09h17-09h18 : tâche déjà enregistrée ----------
        r = await page.evaluate("""(async () => { const C = wilson.crm;
          const a = { type: 'tache', texte: 'Lui envoyer le mail avec le catalogue de printemps.', date: 'demain' };
          const p1 = await C.prepare(a); const relu = p1.pending.relu;
          C.pending = null; C.ecritRecent = { at: Date.now() - 20000, relu, type: 'tache', cle: '' }; C.dernierEnregistre = { at: Date.now() - 20000, relu };
          const p2 = await C.prepare(a);
          const p3 = await C.prepare({ ...a, texte: 'Le rappeler pour le devis.' });
          C.pending = null; return { p2, p3, relu }; })()""")
        check('« Elle est enregistrée ? » : la même tâche n\'est pas repréparée (« déjà enregistré »)', r['p2']['ok'] is False and 'DÉJÀ ENREGISTRÉ' in r['p2']['dire'], str(r['p2'])[:200])
        check('… une autre tâche se prépare normalement', r['p3']['ok'] is True, str(r['p3'])[:200])
        await page.wait_for_function('!wilson.audio.playing', timeout=8000)
        # (la phrase préparée était dans le résultat de crm_noter, comme ce matin-là : une source)
        await page.evaluate("(() => { const relu = 'Tâche pour le vendredi 27/11/26 : « Lui envoyer le mail avec le catalogue de printemps. ».'; wilson._noteSource('Rien n\\'est encore écrit. Relis-lui exactement : « ' + relu + ' »'); wilson.crm.dernierEnregistre = { at: Date.now() - 20000, relu }; })()")
        j4 = await page.evaluate('window.__joue')
        await page.evaluate("window.__parle(300)")
        reponse(conn, 'Oui, la tâche a bien été enregistrée dans le CRM. C\'était pour envoyer le mail avec le catalogue de printemps.', 'De quoi, elle est enregistrée la tâche ?')
        await page.wait_for_timeout(800)
        check('… « Oui, la tâche a bien été enregistrée » (vrai : enregistrée il y a 20 s) est dit, pas retenu par le verrou', has('il confirme l\'écriture faite') and not has('JAMAIS DITE — « Oui, la tâche a bien') and await page.evaluate('window.__joue') > j4)
        await page.wait_for_function('!wilson.audio.playing', timeout=8000)
        n4 = len(conn['texts'])
        await page.evaluate("""() => { const W = wilson; W.crm.pending = { type: 'tache', relu: 'Tâche pour demain : « x ».', at: performance.now(), turn: W._turnN }; W.showConfirm(W.crm.pending);
          W._noteHeard("Bah non du coup si c'est déjà enregistré, il y a pas besoin de la réenregistrer.", true); }""")
        await page.click('#cards .card-x')
        await page.wait_for_timeout(300)
        t = conn['texts'][n4:]
        check('« Non » touché juste après « pas besoin de la réenregistrer » : aucune question (« je n\'enregistre rien »)', any("je n'enregistre rien" in x for x in t) and not any('ce qu\'il faut changer' in x for x in t), str(t)[:200])

        # ---------- 9. 09h28 : deux clients possibles sans ville → aucune ville demandée (Wilson en avait inventé deux) ----------
        r = await page.evaluate("""(() => { const C = wilson.crm, g = (societe, ville) => ({ g: { societe, ville, contacts: [] }, contact: null });
          return { sans: C._plusieursTexte('Ouest Ouverture', [g('OUEST OUVERTURES', ''), g('OUEST OUVERTURES MAINTENANCE', '')]),
                   avec: C._plusieursTexte('Dupont', [g('DUPONT', 'Cholet'), g('DUPONT FERMETURES', 'Saumur')]),
                   une: C._plusieursTexte('Dupont', [g('DUPONT', 'Cholet'), g('DUPONT FERMETURES', '')]) }; })()""")
        check('09h28 : plusieurs clients sans ville dans le CRM → le résultat ne demande plus de citer leur ville (« n\'en cite aucune »)', 'la ville de chacun' not in r['sans'] and "n'en cite aucune" in r['sans'] and 'et la ville' not in r['sans'], r['sans'])
        check('… avec leur ville → nom et ville de chacun, comme avant', 'cite le nom et la ville de chacun' in r['avec'] and 'Cholet' in r['avec'], r['avec'])
        check('… une seule ville connue → seulement celle-là, aucune inventée', "n'invente aucune ville" in r['une'], r['une'])

        # ---------- 10. 10h29 : une demande sur ses e-mails, sans outil → l'outil mails, plus l'analyste du CRM ----------
        r = await page.evaluate("""(() => { const W = wilson, out = [], s0 = W.brain.sendText;
          Object.defineProperty(W.claude, 'on', { get: () => true, configurable: true });
          W.brain.sendText = (t) => out.push(t);
          try {
            W._sansOutil = null; W._vvForcer("pour mon client là que je vais voir. Je lui avais fait un email avec les choses qu'il fallait qu'on regarde ensemble. Est-ce que tu peux me rappeler tout ce qu'il y avait dans cet email ?", 'Je regarde tes e mails. De quel client parles-tu ?');
            const un = out.slice(); out.length = 0;
            W._sansOutil = null; W._vvForcer("C'est quoi l'adresse mail de Monsieur Martin ?", 'Je regarde.');
            const adr = out.slice(); out.length = 0;
            W._sansOutil = null; W._vvForcer('Quels clients ont commandé du joint ce mois-ci ?', 'Je regarde.');
            return { un, adr, crm: out.slice() };
          } finally { W.brain.sendText = s0; delete W.claude.on; W._sansOutil = null; } })()""")
        check('10h29 : « tu peux me rappeler ce qu\'il y avait dans cet email ? » sans outil → mails exigé, plus crm_question', any('Appelle maintenant mails' in t for t in r['un']) and not any('crm_question' in t for t in r['un']), str(r['un'])[:300])
        check('… « l\'adresse mail de Monsieur Martin » reste une fiche du CRM (crm_client)', any('crm_client' in t for t in r['adr']) and not any('Appelle maintenant mails' in t for t in r['adr']), str(r['adr'])[:300])
        check('… une question sur ses clients reste pour l\'analyste du CRM', any('crm_question' in t for t in r['crm']), str(r['crm'])[:300])

        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    if not all(results): raise SystemExit(1)

asyncio.run(main())
