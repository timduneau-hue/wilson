"""Son du mode direct (23/10/26 : « je n'entends rien quand il parle »).
Sur Android, l'annulation d'écho du micro fait passer le son de la page en « mode appel » (volume d'appel, écouteur) :
le micro est donc ouvert SANS annulation d'écho (coupure « prudente »), et Wilson ne se coupe pas lui-même."""
import asyncio, re, json, base64, os
import numpy as np
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, detail, flush=True)

URL = 'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTESTTESTTEST/exec'
SPY = """(() => {
  window.__gum = []; window.__ev = [];
  const md = navigator.mediaDevices, o = md.getUserMedia.bind(md);
  md.getUserMedia = (c) => { if (c && c.audio) { window.__gum.push(JSON.parse(JSON.stringify(c.audio))); window.__ev.push('ouvre aec=' + c.audio.echoCancellation); } return o(c); };
  const st = MediaStreamTrack.prototype.stop;
  MediaStreamTrack.prototype.stop = function () { if (this.kind === 'audio') window.__ev.push('ferme'); return st.call(this); };
})();"""


def audio_chunks(seconds):
    sr = 24000; t = np.arange(int(sr * seconds)) / sr
    pcm = (np.sin(2 * np.pi * 180 * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 4 * t)) * 9000).astype(np.int16)
    return [base64.b64encode(pcm[i:i + 4800].tobytes()).decode() for i in range(0, len(pcm), 4800)]


async def main():
    conns, posts = [], []
    async with async_playwright() as p:
        # Micro : rafales de bruit fort (comme quelqu'un qui parle, ou l'écho de Wilson sans annulation d'écho).
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/bursts.wav', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 800}, permissions=['microphone', 'camera'], service_workers='block')
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AIzaTESTTESTTESTTESTTESTTESTTEST', listenMode:'toujours', convTimeout: 30, logUrl:'%s', v:3}));" % URL)
        await ctx.add_init_script(SPY)
        page = await ctx.new_page(); logs = []
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
        page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))

        async def script(route):
            if route.request.method == 'POST': posts.append(json.loads(route.request.post_data))
            await route.fulfill(status=200, body='ok')
        await page.route(re.compile(r'https://script\.google\.com/.*'), script)

        def handler(ws):
            conn = {'ws': ws, 'audio': 0}; conns.append(conn)
            def on_msg(m):
                d = json.loads(m)
                if 'setup' in d: ws.send(json.dumps({'setupComplete': {}}))
                elif 'realtimeInput' in d and 'audio' in d['realtimeInput']: conn['audio'] += 1
            ws.on_message(on_msg)
        await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)

        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
        gum = await page.evaluate('window.__gum')
        check('Micro ouvert SANS annulation d\'écho (coupure prudente) → son normal sur Android', len(gum) == 1 and gum[0]['echoCancellation'] is False and gum[0]['noiseSuppression'] is True, str(gum))
        check('Journal : état du son au démarrage', any('Micro prêt — son : running' in l and 'haut-parleur normal' in l for l in logs), next((l for l in logs if 'Micro prêt' in l), ''))

        # Mode direct : Wilson répond, le micro (rafales fortes) ne doit PAS le couper.
        await page.evaluate("wilson.startConversation('toucher')")
        await page.wait_for_function('wilson.state === "conversation" && wilson.mode === "live"', timeout=10000)
        conn = conns[-1]
        await page.wait_for_timeout(500)
        for c in audio_chunks(3.0):
            conn['ws'].send(json.dumps({'serverContent': {'modelTurn': {'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': c}}]}}}))
        conn['ws'].send(json.dumps({'serverContent': {'outputTranscription': {'text': 'Bonjour, tu m\'entends bien maintenant ?'}}}))
        await page.wait_for_timeout(300)
        a0 = conn['audio']
        await page.wait_for_timeout(1800)
        st = await page.evaluate('({playing: wilson.audio.playing, discard: wilson.discard})')
        check('Le bruit du micro ne coupe plus Wilson (pas d\'auto-coupure sans annulation d\'écho)', st['playing'] and not any('Coupé (voix)' in l for l in logs), str(st))
        check('Pendant qu\'il parle, rien n\'est envoyé à Gemini (sa propre voix)', conn['audio'] - a0 <= 1, f"{conn['audio'] - a0} bloc(s)")
        conn['ws'].send(json.dumps({'serverContent': {'turnComplete': True}}))
        await page.wait_for_timeout(300)
        d = next((l for l in logs if 'Délais (direct)' in l), '')
        check('Délai du mode direct mesuré', bool(re.search(r'1er son [\d.]+ s après la fin de ta phrase', d)), d)
        v = next((l for l in logs if 'Voix du direct' in l), '')
        m = re.search(r'niveau de sortie max (\d+) %', v)
        check('Voix du direct : son réellement produit (niveau mesuré)', m and int(m.group(1)) > 5, v)
        await page.evaluate("wilson.interrupt('toucher')")
        check('Toucher l\'écran le coupe toujours', not await page.evaluate('wilson.audio.playing'))

        # Journal à distance : bilan « Son » + mesure du direct.
        await page.evaluate('wilson.remote.flush()'); await page.wait_for_timeout(400)
        last = posts[-1] if posts else {}
        mes = [m_ for p_ in posts for m_ in p_.get('mesures', [])]
        check('Bilan « Son » et appareil envoyés', 'haut-parleur normal' in last.get('bilan', {}).get('Son', '') and last.get('appareil') in ('tablette', 'téléphone'), str(last.get('bilan', {}).get('Son')))
        check('Mesure du direct dans l\'onglet Délais', any(m_.get('reflexion') == 'direct' and isinstance(m_.get('google'), (int, float)) for m_ in mes), json.dumps(mes)[:160])

        # Son d'essai.
        await page.evaluate("wilson.endConversation('test'); wilson.ui.open()")
        await page.click('#t-chime'); await page.wait_for_timeout(300)
        check('Bouton « Son d\'essai »', any("Son d'essai joué" in l for l in logs))

        # Coupure « directe » : le micro est rouvert AVEC annulation d'écho, l'ancien fermé d'abord.
        await page.select_option('#s-barge', 'directe')
        await page.wait_for_function('window.__gum.length >= 2', timeout=5000); await page.wait_for_timeout(300)
        ev = await page.evaluate('window.__ev')
        check('Coupure directe : micro rouvert avec annulation d\'écho, ancien micro fermé avant', ev[-2:] == ['ferme', 'ouvre aec=true'] and await page.evaluate('wilson.audio.aec && wilson.audio.running'), str(ev))
        await page.select_option('#s-barge', 'prudente')
        await page.wait_for_function('window.__gum.length >= 3', timeout=5000); await page.wait_for_timeout(300)
        lv = await page.evaluate('({aec: wilson.audio.aec, lvl: wilson.audio.db})')
        check('Retour en prudente : sans annulation d\'écho, le micro marche toujours', lv['aec'] is False and lv['lvl'] > -100, str(lv))
        await page.evaluate("document.getElementById('s-close').click()")

        # Batterie : signalée une seule fois jusqu'au rebranchement.
        r = await page.evaluate("""(() => { wilson.battery = { charging: false, level: 0.73 }; wilson._batTold = false;
          const a = wilson._system('eco').includes("plus branchée"), b = wilson._system('eco').includes("plus branchée");
          wilson.sensors._emit ? 0 : 0; wilson._batTold = false; return [a, b]; })()""")
        check('Batterie débranchée : signalée une fois, pas à chaque phrase', r == [True, False], str(r))

        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")

asyncio.run(main())
