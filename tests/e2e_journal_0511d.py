"""Protocole voiture — mise en situation d'après le journal du 05/11/26, 15h52-16h04 (téléphone relié à la voiture, 1.29.0).
Ce qui s'est passé, dans l'ordre :
 1. La caméra s'allume en voiture (remarque de 15h54 : « ça sert à rien d'activer la caméra »).
 2. « Guide-moi vers Miroiterie 35 » → « Je regarde dans le CRM… j'ai Miroiterie 35 à Rennes. J'affiche l'itinéraire ? »
    sans outil (la fiche dit Bruz) ; puis itineraire demandé 3 fois (3 boutons, 2 messages).
 3. « Je reviens de l'entreprise Gallet, j'ai vu Christophe et les deux Sylvain » → « je vois Christophe et Sylvain Rault »,
    puis « C'est noté, j'ai ajouté la visite de Sylvain Motel » : aucun outil, rien d'enregistré.
 4. « Donne-moi les autres contacts de l'entreprise Galet » → « Marie-Laure Gallet et Sébastien Gallet » : inventés.
 5. Pas de bip pendant les recherches ; au retour du GPS et de l'appel, deux voix en même temps.
 6. « Gallet » → ART DU BOIS 72 ou GALLAIS SARL alors qu'on parlait de GALLAIS.
Le protocole voiture (PLAN 2 quinquies) : caméra éteinte, consigne courte et outils de la route, verrou de vérité (rien
n'est dit avant le résultat d'un outil ; sans outil : jamais dit, outil exigé, puis l'analyste interrogé par l'appli),
noms inventés coupés, bip quand il cherche, une seule voix, même outil jamais rejoué.
"""
import asyncio, re, json, os, base64, time
import numpy as np
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, '' if ok else detail, flush=True)

STUB = """(() => {
  window.__bt = true;
  const md = navigator.mediaDevices, gum0 = md.getUserMedia.bind(md);
  md.enumerateDevices = async () => [
    { deviceId: 'id-speaker', kind: 'audioinput', label: 'Speakerphone', groupId: 'g1' },
    ...(window.__bt ? [{ deviceId: 'id-bt', kind: 'audioinput', label: 'Bluetooth headset', groupId: 'g3' }] : []),
    { deviceId: 'cam', kind: 'videoinput', label: 'camera 1, facing front', groupId: 'g4' }].map((d) => ({ ...d, toJSON() { return d; } }));
  md.getUserMedia = async (c) => gum0(c && c.audio ? { audio: true, video: false } : c);
})();"""
PHONE_UA = 'Mozilla/5.0 (Linux; Android 15; SM-A266B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36'
GL = re.compile(r'https://generativelanguage\.googleapis\.com/v1beta/models/.*')
H = {'access-control-allow-origin': '*'}

CLIENTS = {
    'MIROITERIE': {'cle': '["M LEROY","MIROITERIE 35"]', 'societe': 'MIROITERIE 35', 'contact': 'M LEROY Paul', 'ville': 'Bruz', 'adresse': 'MIROITERIE 35 BRUZ', 'contacts': [{'nom': 'M LEROY Paul', 'tel': '06 11 22 33 44'}]},
    'GALLAIS': {'cle': '["MME AUDRAN Valerie","GALLAIS SARL"]', 'societe': 'GALLAIS SARL', 'contact': 'MME AUDRAN Valerie', 'ville': 'Chavagne', 'adresse': 'GALLAIS SARL CHAVAGNE',
                'contacts': [{'nom': 'MME AUDRAN Valerie', 'tel': '06 62 22 60 48'}, {'nom': 'MME CORDIER Isabelle', 'tel': '02 99 00 00 00'}]},
}
PLUSIEURS = 'Plusieurs clients possibles pour « {} » : ART DU BOIS 72, contact M DE GAULLE Nicolas ; GALLAIS SARL (GALLAIS SARL CHAVAGNE), contact MME CORDIER Isabelle.'


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


async def main():
    st = {'calls': [], 'lent': 0.0}
    conns = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(bypass_csp=True, viewport={'width': 412, 'height': 900}, permissions=['microphone', 'camera'], service_workers='block', user_agent=PHONE_UA)
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AIzaTESTTESTTESTTESTTESTTESTTEST', listenMode:'regard', model:'gemini-3.1-flash-live-preview', logUrl:'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTEST/exec', crm:true, camera:true, v:4}));")
        await ctx.add_init_script(STUB)
        page = await ctx.new_page(); logs = []

        async def script(route):
            req = route.request
            if req.method != 'POST': await route.fulfill(status=200, headers=H, body='ok'); return
            d = json.loads(req.post_data or '{}'); a = d.get('action', ''); st['calls'].append(d)
            if a == 'crm_client':
                if st['lent']: await asyncio.sleep(st['lent'])
                q = (d.get('client') or '').upper(); cle = d.get('cle') or ''
                hit = next((c for k, c in CLIENTS.items() if (cle and c['cle'] == cle) or (q and k in q)), None)
                if hit: body = {'ok': True, **hit, 'texte': f"Client : {hit['societe']}, {hit['adresse']}. Contacts : " + ', '.join(x['nom'] for x in hit['contacts']) + '.'}
                else: body = {'ok': True, 'texte': PLUSIEURS.format(d.get('client')), 'choix': [{'societe': 'ART DU BOIS 72'}, {'societe': 'GALLAIS SARL'}]}
            elif a == 'crm_schema': body = {'ok': True, 'texte': 'Tables : commandes (date, client, article, quantite).'}
            elif a == 'crm_requete': body = {'ok': True, 'texte': 'Recherche 1 : 28/10/26, GALLAIS SARL, 4 crémones pompier.'}
            elif a == 'crm_journee': body = {'ok': True, 'rdv': [], 'texte': 'Aucun rendez-vous.'}
            elif a in ('mem_lire', 'mem_ecrire'): body = {'ok': True, 'souvenirs': []}
            elif a == 'q_lire': body = {'ok': True, 'questions': []}
            elif a == 'msg_lire': body = {'ok': True, 'messages': [], 'noms': ['Timothée'], 'garde': None}
            else: body = {'ok': True, 'texte': 'ok', 'rdv': [], 'contacts': 10, 'brouillons': 0, 'reglages': None, 't': 0}
            await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(body, ensure_ascii=False))
        await page.route(re.compile(r'https://script\.google\.com/.*'), script)

        async def gem(route):
            req = route.request; post = req.post_data or ''
            if req.method == 'OPTIONS': await route.fulfill(status=204, headers={**H, 'access-control-allow-headers': '*'}); return
            try:
                if 'analyste du CRM' in post:
                    o = {'action': 'repondre', 'reponse': 'Le 28 octobre, Gallais SARL a pris quatre crémones pompier.'} if 'Recherche 1' in post else {'action': 'chercher', 'pourquoi': 'dernière commande', 'recherches': [{'table': 'commandes', 'filtres': [{'champ': 'client', 'op': '=', 'valeur': 'GALLAIS SARL'}]}]}
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
        sysp = lambda c: c['setup']['systemInstruction']['parts'][0]['text']
        resp = lambda c, cid: next((r['response'].get('result', '') for r in c['tools'] if r.get('id') == cid), None)
        dit = lambda t: any(l.startswith('Wilson : ') and t in l for l in logs) or any(('Wilson : ' + t[:40]) in l for l in logs)

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
            c = conns[-1]
            parle(c, 'Oui ?', sec=0.5)
            await page.wait_for_timeout(700)
            return c

        async def finir(why='test'):
            await page.evaluate(f"wilson.endConversation({json.dumps(why)})")
            await page.wait_for_function("wilson.state === 'veille'", timeout=8000)

        jouee = lambda: page.evaluate("wilson.audio.playing")

        # ---------- 1. Caméra éteinte, consigne courte, outils de la route ----------
        check('Téléphone relié à la voiture : protocole voiture', await page.evaluate("wilson._voitureBt"))
        check('Caméra éteinte en voiture (remarque de 15h54)', await page.evaluate("wilson.vision === null") and has('Voiture : caméra éteinte') and not has('Caméra prête'), str([l for l in logs if 'améra' in l]))
        c = await toucher()
        sp = sysp(c)
        noms = [f['name'] for f in c['setup']['tools'][0]['functionDeclarations']]
        check('Consigne de la voiture : « LE PROTOCOLE DE LA VOITURE », sans la tablette (maison, visages, écran)', 'LE PROTOCOLE DE LA VOITURE' in sp and 'Home Assistant' not in sp and 'tablette posée dans le salon' not in sp and len(sp) < 12000, f'{len(sp)} caractères')
        check('Outils de la route seulement (CRM, heure, météo, rappel, remarque…), pas regarder / afficher / maison / visages',
              all(n in noms for n in ['crm_client', 'crm_question', 'crm_noter', 'crm_confirmer', 'itineraire', 'date_et_heure', 'remarque']) and not any(n in noms for n in ['regarder', 'afficher', 'maison_commande', 'visages', 'garde', 'exprimer_emotion']), str(noms))

        # ---------- 2. « Guide-moi vers Miroiterie 35 » : rien sans outil, puis l'outil, une seule fois ----------
        send(c, inputTranscription={'text': 'Vas-y, guide-moi vers euh, Miroiterie 35.'})
        await page.wait_for_timeout(2000)
        check('Demande de travail : tour verrouillé, et le bip dit qu\'il cherche (même avec le bruit de la route)', has('Verrou de vérité : demande de travail') and has('Je cherche : petit son'))
        n0 = len(c['texts'])
        parle(c, "Je regarde dans le CRM... j'ai Miroiterie 35 à Rennes. J'affiche l'itinéraire ?", sec=2.0)
        await page.wait_for_timeout(500)
        check('« … j\'ai Miroiterie 35 à Rennes » sans outil : JAMAIS dit (pas joué, pas au journal comme dit)',
              not await jouee() and has('réponse sans outil retenue, JAMAIS DITE') and not dit("Je regarde dans le CRM... j'ai Miroiterie"), str([l for l in logs if 'Verrou' in l][-3:]))
        f1 = next((t for t in c['texts'][n0:] if "n'a PAS été dite" in t), '')
        check('… et il doit appeler itineraire tout de suite (« Sans résultat d\'outil, tu ne sais rien »)', 'itineraire avec le nom du client' in f1, f1[:300])
        outil(c, 'itineraire', {'client': 'Miroiterie 35'}, 'i1')
        await attendre(lambda: resp(c, 'i1') is not None, 6)
        parle(c, 'Le bouton pour aller chez Miroiterie 35, à Bruz, est affiché : appuie sur Y aller.', sec=1.0)
        await page.wait_for_timeout(300)
        check('Après le résultat de l\'outil : la réponse est dite (Bruz, la vraie ville)', await jouee() or dit('Le bouton pour aller chez Miroiterie 35'))
        outil(c, 'itineraire', {'client': 'Miroiterie 35'}, 'i2'); await page.wait_for_timeout(300)
        outil(c, 'itineraire', {'client': 'Miroiterie 35'}, 'i3')
        await attendre(lambda: resp(c, 'i3') is not None, 6)
        check('Itinéraire redemandé deux fois : un seul bouton, même résultat, rien de réaffiché', count("Bouton d'itinéraire affiché") == 1 and count('redemandé (même demande') == 2 and resp(c, 'i3') == resp(c, 'i1'), str(count("Bouton d'itinéraire affiché")))
        check('… le résultat dit que le guidage passe aussi sur l\'écran de la voiture', "l'écran de la voiture" in (resp(c, 'i1') or ''))
        await page.evaluate("wilson.hideCard()")
        await finir('silence : personne ne lui parle')

        # ---------- 3. « Je reviens de l'entreprise Gallet » : visite jamais dite « notée » sans outil ----------
        c = await toucher()
        send(c, inputTranscription={'text': "Là, je reviens de l'entreprise Gallet. Et où j'ai vu Christophe, mais j'ai aussi vu les deux Sylvain. Donc tu pourras indiquer que je les ai vus."})
        await page.wait_for_timeout(400)
        n0 = len(c['texts'])
        parle(c, "Je regarde dans le CRM... Pour l'entreprise Gallet, je vois Christophe et Sylvain Rault, mais je trouve pas de deuxième Sylvain.", sec=2.0)
        await page.wait_for_timeout(500)
        f = next((t for t in c['texts'][n0:] if "n'a PAS été dite" in t), '')
        check('« je vois Christophe et Sylvain Rault » sans outil : jamais dit ; il doit préparer la visite avec crm_noter', not dit('Pour l\'entreprise Gallet, je vois') and 'crm_noter' in f and 'type compte_rendu, échange visite' in f, f[:300])
        n0 = len(c['texts'])
        parle(c, "C'est noté, j'ai ajouté la visite de Sylvain Motel aujourd'hui pour l'entreprise Gallet.", sec=1.5)
        await page.wait_for_timeout(600)
        f = next((t for t in c['texts'][n0:] if 'Je n\'ai pas réussi' in t), '')
        check('« C\'est noté, j\'ai ajouté la visite » (toujours sans outil) : jamais dit ; il lui fait redire le client et la demande', not dit("C'est noté, j'ai ajouté") and bool(f), str(c['texts'][n0:])[:300])
        parle(c, "Je n'ai pas réussi. Redis-moi le nom du client et ce que tu veux, s'il te plaît.", sec=1.0)
        await page.wait_for_timeout(300)
        check('… cette phrase dictée par l\'appli est bien dite', dit("Je n'ai pas réussi"))
        await finir('test')

        # ---------- 4. Contacts : client pris parmi plusieurs (celui dont on parle), noms inventés coupés ----------
        c = await toucher()
        send(c, inputTranscription={'text': "C'est quoi l'adresse de Gallais ?"})
        await page.wait_for_timeout(300)
        outil(c, 'crm_client', {'client': 'GALLAIS'}, 'g0')
        await attendre(lambda: resp(c, 'g0') is not None, 6)
        parle(c, 'Gallais SARL est à Chavagne.', sec=0.8)
        await page.wait_for_timeout(500)
        send(c, inputTranscription={'text': "Donne-moi les autres contacts de l'entreprise Galet."})
        await page.wait_for_timeout(300)
        n0 = len(c['texts'])
        parle(c, "Je regarde dans le CRM... En plus de Christophe et Sylvain Motel, il y a Marie-Laure Gallet et Sébastien Gallet.", sec=2.0)
        await page.wait_for_timeout(500)
        f = next((t for t in c['texts'][n0:] if "n'a PAS été dite" in t), '')
        check('« Marie-Laure Gallet et Sébastien Gallet » sans outil : jamais dit ; crm_contacts exigé (les contacts : annuaire, 12/11/26)', not dit('En plus de Christophe') and ('crm_contacts' in f or 'crm_client' in f), f[:300])
        outil(c, 'crm_client', {'client': 'Gallet'}, 'g1')
        await attendre(lambda: resp(c, 'g1') is not None, 6)
        r = resp(c, 'g1') or ''
        check('« Gallet » → ART DU BOIS 72 ou GALLAIS : GALLAIS pris (celui dont on parlait), à faire confirmer', 'GALLAIS SARL' in r and "J'ai pris GALLAIS SARL" in r and 'demande-lui si c\'est bien lui' in r, r[:400])
        n0 = len(c['texts'])
        parle(c, "Chez Gallais SARL, à Chavagne, tu as Valérie Audran, Isabelle Cordier et Marie-Laure Gallet.", sec=2.5)
        ok = await attendre(lambda: any('[ATTENTION : tu viens de citer « Marie-Laure »' in t for t in c['texts'][n0:]), 4)
        check('Après l\'outil, « Marie-Laure » (dans aucune réponse du CRM) : phrase coupée et correction demandée', ok and has('« Marie-Laure » dit sans source') and not await jouee(), str(c['texts'][n0:])[:300])
        parle(c, "Pardon, je me suis trompé : chez Gallais SARL, tu as Valérie Audran et Isabelle Cordier.", sec=1.2)
        await page.wait_for_timeout(500)
        check('… la correction (noms du CRM seulement) est dite sans nouvelle coupure', dit('Pardon, je me suis trompé') and count('dit sans source') == 1)
        await finir('test')

        # ---------- 5. Deux fois sans outil sur une question : l'appli interroge elle-même l'analyste ----------
        c = await toucher()
        send(c, inputTranscription={'text': "C'est quand sa dernière commande, à Gallais ?"})
        await page.wait_for_timeout(300)
        parle(c, "Sa dernière commande date du 3 octobre.", sec=1.0)
        await page.wait_for_timeout(500)
        parle(c, "Je crois que c'était le 3 octobre, avec des paumelles.", sec=1.0)
        ok = await attendre(lambda: has("je pose moi-même sa question à l'analyste du CRM"), 4)
        check('Deux réponses sans outil : jamais dites, l\'appli pose elle-même la question à l\'analyste', ok and not dit('Sa dernière commande date du 3') and not dit('Je crois que c\'était'))
        ok = await attendre(lambda: any('Résultat : Le 28 octobre, Gallais SARL a pris quatre crémones pompier' in t for t in c['texts']), 12)
        check('… et la vraie réponse du CRM lui est donnée à dire (28 octobre, quatre crémones pompier)', ok, str(c['texts'][-2:])[:300])
        parle(c, "J'ai la réponse : le 28 octobre, Gallais SARL a pris quatre crémones pompier.", sec=1.2)
        await page.wait_for_timeout(500)
        check('… dite telle quelle', dit("J'ai la réponse : le 28 octobre"))
        # une question sans fait, dans une demande de travail : elle passe
        send(c, inputTranscription={'text': 'Emmène-moi chez le client.'})
        await page.wait_for_timeout(300)
        parle(c, 'Chez quel client ?', sec=0.7)
        await page.wait_for_timeout(600)
        check('« Chez quel client ? » (n\'affirme rien) : dite, même sans outil', dit('Chez quel client ?') and has("réponse qui n'affirme rien, dite"))
        await finir('test')

        # ---------- 6. Bip pendant que le CRM cherche, même avec le bruit de la route ----------
        c = await toucher()
        await page.evaluate("window.__bruit = setInterval(() => { wilson.audio.speaking = true; wilson.audio.lastVoicedAt = performance.now(); }, 50); window.__tics = 0; const t0 = wilson.audio.tone.bind(wilson.audio); wilson.audio.tone = (k) => { if (k === 'reflexion') window.__tics++; return t0(k); }; 0")
        st['lent'] = 4.5
        send(c, inputTranscription={'text': 'Et Miroiterie 35, le numéro du contact ?'})
        await page.wait_for_timeout(300)
        outil(c, 'crm_client', {'client': 'Miroiterie 35 numéro'}, 'm1')
        await attendre(lambda: resp(c, 'm1') is not None, 9)
        tics = await page.evaluate('window.__tics')
        check('Pendant la recherche dans le CRM (4,5 s, bruit de la route) : bip-bip', tics >= 1, f'tics={tics}')
        st['lent'] = 0
        await page.evaluate("clearInterval(window.__bruit); wilson.audio.speaking = false")
        parle(c, 'Le contact est Paul Leroy, au 06 11 22 33 44.', sec=1.0)
        await page.wait_for_timeout(400)
        await finir('test')

        # ---------- 7. Une seule voix ----------
        await page.evaluate("window.__dits = []; const s0 = wilson.voice.speak.bind(wilson.voice); wilson.voice.speak = (t) => { window.__dits.push(t); return s0(t); }; 0")
        await page.evaluate("wilson._sourd = { at: Date.now() - 160000, pourquoi: 'appli en arrière-plan ou écran éteint' }; wilson._sourdFin()")
        await page.wait_for_timeout(600)
        d = await page.evaluate('window.__dits')
        check('Retour du GPS après 160 s : plus de « J\'étais en arrière-plan… » par la voix du téléphone (un petit son seulement)', not any('arrière-plan' in x for x in d), str(d))
        c = await toucher()
        await page.evaluate("wilson.voice.speaking = true; window.__coupe = 0; const c0 = wilson.voice.cancel.bind(wilson.voice); wilson.voice.cancel = () => { window.__coupe++; wilson.voice.speaking = false; return c0(); }; 0")
        parle(c, "Je suis là, on reprend.", sec=0.8)
        await page.wait_for_timeout(400)
        check('Voix du téléphone en cours quand Wilson parle : coupée (une seule voix à la fois)', await page.evaluate('window.__coupe') >= 1 and has('une seule voix à la fois'))
        await finir('test')

        # ---------- 8. Hors voiture : caméra rallumée ----------
        await page.evaluate("wilson._voitureGraceMs = 0; window.__bt = false; navigator.mediaDevices.dispatchEvent(new Event('devicechange'))")
        ok = await attendre(lambda: has('plus de Bluetooth'), 6)
        await attendre(lambda: has('Caméra prête') or has('Caméra indisponible'), 6)
        check('Sortie de la voiture : caméra rallumée (règle du regard de nouveau)', ok and (has('Caméra prête') or has('Caméra indisponible')))

        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript', not errs, str(errs)[:400])
        await b.close()
    print(f'\n{sum(results)}/{len(results)} vérifications réussies')
    raise SystemExit(0 if all(results) else 1)

asyncio.run(main())
