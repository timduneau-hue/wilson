"""La famille, la garde, l'objectif et les réactions (PLAN 7 sexies, accord de Timothée du 04/11/26) — services simulés :
Gemini Live, script de Timothée (messages, garde, alertes, CRM), analyste du CRM. Vision et reconnaissance des visages
simulées ici (les vrais modèles sont vérifiés par e2e_famille_modeles.py)."""
import asyncio, re, json, os, base64
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, '' if ok else detail, flush=True)
FAKE_TTS = open(os.path.join(S, 'e2e_eco.py'), encoding='utf-8').read().split('FAKE_TTS = """')[1].split('"""')[0]
URL = 'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTESTTESTTEST/exec'
TABLETTE = 'Mozilla/5.0 (Linux; Android 11; SM-T720) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
TELEPHONE = 'Mozilla/5.0 (Linux; Android 15; SM-A266B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
# Fausse vision : ce que l'appli lit de la caméra (visages, regard), sans modèle.
FAUSSE_VISION = """(() => { const v = { looking: false, hasPerson: false, faces: 0, gazeReady: true, modelsDone: true, stale: false, sureAt: 0, lookAt: 0,
  target: null, light: 0.5, fps: 8, mode: 'visages', delegate: 'CPU', errors: [], fixes: [], restarts: 0, stats: { ms: 0, fd: 0, lm: 0, n: 0 }, gaze: null,
  setRate(f) { this.fps = f; }, snapshot() { return 'UEhPVE8='; }, stop() {} };
  wilson.vision = v; wilson.qui.vision = v; wilson.qui.tick = () => {};
  window.__regarde = (oui) => { v.looking = oui; v.hasPerson = oui || v.hasPerson; v.faces = oui ? 1 : v.faces; if (oui) { v.sureAt = performance.now(); wilson.presenceAt = performance.now(); } };
  window.__qui = (P) => { const A = P ? { d: 0.3, at: performance.now(), faces: 1, facing: true, inconnu: false, sur: false, ...P } : null; const avant = wilson.qui.actuel; wilson.qui.actuel = A; if (wilson.qui.onChange) wilson.qui.onChange(A, avant); };
  setInterval(() => { if (v.looking) v.sureAt = performance.now(); if (wilson.qui.actuel) wilson.qui.actuel.at = performance.now(); }, 200);
})()"""


def send(conn, **sc):
    conn['ws'].send(json.dumps({'serverContent': sc}))


async def main():
    conns, st = [], {'calls': [], 'msgs': {}, 'garde': None, 'alertes': [], 'gem': [], 'noms': [], 'script_a_jour': True, 'agenda': []}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])

        async def script(route):
            req = route.request; H = {'access-control-allow-origin': '*'}
            if req.method != 'POST': await route.fulfill(status=200, body='ok'); return
            d = json.loads(req.post_data or '{}'); a = d.get('action', '')
            if not a: await route.fulfill(status=200, headers=H, body='ok'); return
            st['calls'].append(d); body = {'ok': True}
            if re.match(r'^(msg_|garde_|alerte)', a) and not st['script_a_jour']: body = {'ok': False, 'erreur': 'action inconnue : ' + a}
            elif a == 'msg_deposer': m = d['msg']; st['msgs'].setdefault(m['id'], {**m, 'local': None}); body = {'ok': True, 'id': m['id']}
            elif a == 'msg_lire':
                if d.get('noms'): st['noms'] = d['noms']
                body = {'ok': True, 'messages': [m for m in st['msgs'].values() if not m.get('annule')], 'noms': st['noms'], 'garde': st['garde']}
            elif a == 'msg_remis': st['msgs'][d['id']]['remis'] = {'t': d['t'], 'a': d['a']}
            elif a == 'msg_annuler': st['msgs'][d['id']]['annule'] = 1
            elif a == 'garde_ecrire': st['garde'] = d['garde']
            elif a == 'alerte': st['alertes'].append(d); body = {'ok': True, 'envoye': True, 'n': len(st['alertes'])}
            elif a == 'agenda_ajouter' and d.get('titre') == 'Coiffeur' and not d.get('quand_meme'): body = {'ok': True, 'conflit': True, 'conflits': [{'titre': 'Médecin Louis', 'debut': d['debut'], 'fin': d['debut'] + 3600000, 'journee': False, 'agenda': 'Famille'}, {'titre': 'Réunion Boschat', 'debut': d['debut'], 'fin': d['debut'] + 1800000, 'journee': False, 'agenda': 'BOSCHAT LAVEIX'}]}
            elif a == 'agenda_ajouter': st['agenda'].append({**d, 'id': 'ev%d' % len(st['agenda'])}); body = {'ok': True, 'id': 'ev%d' % (len(st['agenda']) - 1), 'titre': d['titre']}
            elif a == 'agenda_annuler': st['agenda'] = [e for e in st['agenda'] if e['id'] != d['id']]; body = {'ok': True, 'titre': 'x'}
            elif a == 'agenda_lire': body = {'ok': True, 'evenements': [{'id': 'z', 'titre': 'Week-end chez mamie', 'debut': 1794438000000, 'fin': 1794610800000, 'journee': True, 'lieu': ''}, {'id': 'y', 'titre': 'Médecin Louis', 'debut': 1794474000000, 'fin': 1794477600000, 'journee': False, 'lieu': 'Angers'}]}
            elif a == 'reglages_lire': body = {'ok': True, 'reglages': None, 't': 0}
            elif a == 'crm_bilan': body = {'ok': True, 'texte': 'Novembre 2026 : 41 clients actifs ce mois-ci (39 l\'an dernier à la même date).'}
            elif a == 'crm_journee': body = {'ok': True, 'rdv': [], 'texte': 'Prochain jour : 9h00 AD2M (Angers), 14h00 Menuiserie Gaudin (Cholet).'}
            elif a == 'crm_schema': body = {'ok': True, 'texte': 'Tables : commandes (date, client, ville, montant).'}
            elif a == 'crm_etat': body = {'ok': True, 'contacts': 400}
            await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(body, ensure_ascii=False))

        async def gemini_rest(route):                           # l'analyste du CRM
            req = route.request; H = {'access-control-allow-origin': '*'}
            if req.method == 'OPTIONS': await route.fulfill(status=204, headers={**H, 'access-control-allow-headers': '*'}); return
            st['gem'].append(json.loads(req.post_data))
            out = {'action': 'repondre', 'reponse': 'Tu as 41 clients actifs sur 60 : il t\'en manque 19. Demain, AD2M n\'a encore rien commandé ce mois-ci.'}
            await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'candidates': [{'content': {'parts': [{'text': json.dumps(out, ensure_ascii=False)}]}}]}))

        def handler(ws):
            conn = {'ws': ws, 'setup': None, 'texts': [], 'resp': []}; conns.append(conn)
            def on_msg(m):
                d = json.loads(m)
                if 'setup' in d: conn['setup'] = d['setup']; ws.send(json.dumps({'setupComplete': {}}))
                elif 'toolResponse' in d: conn['resp'].extend(d['toolResponse']['functionResponses'])
                elif 'realtimeInput' in d and 'text' in d['realtimeInput']: conn['texts'].append(d['realtimeInput']['text'])
            ws.on_message(on_msg)

        async def ouvrir(ua, settings):
            ctx = await b.new_context(bypass_csp=True, viewport={'width': 1138, 'height': 712}, permissions=['microphone', 'camera'], service_workers='block', user_agent=ua)
            await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify(%s));" % json.dumps(settings))
            await ctx.add_init_script(FAKE_TTS)
            page = await ctx.new_page(); logs = []
            await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe|face-api|audio)/.*'), lambda r: asyncio.ensure_future(r.abort()))
            await page.route(re.compile(r'https://script\.google\.com/.*'), script)
            await page.route(re.compile(r'.*generativelanguage\.googleapis\.com/v1beta/models/.*:generateContent.*'), gemini_rest)
            await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)
            page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
            await page.goto('http://127.0.0.1:8765/index.html')
            await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
            await page.evaluate("wilson._crmAutorise = () => ({ ok: true, pourquoi: 'essai' })")   # CRM réservé à Timothée (06/11/26) : ici on fait comme s'il était reconnu
            return page, logs

        async def outil(page, conn, i, name, args):
            await page.evaluate("([i, n, a]) => wilson._tools([{ id: i, name: n, args: a }])", [i, name, args])
            for _ in range(100):
                await page.wait_for_timeout(100)
                for r in conn['resp']:
                    if r['id'] == i: return r['response']['result']
            return ''

        # ================= Tablette du salon =================
        base = {'apiKey': 'AIzaTESTTESTTESTTESTTESTTESTTEST', 'camera': False, 'listenMode': 'toujours', 'logUrl': URL, 'crm': True, 'nightStart': 3, 'nightEnd': 4, 'v': 4}
        page, logs = await ouvrir(TABLETTE, base)
        has = lambda t: any(t in l for l in logs)
        await page.evaluate(FAUSSE_VISION)
        # Deux visages appris sur cette tablette (empreintes fictives : ici on ne teste pas la reconnaissance elle-même).
        await page.evaluate("wilson.qui.personnes = [{ nom: 'Timothée', desc: [[0.1, 0.2]] }, { nom: 'Marie', desc: [[0.3, 0.4]] }, { nom: 'Louis', desc: [[0.5, 0.6]] }]")
        await page.evaluate("wilson.startConversation('toucher')"); await page.wait_for_function('wilson.brain.open', timeout=8000)
        await page.evaluate("wilson.continuous = true"); c = conns[-1]
        fns = [f['name'] for t in c['setup'].get('tools', []) for f in t.get('functionDeclarations', [])]
        sysp = c['setup']['systemInstruction']['parts'][0]['text']
        check('Outils messages, visages, garde proposés à Gemini', all(x in fns for x in ['messages', 'visages', 'garde']), str(fns))
        check('Consigne : la famille (visages connus, messages, garde) et l\'objectif des clients actifs sur demande seulement',
              'Visages que tu reconnais : Timothée, Marie, Louis' in sysp and 'outil messages' in sysp and 'OBJECTIF CLIENTS ACTIFS' in sysp and 'Jamais de toi-même' in sysp, sysp[-1500:])

        # ---- M1 : déposer ----
        r = await outil(page, c, 'm1', 'messages', {'action': 'deposer', 'pour': 'Marie', 'de': 'Timothée', 'texte': 'je rentre vers 20h00'})
        dep = [x for x in st['calls'] if x['action'] == 'msg_deposer']
        check('Message déposé pour Marie, partagé par le script (M1, M2)', 'Message déposé' in r and dep and dep[-1]['msg']['pour'] == 'Marie' and dep[-1]['msg']['de'] == 'Timothée' and 'je rentre vers 20h00' in dep[-1]['msg']['texte'], r)
        r = await outil(page, c, 'm2', 'messages', {'action': 'deposer', 'pour': 'Paul', 'texte': 'appelle-moi'})
        check('Destinataire inconnu (« Paul ») : il demande pour qui, avec les prénoms qu\'il connaît', 'Je ne reconnais pas' in r and 'Marie' in r and not any(m['pour'] == 'Paul' for m in st['msgs'].values()), r)
        r = await outil(page, c, 'm3', 'messages', {'action': 'statut', 'pour': 'Marie'})
        check('Statut : pas encore remis', 'pas encore remis' in r, r)
        await page.evaluate("wilson.continuous = false; wilson.endConversation('test')"); await page.wait_for_timeout(400)

        # ---- M3 : remis à la bonne personne seulement, quand elle regarde Wilson ----
        n0 = len(conns)
        await page.evaluate("__regarde(true); __qui({ nom: 'Louis', sur: true }); wilson.famille._remiseAt = -1e9")
        await page.wait_for_timeout(2500)
        check('Louis le regarde : le message pour Marie ne lui est pas dit', len(conns) == n0 and not any('je rentre' in t for cn in conns for t in cn['texts']), str(len(conns) - n0))
        await page.evaluate("__qui({ nom: null, sur: false, probable: 'Marie', d: 0.53 })")
        await page.wait_for_timeout(2000)
        check('Marie « probable » mais pas sûre (V3) : rien', len(conns) == n0)
        await page.evaluate("__regarde(false); __qui({ nom: 'Marie', sur: true, facing: false })")
        await page.wait_for_timeout(2000)
        check('Marie reconnue mais ne le regarde pas (R1) : rien', len(conns) == n0)
        await page.evaluate("__regarde(true); __qui({ nom: 'Marie', sur: true })")
        await page.wait_for_function('wilson.brain.open', timeout=8000); await page.wait_for_timeout(500)
        c2 = conns[-1]
        check('Marie le regarde : Wilson ouvre la discussion et lui dit le message (M3)', len(conns) == n0 + 1 and any('Marie vient de te regarder' in t and 'je rentre vers 20h00' in t and 'Timothée' in t for t in c2['texts']), str(c2['texts']))
        check('… la réponse est permise sans qu\'elle ait parlé (regard sûr, R1)', await page.evaluate("wilson._reponsePermise()"))
        sys2 = c2['setup']['systemInstruction']['parts'][0]['text']
        check('… Gemini sait à qui il parle (« Marie, reconnu à son visage »), message pas demandé deux fois', 'Marie (reconnu à son visage)' in sys2 and 'Messages pour Marie' not in sys2, sys2[-900:])
        check('… pas encore marqué remis tant qu\'il ne l\'a pas dit', not any((m.get('remis') for m in st['msgs'].values())))
        send(c2, outputTranscription={'text': 'Marie, un message de Timothée : il rentre vers 20h.'}); send(c2, turnComplete=True)
        await page.wait_for_timeout(1500)
        rem = [x for x in st['calls'] if x['action'] == 'msg_remis']
        check('Dit → marqué remis à Marie, partagé par le script (M4)', rem and rem[-1]['a'] == 'Marie' and await page.evaluate("wilson.famille.msgs.some((m) => m.remis && m.pour === 'Marie')"), str(rem))
        r = await outil(page, c2, 'm4', 'messages', {'action': 'statut', 'pour': 'Marie'})
        check('Statut : remis (avec l\'heure)', 'remis à' in r, r)
        await page.evaluate("wilson.endConversation('test')"); await page.wait_for_timeout(300)
        n1 = len(conns); await page.evaluate("wilson.famille._remiseAt = -1e9"); await page.wait_for_timeout(2000)
        check('Pas redit une deuxième fois', len(conns) == n1)

        # ---- G : la garde ----
        await page.evaluate("wilson.famille.oreille.start = function () { this.worker = {}; }; wilson.famille.oreille.stop = function () { this.worker = null; }")
        await page.evaluate("wilson.startConversation('toucher')"); await page.wait_for_function('wilson.brain.open', timeout=8000); c3 = conns[-1]
        r = await outil(page, c3, 'g1', 'garde', {'action': 'activer'})
        check('« On part, surveille la maison » : garde activée, partagée (G1)', 'Garde activée' in r and await page.evaluate("wilson.famille.garde.on && wilson.famille.garde.mode === 'demandee'") and st['garde'] and st['garde']['on'], r)
        await page.evaluate("wilson.endConversation('test')"); await page.wait_for_timeout(1500)
        check('… l\'oreille de garde tourne pendant la garde (G2)', await page.evaluate("wilson.famille.oreille.on"))
        await page.evaluate("__qui({ nom: 'Marie', sur: true })"); await page.wait_for_timeout(300)
        check('Marie encore là au départ (pièce pas encore vide) : la garde continue', await page.evaluate("wilson.famille.garde.on"))
        await page.evaluate("__qui({ nom: null, sur: false, inconnu: true, d: 0.9 })"); await page.wait_for_timeout(500)
        check('Visage inconnu avant que la pièce soit vide : pas d\'alerte', not st['alertes'])
        await page.evaluate("__regarde(false); wilson.vision.hasPerson = false; wilson.vision.faces = 0; __qui(null); wilson.famille._videDepuis = performance.now() - 3 * 60000")
        await page.wait_for_timeout(1500)
        check('Pièce vide depuis 2 min : notée', await page.evaluate("!!wilson.famille.garde.vide") and has('Garde : la pièce est vide'))
        await page.evaluate("wilson.famille.oreille.onEvenement({ genre: 'sonnette', score: 0.6, info: true, t: Date.now() })")
        await page.evaluate("wilson.famille.oreille.onEvenement({ genre: 'fumee', score: 0.5, t: Date.now() })")
        await page.wait_for_timeout(800)
        al = st['alertes']
        check('Détecteur de fumée : e-mail par le script, avec la photo de la pièce (G3)', len(al) == 1 and al[0]['genre'] == 'fumee' and al[0]['texte'] == 'détecteur de fumée' and al[0]['photo'] == 'UEhPVE8=', str(al)[:300])
        check('… sonnette : pas d\'e-mail (racontée au retour, G4)', not any(a['genre'] == 'sonnette' for a in al))
        await page.evaluate("wilson.famille.oreille.onEvenement({ genre: 'fumee', score: 0.5, t: Date.now() })"); await page.wait_for_timeout(500)
        check('… même alerte 2 minutes après : pas de deuxième e-mail (10 min au plus)', len(st['alertes']) == 1)
        await page.evaluate("__qui({ nom: null, sur: false, inconnu: true, d: 0.9, facing: false })"); await page.wait_for_timeout(800)
        check('Visage inconnu, maison vide, garde demandée : alerte avec photo (G3)', len(st['alertes']) == 2 and st['alertes'][1]['genre'] == 'inconnu' and st['alertes'][1]['photo'], str(st['alertes'])[-200:])
        await page.evaluate("__qui({ nom: 'Louis', sur: true, facing: false })"); await page.wait_for_timeout(800)
        G = await page.evaluate("JSON.stringify(wilson.famille.garde)")
        resume = [m for m in st['msgs'].values() if m['de'] == 'Wilson']
        check('Louis rentre (reconnu) : garde arrêtée, partagée (G5)', '"on":false' in G and st['garde'] and not st['garde']['on'], G)
        check('… ce qui s\'est passé devient un message pour la famille (G4)', resume and resume[0]['pour'] == 'tous' and 'Pendant votre absence' in resume[0]['texte'] and 'sonnette' in resume[0]['texte'] and 'détecteur de fumée' in resume[0]['texte'], str(resume))
        n2 = len(conns)
        await page.evaluate("__regarde(true); __qui({ nom: 'Louis', sur: true }); wilson.famille._remiseAt = -1e9")
        await page.wait_for_function('wilson.brain.open', timeout=8000); await page.wait_for_timeout(400)
        check('… Louis le regarde : Wilson le lui raconte', len(conns) == n2 + 1 and any('Pendant votre absence' in t for t in conns[-1]['texts']), str(conns[-1]['texts']))
        await page.evaluate("wilson.endConversation('test')"); await page.wait_for_timeout(300)

        # Garde demandée depuis un autre appareil (le téléphone) : la tablette la prend à la lecture suivante.
        import time
        st['garde'] = {'on': True, 'mode': 'demandee', 't': int(time.time() * 1000) + 5000, 'par': 'téléphone'}
        await page.evaluate("wilson.famille.synchroniser()"); await page.wait_for_timeout(500)
        check('Garde demandée sur le téléphone : appliquée par la tablette', await page.evaluate("wilson.famille.garde.on && wilson.famille.garde.par === 'téléphone'"))
        st['garde'] = {'on': False, 't': int(time.time() * 1000) + 9000, 'par': 'téléphone'}
        await page.evaluate("wilson.famille.synchroniser()"); await page.wait_for_timeout(500)
        check('… et arrêtée de même', await page.evaluate("!wilson.famille.garde.on"))

        # G1 automatique : personne depuis 45 min (hors nuit), tablette seulement ; quelqu'un qui le regarde l'arrête.
        await page.evaluate("__regarde(false); wilson.vision.hasPerson = false; wilson.vision.faces = 0; wilson.presenceAt = performance.now() - 46 * 60000")
        await page.wait_for_timeout(1500)
        check('Personne vu depuis 45 min : garde automatique (G1)', await page.evaluate("wilson.famille.garde.on && wilson.famille.garde.mode === 'auto'") and has('Garde activée (automatique'))
        await page.evaluate("__qui({ nom: null, sur: false, inconnu: true, d: 0.9 })"); await page.wait_for_timeout(500)
        check('… garde automatique : un visage inconnu n\'envoie pas d\'alerte (la maison n\'est peut-être pas vide)', len(st['alertes']) == 2)
        await page.evaluate("wilson._lookShown = false; __regarde(true)"); await page.wait_for_timeout(800)
        check('… quelqu\'un le regarde : garde automatique arrêtée (G5)', await page.evaluate("!wilson.famille.garde.on"))

        # ---- O : l'objectif des clients actifs ----
        await page.evaluate("wilson.startConversation('toucher')"); await page.wait_for_function('wilson.brain.open', timeout=8000); c4 = conns[-1]
        await page.evaluate("wilson.continuous = true; wilson.brain.syncTools = false")
        r = await outil(page, c4, 'o1', 'crm_question', {'question': 'OBJECTIF CLIENTS ACTIFS, objectif 60'})
        g = json.dumps(st['gem'][-1], ensure_ascii=False) if st['gem'] else ''
        acts = [x['action'] for x in st['calls'] if x['action'].startswith('crm_')]
        check('Objectif (O2) : bilan officiel et rendez-vous du prochain jour ouvré joints à la question de l\'analyste', 'crm_bilan' in acts and 'crm_journee' in acts and 'OBJECTIF CLIENTS ACTIFS' in g and '41 clients actifs ce mois-ci' in g and 'AD2M (Angers)' in g and 'Objectif du mois : 60 clients actifs' in g, g[:600] + str(acts))
        check('… « objectif 60 » retenu dans les réglages (partagés)', await page.evaluate("wilson.settings.objectifActifs === 60"))
        check('… la réponse de l\'analyste revient à Wilson', 'il t\'en manque 19' in r, r)
        jr = [x for x in st['calls'] if x['action'] == 'crm_journee'][-1]
        check('… le prochain jour ouvré (jamais un samedi ni un dimanche)', jr['jour'] in ('demain', 'lundi') or re.match(r'\d\d/\d\d', jr['jour']), str(jr))
        await page.evaluate("wilson.continuous = false; wilson.endConversation('test')"); await page.wait_for_timeout(300)

        # ---- V : outil visages (liste, qui, oublier) ----
        await page.evaluate("wilson.startConversation('toucher')"); await page.wait_for_function('wilson.brain.open', timeout=8000); c5 = conns[-1]
        await page.evaluate("wilson.continuous = true")
        r = await outil(page, c5, 'v1', 'visages', {'action': 'liste'})
        check('Visages : liste des prénoms appris', 'Timothée' in r and 'Louis' in r, r)
        await page.evaluate("__qui({ nom: 'Louis', sur: true })")
        r = await outil(page, c5, 'v2', 'visages', {'action': 'qui'})
        check('Visages : qui me regarde', 'Je vois Louis' in r, r)
        r = await outil(page, c5, 'v3', 'visages', {'action': 'oublier', 'prenom': 'louis'})
        stockage = await page.evaluate("localStorage.getItem('wilson.visages') || ''")
        check('Visages : « oublie le visage de Louis » efface (V2)', 'oublié' in r and 'Louis' not in stockage and await page.evaluate("!wilson.qui.liste().includes('Louis')"), r)
        regl = await page.evaluate("localStorage.getItem('wilson.settings')")
        check('Empreintes jamais dans les réglages partagés, ni envoyées au script (V1)', 'desc' not in regl and not any('desc' in json.dumps(x) for x in st['calls']), '')
        check('… seulement les prénoms partent au script (pour le téléphone)', st['noms'] and set(st['noms']) <= {'Timothée', 'Marie', 'Louis'}, str(st['noms']))
        await page.evaluate("wilson.continuous = false; wilson.endConversation('test')"); await page.wait_for_timeout(300)

        # ---- L'agenda Famille (demande du 04/11/26, 21h26) ----
        await page.evaluate("wilson.startConversation('toucher')"); await page.wait_for_function('wilson.brain.open', timeout=8000); c7 = conns[-1]
        await page.evaluate("wilson.continuous = true")
        fns7 = [f['name'] for t in c7['setup'].get('tools', []) for f in t.get('functionDeclarations', [])]
        check('Outil agenda proposé, consigne : agenda Famille (pas les rendez-vous clients)', 'agenda' in fns7 and 'agenda Famille' in c7['setup']['systemInstruction']['parts'][0]['text'])
        import datetime
        j = (datetime.date.today() + datetime.timedelta(days=2)).isoformat()
        r = await outil(page, c7, 'a1', 'agenda', {'action': 'ajouter', 'titre': 'Médecin Louis', 'debut': j + 'T10:00', 'lieu': 'Angers'})
        ev = st['agenda'][-1] if st['agenda'] else {}
        exp = await page.evaluate("(d) => +new Date(d + 'T10:00:00')", j)
        check('« Mets le médecin de Louis dans l\'agenda » : ajouté à l\'heure locale, avec qui l\'a demandé', 'Ajouté dans l\'agenda Famille' in r and '10h00' in r and ev.get('debut') == exp and ev.get('titre') == 'Médecin Louis' and 'Ajouté par Wilson' in ev.get('note', ''), r + str(ev))
        r = await outil(page, c7, 'a2', 'agenda', {'action': 'ajouter', 'titre': 'Week-end chez mamie', 'debut': j, 'fin': (datetime.date.today() + datetime.timedelta(days=3)).isoformat(), 'journee': True})
        ev = st['agenda'][-1]
        check('Week-end : jours entiers, du … au …', ev.get('journee') is True and ev.get('debut') == j and ev.get('fin') and ' au ' in r, r + str(ev))
        r = await outil(page, c7, 'a3', 'agenda', {'action': 'ajouter', 'titre': 'Soirée', 'debut': '2020-01-10T20:00'})
        check('Date passée : il vérifie avec lui avant d\'ajouter', 'déjà passé' in r and len(st['agenda']) == 2, r)
        r = await outil(page, c7, 'a4', 'agenda', {'action': 'annuler'})
        check('« Annule » : seulement ce qu\'il vient d\'ajouter (le dernier)', 'Annulé' in r and len(st['agenda']) == 1 and st['agenda'][0]['titre'] == 'Médecin Louis', r)
        # Demande du 06/11/26 : déjà quelque chose de prévu → pas ajouté, il prévient et demande ; « oui » → ajouté quand même.
        r = await outil(page, c7, 'a6', 'agenda', {'action': 'ajouter', 'titre': 'Coiffeur', 'debut': j + 'T10:30'})
        check('Créneau déjà pris : pas ajouté, il dit ce qui est prévu (et dans quel agenda) et demande', 'PAS AJOUTÉ' in r and 'Médecin Louis' in r and 'agenda BOSCHAT LAVEIX' in r and 'quand_meme' in r and len(st['agenda']) == 1, r)
        decl7 = [f for t in c7['setup'].get('tools', []) for f in t.get('functionDeclarations', []) if f['name'] == 'agenda'][0]
        check('Outil agenda : toujours l\'agenda Famille (Timothée et Camille), paramètre quand_meme', 'quand_meme' in decl7['parameters']['properties'] and 'Timothée et Camille voient' in decl7['description'], decl7['description'][:200])
        r = await outil(page, c7, 'a7', 'agenda', {'action': 'ajouter', 'titre': 'Coiffeur', 'debut': j + 'T10:30', 'quand_meme': True})
        check('Il dit oui : ajouté quand même, dans l\'agenda Famille que Camille voit aussi', 'Ajouté dans l\'agenda Famille' in r and 'Camille' in r and len(st['agenda']) == 2 and st['agenda'][-1].get('quand_meme') is True, r)
        st['agenda'].pop()
        r = await outil(page, c7, 'a5', 'agenda', {'action': 'lire', 'du': j, 'jours': 3})
        check('« On a quoi ce week-end ? » : événements lus et dits', 'Week-end chez mamie' in r and 'Médecin Louis' in r and '(Angers)' in r, r)
        await page.evaluate("wilson.continuous = false; wilson.endConversation('test')"); await page.wait_for_timeout(300)

        # ---- Q : réactions muettes ----
        await page.evaluate("wilson.face.clearEmotion(); wilson.playEndAt = 0; wilson.reactions._sursautAt = -1e9; wilson.reactions.son(-62, -60); wilson.reactions.son(-12, -60)")
        check('Bruit fort soudain : sursaut, sans un mot (Q)', await page.evaluate("wilson.face.emotion === 'surprise'") and not await page.evaluate("wilson.speaking"))
        await page.evaluate("wilson.face.clearEmotion(); wilson.reactions._clinAt = -1e9; wilson.audio.lastVoicedAt = 0; __regarde(true); wilson.reactions._regardDepuis = performance.now() - 7000")
        await page.wait_for_timeout(600)
        check('Regardé 6 s sans qu\'on lui parle : clin d\'œil et sourire tendre', await page.evaluate("wilson.face.emotion === 'tendresse'"))
        await page.evaluate("wilson.face.clearEmotion(); wilson.reactions._sourires = {}; __qui({ nom: 'Marie', sur: true })"); await page.wait_for_timeout(200)
        check('Marie reconnue qui le regarde : sourire', await page.evaluate("wilson.face.emotion === 'joie'"))
        await page.evaluate("wilson.face.clearEmotion(); __qui({ nom: 'Marie', sur: true, d: 0.31 })"); await page.wait_for_timeout(200)
        check('… pas de nouveau sourire avant 30 min', await page.evaluate("wilson.face.emotion !== 'joie'"))
        await page.evaluate("wilson.face.clearEmotion(); wilson.reactions._inconnuAt = -1e9; __qui({ nom: null, sur: false, inconnu: true, d: 0.9 })"); await page.wait_for_timeout(200)
        check('Inconnu qui le regarde : tête penchée, curieux', await page.evaluate("wilson.face.emotion === 'curieux'"))
        await page.evaluate("wilson.startConversation('toucher')"); await page.wait_for_function('wilson.brain.open', timeout=8000)
        await page.evaluate("wilson.face.setEmotion('ecoute', 5000); wilson.reactions._sursautAt = -1e9; wilson.reactions.son(-62, -60); wilson.reactions.son(-12, -60)")
        check('Pendant une discussion : pas de réaction (Q1)', await page.evaluate("wilson.face.emotion !== 'surprise'"))
        await page.evaluate("wilson.endConversation('test')")
        bil = await page.evaluate("JSON.stringify(wilson.bilan())")
        check('Bilan : visages, messages, garde, réactions (sans empreintes)', 'Visages (sur cet appareil)' in bil and 'Garde de la maison' in bil and 'Réactions muettes' in bil and 'desc' not in bil, bil[:200])
        errs = [l for l in logs if 'PAGEERROR' in l or 'Erreur :' in l]
        check('Aucune erreur JavaScript (tablette)', not errs, str(errs[:3]))
        await page.context.close()

        # ================= Téléphone de Timothée =================
        import time
        st['msgs']['tel1'] = {'id': 'tel1', 'pour': 'Timothée', 'de': 'Marie', 'texte': 'pense au pain', 't': int(time.time() * 1000) - 60000, 'remis': None}
        page, logs = await ouvrir(TELEPHONE, {**base, 'camera': False})
        await page.evaluate("wilson.famille.synchroniser()"); await page.wait_for_timeout(500)
        check('Téléphone : les prénoms de la tablette arrivent par le script', await page.evaluate("wilson.famille.noms().includes('Marie')"))
        n3 = len(conns)
        await page.wait_for_timeout(2000)
        check('Téléphone : jamais de discussion ouverte de lui-même pour un message (remarque du 04/11/26, 17h57)', len(conns) == n3)
        await page.evaluate("wilson.startConversation('toucher')"); await page.wait_for_function('wilson.brain.open', timeout=8000); c6 = conns[-1]
        sys6 = c6['setup']['systemInstruction']['parts'][0]['text']
        check('Téléphone : le message pour Timothée est dans la consigne, à dire au début de sa discussion (M3)', 'Messages pour Timothée' in sys6 and 'pense au pain' in sys6, sys6[-600:])
        send(c6, outputTranscription={'text': 'Oui ? Au fait, un message de Marie : pense au pain.'}); send(c6, turnComplete=True)
        await page.wait_for_timeout(1200)
        check('… dit → remis', (st['msgs']['tel1'].get('remis') or {}).get('a') == 'Timothée', str(st['msgs']['tel1']))
        r = await outil(page, c6, 'p1', 'messages', {'action': 'deposer', 'pour': 'Marie', 'texte': 'j\'ai pris le pain'})
        check('Téléphone : message pour Marie déposé, la tablette le remettra', 'la tablette du salon' in r, r)
        r = await outil(page, c6, 'p2', 'garde', {'action': 'activer'})
        check('Téléphone : « surveille la maison » → garde demandée à la tablette par le script', 'tablette' in r and st['garde']['on'] and st['garde']['par'] == 'téléphone', r)
        r = await outil(page, c6, 'p3', 'visages', {'action': 'apprendre', 'prenom': 'Timothée'})
        check('Téléphone : pas d\'apprentissage de visage (seulement sur la tablette)', 'tablette' in r, r)
        st['script_a_jour'] = False
        r = await outil(page, c6, 'p4', 'messages', {'action': 'deposer', 'pour': 'Marie', 'texte': 'à ce soir'})
        check('Script pas à jour : il le dit (message gardé sur le téléphone)', 'pas encore à jour' in r, r)
        errs = [l for l in logs if 'PAGEERROR' in l or 'Erreur :' in l]
        check('Aucune erreur JavaScript (téléphone)', not errs, str(errs[:3]))
        await b.close()
    print(f'\n{sum(results)}/{len(results)} vérifications OK')
    raise SystemExit(0 if all(results) else 1)

asyncio.run(main())
