"""Tests de la clé au nouveau format AQ. : écran d'accueil, vérification, connexion par jeton éphémère."""
import asyncio, json, re, time
from playwright.async_api import async_playwright

import os
S = os.path.dirname(os.path.abspath(__file__))   # dossier tests/ ; fichiers de test dans fixtures/, captures dans shots/
os.makedirs(os.path.join(S, 'shots'), exist_ok=True)
GOOD = 'AQ.Ab8RN6ExampleExampleExampleExampleExample12345'
results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok))); print(('✅' if ok else '❌'), name, detail, flush=True)

async def main():
    state = {'models': 200, 'ws_key_ok': False, 'token_calls': 0, 'urls': [], 'model_keys': []}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 800}, permissions=['microphone', 'camera'], service_workers='block')
        page = await ctx.new_page()
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))  # __no_vision
        logs = []
        page.on('console', lambda m: logs.append(m.text))
        page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))

        async def models(route):
            state['model_keys'].append(route.request.headers.get('x-goog-api-key'))
            if state['models'] == 200:
                await route.fulfill(status=200, content_type='application/json', body='{"models":[{"name":"models/x"}]}', headers={'access-control-allow-origin': '*'})
            else:
                await route.fulfill(status=401, content_type='application/json', headers={'access-control-allow-origin': '*'},
                    body=json.dumps({'error': {'code': 401, 'message': 'API key not valid. Please pass a valid API key.', 'status': 'UNAUTHENTICATED', 'details': [{'reason': 'ACCESS_TOKEN_TYPE_UNSUPPORTED'}]}}))
        async def tokens(route):
            if route.request.method == 'OPTIONS':
                await route.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST'}); return
            state['token_calls'] += 1
            body = json.loads(route.request.post_data or '{}')
            state['token_body'] = body; state['token_key'] = route.request.headers.get('x-goog-api-key')
            await route.fulfill(status=200, content_type='application/json', body=json.dumps({'name': 'auth_tokens/tok-' + str(state['token_calls'])}), headers={'access-control-allow-origin': '*'})
        await page.route(re.compile(r'.*generativelanguage\.googleapis\.com/v1beta/models.*'), models)
        await page.route(re.compile(r'.*generativelanguage\.googleapis\.com/v1beta/auth_tokens.*'), tokens)

        async def ws_handler(ws):
            state['urls'].append(ws.url)
            constrained = 'Constrained' in ws.url
            def on_msg(m):
                d = json.loads(m)
                if 'setup' in d:
                    if constrained or state['ws_key_ok']:
                        ws.send(json.dumps({'setupComplete': {}}))
                    else:
                        asyncio.ensure_future(ws.close(code=1008, reason='API key not valid. Please pass a valid API key.'))
            ws.on_message(on_msg)
        await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), ws_handler)

        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_timeout(800)
        check('Premier lancement : écran d\'accueil', await page.evaluate('!document.getElementById("welcome").hidden'))
        await page.screenshot(path=f'{S}/shots/welcome.png')

        # 1. Clé incomplète (recopiée depuis l'affichage raccourci)
        await page.fill('#w-key', 'AQ.Ab8...')
        await page.click('#w-go'); await page.wait_for_timeout(300)
        t = await page.inner_text('#w-status')
        check('Clé raccourcie « AQ.Ab8... » → explique d\'utiliser l\'icône copier', 'incomplète' in t and 'copier' in t, t[:90])
        check('… et on reste sur l\'accueil', await page.evaluate('!document.getElementById("welcome").hidden'))

        # 2. Clé refusée par Google
        state['models'] = 401
        await page.fill('#w-key', GOOD)
        await page.click('#w-go'); await page.wait_for_timeout(600)
        t = await page.inner_text('#w-status')
        check('Clé refusée → message clair + solution (nouveau projet)', 'refuse' in t and 'new project' in t, t[:120])
        await page.screenshot(path=f'{S}/shots/welcome_refused.png')

        # 3. Clé AQ. valide, collée avec espace et retour à la ligne
        state['models'] = 200
        await page.fill('#w-key', '  ' + GOOD + '\n')
        await page.click('#w-go'); await page.wait_for_timeout(400)
        t = await page.inner_text('#w-status')
        check('Clé AQ. acceptée ✓', 'acceptée' in t, t)
        check('Espaces nettoyés avant l\'envoi à Google', state['model_keys'][-1] == GOOD, repr(state['model_keys'][-1])[:30])
        await page.screenshot(path=f'{S}/shots/welcome_ok.png')
        await page.wait_for_function('window.wilson.state === "veille"', timeout=15000)
        await page.wait_for_timeout(800)
        check('Wilson démarre après la clé', await page.evaluate('document.getElementById("welcome").hidden'))
        check('Clé enregistrée propre', await page.evaluate(f'wilson.settings.apiKey === "{GOOD}"'))

        # 4. Connexion : la clé dans l'adresse est refusée, le jeton éphémère passe
        await page.evaluate("wilson._onWakeWord({text:'wilson', conf:0.9})")
        await page.wait_for_function('wilson.state === "conversation"', timeout=10000)
        u = state['urls']
        check('Repli automatique sur le jeton éphémère', len(u) >= 2 and 'BidiGenerateContent?key=' in u[-2] and 'BidiGenerateContentConstrained?access_token=auth_tokens%2Ftok-1' in u[-1], ' | '.join(x.split('GenerativeService.')[1][:60] for x in u))
        check('Jeton demandé avec la clé dans l\'en-tête', state.get('token_key') == GOOD and state['token_body'].get('uses') == 1 and 'expireTime' in state['token_body'], json.dumps(state.get('token_body'))[:120])
        await page.evaluate("wilson.endConversation('test')")
        n = len(state['urls'])
        await page.evaluate("wilson._onWakeWord({text:'wilson', conf:0.9})")
        await page.wait_for_function('wilson.state === "conversation"', timeout=10000)
        check('2e conversation : directement par jeton (méthode retenue)', len(state['urls']) == n + 1 and 'Constrained' in state['urls'][-1])
        await page.evaluate("wilson.endConversation('test')")

        # 5. Bouton « Vérifier la clé » dans les réglages
        await page.evaluate("wilson.ui.open()")
        await page.click('#t-key'); await page.wait_for_timeout(500)
        t = await page.inner_text('#s-keystatus')
        check('Réglages → « Vérifier la clé »', 'acceptée' in t, t)
        await page.screenshot(path=f'{S}/shots/settings_key.png')

        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        await b.close()
    print(f"\n{sum(r[1] for r in results)}/{len(results)} vérifications OK")

asyncio.run(main())
