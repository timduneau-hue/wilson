"""Mise en situation d'après le journal du 05/11/26, 14h35-14h50 (téléphone relié à la voiture, 1.28.2).
Cet après-midi-là, dans l'ordre :
 1. « Wilson » appelé 3, 5, 10 fois avant qu'il réponde (oreille : 40 vérifications pour rien en 2 min, « Gemini entend «  »
    → non ») ; remarque de Timothée à 14h48 : « en voiture, supprimer la détection de son ; je te réveillerai en touchant
    l'écran, on discutera, puis tu te rendormiras ».
 2. « Emmène-moi chez l'entreprise Galet » : le CRM propose ENTREPRISE CREZE et ENTREPRISE VIOLIN (le mot « entreprise »
    l'emportait), bouton d'itinéraire affiché pour CREZE (pris dans la liste, peut-être sur l'écho de sa propre voix :
    « Saint-Jacques-de-la-Lande ») ; GALLAIS SARL retrouvé ensuite, Wilson dit « j'affiche l'itinéraire » sans le faire, le
    bouton reste sur CREZE. Remarque de 14h41 : « que tu te rendes compte de ce qui est affiché ».
 3. « Il est quelle heure ? » répété 4 fois en 40 s : Google croyait encore entendre parler (bruit de la route) ; la consigne
    « réponds » partait au bout de 9 s et restait sans effet 18 s. Après une remarque, « visiblement on va pas y arriver… »
    resté sans réponse (« Wilson attend le résultat de son outil »), puis « c'est l'enfer, tu réponds pas ».
 4. « C'est noté… » dit avant le résultat de remarque, puis relancé : « C'est noté. Merci ! » de trop (14h40, 14h41).
 5. L'analyste : gemini-3.8-flash muet 20 s, comme à 11h03 (oublié au redémarrage de l'appli).
"""
import asyncio, re, json, os, base64, time
import numpy as np
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, '' if ok else detail, flush=True)

STUB = """(() => {
  const md = navigator.mediaDevices, gum0 = md.getUserMedia.bind(md);
  md.enumerateDevices = async () => [
    { deviceId: 'id-speaker', kind: 'audioinput', label: 'Speakerphone', groupId: 'g1' },
    ...(window.__bt === false ? [] : [{ deviceId: 'id-bt', kind: 'audioinput', label: 'Bluetooth headset', groupId: 'g3' }]),
    { deviceId: 'cam', kind: 'videoinput', label: 'camera 1, facing front', groupId: 'g4' }].map((d) => ({ ...d, toJSON() { return d; } }));
  md.getUserMedia = async (c) => gum0(c && c.audio ? { audio: true, video: false } : c);
})();"""
GAZE = """setInterval(() => { const v = window.wilson && wilson.vision; if (!v) return;
  v.gazeReady = true; v.modelsDone = true; v.forceLook = false; v._lastResult = performance.now();
  v.looking = false; v.faceAt = performance.now(); v.hasPerson = true; v.faces = 1; }, 30);"""
PHONE_UA = 'Mozilla/5.0 (Linux; Android 15; SM-A266B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36'
GL = re.compile(r'https://generativelanguage\.googleapis\.com/v1beta/models/.*')
H = {'access-control-allow-origin': '*'}

CLIENTS = {
    'CREZE': {'cle': '["MME FOUILLET Elisa","ENTREPRISE CREZE S.A.R.L"]', 'societe': 'ENTREPRISE CREZE S.A.R.L', 'contact': 'MME FOUILLET Elisa', 'ville': 'Saint-Jacques-de-la-Lande', 'adresse': 'CREZE ST JACQUES DE LA LANDE'},
    'GALLAIS': {'cle': '["MME AUDRAN Valerie","GALLAIS SARL"]', 'societe': 'GALLAIS SARL', 'contact': 'MME AUDRAN Valerie', 'ville': 'Chavagne', 'adresse': 'GALLAIS SARL CHAVAGNE'},
    'AD2M': {'cle': '["M DUPRE","AD2M"]', 'societe': 'AD2M', 'contact': 'M DUPRE', 'ville': 'Rennes', 'adresse': 'AD2M RENNES'},
    'PIPARD': {'cle': '["M PIPARD","PIPARD MENUISERIE"]', 'societe': 'PIPARD MENUISERIE', 'contact': 'M PIPARD', 'ville': 'Vitré', 'adresse': 'PIPARD VITRE'},
}
PLUSIEURS = 'Plusieurs clients possibles pour « {} » : ENTREPRISE CREZE S.A.R.L (CREZE ST JACQUES DE LA LANDE), contact MME FOUILLET Elisa ; ENTREPRISE VIOLIN (VIOLIN RENNES), contact M VIOLIN Paul. Demande-lui lequel.'


def gemini_json(o):
    return json.dumps({'candidates': [{'content': {'parts': [{'text': json.dumps(o, ensure_ascii=False)}]}}]})


def audio_chunks(seconds):
    sr = 24000; t = np.arange(int(sr * seconds)) / sr
    pcm = (np.sin(2 * np.pi * 180 * t) * 8000).astype(np.int16)
    return [base64.b64encode(pcm[i:i + 4800].tobytes()).decode() for i in range(0, len(pcm), 4800)]


def send(conn, **sc):
    conn['ws'].send(json.dumps({'serverContent': sc}))


def parle(conn, texte, sec=0.8, fin=True):
    ch = audio_chunks(sec)
    for c in ch[:2]: send(conn, modelTurn={'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': c}}]})
    send(conn, outputTranscription={'text': texte})
    for c in ch[2:]: send(conn, modelTurn={'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': c}}]})
    if fin: send(conn, turnComplete=True)


def outil(conn, name, args, cid):
    conn['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': cid, 'name': name, 'args': args}]}}))


async def main():
    st = {'calls': [], 'noms': []}
    conns = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 412, 'height': 900}, permissions=['microphone', 'camera'], service_workers='block', user_agent=PHONE_UA)
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AIzaTESTTESTTESTTESTTESTTESTTEST', listenMode:'regard', model:'gemini-3.1-flash-live-preview', logUrl:'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTEST/exec', crm:true, prenomMaison:true, v:4}));")
        await ctx.add_init_script(STUB); await ctx.add_init_script(GAZE)
        page = await ctx.new_page(); logs = []

        async def script(route):
            req = route.request
            if req.method != 'POST': await route.fulfill(status=200, headers=H, body='ok'); return
            d = json.loads(req.post_data or '{}'); a = d.get('action', ''); st['calls'].append(d)
            if a == 'crm_client':
                q = (d.get('client') or '').upper(); cle = d.get('cle') or ''
                st['noms'].append(d.get('client') or ('cle:' + cle))
                hit = next((c for k, c in CLIENTS.items() if (cle and c['cle'] == cle) or (q and k in q)), None)
                if hit: body = {'ok': True, **hit, 'texte': f"Client : {hit['societe']}, {hit['ville']}. Dernière visite : 10/10/26.", 'contacts': []}
                else: body = {'ok': True, 'texte': PLUSIEURS.format(d.get('client')), 'choix': [{'societe': 'ENTREPRISE CREZE S.A.R.L'}, {'societe': 'ENTREPRISE VIOLIN'}]}
            elif a == 'crm_journee': body = {'ok': True, 'rdv': [], 'texte': 'Aucun rendez-vous.'}
            elif a in ('mem_lire', 'mem_ecrire'): body = {'ok': True, 'souvenirs': []}
            elif a == 'q_lire': body = {'ok': True, 'questions': []}
            elif a == 'msg_lire': body = {'ok': True, 'messages': [], 'noms': ['Timothée'], 'garde': None}
            else: body = {'ok': True, 'texte': 'ok', 'rdv': [], 'contacts': 10, 'brouillons': 0, 'reglages': None, 't': 0}
            await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(body, ensure_ascii=False))
        await page.route(re.compile(r'https://script\.google\.com/.*'), script)

        async def gem(route):
            req = route.request
            if req.method == 'OPTIONS': await route.fulfill(status=204, headers={**H, 'access-control-allow-headers': '*'}); return
            try:
                st.setdefault('gem', []).append(req.post_data or '')
                o = {'texte': 'Wilson', 'nom_sur': True, 'tele': False} if 'audio/wav' in (req.post_data or '') else {}
                await route.fulfill(status=200, content_type='application/json', headers=H, body=gemini_json(o))
            except Exception: pass
        await page.route(GL, gem)
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
        page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))

        def handler(ws):
            conn = {'ws': ws, 'texts': [], 'tools': [], 'setup': None, 'ends': [], 'audio': []}; conns.append(conn)
            def on_msg(m):
                d = json.loads(m)
                if 'setup' in d: conn['setup'] = d['setup']; ws.send(json.dumps({'setupComplete': {}}))
                elif 'realtimeInput' in d:
                    ri = d['realtimeInput']
                    if 'text' in ri: conn['texts'].append(ri['text'])
                    if ri.get('audioStreamEnd'): conn['ends'].append(time.monotonic())
                    if 'audio' in ri: conn['audio'].append(time.monotonic())
                elif 'toolResponse' in d: conn['tools'] += d['toolResponse']['functionResponses']
            ws.on_message(on_msg)
        await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)
        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
        await page.wait_for_timeout(1500)
        has = lambda t: any(t in l for l in logs)
        count = lambda t: len([l for l in logs if t in l])
        sysp = lambda c: c['setup']['systemInstruction']['parts'][0]['text']
        resp = lambda c, cid: next((r['response'].get('result', '') for r in c['tools'] if r.get('id') == cid), None)
        carte = lambda: page.evaluate("(() => { const c = document.querySelector('#cards .card'); return c && !document.getElementById('cards').hidden ? c.dataset.kind + ':' + (c.querySelector('.card-n') || {}).textContent : ''; })()")

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
            await page.evaluate("wilson.startConversation('toucher')")
            await page.wait_for_function("wilson.state === 'conversation' && wilson.brain.open", timeout=10000)
            await attendre(lambda: len(conns) > n and conns[-1]['texts'], 4)
            return conns[-1]

        async def finir(why='test'):
            await page.evaluate(f"wilson.endConversation({json.dumps(why)})")
            await page.wait_for_function("wilson.state === 'veille'", timeout=8000)

        # ---------- 1. En voiture : ni oreille, ni regard ; le toucher ----------
        await page.evaluate("wilson.oreille.templates = [[1], [1], [1]]; wilson.oreille.seuil = 167.3;")
        check('Téléphone relié à la voiture : en voiture', await page.evaluate("wilson._voitureBt && wilson.enVoiture"))
        check('Journal : « réveil en touchant l\'écran (pas d\'oreille ni de regard) »', has("réveil en touchant l'écran (pas d'oreille ni de regard)"), str([l for l in logs if 'Voiture :' in l])[:300])
        check('… et plus « réveil en disant « Wilson » » ni « dis « Wilson » pour me parler »', not has('réveil en disant « Wilson »') and not has('dis « Wilson » pour me parler'))
        await page.evaluate("""window.__feeds = 0; window.__watch = 0; const f0 = wilson.oreille.feed.bind(wilson.oreille), w0 = wilson._watchFrame.bind(wilson);
          wilson.oreille.feed = (...a) => { window.__feeds++; return f0(...a); }; wilson._watchFrame = (...a) => { window.__watch++; return w0(...a); }; 0;""")
        await page.wait_for_timeout(2500)
        n = await page.evaluate("[window.__feeds, window.__watch, wilson.state, wilson._oreilleMaison]")
        check('En veille dans la voiture, le micro ne nourrit plus l\'oreille (même case « prenomMaison » cochée)', n[0] == 0 and n[3] is False, str(n))
        check('… ni le réveil au regard', n[1] == 0 and n[2] == 'veille', str(n))
        check('… et aucune vérification de « Wilson » envoyée à Gemini', not any('audio/wav' in x for x in st.get('gem', [])) and not has('Oreille (voiture)'))
        c = await toucher()
        check('Toucher l\'écran : il se réveille et dit seulement « Oui ? »', any("vient de toucher l'écran" in t and 'Oui ?' in t for t in c['texts']), str(c['texts'])[:300])
        sp = sysp(c)
        check('Consigne : en voiture il se réveille au toucher, ne jamais lui demander de dire « Wilson »', "Il te réveille en touchant l'écran" in sp and 'Ne lui demande jamais de dire « Wilson »' in sp)
        check('Consigne : un bouton ne s\'affiche que par l\'outil, rappeler l\'outil si le client change (protocole 1.30.0)', "ne dis jamais « j'affiche » sans les appeler" in sp and 'si le client change, rappelle l\'outil' in sp)
        await finir('silence : personne ne lui parle')
        # à la maison (téléphone sans voiture), l'oreille revient si la case est cochée
        await page.evaluate("window.__bt = false; wilson._voitureGraceMs = 0; wilson.audio.btIn = false; window.__feeds = 0")   # la voiture n'est plus là (plus de micro Bluetooth)
        await page.wait_for_timeout(4000)                 # micro fermé en veille dans la voiture (1.37.0) : rouvert en 2 s au plus
        n2 = await page.evaluate("[wilson._voitureBt, wilson._oreilleMaison, window.__feeds]")
        check('Sans la voiture (case « prenomMaison » cochée), l\'oreille écoute de nouveau', n2[0] is False and n2[1] is True and n2[2] > 0, str(n2))
        await page.evaluate("window.__bt = true; wilson.audio.btIn = true; wilson._voitureGraceMs = null")
        await page.wait_for_timeout(500)

        # ---------- 2. Le bouton d'itinéraire suit le bon client ----------
        c = await toucher()
        send(c, inputTranscription={'text': "Oui, tu peux… je vais voir l'entreprise Galet, tu peux activer le GPS ?"})
        await page.wait_for_timeout(300)
        outil(c, 'itineraire', {'client': 'entreprise Galet'}, 'i1')
        ok = await attendre(lambda: resp(c, 'i1') is not None, 8)
        check('« entreprise Galet » : le CRM reçoit « Galet » (sans le mot « entreprise »)', ok and 'Galet' in st['noms'] and 'entreprise Galet' not in st['noms'], str(st['noms']))
        check('… nom cherché noté au journal', has('nom cherché : « Galet » (dit : « entreprise Galet »)'))
        check('… plusieurs clients possibles : rien d\'affiché', 'Plusieurs clients' in (resp(c, 'i1') or '') and await carte() == '', resp(c, 'i1'))
        parle(c, "Est-ce que c'est l'entreprise Crézé à Saint-Jacques-de-la-Lande ou l'entreprise Violin à Rennes ?", sec=1.2)
        await page.wait_for_timeout(500)
        await page.evaluate("wilson.brain.inText = 'Saint-Jacques-de-la-Lande'; wilson.brain._emit('heard', 'Saint-Jacques-de-la-Lande')")
        outil(c, 'itineraire', {'client': 'ENTREPRISE CREZE S.A.R.L'}, 'i2')
        ok = await attendre(lambda: resp(c, 'i2') is not None, 8)
        check('CREZE choisi dans la liste : bouton affiché, marqué « choisi dans une liste »', ok and (await carte()) == 'route:ENTREPRISE CREZE S.A.R.L' and has('ENTREPRISE CREZE S.A.R.L (choisi dans une liste de clients possibles)'), await carte())
        check('… « Saint-Jacques-de-la-Lande » juste après sa propre phrase : « Écho possible » noté au journal', has('Écho possible : « Saint-Jacques-de-la-Lande »'))
        await page.evaluate("wilson.brain.inText = ''")
        parle(c, "OK, j'affiche le bouton pour aller chez ENTREPRISE CREZE.")
        await page.wait_for_timeout(600)
        check('… il l\'avait bien appelé : pas de 2e affichage', count("Bouton d'itinéraire affiché") == 1, str(count("Bouton d'itinéraire affiché")))
        # « Ah mais non, c'est pas ça. C'est l'entreprise Gallet. » → GALLAIS retrouvé
        send(c, inputTranscription={'text': "Ah mais non, c'est pas ça. Non, c'est G A 2 L A I S, Gallais."})
        await page.wait_for_timeout(300)
        outil(c, 'crm_client', {'client': 'GALLAIS'}, 'c1')
        ok = await attendre(lambda: resp(c, 'c1') is not None, 8)
        r = resp(c, 'c1') or ''
        check('GALLAIS SARL retrouvé : le bouton pris dans la liste (CREZE) devient celui de GALLAIS', ok and (await carte()) == 'route:GALLAIS SARL', await carte())
        check('… et Gemini le sait : « il est maintenant pour GALLAIS SARL. Dis-le-lui »', 'maintenant pour GALLAIS SARL' in r, r[:300])
        check('… journal : « remplacé par GALLAIS SARL »', has('remplacé par GALLAIS SARL'))
        parle(c, "C'est l'entreprise Gallais SARL, à Chavagne. Le bouton est maintenant pour Gallais.")
        await page.wait_for_timeout(500)
        # Bouton choisi directement (pas dans une liste) : il ne change pas tout seul, Gemini est prévenu
        send(c, inputTranscription={'text': 'Et emmène-moi plutôt chez AD2M.'})
        await page.wait_for_timeout(300)
        outil(c, 'itineraire', {'client': 'AD2M'}, 'i3')
        await attendre(lambda: resp(c, 'i3') is not None, 8)
        parle(c, "Le bouton pour aller chez AD2M est affiché.")
        await page.wait_for_timeout(400)
        send(c, inputTranscription={'text': "Et Pipard, c'est quand la dernière fois que je suis allé les voir ?"})
        await page.wait_for_timeout(300)
        outil(c, 'crm_client', {'client': 'PIPARD'}, 'c2')
        await attendre(lambda: resp(c, 'c2') is not None, 8)
        r2 = resp(c, 'c2') or ''
        check('Bouton choisi directement (AD2M) puis question sur un autre client : le bouton reste', (await carte()) == 'route:AD2M', await carte())
        check('… mais Gemini sait ce qui est à l\'écran (« À l\'écran : le bouton d\'itinéraire vers AD2M, pas vers PIPARD… »)', "À l'écran : le bouton d'itinéraire vers AD2M, pas vers PIPARD MENUISERIE" in r2, r2[:300])
        parle(c, "Pipard Menuiserie, à Vitré. Dernière visite le 10 octobre.")
        await page.wait_for_timeout(400)
        # « J'affiche l'itinéraire » sans outil (14h38:09) : l'appli l'affiche pour le dernier client trouvé
        parle(c, "C'est l'entreprise Pipard, à Vitré, c'est bien ça ? J'affiche l'itinéraire pour y aller.")
        await attendre(lambda: has("sans appeler l'outil"), 4)
        check('« J\'affiche l\'itinéraire » dit sans appeler l\'outil : l\'appli affiche le bouton du dernier client trouvé (PIPARD)', (await carte()) == 'route:PIPARD MENUISERIE' and has("sans appeler l'outil : bouton affiché par l'appli pour PIPARD MENUISERIE"), await carte())
        nb = count("Bouton d'itinéraire affiché")
        parle(c, "Tu veux que j'affiche l'itinéraire pour Pipard ?")
        await page.wait_for_timeout(800)
        parle(c, "Je ne peux pas afficher l'itinéraire sans adresse.")
        await page.wait_for_timeout(800)
        check('… une question (« tu veux que j\'affiche… ? ») ou une phrase négative ne déclenche rien', count("Bouton d'itinéraire affiché") == nb)
        await finir('silence : personne ne lui parle')
        c = await toucher()
        check('Discussion suivante : la consigne dit ce qui est à l\'écran', "À l'écran en ce moment : le bouton d'itinéraire vers PIPARD MENUISERIE" in sysp(c), sysp(c)[-600:])
        await page.evaluate("wilson.hideCard()")
        await finir('test')

        # ---------- 3. Bruit de la route : fin de phrase forcée ----------
        c = await toucher()
        parle(c, 'Oui ?', sec=0.5)
        await page.wait_for_timeout(1200)
        # le bruit de la route passe pour de la voix sur le micro du téléphone
        await page.evaluate("window.__bruit = setInterval(() => { wilson.audio.speaking = true; wilson.audio.lastVoicedAt = performance.now(); }, 50)")
        t0 = time.monotonic()
        send(c, inputTranscription={'text': "Parce qu'il est quelle heure là ?"})
        ok = await attendre(lambda: c['ends'], 7)
        dt = (c['ends'][0] - t0) if c['ends'] else None
        check('« Il est quelle heure ? » puis plus un mot (bruit de la route) : fin de phrase forcée (audioStreamEnd) en moins de 5 s', ok and dt is not None and dt < 5.2, f'dt={dt}')
        check('… journal : « fin de phrase forcée »', has('Google attend encore la fin de ta phrase') and has('fin de phrase forcée'))
        await page.wait_for_timeout(300)
        a0 = len([x for x in c['audio'] if x > c['ends'][0] + 0.2]) if c['ends'] else -1
        await page.wait_for_timeout(900)
        a1 = len([x for x in c['audio'] if x > c['ends'][0] + 0.2 and x < c['ends'][0] + 1.3]) if c['ends'] else -1
        check('… micro retenu juste après (le bruit ne relance pas « quelqu\'un parle »)', a1 == 0, f'a0={a0} a1={a1}')
        ok = await attendre(lambda: any('[Il a fini sa phrase' in t for t in c['texts']), 4)
        check('… toujours rien 2,5 s après : « Il a fini sa phrase : réponds-lui »', ok and has('toujours rien : je lui dis de répondre'))
        await page.evaluate("clearInterval(window.__bruit); wilson.audio.speaking = false")
        outil(c, 'date_et_heure', {}, 'h1')
        await attendre(lambda: resp(c, 'h1') is not None, 3)
        parle(c, 'Il est 14h47.')
        await page.wait_for_timeout(600)
        # Il répond dans les 2,5 s : pas de « réponds » en plus
        n0 = len(c['texts']); e0 = len(c['ends'])
        send(c, inputTranscription={'text': 'Et demain il fait beau ?'})
        await attendre(lambda: len(c['ends']) > e0, 6)
        parle(c, 'Je regarde la météo.')
        await page.wait_for_timeout(3200)
        check('Il répond juste après la fin forcée : pas de « réponds-lui » en plus', len(c['ends']) > e0 and not any('[Il a fini sa phrase' in t for t in c['texts'][n0:]) and has('Fin de phrase forcée : il répond'), str(c['texts'][n0:])[:200])
        # Remarque notée, puis Timothée reparle : sa phrase n'attend plus l'outil (14h48:25)
        n0 = len(c['texts']); e0 = len(c['ends'])
        send(c, inputTranscription={'text': 'Pour la prochaine mise à jour, en voiture, supprime la détection de son.'})
        outil(c, 'remarque', {'texte': 'En voiture, supprimer la détection de son.'}, 'r1')
        await attendre(lambda: resp(c, 'r1') is not None, 4)
        await page.wait_for_timeout(500)
        send(c, inputTranscription={'text': " Ouais, écoute, visiblement on va pas y arriver, s'il faut que je t'appelle dix fois…"})
        ok = await attendre(lambda: len(c['ends']) > e0, 7)
        check('Remarque notée puis Timothée reparle (14h48:25) : sa phrase a sa fin forcée, la relance « résultat de ton outil » ne la bloque plus', ok, str(c['texts'][n0:])[:300])
        send(c, turnComplete=True)
        await page.wait_for_timeout(700)
        check('… tour fini sans réponse : relance pour SA phrase (« s\'est tu… en voiture »), plus « attend le résultat de son outil »',
              has("Wilson s'est tu alors qu'on lui parlait (en voiture)") and not has('attend le résultat de son outil'), str([l for l in logs if 's\'est tu' in l or 'attend le résultat' in l])[-3:])
        parle(c, "C'est noté, je le garde pour la prochaine mise à jour.")
        await page.wait_for_timeout(500)

        # ---------- 4. « C'est noté » déjà dit avant le résultat de remarque : pas de relance ----------
        n0 = len(c['texts'])
        parle(c, "C'est noté. Tu aimerais que je contrôle mieux ce qui est affiché, c'est ça ?", sec=1.6, fin=False)
        await page.wait_for_timeout(300)
        outil(c, 'remarque', {'texte': 'Contrôler ce qui est affiché à l\'écran.'}, 'r2')
        await attendre(lambda: resp(c, 'r2') is not None, 4)
        send(c, turnComplete=True)
        await page.wait_for_timeout(5000)
        check('« C\'est noté… » dit avant le résultat de remarque (14h40:22) : pas de relance « tu as le résultat de ton outil »',
              not any('[Tu as le résultat de ton outil' in t for t in c['texts'][n0:]) and has('il a déjà répondu dans ce tour, pas de relance'), str(c['texts'][n0:])[:300])
        # contrôle : muet après remarque → la relance existe toujours
        n0 = len(c['texts'])
        send(c, inputTranscription={'text': 'Note que le son est mauvais.'})
        outil(c, 'remarque', {'texte': 'Le son est mauvais.'}, 'r3')
        await attendre(lambda: resp(c, 'r3') is not None, 4)
        send(c, turnComplete=True)
        ok = await attendre(lambda: any('[Tu as le résultat de ton outil' in t for t in c['texts'][n0:]), 9)
        check('… mais muet après le résultat : relance (comme avant), précédée d\'une fin de phrase forcée en voiture', ok and len(c['ends']) > 0, str(c['texts'][n0:])[:200])
        await finir('test')

        # ---------- 5. L'analyste se souvient d'un modèle lent, même après un redémarrage ----------
        J = await page.evaluate("""(() => { const A = wilson.crm.analyste; A.lent['gemini-3.8-flash'] = Date.now() + 7200000; A.modelUsed = 'gemini-3.5-flash-lite'; A._saveLent();
          const B = new A.constructor({ ask: async () => ({}), log: () => {} });
          return [B.lent['gemini-3.8-flash'] > Date.now() + 3600000, B.modelUsed]; })()""")
        check('Analyste : modèle lent (gemini-3.8-flash, 14h44) et dernier modèle qui a répondu retenus après un redémarrage (2 h)', J[0] is True and J[1] == 'gemini-3.5-flash-lite', str(J))

        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, str(errs)[:400])
        await b.close()
    print(f'\n{sum(results)}/{len(results)} vérifications réussies')
    raise SystemExit(0 if all(results) else 1)

asyncio.run(main())
