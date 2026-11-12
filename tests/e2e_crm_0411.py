"""Corrections du 04/11/26 (soir) : recherches CRM plus sûres et plus rapides.
1. Description du CRM gardée la journée sur l'appareil : après un redémarrage, pas de nouvelle demande crm_schema.
2. Requête du CRM bloquée sur le réseau (journal du 04/11/26, 17h18 : recherche jamais revenue) : abandonnée au bout
   du délai, relancée, et la réponse arrive.
3. « Ses dernières commandes » : consigne de donner les articles (direct et analyste)."""
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
    st = {'calls': [], 'bloque': 0}
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
            st['calls'].append(a)
            if a == 'crm_requete' and st['bloque'] > 0:
                st['bloque'] -= 1; await asyncio.sleep(20)          # réseau mobile bloqué : pas de réponse
            if a == 'crm_schema': body = {'ok': True, 'texte': SCHEMA}
            elif a == 'crm_requete': body = {'ok': True, 'texte': 'Recherche 1 — commandes : 2 ligne(s).'}
            else: body = {'ok': True}
            try: await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(body, ensure_ascii=False))
            except Exception: pass
        seq = []
        async def gemini_rest(route):
            req = route.request; H = {'access-control-allow-origin': '*'}
            if req.method == 'OPTIONS': await route.fulfill(status=204, headers={**H, 'access-control-allow-headers': '*'}); return
            out = seq.pop(0) if seq else ETAPE2
            await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'candidates': [{'content': {'parts': [{'text': json.dumps(out, ensure_ascii=False)}]}}]}))
        conns = []
        def handler(ws):
            conn = {'setup': None}; conns.append(conn)
            def on_msg(m):
                d = json.loads(m)
                if 'setup' in d: conn['setup'] = d['setup']; ws.send(json.dumps({'setupComplete': {}}))
            ws.on_message(on_msg)
        ctx = await b.new_context(bypass_csp=True, viewport={'width': 412, 'height': 860}, permissions=['microphone', 'camera'], service_workers='block')
        await ctx.add_init_script("if (!localStorage.getItem('wilson.settings')) localStorage.setItem('wilson.settings', JSON.stringify(%s));" % json.dumps(
            {'apiKey': 'AIzaTESTTESTTESTTESTTESTTESTTEST', 'listenMode': 'toujours', 'convTimeout': 60, 'logUrl': URL, 'crm': True, 'voitureAuto': False, 'v': 3}))
        await ctx.add_init_script(FAKE_TTS)
        page = await ctx.new_page(); logs = []
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
        await page.route(re.compile(r'https://script\.google\.com/.*'), script)
        await page.route(re.compile(r'.*generativelanguage\.googleapis\.com/v1beta/models/.*:generateContent.*'), gemini_rest)
        await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)
        page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
        async def ouvrir():
            await page.goto('http://127.0.0.1:8765/index.html')
            await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
        Q = "([k]) => wilson.crm.analyste.repondre({ key: k, question: 'les dernières commandes de AD2M' }).then((r) => r.reponse)"
        await ouvrir()
        seq[:] = [ETAPE1, ETAPE2]
        r = await page.evaluate(Q, ['AIzaTESTTESTTESTTESTTESTTESTTEST'])
        check('Première question : description du CRM demandée, réponse', st['calls'][:2] == ['crm_schema', 'crm_requete'] and '3 500' in r, str(st['calls']) + r)
        await ouvrir(); st['calls'].clear(); seq[:] = [ETAPE1, ETAPE2]
        r = await page.evaluate(Q, ['AIzaTESTTESTTESTTESTTESTTESTTEST'])
        check('Après un redémarrage, le même jour : plus de crm_schema (gardée sur l\'appareil)', 'crm_schema' not in st['calls'] and st['calls'] == ['crm_requete'], str(st['calls']))
        # 2. requête bloquée
        st['calls'].clear(); st['bloque'] = 1; seq[:] = [ETAPE1, ETAPE2]
        await page.evaluate("wilson.crm.delais.crm_requete = 1500")
        t0 = time.time()
        r = await page.evaluate(Q, ['AIzaTESTTESTTESTTESTTESTTESTTEST'])
        dt = time.time() - t0
        check('Requête bloquée : abandonnée au bout du délai, relancée, réponse quand même', [c for c in st['calls'] if c != 'crm_annuaire'] == ['crm_requete', 'crm_requete'] and '3 500' in r and dt < 15, f'{st["calls"]} {dt:.1f}s {r}')
        check('… noté au journal', any('sans réponse au bout de 2 s' in l or 'sans réponse au bout de 1 s' in l for l in logs), str([l for l in logs if 'sans réponse' in l]))
        # 3. consignes « dernières commandes »
        sysm = await page.evaluate("wilson._system()")
        cons = await page.evaluate("import('./js/analyste.js').then((m) => m.consigneAnalyste('x'))")
        check('Consigne du direct : « dernières commandes » → articles, crm_question directement', 'Ses dernières commandes' in sysm and 'CE QU\'IL A ACHETÉ' in sysm)
        check('Consigne de l\'analyste : articles d\'abord, jamais seulement la date et le total', 'Dernières commandes' in cons and 'articles' in cons)
        check('Aucune erreur JavaScript', not any(l.startswith('PAGEERROR') for l in logs), str([l for l in logs if l.startswith('PAGEERROR')]))
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK"); raise SystemExit(0 if all(results) else 1)

asyncio.run(main())
