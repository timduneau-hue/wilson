"""Questions difficiles par Claude sur le PC de la maison (PLAN 10, version 1.33.0), et corrections du journal du 05/11/26 au soir.
Script (file d'attente claude_…), Gemini Live et l'analyste Gemini simulés. Vérifie : outil question_difficile déclaré ;
réponse de Claude rendue mot pour mot ; crm_question passe par Claude (règles du CRM jointes, pas d'analyste) ; PC absent →
analyste / recherche rapide, dit une seule fois ; question pas prise → secours ; « Je cherche. » sans question en arrière-plan ;
batterie réelle ; lumière : commande contraire à la demande refusée ; chien de garde après un outil gardé quand la
transcription arrive en retard ; pas de relance pendant qu'il dit une réponse attendue."""
import asyncio, re, json, os
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, '' if ok else detail, flush=True)

URL = 'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTESTTESTTEST/exec'
FAKE_TTS = open(os.path.join(S, 'e2e_eco.py'), encoding='utf-8').read().split('FAKE_TTS = """')[1].split('"""')[0]
DIRE = "D'après la fiche Simonswerk, la Tectus TE 340 3D porte 80 kilos pour deux paumelles ; l'équivalent Boschat est la référence 0123456."


async def main():
    conns = []
    st = {'demandes': [], 'actions': [], 'pc': {'vivant': True, 'vu': 4}, 'mode': 'faite', 'n_res': {}, 'gem': 0, 'dire': DIRE}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])

        async def script(route):
            req = route.request; H = {'access-control-allow-origin': '*'}
            if req.method != 'POST': await route.fulfill(status=200, body='ok'); return
            d = json.loads(req.post_data or '{}'); a = d.get('action', ''); st['actions'].append(a)
            body = None
            if a == 'reglages_lire': body = {'ok': True, 'reglages': None, 't': 0}
            elif a == 'claude_etat': body = {'ok': True, 'pc': st['pc']}
            elif a == 'claude_demander':
                st['demandes'].append(d)
                body = {'ok': True, 'accepte': st['pc']['vivant'], 'id': d['id'], 'etat': 'attente', 'pc': st['pc']}
            elif a == 'claude_resultat':
                n = st['n_res'][d['id']] = st['n_res'].get(d['id'], 0) + 1
                if st['mode'] == 'jamais_pris': await asyncio.sleep(min(1.0, d.get('attente', 1))); body = {'ok': True, 'etat': 'attente', 'pc': st['pc']}
                elif st['mode'] == 'lent' and n <= 4: await asyncio.sleep(1.0); body = {'ok': True, 'etat': 'en_cours', 'pris': 1, 'pc': st['pc']}
                elif n == 1: body = {'ok': True, 'etat': 'en_cours', 'pris': 1, 'pc': st['pc']}
                else: await asyncio.sleep(1.2); body = {'ok': True, 'etat': 'faite', 'dire': st['dire'], 'detail': 'Tectus TE 340 3D : 80 kg. Source : simonswerk.fr', 'etapes': 9, 'duree': 41, 'pc': st['pc']}
            elif a == 'claude_annuler': body = {'ok': True, 'etat': 'annulee'}
            elif a == 'chercher': body = {'ok': True, 'reponse': 'La Tectus TE 340 porte 80 kg.', 'resultats': [{'titre': 'Simonswerk', 'url': 'https://x', 'extrait': 'Tectus TE 340 3D, 80 kg'}]}
            elif a == 'crm_schema': body = {'ok': True, 'texte': 'Tables : commandes (date, client, montant)'}
            elif a == 'crm_requete': body = {'ok': True, 'texte': 'Résultat : 3 clients'}
            elif a.startswith('crm_'): body = {'ok': True, 'texte': 'ok'}
            if body is None: await route.fulfill(status=200, headers=H, body='ok'); return
            await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(body, ensure_ascii=False))

        async def gemini_rest(route):                           # l'analyste et le mode économique (Gemini REST)
            req = route.request; H = {'access-control-allow-origin': '*'}
            if req.method == 'OPTIONS': await route.fulfill(status=204, headers={**H, 'access-control-allow-headers': '*'}); return
            st['gem'] += 1
            body = json.loads(req.post_data or '{}')
            sysp = json.dumps(body.get('systemInstruction', {}), ensure_ascii=False)
            out = {'action': 'repondre', 'reponse': 'Trois clients n\'ont pas commandé de serrures depuis mars.'} if "analyste du CRM de Timothée" in sysp else {'pourMoi': True, 'reponse': 'La Tectus TE 340 porte 80 kilos.'}
            await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'candidates': [{'content': {'parts': [{'text': json.dumps(out, ensure_ascii=False)}]}}]}))

        def handler(ws):
            conn = {'ws': ws, 'setup': None, 'texts': [], 'resp': []}; conns.append(conn)
            def on_msg(m):
                d = json.loads(m)
                if 'setup' in d:
                    conn['setup'] = d['setup']; ws.send(json.dumps({'setupComplete': {}}))
                    ws.send(json.dumps({'sessionResumptionUpdate': {'resumable': True, 'newHandle': 'h%d' % len(conns)}}))
                elif 'toolResponse' in d: conn['resp'].extend(d['toolResponse']['functionResponses'])
                elif 'realtimeInput' in d and 'text' in d['realtimeInput']: conn['texts'].append(d['realtimeInput']['text'])
            ws.on_message(on_msg)

        ctx = await b.new_context(bypass_csp=True, viewport={'width': 412, 'height': 860}, permissions=['microphone', 'camera'], service_workers='block')
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify(%s));" % json.dumps(
            {'apiKey': 'AIzaTESTTESTTESTTESTTESTTESTTEST', 'listenMode': 'toujours', 'convTimeout': 60, 'logUrl': URL, 'crm': True, 'voitureAuto': False, 'v': 4}))
        await ctx.add_init_script(FAKE_TTS)
        page = await ctx.new_page(); logs = []
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
        await page.route(re.compile(r'https://script\.google\.com/.*'), script)
        await page.route(re.compile(r'.*generativelanguage\.googleapis\.com/v1beta/models/.*:(generateContent|streamGenerateContent).*'), gemini_rest)
        await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)
        page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
        await page.evaluate("wilson._crmAutorise = () => ({ ok: true, pourquoi: 'essai' })")   # CRM réservé à Timothée (06/11/26) : ici on fait comme s'il était reconnu
        has = lambda t: any(t in l for l in logs)

        await page.evaluate("wilson.startConversation('toucher')")
        await page.wait_for_function('wilson.state === "conversation" && wilson.brain.open', timeout=8000)
        conn = conns[-1]
        names = [f['name'] for f in conn['setup']['tools'][0]['functionDeclarations']]
        sysp = conn['setup']['systemInstruction']['parts'][0]['text']
        check('Outil question_difficile déclaré (script relié), et batterie', 'question_difficile' in names and 'batterie' in names, str(names))
        check('Consigne : question_difficile, « Je cherche. », réponse répétée mot pour mot', 'question_difficile' in sysp and 'Je cherche.' in sysp and 'mot pour mot' in sysp)

        async def tool(c, name, args, cid):
            c['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': cid, 'name': name, 'args': args}]}}))
        async def attendre_resp(c, cid, s=15):
            for _ in range(int(s * 10)):
                await asyncio.sleep(0.1)
                r = next((x for x in c['resp'] if x['id'] == cid), None)
                if r: return r.get('response', {}).get('result', '')
            return ''

        # 1. Question difficile : Claude répond, la réponse est rendue mot pour mot
        await tool(conn, 'question_difficile', {'question': "Quelle charge pour une Tectus TE 340 3D, et l'équivalent Boschat ?"}, 'd1')
        await page.wait_for_timeout(400)
        check('Pendant que Claude cherche : tête qui réfléchit', await page.evaluate("wilson.face.emotion") == 'reflexion')
        res = await attendre_resp(conn, 'd1')
        dem = st['demandes'][0] if st['demandes'] else {}
        check('Question envoyée au PC : type internet, texte complet, appareil', dem.get('type') == 'internet' and 'Tectus' in dem.get('question', '') and dem.get('voiture') is False, json.dumps(dem, ensure_ascii=False))
        check('Réponse de Claude rendue à Gemini, à répéter mot pour mot', DIRE in res and 'MOT POUR MOT' in res and 'Réponse de Claude' in res, res)
        check('… avec le détail seulement s\'il demande à le voir', 'montre-moi' in res and 'simonswerk.fr' in res, res)
        check('Journal : question prise par le PC, réponse en N s', has('Claude (PC) : question prise par le PC') and has('Claude (PC) : réponse en'), '\n'.join(l for l in logs if 'Claude' in l))
        card = await page.evaluate("document.getElementById('cards').innerText")
        check('Rien affiché d\'office (règle du 04/11/26)', 'Tectus' not in card, card)

        # 2. crm_question : Claude d'abord (règles du CRM jointes), pas d'analyste Gemini
        g0 = st['gem']; st['demandes'].clear(); st['dire'] = 'Dans ton CRM, trois clients n\'ont pas commandé de serrures depuis mars : AD2M, Gallais et FMA.'
        await tool(conn, 'crm_question', {'question': "Qui n'a pas commandé de serrures depuis mars ?"}, 'c1')
        res = await attendre_resp(conn, 'c1')
        dem = st['demandes'][0] if st['demandes'] else {}
        check('crm_question → Claude (type crm, règles du CRM jointes)', dem.get('type') == 'crm' and 'Ne devine jamais' in dem.get('regles', '') and 'exercice' in dem.get('regles', ''), json.dumps(dem, ensure_ascii=False)[:300])
        check('… réponse de Claude rendue, l\'analyste Gemini n\'est pas appelé', 'AD2M, Gallais et FMA' in res and st['gem'] == g0, f"{res} / gem {st['gem'] - g0}")

        # 2 bis. Recherche longue à la maison : le bip-bip aussi (question du 06/11/26, 00h11)
        st['mode'] = 'lent'; st['dire'] = DIRE; logs.clear()
        await page.evaluate("wilson._heardAt = 0")
        t_dep = await page.evaluate("performance.now()")
        await tool(conn, 'question_difficile', {'question': 'Compare deux crémones'}, 'd0')
        await asyncio.sleep(2.5)
        dbg = await page.evaluate("JSON.stringify({ st: wilson.state, an: wilson._analyses && wilson._analyses.size, pl: wilson.audio.playing, vs: wilson.voice.speaking, h: performance.now() - (wilson._heardAt || 0), cd: wilson._chercheDepuis, tic: wilson._ticAt, vb: wilson._voitureBt, bm: wilson.settings.bipMaison })")
        res = await attendre_resp(conn, 'd0', 20)
        check('Recherche longue à la maison : petit son de réflexion (bip-bip)', (json.loads(dbg).get('tic') or 0) > t_dep and json.loads(dbg).get('vb') is not True and DIRE[:20] in res, dbg)
        st['mode'] = 'faite'

        # 2 ter. Le CRM, seulement pour Timothée (règle du 06/11/26, 00h39) : visage reconnu, ou téléphone en voiture
        await page.evaluate("""delete wilson._crmAutorise; wilson.__q = wilson.qui.qui; wilson.__t = wilson.qui.trouver;
            wilson.qui.trouver = (n) => ({ nom: n }); window.__visage = { nom: 'Camille', sur: true }; wilson.qui.qui = () => window.__visage""")
        st['demandes'].clear(); g0 = st['gem']
        await tool(conn, 'crm_question', {'question': "Combien j'ai fait de chiffre ce mois-ci ?"}, 'k1')
        res = await attendre_resp(conn, 'k1')
        check('CRM : Camille devant la tablette → refusé, rien demandé au PC ni à l\'analyste', 'REFUSÉ' in res and 'Désolé Camille' in res and not st['demandes'] and st['gem'] == g0 and has('CRM refusé'), res)
        await tool(conn, 'question_difficile', {'question': 'Compare deux perceuses Makita'}, 'k2')
        res = await attendre_resp(conn, 'k2')
        dem = st['demandes'][0] if st['demandes'] else {}
        check('… sa question Internet part bien à Claude, mais sans le CRM (crm = false)', dem.get('type') == 'internet' and dem.get('crm') is False and DIRE[:20] in res, json.dumps(dem, ensure_ascii=False)[:200])
        await page.evaluate("window.__visage = { inconnu: true, sur: false }")
        await tool(conn, 'crm_client', {'client': 'AD2M'}, 'k3')
        res = await attendre_resp(conn, 'k3')
        check('… un visage inconnu → refusé aussi (fiche client comprise)', 'REFUSÉ' in res and 'seulement pour Timothée' in res, res)
        await page.evaluate("window.__visage = { nom: 'Camille', sur: true }; wilson.car = { why: 'bouton', at: Date.now() }")
        await tool(conn, 'crm_question', {'question': 'Mon CA ?'}, 'k4')
        res = await attendre_resp(conn, 'k4')
        check('… tablette en « mode voiture » : toujours le visage qui compte (refusé)', 'REFUSÉ' in res, res)
        await page.evaluate("wilson.car = null; window.__visage = { nom: 'Timothée', sur: true }")
        st['demandes'].clear(); st['dire'] = 'Ce mois-ci, tu as fait 41 200 euros.'
        await tool(conn, 'crm_question', {'question': 'Mon CA ?'}, 'k5')
        res = await attendre_resp(conn, 'k5')
        dem = st['demandes'][0] if st['demandes'] else {}
        check('CRM : visage de Timothée reconnu → la question part (type crm)', '41 200' in res and dem.get('type') == 'crm' and dem.get('crm') is True, res + json.dumps(dem, ensure_ascii=False)[:200])
        st['demandes'].clear(); st['dire'] = DIRE
        await tool(conn, 'question_difficile', {'question': 'Équivalent Boschat de la Setin 4455 ?'}, 'k6')
        await attendre_resp(conn, 'k6')
        check('… et sa question difficile a le CRM (crm = true)', st['demandes'] and st['demandes'][0].get('crm') is True, json.dumps(st['demandes'][:1], ensure_ascii=False)[:200])
        await page.evaluate("""window.__visage = null; Object.defineProperty(wilson.famille, 'telephone', { get: () => true, configurable: true }); Object.defineProperty(wilson, '_voitureBt', { get: () => true, configurable: true })""")
        st['demandes'].clear(); st['dire'] = 'Ce mois-ci, tu as fait 41 200 euros.'
        await tool(conn, 'crm_question', {'question': 'Mon CA ?'}, 'k7')
        res = await attendre_resp(conn, 'k7')
        check('CRM : téléphone relié à la voiture → pas besoin du visage', '41 200' in res and st['demandes'] and st['demandes'][0].get('type') == 'crm', res)
        await page.evaluate("""delete wilson._voitureBt; delete wilson.famille.telephone; wilson.qui.qui = wilson.__q; wilson.qui.trouver = wilson.__t;
            wilson._crmAutorise = () => ({ ok: true, pourquoi: 'essai' })""")
        st['dire'] = DIRE; st['demandes'].clear()

        # 3. PC absent : l'analyste répond, et Wilson le dit une fois
        st['pc'] = {'vivant': False, 'vu': 400}; st['demandes'].clear(); g0 = st['gem']
        await page.evaluate("wilson.claude.pc = null; wilson._indispoDitAt = 0")
        await tool(conn, 'crm_question', {'question': "Mon meilleur client du mois ?"}, 'c2')
        res = await attendre_resp(conn, 'c2', 20)
        check('PC absent → l\'analyste Gemini répond', 'Trois clients' in res and st['gem'] > g0, res)
        check('… et Wilson dit d\'abord que l\'ordinateur de la maison ne répond pas', "ordinateur de la maison ne répond pas" in res, res)
        n_dem = len(st['demandes'])
        await tool(conn, 'crm_question', {'question': "Et le deuxième ?"}, 'c3')
        res = await attendre_resp(conn, 'c3', 20)
        check('… une seule fois par demi-heure, et pas de nouvelle demande au PC dans la minute', 'ordinateur de la maison' not in res and 'Trois clients' in res and len(st['demandes']) == n_dem, f"{res} / demandes {len(st['demandes']) - n_dem}")

        # 4. Question difficile, PC absent → recherche rapide (Tavily), en le disant
        await tool(conn, 'question_difficile', {'question': 'Charge de la Tectus TE 340 ?'}, 'd2')
        res = await attendre_resp(conn, 'd2', 25)
        check('Question difficile, PC absent → recherche rapide, dite comme telle', 'Recherche rapide' in res and '80' in res and 'chercher' in st['actions'], res)

        # 5. PC présent mais la question n'est jamais prise → secours, annulation
        st['pc'] = {'vivant': True, 'vu': 3}; st['mode'] = 'jamais_pris'; st['demandes'].clear()
        await page.evaluate("wilson.claude.pc = null; wilson.claude.priseMaxMs = 2500")
        await tool(conn, 'question_difficile', {'question': 'Équivalent Boschat de la paumelle Setin 12345 ?'}, 'd3')
        res = await attendre_resp(conn, 'd3', 25)
        check('Question pas prise par le PC → annulée, recherche rapide à la place', len(st['demandes']) == 1 and 'claude_annuler' in st['actions'] and 'Recherche rapide' in res and has('pas_pris'), res)
        st['mode'] = 'faite'; await page.evaluate("wilson.claude.priseMaxMs = 30000")

        # 6. Arrière-plan (Gemini 3.1, outils synchrones) : « Je cherche. » et aucune question
        await page.evaluate("wilson.brain._mu0 = wilson.brain.modelUsed; wilson.brain.modelUsed = 'gemini-3.1-flash-live-preview'")
        st['dire'] = DIRE
        await tool(conn, 'question_difficile', {'question': 'Compare la Tectus TE 340 et la TE 540'}, 'd4')
        res = await attendre_resp(conn, 'd4', 5)
        check('Arrière-plan : « Je cherche. » et rien d\'autre, aucune question (remarque du 05/11/26, 19h23)', 'Je cherche.' in res and 'aucune question' in res and 'continue la discussion' not in res, res)
        for _ in range(100):
            await asyncio.sleep(0.1)
            if any('Tectus TE 340 3D porte 80 kilos' in t for t in conn['texts']): break
        t = next((t for t in conn['texts'] if 'porte 80 kilos' in t), '')
        check('… la réponse de Claude arrive en message (« La recherche que tu avais lancée »)', 'La recherche que tu avais lancée' in t and 'dans le CRM' not in t, t[:200])
        await page.evaluate("wilson.brain.modelUsed = wilson.brain._mu0; wilson._aDire = null")

        # 7. Batterie : la vraie, jamais inventée (journal du 05/11/26, 21h51)
        await tool(conn, 'batterie', {}, 'b1')
        res = await attendre_resp(conn, 'b1', 5)
        check('Outil batterie : niveau et branchement réels', re.search(r'Batterie : \d+ %, (branché|pas branché)', res) or 'ne donne pas' in res, res)

        # 8. Lumières : « éteins » demandé, « allumer » refusé (journal du 05/11/26, 20h18)
        r = await page.evaluate("""() => { wilson._heard.push({ t: performance.now(), text: 'Éteins toutes les lumières.', n: wilson._turnN });
          wilson._maisonCmd({ id: 'm1', name: 'maison_commande', args: { appareil: 'light.lumiere_jaune_salon', action: 'allumer' } }); return true; }""")
        res = await attendre_resp(conn, 'm1', 5)
        check('Maison : commande contraire à la dernière demande refusée', res.startswith('Refusé') and 'éteindre' in res, res)

        # 9. Chien de garde après un outil : la transcription de la demande arrive APRÈS le résultat (21h45:29-30)
        logs.clear()
        await tool(conn, 'date_et_heure', {}, 'h1')
        await attendre_resp(conn, 'h1', 5)
        conn['ws'].send(json.dumps({'serverContent': {'inputTranscription': {'text': 'Est-ce que tu as bien mis le rendez-vous de demain ?'}}}))
        await asyncio.sleep(0.2)
        conn['ws'].send(json.dumps({'serverContent': {'turnComplete': True}}))
        for _ in range(100):
            await asyncio.sleep(0.1)
            if has('Wilson muet'): break
        check('Muet après un outil, transcription en retard : relancé quand même', has('Wilson muet') and any('Tu as le résultat de ton outil' in t for t in conn['texts']), '\n'.join(logs[-12:]))

        # 10. Réponse attendue : pas de relance pendant qu'il la dit (journal du 05/11/26, 19h23 : « cafouillis complet »)
        logs.clear(); n_txt = len(conn['texts'])
        await page.evaluate("""() => { wilson._aDire = { question: 'mes tâches', dire: 'Tu as neuf tâches à venir.', s: 12, at: Date.now(), conv: null, envoyeAt: 0, cle: 'x', ou: 'dans le CRM ' };
          wilson._aDireEnvoyer(); setTimeout(() => { wilson._voixDepuis = performance.now(); }, 3000); }""")
        await asyncio.sleep(9)
        check('Réponse attendue en train d\'être dite : pas de relance qui la coupe', has('pas de relance') and not has('Réponse attendue pas encore dite : relance'), '\n'.join(logs[-8:]))

        # 11. Journal du 12/11/26, 19h47:43 : la réponse sur ses e-mails était annoncée à Gemini comme « la recherche dans le CRM »
        n_txt = len(conn['texts'])
        await page.evaluate("wilson._aDire = null; wilson._lateAnswer({ id: 'm1', quoi: 'mail', question: 'lire les derniers mails', t0: performance.now() - 23000 }, { dire: 'Tu as dix mails non lus.' }, 23)")
        await asyncio.sleep(0.5)
        tx = conn['texts'][n_txt:]
        check('Réponse sur ses e-mails : « la recherche dans ses e-mails », pas « dans le CRM »', any('La recherche dans ses e-mails que tu avais lancée' in t for t in tx) and not any('dans le CRM que tu avais lancée' in t for t in tx), str(tx)[:300])
        await page.evaluate("wilson._aDire = null")

        check('Aucune erreur JavaScript', not any('PAGEERROR' in l for l in logs), [l for l in logs if 'PAGEERROR' in l])
        await b.close()
    print(f'\n{sum(results)}/{len(results)} vérifications OK')
    return all(results)

ok = asyncio.run(main())
raise SystemExit(0 if ok else 1)
