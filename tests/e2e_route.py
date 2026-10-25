"""Sur la route (PLAN 2 quater, C8 à C10 ; demande de Timothée du 25/10/26) sur un « téléphone » simulé :
- réseau coupé pendant une discussion : il le dit (voix du téléphone), garde la discussion et la phrase dite pendant la coupure,
  reprend la même session au retour du réseau ; réseau bloqué (rien ne part) traité pareil ; abandon au bout du délai ;
  réveillé sans réseau : il répond au retour du réseau ;
- appel téléphonique (le téléphone prend le micro : silence numérique) : il se tait, aucun « oui » ne compte, puis il reprend ;
- écriture confirmée sans réseau : gardée et envoyée seule au retour ; sans réponse à temps : incertaine, pas renvoyée ;
- nom de client approximatif : il doit citer le client trouvé ; plus de « ça a bougé » sur un téléphone ;
  pas de relance pendant qu'un outil travaille (journal du 25/10/26)."""
import asyncio, re, json, os, time, base64
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, '' if ok else detail, flush=True)

URL = 'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTESTTESTTEST/exec'
UA = 'Mozilla/5.0 (Linux; Android 15; SM-A266B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
FAKE_TTS = open(os.path.join(S, 'e2e_eco.py'), encoding='utf-8').read().split('FAKE_TTS = """')[1].split('"""')[0]
GAZE = """window.__look = true;
setInterval(() => { const v = window.wilson && wilson.vision; if (!v) return;
  if (!v.__fake) { v.__fake = true; try { v.worker && v.worker.terminate(); } catch (_) {} v.worker = { postMessage() {}, terminate() {} }; v._startWorker = () => {}; }
  v.gazeReady = true; v.modelsDone = true; v._lastResult = performance.now(); v.looking = !!window.__look; if (window.__look) v.lookAt = performance.now(); v.faceAt = performance.now(); v.hasPerson = true; }, 30);"""
CLE = json.dumps(['M MONVOISIN Franck', 'AD2M'], ensure_ascii=False)


async def main():
    conns, st = [], {'down': False, 'calls': [], 'writes': [], 'slow': 0}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])

        def handler(ws):
            conn = {'ws': ws, 'setup': None, 'texts': [], 'audio': [], 'at': 0}; conns.append(conn)
            def on_msg(m):
                d = json.loads(m)
                if 'setup' in d:
                    conn['setup'] = d['setup']
                    if st['down']: asyncio.ensure_future(ws.close(code=1011, reason='')); return
                    conn['at'] = time.time()
                    ws.send(json.dumps({'setupComplete': {}}))
                    ws.send(json.dumps({'sessionResumptionUpdate': {'resumable': True, 'newHandle': 'poignee-%d' % len(conns)}}))
                elif 'realtimeInput' in d:
                    ri = d['realtimeInput']
                    if 'text' in ri: conn['texts'].append(ri['text'])
                    if 'audio' in ri: conn['audio'].append((time.time(), len(base64.b64decode(ri['audio']['data']))))
            ws.on_message(on_msg)

        async def script(route):
            req = route.request; H = {'access-control-allow-origin': '*'}
            if req.method != 'POST': await route.fulfill(status=200, body='ok'); return
            if st['down']: await route.abort('internetdisconnected'); return
            d = json.loads(req.post_data or '{}'); a = d.get('action', '')
            if not a.startswith('crm_'):
                if a == 'reglages_lire': await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'ok': True, 'reglages': None, 't': 0})); return
                await route.fulfill(status=200, headers=H, body='ok'); return
            st['calls'].append(d)
            if st['slow']: await asyncio.sleep(st['slow'])
            if a == 'crm_client':
                body = {'ok': True, 'cle': CLE, 'societe': 'AD2M', 'contact': 'M MONVOISIN Franck', 'ville': 'Nantes', 'texte': 'Client : AD2M, Nantes\nDernière commande : 14/09/26, 2 860 €.',
                        'contacts': [{'nom': 'M MONVOISIN Franck', 'tel': '06 11 22 33 44', 'cle': CLE}]}
            elif a == 'crm_journee': body = {'ok': True, 'jour': '?', 'rdv': [], 'texte': "Aujourd'hui : aucun rendez-vous."}
            elif a == 'crm_etat': body = {'ok': True}
            elif a in ('crm_tache', 'crm_brouillon'): st['writes'].append(d); body = {'ok': True}
            else: body = {'ok': True, 'texte': ''}
            try: await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(body, ensure_ascii=False))
            except Exception: pass

        ctx = await b.new_context(viewport={'width': 412, 'height': 860}, user_agent=UA, is_mobile=True, has_touch=True,
                                  permissions=['microphone', 'camera'], service_workers='block')
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify(%s));" % json.dumps(
            {'apiKey': 'AIzaTESTTESTTESTTESTTESTTESTTEST', 'listenMode': 'regard', 'convTimeout': 12, 'voitureAuto': False, 'crm': True, 'logUrl': URL, 'v': 3}))
        await ctx.add_init_script(FAKE_TTS); await ctx.add_init_script(GAZE)
        page = await ctx.new_page(); logs = []
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
        await page.route(re.compile(r'https://script\.google\.com/.*'), script)
        await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)
        page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && wilson.state === "veille" && wilson.vision && wilson.vision.__fake', timeout=20000)
        has = lambda txt: any(txt in l for l in logs)
        spoken = lambda: page.evaluate('window.__spoken.slice()')

        # 0. Journal du 25/10 : plus de « ça a bougé » sur un téléphone ; pas de relance quand le tour a appelé un outil
        await page.evaluate("wilson.startConversation('toucher')")
        await page.wait_for_function('wilson.state === "conversation" && wilson.brain.open', timeout=8000)
        c0 = conns[-1]
        await page.evaluate("wilson.sensors._emit('shake', 9)"); await page.wait_for_timeout(200)
        check('Téléphone secoué : rien n\'est dit à Gemini (plus de « Oulà, ça a bougé »)', not any('secouée' in t for t in c0['texts']), str(c0['texts']))
        await page.evaluate("wilson._tools([{ id: 't1', name: 'date_et_heure', args: {} }]); wilson.brain._emit('turn', { user: 'Fais-moi un petit compte rendu du client AD2M', wilson: '' })")
        await page.wait_for_timeout(200)
        check('Tour qui a appelé un outil : pas de relance (elle arrivait pendant le CRM)', not has('relance'))
        await page.evaluate("wilson.brain._emit('turn', { user: 'Quelle heure est-il maintenant ?', wilson: '' })"); await page.wait_for_timeout(200)
        check('… mais une vraie phrase restée sans réponse est toujours relancée', has('relance'))
        await page.evaluate("wilson.endConversation('test')")

        # 1. Voiture : discussion en direct
        await page.evaluate("wilson.enterCar('bouton')")
        await page.evaluate("wilson.startConversation('toucher')")
        await page.wait_for_function('wilson.state === "conversation" && wilson.brain.open', timeout=8000)
        sysp = conns[-1]['setup']['systemInstruction']['parts'][0]['text']
        check('Consigne voiture : son mauvais → reformuler et faire confirmer ; se taire au téléphone', 'demande s\'il confirme' in sysp and 'Bluetooth' in sysp and 'au téléphone' in sysp)
        check('Consigne CRM : nom, chiffre ou date douteux → vérifier ; ne rien reconstituer', 'te semble douteux' in sysp and 'au lieu de le reconstituer' in sysp)
        await page.wait_for_timeout(400)

        # 1a. Réseau bloqué : le son du micro ne part plus (3 s)
        h1 = 'poignee-%d' % len(conns)
        await page.evaluate("Object.defineProperty(wilson.brain.ws, 'bufferedAmount', { get: () => 200000, configurable: true })")
        await page.wait_for_function("!!wilson.netWait", timeout=6000)
        check('Réseau bloqué (rien ne part depuis 3 s) : coupure détectée, discussion gardée', has('Réseau bloqué') and await page.evaluate("wilson.state === 'conversation'"))
        check('… il le dit avec la voix du téléphone (sans Internet)', any('plus de réseau' in s for s in await spoken()), str(await spoken()))
        nc = len(conns)
        await page.wait_for_function('!wilson.netWait && wilson.brain.open', timeout=8000)
        new = conns[nc:]
        check('… nouvel essai au bout de 2 s : même session reprise (même fil)', new and (new[-1]['setup'].get('sessionResumption') or {}).get('handle') == h1, str([c['setup'].get('sessionResumption') for c in new]))
        await page.wait_for_timeout(300)
        check('… « C\'est reparti » (rien n\'avait été dit pendant la coupure)', any('réseau vient de revenir' in t for t in conns[-1]['texts']) and has('Réseau revenu'), str(conns[-1]['texts']))

        # 1b. Téléphone hors ligne : la phrase dite pendant la coupure part au retour
        h2 = 'poignee-%d' % len(conns)
        n_spoken = len(await spoken())
        await page.evaluate("wilson._netToldAt = 0")                  # (coupure suivante plus d'une minute après : il la redit)
        st['down'] = True; await ctx.set_offline(True)
        await page.wait_for_function("!!wilson.netWait", timeout=4000)
        check('Hors ligne : discussion gardée (pas de fin de conversation)', await page.evaluate("wilson.state === 'conversation'") and has('Réseau coupé (hors ligne)'))
        await page.wait_for_function('!wilson.voice.speaking', timeout=8000); await page.wait_for_timeout(500)
        await page.evaluate("wilson.audio._emit('speechstart')"); await page.wait_for_timeout(1300); await page.evaluate("wilson.audio._emit('speechend')")
        check('Phrase dite pendant la coupure : gardée', has('Phrase gardée pendant la coupure'))
        await page.wait_for_timeout(4000)
        check('Pendant la coupure : rien de connecté, il ne répète pas son message', not await page.evaluate('wilson.brain.open') and len([s for s in (await spoken())[n_spoken:] if 'réseau' in s]) == 1, str((await spoken())[n_spoken:]))
        nc = len(conns)
        st['down'] = False; await ctx.set_offline(False)
        await page.wait_for_function('!wilson.netWait && wilson.brain.open', timeout=8000)
        await page.wait_for_timeout(700)
        c = conns[-1]; t0 = c['at']
        sent = sum(n for t, n in c['audio'] if t - t0 < 0.5)
        check('Réseau revenu : même session reprise tout de suite', (c['setup'].get('sessionResumption') or {}).get('handle') == h2 and len(conns) - nc <= 2, str(c['setup'].get('sessionResumption')))
        check('… et la phrase gardée est envoyée (il y répond)', sent > 40000 and not any('réseau vient de revenir' in t for t in c['texts']), f'{sent} octets dans la 1re demi-seconde')

        # 1c. Coupure qui dure : veille au bout du délai, il le dit
        st['down'] = True; await ctx.set_offline(True)
        await page.wait_for_function("!!wilson.netWait", timeout=4000)
        await page.evaluate("wilson.netWait.until = Date.now()")
        await page.wait_for_function("wilson.state === 'veille'", timeout=6000)
        check('Coupure trop longue : veille, et il le dit', has('Toujours pas de réseau après') and any('Toujours pas de réseau' in s for s in await spoken()))

        # 1d. Réveillé sans réseau (voiture) : « pas de réseau », puis réponse au retour avec la phrase du réveil
        await page.evaluate("wilson._wakePcm = new Int16Array(16000 * 2).map((_, i) => Math.round(Math.sin(i * 0.1) * 6000)); wilson.startConversation('prenom')")
        await page.wait_for_timeout(300)
        check('Réveillé sans réseau : « Pas de réseau pour l\'instant », la phrase est gardée', any('Pas de réseau pour l' in s for s in await spoken()) and await page.evaluate("!!(wilson.netWait && wilson.netWait.start && wilson.netWait.start.pcm)"))
        nc = len(conns)
        st['down'] = False; await ctx.set_offline(False)
        await page.wait_for_function("wilson.state === 'conversation' && wilson.brain.open && !wilson.netWait", timeout=8000)
        await page.wait_for_timeout(600)
        c = conns[-1]; sent = sum(n for t, n in c['audio'] if t - c['at'] < 0.5)
        check('… réseau revenu : la discussion commence avec la phrase du réveil', sent >= 64000 and has('la discussion commence'), f'{sent} octets')

        # 2. Appel téléphonique pendant la discussion (le téléphone prend le micro : silence numérique)
        await page.evaluate("""(() => { const a = wilson.audio; a.node.port.onmessage = (e) => a._onCapture(window.__zero ? new Float32Array(e.data.length) : e.data); })()""")
        await page.evaluate("wilson.crm.pending = { type: 'tache', texte: 'Rappeler AD2M', date: '30/10/2026', cle: '', relu: 'Tâche pour le vendredi 30/10/26 : « Rappeler AD2M ».', at: performance.now(), atMs: Date.now(), turn: wilson._turnN }")
        hc = 'poignee-%d' % len(conns)
        await page.evaluate("window.__zero = true")
        await page.wait_for_function("!!wilson.phone", timeout=4000)
        stc = await page.evaluate("({ s: wilson.state, play: wilson.audio.playing, tts: wilson.voice.speaking, g: wilson.crm.gate([{ t: performance.now() + 1, text: 'oui', n: wilson._turnN }]) })")
        check('Appel : micro pris par le téléphone → il se tait, discussion mise de côté', has('Micro pris par le téléphone') and stc['s'] == 'veille' and not stc['play'] and not stc['tts'], str(stc))
        check('… aucun « oui » ne confirme une écriture pendant l\'appel', not stc['g']['ok'] and 'appel' in stc['g']['why'], str(stc['g']))
        await page.evaluate("wilson.startConversation('prenom')"); await page.wait_for_timeout(300)
        check('… pas de réveil pendant l\'appel', await page.evaluate("wilson.state === 'veille'"))
        nc = len(conns)
        await page.wait_for_timeout(8600)
        await page.evaluate("window.__zero = false")
        await page.wait_for_function("wilson.state === 'conversation' && wilson.brain.open", timeout=8000)
        await page.wait_for_timeout(300)
        c = conns[-1]
        check('Fin de l\'appel : il reprend la même discussion (même session)', has("fin de l'appel") and (c['setup'].get('sessionResumption') or {}).get('handle') == hc, str(c['setup'].get('sessionResumption')))
        check('… « on reprend ? », et il relit l\'écriture en attente avant tout « oui »', any('le téléphone a pris le micro' in t and 'relis-la' in t for t in c['texts']), str(c['texts']))
        g = await page.evaluate("[wilson.crm.gate([{ t: 0, text: 'oui', n: wilson._turnN }]), wilson.crm.gate([{ t: performance.now() + 1, text: 'Oui, vas-y', n: wilson._turnN + 1 }])]")
        check('… un « oui » d\'avant la nouvelle relecture ne compte pas, un nouveau « oui » oui', not g[0]['ok'] and g[1]['ok'], str(g))
        await page.evaluate("wilson.crm.pending = null; wilson.endConversation('test')")

        # 3. CRM : nom approximatif, écriture sans réseau, écriture sans réponse à temps
        await page.evaluate("wilson.crm.cache.clear(); wilson.crm.last = null")
        r = await page.evaluate("wilson._crmRun('crm_client', { client: 'Franprix voisin' })")
        check('Nom entendu approximatif (« Franprix voisin ») : il doit citer le client trouvé (AD2M)', 'Nom entendu : « Franprix voisin »' in r['info'] and 'AD2M' in r['info'], r['info'][:200])
        await page.evaluate("wilson.crm.cache.clear(); wilson.crm.last = null")
        r = await page.evaluate("wilson._crmRun('crm_client', { client: 'AD2M' })")
        check('… nom exact : pas de remarque', 'Nom entendu' not in r['info'])
        pend = "wilson.crm.pending = { type: 'tache', texte: 'Envoyer les papiers', date: '27/10/2026', cle: '', relu: 'Tâche pour le mardi 27/10/26 : « Envoyer les papiers ».', at: performance.now(), atMs: Date.now(), turn: 0 }"
        st['down'] = True
        await page.evaluate(pend)
        r = await page.evaluate("wilson.crm.commit()")
        q = await page.evaluate("JSON.parse(localStorage.getItem('wilson.crm.attente') || '[]')")
        check('Écriture confirmée sans réseau : PAS écrite, gardée sur le téléphone, Wilson le dit', r.get('queued') and 'PAS encore enregistré' in r['dire'] and len(q) == 1 and not st['writes'], json.dumps(r, ensure_ascii=False)[:200])
        st['down'] = False
        await page.evaluate("window.dispatchEvent(new Event('online'))")
        await page.wait_for_function("wilson.crm.queue.length === 0", timeout=6000)
        w = st['writes'][-1] if st['writes'] else {}
        check('Réseau revenu : envoyée seule, avec sa confirmation et un identifiant (pas de doublon)', w.get('action') == 'crm_tache' and w.get('confirme') is True and str(w.get('id', '')).startswith('w') and has('enregistré au retour du réseau'), json.dumps(w, ensure_ascii=False))
        st['slow'] = 2
        await page.evaluate(pend)
        r = await page.evaluate("(() => { const c = new AbortController(); setTimeout(() => c.abort(), 300); return wilson.crm.commit(c.signal); })()")
        st['slow'] = 0
        check('Pas de réponse à temps : « je ne sais pas si c\'est enregistré », rien n\'est renvoyé', 'je ne sais pas si c' in r['dire'] and await page.evaluate("wilson.crm.queue.length === 0") and has('INCERTAINE'), r['dire'])

        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")

asyncio.run(main())
