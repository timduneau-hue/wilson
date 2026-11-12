"""Corrections d'après le journal du 05/11/26, 09h30-09h48 (téléphone relié à la voiture, 1.28.0) :
1. « Pourquoi il faut que je t'appelle trois fois ? » : le « Wilson » arrivé pendant une vérification était jeté après un
   « non » (attente de 3 s), ou remplacé par la phrase suivante, et le son envoyé ensuite ne le contenait plus.
   → il est vérifié juste après, avec tout ce qui a été dit depuis le début de la première phrase en attente ;
   → 2e modèle interrogé en même temps si le premier traîne (3 s) ; durée, son et modèle au journal ;
   → petit bip dès qu'il a entendu son nom en voiture ; la demande commence à la phrase où on l'appelle.
2. Muet après « remarque » / « rappel » : relance au bout de 3 s (5 s avant), pas pendant que Timothée parle ;
   petit son de réflexion en voiture pendant ce temps ; résultat de « remarque » = « C'est noté. » (Gemini lisait la
   consigne à voix haute) ; la même remarque n'est pas notée deux fois.
3. Google qui attend encore la fin de la phrase (bruit de la route, 44,9 s) : « réponds » au bout de 5 s sans un mot, une fois.
4. Objectif des clients actifs : « OBJECTIF CLIENTS ACTIFS 50 » retenu ; jamais « N-1 » pris pour un objectif ;
   règle « au moins N-1 » donnée à l'analyste.
5. Analyste : requête Gemini sans réponse → abandonnée au bout du délai, modèle suivant (187 s pour une étape).
6. Journée préparée quand le téléphone se relie à la voiture.
"""
import asyncio, re, json, os, base64, time
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, detail, flush=True)

STUB = """(() => {
  const md = navigator.mediaDevices, gum0 = md.getUserMedia.bind(md);
  md.enumerateDevices = async () => [
    { deviceId: 'id-speaker', kind: 'audioinput', label: 'Speakerphone', groupId: 'g1' },
    { deviceId: 'id-bt', kind: 'audioinput', label: 'Bluetooth headset', groupId: 'g3' },
    { deviceId: 'cam', kind: 'videoinput', label: 'camera 1, facing front', groupId: 'g4' }].map((d) => ({ ...d, toJSON() { return d; } }));
  md.getUserMedia = async (c) => gum0(c && c.audio ? { audio: true, video: false } : c);
})();"""
GAZE = """window.__look = false;
setInterval(() => { const v = window.wilson && wilson.vision; if (!v) return;
  v.gazeReady = true; v.modelsDone = true; v.forceLook = false; v._lastResult = performance.now();
  v.looking = !!window.__look; if (window.__look) v.lookAt = v.sureAt = performance.now(); v.faceAt = performance.now(); v.hasPerson = true; v.faces = 1; }, 30);
window.__parle = (ms) => { const A = wilson.audio; const iv = setInterval(() => { A.lastVoicedAt = performance.now(); A.speaking = true; A._offCnt = 0; }, 15); setTimeout(() => { clearInterval(iv); A.speaking = false; }, ms); };"""
PHONE_UA = 'Mozilla/5.0 (Linux; Android 15; SM-A266B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36'
GL = re.compile(r'https://generativelanguage\.googleapis\.com/v1beta/models/.*')


def gemini_json(o):
    return json.dumps({'candidates': [{'content': {'parts': [{'text': json.dumps(o)}]}}]})


def wav_seconds(post):
    d = json.loads(post); wav = base64.b64decode(d['contents'][0]['parts'][0]['inlineData']['data'])
    rate = int.from_bytes(wav[24:28], 'little'); return (len(wav) - 44) / 2 / rate


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(bypass_csp=True, viewport={'width': 412, 'height': 900}, permissions=['microphone', 'camera'], service_workers='block', user_agent=PHONE_UA)
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AIzaTESTTESTTESTTESTTESTTESTTEST', listenMode:'regard', model:'gemini-3.1-flash-live-preview', logUrl:'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTEST/exec', crm:true, v:4}));")
        await ctx.add_init_script(STUB); await ctx.add_init_script(GAZE)
        page = await ctx.new_page(); logs = []; conns = []
        async def script(route):
            await route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'},
                                body=json.dumps({'ok': True, 'texte': 'Bilan : 19 clients actifs ce mois-ci.', 'rdv': [], 'contacts': 10, 'brouillons': 0, 'reglages': None, 't': 0}))
        await page.route(re.compile(r'https://script\.google\.com/.*'), script)
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
        page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
        def handler(ws):
            conn = {'ws': ws, 'texts': [], 'tools': [], 'tt': []}; conns.append(conn)
            def on_msg(m):
                d = json.loads(m)
                if 'setup' in d: ws.send(json.dumps({'setupComplete': {}}))
                elif 'realtimeInput' in d and 'text' in d['realtimeInput']: conn['texts'].append(d['realtimeInput']['text']); conn['tt'].append(time.monotonic())
                elif 'toolResponse' in d: conn['tools'] += d['toolResponse']['functionResponses']
            ws.on_message(on_msg)
        await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)
        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
        await page.wait_for_timeout(1500)
        has = lambda t: any(t in l for l in logs)
        await page.evaluate("wilson.oreille.templates = [[1], [1], [1]]; wilson.oreille.seuil = 167.3; wilson.audio.speaking = false; wilson.audio.lastVoicedAt = 0;"
                            "window.__tones = []; const t0 = wilson.audio.tone.bind(wilson.audio); wilson.audio.tone = (k) => { window.__tones.push(k); try { t0(k); } catch (_) {} }")
        check('Téléphone relié à la voiture, en veille', await page.evaluate("wilson._voitureBt && wilson.state === 'veille'"))

        # ---------- 1. Oreille : le « Wilson » en attente n'est plus perdu ----------
        reqs = []; plan = []
        async def gem(route):
            post = route.request.post_data or ''; url = route.request.url
            if 'audio/wav' not in post:                                    # passe de mémoire, etc. : pas une vérification du nom
                try: await route.fulfill(status=200, content_type='application/json', body=gemini_json({'operations': []}))
                except Exception: pass
                return
            reqs.append({'url': url, 'post': post, 't': time.monotonic()})
            act = plan.pop(0) if plan else ('non', 0)
            kind, delay = act
            if delay: await asyncio.sleep(delay)
            if kind == 'hang':
                await asyncio.sleep(30); return
            o = {'texte': 'Wilson, tu m\'entends ?', 'nom_sur': True, 'tele': False} if kind == 'oui' else {'texte': 'la radio parle de la météo', 'nom_sur': False, 'tele': True}
            try: await route.fulfill(status=200, content_type='application/json', body=gemini_json(o))
            except Exception: pass
        await page.route(GL, gem)
        # A (bruit de la radio) en cours de vérification 2 s → « non » ; B (« Wilson, tu m'entends ? ») arrive pendant ce temps.
        plan[:] = [('non', 2.0), ('oui', 0)]
        # (1.37.0 : en veille dans la voiture, le micro est fermé et le réveil se fait au toucher ; ici on garde le micro
        # ouvert pour vérifier la logique de vérification du nom, toujours utilisée à la maison.)
        await page.evaluate("wilson._micVoiture = () => {}; wilson.audio.resumeMic()")
        await page.wait_for_timeout(2500)
        await page.evaluate("wilson._onName({ score: 90.0, limite: 167.3, duree: 1.0 })")
        await page.wait_for_timeout(700)
        await page.evaluate("wilson._onName({ score: 98.2, limite: 167.3, duree: 0.6 })")
        await page.wait_for_function("wilson.state === 'conversation' && wilson.brain.open", timeout=9000)
        check('« Wilson » arrivé pendant une vérification qui répond « non » : vérifié juste après (plus jeté) → réveil',
              len(reqs) == 2 and has('vérifié juste après') and has('→ non'), str([l for l in logs if 'Oreille' in l][-4:]))
        sec = wav_seconds(reqs[1]['post']) if len(reqs) > 1 else 0
        check('… le son envoyé contient sa phrase (depuis son début : ≥ 1,8 s ici)', sec >= 1.8, f'{sec:.2f} s')
        check('… le son reste en 8 kHz (réseau mobile)', int.from_bytes(base64.b64decode(json.loads(reqs[1]['post'])['contents'][0]['parts'][0]['inlineData']['data'])[24:28], 'little') == 8000 if len(reqs) > 1 else False)
        check('… durée, longueur du son et modèle notés au journal', any(re.search(r'→ oui.*\(\d+\.\d s, son de \d+\.\d s, gemini-', l) for l in logs), str([l for l in logs if '→ oui' in l]))
        await page.wait_for_timeout(500)
        tones = await page.evaluate('window.__tones.slice()')
        check('… petit bip dès qu\'il a entendu son nom (demande « tu m\'entends ? », en voiture)', 'ecoute' in tones, str(tones))
        c = conns[-1]
        check('… la demande transmise commence à la phrase où on l\'appelle', any('« tu m\'entends? »' in t for t in c['texts']), str(c['texts'])[:300])
        await page.evaluate("wilson.endConversation('test')"); await page.wait_for_function("wilson.state === 'veille'", timeout=8000)

        # Plusieurs phrases en attente : la vérification suivante part du début de la PREMIÈRE
        reqs.clear(); plan[:] = [('non', 2.6), ('non', 0)]          # 2,6 s : sous le délai du 2e modèle (3 s)
        await page.evaluate("wilson._nomCouvert = 0; wilson.playEndAt = 0; wilson._onName({ score: 90.0, limite: 167.3, duree: 0.8 })")
        await page.wait_for_timeout(500)
        await page.evaluate("wilson._onName({ score: 60.0, limite: 167.3, duree: 0.5 })")
        await page.wait_for_timeout(1000)
        await page.evaluate("wilson._onName({ score: 120.0, limite: 167.3, duree: 0.4 })")
        await page.wait_for_timeout(3500)
        sec = wav_seconds(reqs[1]['post']) if len(reqs) > 1 else 0
        check('Deux phrases en attente : une seule vérification ensuite, depuis le début de la première (≥ 2,6 s)', len(reqs) == 2 and sec >= 2.6 and has('(avec la phrase d\'avant)'), f'{len(reqs)} requête(s), {sec:.2f} s')
        await page.wait_for_timeout(500)
        reqs.clear(); plan[:] = [('non', 0)]
        await page.evaluate("wilson._onName({ score: 70.0, limite: 167.3, duree: 0.5 })")
        await page.wait_for_timeout(800)
        check('Juste après un « non », plus d\'attente de 3 s : le « Wilson » suivant est vérifié aussitôt', len(reqs) == 1, str(len(reqs)))

        # Le premier modèle traîne : le 2e est interrogé en même temps au bout de 3 s
        reqs.clear(); await page.evaluate("wilson.eco.sent = []")
        async def lent(route):
            url = route.request.url
            if 'audio/wav' not in (route.request.post_data or ''):
                try: await route.fulfill(status=200, content_type='application/json', body=gemini_json({'operations': []}))
                except Exception: pass
                return
            reqs.append({'url': url, 'post': route.request.post_data or '', 't': time.monotonic()})
            if 'gemini-3.5-flash-lite' in url:
                await asyncio.sleep(30); return
            try: await route.fulfill(status=200, content_type='application/json', body=gemini_json({'texte': 'Wilson, qui je vois demain ?', 'nom_sur': True, 'tele': False}))
            except Exception: pass
        await page.unroute(GL); await page.route(GL, lent)
        t0 = time.monotonic()
        await page.evaluate("wilson._onName({ score: 80.0, limite: 167.3, duree: 0.7 })")
        await page.wait_for_function("wilson.state === 'conversation'", timeout=9000)
        dt = time.monotonic() - t0
        models = [re.search(r'models/([^:]+):', r['url']).group(1) for r in reqs]
        check('Premier modèle sans réponse : le suivant interrogé au bout de 3 s, réveil sans attendre les 10 s', 2.5 <= dt <= 6 and models[:2] == ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'] and has('gemini-3.1-flash-lite)'), f'{dt:.1f} s {models}')
        await page.evaluate("wilson.endConversation('test')"); await page.wait_for_function("wilson.state === 'veille'", timeout=8000)
        await page.unroute(GL)

        J = await page.evaluate("""import('./js/eco.js').then(({ prenomDans, jugerAppel }) => [
          prenomDans("La météo pour demain. Wilson, tu m'entends ?").demande,
          prenomDans("Tu m'entends Wilson ?").demande,
          prenomDans('Wilson, allume la lumière jaune.').demande,
          jugerAppel(prenomDans("Il pleut sur la côte. Des orages ce soir. Wilson, qui je vois demain ?"), { nom_sur: true, tele: false })])""")
        check('Son de plusieurs phrases : la demande commence à la phrase du prénom (la radio d\'avant est laissée)',
              J[0] == "tu m'entends?" and J[1] == "Tu m'entends?" and J[2] == 'allume la lumière jaune.' and J[3]['appel'] and J[3]['demande'] == 'qui je vois demain?' and not J[3]['doute'], str(J))

        # ---------- 2. Après un outil ----------
        await page.route(GL, lambda r: asyncio.ensure_future(r.fulfill(status=200, content_type='application/json', body=gemini_json({'texte': 'Wilson, note une remarque', 'nom_sur': True, 'tele': False}))))
        await page.evaluate("wilson.eco.sent = []; wilson._onName({ score: 80.0, limite: 167.3, duree: 0.7 })")
        await page.wait_for_function("wilson.state === 'conversation' && wilson.brain.open", timeout=9000)
        await page.unroute(GL)
        c = conns[-1]; await page.wait_for_timeout(400)
        await page.evaluate("window.__tones.length = 0; wilson.audio.lastVoicedAt = 0; wilson.audio.speaking = false")
        n0 = len(c['texts']); t0 = time.monotonic()
        c['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': 'fc_1', 'name': 'remarque', 'args': {'texte': 'Pendant une recherche, être plus bref.'}}]}}))
        c['ws'].send(json.dumps({'serverContent': {'turnComplete': True}}))
        for _ in range(60):
            await page.wait_for_timeout(100)
            if any('[Tu as le résultat de ton outil' in t for t in c['texts'][n0:]): break
        idx = next((i for i, t in enumerate(c['texts'][n0:]) if '[Tu as le résultat de ton outil' in t), None)
        dt = (c['tt'][n0 + idx] - t0) if idx is not None else 99
        res = [r for r in c['tools'] if r.get('name') == 'remarque']
        check('Résultat de « remarque » = « C\'est noté. » (plus de consigne lue à voix haute)', res and res[-1]['response']['result'] == "C'est noté.", str(res)[:200])
        check('Muet après l\'outil : relance au bout de 3 s (5 s avant)', 2.7 <= dt <= 4.2, f'{dt:.1f} s')
        tones = await page.evaluate('window.__tones.slice()')
        check('… petit son de réflexion en voiture pendant l\'attente (« dis-moi quand tu travailles »)', 'reflexion' in tones, str(tones))
        # la même remarque (outil annulé par Google puis rappelé) : notée une seule fois
        c['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': 'fc_2', 'name': 'remarque', 'args': {'texte': 'Pendant une recherche, être plus bref.'}}]}}))
        await page.wait_for_timeout(600)
        n = len([l for l in logs if 'REMARQUE DE TIMOTHÉE : Pendant une recherche' in l])
        check('La même remarque rappelée par Google : notée une seule fois', n == 1 and has('Remarque déjà notée'), str(n))
        desc = await page.evaluate("import('./js/outils.js').then(({ OUTILS }) => OUTILS.find((t) => t.name === 'remarque').description)")
        check('… la consigne « C\'est noté. » est dans la description de l\'outil', "dis seulement « C'est noté. »" in desc, desc[-140:])
        # pas de relance pendant qu'il parle encore
        await page.wait_for_timeout(3500)
        n0 = len(c['texts']); t0 = time.monotonic()
        c['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': 'fc_3', 'name': 'rappel', 'args': {'action': 'liste'}}]}}))
        c['ws'].send(json.dumps({'serverContent': {'turnComplete': True}}))
        await page.evaluate("window.__parle(2600)")
        for _ in range(80):
            await page.wait_for_timeout(100)
            if any('[Tu as le résultat de ton outil' in t for t in c['texts'][n0:]): break
        idx = next((i for i, t in enumerate(c['texts'][n0:]) if '[Tu as le résultat de ton outil' in t), None)
        dt = (c['tt'][n0 + idx] - t0) if idx is not None else 99
        check('… pas de relance pendant que Timothée parle encore (1,5 s après sa dernière parole)', 3.8 <= dt <= 6.5, f'{dt:.1f} s')

        # rappel dicté sur le téléphone : plus de « la tablette doit rester allumée »
        import datetime
        quand = (datetime.datetime.now() + datetime.timedelta(days=1)).strftime('%Y-%m-%dT18:00')
        c['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': 'fc_4', 'name': 'rappel', 'args': {'action': 'ajouter', 'quand': quand, 'texte': 'cadeau de Louis'}}]}}))
        c['ws'].send(json.dumps({'serverContent': {'turnComplete': True}}))
        await page.wait_for_timeout(600)
        res = [r for r in c['tools'] if r.get('id') == 'fc_4']
        check('Rappel dicté sur le téléphone : « il sonnera sur ce téléphone » (plus « la tablette doit rester allumée »)', res and 'sur ce téléphone' in res[-1]['response']['result'] and 'tablette' not in res[-1]['response']['result'], str(res)[:200])
        await page.wait_for_timeout(3500)

        # ---------- 3. Google attend encore la fin de la phrase ----------
        await page.wait_for_timeout(500)
        n0 = len(c['texts']); t0 = time.monotonic()
        await page.evaluate("wilson.audio.lastVoicedAt = 0; wilson.audio.speaking = false; wilson.brain._emit('heard', 'Déjà quand tu auras fait tout ça, ce sera bien.')")
        for _ in range(80):
            await page.wait_for_timeout(100)
            if any('[Il a fini sa phrase' in t for t in c['texts'][n0:]): break
        idx = next((i for i, t in enumerate(c['texts'][n0:]) if '[Il a fini sa phrase' in t), None)
        dt = (c['tt'][n0 + idx] - t0) if idx is not None else 99
        check('Voiture : phrase transcrite, plus un mot depuis 5 s, pas de réponse → « réponds-lui » (44,9 s ce matin)', 4.8 <= dt <= 6.5 and has('Google attend encore la fin de ta phrase'), f'{dt:.1f} s')
        await page.wait_for_timeout(6000)
        check('… une seule fois pour la même phrase', len([t for t in c['texts'][n0:] if '[Il a fini sa phrase' in t]) == 1)
        # une vraie réponse arrive : rien de plus
        c['ws'].send(json.dumps({'serverContent': {'turnComplete': True}}))
        await page.wait_for_timeout(300)
        n0 = len(c['texts'])
        await page.evaluate("wilson.audio.lastVoicedAt = 0; window.__parle(7000); wilson.brain._emit('heard', 'et puis aussi')")
        await page.wait_for_timeout(6000)
        check('… pas pendant qu\'il parle encore (le micro entend sa voix)', not any('[Il a fini sa phrase' in t for t in c['texts'][n0:]))
        await page.wait_for_timeout(1200)
        await page.evaluate("wilson.endConversation('test')"); await page.wait_for_function("wilson.state === 'veille'", timeout=8000)

        # ---------- 4. Objectif des clients actifs ----------
        await page.evaluate("wilson.settings.objectifActifs = 0")
        ctx1 = await page.evaluate("wilson._contexteObjectif('OBJECTIF CLIENTS ACTIFS 50')")
        o1 = await page.evaluate('wilson.settings.objectifActifs')
        await page.evaluate("wilson._contexteObjectif(\"l'objectif de clients actifs c'est au moins celui de N - 1\")")
        o2 = await page.evaluate('wilson.settings.objectifActifs')
        check('« OBJECTIF CLIENTS ACTIFS 50 » : objectif retenu (09h36:55 : jamais retenu)', o1 == 50 and has('Objectif de clients actifs retenu : 50'), str(o1))
        check('« … au moins celui de N - 1 » : « 1 » n\'est pas pris pour un objectif', o2 == 50, str(o2))
        cons = await page.evaluate("import('./js/analyste.js').then(({ consigneAnalyste }) => consigneAnalyste('S'))")
        check('Règle « au moins N-1 » donnée à l\'analyste (question et consigne)', 'N-1' in ctx1 and 'plus grand des deux' in ctx1 and 'même mois l\'an dernier (N-1)' in cons, ctx1[:200])

        # ---------- 5. Analyste : requête qui traîne → modèle suivant ----------
        async def ana(route):
            url = route.request.url
            if 'gemini-3.8-flash' in url:
                await asyncio.sleep(20); return
            try: await route.fulfill(status=200, content_type='application/json', body=gemini_json({'action': 'repondre', 'reponse': 'Tu as 19 clients actifs.'}))
            except Exception: pass
        await page.route(GL, ana)
        A = await page.evaluate("""import('./js/analyste.js').then(async ({ Analyste }) => {
          localStorage.removeItem('wilson.analyste.refus'); localStorage.removeItem('wilson.analyste.schema');
          const L = []; const a = new Analyste({ ask: async (p) => ({ ok: true, texte: p.action === 'crm_schema' ? 'Tables : commandes' : 'rien' }), log: (m) => L.push(m) });
          a.requeteMaxMs = 1500; const t0 = Date.now();
          const r = await a.repondre({ key: 'AIzaTESTTESTTESTTESTTESTTESTTEST', question: 'Combien de clients actifs ?' });
          return { r, L, ms: Date.now() - t0 };
        })""")
        check('Analyste : modèle sans réponse abandonné au bout du délai, le suivant répond (187 s ce matin)',
              A['r']['reponse'] == 'Tu as 19 clients actifs.' and A['r']['model'] != 'gemini-3.8-flash' and A['ms'] < 5000 and any('sans réponse' in x for x in A['L']), json.dumps(A)[:300])
        await page.unroute(GL)

        # ---------- 6. Journée préparée en montant dans la voiture ----------
        await page.evaluate("window.__pref = 0; wilson.crm.prefetch = () => { window.__pref++; }; wilson._voitureBtVu = false")
        await page.wait_for_timeout(800)
        check('Téléphone relié à la voiture : journée préparée (fiches du jour gardées)', await page.evaluate('window.__pref') == 1)

        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")

asyncio.run(main())
