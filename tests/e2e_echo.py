"""Écho : Wilson ne doit jamais se réentendre, se répéter ni se couper tout seul."""
import asyncio, json, re
from playwright.async_api import async_playwright
import os
S = os.path.dirname(os.path.abspath(__file__))   # dossier tests/ ; fichiers de test dans fixtures/, captures dans shots/
os.makedirs(os.path.join(S, 'shots'), exist_ok=True)
res = []
LOGS = []
def check(n, ok, d=''):
    res.append(bool(ok)); print(('✅' if ok else '❌'), n, d, flush=True)
    if not ok: print('   LOG:', ' || '.join(l[9:] for l in LOGS if '[Wilson]' in l)[-1500:])

# Synthèse vocale simulée « comme sur Android » : l'événement de fin arrive AVANT la fin du son,
# et le micro entend la voix de Wilson pendant la parole + 800 ms après (écho de la pièce).
FAKE = """
(() => {
  const spoken = []; window.__spoken = spoken; window.__echoUntil = 0; window.__noEnd = false; window.__liarSpeaking = false;
  const fake = { _speaking: false, pending: false, _q: [], _t: null,
    get speaking() { return window.__liarSpeaking ? false : this._speaking; },
    getVoices() { return []; },
    _next() { const u = this._q.shift(); if (!u) { this._speaking = false; return; } this._speaking = true; spoken.push(u.text);
      const dur = 250 + u.text.length * 25; window.__echoUntil = performance.now() + dur + 800;
      this._t = setTimeout(() => { if (!window.__noEnd) u.onend && u.onend({}); this._next(); }, dur); },
    speak(u) { if (!(u.text || '').trim()) { setTimeout(() => u.onend && u.onend({}), 5); return; } this._q.push(u); if (!this._speaking) this._next(); },
    cancel() { clearTimeout(this._t); const q = this._q; this._q = []; this._speaking = false; window.__echoUntil = performance.now() + 150; },
    addEventListener() {} };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
  setInterval(() => { const w = window.wilson; if (w && performance.now() < window.__echoUntil) { w.audio.lastVoicedAt = performance.now(); w.audio.speaking = true; w.audio._offCnt = 0; } }, 20);
})();
"""

async def wait_reqs(st, n, t=8.0):
    for _ in range(int(t / 0.1)):
        if len(st['reqs']) >= n: return True
        await asyncio.sleep(0.1)
    return False

async def main():
    st = {'reqs': [], 'reply': None}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 800}, permissions=['microphone', 'camera'], service_workers='block')
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AQ.Ab8RN6ExampleExampleExampleExampleExample12345', brainMode:'eco', listenMode:'toujours', v:3}));")
        await ctx.add_init_script(FAKE)
        page = await ctx.new_page(); logs = LOGS
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))  # __no_vision
        page.on('console', lambda m: logs.append(f"{asyncio.get_event_loop().time():.1f} " + m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
        async def gen(route):
            req = route.request; H = {'access-control-allow-origin': '*'}
            if req.method == 'OPTIONS':
                await route.fulfill(status=204, headers={**H, 'access-control-allow-headers': '*'}); return
            st['reqs'].append(json.loads(req.post_data))
            reply = st['reply']; text = json.dumps(reply, ensure_ascii=False)
            sse = ''.join('data: ' + json.dumps({'candidates': [{'content': {'parts': [{'text': text[i:i + 30]}]}}]}, ensure_ascii=False) + '\n\n' for i in range(0, len(text), 30))
            await route.fulfill(status=200, content_type='text/event-stream', headers=H, body=sse)
        await page.route(re.compile(r'.*generativelanguage\.googleapis\.com/v1beta/models/.*'), gen)
        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=120000)
        await page.wait_for_timeout(1200)
        await page.evaluate("""window.__voice = () => { const a = new Int16Array(16000); for (let i = 0; i < a.length; i++) a[i] = Math.sin(i * 0.12) * 8000;
          wilson.audio.speaking = true; wilson.audio._offCnt = 0; wilson.audio.lastVoicedAt = performance.now(); let pushed = false;
          const iv = setInterval(() => { wilson.audio.lastVoicedAt = performance.now();
            const c = wilson.ecoState && wilson.ecoState.cap; if (c && !pushed) { pushed = true; c.chunks.push(a); c.len += a.length; c.voiced = (c.voiced || 0) + 30; } }, 20);
          setTimeout(() => clearInterval(iv), 500); }""")

        # 1. Réponse longue : le micro entend sa voix pendant et après → aucune nouvelle requête
        st['reply'] = {'pour_moi': True, 'emotion': 'joie', 'reponse': "Bonjour ! Il fait beau à Nantes aujourd'hui. Pense quand même à prendre ta veste ce soir, il va faire frais.", 'fin': False, 'entendu': 'Wilson, quel temps fait-il ?'}
        await page.evaluate("wilson._onWakeWord({text:'wilson', conf:0.9})")
        await page.wait_for_function('window.__spoken.length >= 1', timeout=10000)
        await page.wait_for_function('!wilson.voice.speaking', timeout=15000)
        await page.wait_for_timeout(2500)
        sp = await page.evaluate('window.__spoken')
        check("Sa propre voix (pendant + 800 ms d'écho après) ne déclenche aucune requête", len(st['reqs']) == 1, f"{len(st['reqs'])} requête(s)")
        check('Il ne se répète pas et ne parle pas tout seul', len(sp) == 3 and len(set(sp)) == 3, str(sp))

        # 2. La famille répond ensuite : écouté normalement
        st['reply'] = {'pour_moi': True, 'emotion': 'neutre', 'reponse': 'Avec plaisir, je suis toujours là pour toi !', 'fin': False, 'entendu': 'Merci Wilson'}
        await page.evaluate('window.__voice()')
        try:
            await page.wait_for_function('window.__spoken.length >= 4', timeout=10000)
        except Exception:
            print(chr(10).join(l for l in logs if '[Wilson]' in l)[-2500:])
            print(await page.evaluate("JSON.stringify({st: wilson.state, mode: wilson.mode, eco: wilson.ecoState && {busy: wilson.ecoState.busy, cap: wilson.ecoState.cap && {len: wilson.ecoState.cap.len, voiced: wilson.ecoState.cap.voiced}}, sp: wilson.voice.speaking, pe: performance.now() - wilson.playEndAt, aud: wilson.audio.speaking, reqs: 0})"))
            raise
        check('La phrase suivante de la famille est bien entendue', len(st['reqs']) == 2)
        await page.wait_for_function('!wilson.voice.speaking', timeout=10000); await page.wait_for_timeout(1500)

        # 3. Même réponse que la précédente : pas répétée
        n = len(await page.evaluate('window.__spoken'))
        await page.evaluate('''window.__trace = []; window.__tr = setInterval(() => { const w = wilson; window.__trace.push([Math.round(performance.now()) % 100000, w.voice.speaking ? 1 : 0, Math.round(performance.now() - w.playEndAt), w.audio.speaking ? 1 : 0, Math.round(performance.now() - w.audio.lastVoicedAt), w.ecoState ? (w.ecoState.busy ? 'B' : '-') + (w.ecoState.cap ? 'C' + w.ecoState.cap.len : '') : 'X', w.state]); }, 40)''')
        await page.evaluate('window.__voice()')
        ok3 = await wait_reqs(st, 3)
        if not ok3:
            tr = await page.evaluate('clearInterval(window.__tr), window.__trace')
            print('TRACE', tr[:40])
        await page.wait_for_timeout(1200)
        check('Réponse identique à la précédente → pas répétée', len(await page.evaluate('window.__spoken')) == n and len(st['reqs']) == 3, f"{len(st['reqs'])} requêtes")

        # 4. « stop » pendant qu'il parle → il se tait, puis écoute
        st['reply'] = {'pour_moi': True, 'emotion': 'joie', 'reponse': "Il était une fois un petit robot qui vivait dans un salon. Il adorait regarder par la fenêtre. Un jour, il vit un oiseau.", 'fin': False, 'entendu': 'Raconte une histoire'}
        await page.wait_for_timeout(300); await page.evaluate('window.__voice()')
        try:
            await page.wait_for_function('wilson.voice.speaking', timeout=10000)
        except Exception:
            print('REQS', len(st['reqs'])); print(chr(10).join(l for l in LOGS if '[Wilson]' in l)[-2000:])
            print(await page.evaluate("JSON.stringify({st: wilson.state, mode: wilson.mode, eco: wilson.ecoState && {busy: wilson.ecoState.busy, q: wilson.ecoState.queue.length, cap: wilson.ecoState.cap && {len: wilson.ecoState.cap.len, voiced: wilson.ecoState.cap.voiced}}, sp: wilson.voice.speaking, pe: performance.now() - wilson.playEndAt, aud: wilson.audio.speaking, spoken: window.__spoken})"))
            raise
        await page.wait_for_timeout(400)
        k = len(await page.evaluate('window.__spoken'))
        await page.evaluate("wilson.interrupt('toucher')")
        await page.wait_for_timeout(1500)
        r = await page.evaluate("({sp: wilson.voice.speaking, n: window.__spoken.length})")
        check('Toucher → il se tait aussitôt', not r['sp'] and r['n'] == k, str(r))
        st['reply'] = {'pour_moi': True, 'emotion': 'neutre', 'reponse': 'Pardon, je t\'écoute.', 'fin': False, 'entendu': 'Attends'}
        await page.evaluate('window.__voice()')
        await page.wait_for_function("window.__spoken.slice(-1)[0] === \"Pardon, je t'écoute.\"", timeout=10000)
        check('… et entend la suite juste après', True)
        await page.wait_for_function('!wilson.voice.speaking', timeout=10000); await page.wait_for_timeout(1300)

        # 5. Tablette qui ment (« speaking » faux) et ne signale jamais la fin : il ne se remet pas à écouter trop tôt
        await page.evaluate('window.__noEnd = true; window.__liarSpeaking = true')
        st['reply'] = {'pour_moi': True, 'emotion': 'neutre', 'reponse': "Voici une réponse assez longue pour durer plusieurs secondes à voix haute, histoire de vérifier.", 'fin': False, 'entendu': 'test'}
        await page.evaluate('window.__voice()')
        await page.wait_for_function('wilson.voice.speaking', timeout=10000)
        await page.wait_for_timeout(3200)
        check("Fin de parole non signalée : toujours « en train de parler » à 3 s (avant : coupé à 2,5 s)", await page.evaluate('wilson.voice.speaking'))
        await page.wait_for_function('!wilson.voice.speaking', timeout=25000)
        check('… puis libéré par la durée estimée', True)
        await page.evaluate('window.__noEnd = false; window.__liarSpeaking = false')

        # 6. Gemini écrit « (silence) » : rien n'est lu ; 2 « pas pour moi » d'affilée → Wilson se rendort
        await page.wait_for_timeout(1300)
        n = len(await page.evaluate('window.__spoken'))
        st['reply'] = {'pour_moi': True, 'emotion': 'neutre', 'reponse': '(silence)', 'fin': False, 'entendu': 'bla bla télé'}
        await page.evaluate('window.__voice()'); r0 = len(st['reqs'])
        await wait_reqs(st, r0 + 1); await page.wait_for_timeout(1300)
        check('« (silence) » écrit par Gemini → rien n\'est dit à voix haute', len(await page.evaluate('window.__spoken')) == n, str((await page.evaluate('window.__spoken'))[n:]))
        st['reply'] = {'pour_moi': False, 'emotion': 'neutre', 'reponse': '', 'fin': False, 'entendu': 'on mange quoi ce soir'}
        await page.evaluate('window.__voice()')
        await page.wait_for_function('wilson.state === "veille"', timeout=8000)
        check('2 phrases « pas pour moi » d\'affilée → retour en veille (il faut redire « Wilson »)', True)

        # 7. Bruit de fond continu (télé) : la conversation se ferme quand même
        st['reply'] = {'pour_moi': True, 'emotion': 'joie', 'reponse': 'Oui, je suis là !', 'fin': False, 'entendu': 'Wilson tu es là ?'}
        await page.evaluate("wilson.settings.convTimeout = 3; wilson._onWakeWord({text:'wilson', conf:0.9})")
        await page.wait_for_function("window.__spoken.slice(-1)[0] === 'Oui, je suis là !'", timeout=10000)
        await page.evaluate("window.__tv = setInterval(() => { wilson.audio.speaking = true; wilson.audio._offCnt = 0; }, 30)")
        try:
            await page.wait_for_function('wilson.state === "veille"', timeout=9000); ok = True
        except Exception: ok = False
        await page.evaluate('clearInterval(window.__tv)')
        check('Télé allumée en continu : la conversation se ferme quand même', ok)

        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        print('\n'.join(l for l in logs if '[Wilson]' in l and ('Répétition' in l or 'Coupé' in l or 'Latence' in l))[-800:])
        await b.close()
    print(f"\n{sum(res)}/{len(res)} vérifications OK")
asyncio.run(main())
