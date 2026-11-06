"""La mémoire de Wilson et les questions de Claude à Timothée (PLAN 7 septies, demande de Timothée du 05/11/26) — services
simulés : Gemini Live, Gemini (passe de mémoire), script de Timothée (onglets « Mémoire » et « Questions »)."""
import asyncio, re, json, os, time
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, '' if ok else detail, flush=True)
FAKE_TTS = open(os.path.join(S, 'e2e_eco.py'), encoding='utf-8').read().split('FAKE_TTS = """')[1].split('"""')[0]
FAUSSE_VISION = open(os.path.join(S, 'e2e_famille.py'), encoding='utf-8').read().split('FAUSSE_VISION = """')[1].split('"""')[0]
URL = 'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTESTTESTTEST/exec'
TABLETTE = 'Mozilla/5.0 (Linux; Android 11; SM-T720) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
TELEPHONE = 'Mozilla/5.0 (Linux; Android 15; SM-A266B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
Q1 = 'Quand tu dis « éteins tout », la télé doit-elle s\'éteindre aussi ?'


def send(conn, **sc):
    conn['ws'].send(json.dumps({'serverContent': sc}))


async def main():
    conns = []
    st = {'calls': [], 'a_jour': True, 'passes': [], 'autres': 0, 'passe_out': {'ajouter': [], 'oublier': []},
          'mem': [{'id': 'mA', 'cat': 'maison', 'texte': 'Les piles sont dans le tiroir de l\'entrée.', 'qui': '', 't': 0, 'origine': ''},
                  {'id': 'mB', 'cat': 'famille', 'texte': 'Gaspard est le neveu de Camille.', 'qui': 'Gaspard', 't': 0, 'origine': ''}],
          'questions': [{'id': 'q1', 'question': Q1, 'pourquoi': 'Journal du 04/11 : la télé est restée allumée.', 't': 0}], 'reponses': {}}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])

        async def script(route):
            req = route.request; H = {'access-control-allow-origin': '*'}
            if req.method != 'POST': await route.fulfill(status=200, body='ok'); return
            d = json.loads(req.post_data or '{}'); a = d.get('action', '')
            if not a: await route.fulfill(status=200, headers=H, body='ok'); return
            st['calls'].append(d); body = {'ok': True}
            if re.match(r'^(mem_|q_)', a) and not st['a_jour']: body = {'ok': False, 'erreur': 'action inconnue : ' + a}
            elif a == 'mem_ecrire':
                st['mem'] = [m for m in st['mem'] if m['id'] not in d.get('oublier', [])]
                for m in d.get('ajouter', []):
                    if not any(x['id'] == m['id'] for x in st['mem']): st['mem'].append(m)
                body = {'ok': True, 'souvenirs': st['mem'], 'ajoutes': len(d.get('ajouter', []))}
            elif a == 'mem_lire': body = {'ok': True, 'souvenirs': st['mem']}
            elif a == 'q_lire': body = {'ok': True, 'questions': [q for q in st['questions'] if q['id'] not in st['reponses']][:3]}
            elif a == 'q_repondre': st['reponses'][d['id']] = d['reponse']; body = {'ok': True, 'question': 'x'}
            elif a == 'msg_lire': body = {'ok': True, 'messages': [], 'noms': [], 'garde': None}
            elif a == 'reglages_lire': body = {'ok': True, 'reglages': None, 't': 0}
            await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(body, ensure_ascii=False))

        async def gemini_rest(route):
            req = route.request; H = {'access-control-allow-origin': '*'}
            if req.method == 'OPTIONS': await route.fulfill(status=204, headers={**H, 'access-control-allow-headers': '*'}); return
            d = json.loads(req.post_data)
            sysi = ((d.get('systemInstruction') or {}).get('parts') or [{}])[0].get('text', '')
            modele = req.url.split('/models/')[1].split(':')[0]
            if 'Tu es la mémoire de Wilson' in sysi: st.setdefault('modeles', []).append(modele)
            if 'Tu es la mémoire de Wilson' in sysi and modele in st.get('quota', ()):
                await route.fulfill(status=429, content_type='application/json', headers=H, body=json.dumps({'error': {'code': 429, 'message': 'Resource has been exhausted (e.g. check quota).'}})); return
            if 'Tu es la mémoire de Wilson' in sysi:
                st['passes'].append({'model': req.url.split('/models/')[1].split(':')[0], 'sys': sysi, 'text': d['contents'][0]['parts'][0]['text'], 'gc': d['generationConfig']})
                out = st['passe_out']
            else: st['autres'] += 1; out = {'pour_moi': False, 'reponse': ''}
            await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'candidates': [{'content': {'parts': [{'text': json.dumps(out, ensure_ascii=False)}]}}]}))

        def handler(ws):
            conn = {'ws': ws, 'setup': None, 'texts': [], 'resp': []}; conns.append(conn)
            def on_msg(m):
                d = json.loads(m)
                if 'setup' in d: conn['setup'] = d['setup']; ws.send(json.dumps({'setupComplete': {}}))
                elif 'toolResponse' in d: conn['resp'].extend(d['toolResponse']['functionResponses'])
                elif 'realtimeInput' in d and 'text' in d['realtimeInput']: conn['texts'].append(d['realtimeInput']['text'])
            ws.on_message(on_msg)

        async def ouvrir(ua, settings, init=''):
            ctx = await b.new_context(viewport={'width': 1138, 'height': 712}, permissions=['microphone', 'camera'], service_workers='block', user_agent=ua)
            await ctx.add_init_script("if (!localStorage.getItem('wilson.settings')) { localStorage.setItem('wilson.settings', JSON.stringify(%s)); %s }" % (json.dumps(settings), init))
            await ctx.add_init_script(FAKE_TTS)
            page = await ctx.new_page(); logs = []
            await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe|face-api|audio)/.*'), lambda r: asyncio.ensure_future(r.abort()))
            await page.route(re.compile(r'https://script\.google\.com/.*'), script)
            await page.route(re.compile(r'.*generativelanguage\.googleapis\.com/v1beta/models/.*:generateContent.*'), gemini_rest)
            await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)
            page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
            await page.goto('http://127.0.0.1:8765/index.html')
            await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
            return page, logs

        async def outil(page, conn, i, name, args):
            await page.evaluate("([i, n, a]) => wilson._tools([{ id: i, name: n, args: a }])", [i, name, args])
            for _ in range(100):
                await page.wait_for_timeout(100)
                for r in conn['resp']:
                    if r['id'] == i: return r['response']['result']
            return ''

        # ================= Tablette du salon, avec les anciens « Souvenirs » et « Qui vit ici » =================
        base = {'apiKey': 'AIzaTESTTESTTESTTESTTESTTESTTEST', 'camera': False, 'listenMode': 'toujours', 'logUrl': URL, 'home': 'Timothée, Camille et leur fils Louis', 'nightStart': 3, 'nightEnd': 4, 'v': 4}
        vieux = json.dumps([{'text': 'Le chat de la famille s\'appelle Moustache.', 'date': '01/11/26'}], ensure_ascii=False)
        page, logs = await ouvrir(TABLETTE, base, "localStorage.setItem('wilson.facts', %s);" % json.dumps(vieux))
        has = lambda t: any(t in l for l in logs)
        await page.evaluate(FAUSSE_VISION)
        items = await page.evaluate("wilson.memoire.items.map((x) => x.texte + '|' + x.origine)")
        check('Anciens souvenirs et « Qui vit ici » repris dans la nouvelle mémoire (origine « ancien »)',
              "À la maison : Timothée, Camille et leur fils Louis|ancien" in items and "Le chat de la famille s'appelle Moustache.|ancien" in items, str(items))
        check('… l\'ancienne liste est effacée, reprise une seule fois', await page.evaluate("localStorage.getItem('wilson.facts') === null && !!localStorage.getItem('wilson.memoire.migre')") and has('ancien(s) souvenir(s) repris'))
        await page.wait_for_function("wilson.memoire.etat === 'ok'", timeout=15000)
        ec = [c for c in st['calls'] if c['action'] == 'mem_ecrire']
        check('Envoyés dans l\'onglet « Mémoire » du script (partagé par tous les appareils)', ec and len(ec[0]['ajouter']) == 2 and len(st['mem']) == 4, json.dumps(ec)[:300])
        items = await page.evaluate("wilson.memoire.items.map((x) => x.texte)")
        check('… et ce qui est dans la feuille (écrit à la main par Timothée) est relu', 'Les piles sont dans le tiroir de l\'entrée.' in items and len(items) == 4, str(items))
        await page.evaluate("wilson.memoire.synchroniser()"); await page.wait_for_timeout(300)
        check('Pas de doublon à la relecture', await page.evaluate("wilson.memoire.items.length") == 4 and len(st['mem']) == 4)

        # Réglages : plus de rubriques « Souvenirs » ni « Qui vit ici » ; « Mes appareils » reste.
        ui = await page.evaluate("({ home: !!document.getElementById('s-home'), wh: !!document.getElementById('w-home'), liste: !!document.getElementById('mem-list'), app: document.body.innerHTML.includes('Mes appareils') })")
        await page.evaluate("wilson.ui.renderMemory()")
        txt = await page.evaluate("document.getElementById('s-memoire').textContent")
        check('Réglages : rubriques « Souvenirs » et « Qui vit ici » supprimées (« Mes appareils » gardé)', not ui['home'] and not ui['wh'] and not ui['liste'] and ui['app'], str(ui))
        check('… une ligne dit où est la mémoire (onglet « Mémoire »)', '4 souvenirs' in txt and 'onglet « Mémoire »' in txt, txt)

        # La consigne : la mémoire, avec tact ; plus de « La maison : … ».
        sysp = await page.evaluate("wilson._system('live')")
        check('Consigne : la mémoire rangée par sujets, à utiliser avec tact',
              'Ta mémoire (ce que tu as retenu' in sysp and '- Les piles sont dans le tiroir' in sysp and 'Famille :' in sysp and 'avec tact' in sysp and '\nLa maison : Timothée' not in sysp, sysp[-1400:])
        check('Consigne : memoriser seulement sur demande claire (le reste, il le relit après)', 'inutile d\'appeler memoriser pour ça' in sysp)
        check('Prénoms connus par la mémoire : « Gaspard, viens voir » n\'est pas pour Wilson', await page.evaluate("!wilson._semblePourMoi('Gaspard, viens voir !') && wilson._semblePourMoi('Tu peux allumer la lumière ?')"))

        # ---- La passe de mémoire ----
        t0 = int(time.time() * 1000)
        await page.evaluate("wilson.memory.addExchange('merci', 'Avec plaisir !', 'Timothée')")
        n0 = len(st['passes'])
        await page.evaluate("wilson._passeMemoire(%d, Date.now(), [])" % (t0 - 1))
        check('Discussion trop courte (« merci ») : rien à relire, aucune requête', len(st['passes']) == n0)
        st['passe_out'] = {'ajouter': [{'texte': 'Louis adore les dinosaures.', 'categorie': 'goûts', 'qui': 'Louis'}, {'texte': 'Le chat de la famille s\'appelle Moustache.', 'categorie': 'famille', 'qui': 'famille'}],
                           'oublier': ['mA', 'inconnu'], 'reponses': [{'id': 'q1', 'reponse': 'pas posée'}]}
        t1 = int(time.time() * 1000)
        await page.evaluate("wilson.memory.addExchange('Pour Noël, Louis voudrait un livre sur les dinosaures, il adore ça. Et les piles, je les ai mises dans le garage.', 'Bonne idée, je note !', 'Timothée')")
        await page.evaluate("wilson.memory.addExchange('Quel temps demain ?', 'Demain, soleil et 15 degrés.', 'Timothée')")
        await page.evaluate("wilson._passeMemoire(%d, Date.now(), [])" % t1)
        for _ in range(30):
            await page.wait_for_timeout(250)
            if any(m['texte'] == 'Louis adore les dinosaures.' for m in st['mem']): break
        P = st['passes'][-1] if st['passes'] else {}
        check('Passe de mémoire : une requête à un modèle « réfléchi », JSON imposé par schéma', len(st['passes']) == n0 + 1 and P['model'] == 'gemini-3.8-flash' and P['gc'].get('responseMimeType') == 'application/json' and 'ajouter' in P['gc']['responseSchema']['properties'], str(P.get('model')))
        check('… la consigne dit quoi retenir et surtout quoi ne pas retenir', 'À NE PAS retenir' in P.get('sys', '') and 'mots de passe' in P['sys'] and 'CRM' in P['sys'] and 'La plupart des discussions ne contiennent rien' in P['sys'])
        check('… elle voit les souvenirs (avec leurs ids) et la discussion avec qui parle', '[mA]' in P['text'] and 'Timothée : Pour Noël' in P['text'] and 'Wilson : Bonne idée' in P['text'] and 'merci' not in P['text'].split('La discussion')[1], P.get('text', '')[-500:])
        items = await page.evaluate("wilson.memoire.items.map((x) => x.texte + '|' + x.cat + '|' + x.origine)")
        check('Retenu : « Louis adore les dinosaures » (goûts, origine « discussion »)', 'Louis adore les dinosaures.|goûts|discussion' in items, str(items))
        check('Corrigé : l\'ancien souvenir des piles est oublié ; rien en double', not any('piles' in x for x in items) and sum('Moustache' in x for x in items) == 1, str(items))
        check('… et la feuille suit (ajout + oubli envoyés au script)', not any(m['id'] == 'mA' for m in st['mem']) and any(m['texte'] == 'Louis adore les dinosaures.' for m in st['mem']))
        check('Une réponse à une question qui n\'a pas été posée est ignorée', 'q1' not in st['reponses'])
        check('Journal : ce qui a été retenu (pour l\'analyse de la nuit)', has('Mémoire (gemini-3.8-flash) : retenu « Louis adore les dinosaures. »') and has('oublié « Les piles'), str([l for l in logs if 'Mémoire' in l][-3:]))
        # Nuit du 06/11/26 : petit ménage des anciens souvenirs (doublons, souvenirs du moment), jamais en masse.
        await page.evaluate("""['Le parapluie rouge est dans l\\'entrée.', 'Le parapluie est rangé dans l\\'entrée.', 'Le son est bon aujourd\\'hui.', 'Gaspard aime le thé vert.'].forEach((t) => wilson.memoire._ajouter(t, { cat: 'autre', origine: 'ancien' }))""")
        anc = await page.evaluate("wilson.memoire.items.filter((x) => x.origine === 'ancien' && /parapluie|son est bon|thé vert/.test(x.texte)).map((x) => x.id)")
        st['passe_out'] = {'ajouter': [], 'oublier': anc}
        await page.evaluate("wilson.memory.addExchange('Tu sais, le parapluie rouge, je le prends tous les matins pour aller au travail.', 'D accord !', 'Timothée')")
        await page.evaluate("wilson._passeMemoire(%d, Date.now(), [])" % (int(time.time() * 1000) - 1000))
        for _ in range(30):
            await page.wait_for_timeout(250)
            if has('oubli limité'): break
        P = st['passes'][-1]
        check('Passe : la consigne demande un petit ménage (doublons, souvenirs du moment, jamais « demandé »)', 'Petit ménage' in P['sys'] and 'au plus 2' in P['sys'] and 'Jamais un souvenir « demandé »' in P['sys'])
        check('… et elle voit quels souvenirs sont « ancien »', ', ancien) Le parapluie rouge' in P['text'], P['text'][:600])
        reste = await page.evaluate("wilson.memoire.items.filter((x) => /parapluie|son est bon|thé vert/.test(x.texte)).length")
        check('… jamais en masse : 4 oublis proposés sans demande → 2 seulement', reste == 2 and has('oubli limité à 2 (4 proposés'), str(reste))
        # « Retiens que… » / « oublie… » tout de suite
        await page.evaluate("wilson.startConversation('toucher')"); await page.wait_for_function('wilson.brain.open', timeout=8000); c = conns[-1]
        fns = {f['name']: f for t in c['setup'].get('tools', []) for f in t.get('functionDeclarations', [])}
        check('Outil memoriser : seulement sur demande claire, avec catégorie', 'seulement quand on te demande clairement' in fns['memoriser']['description'].lower() and 'categorie' in fns['memoriser']['parameters']['properties'], fns['memoriser']['description'])
        await outil(page, c, 'r1', 'memoriser', {'fait': 'Camille prend son café sans sucre.', 'categorie': 'goûts', 'qui': 'Camille'})
        await page.wait_for_timeout(200)
        r = await outil(page, c, 'r2', 'oublier', {'sujet': 'les dinosaures'})
        items = await page.evaluate("wilson.memoire.items.map((x) => x.texte + '|' + x.origine)")
        check('« Retiens que… » : gardé tout de suite (origine « demandé ») ; « oublie… » : effacé', 'Camille prend son café sans sucre.|demandé' in items and not any('dinosaures' in x for x in items) and 'Oublié' in r, str(items) + r)
        await page.evaluate("wilson.endConversation('test')"); await page.wait_for_timeout(300)

        # ---- Questions de Claude : à Timothée seulement ----
        await page.wait_for_function("wilson.questions.liste.length === 1", timeout=8000)
        sans = await page.evaluate("wilson._system('live')")
        check('Personne de reconnu : la question n\'est pas posée', 'Une question de Claude' not in sans)
        await page.evaluate("__qui({ nom: 'Camille', sur: true })")
        check('Camille le regarde : pas posée (c\'est Timothée qui fait le programme)', 'Une question de Claude' not in await page.evaluate("wilson._system('live')"))
        await page.evaluate("__qui({ nom: 'Timothée', sur: false, probable: 'Timothée', d: 0.53 })")
        check('Timothée « probable » seulement : pas posée', 'Une question de Claude' not in await page.evaluate("wilson._system('live')"))
        await page.evaluate("__regarde(true); __qui({ nom: 'Timothée', sur: true })")
        await page.evaluate("wilson.startConversation('toucher')"); await page.wait_for_function('wilson.brain.open', timeout=8000); c = conns[-1]
        sysq = c['setup']['systemInstruction']['parts'][0]['text']
        fns = [f['name'] for t in c['setup'].get('tools', []) for f in t.get('functionDeclarations', [])]
        check('Timothée reconnu à coup sûr : la question est dans la consigne, avec la façon de la poser', 'Une question de Claude pour Timothée' in sysq and Q1 in sysq and 'Pose-la UNE fois' in sysq and 'repondre_question (id « q1 »)' in sysq and 'la télé est restée allumée' in sysq, sysq[-1200:])
        check('… outil repondre_question proposé à Gemini', 'repondre_question' in fns, str(fns))
        check('Mode économique : la question aussi (la réponse sera retrouvée en relisant)', 'Une question de Claude pour Timothée' in await page.evaluate("wilson._system('eco')") and 'sa réponse sera transmise' in await page.evaluate("wilson._system('eco')"))
        send(c, outputTranscription={'text': 'C\'est allumé. Au fait, Claude m\'a demandé de te poser une question pour ma prochaine mise à jour : quand tu dis éteins tout, la télé doit-elle s\'éteindre aussi ?'}); send(c, turnComplete=True)
        await page.wait_for_timeout(800)
        check('Wilson l\'a posée : notée (journal)', await page.evaluate("!!wilson.questions.posees.q1 && wilson.questions.enCours.posee") and has('Question de Claude posée à Timothée [q1]'))
        r = await outil(page, c, 'qr1', 'repondre_question', {'id': 'q1', 'reponse': 'Oui, la télé aussi, et l\'enceinte.'})
        await page.wait_for_timeout(600)
        check('Sa réponse : écrite à côté de la question (script), dans le journal en majuscules pour Claude', 'transmise' in r and st['reponses'].get('q1') == 'Oui, la télé aussi, et l\'enceinte.' and has('RÉPONSE DE TIMOTHÉE à la question de Claude [q1]'), r)
        check('… et la question n\'est plus posée', 'Une question de Claude' not in await page.evaluate("wilson._system('live')") and await page.evaluate("wilson.questions.liste.length") == 0)
        await page.evaluate("wilson.endConversation('test')"); await page.wait_for_timeout(300)

        # Réponse retrouvée par la passe de mémoire (mode économique ou outil pas appelé) — vrai déroulé : fin de discussion → 15 s → passe
        st['questions'].append({'id': 'q2', 'question': 'Préfères-tu un petit bip quand je me réveille ?', 'pourquoi': '', 't': 0})
        await page.evaluate("wilson.questions.synchroniser()"); await page.wait_for_timeout(300)
        await page.evaluate("wilson.startConversation('toucher')"); await page.wait_for_function('wilson.brain.open', timeout=8000); c = conns[-1]
        check('Question suivante dans la consigne', 'Préfères-tu un petit bip' in c['setup']['systemInstruction']['parts'][0]['text'])
        send(c, outputTranscription={'text': 'Au fait, Claude m\'a demandé : préfères-tu un petit bip quand je me réveille ?'}); send(c, turnComplete=True)
        await page.wait_for_timeout(500)
        send(c, inputTranscription={'text': 'Non, pas de bip, ça réveillerait Louis.'}); send(c, outputTranscription={'text': 'Merci, c\'est transmis !'}); send(c, turnComplete=True)
        await page.wait_for_timeout(500)
        st['passe_out'] = {'ajouter': [], 'oublier': [], 'reponses': [{'id': 'q2', 'reponse': 'Non, pas de bip : ça réveillerait Louis.'}]}
        n1 = len(st['passes'])
        await page.evaluate("wilson.endConversation('test')")
        for _ in range(40):
            await page.wait_for_timeout(500)
            if 'q2' in st['reponses']: break
        P = st['passes'][-1] if len(st['passes']) > n1 else {}
        check('Fin de discussion : relue 15 s après, en arrière-plan', len(st['passes']) == n1 + 1 and 'Timothée : Non, pas de bip' in P.get('text', ''), str(len(st['passes']) - n1))
        check('… la question posée lui est rappelée (« TIMOTHÉE lui seulement »)', '[q2]' in P.get('text', '') and 'TIMOTHÉE (lui seulement' in P.get('text', ''))
        check('… la réponse retrouvée est écrite à côté de la question', st['reponses'].get('q2') == 'Non, pas de bip : ça réveillerait Louis.' and has('retrouvée en relisant la discussion'), str(st['reponses']))

        # Pas de réponse : la même question ne revient pas avant 3 h
        st['questions'].append({'id': 'q3', 'question': 'Veux-tu que je baisse la voix le soir ?', 'pourquoi': '', 't': 0})
        await page.evaluate("wilson.questions.synchroniser()"); await page.wait_for_timeout(300)
        await page.evaluate("wilson.startConversation('toucher')"); await page.wait_for_function('wilson.brain.open', timeout=8000); c = conns[-1]
        send(c, outputTranscription={'text': 'Au fait, Claude voudrait savoir : veux-tu que je baisse la voix le soir ?'}); send(c, turnComplete=True)
        await page.wait_for_timeout(500)
        send(c, inputTranscription={'text': 'Plus tard.'}); send(c, turnComplete=True); await page.wait_for_timeout(300)
        check('Dans la même discussion, posée → consigne « attends sa réponse » (pas de 2e fois)', 'Tu as posé à Timothée cette question' in await page.evaluate("wilson._system('live')"))
        await page.evaluate("wilson.endConversation('test')"); await page.wait_for_timeout(300)
        await page.evaluate("wilson.startConversation('toucher')"); await page.wait_for_function('wilson.brain.open', timeout=8000); c = conns[-1]
        check('Discussion suivante : pas reposée (moins de 3 h)', 'Une question de Claude' not in c['setup']['systemInstruction']['parts'][0]['text'])
        await page.evaluate("wilson.endConversation('test')"); await page.wait_for_timeout(300)
        await page.evaluate("wilson.questions.posees.q3 = Date.now() - 4 * 3600000")
        check('3 h plus tard : elle revient', 'Une question de Claude pour Timothée (Claude prépare tes mises à jour la nuit ; il a besoin de sa réponse pour la prochaine) : « Veux-tu que je baisse' in await page.evaluate("wilson._system('live')"))
        # Quota épuisé sur le 1er modèle : le suivant, et plus celui-là pendant 1 h
        st['quota'] = {'gemini-3.8-flash'}; st['modeles'] = []; st['passe_out'] = {'ajouter': [], 'oublier': []}
        await page.evaluate("wilson.memory.addExchange('Louis a son match de foot tous les samedis matin.', 'D\\'accord !', 'Timothée')")
        await page.evaluate("wilson._passeMemoire(Date.now() - 2000, Date.now(), [])")
        m1 = list(st['modeles']); st['modeles'] = []
        await page.evaluate("wilson._passeMemoire(Date.now() - 4000, Date.now(), [])")
        check('Quota épuisé sur un modèle : le suivant prend le relais, et il n\'est plus essayé pendant 1 h', m1[:2] == ['gemini-3.8-flash', 'gemini-3.5-flash-lite'] and st['modeles'][:1] == ['gemini-3.5-flash-lite'], f"{m1} puis {st['modeles']}")
        st['quota'] = set()
        bil = await page.evaluate("wilson.bilan()")
        check('Bilan : mémoire et questions', 'souvenir' in bil.get('Mémoire', '') and 'en attente' in bil.get('Questions de Claude', ''), json.dumps({k: bil.get(k) for k in ['Mémoire', 'Questions de Claude']}, ensure_ascii=False))
        check('Pas d\'erreur JavaScript (tablette)', not any('PAGEERROR' in l for l in logs), str([l for l in logs if 'PAGEERROR' in l][:3]))

        # ================= Le téléphone de Timothée : la même mémoire ; script pas encore à jour =================
        st['a_jour'] = False
        page2, logs2 = await ouvrir(TELEPHONE, {**base, 'home': ''})
        has2 = lambda t: any(t in l for l in logs2)
        await page2.wait_for_timeout(7500)
        check('Script pas à jour : la mémoire reste sur l\'appareil, sans erreur', 'pas encore à jour' in await page2.evaluate("wilson.memoire.etat"), await page2.evaluate("wilson.memoire.etat"))
        await page2.evaluate("wilson.memoire.ajouter('Timothée part au travail à 7h30.', { cat: 'habitudes', qui: 'Timothée' })")
        check('… ce qu\'il retient attend d\'être envoyé', await page2.evaluate("wilson.memoire.att.ajouter.length") == 1)
        st['a_jour'] = True
        await page2.evaluate("wilson.memoire.synchroniser()"); await page2.wait_for_timeout(400)
        items2 = await page2.evaluate("wilson.memoire.items.map((x) => x.texte)")
        check('Script à jour : envoyé, et le téléphone a la même mémoire que la tablette', any(m['texte'] == 'Timothée part au travail à 7h30.' for m in st['mem']) and 'Camille prend son café sans sucre.' in items2 and await page2.evaluate("wilson.memoire.att.ajouter.length") == 0, str(items2))
        await page2.evaluate("wilson.questions.synchroniser()"); await page2.wait_for_timeout(300)
        check('Sur son téléphone, c\'est Timothée : la question peut être posée', 'Une question de Claude pour Timothée' in await page2.evaluate("wilson._system('live')"))
        await page.evaluate("wilson.memoire.synchroniser()"); await page.wait_for_timeout(400)
        check('… et la tablette reçoit ce que le téléphone a retenu', 'Timothée part au travail à 7h30.' in await page.evaluate("wilson.memoire.items.map((x) => x.texte)"))
        check('Pas d\'erreur JavaScript (téléphone)', not any('PAGEERROR' in l for l in logs2), str([l for l in logs2 if 'PAGEERROR' in l][:3]))
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")
    raise SystemExit(0 if all(results) else 1)

asyncio.run(main())
