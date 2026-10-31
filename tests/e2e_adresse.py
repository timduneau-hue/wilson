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
        check('Fin de discussion seulement sur un vrai au revoir, jamais sur un reproche (journal 30/10/26, 11h21)', 'Jamais sur un reproche' in sysp and any('Jamais sur un reproche' in json.dumps(t, ensure_ascii=False) for t in [c['setup']]))
        check('Consigne « remarque » : noter ce qu\'on lui reproche pour sa prochaine mise à jour', 'appelle remarque' in sysp)
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

        # Maintenance de nuit du 31/10/26 (journal du 30/10/26, 22h44) : « c'est noté pour ma mise à jour » sans l'outil remarque
        check('Consigne : jamais « c\'est noté » sans remarque, ni d\'explication inventée sur son visage', 'sans avoir appelé remarque' in sysp and "N'invente jamais d'explication" in sysp)
        await page.evaluate("wilson.brain._emit('turn', { user: 'Wilson, c\\'est bizarre, je vois plus tes pupilles.', wilson: '' })")
        await page.evaluate("wilson.brain._emit('turn', { user: 'Pour les mises à jour de ce soir, tu intègres cette information.', wilson: 'C\\'est noté, je prends cela en compte pour ma prochaine mise à jour.' })"); await page.wait_for_timeout(200)
        rq = [l for l in logs if 'REMARQUE DE TIMOTHÉE' in l]
        check('… il dit « c\'est noté » sans appeler remarque : l\'appli la note elle-même, avec ce qu\'il venait d\'entendre', len(rq) == 1 and 'pupilles' in rq[0] and 'notée par l' in rq[0], str(rq))
        await page.evaluate("wilson.brain._emit('turn', { user: 'Merci.', wilson: 'C\\'est noté pour ma mise à jour.' })"); await page.wait_for_timeout(200)
        check('… pas deux fois de suite pour la même remarque', len([l for l in logs if 'REMARQUE DE TIMOTHÉE' in l]) == 1)
        await page.evaluate("wilson._remarqueAt = 0; wilson._tools([{ id: 'rq1', name: 'remarque', args: { texte: 'Les yeux sont tout blancs.' } }])"); await page.wait_for_timeout(300)
        await page.evaluate("wilson.brain._emit('turn', { user: '', wilson: 'C\\'est noté pour ma prochaine mise à jour.' })"); await page.wait_for_timeout(200)
        check('… et rien en double quand il a bien appelé remarque', len([l for l in logs if 'REMARQUE DE TIMOTHÉE' in l]) == 2)
        # Journal du 30/10/26, 22h39 : réponse en anglais → redite en français
        check('Consigne : jamais en anglais, même si la phrase entendue est dans une autre langue', 'jamais en anglais' in sysp)
        na = len(c['texts'])
        await page.evaluate("wilson.brain._emit('turn', { user: 'c\\'est ta chance', wilson: 'To hear your thoughts on something specific, just let me know.' })"); await page.wait_for_timeout(200)
        check('Réponse en anglais (« To hear your thoughts… ») : il la redit en français', len(c['texts']) == na + 1 and 'Redis-le maintenant en français' in c['texts'][-1] and has('répondu en anglais'), str(c['texts'][na:]))
        await page.evaluate("wilson._anglaisAt = 0; wilson.brain._emit('turn', { user: 'Tu me reçois ?', wilson: 'Oui, je te reçois très bien, OK, je suis là pour toi.' })")
        await page.evaluate("wilson._anglaisAt = 0; wilson.brain._emit('turn', { user: 'Mets Netflix', wilson: 'Voilà, Netflix est lancé sur la TV du salon.' })"); await page.wait_for_timeout(200)
        check('… une réponse française (même avec « OK », « Netflix », « TV ») ne déclenche rien', len(c['texts']) == na + 1, str(c['texts'][na:]))
        await page.evaluate("wilson.playEndAt = 0; wilson._nudgedFor = null")

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
        # Journal du 30/10/26, 11h26 : Wilson pose une question, « Oui, il va faire chaud. » était bloqué
        await page.evaluate("wilson.playEndAt = performance.now() - 3000; wilson._nudgedFor = null"); n2 = len(c['texts'])
        await page.evaluate("wilson.brain._emit('turn', { user: 'Oui, il va faire chaud.', wilson: '' })"); await page.wait_for_timeout(200)
        check('Juste après sa réponse, « Oui, il va faire chaud. » est pour lui : relance', len(c['texts']) == n2 + 1 and has('juste après sa réponse'), str(c['texts'][n2:]))
        await page.evaluate("wilson.brain._emit('turn', { user: 'Louis, range ta chambre.', wilson: '' })"); await page.wait_for_timeout(200)
        check('… sauf si la phrase commence par le prénom de quelqu\'un d\'autre', len(c['texts']) == n2 + 1, str(c['texts'][n2:]))
        await page.evaluate("wilson.playEndAt = performance.now() - 60000")
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
        # Journal du 30/10/26, 23h06-23h21 : ouverte par le prénom pendant une soirée, restée ouverte 15 min (voix autour)
        await page.evaluate("const t = performance.now() - 50000; wilson.playEndAt = wilson._convAt = t; wilson._prenomAt = wilson._resumedAt = -1e9; window.__bavard = setInterval(() => { wilson.lastUserSpeech = wilson.lastActivity = performance.now(); }, 50)")
        await page.wait_for_timeout(600)
        check('… mais 45 s sans qu\'il parle ni qu\'on le rappelle (on parle autour) : veille', await page.evaluate("clearInterval(window.__bavard), wilson.state !== 'conversation'") and has('personne ne lui parle'))
        await page.evaluate("window.__nom = true; wilson._nomCalme = 0; wilson._nomJetons = null; wilson.oreille.onDetect({ score: 1.2, limite: 2 })")
        await page.wait_for_function("wilson.state === 'conversation' && wilson.brain.open", timeout=8000); c = conns[-1]
        await page.evaluate("wilson.endConversation('test')"); await page.wait_for_timeout(300)
        # en veille faute de regard pendant une discussion au regard
        await page.evaluate("window.__look = true; wilson.startConversation('toucher')"); await page.wait_for_function('wilson.brain.open', timeout=8000)
        await page.evaluate("window.__look = false"); await page.wait_for_function('wilson.paused', timeout=6000)
        await page.evaluate("window.__dem = ''; wilson.oreille.onDetect({ score: 1.2, limite: 2 })"); await page.wait_for_timeout(1500)
        check('En veille faute de regard, « Wilson » reprend la discussion (sans le regarder)', await page.evaluate("!wilson.paused && wilson._byName && wilson.state === 'conversation'") and has('→ oui, « Wilson »'))
        # Journal du 30/10/26, 11h34-11h48 : « Wilson » entendu dans le bruit et dans la télé
        J = await page.evaluate("""import('./js/eco.js').then(({ prenomDans, jugerAppel }) => {
          const tv = 'Wilson, est-ce que tu peux l\\'éteindre ? Hélas, pas de voix de fond, nous avons échoué. Vous pensez que ça justifie le fa';
          return [jugerAppel(prenomDans(tv), { nom_sur: false, tele: false }).appel, jugerAppel(prenomDans(tv), { nom_sur: true, tele: true }).appel,
            jugerAppel(prenomDans('Wilson'), { nom_sur: false, tele: false }).appel, jugerAppel(prenomDans('Wilson'), { nom_sur: true, tele: false }).appel,
            jugerAppel(prenomDans('Wilson, allume la lumière jaune.'), { nom_sur: true, tele: false }), jugerAppel(prenomDans('il est quelle heure, où il sonne ?'), { nom_sur: false, tele: false })];
        })""")
        L = await page.evaluate("""import('./js/eco.js').then(({ lireAppel }) => [lireAppel('Here is the JSON requested:'),
          lireAppel('Here is the JSON requested: {"texte": "Wilson, allume la lumière", "nom_sur": true, "tele": false}'), lireAppel('{"texte": "Wilson, quelle heure est-')])""")
        check('Journal 22h50 : « Here is the JSON requested: » n\'est pas pris pour ce qu\'on a dit ; JSON après une phrase ou coupé : lu', L[0]['texte'] == '' and L[1]['texte'] == 'Wilson, allume la lumière' and L[1]['nom_sur'] is True and L[2]['texte'].startswith('Wilson, quelle heure'), str(L))
        check('Journal 11h48 : « Wilson, tu peux l\'éteindre ? Hélas, pas de voix de fond… » (télé, ou pas sûr et trop long) → pas d\'appel', J[0] is False and J[1] is False, str(J[:2]))
        check('Journal 11h34-11h47 : « Wilson » tout seul, pas sûr → pas d\'appel ; sûr → appel', J[2] is False and J[3] is True, str(J[2:4]))
        check('… une vraie demande nette passe sans doute ; une demande pas sûre passe mais « avec doute » (confirmation avant d\'agir)', J[4]['appel'] and not J[4]['doute'] and J[5]['appel'] and J[5]['doute'], str(J[4:]))
        await page.evaluate("wilson.endConversation('test')"); await page.wait_for_timeout(400); c = conns[-1] if conns else c
        await page.evaluate("window.__nom = true; window.__dem = ''; wilson._nomCalme = 0; wilson._nomJetons = null; wilson.oreille.onDetect({ score: 1.2, limite: 2 })")
        await page.wait_for_function("wilson.state === 'conversation' && wilson.brain.open", timeout=8000); c = conns[-1]; await page.wait_for_timeout(400)
        check('« Wilson » tout seul : il ne dit plus « Oui ? » (rien envoyé), petite note et « Je t\'écoute… »', not any('Oui ?' in t for t in c['texts']) and has('j\'écoute sans rien dire') and 'écoute' in (await page.evaluate("document.getElementById('pill').textContent")), str(c['texts']))
        await page.wait_for_timeout(8200)
        check('… personne ne parle dans les 8 s : il se rendort sans un mot', await page.evaluate("wilson.state === 'veille'") and has('je me rendors sans rien dire'))
        # Journal du 30/10/26, 22h56-22h58 : 12 essais en 90 s malgré « retry in 52s »
        await page.evaluate("window.__n429 = 0; wilson.eco.appelDeLoin = async () => { window.__n429++; throw new Error('Quota exceeded for metric: generate_content_free_tier_requests, limit: 5 (retry in 52s)'); }; wilson._nomCalme = 0; wilson._nomJetons = null; wilson.oreille.onDetect({ score: 1.2, limite: 2 })")
        await page.wait_for_timeout(1500)
        await page.evaluate("wilson.oreille.onDetect({ score: 1.2, limite: 2 })"); await page.wait_for_timeout(1500)
        calme = await page.evaluate("[window.__n429, Math.round((wilson._nomCalme - Date.now()) / 1000)]")
        check('Quota Google (« retry in 52s ») : l\'oreille attend 52 s avant de revérifier', calme[0] == 1 and 45 <= calme[1] <= 52 and has('prochaine vérification dans 52 s'), str(calme))
        check('Consigne de loin : demande vague (« l\'éteindre ») ou mêlée à d\'autres phrases → il demande avant d\'agir', await page.evaluate("wilson._texteDeLoin('est-ce que tu peux l\\'éteindre ?', true).includes('demande d\\'abord de quoi il s\\'agit')"))
        check('Aucune erreur JavaScript', not any(l.startswith('PAGEERROR') for l in logs), str([l for l in logs if l.startswith('PAGEERROR')]))
        await ctx.close(); await b.close()
    print(f'\n{sum(results)}/{len(results)} OK'); raise SystemExit(0 if all(results) else 1)

asyncio.run(main())
