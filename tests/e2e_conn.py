"""Connexion tolérante : refus de réglage → configuration simplifiée ; quota → modèle de secours ; message d'erreur réel."""
import asyncio, json, re
from playwright.async_api import async_playwright

import os
S = os.path.dirname(os.path.abspath(__file__))   # dossier tests/ ; fichiers de test dans fixtures/, captures dans shots/
os.makedirs(os.path.join(S, 'shots'), exist_ok=True)
results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok))); print(('✅' if ok else '❌'), name, detail, flush=True)

async def main():
    st = {'policy': 'strict', 'setups': []}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 800}, permissions=['microphone', 'camera'], service_workers='block')
        await ctx.add_init_script("""localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AQ.Ab8RN6ExampleExampleExampleExampleExample12345', brainMode:'live'}));""")
        page = await ctx.new_page()
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))  # __no_vision
        logs = []
        page.on('console', lambda m: logs.append(m.text))
        page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
        async def models(route):
            await route.fulfill(status=200, content_type='application/json', body='{"models":[]}', headers={'access-control-allow-origin': '*'})
        await page.route(re.compile(r'.*generativelanguage\.googleapis\.com/v1beta/models.*'), models)

        def empty_obj_params(setup):
            for t in setup.get('tools', []):
                for f in t.get('functionDeclarations', []):
                    pr = f.get('parameters')
                    if pr is not None and pr.get('type') == 'OBJECT' and not pr.get('properties'): return f['name']
            return None

        async def ws_handler(ws):
            def on_msg(m):
                d = json.loads(m)
                if 'setup' not in d: return
                s = d['setup']; st['setups'].append(s)
                pol = st['policy']
                bad = None
                if empty_obj_params(s):
                    bad = (1007, f"* GenerateContentRequest.tools[0].function_declarations[3].parameters.properties: should be non-empty for OBJECT type")
                elif pol == 'noadv' and 'mediaResolution' in s.get('generationConfig', {}):
                    bad = (1007, 'Invalid JSON payload received. Unknown name "media_resolution" at \'setup.generation_config\'')
                elif pol in ('only25', 'nothink25') and not s['model'].endswith('native-audio-preview-12-2025'):
                    bad = (1011, 'You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: h')
                elif pol == 'nothink25' and 'thinkingConfig' in s.get('generationConfig', {}):
                    bad = (1007, 'Invalid JSON payload received. Unknown name "thinking_config" at \'setup.generation_config\'')
                elif pol == 'quota38' and s['model'].endswith('3.8-live'):
                    bad = (1011, 'You exceeded your current quota, please check your plan and billing details.')
                elif pol == 'nobehavior31' and s['model'].endswith('flash-live-preview') and any('behavior' in f for t in s.get('tools', []) for f in t.get('functionDeclarations', [])):
                    bad = (1007, 'Invalid JSON payload received. Unknown name "behavior"')
                elif pol == 'quotaall':
                    bad = (1011, 'You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.')
                elif pol == 'down':
                    bad = (1011, 'The service is currently unavailable.')
                if bad: asyncio.ensure_future(ws.close(code=bad[0], reason=bad[1]))
                else: ws.send(json.dumps({'setupComplete': {}}))
            ws.on_message(on_msg)
        await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), ws_handler)

        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && window.wilson.state === "veille"', timeout=20000)

        async def converse():
            n = len(st['setups'])
            await page.evaluate("wilson._onWakeWord({text:'wilson', conf:0.9})")
            try: await page.wait_for_function('wilson.state === "conversation"', timeout=12000); ok = True
            except Exception: ok = False
            info = await page.evaluate('({st: wilson.state, m: wilson.brain.modelUsed, lv: wilson.brain.level, sched: wilson.brain.canSchedule, badge: document.getElementById("badge").textContent})')
            if ok: await page.evaluate("wilson.endConversation('test')")
            await page.wait_for_timeout(200)
            return ok, info, st['setups'][n:]

        # 1. Serveur strict (refuse les OBJECT vides) : la config complète doit passer du premier coup
        ok, info, ss = await converse()
        check('Config complète acceptée du 1er coup (plus de paramètres vides)', ok and len(ss) == 1 and info['lv'] == 0 and not empty_obj_params(ss[0]), f"{len(ss)} essai(s), {info}")
        fd = ss[0]['tools'][0]['functionDeclarations']
        check('Outils maison « chercher » et « regarder » (photo à la demande), 7 outils, sans recherche intégrée',
              not any('googleSearch' in t for t in ss[0]['tools']) and len(fd) == 7 and all(any(f['name'] == n and f.get('behavior') == 'BLOCKING' for f in fd) for n in ('chercher', 'regarder'))
              and ss[0]['generationConfig'].get('mediaResolution') == 'MEDIA_RESOLUTION_MEDIUM')

        # 2. Google refuse une option avancée → configuration simplifiée
        st['policy'] = 'noadv'; await page.evaluate('wilson.brain.level = null; wilson.brain.modelUsed = null')
        ok, info, ss = await converse()
        check('Réglage refusé → repli sur config simplifiée', ok and info['lv'] == 1 and len(ss) == 2, f"{len(ss)} essais, niveau {info['lv']}")
        check('… outils (mémoire, émotions, chercher, regarder) conservés', ok and len(ss[-1].get('tools', [{}])[0].get('functionDeclarations', [])) == 7)
        ok2, info2, ss2 = await converse()
        check('… niveau retenu : 1 seul essai la fois suivante', ok2 and len(ss2) == 1, f"{len(ss2)} essai(s)")

        # 3. Quota épuisé sur 3.8 → modèle de secours (qui refuse « behavior »)
        st['policy'] = 'quota38'; await page.evaluate('wilson.brain.level = null; wilson.brain.modelUsed = null')
        ok, info, ss = await converse()
        check('Quota 3.8 → modèle de secours 3.1', ok and info['m'] == 'gemini-3.1-flash-live-preview', f"{[x['model'] for x in ss]}")
        st['policy'] = 'quota38+'
        check('Réponses silencieuses désactivées hors 3.8', info['sched'] is False)

        # 3b. Seul Gemini 2.5 « native audio » a du quota (cas réel du 23/10/26) : réflexion coupée, choix retenu au redémarrage
        st['policy'] = 'only25'; await page.evaluate("wilson.brain.level = null; wilson.brain.modelUsed = null; wilson.brain.refused = {}")
        ok, info, ss = await converse()
        g = ss[-1].get('generationConfig', {}) if ss else {}
        check('2.5 native audio : connecté sans réflexion préalable (thinkingBudget 0)', ok and info['m'].endswith('native-audio-preview-12-2025') and g.get('thinkingConfig') == {'thinkingBudget': 0}, f"{[x['model'][7:] for x in ss]}")
        saved = await page.evaluate("JSON.parse(localStorage.getItem('wilson.live'))")
        await page.reload(); await page.wait_for_function('window.wilson && window.wilson.state === "veille"', timeout=20000)
        ok, info, ss = await converse()
        check('Après redémarrage : bon modèle du premier coup (plus ~4 s d\'essais refusés)', ok and len(ss) == 1 and ss[0]['model'].endswith('native-audio-preview-12-2025'), f"{[x['model'][7:] for x in ss]} ; retenu : {saved.get('model') if saved else None}")
        # Réglage de réflexion refusé par le modèle → même niveau, sans lui
        st['policy'] = 'nothink25'; await page.evaluate("wilson.brain.think = false")
        ok, info, ss = await converse()
        check('Réflexion refusée → même configuration sans ce réglage', ok and info['lv'] == 0 and len(ss) == 2 and 'thinkingConfig' not in ss[-1]['generationConfig'] and await page.evaluate('wilson.brain.think === null'), f"{len(ss)} essais, niveau {info['lv']}")
        await page.evaluate("wilson.brain.think = false; wilson.brain.refused = {}; wilson.brain._save()")

        # 4. Service en panne : message avec la vraie raison
        st['policy'] = 'down'; await page.evaluate('wilson.brain.level = null; wilson.brain.modelUsed = null')
        ok, info, ss = await converse()
        check('Panne → retour en veille', not ok and info['st'] == 'veille')
        check('Le badge montre la vraie raison', 'unavailable' in info['badge'] and 'cerveau' in info['badge'], info['badge'])
        check('Nombre d\'essais limité', len(ss) <= 10, f"{len(ss)} essais")
        await page.screenshot(path=f'{S}/shots/badge_err.png')

        # 4b. Quota épuisé partout : 2 essais seulement, pause jusqu'à la remise à zéro, plus aucun essai ensuite
        st['policy'] = 'quotaall'; await page.evaluate('wilson.brain.level = null; wilson.brain.modelUsed = null; wilson.brain.authMode = null')
        ok, info, ss = await converse()
        check('Quota épuisé : 3 essais max (1 par modèle)', not ok and len(ss) == 3, f"{len(ss)} essais")
        check('Message « quota … je pourrai reparler à … »', 'quota' in info['badge'] and 'reparler' in info['badge'], info['badge'])
        await page.wait_for_timeout(300)
        ok, info, ss = await converse()
        check('Ensuite : plus aucune connexion gaspillée', not ok and len(ss) == 0, f"{len(ss)} essai(s)")
        await page.screenshot(path=f'{S}/shots/badge_quota.png')

        # 5. Bouton de diagnostic dans les réglages
        st['policy'] = 'strict'
        await page.evaluate('wilson.ui.open()')
        await page.click('#t-key')
        await page.wait_for_function("document.getElementById('s-keystatus').textContent.includes('parler')", timeout=15000)
        t = await page.inner_text('#s-keystatus')
        check('Réglages : clé + connexion vérifiées', 'peut parler' in t and 'Direct ✓' in t, t.replace('\n', ' | '))
        await page.screenshot(path=f'{S}/shots/settings_conn.png')

        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        await b.close()
    print(f"\n{sum(r[1] for r in results)}/{len(results)} vérifications OK")

asyncio.run(main())
