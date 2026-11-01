"""R1 — règle de Timothée du 01/11/26 : « il ne doit répondre ou engager la conversation que s'il est sûr que les yeux
de l'interlocuteur le regardent ». Journal du 01/11/26, 19h13 : « C'est sans commentaire Hudson. » → « D'accord, je reste
à ta disposition. », puis « I have to go » → « bonne fin de journée », alors que personne n'était devant la caméra.

Vérifie :
1. Vision : un coup d'œil (2 analyses), des yeux mi-clos, ne confirment pas le regard ; 3 analyses sur 0,6 s, si.
   Un regard non confirmé n'ouvre pas la discussion (avant : une seule analyse « regarde » suffisait, 1,5 s durant).
2. Direct : regardé + voix → réponse jouée ; puis plus regardé → la réponse de Gemini est retenue (rien n'est joué,
   rien dans les sous-titres, pas de relance, journal « Réponse retenue ») ; un outil demandé sans regard est refusé.
3. Regardé de nouveau en parlant → la réponse est jouée ; la suite d'un outil permis aussi.
4. Toucher l'écran : réponse permise même sans regard.
"""
import asyncio, re, json, base64, os
import numpy as np
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, detail, flush=True)

# Regard simulé (sortie de la vision) : window.__look pilote le regard CONFIRMÉ, comme le ferait vision.js.
GAZE = """window.__look = false; window.__shim = true;
setInterval(() => { const v = window.wilson && wilson.vision; if (!v || !window.__shim) return;
  v.gazeReady = true; v.modelsDone = true; v.forceLook = false; v._lastResult = performance.now();
  v.looking = !!window.__look; if (window.__look) v.lookAt = v.sureAt = performance.now(); v.faceAt = performance.now(); v.hasPerson = true; v.faces = 1; }, 30);
// Voix de la personne pendant ms millisecondes (le faux micro tourne : chaque bloc est compté avec ou sans regard).
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
        ctx = await b.new_context(viewport={'width': 1280, 'height': 800}, permissions=['microphone', 'camera'], service_workers='block')
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AIzaTESTTESTTESTTESTTESTTESTTEST', listenMode:'regard', brainMode:'live', convTimeout: 12, subtitles: true, v:3}));")
        await ctx.add_init_script(GAZE)
        page = await ctx.new_page(); logs = []
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
        page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))

        def handler(ws):
            conn = {'ws': ws, 'audio': 0, 'texts': [], 'tools': []}; conns.append(conn)
            def on_msg(m):
                d = json.loads(m)
                if 'setup' in d: ws.send(json.dumps({'setupComplete': {}}))
                elif 'realtimeInput' in d:
                    if 'audio' in d['realtimeInput']: conn['audio'] += 1
                    if 'text' in d['realtimeInput']: conn['texts'].append(d['realtimeInput']['text'])
                elif 'clientContent' in d:
                    for t in d['clientContent'].get('turns', []):
                        for pp in t.get('parts', []):
                            if 'text' in pp: conn['texts'].append(pp['text'])
                elif 'toolResponse' in d: conn['tools'].extend(d['toolResponse'].get('functionResponses', []))
            ws.on_message(on_msg)
        await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)

        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
        await page.wait_for_timeout(500)

        # ---------- 1. La vision ne confirme le regard que si elle en est sûre ----------
        r = await page.evaluate("""(async () => {
          const { Vision, LOOK_CONFIRM } = await import('./js/vision.js');
          const v = new Vision(); v._sentAt = performance.now();
          const M = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];                         // tête tournée vers la tablette
          const res = (blink) => ({ type: 'result', light: 0.5, mn: 0, mx: 0, my: 0, ms: 50, boxes: [{ cx: 0.5, cy: 0.5, w: 0.1, h: 0.15 }],
            faces: [{ m: M, bs: { eyeBlinkLeft: blink, eyeBlinkRight: blink }, size: 0.1 }] });
          const vide = { type: 'result', light: 0.5, mn: 0, mx: 0, my: 0, ms: 50, boxes: [], faces: [] };
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          const out = {};
          v._onMessage(res(0.2)); await wait(120); v._onMessage(res(0.2));                // coup d'œil : 2 analyses, 0,12 s
          out.coupOeil = v.looking; out.sureCoup = v.sureAt; out.lookAtCoup = v.lookAt > 0;
          v._onMessage(vide); v._onMessage(vide); v._onMessage(vide);
          for (let i = 0; i < 6; i++) { v._onMessage(res(0.7)); await wait(150); }    // yeux mi-clos, 0,9 s
          out.miClos = v.looking;
          v._onMessage(vide);
          v._onMessage(res(0.2)); await wait(250); v._onMessage(res(0.2)); await wait(250); out.deux = v.looking;
          await wait(150); v._onMessage(res(0.2)); out.sur = v.looking; out.sureAt = v.sureAt > 0; out.info = v.lookInfo;
          out.conf = LOOK_CONFIRM;
          return out; })()""")
        check('Vision : un coup d\'œil (2 analyses en 0,12 s) ne confirme pas le regard', not r['coupOeil'] and not r['sureCoup'] and r['lookAtCoup'], str({k: r[k] for k in ('coupOeil', 'sureCoup')}))
        check('Vision : yeux mi-clos (paupières 70 %) → pas regardé, même longtemps', not r['miClos'])
        check('Vision : 3 analyses sur 0,65 s, yeux ouverts → regard confirmé (avec ses détails pour le journal)',
              not r['deux'] and r['sur'] and r['sureAt'] and r['info'] and r['info']['n'] >= 3 and r['info']['ms'] >= 600, str(r['info']))

        # Un regard non confirmé (une analyse « regarde » isolée) n'ouvre plus la discussion, même si quelqu'un parle.
        await page.evaluate("window.__shim = false; const v = wilson.vision; v.gazeReady = true; v.modelsDone = true; v.looking = false; v.lookAt = performance.now(); v.sureAt = 0; window.__parle(1500)")
        await page.wait_for_timeout(1200)
        check('Analyse « regarde » isolée + voix : la discussion ne s\'ouvre pas (avant : elle s\'ouvrait)', await page.evaluate('wilson.state') == 'veille' and not conns,
              await page.evaluate('wilson.state'))
        await page.evaluate("window.__shim = true")

        # ---------- 2. Direct : regardé → réponse ; plus regardé → réponse retenue ----------
        await page.evaluate("window.__look = true; window.__parle(900)")
        await page.wait_for_function('wilson.state === "conversation" && wilson.brain.open', timeout=8000)
        conn = conns[-1]
        check('Regard confirmé + voix : discussion ouverte, détails du regard dans le journal', any('Regard confirmé :' in l for l in logs))
        def say(sec, text, user=None):
            if user: conn['ws'].send(json.dumps({'serverContent': {'inputTranscription': {'text': user}}}))
            for c in audio_chunks(sec):
                conn['ws'].send(json.dumps({'serverContent': {'modelTurn': {'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': c}}]}}}))
            conn['ws'].send(json.dumps({'serverContent': {'outputTranscription': {'text': text}}}))
            conn['ws'].send(json.dumps({'serverContent': {'turnComplete': True}}))
        await page.wait_for_timeout(600)
        say(0.8, 'Bonsoir, je t\'écoute.', 'Bonsoir Wilson')
        await page.wait_for_timeout(250)
        check('Phrase dite en le regardant : sa réponse est jouée', await page.evaluate('wilson.audio.playing') and any('Wilson : Bonsoir' in l for l in logs))
        await page.wait_for_function('!wilson.audio.playing', timeout=5000)

        # Plus personne ne le regarde (encore dans les 3 s de grâce : discussion ouverte, micro ouvert) ; la télé parle.
        await page.evaluate("window.__look = false; window.__parle(1200)")
        await page.wait_for_timeout(1300)
        check('Dans les 3 s sans regard : discussion encore ouverte (R3)', await page.evaluate('wilson.state === "conversation" && !wilson.paused'))
        nt = len(conn['texts'])
        say(1.0, 'D\'accord, je reste à ta disposition.', 'C\'est sans commentaire Hudson.')
        await page.wait_for_timeout(300)
        st = await page.evaluate("({ p: wilson.audio.playing, sub: document.getElementById('subtitle').textContent, n: wilson._nRetenues })")
        check('Phrase dite sans le regarder (journal 19h13) : la réponse de Gemini n\'est PAS jouée', not st['p'] and 'disposition' not in st['sub'] and st['n'] == 1, str(st))
        check('… journal : « Réponse retenue » et ce qu\'il aurait dit, pas de « Wilson : D\'accord »',
              any('Réponse retenue : personne ne me regardait' in l for l in logs) and any('il aurait dit : « D\'accord' in l for l in logs)
              and not any('Wilson : D\'accord' in l for l in logs))
        check('… et pas de relance (« réponds maintenant »)', len(conn['texts']) == nt, str(conn['texts'][nt:]))
        # Gemini tente un outil à partir de ce qu'il a entendu sans regard : refusé.
        conn['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': 't1', 'name': 'date_et_heure', 'args': {}}]}}))
        await page.wait_for_timeout(300)
        tr = [x for x in conn['tools'] if x.get('id') == 't1']
        check('Outil demandé sans regard : refusé (« ne fais rien et ne dis rien »)', tr and 'Personne ne te regardait' in json.dumps(tr[0], ensure_ascii=False), json.dumps(tr, ensure_ascii=False)[:160])
        conn['ws'].send(json.dumps({'serverContent': {'turnComplete': True}}))
        await page.wait_for_timeout(200)
        # « Salut Wilson, comment ça va ? » sans le regarder, Gemini muet : pas de relance non plus.
        nt = len(conn['texts'])
        conn['ws'].send(json.dumps({'serverContent': {'inputTranscription': {'text': 'Salut Wilson, comment ça va ?'}}}))
        conn['ws'].send(json.dumps({'serverContent': {'outputTranscription': {'text': '<no speech>'}, 'turnComplete': True}}))
        await page.wait_for_timeout(300)
        check('Vraie question dite sans le regarder, Gemini muet : pas de relance', len(conn['texts']) == nt and any('personne ne le regardait' in l for l in logs), str(conn['texts'][nt:]))

        # ---------- 3. Regardé de nouveau en parlant : il répond ----------
        await page.evaluate("window.__look = true; window.__parle(900)")
        await page.wait_for_timeout(1000)
        say(0.8, 'Il est vingt heures.', 'Quelle heure est-il ?')
        await page.wait_for_timeout(250)
        check('Regardé en parlant : la réponse est jouée', await page.evaluate('wilson.audio.playing') and any('Wilson : Il est vingt heures' in l for l in logs))
        await page.wait_for_function('!wilson.audio.playing', timeout=5000)
        # Outil demandé en le regardant : accepté, et sa suite est dite même si on a détourné les yeux entre-temps.
        await page.wait_for_timeout(900); await page.evaluate("window.__parle(700)"); await page.wait_for_timeout(800)
        conn['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': 't2', 'name': 'date_et_heure', 'args': {}}]}}))
        await page.wait_for_timeout(300)
        tr = [x for x in conn['tools'] if x.get('id') == 't2']
        check('Outil demandé en le regardant : accepté', tr and 'Personne' not in json.dumps(tr[0], ensure_ascii=False), json.dumps(tr, ensure_ascii=False)[:160])
        await page.evaluate("window.__look = false")
        say(0.6, 'Nous sommes dimanche.')
        await page.wait_for_timeout(250)
        check('… sa suite est dite même si on regarde ailleurs pendant qu\'il cherche', await page.evaluate('wilson.audio.playing'))
        await page.wait_for_function('!wilson.audio.playing', timeout=5000)
        # La suite dite, la permission de l'outil s'arrête : une nouvelle phrase sans regard n'a pas de réponse.
        await page.wait_for_timeout(900); await page.evaluate("window.__parle(800)"); await page.wait_for_timeout(900)
        n0 = await page.evaluate('wilson._nRetenues')
        say(0.6, 'Je ne sais pas.', 'I have to go')
        await page.wait_for_timeout(250)
        check('Après la suite de l\'outil : phrase sans regard (« I have to go ») → réponse retenue',
              not await page.evaluate('wilson.audio.playing') and await page.evaluate('wilson._nRetenues') == n0 + 1)
        await page.evaluate("wilson.endConversation('test')")
        await page.wait_for_timeout(400)

        # ---------- 4. Toucher l'écran : réponse permise sans regard ----------
        await page.evaluate("window.__look = false; wilson.startConversation('toucher')")
        await page.wait_for_function('wilson.state === "conversation" && wilson.brain.open', timeout=8000)
        conn = conns[-1]; await page.wait_for_timeout(300)
        say(0.6, 'Oui ?')
        await page.wait_for_timeout(250)
        check('Toucher l\'écran sans le regarder : il répond (geste sûr)', await page.evaluate('wilson.audio.playing'))
        bil = await page.evaluate('wilson.bilan()')
        check('Bilan (onglet État) : nombre de réponses retenues', bil.get('Réponses retenues (personne ne le regardait)') == '2', str(bil.get('Réponses retenues (personne ne le regardait)')))

        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        print('   ', ' | '.join(l[9:] for l in logs if '[Wilson]' in l)[-1800:])
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")

asyncio.run(main())
