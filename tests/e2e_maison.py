"""La maison (PLAN 7 bis, D3) : outil « maison » vers l'assistant de Home Assistant (faux Home Assistant).
- outil proposé à Gemini et consigne seulement quand l'adresse et le jeton sont réglés ;
- la demande part à /api/conversation/process (français, jeton) et la réponse de Home Assistant revient à Gemini ;
- appareil inconnu, jeton refusé, Home Assistant injoignable : phrase claire ;
- mode économique : champ « maison » dans le format ; bouton « Vérifier la maison » des réglages."""
import asyncio, re, json, os
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, '' if ok else detail, flush=True)
FAKE_TTS = open(os.path.join(S, 'e2e_eco.py'), encoding='utf-8').read().split('FAKE_TTS = """')[1].split('"""')[0]
HA = 'https://homeassistant.exemple.ts.net'


async def main():
    conns, st = [], {'ha': [], 'down': False}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])

        def handler(ws):
            conn = {'setup': None, 'tool': []}; conns.append(conn)
            def on_msg(m):
                d = json.loads(m)
                if 'setup' in d:
                    conn['setup'] = d['setup']; ws.send(json.dumps({'setupComplete': {}}))
                elif 'toolResponse' in d: conn['tool'].append(d['toolResponse'])
            ws.on_message(on_msg)

        async def ha(route):
            req = route.request
            H = {'access-control-allow-origin': 'http://127.0.0.1:8765', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST'}
            if req.method == 'OPTIONS': await route.fulfill(status=200, headers=H, body=''); return
            if st['down']: await route.abort('connectionrefused'); return
            st['ha'].append({'url': req.url, 'auth': req.headers.get('authorization'), 'body': req.post_data})
            if req.headers.get('authorization') != 'Bearer jeton-test': await route.fulfill(status=401, headers=H, body='{"message":"Unauthorized"}'); return
            if req.url.endswith('/api/'): body = {'message': 'API running.'}
            elif req.url.endswith('/api/config'): body = {'location_name': 'Maison', 'version': '2026.10.4'}
            elif req.url.endswith('/api/states'): body = [{'entity_id': 'light.grande_lumiere_salon', 'state': 'off', 'attributes': {'friendly_name': 'Grande lumière salon'}},
                {'entity_id': 'media_player.television', 'state': 'on', 'attributes': {'friendly_name': 'Télé'}}, {'entity_id': 'script.netflix', 'state': 'off', 'attributes': {'friendly_name': 'Netflix'}},
                {'entity_id': 'switch.prise_led', 'state': 'on', 'attributes': {'friendly_name': 'Prise LED'}}]
            elif req.url.endswith('/api/services/script/turn_on'): st['script'] = json.loads(req.post_data or '{}'); body = []
            else:
                t = json.loads(req.post_data or '{}').get('text', '')
                if 'grande lumière' in t:
                    body = {'response': {'response_type': 'action_done', 'speech': {'plain': {'speech': 'Allumé'}}, 'data': {'success': [{'name': 'Grande lumière salon'}]}}}
                else:
                    body = {'response': {'response_type': 'error', 'speech': {'plain': {'speech': "Désolé, je ne connais pas d'appareil appelé frigo"}}, 'data': {'code': 'no_valid_targets'}}}
            await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(body, ensure_ascii=False))

        async def page_with(settings):
            ctx = await b.new_context(viewport={'width': 800, 'height': 1000}, permissions=['microphone', 'camera'], service_workers='block')
            await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify(%s));" % json.dumps(settings))
            await ctx.add_init_script(FAKE_TTS)
            page = await ctx.new_page(); logs = []
            await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
            await page.route(re.compile(r'https://homeassistant\.exemple\.ts\.net/.*'), ha)
            await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)
            page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
            await page.goto('http://127.0.0.1:8765/index.html')
            await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
            return ctx, page, logs

        base = {'apiKey': 'AIzaTESTTESTTESTTESTTESTTESTTEST', 'camera': False, 'listenMode': 'toujours', 'v': 3}
        # 1. Sans réglage : pas d'outil, pas de consigne
        ctx, page, logs = await page_with(base)
        await page.evaluate("wilson.startConversation('toucher')"); await page.wait_for_function('wilson.brain.open', timeout=8000)
        fns = [f['name'] for t in conns[-1]['setup'].get('tools', []) for f in t.get('functionDeclarations', [])]
        check('Maison non reliée : pas d\'outil « maison » ni de consigne', 'maison' not in fns and 'tu pilotes les lumières' not in json.dumps(conns[-1]['setup'], ensure_ascii=False), str(fns))
        await ctx.close()

        # 2. Reliée
        ctx, page, logs = await page_with({**base, 'haUrl': HA, 'haToken': 'jeton-test'})
        await page.evaluate("wilson.startConversation('toucher')"); await page.wait_for_function('wilson.brain.open', timeout=8000)
        c = conns[-1]; fns = [f['name'] for t in c['setup'].get('tools', []) for f in t.get('functionDeclarations', [])]
        sysp = c['setup']['systemInstruction']['parts'][0]['text']
        check('Maison reliée : outil « maison » proposé à Gemini', 'maison' in fns, str(fns))
        check('… consigne : appeler maison, ne pas dire « c\'est fait » avant la réponse, applis de la télé, pas de harcèlement', 'appelle maison' in sysp and 'avant la réponse de Home Assistant' in sysp and '« allume Netflix »' in sysp and 'ne harcèle pas' in sysp)
        await page.evaluate("wilson._tools([{ id: 'm1', name: 'maison', args: { demande: 'allume la grande lumière du salon' } }])")
        await page.wait_for_function("wilson.brain.open", timeout=3000); await page.wait_for_timeout(800)
        sent = st['ha'][-1] if st['ha'] else {}
        check('Demande envoyée à /api/conversation/process, en français, avec le jeton', sent.get('url', '').endswith('/api/conversation/process') and sent.get('auth') == 'Bearer jeton-test' and json.loads(sent.get('body') or '{}').get('language') == 'fr', str(sent))
        resp = json.dumps(c['tool'], ensure_ascii=False)
        check('Réponse de Home Assistant renvoyée à Gemini (« Fait — … Allumé »)', '"m1"' in resp and 'Allumé' in resp and 'Fait' in resp, resp[:300])
        await page.evaluate("wilson._tools([{ id: 'm2', name: 'maison', args: { demande: 'allume le frigo' } }])"); await page.wait_for_timeout(800)
        resp = json.dumps(c['tool'], ensure_ascii=False)
        check('Appareil inconnu : échec expliqué (redire avec le nom exact)', '"m2"' in resp and 'Échec' in resp and 'nom exact' in resp, resp[-300:])
        check('… avec la liste des appareils et leur état (Gemini réessaie seul, sans harceler)', 'Grande lumière salon : éteint' in resp and 'Télé : allumé' in resp and 'allume Netflix' in resp and 'Prise LED' not in resp and 'sans lui redemander' in resp, resp[-500:])
        await page.evaluate("wilson._tools([{ id: 'm4', name: 'maison', args: { demande: 'lance Netflix sur la télé' } }])"); await page.wait_for_timeout(800)
        resp = json.dumps(c['tool'], ensure_ascii=False)
        check('« Lance Netflix » refusé par l\'assistant : Wilson lance lui-même le script Netflix', st.get('script') == {'entity_id': 'script.netflix'} and '"m4"' in resp and 'lancé : Netflix' in resp, str(st.get('script')) + resp[-200:])
        st.pop('script', None)
        await page.evaluate("wilson._tools([{ id: 'm5', name: 'maison', args: { demande: 'éteins Netflix' } }])"); await page.wait_for_timeout(800)
        check('… mais « éteins Netflix » ne relance rien', 'script' not in st)
        st['down'] = True
        await page.evaluate("wilson._tools([{ id: 'm3', name: 'maison', args: { demande: 'allume la grande lumière' } }])"); await page.wait_for_timeout(1200)
        resp = json.dumps(c['tool'], ensure_ascii=False); st['down'] = False
        check('Home Assistant injoignable : « vérifie que Tailscale est allumé »', '"m3"' in resp and 'Tailscale' in resp, resp[-300:])
        check('Journal : la demande et la réponse sont notées', any('Maison : « allume la grande lumière du salon » → action_done « Allumé »' in l for l in logs), str([l for l in logs if 'Maison' in l][:3]))
        eco = await page.evaluate("wilson._system('eco')")
        check('Mode économique : champ « maison » dans le format', '"maison": "vide, sauf si' in eco and 'remplis le champ "maison"' in eco)
        # Réglages : vérifier la maison (bon puis mauvais jeton)
        await page.evaluate("wilson.endConversation('test')")
        r = await page.evaluate("wilson.maison.verifier()")
        check('Vérifier la maison : « Maison reliée ✓ »', r['ok'] and 'Maison reliée' in r['msg'], str(r))
        await page.evaluate("wilson.settings.haToken = 'faux'")
        r = await page.evaluate("wilson.maison.verifier()")
        check('… jeton refusé : dit clairement', not r['ok'] and 'refusé' in r['msg'], str(r))
        r = await page.evaluate("wilson.maison.dire('allume la grande lumière')")
        check('… et Wilson dit qu\'il faut recréer le jeton', not r['ok'] and 'jeton' in r['dire'], str(r))
        check('Aucune erreur JavaScript', not any(l.startswith('PAGEERROR') for l in logs), str([l for l in logs if l.startswith('PAGEERROR')]))
        await ctx.close(); await b.close()
    print(f'\n{sum(results)}/{len(results)} OK'); raise SystemExit(0 if all(results) else 1)

asyncio.run(main())
