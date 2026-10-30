"""Voir ce qu'il fait, savoir à qui on parle (PLAN 7 ter, E1 à E3), à la maison, Gemini simulé :
- E1 : pastille « Grande lumière salon : j'allume… » puis ✓ verte (ou ✗ rouge) ;
- E2 : regardé, « Louis, viens manger » ne déclenche plus de relance ; une vraie demande restée sans réponse, si ;
  plusieurs visages : pas de relance ; consigne « tais-toi si la phrase commence par le prénom de quelqu'un d'autre » ;
- E3 : du canapé (sans regard), « Wilson » reconnu par l'oreille → discussion ouverte, réponse retenue jusqu'à la
  transcription du prénom, pas de veille faute de regard ; en veille faute de regard, « Wilson » reprend la discussion."""
import asyncio, re, json, os, time
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, '' if ok else detail, flush=True)
FAKE_TTS = open(os.path.join(S, 'e2e_eco.py'), encoding='utf-8').read().split('FAKE_TTS = """')[1].split('"""')[0]
GAZE = """window.__look = false; window.__faces = 1;
setInterval(() => { const v = window.wilson && wilson.vision; if (!v) return;
  if (!v.__fake) { v.__fake = true; try { v.worker && v.worker.terminate(); } catch (_) {} v.worker = { postMessage() {}, terminate() {} }; v._startWorker = () => {}; }
  v.gazeReady = true; v.modelsDone = true; v._lastResult = performance.now(); v.looking = !!window.__look; if (window.__look) v.lookAt = performance.now(); v.faceAt = performance.now(); v.hasPerson = true; v.faces = window.__faces; }, 30);"""
HA = 'https://homeassistant.exemple.ts.net'


async def main():
    conns = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
        def handler(ws):
            conn = {'setup': None, 'texts': [], 'tool': [], 'audio': 0}; conns.append(conn)
            def on_msg(m):
                d = json.loads(m)
                if 'setup' in d: conn['setup'] = d['setup']; ws.send(json.dumps({'setupComplete': {}}))
                elif 'realtimeInput' in d:
                    if 'text' in d['realtimeInput']: conn['texts'].append(d['realtimeInput']['text'])
                    if 'audio' in d['realtimeInput']: conn['audio'] += 1
                elif 'toolResponse' in d: conn['tool'].append(d['toolResponse'])
            ws.on_message(on_msg)
        async def ha(route):
            req = route.request; H = {'access-control-allow-origin': 'http://127.0.0.1:8765', 'access-control-allow-headers': 'authorization, content-type'}
            if req.method == 'OPTIONS': await route.fulfill(status=200, headers=H, body=''); return
            u = req.url
            if u.endswith('/api/template'): await route.fulfill(status=200, headers=H, body='light.grande_lumiere_salon|Salon|False|False\n'); return
            body = [{'entity_id': 'light.grande_lumiere_salon', 'state': 'on', 'attributes': {'friendly_name': 'Grande lumière salon', 'supported_color_modes': ['onoff']}}] if u.endswith('/api/states') else []
            if '/api/services/' in u: await asyncio.sleep(0.6)
            await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(body))

        ctx = await b.new_context(viewport={'width': 800, 'height': 1000}, permissions=['microphone', 'camera'], service_workers='block')
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify(%s));" % json.dumps(
            {'apiKey': 'AIzaTESTTESTTESTTESTTESTTESTTEST', 'listenMode': 'regard', 'convTimeout': 12, 'voitureAuto': False, 'home': 'Timothée, sa femme Julie et Louis', 'haUrl': HA, 'haToken': 'jeton', 'v': 3}))
        await ctx.add_init_script(FAKE_TTS); await ctx.add_init_script(GAZE)
        page = await ctx.new_page(); logs = []
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
        await page.route(re.compile(r'https://homeassistant\.exemple\.ts\.net/.*'), ha)
        await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)
        page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && wilson.state === "veille" && wilson.vision && wilson.vision.__fake', timeout=20000)
        has = lambda t: any(t in l for l in logs)

        # E1 : pastille
        await page.evaluate("window.__look = true"); await page.evaluate("wilson.startConversation('toucher')")
        await page.wait_for_function('wilson.brain.open', timeout=8000); c = conns[-1]
        sysp = c['setup']['systemInstruction']['parts'][0]['text']
        check('E2 consigne : se taire si la phrase commence par le prénom de quelqu\'un d\'autre', '« Louis, viens manger »' in sysp and 'tais-toi complètement' in sysp)
        await page.wait_for_function('wilson.maison.inv', timeout=6000)
        await page.evaluate("wilson._tools([{ id: 'p1', name: 'maison_commande', args: { appareil: 'light.grande_lumiere_salon', action: 'allumer' } }])")
        await page.wait_for_timeout(150)
        pill = await page.evaluate("[$('pill').hidden, $('pill').className, $('pill').textContent]".replace('$(', 'document.getElementById('))
        check('E1 : pendant l\'action, pastille « Grande lumière salon : j\'allume… » (sablier)', not pill[0] and 'run' in pill[1] and "Grande lumière salon : j'allume…" in pill[2], str(pill))
        check('… visage en réflexion', await page.evaluate("wilson.face.emotion === 'reflexion'"))
        await page.wait_for_timeout(2000)
        pill = await page.evaluate("[document.getElementById('pill').hidden, document.getElementById('pill').className, document.getElementById('pill').textContent]")
        check('… puis ✓ verte avec le résultat', not pill[0] and 'ok' in pill[1] and 'Grande lumière salon' in pill[2], str(pill))
        await page.evaluate("wilson._tools([{ id: 'p2', name: 'maison_commande', args: { appareil: 'frigo', action: 'allumer' } }])"); await page.wait_for_timeout(600)
        pill = await page.evaluate("[document.getElementById('pill').className, document.getElementById('pill').textContent]")
        check('… et ✗ rouge si ça n\'a pas marché', 'ko' in pill[0] and 'introuvable' in pill[1], str(pill))

        # E2 : relance seulement pour une vraie demande
        n0 = len(c['texts'])
        await page.evaluate("wilson.brain._emit('turn', { user: 'Louis, viens manger, c\\'est prêt.', wilson: '' })"); await page.wait_for_timeout(200)
        check('E2 : « Louis, viens manger » regardé : pas de relance', len(c['texts']) == n0 and has('pas une demande pour lui'), str(c['texts'][n0:]))
        await page.evaluate("wilson.brain._emit('turn', { user: 'Allez loulou, tu viens ?', wilson: '' })"); await page.wait_for_timeout(200)
        check('… « Allez loulou, tu viens ? » non plus', len(c['texts']) == n0)
        await page.evaluate("wilson.brain._emit('turn', { user: 'Il fait froid ce soir.', wilson: '' })"); await page.wait_for_timeout(200)
        check('… une remarque en l\'air non plus', len(c['texts']) == n0)
        await page.evaluate("wilson.brain._emit('turn', { user: 'Quelle heure est-il ?', wilson: '' })"); await page.wait_for_timeout(200)
        check('… une vraie question restée sans réponse : relance', len(c['texts']) == n0 + 1 and 'On te parlait' in c['texts'][-1], str(c['texts'][n0:]))
        await page.evaluate("wilson.brain._emit('turn', { user: 'Hier, tu m\\'as dit que tu regardais Kevin dans le CRM, c\\'est un bug.', wilson: '' })"); await page.wait_for_timeout(200)
        check('… « Hier, tu m\'as dit… » (Hier n\'est pas un prénom) : relance', len(c['texts']) == n0 + 2, str(c['texts'][n0:]))
        await page.evaluate("window.__faces = 2"); await page.wait_for_timeout(100); n1 = len(c['texts'])
        await page.evaluate("wilson.brain._emit('turn', { user: 'Tu peux allumer la télé ?', wilson: '' })"); await page.wait_for_timeout(200)
        check('… plusieurs visages devant la tablette : pas de relance', len(c['texts']) == n1 and has('plusieurs personnes devant lui'), str(c['texts'][n1:]))
        # Garde-fou : outil appelé à partir d'une phrase sans rapport (journal du 30/10/26)
        await page.evaluate("window.__faces = 1; wilson._noteHeard('avec le siège pupitre, tu sais', true)")
        nt = len(c['tool'])
        await page.evaluate("wilson._tools([{ id: 'g1', name: 'regarder', args: { quoi: 'le siège pupitre' } }, { id: 'g2', name: 'crm_client', args: { client: 'Kevin' } }])"); await page.wait_for_timeout(300)
        resp = json.dumps(c['tool'][nt:], ensure_ascii=False)
        check('Garde-fou : « avec le siège pupitre » → ni photo ni fiche « Kevin », il se tait', '"g1"' in resp and '"g2"' in resp and 'Ne fais rien et ne dis rien' in resp and not has('Photo prise') and not has('CRM (direct) : crm_client'), resp[:300])
        await page.evaluate("wilson._noteHeard('Qu\\'est-ce que j\\'ai dans ma main Wilson ?', true)"); nt = len(c['tool'])
        await page.evaluate("wilson._tools([{ id: 'g2b', name: 'regarder', args: {} }])"); await page.wait_for_timeout(300)
        check('… « Qu\'est-ce que j\'ai dans ma main ? » → la photo est bien prise (journal 9h48)', 'Ne fais rien' not in json.dumps(c['tool'][nt:], ensure_ascii=False))
        await page.evaluate("wilson._noteHeard('Regarde ce que je tiens', true)"); nt = len(c['tool'])
        await page.evaluate("wilson._tools([{ id: 'g3', name: 'regarder', args: {} }])"); await page.wait_for_timeout(300)
        check('… « Regarde ce que je tiens » → la photo est bien prise', 'Ne fais rien' not in json.dumps(c['tool'][nt:], ensure_ascii=False))
        await page.evaluate("wilson.endConversation('test')"); await page.wait_for_timeout(300)

        # E3 : du canapé
        await page.evaluate("window.__look = false; wilson.oreille.templates = [[], [], []]; wilson.oreille.seuil = 1"); await page.wait_for_timeout(1800)
        check('E3 : oreille prête et personne ne le regarde', await page.evaluate("wilson.oreille.ready && !wilson._gazing() && wilson.state === 'veille'"))
        await page.evaluate("window.__nom = false; window.__dem = 'allume la lumière jaune'; wilson.eco.appelDeLoin = async () => ({ appel: window.__nom, demande: window.__dem, texte: (window.__nom ? 'Wilson, ' : '') + window.__dem }); wilson.eco.nomDit = async () => window.__nom")
        await page.evaluate("wilson.oreille.onDetect({ score: 1.2, limite: 2 })"); await page.wait_for_timeout(1200)
        check('E3 corrigé : l\'oreille propose, Gemini dit « non » (télé, famille) → aucun réveil', await page.evaluate("wilson.state === 'veille'") and has('» → non'))
        await page.evaluate("wilson.oreille.onDetect({ score: 1.2, limite: 2 })"); await page.wait_for_timeout(300)
        check('… et pendant 3 s après un « non », les faux candidats suivants ne coûtent rien', len([l for l in logs if '» → non' in l]) == 1)
        await page.evaluate("window.__nom = true; wilson._nomCalme = 0; wilson.oreille.onDetect({ score: 1.2, limite: 2 })")
        await page.wait_for_function("wilson.state === 'conversation' && wilson.brain.open", timeout=8000); c = conns[-1]
        check('« Wilson » confirmé par Gemini : discussion ouverte sans le regarder, sans verrou de transcription', await page.evaluate("wilson._byName && !wilson._gate && wilson._addressed()") and has('→ oui, « Wilson »'))
        await page.wait_for_timeout(300)
        check('… la demande comprise de loin est transmise en texte (« allume la lumière jaune »), pas besoin de répéter', any('de loin' in t and 'allume la lumière jaune' in t for t in c['texts']), str(c['texts']))
        check('… pendant la discussion (regardée ou non), l\'oreille se tait : le direct entend déjà tout', await page.evaluate("(() => { let n = 0; const f = wilson.oreille.feed; wilson.oreille.feed = () => n++; wilson.audio._emit('frame', new Float32Array(320), new Int16Array(320), -40); wilson.oreille.feed = f; return n === 0; })()"))
        await page.wait_for_timeout(4200)
        check('… pas de veille faute de regard (4 s sans regard)', await page.evaluate("!wilson.paused && wilson.state === 'conversation'"))
        await page.evaluate("wilson.endConversation('test')"); await page.wait_for_timeout(300)
        # en veille faute de regard pendant une discussion au regard
        await page.evaluate("window.__look = true; wilson.startConversation('toucher')"); await page.wait_for_function('wilson.brain.open', timeout=8000)
        await page.evaluate("window.__look = false"); await page.wait_for_function('wilson.paused', timeout=6000)
        await page.evaluate("window.__dem = ''; wilson.oreille.onDetect({ score: 1.2, limite: 2 })"); await page.wait_for_timeout(1500)
        check('En veille faute de regard, « Wilson » reprend la discussion (sans le regarder)', await page.evaluate("!wilson.paused && wilson._byName && wilson.state === 'conversation'") and has('→ oui, « Wilson »'))
        check('Aucune erreur JavaScript', not any(l.startswith('PAGEERROR') for l in logs), str([l for l in logs if l.startswith('PAGEERROR')]))
        await ctx.close(); await b.close()
    print(f'\n{sum(results)}/{len(results)} OK'); raise SystemExit(0 if all(results) else 1)

asyncio.run(main())
