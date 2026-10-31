"""Corrections d'après le journal du 25/10/26 (téléphone, 07h46–08h04) :
1. caméra figée au retour d'arrière-plan : plus de « plus regardé / regardé » toutes les 3 s, la discussion continue ;
2. session perdue chez Google après « Internal error » : nouvelle session tout de suite (avant : 8 essais puis abandon) ;
3. mode voiture qui démarre en roulant : la discussion en cours n'est plus coupée ; quitté à la main, il ne revient pas
   tout seul pendant 20 min ; une position imprécise (à l'intérieur) ne fait pas croire qu'on roule."""
import asyncio, re, json, os, time
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, '' if ok else detail, flush=True)

UA = 'Mozilla/5.0 (Linux; Android 15; SM-A266B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
# Regard simulé ; __stall = true : la caméra ne renvoie plus rien (le regard reste figé sur « oui », comme le 25/10 à 07h51).
GAZE = """window.__look = true; window.__stall = false;
setInterval(() => { const v = window.wilson && wilson.vision; if (!v) return;
  if (!v.__fake) { v.__fake = true; try { v.worker && v.worker.terminate(); } catch (_) {} v.worker = { postMessage() {}, terminate() {} }; v._startWorker = () => {}; }
  v.gazeReady = true; v.modelsDone = true;
  if (window.__stall) return;
  v._lastResult = performance.now(); v.looking = !!window.__look; if (window.__look) v.lookAt = performance.now(); v.faceAt = performance.now(); v.hasPerson = true; }, 30);"""


async def main():
    conns = []
    mock = {'lost': False, 'occupe': 0, 'occupe_poignee': False}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])

        def handler(ws):
            conn = {'ws': ws, 'setup': None}; conns.append(conn)
            def on_msg(m):
                d = json.loads(m)
                if 'setup' in d:
                    conn['setup'] = d['setup']
                    h = (d['setup'].get('sessionResumption') or {}).get('handle')
                    if h and mock['lost']:                     # Google a perdu la session : la reprise est refusée
                        asyncio.ensure_future(ws.close(code=1008, reason='BidiGenerateContent session not found or expired')); return
                    if mock['occupe'] > 0 or (h and mock['occupe_poignee']):   # l'ancienne connexion n'est pas encore fermée chez Google
                        mock['occupe'] = max(0, mock['occupe'] - 1)
                        asyncio.ensure_future(ws.close(code=1008, reason='BidiGenerateContent session is already connected to an existing client')); return
                    ws.send(json.dumps({'setupComplete': {}}))
                    ws.send(json.dumps({'sessionResumptionUpdate': {'resumable': True, 'newHandle': 'poignee-%d' % len(conns)}}))
            ws.on_message(on_msg)

        ctx = await b.new_context(viewport={'width': 412, 'height': 860}, user_agent=UA, is_mobile=True, has_touch=True,
                                  permissions=['microphone', 'camera', 'geolocation'], geolocation={'latitude': 47.06, 'longitude': -0.88, 'accuracy': 10}, service_workers='block')
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify(%s));" % json.dumps(
            {'apiKey': 'AIzaTESTTESTTESTTESTTESTTESTTEST', 'listenMode': 'regard', 'convTimeout': 12, 'voitureAuto': True, 'v': 3}))
        await ctx.add_init_script(GAZE)
        page = await ctx.new_page(); logs = []
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
        await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)
        page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && wilson.state === "veille" && wilson.vision && wilson.vision.__fake', timeout=20000)

        # 1. Caméra figée pendant une discussion
        await page.evaluate("wilson.startConversation('toucher')")
        await page.wait_for_function('wilson.state === "conversation"', timeout=8000)
        await page.wait_for_timeout(500)
        n0 = sum('Plus regardé' in l for l in logs)
        await page.evaluate("window.__stall = true")
        await page.wait_for_timeout(7000)
        st = await page.evaluate("({ s: wilson.state, p: !!wilson.paused, gm: wilson._gazeMode, stale: wilson.vision.stale, look: wilson.vision.looking })")
        flaps = sum('Plus regardé' in l for l in logs) - n0
        check('Caméra figée 7 s : regard périmé, plus utilisé (pas de « plus regardé » à répétition)', st['stale'] and not st['gm'] and not st['look'] and flaps == 0, f'{st} flaps={flaps}')
        check('… la discussion continue (fin seulement après le silence habituel)', st['s'] == 'conversation' and not st['p'], str(st))
        await page.evaluate("window.__stall = false")
        await page.wait_for_timeout(300)
        check('Images revenues : regard de nouveau utilisé', await page.evaluate('wilson._gazeMode && !wilson.vision.stale'))

        # 2. Session perdue chez Google
        await page.wait_for_timeout(300)
        mock['lost'] = True; nc = len(conns)
        await conns[-1]['ws'].close(code=1011, reason='Internal error encountered.')
        await page.wait_for_timeout(2500)
        st = await page.evaluate("({ s: wilson.state, open: wilson.brain.open })")
        new = conns[nc:]
        check('Session perdue : nouvelle session tout de suite, la discussion continue', st['s'] == 'conversation' and st['open'] and any('Session perdue chez Google' in l for l in logs) and len(new) <= 3,
              f"{st}, {len(new)} essai(s) : {[(c['setup'] or {}).get('sessionResumption') for c in new]}")
        check('… sans essayer d\'autres modèles ni réglages', all((c['setup'] or {}).get('model') == (new[0]['setup'] or {}).get('model') for c in new) and not any('Reconnexion impossible' in l for l in logs))
        mock['lost'] = False

        # 2 bis. Journal du 30/10/26, 23h21 : « session is already connected to an existing client » après une coupure
        await page.wait_for_timeout(300); nc = len(conns); mock['occupe'] = 1
        await conns[-1]['ws'].close(code=1006, reason='')
        await page.wait_for_timeout(3500)
        st = await page.evaluate("({ s: wilson.state, open: wilson.brain.open })"); new = conns[nc:]
        check('Ancienne connexion encore ouverte chez Google : nouvel essai 2 s plus tard, même session reprise', st['s'] == 'conversation' and st['open'] and any('pas encore fermée chez Google' in l for l in logs)
              and (new[-1]['setup'] or {}).get('sessionResumption', {}).get('handle'), f"{st}, {[(c['setup'] or {}).get('sessionResumption') for c in new]}")
        nc = len(conns); mock['occupe_poignee'] = True
        await conns[-1]['ws'].close(code=1006, reason='')
        await page.wait_for_timeout(5500)
        st = await page.evaluate("({ s: wilson.state, open: wilson.brain.open })"); new = conns[nc:]
        check('… toujours bloquée : nouvelle session, la discussion continue', st['s'] == 'conversation' and st['open'] and any('Ancienne session encore ouverte' in l for l in logs)
              and not any('Reconnexion impossible' in l for l in logs), f"{st}, {[(c['setup'] or {}).get('sessionResumption') for c in new]}")
        mock['occupe_poignee'] = False

        # 3. Mode voiture en roulant pendant une discussion
        await page.evaluate("wilson.enterCar('en roulant')")
        await page.wait_for_timeout(300)
        st = await page.evaluate("({ s: wilson.state, car: !!wilson.car, addr: wilson._addressed() })")
        check('Mode voiture en roulant : la discussion en cours continue', st['s'] == 'conversation' and st['car'] and st['addr'], str(st))
        await page.click('#car-exit')
        await page.wait_for_timeout(300)
        # On roule (positions précises, 37 m/s) : quitté à la main il y a moins de 20 min → il ne revient pas tout seul.
        lat = 47.06
        for _ in range(5):
            lat += 0.0004; await ctx.set_geolocation({'latitude': lat, 'longitude': -0.88, 'accuracy': 10}); await page.wait_for_timeout(2300)
        check('Quitté à la main : pas de retour automatique pendant 20 min', not await page.evaluate('!!wilson.car'))
        # Positions imprécises (à l'intérieur) qui sautent : pas de fausse vitesse.
        await page.evaluate("wilson._carOffAt = 0")
        for k in range(5):
            await ctx.set_geolocation({'latitude': 47.06 + (0.0006 if k % 2 else 0), 'longitude': -0.88, 'accuracy': 120}); await page.wait_for_timeout(2300)
        check('Position imprécise qui saute (à l\'intérieur) : pas de mode voiture', not await page.evaluate('!!wilson.car'), str(await page.evaluate('wilson.speed')))
        # Vraie route : précis, une position par seconde (comme un téléphone), 3 relevés rapides sur plus de 8 s.
        for _ in range(16):
            lat += 0.00025; await ctx.set_geolocation({'latitude': lat, 'longitude': -0.88, 'accuracy': 10}); await page.wait_for_timeout(1100)
            if await page.evaluate('!!wilson.car'): break
        check('En roulant vraiment : mode voiture tout seul', await page.evaluate("!!wilson.car && wilson.car.why === 'en roulant'"), str(await page.evaluate('wilson.speed')))
        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")

asyncio.run(main())
