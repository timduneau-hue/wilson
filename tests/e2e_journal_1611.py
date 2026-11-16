"""Journal du 16/11/26 (version 1.43.4, tablette du salon et téléphone en voiture) — corrections de la 1.43.5.
 1. « Éteins toutes les lumières et fais chauffer la voiture » (tablette, 09h51:59) : le chauffage de la voiture était refusé
    (« il a demandé d'éteindre ») et Wilson disait quand même « je lance le chauffage » ; la voiture n'a pas chauffé (09h58:43).
    → la voiture et les chauffages échappent au garde-fou allumer/éteindre ; un refus dit « RIEN n'a été fait ».
 2. Question de trop coupée (téléphone, 09h58:58 et 09h59:43) : son texte arrivait avant son son, et c'est la fin de la VRAIE
    phrase qui était effacée (« tu finis pas tes phrases, ça coupe », 10h00:09). → la phrase d'avant est dite en entier,
    la question jamais, que le texte arrive avant, pendant ou après le son.
 3. Téléphone sans Home Assistant (09h58:43 « je ne contrôle pas les équipements ») : la consigne dit que c'est la tablette.
 4. « Recherche une idée business » noté comme une idée (10h01:46) : la description d'idees le distingue.
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
            conn = {'ws': ws, 'setup': None, 'texts': [], 'resp': {}}; conns.append(conn)
            def on_msg(m):
                d = json.loads(m)
                if 'setup' in d: conn['setup'] = d['setup']; ws.send(json.dumps({'setupComplete': {}}))
                elif 'realtimeInput' in d and 'text' in d['realtimeInput']: conn['texts'].append(d['realtimeInput']['text'])
                elif 'toolResponse' in d:
                    for fr in d['toolResponse'].get('functionResponses', []): conn['resp'][fr.get('id')] = json.dumps(fr.get('response'), ensure_ascii=False)
            ws.on_message(on_msg)
        await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)

        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
        await page.wait_for_timeout(500)
        await page.evaluate("window.__look = true; window.__parle(900)")
        await page.wait_for_function('wilson.state === "conversation" && wilson.brain.open', timeout=8000)
        conn = conns[-1]
        await page.wait_for_timeout(600)

        def envoi_audio(pcm):
            for i in range(0, len(pcm), 4800):
                conn['ws'].send(json.dumps({'serverContent': {'modelTurn': {'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': base64.b64encode(pcm[i:i + 4800].tobytes()).decode()}}]}}}))

        def voix(sec):           # « voix » : un son modulé (pas de silence dedans)
            t = np.arange(int(24000 * sec)) / 24000
            return (np.sin(2 * np.pi * 180 * t) * (6000 + 3000 * np.sin(2 * np.pi * 3 * t))).astype(np.int16)

        async def attendre(cond, s=6.0):
            for _ in range(int(s * 10)):
                if cond(): return True
                await asyncio.sleep(0.1)
            return False

        sysi = json.dumps(conn['setup'] or {}, ensure_ascii=False)

        # ---------- 1. Lumières ET chauffage de la voiture dans la même phrase ----------
        await page.evaluate("""() => { const W = wilson; W._m0 = W.maison.commande; W._s0 = W._suiviVoiture;
          W.maison.commande = async (a) => ({ ok: true, voiture: /voiture/.test(a.appareil), info: /voiture/.test(a.appareil) ? 'Chauffage de la voiture : à fond demandé. La voiture met jusqu\\'à une minute ; je te dirai si elle refuse.' : 'Lumière jaune salon : éteint' });
          W._suiviVoiture = () => {};
          W._heard.push({ t: performance.now(), text: 'Éteins toutes les lumières et fais chauffer la voiture.', n: W._turnN });
          W._maisonCmd({ id: 'v1', name: 'maison_commande', args: { appareil: 'climate.voiture_chauffage', action: 'allumer' } });
          W._maisonCmd({ id: 'l1', name: 'maison_commande', args: { appareil: 'light.lumiere_jaune_salon', action: 'eteindre' } });
          W._maisonCmd({ id: 'l2', name: 'maison_commande', args: { appareil: 'light.grande_lumiere_salon', action: 'allumer' } }); }""")
        await attendre(lambda: all(k in conn['resp'] for k in ('v1', 'l1', 'l2')))
        rv, rl1, rl2 = conn['resp'].get('v1', ''), conn['resp'].get('l1', ''), conn['resp'].get('l2', '')
        check('« Éteins les lumières et fais chauffer la voiture » : chauffage de la voiture lancé, pas refusé (09h51:59)', 'OK' in rv and 'Refusé' not in rv, rv)
        check('… les lumières s\'éteignent', 'OK' in rl1, rl1)
        check('… mais « allumer » une lumière dans cette phrase reste refusé, et le refus dit que rien n\'a été fait', 'Refusé, RIEN n' in rl2 and 'ne dis jamais que c\'est fait' in rl2, rl2)
        await page.evaluate("() => { wilson.maison.commande = wilson._m0; wilson._suiviVoiture = wilson._s0; }")

        # ---------- 2. Question de trop : la phrase d'avant dite en entier ----------
        phrase = "Pardon, depuis le téléphone je ne peux pas lancer le chauffage, c'est la tablette du salon qui le fait."
        question = " Tu as besoin d'autre chose maintenant ?"
        d1, pause, d2 = round(len(phrase) * 0.053, 2), 0.35, round(len(question) * 0.053, 2)
        pcm = np.concatenate([voix(d1), np.zeros(int(24000 * pause), np.int16), voix(d2)])
        for nom, ordre in [('texte AVANT le son (le cas du 16/11/26)', 'avant'), ('texte au milieu du son', 'milieu'), ('texte APRÈS tout le son', 'apres')]:
            await page.wait_for_function('!wilson.audio.playing', timeout=15000); await page.wait_for_timeout(1200)
            await page.evaluate("window.__parle(900)"); await page.wait_for_timeout(950)
            conn['ws'].send(json.dumps({'serverContent': {'inputTranscription': {'text': 'Pourquoi la voiture ne chauffait pas ?'}}}))
            n = len(logs); j0 = await page.evaluate('wilson.audio.playedSec')
            txt = {'serverContent': {'outputTranscription': {'text': phrase + question}}}
            if ordre == 'avant': conn['ws'].send(json.dumps(txt))
            if ordre == 'milieu':
                envoi_audio(pcm[:int(24000 * d1 * 0.6)]); conn['ws'].send(json.dumps(txt)); envoi_audio(pcm[int(24000 * d1 * 0.6):])
            else: envoi_audio(pcm)
            if ordre == 'apres': await page.wait_for_timeout(150); conn['ws'].send(json.dumps(txt))
            await page.wait_for_timeout(200)
            conn['ws'].send(json.dumps({'serverContent': {'turnComplete': True}}))
            await page.wait_for_timeout(400)
            joue = (await page.evaluate('wilson.audio.playedSec')) - j0
            coupe = [l for l in logs[n:] if 'Question de trop' in l]
            check(f'Question de trop, {nom} : phrase d\'avant jouée en entier ({d1:.1f} s), question jamais ({joue:.2f} s jouées)',
                  coupe and 'phrase d\'avant dite en entier' in coupe[0] and d1 - 0.05 <= joue <= d1 + pause + 0.1, f'{joue:.2f} s {coupe} {logs[n:][-6:]}')
        await page.wait_for_function('!wilson.audio.playing', timeout=15000)

        # ---------- 3. Sans Home Assistant sur l'appareil : il le dit, sans inventer ----------
        check('Consigne sans Home Assistant : « Depuis ici je ne peux pas, demande-le à la tablette du salon » (09h58:43)', 'Depuis ici je ne peux pas, demande-le à la tablette du salon' in sysi)
        # ---------- 4. « Cherche-moi une idée » n'est pas une idée à noter ----------
        check('Outil idees : « cherche-moi une idée » n\'est pas une idée à noter (10h01:46)', "n'est PAS une idée à noter" in sysi)

        # ---------- 5. Décisions de Timothée du 16/11/26 (12h45) : le doute, Claude pour l'information fiable ----------
        check('Consigne : au moindre doute, UNE question courte avant de répondre ; jamais pour une demande claire', 'Le doute (décision de Timothée du 16/11/26' in sysi and 'UNE seule question courte' in sysi)
        src = await page.evaluate("Promise.all([fetch('./js/app.js').then((r) => r.text()), fetch('./js/claude.js').then((r) => r.text())])")
        check('Claude (question_difficile) pour toute information fiable, même si Gemini croit savoir', 'Toute question qui demande une information FIABLE' in src[1] and 'ne réponds pas de mémoire' in src[0])
        r = await page.evaluate("""() => ({ q: wilson._aDireTexte({ question: 'charge d\\'une paumelle Tectus', dire: 'Question : tu parles de la TE 340 ou de la TE 540 ?', s: 40 }),
          n: wilson._aDireTexte({ question: 'charge Tectus TE 340', dire: 'D\\'après la fiche Simonswerk, 80 kilos.', s: 40 }) })""")
        check('Claude demande une précision (« Question : … ») : Wilson la pose, puis rappelle question_difficile', 'Pose-lui seulement cette question' in r['q'] and 'TE 340 ou de la TE 540' in r['q'] and 'Question :' not in r['q'] and 'rappelle question_difficile' in r['q'], r['q'])
        check('… une vraie réponse reste « J\'ai la réponse à ta question »', "J'ai la réponse à ta question" in r['n'], r['n'])

        check('Aucune erreur JavaScript', not any(l.startswith('PAGEERROR') for l in logs), str([l for l in logs if l.startswith('PAGEERROR')]))
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications réussies")
    raise SystemExit(0 if all(results) else 1)

asyncio.run(main())
