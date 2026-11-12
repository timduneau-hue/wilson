"""Journal du 12/11/26 (version 1.41.1), téléphone relié à la voiture, rejoué :
 1. 08h41:57-08h46:37 : « amène-moi chez FMA » → guidage vers BOUYGUES E ET S FM FRANCE (Verrières-en-Anjou), cinq fois :
    le client s'écrit « F M A ». « FMA » est réessayé en « F M A » → le bon client.
 2. 08h45:03-08h45:17 : « supprime la destination dans le GPS », « enlève-le » → guidage relancé : refusé, et Wilson dit
    qu'il faut toucher la croix dans Google Maps.
 3. 08h44:11, 08h45:25, 08h45:53, 08h46:17 : « je veux aller voir la société FMA », « Je veux pas aller chez Bouygues… Je veux
    aller chez FMA », « tu vas naviguer vers… » puis le nom, « Oui. Oui. » à sa question : refusés à tort → permis.
 4. 08h44:33, 08h45:34, 08h46:58 : « お », « Voilà. », « c'est pas trop tôt » → « Il est 8h44 » : l'heure seulement s'il la demande.
 5. 09h55:10 : « Enregistre la visite chez Yoann Rousseau » envoyé à Claude (lecture seule) → refusé, crm_noter.
 6. 09h53-09h57 : compte rendu « pour Yoann Rousseau » préparé au nom de M ANGIBAULT Mathieu → à son nom, et Gemini sait
    que la fiche est à l'écran (« je ne peux pas l'afficher », 09h54:31).
 7. 08h48:16-08h48:17 : ouverte au toucher et rendormie dans la même seconde → un second toucher immédiat ne la rendort pas.
 8. Tablette, 08h26:10 : « la voiture a refusé » arrivé après la discussion, jamais su ensuite → dit d'abord à la suivante.
"""
import asyncio, re, json, os, base64, time
import numpy as np
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, '' if ok else detail, flush=True)

STUB = """(() => {
  window.__bt = true; window.__gum = 0;
  const md = navigator.mediaDevices, gum0 = md.getUserMedia.bind(md);
  md.enumerateDevices = async () => [
    { deviceId: 'id-speaker', kind: 'audioinput', label: 'Speakerphone', groupId: 'g1' },
    ...(window.__bt ? [{ deviceId: 'id-bt', kind: 'audioinput', label: 'Bluetooth headset', groupId: 'g3' }] : []),
    { deviceId: 'cam', kind: 'videoinput', label: 'camera 1, facing front', groupId: 'g4' }].map((d) => ({ ...d, toJSON() { return d; } }));
  md.getUserMedia = async (c) => { if (c && c.audio) window.__gum++; return gum0(c && c.audio ? { audio: true, video: false } : c); };
})();"""
PHONE_UA = 'Mozilla/5.0 (Linux; Android 15; SM-A266B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36'
GL = re.compile(r'https://generativelanguage\.googleapis\.com/v1beta/models/.*')
H = {'access-control-allow-origin': '*'}


def gemini_json(o):
    return json.dumps({'candidates': [{'content': {'parts': [{'text': json.dumps(o, ensure_ascii=False)}]}}]})


def audio_chunks(seconds):
    sr = 24000; t = np.arange(int(sr * seconds)) / sr
    pcm = (np.sin(2 * np.pi * 180 * t) * 8000).astype(np.int16)
    return [base64.b64encode(pcm[i:i + 4800].tobytes()).decode() for i in range(0, len(pcm), 4800)]


def send(conn, **sc):
    conn['ws'].send(json.dumps({'serverContent': sc}))


def parle(conn, texte, sec=1.0, fin=True):
    ch = audio_chunks(sec)
    for c in ch[:2]: send(conn, modelTurn={'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': c}}]})
    send(conn, outputTranscription={'text': texte})
    for c in ch[2:]: send(conn, modelTurn={'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': c}}]})
    if fin: send(conn, turnComplete=True)


def outil(conn, name, args, cid):
    conn['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': cid, 'name': name, 'args': args}]}}))



FMA = {'cle': '["M ANGIBAULT Mathieu","F M A"]', 'societe': 'F M A', 'contact': 'M ANGIBAULT Mathieu', 'ville': 'La Regrippière', 'adresse': 'F M A LA REGRIPPIERE',
       'contacts': [{'nom': 'M ANGIBAULT Mathieu', 'tel': '02 40 56 54 46'}, {'nom': 'M ROUSSEAU Yoann', 'tel': '02 40 56 54 46'}]}
BOUYGUES = {'cle': '["M DUPONT Paul","BOUYGUES E ET S FM FRANCE 548X"]', 'societe': 'BOUYGUES E ET S FM FRANCE 548X', 'contact': 'M DUPONT Paul', 'ville': 'Verrières-en-Anjou',
            'adresse': 'FGV6+P8 Verrières-en-Anjou', 'contacts': [{'nom': 'M DUPONT Paul', 'tel': '06 00 00 00 00'}]}


async def main():
    st = {'calls': [], 'claude': []}
    conns = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(bypass_csp=True, viewport={'width': 412, 'height': 900}, permissions=['microphone', 'camera'], service_workers='block', user_agent=PHONE_UA)
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AIzaTESTTESTTESTTESTTESTTESTTEST', listenMode:'regard', model:'gemini-3.1-flash-live-preview', logUrl:'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTEST/exec?k=0123456789abcdef0123456789abcdef', crm:true, camera:true, v:4}));")
        await ctx.add_init_script(STUB)
        page = await ctx.new_page(); logs = []

        async def script(route):
            req = route.request
            if req.method != 'POST': await route.fulfill(status=200, headers=H, body='ok'); return
            d = json.loads(req.post_data or '{}'); a = d.get('action', ''); st['calls'].append(d)
            if a == 'crm_client':
                q = (d.get('client') or '').upper()
                f = FMA if (q == 'F M A' or 'ROUSSEAU' in q or 'GIBAU' in q) else BOUYGUES if q else None
                body = {'ok': True, **f, 'texte': f"Client : {f['societe']}, {f['adresse']}. Contacts : " + ', '.join(c['nom'] for c in f['contacts']) + '.'} if f else {'ok': True, 'texte': 'Aucun client.'}
            elif a == 'crm_journee': body = {'ok': True, 'rdv': [], 'texte': 'Aucun rendez-vous.'}
            elif a == 'crm_brouillon': body = {'ok': True}
            elif a == 'claude_etat': body = {'ok': True, 'pc': {'vivant': True, 'vu': 3}}
            elif a == 'claude_demander':
                st['claude'].append(d); body = {'ok': True, 'accepte': True, 'id': d['id'], 'etat': 'attente', 'pc': {'vivant': True, 'vu': 3}}
            elif a in ('mem_lire', 'mem_ecrire'): body = {'ok': True, 'souvenirs': []}
            elif a == 'q_lire': body = {'ok': True, 'questions': []}
            elif a == 'msg_lire': body = {'ok': True, 'messages': [], 'noms': ['Timothée'], 'garde': None}
            else: body = {'ok': True, 'texte': 'ok', 'rdv': [], 'contacts': 10, 'brouillons': 0, 'reglages': None, 't': 0}
            await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(body, ensure_ascii=False))
        await page.route(re.compile(r'https://script\.google\.com/.*'), script)
        await page.route(GL, lambda r: asyncio.ensure_future(r.fulfill(status=200, content_type='application/json', headers=H, body=gemini_json({}))))
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
        page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))

        def handler(ws):
            conn = {'ws': ws, 'texts': [], 'tools': [], 'setup': None}; conns.append(conn)
            def on_msg(m):
                d = json.loads(m)
                if 'setup' in d: conn['setup'] = d['setup']; ws.send(json.dumps({'setupComplete': {}}))
                elif 'realtimeInput' in d and 'text' in d['realtimeInput']: conn['texts'].append(d['realtimeInput']['text'])
                elif 'toolResponse' in d: conn['tools'] += d['toolResponse']['functionResponses']
            ws.on_message(on_msg)
        await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)
        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
        has = lambda t: any(t in l for l in logs)
        sysp = lambda c: c['setup']['systemInstruction']['parts'][0]['text']
        resp = lambda c, cid: next((r['response'].get('result', '') for r in c['tools'] if r.get('id') == cid), None)
        cartes = lambda: page.evaluate("document.getElementById('cards').innerText")

        async def attendre(cond, s=8.0):
            t0 = time.monotonic()
            while time.monotonic() - t0 < s:
                r = cond()
                if asyncio.iscoroutine(r): r = await r
                if r: return True
                await asyncio.sleep(0.1)
            return False

        async def toucher():
            n = len(conns)
            await page.evaluate("wilson.sensors._emit('tap', 0.5, 0.5)")
            await page.wait_for_function("wilson.state === 'conversation' && wilson.brain.open", timeout=10000)
            await attendre(lambda: len(conns) > n and conns[-1]['texts'], 4)
            c = conns[-1]
            await page.wait_for_timeout(2600)               # (un retoucher dans les 2,5 s ne compte pas, voir 7)
            parle(c, 'Oui ?', sec=0.5)
            await page.wait_for_timeout(700)
            return c

        async def demande(c, texte):
            send(c, inputTranscription={'text': texte})
            await page.wait_for_timeout(300)

        async def tour(c, texte, nom, args, cid, s=8):
            await demande(c, texte)
            outil(c, nom, args, cid)
            await attendre(lambda: resp(c, cid) is not None, s)
            r = resp(c, cid) or ''
            parle(c, 'D\'accord.', sec=0.4); await page.wait_for_timeout(500)
            return r

        check('Téléphone relié à la voiture : protocole voiture', await page.evaluate("wilson._voitureBt"))
        c = await toucher()

        # ---------- 1. FMA n'est pas Bouygues ----------
        r = await tour(c, 'Wilson, amène-moi chez FMA.', 'itineraire', {'client': 'FMA'}, 'i1', 12)
        carte = await cartes()
        check('« Amène-moi chez FMA » : itinéraire vers F M A (La Regrippière), pas Bouygues (08h42:15)', 'REFUSÉ' not in r and 'F M A' in carte and 'BOUYGUES' not in carte.upper() and 'BOUYGUES' not in r, f'{r[:160]} | {carte[:120]}')
        check('… « FMA » réessayé en « F M A » auprès du CRM', [x.get('client') for x in st['calls'] if x.get('action') == 'crm_client'][:2] == ['FMA', 'F M A'] and has('réessayé en « F M A »'),
              str([x.get('client') for x in st['calls'] if x.get('action') == 'crm_client']))
        await page.evaluate("wilson.hideCard && wilson.hideCard()")

        # ---------- 2. Supprimer la destination : jamais relancé ----------
        n_cl = len([x for x in st['calls'] if x.get('action') == 'crm_client'])
        r = await tour(c, 'tu supprime la destination dans le GPS là.', 'itineraire', {'client': 'FMA'}, 'i2')
        check('« supprime la destination dans le GPS » : guidage NON relancé (08h45:08)', 'REFUSÉ' in r and 'ARRÊTER' in r and await cartes() == '', r[:200])
        check('… Wilson dit qu\'il faut toucher la croix dans Google Maps', 'touche la croix dans Google Maps' in r)
        r = await tour(c, 'Tu supprimes toutes les le GPS là, enlève-le.', 'itineraire', {'client': 'FMA'}, 'i3')
        check('« enlève-le » : refusé aussi (08h45:17)', 'REFUSÉ' in r and len([x for x in st['calls'] if x.get('action') == 'crm_client']) == n_cl, r[:120])

        # ---------- 3. Ses vraies demandes ----------
        for i, t in enumerate(["Et ben, tu m'emmènes pas au bon endroit. Là, tu m'emmènes chez Bouygues. Moi, je veux pas aller voir Bouygues, je veux aller voir la société FMA.",
                               'Je veux pas aller chez Bouygues Telecom France. Je veux aller chez FMA.']):
            await page.wait_for_timeout(300)
            r = await tour(c, t, 'itineraire', {'client': 'FMA'}, f'j{i}')
            check(f'« {t[-45:]} » : permis (refusé à tort le 12/11)', r and 'REFUSÉ' not in r, r[:200])
            await page.evaluate("wilson.hideCard && wilson.hideCard()")
        await demande(c, 'Maintenant, tu vas naviguer vers euh')
        parle(c, 'Vers où ça ?', sec=0.5); await page.wait_for_timeout(600)
        r = await tour(c, 'Mathieu Ongibaud', 'itineraire', {'client': 'Mathieu Ongibaud'}, 'j3', 10)
        check('« tu vas naviguer vers euh » puis « Mathieu Ongibaud » : permis (08h45:53)', r and 'REFUSÉ' not in r and 'F M A' in await cartes(), r[:200])
        await page.evaluate("wilson.hideCard && wilson.hideCard()")
        await demande(c, 'Je veux aller voir Mathieu Ongibaud, je crois.')
        parle(c, 'Tu confirmes que tu veux aller chez Mathieu Ongibaud ?', sec=0.6); await page.wait_for_timeout(700)
        c['ws'].send(json.dumps({'serverContent': {'turnComplete': True}}))
        await page.wait_for_timeout(300)
        r = await tour(c, 'Oui. Oui.', 'itineraire', {'client': 'Mathieu Ongibaud'}, 'j4', 10)
        check('« Oui. Oui. » à « tu confirmes que tu veux aller chez… ? » : permis (08h46:17)', r and 'REFUSÉ' not in r, r[:200])
        await page.evaluate("wilson.hideCard && wilson.hideCard()")

        # ---------- 4. L'heure ----------
        for i, t in enumerate(['お', 'Voilà.', "Bah, c'est pas trop tôt."]):
            r = await tour(c, t, 'date_et_heure', {}, f'h{i}')
            check(f'« {t} » → date_et_heure REFUSÉ, pas d\'heure donnée (08h44:33)', 'REFUSÉ' in r and not re.search(r'\d+h\d\d', r), r[:160])
        r = await tour(c, 'Il est quelle heure ?', 'date_et_heure', {}, 'h9')
        check('« Il est quelle heure ? » → l\'heure', 'REFUSÉ' not in r and re.search(r'\d+h\d\d', r), r)
        check('Consigne : l\'heure SEULEMENT s\'il la demande', "SEULEMENT s'il les demande" in sysp(c), '')

        # ---------- 5. Une écriture n'est jamais une question pour Claude ----------
        n_cl = len(st['claude'])
        r = await tour(c, 'Oui oui oui, fais-le.', 'crm_question', {'question': 'Enregistre la visite chez Yoann Rousseau : le client recherche des vis de rechange pour les fermes-portes GEZE.'}, 'q1')
        check('crm_question « Enregistre la visite… » : refusé, crm_noter (09h55:10)', 'REFUSÉ' in r and 'crm_noter' in r and 'lecture seule' in r and len(st['claude']) == n_cl, r[:200])

        # ---------- 6. Compte rendu au nom de Yoann Rousseau ----------
        r = await tour(c, 'Tu peux maintenant me saisir un compte-rendu pour Yoann Rousseau', 'crm_noter',
                       {'type': 'compte_rendu', 'client': 'Yoann Rousseau', 'echange': 'visite', 'texte': "Visite. Le client juge les chaussures de sécurité d'essai trop lourdes."}, 'n1', 10)
        carte = await cartes()
        check('Compte rendu « pour Yoann Rousseau » : la fiche à l\'écran porte son nom, pas M ANGIBAULT Mathieu (09h53:59)', 'ROUSSEAU Yoann' in carte and 'ANGIBAULT' not in carte and 'ROUSSEAU Yoann' in r, carte[:200])
        check('… et Gemini sait qu\'elle est affichée (« je ne peux pas l\'afficher », 09h54:31)', "AFFICHÉE à l'écran" in r, r[-200:])
        await page.evaluate("document.querySelector('#cards .card-ok').click()")
        ok = await attendre(lambda: any(x.get('action') == 'crm_brouillon' for x in st['calls']), 6)
        br = next((x for x in st['calls'] if x.get('action') == 'crm_brouillon'), {})
        check('… enregistré avec le contact Yoann Rousseau', ok and br.get('contact') == 'M ROUSSEAU Yoann' and 'ROUSSEAU' in br.get('texte', ''), json.dumps(br, ensure_ascii=False)[:200])

        # ---------- 7. Double toucher ----------
        await page.evaluate("wilson.sensors._emit('tap', 0.5, 0.2)")
        ok = await attendre(lambda: page.evaluate("wilson.state === 'veille'"), 4)
        check('Retoucher pendant la discussion : il se rendort (comme avant)', ok)
        await page.wait_for_timeout(500)
        n = len(conns)
        await page.evaluate("wilson.sensors._emit('tap', 0.5, 0.5)")
        await page.wait_for_timeout(400)
        await page.evaluate("wilson.sensors._emit('tap', 0.5, 0.5)")
        await page.wait_for_timeout(1500)
        check('Deux touchers rapprochés : ouverte, PAS rendormie dans la même seconde (08h48:17)', await page.evaluate("wilson.state") in ('conversation', 'eveil') and has('écran touché juste après le réveil : ignoré'), await page.evaluate("wilson.state"))
        await page.wait_for_timeout(1500)
        await page.evaluate("wilson.sensors._emit('tap', 0.5, 0.2)")
        ok = await attendre(lambda: page.evaluate("wilson.state === 'veille'"), 4)
        check('… et un toucher plus tard la rendort', ok)

        # ---------- 8. Nouvelles de la voiture après la discussion ----------
        await page.evaluate("""(async () => { wilson.maison.suiviVoiture = async () => ({ ok: false, texte: 'la voiture a refusé (API call POST /vehicle/control failed unexpectedly).' });
            wilson._say = async () => {}; await wilson._suiviVoiture({ appareil: 'Chauffage de la voiture', action: 'allumer' }); })()""")
        await page.wait_for_timeout(500)
        n = len(conns)
        await page.evaluate("wilson.sensors._emit('tap', 0.5, 0.5)")
        await page.wait_for_function("wilson.state === 'conversation' && wilson.brain.open", timeout=10000)
        await attendre(lambda: len(conns) > n and conns[-1]['texts'], 4)
        c = conns[-1]
        premier = (c['texts'] or [''])[0]
        check('« La voiture a refusé » arrivé hors discussion : dit d\'abord à la suivante (tablette, 08h26:10)', 'Avant tout' in premier and 'la voiture a refusé' in premier.lower(), premier[:200])
        check('… et gardé dans sa consigne (« tu disais quoi pour la voiture ? », 08h27:28)', 'Nouvelles de la voiture' in sysp(c) and 'a refusé' in sysp(c))

        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")

asyncio.run(main())
