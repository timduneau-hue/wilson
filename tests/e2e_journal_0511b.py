"""Mise en situation d'après le journal du 05/11/26, 10h59-11h08 (téléphone relié à la voiture, 1.28.1).
Ce matin-là, dans l'ordre :
 1. Gemini se croyait sur la tablette du salon (« du canapé par exemple ») : depuis la 1.26.0, la voiture par Bluetooth
    n'allumait pas la consigne « En voiture » (réponses courtes, son mauvais → faire confirmer), ni 3 min d'essais sans réseau.
 2. Question sur les clients actifs → analyste en arrière-plan → « tu as le résultat de ton outil, réponds » alors qu'il
    n'y avait encore rien : « 120 clients actifs », puis « l'objectif c'est 135 » (inventés).
 3. La réponse de l'analyste est arrivée à la seconde où la discussion se fermait (silence) : jamais dite. « Wilson » 7 s
    après → « Oui ? » ; « j'attends la réponse » → « trou de mémoire » : la discussion suivante ne savait rien.
 4. « Pourquoi tu m'as parlé de Tech Metallu ? » (TECMETALU) : outil refusé 3 fois ; « tu peux répéter ? » → reafficher.
 5. « Ce soir, quand Wilson nous verra à la maison, rappelle-nous… » → memoriser (sujet perdu), effacé 2 min après par la
    passe de mémoire : la demande a disparu.
 6. Au journal : « Je cherche : petit son » 20 fois, « Maison : inventaire impossible » toutes les 10 min ; sur la tablette,
    « depart 192 » (l'air ennuyé à chaque visage perdu une fraction de seconde) ; l'analyste muet 60 s sur un modèle.
"""
import asyncio, re, json, os, base64, time, datetime
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
    { deviceId: 'id-bt', kind: 'audioinput', label: 'Bluetooth headset', groupId: 'g3' },
    { deviceId: 'cam', kind: 'videoinput', label: 'camera 1, facing front', groupId: 'g4' }].map((d) => ({ ...d, toJSON() { return d; } }));
  md.getUserMedia = async (c) => gum0(c && c.audio ? { audio: true, video: false } : c);
})();"""
GAZE = """setInterval(() => { const v = window.wilson && wilson.vision; if (!v) return;
  v.gazeReady = true; v.modelsDone = true; v.forceLook = false; v._lastResult = performance.now();
  v.looking = false; v.faceAt = performance.now(); v.hasPerson = true; v.faces = 1; }, 30);"""
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


def parle(conn, texte, sec=0.8, fin=True):
    ch = audio_chunks(sec)
    for c in ch[:2]: send(conn, modelTurn={'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': c}}]})
    send(conn, outputTranscription={'text': texte})
    for c in ch[2:]: send(conn, modelTurn={'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': c}}]})
    if fin: send(conn, turnComplete=True)


def outil(conn, name, args, cid):
    conn['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': cid, 'name': name, 'args': args}]}}))


async def main():
    st = {'calls': [], 'msgs': {}, 'plan': [], 'ana': [], 'ana_lent': 0, 'passe': {'ajouter': [], 'oublier': []}, 'avant_reponse': None, 'urls': []}
    conns = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 412, 'height': 900}, permissions=['microphone', 'camera'], service_workers='block', user_agent=PHONE_UA)
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AIzaTESTTESTTESTTESTTESTTESTTEST', listenMode:'regard', model:'gemini-3.1-flash-live-preview', logUrl:'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTEST/exec', crm:true, v:4}));")
        await ctx.add_init_script(STUB); await ctx.add_init_script(GAZE)
        page = await ctx.new_page(); logs = []

        async def script(route):
            req = route.request
            if req.method != 'POST': await route.fulfill(status=200, headers=H, body='ok'); return
            d = json.loads(req.post_data or '{}'); a = d.get('action', ''); st['calls'].append(d)
            if a == 'crm_schema': body = {'ok': True, 'texte': 'Tables : commandes (date, client, montant), clients (societe, ville).'}
            elif a == 'crm_requete': body = {'ok': True, 'texte': 'Recherche 1 : 19 clients distincts.'}
            elif a == 'crm_client': body = {'ok': True, 'cle': '["M FAUCHEUX Ludovic","TECMETALU SARL"]', 'societe': 'TECMETALU SARL', 'contact': 'M FAUCHEUX Ludovic', 'ville': 'Janzé', 'adresse': 'Janzé', 'texte': 'Client : TECMETALU SARL, Janzé. CA exercice : 12 482 €.', 'contacts': []}
            elif a == 'crm_bilan': body = {'ok': True, 'texte': 'Clients actifs ce mois-ci : 19.'}
            elif a == 'crm_journee': body = {'ok': True, 'rdv': [], 'texte': 'Aucun rendez-vous.'}
            elif a == 'msg_deposer':                                   # comme le script déployé : seulement ces champs-là
                m = d.get('msg', {}); st['msgs'][m['id']] = {k: m.get(k) for k in ['id', 'pour', 'de', 'texte', 't', 'par']}; st['msgs'][m['id']]['remis'] = None
                body = {'ok': True, 'id': m['id']}
            elif a == 'msg_lire': body = {'ok': True, 'messages': list(st['msgs'].values()), 'noms': ['Timothée'], 'garde': None}
            elif a == 'mem_lire' or a == 'mem_ecrire': body = {'ok': True, 'souvenirs': []}
            elif a == 'q_lire': body = {'ok': True, 'questions': []}
            else: body = {'ok': True, 'texte': 'ok', 'rdv': [], 'contacts': 10, 'brouillons': 0, 'reglages': None, 't': 0}
            await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(body, ensure_ascii=False))
        await page.route(re.compile(r'https://script\.google\.com/.*'), script)

        async def gem(route):
            req = route.request; post = req.post_data or ''
            if req.method == 'OPTIONS': await route.fulfill(status=204, headers={**H, 'access-control-allow-headers': '*'}); return
            st['urls'].append(req.url)
            try:
                if 'audio/wav' in post:                                 # vérification de « Wilson »
                    texte = st['plan'].pop(0) if st['plan'] else ''
                    o = {'texte': texte, 'nom_sur': bool(texte), 'tele': False}
                elif 'analyste du CRM' in post:
                    if st['ana_lent']: await asyncio.sleep(st['ana_lent'])
                    o = st['ana'].pop(0) if st['ana'] else {'action': 'repondre', 'reponse': 'Tu as 19 clients actifs sur un objectif de 50.'}
                    if st['avant_reponse']: f = st['avant_reponse']; st['avant_reponse'] = None; await f()
                elif 'la mémoire de Wilson' in post: o = st['passe']
                else: o = {}
                await route.fulfill(status=200, content_type='application/json', headers=H, body=gemini_json(o))
            except Exception: pass
        await page.route(GL, gem)
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
        await page.wait_for_timeout(1500)
        has = lambda t: any(t in l for l in logs)
        count = lambda t: len([l for l in logs if t in l])
        await page.evaluate("wilson.oreille.templates = [[1], [1], [1]]; wilson.oreille.seuil = 167.3; wilson.audio.speaking = false; wilson.audio.lastVoicedAt = 0;")
        sysp = lambda c: c['setup']['systemInstruction']['parts'][0]['text']
        resp = lambda c, cid: next((r['response'].get('result', '') for r in c['tools'] if r.get('id') == cid), None)

        async def attendre(cond, s=8.0):
            t0 = time.monotonic()
            while time.monotonic() - t0 < s:
                if cond(): return True
                await asyncio.sleep(0.1)
            return False

        async def reveil(texte):
            st['plan'][:] = [texte]; n = len(conns)
            await page.evaluate("wilson._nomCouvert = 0; wilson.playEndAt = 0; wilson._onName({ score: 80.0, limite: 167.3, duree: 1.2 })")
            await page.wait_for_function("wilson.state === 'conversation' && wilson.brain.open", timeout=10000)
            await attendre(lambda: len(conns) > n and conns[-1]['texts'], 4)
            return conns[-1]

        async def finir(why='test'):
            await page.evaluate(f"wilson.endConversation({json.dumps(why)})")
            await page.wait_for_function("wilson.state === 'veille'", timeout=8000)

        # ---------- 1. En voiture, Gemini le sait ----------
        check('Téléphone relié à la voiture (Bluetooth), sans l\'ancien mode voiture : en voiture', await page.evaluate("wilson._voitureBt && !wilson.car && wilson.enVoiture"))
        c = await reveil("Wilson, j'en suis où dans mes clients actifs ce mois-ci ?")
        sp = sysp(c)
        check('Consigne : « vit dans le téléphone de Timothée… dans sa voiture » (pas « la tablette du salon »)', 'vit dans le téléphone de Timothée' in sp and 'posée dans le salon' not in sp, sp[:200])
        check('… avec les règles « En voiture » (réponses courtes, son mauvais → reformuler et faire confirmer)', 'En voiture : Timothée conduit' in sp and 'reformule' in sp)
        check('Demande transmise : « Timothée t\'appelle en voiture », plus « du canapé par exemple »', any("t'appelle en voiture" in t and 'clients actifs' in t for t in c['texts']) and not any('canapé' in t for t in c['texts']), str(c['texts'])[:300])
        tab = await page.evaluate("(() => { Object.defineProperty(wilson, 'enVoiture', { get: () => false, configurable: true }); const t = wilson._texteDeLoin('allume la lumière'); delete wilson.enVoiture; return t; })()")
        check('… à la maison, la consigne « de loin » est inchangée', 'de loin' in tab and 'canapé' in tab, tab[:120])
        check('Consigne : aucun chiffre du CRM sans réponse du CRM ; recherche en arrière-plan = pas encore de résultat', 'tu n\'en connais AUCUN par cœur' in sp and 'je cherche encore' in sp)
        check('Consigne : réponses du CRM contradictoires → le dire, jamais d\'explication inventée', 'se contredisent' in sp and 'brouillon' in sp)
        check('Consigne : « répète » = redire sa phrase (pas reafficher) ; « rappelle-nous ce soir à la maison » = messages', 'surtout pas reafficher' in sp and 'aussi_pour_moi = true' in sp)
        declarees = {f['name']: f for f in c['setup']['tools'][0]['functionDeclarations']}
        props = declarees.get('messages', {}).get('parameters', {}).get('properties', {})
        check('Outil messages : aussi_pour_moi, a_la_maison, apres', all(k in props for k in ['aussi_pour_moi', 'a_la_maison', 'apres']), str(list(props)))

        # ---------- 2. Analyste en arrière-plan : pas de relance, pas de chiffre inventé ----------
        st['ana_lent'] = 9.0
        n0 = len(c['texts'])
        parle(c, 'Je regarde où tu en es... je cherche, je te tiens au courant.', fin=False)
        await page.wait_for_timeout(200)
        outil(c, 'crm_question', {'question': 'OBJECTIF CLIENTS ACTIFS ce mois-ci'}, 'q1')
        send(c, turnComplete=True)
        await page.wait_for_timeout(5500)
        r1 = resp(c, 'q1') or ''
        check('crm_question lancée en arrière-plan (réponse immédiate « je cherche, je te tiens au courant »)', 'arrière-plan' in r1, r1[:120])
        check('… et PAS de « Tu as le résultat de ton outil, réponds » 6 s après (11h05:51 : il a inventé « 120 clients »)',
              not any('[Tu as le résultat de ton outil' in t for t in c['texts'][n0:]) and not has('après le résultat de crm_question'), str(c['texts'][n0:])[:300])
        # Il invente quand même un chiffre : corrigé tout de suite
        n0 = len(c['texts'])
        parle(c, 'Alors, on est à 120 clients actifs pour ce mois-ci.')
        ok = await attendre(lambda: any('[ATTENTION : tu viens de dire « 120 clients' in t for t in c['texts'][n0:]), 3)
        att = next((t for t in c['texts'][n0:] if '[ATTENTION : tu viens de dire' in t), '')
        check('« 120 clients actifs » (aucune source) → il doit dire tout de suite qu\'il s\'est trompé', ok and 'la recherche est en cours' in att and has('Chiffre sans source'), att[:200])
        st['ana'][:] = []
        # La réponse arrive à la seconde où la discussion se fermerait pour silence (11h04:22)
        async def silence():
            await page.evaluate("(() => { const o = performance.now() - 70000; Object.assign(wilson, { playEndAt: o, _convAt: o, _prenomAt: o, _resumedAt: o, _heardAt: o, lastActivity: o, lastUserSpeech: o }); })()")
        st['avant_reponse'] = silence
        ok = await attendre(lambda: any('Résultat : Tu as 19 clients actifs' in t for t in c['texts']), 12)
        await page.wait_for_timeout(2500)
        etat = await page.evaluate("[wilson.state, wilson.brain.open, !!wilson._aDire]")
        check('Réponse de l\'analyste arrivée pile au moment où il se serait endormi : donnée dans la discussion', ok and any("J'ai la réponse à ta question" in t for t in c['texts']), str(c['texts'][-2:])[:300])
        check('… et la discussion reste ouverte le temps qu\'il la dise (11h04:22 : fermée à la même seconde)', etat[0] == 'conversation' and etat[1] and etat[2], str(etat))
        n0 = len(c['texts'])
        parle(c, "J'ai la réponse à ta question sur tes clients actifs : tu en as 19 sur un objectif de 50. Il t'en manque 31.")
        await page.wait_for_timeout(800)
        check('Wilson l\'a dite : plus rien en attente', await page.evaluate("!wilson._aDire") and has('Réponse attendue dite'))
        check('… « 19 sur 50 », « il t\'en manque 31 » : chiffres qui ont une source (50 − 19), pas de correction', not any('[ATTENTION : tu viens de dire' in t for t in c['texts'][n0:]), str(c['texts'][n0:]))
        J = await page.evaluate("[wilson._chiffreVu(12482, false), wilson._chiffreVu(12000, true), wilson._chiffreVu(38, false), wilson._chiffreVu(135, false), wilson._chiffreVu(10, false)]")
        check('Sources des chiffres : 38 % = 19/50 a une source ; 135 et 10 n\'en ont pas', J[2] and not J[3] and not J[4], str(J))
        n0 = len(c['texts'])
        parle(c, 'Tu as 2 rendez-vous demain et 3 devis.')
        await page.wait_for_timeout(600)
        check('… « 2 rendez-vous », « 3 devis » (il compte ce que le CRM a listé) : pas de correction', not any('[ATTENTION' in t for t in c['texts'][n0:]))

        # ---------- 3. Les derniers échanges : la discussion suivante sait ----------
        L = await page.evaluate("wilson.memory.log.slice(-6)")
        check('La demande arrivée par l\'oreille (« j\'en suis où dans mes clients actifs ») est dans les derniers échanges', any('clients actifs' in (e.get('user') or '') for e in L), json.dumps(L, ensure_ascii=False)[:300])
        # une recherche tourne encore pendant la discussion suivante
        st['ana_lent'] = 25.0
        outil(c, 'crm_question', {'question': 'les devis à relancer'}, 'q2')
        await page.wait_for_timeout(800)
        await finir('silence : personne ne lui parle')
        c2 = await reveil('Wilson, tu te rappelles pas ma dernière question ?')
        sp2 = sysp(c2)
        check('Discussion suivante : « votre dernière discussion date d\'il y a … : c\'est la suite »', "Votre dernière discussion date d'il y a" in sp2 and 'clients actifs' in sp2, sp2[-900:])
        check('… et elle sait qu\'une recherche tourne : « pas encore le résultat, dis que tu cherches encore »', 'Recherche dans le CRM en cours' in sp2 and 'les devis à relancer' in sp2)
        check('… consigne du réveil : « c\'est la suite de votre discussion d\'il y a … »', any("C'est la suite de votre discussion" in t for t in c2['texts']), str(c2['texts'])[:300])
        await finir('test')
        # (la recherche des devis est arrêtée : sa réponse « trop de temps » le réveillerait au milieu de la suite)
        await page.evaluate("for (const A of wilson._analyses.values()) A.ctl.abort()")
        await page.wait_for_timeout(1500)
        await page.evaluate("wilson._aDire = null")
        if await page.evaluate("wilson.state !== 'veille'"): await finir('test')
        st['ana_lent'] = 0

        # ---------- 4. Réponse pas dite : gardée, et il se réveille pour la dire ----------
        await page.wait_for_timeout(500)
        c3 = await reveil('Wilson, il me reste combien de devis à relancer ?')
        await page.evaluate("wilson._aDire = null; wilson._lateAnswer({ id: 'x1', question: 'les devis à relancer', t0: performance.now() - 40000 }, { dire: 'Tu as deux devis à relancer : AD2M et Pipard.' }, 40)")
        ok = await attendre(lambda: any('deux devis à relancer' in t for t in c3['texts']), 4)
        n = len(conns)
        await finir('silence : personne ne lui parle')                      # il ne l'a pas dite
        ok2 = await attendre(lambda: len(conns) > n and any('deux devis à relancer' in t and "J'ai la réponse" in t for t in conns[-1]['texts']), 8)
        check('Réponse envoyée mais pas dite avant la fin de la discussion : gardée (« pas encore dite »)', ok and has('pas encore dite : gardée pour la dire'))
        check('… en voiture, il se réveille tout seul pour la dire (C11 bis)', ok2, str([x['texts'] for x in conns[n:]])[:300])
        c4 = conns[-1]
        parle(c4, "J'ai la réponse à ta question sur les devis : deux devis à relancer, AD2M et Pipard.")
        await page.wait_for_timeout(600)
        check('… dite cette fois : plus rien en attente', await page.evaluate("!wilson._aDire"))
        await finir('test')

        # « Wilson » tout seul, une réponse attend → il la donne (pas « Oui ? »)
        await page.evaluate("wilson._aDire = { question: 'mon chiffre de la semaine', dire: 'Tu as fait 8 200 € cette semaine.', s: 30, at: Date.now(), conv: null, envoyeAt: 0, cle: 'x2' }")
        c5 = await reveil('Wilson')
        ok = await attendre(lambda: any('8 200 €' in t for t in c5['texts']), 4)
        check('« Wilson » tout seul alors qu\'une réponse attend (11h04:29) : il la donne, pas « Oui ? »', ok and not any('dis seulement « Oui ? »' in t for t in c5['texts']), str(c5['texts'])[:300])
        await finir('test')
        # « Bon ben j'attends la réponse, Wilson » → la réponse d'abord, avec ce qu'il vient de dire
        await page.evaluate("wilson._aDire = { question: 'mon chiffre de la semaine', dire: 'Tu as fait 8 200 € cette semaine.', s: 30, at: Date.now(), conv: null, envoyeAt: 0, cle: 'x3' }")
        c6 = await reveil("Bon ben j'attends la réponse, Wilson.")
        t6 = ' '.join(c6['texts'])
        check('« J\'attends la réponse, Wilson » (11h05:13) : la réponse passe d\'abord, avec sa phrase', '8 200 €' in t6 and 'Timothée vient de te dire' in t6 and "j'attends la réponse" in t6.lower(), t6[:300])
        await finir('test')

        # ---------- 5. Garde-fous des outils ----------
        c7 = await reveil('Wilson, tu es là ?')
        await page.evaluate("wilson.brain._emit('heard', \"Pourquoi tu m'as parlé de Tech Metallu ?\")")
        n0 = len([x for x in st['calls'] if x.get('action') == 'crm_client'])
        outil(c7, 'crm_client', {'client': 'TECMETALU'}, 't1')
        await attendre(lambda: resp(c7, 't1') is not None, 6)
        n1 = len([x for x in st['calls'] if x.get('action') == 'crm_client'])
        check('« Pourquoi tu m\'as parlé de Tech Metallu ? » → fiche de TECMETALU ouverte (refusée 3 fois à 11h07)', n1 > n0 and 'TECMETALU' in (resp(c7, 't1') or '') and not has('Outil crm_client refusé'), str(resp(c7, 't1'))[:150])
        await page.wait_for_timeout(1500)
        await page.evaluate("wilson.brain._emit('heard', \"Attends, tu peux répéter ta dernière phrase s'il te plaît ?\")")
        outil(c7, 'reafficher', {}, 't2')
        await attendre(lambda: resp(c7, 't2') is not None, 4)
        check('« Tu peux répéter ta dernière phrase ? » → pas reafficher : « redis simplement ta dernière phrase »', 'redis simplement ta dernière phrase' in (resp(c7, 't2') or ''), str(resp(c7, 't2')))
        await page.evaluate("wilson.brain._emit('heard', \"Réaffiche la météo, j'ai pas eu le temps de voir.\")")
        outil(c7, 'reafficher', {}, 't3')
        await attendre(lambda: resp(c7, 't3') is not None, 4)
        check('… « réaffiche la météo, j\'ai pas eu le temps » : reafficher permis', 'redis simplement' not in (resp(c7, 't3') or 'x'), str(resp(c7, 't3')))
        await page.evaluate("wilson.brain._emit('heard', \"Il faudra plutôt que tu nous le rappelles ce soir à la maison.\")")
        outil(c7, 'memoriser', {'fait': 'Quand Timothée et Camille rentrent ce soir, Wilson doit leur rappeler de discuter du sujet avec Camille.', 'categorie': 'autre'}, 't4')
        await attendre(lambda: resp(c7, 't4') is not None, 4)
        r4 = resp(c7, 't4') or ''
        mem = await page.evaluate("wilson.memoire.items.map((x) => x.texte)")
        check('memoriser « … ce soir, rappeler … » (11h01:25) : refusé, renvoyé vers messages (aussi_pour_moi, a_la_maison, apres)', 'pas un souvenir' in r4 and 'messages' in r4 and not any('rappeler de discuter' in x for x in mem), r4[:200])
        await page.evaluate("wilson.brain._emit('heard', \"Retiens que Camille n'aime pas la coriandre.\")")
        outil(c7, 'memoriser', {'fait': "Camille n'aime pas la coriandre.", 'categorie': 'gouts'}, 't5')
        await attendre(lambda: resp(c7, 't5') is not None, 4)
        check('… un vrai souvenir (« Camille n\'aime pas la coriandre ») est retenu', resp(c7, 't5') == 'mémorisé')

        # ---------- 6. « Rappelle-nous ce soir à la maison » ----------
        demain18 = (datetime.datetime.now() + datetime.timedelta(days=1)).strftime('%Y-%m-%dT18:00')
        outil(c7, 'messages', {'action': 'deposer', 'pour': 'Timothée et Camille', 'texte': "S'organiser pour le cadeau de Louis et voir avec les parents.", 'aussi_pour_moi': True, 'a_la_maison': True, 'apres': demain18}, 't6')
        await attendre(lambda: resp(c7, 't6') is not None, 6)
        r6 = resp(c7, 't6') or ''
        m = next((x for x in st['msgs'].values() if 'cadeau de Louis' in (x.get('texte') or '')), None)
        check('Rappel déposé pour « Timothée et Camille » → pour tous, partagé par le script', m and m['pour'] == 'tous' and 'la tablette du salon vous le dira' in r6, f'{m} {r6}')
        check('… le script déjà déployé le garde tel quel : réglages dans l\'id, « de » vide (la tablette en 1.28.0 le remet aussi à Timothée)', m and m['id'].startswith('r_') and '_ms_' in m['id'] and m['de'] == '', str(m))
        await page.evaluate("wilson.famille.synchroniser()")
        await page.wait_for_timeout(500)
        E = await page.evaluate("""(() => {
          const F = wilson.famille, tel = F.enAttente('Timothée').length, ctx = F.contexte('live');
          Object.defineProperty(F, 'telephone', { get: () => false, configurable: true });
          const tab = F.enAttente('Timothée').length;
          const m = F.msgs.find((x) => /cadeau de Louis/.test(x.texte)); const id0 = m.id;
          m.id = m.id.replace(/^r_[0-9a-z]*_/, 'r_' + (Date.now() - 60000).toString(36) + '_');
          const tabApres = F.enAttente('Timothée').map((x) => F._deQui(x));
          const camille = F.enAttente('Camille').length;
          m.id = id0; delete F.telephone; return { tel, ctx: /cadeau/.test(ctx), tab, tabApres, camille };
        })()""")
        check('… pas dit par le téléphone (à la maison seulement), ni avant son heure sur la tablette', E['tel'] == 0 and not E['ctx'] and E['tab'] == 0, str(E))
        check('… à partir de l\'heure, la tablette le dit à Timothée (« rappel laissé par Timothée ») et à Camille', len(E['tabApres']) == 1 and 'rappel laissé par Timothée' in E['tabApres'][0] and E['camille'] == 1, str(E))
        await finir('test')

        # ---------- 7. La passe de mémoire n'efface plus ce qu'on a demandé de retenir ----------
        idc = await page.evaluate("(wilson.memoire.items.find((x) => /coriandre/.test(x.texte)) || {}).id")
        st['passe'] = {'ajouter': [], 'oublier': [idc]}
        await page.evaluate("wilson.memoire.passe({ echanges: [{ user: 'On a parlé du cadeau de Louis pour ce soir avec Camille.', wilson: 'Super.' }] })")
        gardé = await page.evaluate("wilson.memoire.items.some((x) => /coriandre/.test(x.texte))")
        check('Passe de mémoire : un souvenir demandé n\'est pas « oublié » parce qu\'il semble ponctuel (11h03:15)', gardé and has('gardé (demandé par la famille'))
        await page.evaluate("wilson.memoire.passe({ echanges: [{ user: \"Oublie que Camille n'aime pas la coriandre, c'est plus vrai.\", wilson: 'D\\'accord.' }] })")
        parti = await page.evaluate("!wilson.memoire.items.some((x) => /coriandre/.test(x.texte))")
        check('… mais oublié quand on le demande', parti)

        # ---------- 8. Journal plus propre ----------
        c8 = await reveil('Wilson, tu peux noter une tâche ?')
        await page.evaluate("wilson._outilsEnCours = 1; window.__iv = setInterval(() => { wilson.audio.speaking = true; setTimeout(() => { wilson.audio.speaking = false; }, 300); }, 2600)")
        k0 = count('Je cherche : petit son de réflexion')
        await page.wait_for_timeout(9000)
        k1 = count('Je cherche : petit son de réflexion')
        await page.evaluate("clearInterval(window.__iv); wilson.audio.speaking = false; wilson._outilsEnCours = 0")
        check('« Je cherche : petit son… » noté une fois, même quand le bruit de la route passe pour de la voix (20 fois à 11h03)', k1 - k0 == 1, f'{k1 - k0} fois')
        await finir('test')
        M = await page.evaluate("""(async () => {
          const W = wilson, logs0 = [];
          let n = 0, ok = false; const vraie = W.maison;
          W.maison = { on: true, rafraichir: () => { n++; return ok ? Promise.resolve() : Promise.reject(new Error('Failed to fetch')); } };
          W._majMaison(); const voiture = n;                                  // en voiture : pas d'inventaire
          Object.defineProperty(W, 'enVoiture', { get: () => false, configurable: true });
          for (let i = 0; i < 4; i++) { W._majMaison(); await new Promise((r) => setTimeout(r, 30)); }
          ok = true; W._majMaison(); await new Promise((r) => setTimeout(r, 30));
          delete W.enVoiture; W.maison = vraie; W._maisonKo = null;
          return { voiture, n };
        })()""")
        check('Maison injoignable : pas d\'inventaire en voiture ; à la maison, noté une fois (pas toutes les 10 min), puis le retour',
              M['voiture'] == 0 and M['n'] == 5 and count('Maison : inventaire impossible (Failed to fetch)') == 1 and has('Maison : de nouveau joignable'), str(M))

        R = await page.evaluate("""import('./js/reactions.js').then(({ Reactions }) => {
          const faits = [];
          const app = { started: true, state: 'veille', _isNight: () => false, settingsOpen: false, speaking: false, phone: false, playEndAt: 0, qui: null, settings: {},
            audio: { lastVoicedAt: 0 }, face: { setEmotion: (e) => faits.push(e), play() {}, doWink() {} }, vision: { hasPerson: true, looking: false } };
          const R = new Reactions(app); let t = 1e7;
          for (let i = 0; i < 40; i++) { app.vision.hasPerson = i % 4 !== 0; R.tick(t += 250); }        // visage perdu un instant, souvent
          const flick = R.n.depart || 0;
          app.vision.hasPerson = false; for (let i = 0; i < 100; i++) R.tick(t += 250);                // vraiment parti (25 s)
          return { flick, parti: R.n.depart || 0 };
        })""")
        check('Tablette : plus l\'air ennuyé chaque fois que le visage échappe un instant (« depart 192 ») ; une fois parti 20 s, oui',
              R['flick'] == 0 and R['parti'] == 1, str(R))

        # ---------- 9. Analyste : un modèle muet → le suivant en même temps au bout de 20 s ----------
        async def ana(route):
            url = route.request.url
            if 'gemini-3.8-flash' in url: await asyncio.sleep(20); return
            try: await route.fulfill(status=200, content_type='application/json', headers=H, body=gemini_json({'action': 'repondre', 'reponse': 'Tu as 19 clients actifs.'}))
            except Exception: pass
        await page.unroute(GL); await page.route(GL, ana)
        A = await page.evaluate("""import('./js/analyste.js').then(async ({ Analyste }) => {
          localStorage.removeItem('wilson.analyste.refus'); localStorage.removeItem('wilson.analyste.schema');
          const L = []; const a = new Analyste({ ask: async (p) => ({ ok: true, texte: p.action === 'crm_schema' ? 'Tables : commandes' : 'rien' }), log: (m) => L.push(m) });
          a.relaisMs = 600; a.requeteMaxMs = 8000; a.modelUsed = 'gemini-3.8-flash'; const t0 = Date.now();
          const r = await a.repondre({ key: 'AIzaTESTTESTTESTTESTTESTTESTTEST', question: 'Combien de clients actifs ?' });
          const ms = Date.now() - t0, t1 = Date.now();
          const r2 = await a.repondre({ key: 'AIzaTESTTESTTESTTESTTESTTESTTEST', question: 'Et le mois dernier ?' });
          return { r, ms, r2, ms2: Date.now() - t1, L };
        })""")
        check('Analyste : 1er modèle muet → le suivant interrogé en même temps, réponse sans attendre le délai (60 s à 11h04)',
              A['r']['reponse'] == 'Tu as 19 clients actifs.' and A['r']['model'] != 'gemini-3.8-flash' and A['ms'] < 3000 and any('interrogé en même temps' in x for x in A['L']), json.dumps(A)[:300])
        check('… et ce modèle lent passe en dernier à la question suivante (plus d\'attente)', A['r2']['model'] != 'gemini-3.8-flash' and A['ms2'] < 1500, json.dumps(A)[:300])
        await page.unroute(GL)

        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, '; '.join(errs)[:300])
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")

asyncio.run(main())
