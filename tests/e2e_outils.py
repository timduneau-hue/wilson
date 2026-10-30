"""Plus d'outils (PLAN 7 quater) : afficher (texte, listes, image Wikipédia), fermer_ecran, minuteur (affiché, sonnerie et
voix à la fin, annuler), rappel (heure, sonnerie), météo (Open-Meteo, carte), courses (Home Assistant). Services simulés."""
import asyncio, re, json, os, time
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, '' if ok else detail, flush=True)
FAKE_TTS = open(os.path.join(S, 'e2e_eco.py'), encoding='utf-8').read().split('FAKE_TTS = """')[1].split('"""')[0]
HA = 'https://homeassistant.exemple.ts.net'

async def main():
    conns, st = [], {'liste': [{'id': 'a1', 'name': 'Lait', 'complete': False}], 'ha': []}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
        def handler(ws):
            conn = {'setup': None, 'tool': [], 'texts': []}; conns.append(conn)
            def on_msg(m):
                d = json.loads(m)
                if 'setup' in d: conn['setup'] = d['setup']; ws.send(json.dumps({'setupComplete': {}}))
                elif 'toolResponse' in d: conn['tool'].append(d['toolResponse'])
                elif 'realtimeInput' in d and 'text' in d['realtimeInput']: conn['texts'].append(d['realtimeInput']['text'])
            ws.on_message(on_msg)
        CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type'}
        async def wiki(route):
            await route.fulfill(status=200, content_type='application/json', headers=CORS, body=json.dumps({'query': {'pages': {'1': {'index': 1, 'title': 'Koala', 'thumbnail': {'source': 'http://127.0.0.1:8765/icons/icon-192.png'}}}}}))
        async def geo(route):
            await route.fulfill(status=200, content_type='application/json', headers=CORS, body=json.dumps({'results': [{'name': 'Angers', 'latitude': 47.47, 'longitude': -0.55}]}))
        async def meteo(route):
            await route.fulfill(status=200, content_type='application/json', headers=CORS, body=json.dumps({
                'current': {'temperature_2m': 12.4, 'apparent_temperature': 10.1, 'weather_code': 61, 'wind_speed_10m': 18, 'precipitation': 0.2},
                'daily': {'time': ['2026-10-30', '2026-10-31', '2026-11-01'], 'weather_code': [61, 3, 0], 'temperature_2m_max': [14, 13, 15], 'temperature_2m_min': [8, 7, 6],
                          'precipitation_probability_max': [80, 20, 5], 'precipitation_sum': [4, 0, 0]}, 'hourly': {'precipitation_probability': [70, 80, 60]}}))
        async def ha(route):
            req = route.request; H = {'access-control-allow-origin': 'http://127.0.0.1:8765', 'access-control-allow-headers': 'authorization, content-type'}
            if req.method == 'OPTIONS': await route.fulfill(status=200, headers=H, body=''); return
            u = req.url; body = []
            if u.endswith('/api/shopping_list'): body = st['liste']
            elif u.endswith('/api/shopping_list/item'): d = json.loads(req.post_data); st['liste'].append({'id': 'n%d' % len(st['liste']), 'name': d['name'], 'complete': False}); body = {}
            elif '/api/shopping_list/item/' in u:
                i = u.rsplit('/', 1)[1]; [x.update(json.loads(req.post_data)) for x in st['liste'] if x['id'] == i]; body = {}
            elif u.endswith('/api/shopping_list/clear_completed'): st['liste'] = [x for x in st['liste'] if not x['complete']]; body = {}
            elif u.endswith('/api/template'): await route.fulfill(status=200, headers=H, body=''); return
            await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(body))
        ctx = await b.new_context(viewport={'width': 1138, 'height': 712}, permissions=['microphone', 'camera'], service_workers='block')
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify(%s));" % json.dumps(
            {'apiKey': 'AIzaTESTTESTTESTTESTTESTTESTTEST', 'camera': False, 'listenMode': 'toujours', 'city': 'Angers', 'haUrl': HA, 'haToken': 'jeton', 'v': 3}))
        await ctx.add_init_script(FAKE_TTS)
        page = await ctx.new_page(); logs = []
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
        await page.route(re.compile(r'https://fr\.wikipedia\.org/.*'), wiki)
        await page.route(re.compile(r'https://geocoding-api\.open-meteo\.com/.*'), geo)
        await page.route(re.compile(r'https://api\.open-meteo\.com/.*'), meteo)
        await page.route(re.compile(r'https://homeassistant\.exemple\.ts\.net/.*'), ha)
        await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)
        page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
        await page.evaluate("wilson.startConversation('toucher')"); await page.wait_for_function('wilson.brain.open', timeout=8000)
        await page.evaluate("wilson.continuous = true"); c = conns[-1]
        fns = [f['name'] for t in c['setup'].get('tools', []) for f in t.get('functionDeclarations', [])]
        sysp = c['setup']['systemInstruction']['parts'][0]['text']
        check('Outils proposés à Gemini : afficher, fermer_ecran, minuteur, rappel, meteo, courses', all(x in fns for x in ['afficher', 'fermer_ecran', 'minuteur', 'rappel', 'meteo', 'courses']), str(fns))
        check('Consigne : afficher les réponses longues, météo par l\'outil meteo', 'appelle afficher' in sysp and 'meteo (pour la météo' in sysp and '(météo, actualités' not in sysp)
        async def tool(i, name, args):
            await page.evaluate("([i, n, a]) => wilson._tools([{ id: i, name: n, args: a }])", [i, name, args])
            for _ in range(60):
                await page.wait_for_timeout(100)
                for t in c['tool']:
                    for r in t.get('functionResponses', []):
                        if r['id'] == i: return r['response']['result']
            return ''
        ecran = lambda: page.evaluate("[document.getElementById('ecran').hidden, document.getElementById('ecran').innerText]")
        r = await tool('t1', 'afficher', {'titre': 'Pâtes carbonara', 'texte': 'Ingrédients :\n- 200 g de pâtes\n- 2 œufs\n1. Cuire les pâtes\n2. Mélanger'})
        e = await ecran()
        check('Afficher : titre, puces et étapes à l\'écran', not e[0] and 'Pâtes carbonara' in e[1] and '200 g de pâtes' in e[1] and await page.evaluate("document.querySelectorAll('#ecran ul li').length === 2 && document.querySelectorAll('#ecran ol li').length === 2") and 'essentiel' in r, r)
        r = await tool('t2', 'afficher', {'titre': 'Un koala', 'image': 'koala'})
        check('Afficher une image : photo Wikipédia', await page.evaluate("!!document.querySelector('#ecran img')") and 'Koala' in r, r)
        r = await tool('t3', 'fermer_ecran', {}); e = await ecran()
        check('fermer_ecran : écran fermé', e[0], str(e))
        r = await tool('t4', 'minuteur', {'action': 'lancer', 'duree_sec': 600, 'nom': 'pâtes'})
        m = await page.evaluate("document.getElementById('minuteurs').innerText")
        check('Minuteur de 10 min « pâtes » : lancé et affiché (10:00)', 'lancé pour 10 min' in r and 'pâtes' in m and ('10:00' in m or '9:59' in m), m + ' | ' + r)
        r = await tool('t5', 'minuteur', {'action': 'liste'})
        check('… liste des minuteurs', 'pâtes : reste' in r, r)
        r = await tool('t6', 'minuteur', {'action': 'annuler', 'nom': 'pâtes'})
        check('… annuler', 'annulé' in r and await page.evaluate("document.getElementById('minuteurs').hidden"), r)
        await page.evaluate("wilson.endConversation('test')"); await page.wait_for_timeout(300)
        await page.evaluate("wilson.outils.minuteur({ action: 'lancer', duree_sec: 3, nom: 'œufs' })")
        await page.wait_for_timeout(6500)
        e = await ecran(); sp = await page.evaluate("window.__spoken.slice()")
        check('Fin du minuteur : carte, sonnerie, et phrase dite (voix de la tablette, ou Wilson prévenu s\'il est en discussion)', not e[0] and 'œufs' in e[1] and await page.evaluate("wilson.outils.sonne") and (any('œufs' in x for x in sp) or any('Alarme de la tablette' in t and 'œufs' in t for cn in conns for t in cn['texts'])), str(e) + str(sp) + str([l for l in logs if 'larme' in l or 'oix' in l][-5:]) + str(await page.evaluate('[wilson.state, wilson.voice.ok, wilson.brain.open]')))
        await page.evaluate("document.getElementById('ecran').click()")
        check('… un toucher arrête la sonnerie', not await page.evaluate("wilson.outils.sonne"))
        await page.evaluate("wilson.outils.fermer()")
        quand = time.strftime('%Y-%m-%dT%H:%M', time.localtime(time.time() + 3600))
        r = await page.evaluate("(q) => wilson.outils.rappel({ action: 'ajouter', quand: q, texte: 'sortir les poubelles' })", quand)
        check('Rappel ajouté (« aujourd\'hui à … »)', 'Rappel noté pour' in r and 'sortir les poubelles' in r, r)
        r = await page.evaluate("wilson.outils.rappel({ action: 'ajouter', quand: '2020-01-01T08:00', texte: 'x' })")
        check('… une heure passée est refusée', 'déjà passée' in r, r)
        await page.evaluate("wilson.outils.rappels[0].quand = Date.now() - 10"); await page.wait_for_timeout(1500)
        check('… à l\'heure dite : sonnerie et carte « Rappel : sortir les poubelles »', 'sortir les poubelles' in (await ecran())[1] and await page.evaluate("wilson.outils.sonne"))
        await page.evaluate("wilson.outils._arreterSonnerie(); wilson.outils.fermer()")
        r = await page.evaluate("wilson.outils.meteo({ jours: 3 })")
        e = await ecran()
        check('Météo (ville des réglages) : texte pour Gemini et carte à l\'écran', 'Angers' in r and '12°' in r and 'pluie faible' in r and 'Demain' in r and not e[0] and 'Météo — Angers' in e[1] and 'Demain' in e[1], r[:200] + ' | ' + e[1][:120])
        await page.evaluate("wilson.outils.fermer()")
        r = await page.evaluate("wilson.outils.courses({ action: 'ajouter', articles: ['beurre', 'Lait'] })")
        check('Courses : ajouter (le lait déjà présent n\'est pas doublé)', 'beurre' in r and [x['name'] for x in st['liste']] == ['Lait', 'beurre'], str(st['liste']))
        r = await page.evaluate("wilson.outils.courses({ action: 'lire' })")
        check('… lire', 'Lait' in r and 'beurre' in r, r)
        r = await page.evaluate("wilson.outils.courses({ action: 'retirer', articles: ['lait'] })")
        check('… retirer', 'Retiré' in r and [x['name'] for x in st['liste']] == ['beurre'], str(st['liste']))
        await page.evaluate("wilson.outils.courses({ action: 'afficher' })")
        check('… afficher à l\'écran', '🛒 Liste de courses' in (await ecran())[1])
        check('Aucune erreur JavaScript', not any(l.startswith('PAGEERROR') for l in logs), str([l for l in logs if l.startswith('PAGEERROR')]))
        await ctx.close(); await b.close()
    print(f'\n{sum(results)}/{len(results)} OK'); raise SystemExit(0 if all(results) else 1)
asyncio.run(main())
