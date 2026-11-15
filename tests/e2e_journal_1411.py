"""Journal du 14/11/26 (version 1.43.0, tablette du salon) — corrections de la 1.43.2.
 1. « Ce n'est pas pour moi » dit à voix haute (10h48:41 « On dirait que ce n'est pas pour moi », 11h08:54 « On dirait que vous
    papotez entre vous, je ne m'immisce pas », 13h16:46, 16h01:41 « Je vous laisse régler ça entre vous ! », 21h26:10 et
    21h27:18 « tu parles de moi ou vous vous parlez entre vous ? ») : coupé comme une didascalie, rien n'est joué ;
    une vraie réponse juste après est jouée normalement ; la consigne le lui interdit.
 2. Appareil « injoignable » (15h02:25, 20h05:35 « Allume la télé » → « elle est injoignable » sans essayer) : la consigne
    lui demande d'appeler quand même maison_commande (voir aussi maison_unit.mjs).
 3. E-mails (téléphone, 16h41:41-16h42:48) : « accède à ma boîte pro » → la boîte pro coupée est dite avant la vérification du
    visage (plus « regarde-moi bien et redemande » deux fois) ; visage pas encore appris sur l'appareil → il dit comment l'apprendre.
"""
import asyncio, re, json, base64, os
import numpy as np
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, '' if ok else detail, flush=True)

GAZE = """window.__look = false;
setInterval(() => { const v = window.wilson && wilson.vision; if (!v) return;
  v.gazeReady = true; v.modelsDone = true; v.forceLook = false; v._lastResult = performance.now();
  v.looking = !!window.__look; if (window.__look) v.lookAt = v.sureAt = performance.now(); v.faceAt = performance.now(); v.hasPerson = true; v.faces = 1; }, 30);
window.__parle = (ms) => { const A = wilson.audio; const iv = setInterval(() => { A.lastVoicedAt = performance.now(); A.speaking = true; A._offCnt = 0; }, 15); setTimeout(() => clearInterval(iv), ms); };"""


def audio_chunks(seconds):
    sr = 24000; t = np.arange(int(sr * seconds)) / sr
    pcm = (np.sin(2 * np.pi * 180 * t) * 8000).astype(np.int16)
    return [base64.b64encode(pcm[i:i + 4800].tobytes()).decode() for i in range(0, len(pcm), 4800)]


async def main():
    conns = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(bypass_csp=True, viewport={'width': 1280, 'height': 800}, permissions=['microphone', 'camera'], service_workers='block')
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AIzaTESTTESTTESTTESTTESTTESTTEST', listenMode:'regard', brainMode:'live', convTimeout: 30, subtitles: true, v:3}));")
        await ctx.add_init_script(GAZE)
        page = await ctx.new_page(); logs = []
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
        page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))

        def handler(ws):
            conn = {'ws': ws, 'setup': None, 'texts': []}; conns.append(conn)
            def on_msg(m):
                d = json.loads(m)
                if 'setup' in d: conn['setup'] = d['setup']; ws.send(json.dumps({'setupComplete': {}}))
                elif 'realtimeInput' in d and 'text' in d['realtimeInput']: conn['texts'].append(d['realtimeInput']['text'])
            ws.on_message(on_msg)
        await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)

        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
        await page.wait_for_timeout(500)
        await page.evaluate("window.__look = true; window.__parle(900)")
        await page.wait_for_function('wilson.state === "conversation" && wilson.brain.open', timeout=8000)
        conn = conns[-1]
        await page.wait_for_timeout(600)

        def say(sec, text, user=None):
            if user: conn['ws'].send(json.dumps({'serverContent': {'inputTranscription': {'text': user}}}))
            ch = audio_chunks(sec)
            for c in ch[:2]: conn['ws'].send(json.dumps({'serverContent': {'modelTurn': {'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': c}}]}}}))
            conn['ws'].send(json.dumps({'serverContent': {'outputTranscription': {'text': text}}}))
            for c in ch[2:]: conn['ws'].send(json.dumps({'serverContent': {'modelTurn': {'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': c}}]}}}))
            conn['ws'].send(json.dumps({'serverContent': {'turnComplete': True}}))

        # ---------- 1. « Ce n'est pas pour moi » : coupé ----------
        sysi = json.dumps(conn['setup'] or {}, ensure_ascii=False)
        check('Consigne : jamais « on dirait que ce n\'est pas pour moi » ; se taire, c\'est tout', "jamais « on dirait que ce n'est pas pour moi »" in sysi)
        src = await page.evaluate("fetch('./js/app.js').then((r) => r.text())")
        check('Consigne de la maison : appareil « injoignable » → appeler quand même maison_commande (15h02:25, 20h05:35)', 'appelle quand même maison_commande, qui sait le réveiller' in src)
        for i, (u, w) in enumerate([("Ouais, il faut les arranger les chaussures.", "Je vous laisse régler ça entre vous ! Prévenez-moi si vous avez besoin d'aide pour autre chose."),
                                     ("¿Qué ni la? Cool.", "On dirait que vous papotez entre vous, je ne m'immisce pas. Faites-moi signe si vous avez besoin de moi !"),
                                     ("Donc une facture de téléphone, ça passe. Oui.", "J'entends bien, mais tu parles de moi ou vous vous parlez entre vous ? Dis-moi si tu as besoin de quelque chose.")]):
            await page.evaluate("window.__parle(800)"); await page.wait_for_timeout(850)
            n = len(logs)
            say(3.0, w, u)
            await page.wait_for_timeout(500)
            joue = await page.evaluate('wilson.audio.playing')
            sous = await page.evaluate("document.getElementById('subtitle').textContent")
            check(f'« {w[:45]}… » : coupé, rien n\'est joué (14/11/26)', not joue and any("« Ce n'est pas pour moi » coupé" in l for l in logs[n:])
                  and not any(l.startswith('Wilson : ') or 'Wilson : ' + w[:20] in l for l in logs[n:]) and w[:20] not in sous, str(logs[n:])[-400:])

        # Une vraie réponse juste après : jouée normalement.
        await page.evaluate("window.__parle(800)"); await page.wait_for_timeout(850)
        n = len(logs)
        say(1.0, "C'est fait, la lumière jaune est allumée.", "Allume la lumière jaune.")
        await page.wait_for_timeout(250)
        check('Vraie réponse juste après : jouée et notée', await page.evaluate('wilson.audio.playing') and any("Wilson : C'est fait, la lumière jaune" in l for l in logs[n:]), str(logs[n:])[-300:])

        # ---------- 3. E-mails : boîte pro coupée dite avant la vérification du visage (16h41:41-16h42:48, téléphone) ----------
        r = await page.evaluate("""(async () => {
          const W = wilson; W.settings.mailsPro = false; const vus = []; const p0 = W._parClaude; W._parClaude = async (o) => { vus.push(o.boite); return { info: 'ok' }; };
          const pro = await W._mails({ demande: 'accès à la boîte mail pro sur Outlook', boite: 'pro' });
          const perso = await W._mails({ demande: 'mes derniers e-mails', boite: 'perso' });
          W._parClaude = p0;
          return { pro: pro.dire, perso: perso.dire, vus, aut: W._crmAutorise() };
        })()""")
        check('E-mails pro demandés sans visage reconnu : « Ta boîte pro, je ne la regarde plus » (plus « regarde-moi bien »)', 'boîte pro, je ne la regarde plus' in (r['pro'] or ''), str(r))
        check('E-mails perso sans visage appris sur cet appareil : refusés, et il dit comment apprendre le visage', not r['vus'] and 'apprends mon visage' in (r['perso'] or ''), str(r))

        check('Aucune erreur JavaScript', not any(l.startswith('PAGEERROR') for l in logs), str([l for l in logs if l.startswith('PAGEERROR')]))
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications réussies")
    raise SystemExit(0 if all(results) else 1)

asyncio.run(main())
