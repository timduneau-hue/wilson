"""Regard (R1, R3 — règle de Timothée du 24/10/26) : c'est le regard qui compte. 3 s sans regard → veille ;
regardé de nouveau → réactivé tout de suite (session gardée), sinon fermeture ; portrait et paysage."""
import asyncio, re, json, base64, os, time
import numpy as np
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, detail, flush=True)

# Regard simulé : window.__look pilote la détection (les modèles de vision ne sont pas chargés dans ce test).
GAZE = """window.__look = false; window.__face = true;
setInterval(() => { const v = window.wilson && wilson.vision; if (!v) return;
  v.gazeReady = true; v.modelsDone = true; v.forceLook = false;
  v.looking = !!window.__look; if (window.__look) v.lookAt = performance.now(); if (window.__face) { v.faceAt = performance.now(); v.hasPerson = true; } }, 30);"""


def audio_chunks(seconds):
    sr = 24000; t = np.arange(int(sr * seconds)) / sr
    pcm = (np.sin(2 * np.pi * 180 * t) * 8000).astype(np.int16)
    return [base64.b64encode(pcm[i:i + 4800].tobytes()).decode() for i in range(0, len(pcm), 4800)]


async def main():
    conns = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/bursts.wav', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 800}, permissions=['microphone', 'camera'], service_workers='block')
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AIzaTESTTESTTESTTESTTESTTESTTEST', listenMode:'regard', convTimeout: 12, v:3}));")
        await ctx.add_init_script(GAZE)
        page = await ctx.new_page(); logs = []
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
        page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))

        def handler(ws):
            conn = {'ws': ws, 'audio': 0, 'end': 0, 'texts': [], 'images': 0}; conns.append(conn)
            def on_msg(m):
                d = json.loads(m)
                if 'setup' in d: conn['setup'] = d['setup']; ws.send(json.dumps({'setupComplete': {}}))
                elif 'realtimeInput' in d:
                    if 'audio' in d['realtimeInput']: conn['audio'] += 1
                    if d['realtimeInput'].get('audioStreamEnd'): conn['end'] += 1
                    if 'text' in d['realtimeInput']: conn['texts'].append(d['realtimeInput']['text'])
                    if 'video' in d['realtimeInput']: conn['images'] += 1
            ws.on_message(on_msg)
        await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)

        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
        await page.wait_for_timeout(500)

        # 1. Visage présent sans regard : il ne s'active pas, même si quelqu'un parle.
        await page.evaluate("window.__look = false")
        await page.wait_for_timeout(2500)
        check('Visage sans regard + voix : il reste en veille (c\'est le regard qui compte)', await page.evaluate('wilson.state') == 'veille' and len(conns) == 0)

        # 2. Regard + voix : la discussion s'ouvre.
        await page.evaluate("window.__look = true")
        await page.wait_for_function('wilson.state === "conversation"', timeout=8000)
        conn = conns[-1]
        check('Regard + voix : il s\'active', True)

        # 3. On détourne les yeux 2 s : il reste actif ; à 3 s : veille, micro coupé vers Gemini.
        await page.wait_for_timeout(800)
        await page.evaluate("window.__look = false"); t0 = time.time()
        await page.wait_for_timeout(2000)
        st = await page.evaluate('({p: !!wilson.paused, s: wilson.state})')
        check('Yeux détournés 2 s : toujours actif', not st['p'] and st['s'] == 'conversation', str(st))
        await page.wait_for_function('wilson.paused === true', timeout=4000)
        dt = time.time() - t0
        check('Yeux détournés ~3 s : veille', 2.7 <= dt <= 4.0, f"{dt:.1f} s")
        f = await page.evaluate('({b: wilson.face.p.bright.t, m: wilson.face.mood})')
        a0 = conn['audio']; await page.wait_for_timeout(1000)
        check('En veille : écran tamisé, plus aucun son envoyé à Gemini', f['b'] < 0.6 and conn['audio'] == a0 and conn['end'] >= 1, f"{f}, +{conn['audio'] - a0} bloc(s)")

        # 4. Regardé de nouveau : réactivé tout de suite, même session, le micro repart.
        await page.evaluate("window.__look = true"); t0 = time.time()
        await page.wait_for_function('wilson.paused === false', timeout=3000)
        dt = time.time() - t0
        await page.wait_for_timeout(800)
        f = await page.evaluate('({b: wilson.face.p.bright.t, m: wilson.face.mood})')
        check('Regardé de nouveau : réactivé tout de suite, même session Gemini', dt < 0.5 and len(conns) == 1 and f['b'] > 0.9 and f['m'] == 'ecoute', f"{dt:.2f} s, {f}")
        check('… et le micro repart vers Gemini', conn['audio'] > a0 + 3, f"+{conn['audio'] - a0} blocs")

        # 5. Pendant qu'il parle, on peut regarder ailleurs : pas de veille avant la fin de sa phrase + 3 s.
        await page.evaluate("window.__look = false")
        for c in audio_chunks(4.5):
            conn['ws'].send(json.dumps({'serverContent': {'modelTurn': {'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': c}}]}}}))
        conn['ws'].send(json.dumps({'serverContent': {'outputTranscription': {'text': 'Une longue réponse.'}, 'turnComplete': True}}))
        await page.wait_for_timeout(4000)
        check('Il parle pendant qu\'on regarde ailleurs : pas de veille', not await page.evaluate('wilson.paused') and await page.evaluate('wilson.audio.playing'))
        await page.wait_for_function('!wilson.audio.playing', timeout=5000); t0 = time.time()
        await page.wait_for_function('wilson.paused === true', timeout=5000)
        check('… veille 3 s après la fin de sa réponse', 2.6 <= time.time() - t0 <= 4.0, f"{time.time() - t0:.1f} s")

        # 6. Plus regardé du tout : la discussion se ferme après « Fin de conversation après » (12 s).
        t0 = time.time()
        await page.wait_for_function('wilson.state === "veille"', timeout=16000)
        check('Toujours pas regardé : discussion fermée après ~12 s de veille', 11 <= time.time() - t0 <= 14 and any('plus regardé' in l for l in logs), f"{time.time() - t0:.1f} s")

        # 6b. Corrections du 24/10/26 (journal) : réponses tronquées par l'écho, première phrase ignorée, délais faussés.
        await page.evaluate("window.__look = true")
        await page.wait_for_function('wilson.state === "conversation"', timeout=8000)
        conn = conns[-1]; s = conn['setup']
        sysp = s['systemInstruction']['parts'][0]['text']
        check("Consigne (écoute au regard) : tout ce qu'il entend est pour lui, y compris la 1re phrase", 'TOUJOURS pour toi' in sysp and 'la toute première' in sysp and 'ne dis rien du tout' not in sysp)
        check('Coupure prudente : Google ne coupe plus Wilson sur un bruit (NO_INTERRUPTION)', s.get('realtimeInputConfig', {}).get('activityHandling') == 'NO_INTERRUPTION', str(s.get('realtimeInputConfig')))
        await page.wait_for_timeout(500)
        def say(sec):
            for c in audio_chunks(sec):
                conn['ws'].send(json.dumps({'serverContent': {'modelTurn': {'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': c}}]}}}))
        # Réponse en deux morceaux avec un trou de 1,5 s entre les deux (réseau) : le micro reste coupé pendant le trou.
        say(0.6)
        await page.wait_for_timeout(1000); a0 = conn['audio']
        await page.wait_for_timeout(1500)
        gap = conn['audio'] - a0
        say(0.6)
        conn['ws'].send(json.dumps({'serverContent': {'outputTranscription': {'text': 'Voilà ma réponse.'}, 'turnComplete': True}}))
        check("Trou dans sa réponse : micro toujours coupé (l'écho de sa voix ne le coupe plus)", gap == 0, f"{gap} bloc(s) envoyés pendant le trou")
        await page.wait_for_function('!wilson.audio.playing', timeout=5000); a1 = conn['audio']
        await page.wait_for_timeout(2500)
        dbg = await page.evaluate("({mt: wilson._modelTalking, pe: performance.now() - wilson.playEndAt, p: wilson.paused, open: wilson.brain.open, ob: wilson.outLen})")
        check('… et le micro repart après sa réponse', conn['audio'] >= a1 + 10, f"+{conn['audio'] - a1} en 2,5 s {dbg}")
        # Tour silencieux (« <no speech> ») : pas de ligne « Délais » trompeuse.
        n_del = len([l for l in logs if 'Délais (direct)' in l])
        say(0.05)
        conn['ws'].send(json.dumps({'serverContent': {'outputTranscription': {'text': '<no speech>{pause}'}, 'turnComplete': True}}))
        await page.wait_for_timeout(400)
        check('Tour silencieux : pas de « Délais » noté', len([l for l in logs if 'Délais (direct)' in l]) == n_del)
        # Coupure par Google notée.
        say(1.0)
        await page.wait_for_timeout(300)
        conn['ws'].send(json.dumps({'serverContent': {'interrupted': True}}))
        await page.wait_for_timeout(200)
        check('Interruption par Google notée dans le journal', any('Google a interrompu sa réponse' in l or 'Coupé par Google après' in l for l in logs))
        conn['ws'].send(json.dumps({'serverContent': {'turnComplete': True}}))
        # 6c. Journal du 24/10/26 10h32 : 1re phrase sans réponse, « ... », coupures de Google, images pendant qu'il parle.
        # Une vraie phrase restée sans réponse → relance (une seule fois) ; un bruit (« Eh ») → rien.
        conn['ws'].send(json.dumps({'serverContent': {'inputTranscription': {'text': 'Salut Wilson, comment ça va ?'}}}))
        conn['ws'].send(json.dumps({'serverContent': {'outputTranscription': {'text': '...'}, 'turnComplete': True}}))
        await page.wait_for_timeout(300)
        check('1re phrase sans réponse : Wilson est relancé pour répondre', any('réponds maintenant' in x for x in conn['texts']) and any("Wilson s'est tu alors qu'on lui parlait" in l for l in logs), str(conn['texts'][-1:]))
        nt = len(conn['texts'])
        conn['ws'].send(json.dumps({'serverContent': {'inputTranscription': {'text': 'Eh'}}}))
        conn['ws'].send(json.dumps({'serverContent': {'outputTranscription': {'text': '<no speech>'}, 'turnComplete': True}}))
        await page.wait_for_timeout(300)
        check('Simple bruit (« Eh ») : pas de relance, « ... » compté comme silence', len(conn['texts']) == nt and not any(l.endswith('Wilson : ...') for l in logs))
        # Google signale une interruption sans que personne ne parle : la fin déjà reçue est jouée (pas de phrase coupée).
        say(2.0)
        await page.wait_for_timeout(300)
        conn['ws'].send(json.dumps({'serverContent': {'interrupted': True}}))
        await page.wait_for_timeout(300)
        check('Interruption venue de Google (coupure prudente) : sa phrase continue jusqu\'au bout', await page.evaluate('wilson.audio.playing') and any('la fin déjà reçue est jouée' in l for l in logs))
        # Pendant qu'il parle, aucune image n'est envoyée (même si le micro croit entendre parler).
        i0 = conn['images']
        await page.evaluate("wilson.audio.speaking = true; wilson.lastUserSpeech = performance.now()")
        await page.wait_for_timeout(1200)
        check("Pendant qu'il parle : aucune image envoyée", conn['images'] == i0, f"+{conn['images'] - i0}")
        await page.wait_for_function('!wilson.audio.playing', timeout=5000)
        conn['ws'].send(json.dumps({'serverContent': {'turnComplete': True}}))
        await page.wait_for_timeout(300)
        await page.evaluate("wilson.audio.speaking = true; wilson.lastUserSpeech = performance.now()")
        await page.wait_for_timeout(2300)
        await page.evaluate("wilson.audio.speaking = false")
        check('Quand on lui parle : environ 1 image par seconde', 1 <= conn['images'] - i0 <= 3, f"+{conn['images'] - i0} en 2,3 s")
        # Délai : à défaut de fin de phrase détectée (bruit continu dehors), dernier mot transcrit par Google.
        await page.evaluate("wilson.audio.speaking = true")
        conn['ws'].send(json.dumps({'serverContent': {'inputTranscription': {'text': 'Quelle heure est-il ?'}}}))
        await page.wait_for_timeout(900)
        say(0.5)
        conn['ws'].send(json.dumps({'serverContent': {'outputTranscription': {'text': 'Il est dix heures.'}, 'turnComplete': True}}))
        await page.wait_for_timeout(300)
        await page.evaluate("wilson.audio.speaking = false")
        d = [l for l in logs if 'Délais (direct)' in l][-1]
        m = re.search(r'1er son ([\d.]+) s', d)
        check('Délai mesuré même avec du bruit continu (dernier mot transcrit)', m and 0.7 <= float(m.group(1)) <= 1.7, d)

        dn = await page.evaluate("import('./js/remote.js').then(m => [m.deviceName('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/155 Mobile Safari/537.36'), m.deviceName('Mozilla/5.0 (Linux; Android 11; SM-T720) AppleWebKit/537.36 Chrome/155 Safari/537.36'), m.deviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/155 Safari/537.36')])")
        check('Appareil reconnu : téléphone, tablette, PC', dn == ['téléphone', 'tablette', 'PC'], str(dn))
        await page.evaluate("wilson.endConversation('test')")
        await page.wait_for_timeout(300)

        # 7. Mode économique : en veille, les phrases ne partent plus ; regardé, elles repartent.
        await page.evaluate("wilson.settings.brainMode = 'eco'")
        eco = {'n': 0}
        async def gen(route):
            if route.request.method == 'OPTIONS':
                await route.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*'}); return
            eco['n'] += 1
            text = json.dumps({'pour_moi': True, 'emotion': 'neutre', 'reponse': 'Oui ?', 'entendu': 'test'})
            await route.fulfill(status=200, content_type='text/event-stream', headers={'access-control-allow-origin': '*'}, body='data: ' + json.dumps({'candidates': [{'content': {'parts': [{'text': text}]}}]}) + '\r\n\r\n')
        await page.route(re.compile(r'.*generativelanguage\.googleapis\.com/v1beta/models.*'), gen)
        await page.evaluate("window.__look = true")
        await page.wait_for_function('wilson.state === "conversation" && wilson.mode === "eco"', timeout=8000)
        await page.evaluate("window.__look = false")
        await page.wait_for_function('wilson.paused === true', timeout=12000)
        n = eco['n']; await page.wait_for_timeout(3000)
        check('Mode économique en veille : aucune phrase envoyée malgré le bruit', eco['n'] == n and await page.evaluate('!wilson.ecoState.cap'), f"+{eco['n'] - n}")
        await page.evaluate("window.__look = true")
        await page.wait_for_function('wilson.paused === false', timeout=3000)
        check('Mode économique regardé de nouveau : réactivé', True)
        await page.evaluate("wilson.endConversation('test'); wilson.settings.brainMode = 'auto'")

        # 8. Portrait (téléphone tenu droit) : visage plus grand, réglages sur une colonne sans débordement.
        await page.set_viewport_size({'width': 384, 'height': 832}); await page.wait_for_timeout(500)
        sp = await page.evaluate('wilson.face.S / wilson.face.dpr')
        await page.evaluate('wilson.ui.open()'); await page.wait_for_timeout(300)
        lay = await page.evaluate("""(() => { const g = getComputedStyle(document.querySelector('#settings .grid')).gridTemplateColumns.split(' ').length;
          const c = document.querySelector('#settings .sheet-card').getBoundingClientRect(); return { cols: g, w: c.width, over: document.documentElement.scrollWidth > innerWidth }; })()""")
        await page.screenshot(path=f'{S}/shots/portrait_reglages.png')
        await page.evaluate("document.getElementById('s-close').click()")
        await page.set_viewport_size({'width': 832, 'height': 384}); await page.wait_for_timeout(500)
        sl = await page.evaluate('wilson.face.S / wilson.face.dpr')
        check('Portrait : visage à pleine largeur (plus grand qu\'avant)', abs(sp - 384 / 640) < 0.01, f"échelle portrait {sp:.3f}, paysage {sl:.3f}")
        check('Portrait : réglages sur une colonne, pleine largeur, sans débordement', lay['cols'] == 1 and lay['w'] >= 380 and not lay['over'], str(lay))
        man = await page.evaluate("fetch('manifest.webmanifest').then(r => r.json()).then(j => j.orientation)")
        check('Appli installée : suit la rotation (orientation « any »)', man == 'any', man)

        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")

asyncio.run(main())
