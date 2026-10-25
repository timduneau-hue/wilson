"""Moteur de questions (PLAN 2 quater, C11 à C12) : n'importe quelle question sur le CRM, en direct.
L'analyste (Gemini REST, simulé) lit la description des tableaux, écrit des recherches que le CRM (simulé) exécute,
puis répond ; tête qui réfléchit pendant la recherche ; réponse affichée ; réponse tardive (discussion terminée entre-temps,
ou Gemini qui n'attend plus) ; CRM pas encore à jour ; itinéraire vers un client."""
import asyncio, re, json, os, time
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, '' if ok else detail, flush=True)

URL = 'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTESTTESTTEST/exec'
CLE = json.dumps(['M MONVOISIN Franck', 'AD2M'], ensure_ascii=False)
FAKE_TTS = open(os.path.join(S, 'e2e_eco.py'), encoding='utf-8').read().split('FAKE_TTS = """')[1].split('"""')[0]
SCHEMA = "Aujourd'hui : dimanche 25/10/2026. Tables :\n- commandes : lignes de commandes. Champs : date (date), mois (texte), client (texte), article (texte), montant (nombre)."
ETAPE1 = {'action': 'chercher', 'pourquoi': 'CA de juillet 2025', 'recherches': [{'table': 'commandes', 'filtres': [{'champ': 'mois', 'op': '=', 'valeur': '2025-07'}], 'calculs': [{'op': 'somme', 'champ': 'montant', 'nom': 'ca'}]}]}
ETAPE2 = {'action': 'repondre', 'reponse': 'En juillet 2025, ton chiffre était de 3 500 €.'}


async def main():
    conns, st = [], {'calls': [], 'gem': [], 'seq': [], 'slow': 0, 'schema_ok': True}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])

        async def script(route):
            req = route.request; H = {'access-control-allow-origin': '*'}
            if req.method != 'POST': await route.fulfill(status=200, body='ok'); return
            d = json.loads(req.post_data or '{}'); a = d.get('action', '')
            if not a.startswith('crm_'):
                if a == 'reglages_lire': await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'ok': True, 'reglages': None, 't': 0})); return
                await route.fulfill(status=200, headers=H, body='ok'); return
            st['calls'].append(d)
            if a == 'crm_schema': body = {'ok': True, 'texte': SCHEMA} if st['schema_ok'] else {'ok': False, 'erreur': 'action inconnue du CRM : crm_schema'}
            elif a == 'crm_requete': body = {'ok': True, 'texte': 'Recherche 1 — commandes : 2 ligne(s) correspondent.\nca\n3500'}
            elif a == 'crm_client': body = {'ok': True, 'cle': CLE, 'societe': 'AD2M', 'contact': 'M MONVOISIN Franck', 'ville': 'Nantes', 'adresse': '5 rue de la Garde 44300 Nantes', 'texte': 'Client : AD2M, Nantes', 'contacts': []}
            elif a == 'crm_journee': body = {'ok': True, 'rdv': [], 'texte': "Aujourd'hui : aucun rendez-vous."}
            else: body = {'ok': True}
            await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(body, ensure_ascii=False))

        async def gemini_rest(route):                           # l'analyste (Gemini REST)
            req = route.request; H = {'access-control-allow-origin': '*'}
            if req.method == 'OPTIONS': await route.fulfill(status=204, headers={**H, 'access-control-allow-headers': '*'}); return
            body = json.loads(req.post_data); st['gem'].append(body)
            if st['slow']: await asyncio.sleep(st['slow'])
            out = st['seq'].pop(0) if st['seq'] else ETAPE2
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

        ctx = await b.new_context(viewport={'width': 412, 'height': 860}, permissions=['microphone', 'camera'], service_workers='block')
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify(%s));" % json.dumps(
            {'apiKey': 'AIzaTESTTESTTESTTESTTESTTESTTEST', 'listenMode': 'toujours', 'convTimeout': 60, 'logUrl': URL, 'crm': True, 'voitureAuto': False, 'v': 3}))
        await ctx.add_init_script(FAKE_TTS)
        await ctx.route(re.compile(r'https://(www\.google\.com/maps|waze\.com)/.*'), lambda r: asyncio.ensure_future(r.fulfill(status=200, body='gps')))
        page = await ctx.new_page(); logs = []
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
        await page.route(re.compile(r'https://script\.google\.com/.*'), script)
        await page.route(re.compile(r'.*generativelanguage\.googleapis\.com/v1beta/models/.*:generateContent.*'), gemini_rest)
        await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)
        page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
        has = lambda t: any(t in l for l in logs)

        await page.evaluate("wilson.startConversation('toucher')")
        await page.wait_for_function('wilson.state === "conversation" && wilson.brain.open', timeout=8000)
        conn = conns[-1]
        names = [f['name'] for f in conn['setup']['tools'][0]['functionDeclarations']]
        sysp = conn['setup']['systemInstruction']['parts'][0]['text']
        check('Outils du direct : crm_question et itineraire déclarés', 'crm_question' in names and 'itineraire' in names, str(names))
        check('Consigne : « Je cherche l\'information… » puis crm_question, attendre sans relancer', 'Je cherche l\'information' in sysp and 'crm_question' in sysp and 'attends le résultat' in sysp)

        async def tool(c, name, args, cid):
            c['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': cid, 'name': name, 'args': args}]}}))

        # 1. Question libre, réponse dans la même discussion
        st['seq'] = [ETAPE1, ETAPE2]; st['slow'] = 1.0; n0 = len(st['calls'])
        await tool(conn, 'crm_question', {'question': "Quel était mon chiffre d'affaires en juillet 2025 ?"}, 'q1')
        await page.wait_for_timeout(600)
        emo = await page.evaluate("wilson.face.emotion")
        check('Pendant la recherche : tête qui réfléchit', emo == 'reflexion', str(emo))
        for _ in range(60):
            await asyncio.sleep(0.1)
            if any(r['id'] == 'q1' for r in conn['resp']): break
        r = next((x for x in conn['resp'] if x['id'] == 'q1'), None)
        res = (r or {}).get('response', {}).get('result', '')
        acts = [c['action'] for c in st['calls'][n0:]]
        check('L\'analyste lit la description du CRM, écrit une recherche, le CRM l\'exécute', acts[:2] == ['crm_schema', 'crm_requete'] and st['calls'][n0 + 1]['requetes'][0]['filtres'][0]['valeur'] == '2025-07', str(acts))
        g0 = st['gem'][-2] if len(st['gem']) >= 2 else {}
        check('… Gemini reçoit la description des tableaux et la question, en JSON imposé', SCHEMA[:40] in json.dumps(g0, ensure_ascii=False) and 'juillet 2025' in json.dumps(g0['contents'][0], ensure_ascii=False) and g0['generationConfig'].get('responseMimeType') == 'application/json', json.dumps(g0)[:200])
        check('… puis les résultats de la recherche, et il répond', 'Résultats' in json.dumps(st['gem'][-1]['contents'], ensure_ascii=False) and '3500' in json.dumps(st['gem'][-1]['contents'], ensure_ascii=False))
        check('Réponse rendue au direct (outil crm_question)', '3 500 €' in res and 'sans rien ajouter' in res, res)
        card = await page.evaluate("({ vis: !document.getElementById('cards').hidden, txt: document.getElementById('cards').innerText })")
        check('… et affichée à l\'écran (question + réponse)', card['vis'] and '3 500 €' in card['txt'] and 'juillet 2025' in card['txt'], str(card))
        await page.wait_for_timeout(200)
        check('… tête qui réfléchit retirée une fois la réponse là', await page.evaluate("wilson.face.emotion !== 'reflexion'"))
        await page.evaluate("wilson.hideCard()")

        # 2. Gemini n'attend plus (l'outil est annulé) : la réponse vient quand même, par un message
        st['seq'] = [ETAPE1, {'action': 'repondre', 'reponse': 'AD2M a pris des goujons le 14 septembre.'}]; st['slow'] = 0.8
        await tool(conn, 'crm_question', {'question': 'Est-ce que AD2M a déjà commandé des goujons ?'}, 'q2')
        await page.wait_for_timeout(300)
        conn['ws'].send(json.dumps({'toolCallCancellation': {'ids': ['q2']}}))
        for _ in range(60):
            await asyncio.sleep(0.1)
            if any('goujons le 14 septembre' in t for t in conn['texts']): break
        check('Outil annulé par Gemini : la recherche continue, la réponse arrive par un message', any('goujons le 14 septembre' in t and "J'ai la réponse" in t for t in conn['texts']) and not any(x['id'] == 'q2' for x in conn['resp']), str(conn['texts'][-2:]))

        # 3. Discussion terminée pendant la recherche : il se réveille pour donner la réponse
        st['seq'] = [ETAPE1, {'action': 'repondre', 'reponse': 'Tu as deux devis à relancer, pour 3 089 €.'}]; st['slow'] = 1.5
        await tool(conn, 'crm_question', {'question': 'Combien de devis à relancer ?'}, 'q3')
        await page.wait_for_timeout(400)
        await page.evaluate("wilson.endConversation('test')")
        nc = len(conns)
        await page.wait_for_function("wilson.state === 'conversation' && wilson.brain.open", timeout=10000)
        await page.wait_for_timeout(300)
        c3 = conns[-1]
        check('Réponse arrivée après la fin de la discussion : il se réveille et la dit', len(conns) > nc and any('deux devis à relancer' in t and "J'ai la réponse à ta question" in t for t in c3['texts']) and has('je me réveille pour la dire'), str(c3['texts']))
        card = await page.evaluate("document.getElementById('cards').innerText")
        check('… et l\'affiche à l\'écran', 'deux devis à relancer' in card, card)
        await page.evaluate("wilson.hideCard()")

        # 4. CRM pas encore mis à jour : il le dit simplement
        await page.evaluate("wilson.crm.analyste._schema = null")
        st['schema_ok'] = False; st['slow'] = 0
        await tool(c3, 'crm_question', {'question': 'Qui n\'a pas commandé depuis 3 mois ?'}, 'q4')
        for _ in range(40):
            await asyncio.sleep(0.1)
            if any(x['id'] == 'q4' for x in c3['resp']): break
        r = next((x for x in c3['resp'] if x['id'] == 'q4'), {})
        check('CRM sans le moteur de questions : « coller le nouveau WebApp_autonome.gs »', 'pas encore le moteur de questions' in r.get('response', {}).get('result', ''), json.dumps(r, ensure_ascii=False)[:200])
        st['schema_ok'] = True

        # 5. Itinéraire
        await tool(c3, 'itineraire', {'client': 'AD2M'}, 'i1')
        await page.wait_for_function("document.querySelector('#cards .card.route')", timeout=5000)
        href = await page.evaluate("document.querySelector('#cards .card-go.route').href")
        r = next((x for x in c3['resp'] if x['id'] == 'i1'), {})
        check('Itinéraire : bouton GPS avec l\'adresse de la fiche (Google Maps et Waze)', 'google.com/maps/dir' in href and '5%20rue%20de%20la%20Garde%2044300%20Nantes' in href and await page.evaluate("!!document.querySelector('#cards .card-go.waze')") and 'bouton' in r.get('response', {}).get('result', ''), href)
        async with ctx.expect_page() as pop:
            await page.click('#cards .card-go.route')
        await (await pop.value).close()
        await page.wait_for_timeout(700)
        check('… un appui ouvre le GPS, Wilson termine la discussion', has('GPS ouvert vers AD2M') and await page.evaluate("wilson.state === 'veille'"))

        # 6. Mode économique : outil « question », la question dans « demande », la réponse dite telle quelle
        st['seq'] = [ETAPE1, ETAPE2]
        r = await page.evaluate("wilson._crmRun('crm_question', { outil: 'question', demande: 'Mon CA de juillet 2025 ?', question: 'qui_achete' })")
        check('Mode économique : « demande » sert de question, réponse prête à dire', r.get('dire') == ETAPE2['reponse'], json.dumps(r, ensure_ascii=False)[:200])

        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")

asyncio.run(main())
