"""Journal du 12/11/26, 08h41-09h57 (version 1.41.1), téléphone relié à la voiture (appli Android), rejoué — noms changés.
Ce que Timothée a vécu : « amène-moi chez ABM » → 18 s, puis le guidage part chez une AUTRE société ; « je veux pas aller chez
Grandbat, je veux aller chez ABM » refusé ; « supprime la destination » → guidage relancé ; l'heure donnée cinq fois sans
demande ; « qui est le magasinier ? » → 46 s ; compte rendu préparé au nom du mauvais contact, impossible à corriger, puis
envoyé en « question » à Claude (lecture seule) ; « Tu as besoin d'autre chose ? » malgré trois interdictions.
 1. L'annuaire du CRM est gardé sur le téléphone : client ET personne retrouvés tout de suite, sans chercher par le CRM.
 2. « Amène-moi chez ABM » : guidage vers A B M (pas la société dont un mot ressemble), sans attendre le CRM.
 3. En voiture, les nouveautés de la mise à jour ne sont pas annoncées.
 4. « Je veux pas aller chez Grandbat. Je veux aller chez ABM. » : lancé (refusé le 12/11).
 5. « Supprime la destination dans le GPS » : rien n'est relancé ; il dit comment arrêter.
 6. « Voilà. » → date_et_heure : l'heure n'est PAS donnée, et le tour n'est pas verrouillé ; demandée → donnée.
 7. Nom approximatif (« Gallet ») : rien n'est lancé, il fait confirmer ; « oui » → lancé.
 8. « Qui est le magasinier chez ABM ? » : réponse immédiate par l'annuaire (crm_contacts, ou crm_question sans IA).
 9. Compte rendu : au nom de la personne citée ; corrigé d'un mot ; le brouillon part avec la clé de CE contact.
10. Une écriture envoyée en crm_question : refusée, renvoyée vers crm_noter (rien à Claude).
11. Question au CRM : les mots exacts de Timothée accompagnent la question résumée par Wilson.
12. « Tu as besoin d'autre chose ? » à la fin d'une réponse : coupé.
12 bis. Il refuse qu'on écrive (19/11/26, 16h13) : « je n'ajoute rien » dit, aucun outil exigé.
13. « Ma journée » : rendez-vous du CRM et agendas Google réunis, sans doublon.
13 bis. « Mon prochain rendez-vous » (19/11/26, 11h17) : le prochain d'après l'heure, pas celui déjà commencé.
13 ter. Relié à la voiture après le début d'un rendez-vous (19/11/26, 14h07) : il en sort, c'est le suivant.
13 quater. « C'est parti, je te guide vers … » sans l'outil (19/11/26, 14h08-14h09) : pas dit, itineraire demandé.
13 quinquies. Rendez-vous avec la personne d'une agence (23/11/26) : guidé à l'adresse de cette personne, pas au siège.
 9 bis. Deux sociétés au nom proche : la personne citée (crm_noter, contact) choisit celle où elle travaille (19/11/26, 17h11).
14. CRM pas encore à jour (pas d'annuaire) : le CRM rend la mauvaise société → rien n'est lancé, il fait confirmer.
"""
import asyncio, re, json, os, base64, time
import numpy as np
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, '' if ok else detail, flush=True)

STUB = """(() => {
  window.__bt = false; window.__nav = [];
  window.WilsonAndroid = { version: () => '6', naviguer: (a, n) => { window.__nav.push([a, n]); return 'ok : Google Maps'; }, peutRevenir: () => true, demanderRetour: () => {}, revenir: () => {}, premierPlan: () => true, bluetoothVoiture: () => true, sonVoiture: () => 'mode normal, sorties : Bluetooth musique;, silence', etatSon: () => 'mode normal' };
  const md = navigator.mediaDevices, gum0 = md.getUserMedia.bind(md);
  md.enumerateDevices = async () => [
    { deviceId: 'id-speaker', kind: 'audioinput', label: 'Speakerphone', groupId: 'g1' },
    { deviceId: 'cam', kind: 'videoinput', label: 'camera 1, facing front', groupId: 'g4' }].map((d) => ({ ...d, toJSON() { return d; } }));
  md.getUserMedia = async (c) => gum0(c && c.audio ? { audio: true, video: false } : c);
})();"""
PHONE_UA = 'Mozilla/5.0 (Linux; Android 15; SM-A266B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36 WilsonAndroid/6'
GL = re.compile(r'https://generativelanguage\.googleapis\.com/v1beta/models/.*')
H = {'access-control-allow-origin': '*'}

# societe, contact, fonction, code, ville, adresse, tel, mail, visite
ANNUAIRE = [
    ['A B M', 'M ANJUBAULT Mathieu', 'BE', 'C2000001', 'A B M LA ROCHE', 'A B M LA ROCHE', '02 40 00 00 01', '', ''],
    ['A B M', 'M MOREAU Yoann', 'Responsable magasin', 'C2000001', 'A B M LA ROCHE', 'A B M LA ROCHE', '02 40 00 00 01', '', ''],
    ['A B M', 'M LEMERCIER Valentin', 'Resp. commercial', 'C2000001', 'Nantes', '5 rue de l\'Agence 44000 Nantes', '06 00 00 00 02', '', ''],   # à l'agence (13 quinquies)
    ['GRANDBAT E ET S AB FRANCE 548X', 'M DURAND Paul', 'Acheteur', 'C1000001', 'Verrières-en-Anjou', 'FGV6+P8 Verrières-en-Anjou', '02 41 00 00 04', '', ''],
    ['GALLOIS SARL', 'M MOREAU Christophe', 'Gérant', 'C1000002', 'Chavagne', '3 rue des Lilas 35310 Chavagne', '02 99 00 00 05', '', ''],
    ['LEBRE', 'M LEBRE Jean', '', 'C1000005', 'Vigneux-de-Bretagne', '44360 Vigneux-de-Bretagne', '06 11 22 33 44', '', ''],
]
def fiche(societe):
    l = [x for x in ANNUAIRE if x[0] == societe]
    return {'ok': True, 'cle': json.dumps([l[0][1], societe], ensure_ascii=False, separators=(',', ':')), 'societe': societe, 'contact': l[0][1], 'ville': l[0][4], 'adresse': l[0][5],
            'contacts': [{'nom': x[1], 'fonction': x[2], 'tel': x[6], 'cle': json.dumps([x[1], societe], ensure_ascii=False, separators=(',', ':'))} for x in l],
            'texte': f"Client : {societe}, {l[0][4]}\nContact : {l[0][1]}\nDernière date de visite : 27/10/26."}


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


async def ouvrir(p, avec_annuaire):
    st = {'calls': [], 'claude': [], 'n_res': {}}; conns = []; logs = []
    b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
        f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
    ctx = await b.new_context(bypass_csp=True, viewport={'width': 412, 'height': 900}, permissions=['microphone', 'camera'], service_workers='block', user_agent=PHONE_UA)
    await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AIzaTESTTESTTESTTESTTESTTESTTEST', listenMode:'regard', model:'gemini-3.1-flash-live-preview', logUrl:'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTEST/exec?k=0123456789abcdef0123456789abcdef', crm:true, camera:true, v:4}));")
    await ctx.add_init_script(STUB)
    page = await ctx.new_page()

    async def script(route):
        req = route.request
        if req.method != 'POST': await route.fulfill(status=200, headers=H, body='ok'); return
        d = json.loads(req.post_data or '{}'); a = d.get('action', ''); st['calls'].append(d)
        if a == 'crm_annuaire':
            body = {'ok': True, 'contacts': ANNUAIRE, 'n': len(ANNUAIRE), 'le': '12/11/2026 08h40'} if avec_annuaire else {'ok': False, 'erreur': 'action inconnue du CRM : crm_annuaire'}
        elif a == 'crm_client':
            if d.get('cle'): body = fiche(json.loads(d['cle'])[1])
            else:   # le CRM d'avant la correction : un sigle de trois lettres retrouve la société dont un mot lui ressemble
                q = (d.get('client') or '').upper()
                body = fiche('GRANDBAT E ET S AB FRANCE 548X') if 'ABM' in q else fiche('LEBRE') if 'LEBRE' in q else {'ok': True, 'texte': 'Aucun client ne correspond.'}
        elif a == 'crm_journee' and st.get('rdv') is not None:    # 13 bis : rendez-vous à l'heure du test
            body = {'ok': True, 'jour': '?', 'rdv': st['rdv'], 'taches': 0, 'texte': "Aujourd'hui : " + ' ; '.join(f"{r['heure']} : {r['contact']}, {r['societe']}" for r in st['rdv'])}
        elif a == 'crm_journee':
            body = {'ok': True, 'jour': '12/11/2026', 'rdv': [{'cle': '["M LEBRE Jean","LEBRE"]', 'contact': 'M LEBRE Jean', 'societe': 'LEBRE', 'ville': 'Vigneux-de-Bretagne', 'heure': '10h00'}], 'taches': 0,
                    'texte': "Aujourd'hui, jeudi 12/11/26 : 1 rendez-vous.\n- 10h00 : M LEBRE Jean, LEBRE (Vigneux-de-Bretagne)\nAucune tâche due."}
        elif a == 'agenda_lire':
            j = lambda h, m=0: int(time.mktime(time.strptime(f'2026-11-12 {h}:{m}', '%Y-%m-%d %H:%M')) * 1000)
            body = {'ok': True, 'tous': bool(d.get('tous')), 'evenements': [
                {'titre': 'RDV LEBRE - M LEBRE Jean', 'debut': j(10), 'fin': j(11), 'journee': False, 'lieu': '', 'agenda': 'Timothée'},
                {'titre': 'Réunion agence', 'debut': j(14), 'fin': j(15, 30), 'journee': False, 'lieu': 'Nantes', 'agenda': 'BOSCHAT LAVEIX'},
                {'titre': 'Médecin Louis', 'debut': j(18), 'fin': j(18, 30), 'journee': False, 'lieu': '', 'agenda': 'Famille'}]}
        elif a == 'crm_brouillon': body = {'ok': True, 'id': 'b1', 'texte': 'Compte rendu préparé.'}
        elif a == 'crm_bilan': body = {'ok': True, 'texte': 'Exercice à ce jour : 258 576 €.'}
        elif a == 'claude_etat': body = {'ok': True, 'pc': {'vivant': True, 'vu': 3}}
        elif a == 'claude_demander':
            st['claude'].append(d); body = {'ok': True, 'accepte': True, 'id': d['id'], 'etat': 'attente', 'pc': {'vivant': True, 'vu': 3}}
        elif a == 'claude_resultat':
            n = st['n_res'][d['id']] = st['n_res'].get(d['id'], 0) + 1
            body = {'ok': True, 'etat': 'en_cours', 'pris': 1, 'pc': {'vivant': True, 'vu': 3}} if n == 1 else \
                {'ok': True, 'etat': 'faite', 'dire': 'À ta visite du 27 octobre, Yoann parlait du nouveau magasin.', 'detail': '', 'etapes': 2, 'duree': 4, 'pc': {'vivant': True, 'vu': 3}}
        elif a in ('mem_lire', 'mem_ecrire'): body = {'ok': True, 'souvenirs': []}
        elif a == 'q_lire': body = {'ok': True, 'questions': []}
        elif a == 'msg_lire': body = {'ok': True, 'messages': [], 'noms': ['Timothée'], 'garde': None}
        else: body = {'ok': True, 'texte': 'ok', 'rdv': [], 'contacts': 10, 'brouillons': 0, 'reglages': None, 't': 0}
        await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(body, ensure_ascii=False))
    await page.route(re.compile(r'https://script\.google\.com/.*'), script)

    async def gem(route):
        req = route.request
        if req.method == 'OPTIONS': await route.fulfill(status=204, headers={**H, 'access-control-allow-headers': '*'}); return
        try: await route.fulfill(status=200, content_type='application/json', headers=H, body=gemini_json({}))
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
    return b, page, st, conns, logs


async def main():
    async with async_playwright() as p:
        b, page, st, conns, logs = await ouvrir(p, True)
        has = lambda t: any(t in l for l in logs)
        sysp = lambda c: c['setup']['systemInstruction']['parts'][0]['text']
        resp = lambda c, cid: next((r['response'].get('result', '') for r in c['tools'] if r.get('id') == cid), None)
        nav = lambda: page.evaluate("window.__nav")
        cartes = lambda: page.evaluate("document.getElementById('cards').innerText")

        async def attendre(cond, s=8.0):
            t0 = time.monotonic()
            while time.monotonic() - t0 < s:
                r = cond()
                if asyncio.iscoroutine(r): r = await r
                if r: return True
                await asyncio.sleep(0.1)
            return False

        async def toucher(pg=page, cs=conns):
            n = len(cs)
            await pg.evaluate("wilson.sensors._emit('tap', 0.5, 0.5)")
            await pg.wait_for_function("wilson.state === 'conversation' && wilson.brain.open", timeout=10000)
            await attendre(lambda: len(cs) > n and cs[-1]['texts'], 4)
            c = cs[-1]
            parle(c, 'Oui ?', sec=0.5)
            await pg.wait_for_timeout(700)
            return c

        async def demande(c, texte, pg=page):             # ce que Timothée dit (transcription), avant l'appel d'outil
            send(c, inputTranscription={'text': texte})
            await pg.wait_for_timeout(300)

        # ---------- 1. L'annuaire ----------
        check('Téléphone relié à la voiture (appli Android) : protocole voiture', await page.evaluate("!!wilson._voitureBt"))
        ok = await attendre(lambda: page.evaluate("wilson.crm.annuaire.pret"), 12)
        check('Annuaire du CRM lu au démarrage et gardé sur le téléphone', ok and has('annuaire : 6 contacts, 4 sociétés gardés') and await page.evaluate("!!localStorage.getItem('wilson.annuaire')"), str([l for l in logs if 'annuaire' in l][-2:]))
        check('Onglet État : ligne « Annuaire du CRM »', '6 contacts' in (await page.evaluate("wilson.bilan()['Annuaire du CRM (sur cet appareil)'] || ''")))

        # ---------- 2. « Amène-moi chez ABM » ----------
        c = await toucher()
        check('Consigne : contacts par crm_contacts (immédiat), la personne dans crm_noter, arrêt du guidage, heure seulement sur demande',
              'crm_contacts' in sysp(c) and 'contact = la personne vue' in sysp(c) and 'arrête la navigation' in sysp(c) and "SEULEMENT s'il les demande" in sysp(c))
        check('Outil crm_contacts déclaré en voiture, et « contact » dans crm_noter', any(f['name'] == 'crm_contacts' for t in c['setup']['tools'] for f in t.get('functionDeclarations', []))
              and any(f['name'] == 'crm_noter' and 'contact' in f['parameters']['properties'] for t in c['setup']['tools'] for f in t.get('functionDeclarations', [])))
        check('En voiture : pas d\'annonce des nouveautés de la mise à jour (12/11, 08h42:28)', 'première discussion depuis' not in sysp(c))
        n0 = len(st['calls'])
        await demande(c, 'Wilson, amène-moi chez ABM.')
        t0 = time.monotonic()
        outil(c, 'itineraire', {'client': 'ABM'}, 'i1')
        ok = await attendre(lambda: resp(c, 'i1') is not None, 6)
        dt = time.monotonic() - t0; N = await nav()
        check('« Amène-moi chez ABM » : guidage lancé vers A B M (pas la société dont un mot ressemble)', ok and N and N[-1][0] == 'A B M LA ROCHE' and N[-1][1] == 'A B M' and 'A B M' in (resp(c, 'i1') or '') and 'GRANDBAT' not in (resp(c, 'i1') or ''), f'{N} {resp(c, "i1")}')
        check('… tout de suite (18,5 s le 12/11), sans chercher le nom par le CRM', dt < 2.5 and not any(x.get('action') == 'crm_client' and x.get('client') for x in st['calls'][n0:]), f'{dt:.1f} s {[x.get("action") for x in st["calls"][n0:]]}')
        ok = await attendre(lambda: has("fiche lue d'avance : A B M"), 5)
        check('… et sa fiche est lue d\'avance, en arrière-plan (par sa clé)', ok and any(x.get('action') == 'crm_client' and x.get('cle') for x in st['calls'][n0:]))
        parle(c, "C'est parti, je te guide vers ABM.", sec=0.6); await page.wait_for_timeout(700)

        # ---------- 4. « Je veux pas aller chez Grandbat. Je veux aller chez ABM. » ----------
        n = len(await nav())
        await demande(c, 'Je veux pas aller chez Grandbat Telecom France. Je veux aller chez ABM.')
        outil(c, 'itineraire', {'client': 'ABM '}, 'i2')
        ok = await attendre(lambda: resp(c, 'i2') is not None, 6)
        check('« Je veux pas aller chez Grandbat. Je veux aller chez ABM. » : pas refusé (08h45:25)', ok and 'REFUSÉ' not in (resp(c, 'i2') or '') and 'A B M' in (resp(c, 'i2') or ''), resp(c, 'i2'))
        parle(c, "C'est parti, je te guide vers ABM.", sec=0.6); await page.wait_for_timeout(700)
        await demande(c, 'Je veux pas aller chez Grandbat. Je veux aller chez ABM.')
        outil(c, 'itineraire', {'client': 'Grandbat'}, 'i2b')
        ok = await attendre(lambda: resp(c, 'i2b') is not None, 6)
        check('… mais le guidage vers celui dont il ne veut PAS est refusé', ok and 'REFUSÉ' in (resp(c, 'i2b') or '') and 'ne veut PAS aller chez ce client' in (resp(c, 'i2b') or ''), resp(c, 'i2b'))
        parle(c, 'Pardon.', sec=0.4); await page.wait_for_timeout(600)

        # ---------- 5. « Supprime la destination » ----------
        n = len(await nav())
        await demande(c, 'tu supprime la destination dans le GPS là.')
        outil(c, 'itineraire', {'client': 'ABM'}, 'i3')
        ok = await attendre(lambda: resp(c, 'i3') is not None, 6)
        r = resp(c, 'i3') or ''
        check('« Supprime la destination dans le GPS » : rien n\'est relancé (relancé deux fois le 12/11)', ok and 'REFUSÉ' in r and len(await nav()) == n and has("il demande d'ARRÊTER le guidage"), r[:200])
        check('… et il dit comment arrêter (« OK Google, arrête la navigation »)', 'OK Google, arrête la navigation' in r)
        parle(c, 'Je ne peux pas arrêter le guidage moi-même : dis « OK Google, arrête la navigation ».', sec=0.8); await page.wait_for_timeout(800)

        # ---------- 6. L'heure sans demande ----------
        ln = len(logs)
        await demande(c, 'Voilà.')
        check('« Voilà. » juste après une demande de travail : le tour n\'est PAS verrouillé', not any('demande de travail' in l for l in logs[ln:]), str(logs[ln:]))
        outil(c, 'date_et_heure', {}, 'h1')
        ok = await attendre(lambda: resp(c, 'h1') is not None, 5)
        check('… et date_et_heure ne donne pas l\'heure (« Il est 8h46 », cinq fois le 12/11)', ok and "PAS demandé l'heure" in (resp(c, 'h1') or '') and not re.search(r'\d+h\d\d', resp(c, 'h1') or ''), resp(c, 'h1'))
        send(c, turnComplete=True); await page.wait_for_timeout(400)
        await demande(c, 'Il est quelle heure ?')
        outil(c, 'date_et_heure', {}, 'h2')
        ok = await attendre(lambda: resp(c, 'h2') is not None, 5)
        check('« Il est quelle heure ? » : l\'heure est donnée', ok and re.search(r'\d\d/\d\d/\d\d, \d+h\d\d', resp(c, 'h2') or '') is not None, resp(c, 'h2'))
        parle(c, 'Il est 8h46.', sec=0.5); await page.wait_for_timeout(600)

        # ---------- 7. Nom approximatif : il fait confirmer ----------
        n = len(await nav())
        await demande(c, 'Emmène-moi chez Gallet.')
        outil(c, 'itineraire', {'client': 'Gallet'}, 'i4')
        ok = await attendre(lambda: resp(c, 'i4') is not None, 6)
        r = resp(c, 'i4') or ''
        check('« Emmène-moi chez Gallet » (GALLOIS SARL dans le CRM) : rien de lancé, il fait confirmer', ok and "RIEN N'EST LANCÉ" in r and 'Je te guide vers GALLOIS SARL à Chavagne, c\'est bien ça ?' in r and len(await nav()) == n, r[:260])
        parle(c, "Je te guide vers GALLOIS SARL à Chavagne, c'est bien ça ?", sec=0.8); await page.wait_for_timeout(900)
        await demande(c, 'Oui. Oui.')
        outil(c, 'itineraire', {'client': 'GALLOIS SARL Chavagne'}, 'i5')
        ok = await attendre(lambda: resp(c, 'i5') is not None, 6)
        N = await nav()
        check('« Oui. Oui. » à sa question : guidage lancé (refusé le 12/11, 08h46:17)', ok and 'REFUSÉ' not in (resp(c, 'i5') or '') and len(N) == n + 1 and N[-1][1] == 'GALLOIS SARL', f'{resp(c, "i5")} {N[-1:]}')
        parle(c, "C'est parti, je te guide vers Gallois.", sec=0.6); await page.wait_for_timeout(700)

        # ---------- 8. « Qui est le magasinier chez ABM ? » ----------
        n0 = len(st['calls']); ncl = len(st['claude'])
        await demande(c, "Dis-moi qui est le magasinier dans l'entreprise ABM.")
        t0 = time.monotonic()
        outil(c, 'crm_contacts', {'client': 'ABM'}, 'k1')
        ok = await attendre(lambda: resp(c, 'k1') is not None, 5)
        r = resp(c, 'k1') or ''
        check('crm_contacts : le magasinier, tout de suite (46 s par Claude le 12/11)', ok and time.monotonic() - t0 < 2 and 'M MOREAU Yoann (Responsable magasin), tél. 02 40 00 00 01' in r and len(st['claude']) == ncl
              and not any(x.get('action') in ('crm_client', 'crm_requete') for x in st['calls'][n0:]), f'{time.monotonic() - t0:.1f} s {r[:200]}')
        parle(c, "Chez ABM, le responsable magasin est Yoann Moreau.", sec=0.8); await page.wait_for_timeout(800)
        await demande(c, "Qui est le magasinier de l'entreprise ABM ?")
        outil(c, 'crm_question', {'question': "Qui est le magasinier de l'entreprise ABM ?"}, 'k2')
        ok = await attendre(lambda: resp(c, 'k2') is not None, 5)
        r = resp(c, 'k2') or ''
        check('… et la même question passée par crm_question : annuaire aussi, sans IA', ok and 'M MOREAU Yoann (Responsable magasin)' in r and len(st['claude']) == ncl and 'arrière-plan' not in r, r[:200])
        parle(c, "Le responsable magasin est Yoann Moreau.", sec=0.6); await page.wait_for_timeout(700)

        # ---------- 8 bis. Sa propre société et ses collègues (remarques du 25/11/26, en voiture) ----------
        # « Boschat Laveix » cherché parmi les clients : deux clients au nom proche proposés, l'adresse de l'ADV jamais trouvée.
        # Le CRM envoie maintenant ses collègues et lui-même (10e colonne « interne »). Noms et adresses inventés.
        NOUS = [['BROSSARD', 'M BROSSARD Aurélien', 'Gérant', 'C4000001', 'Clisson', '44190 Clisson', '02 40 00 00 07', '', ''],
                ['Boschat Laveix', 'Prénom NOM-DE-TIMOTHEE', 'Commercial itinérant, Timothée lui-même', '', '', '', '', 'courriel-pro-de-timothee', '', 'interne'],
                ['Boschat Laveix', 'MARTEAU Aurélien', 'ADV Cholet', '', '', '', '', 'courriel-adv-1', '', 'interne']]
        await page.evaluate("(l) => { window.__d = [wilson.crm.dernier, wilson.crm.last, wilson.crm.dernierChoix]; wilson.crm.annuaire.charger({ ok: true, contacts: l, le: '25/11/2026 09h40' }); }", ANNUAIRE + NOUS)
        n0 = len(st['calls'])
        await demande(c, "Est-ce que tu peux l'envoyer directement à Aurélien, l'ADV qui travaille chez Boschat Laveix ?")
        outil(c, 'crm_contacts', {'client': 'Boschat Laveix'}, 'bl1')
        ok = await attendre(lambda: resp(c, 'bl1') is not None, 5)
        r = resp(c, 'bl1') or ''
        check('crm_contacts « Boschat Laveix » : sa société (pas deux clients au nom proche), collègues avec leur e-mail et son adresse pro (25/11/26)',
              ok and 'PAS un client' in r and 'courriel-adv-1' in r and 'courriel-pro-de-timothee' in r and 'Plusieurs clients' not in r and 'BROSSARD' not in r, r[:400])
        check('… l\'outil le dit à Gemini (e-mails, collègues, adresse pro)', any(f['name'] == 'crm_contacts' and 'Boschat Laveix' in f['description'] and 'adresse e-mail professionnelle' in f['description'] for t in c['setup']['tools'] for f in t.get('functionDeclarations', [])))
        outil(c, 'crm_client', {'client': 'Boschat Laveix'}, 'bl2')
        ok = await attendre(lambda: resp(c, 'bl2') is not None, 5)
        r = resp(c, 'bl2') or ''
        check('crm_client « Boschat Laveix » : la liste des collègues, sans demander une fiche client au CRM', ok and 'PAS un client' in r and 'courriel-adv-1' in r
              and not any(x.get('action') == 'crm_client' for x in st['calls'][n0:]), f'{r[:300]} {[x.get("action") for x in st["calls"][n0:]]}')
        outil(c, 'crm_noter', {'type': 'compte_rendu', 'client': 'Boschat Laveix', 'contact': 'Aurélien', 'texte': 'Appel.'}, 'bl3')
        ok = await attendre(lambda: resp(c, 'bl3') is not None, 5)
        r = resp(c, 'bl3') or ''
        check('… et rien ne se prépare dans le CRM pour un collègue (pas de fiche client)', ok and "c'est sa société" in r and 'Aurélien Marteau est un collègue' in r and 'Je l\'enregistre' not in r, r[:300])
        await page.evaluate("(l) => { wilson.crm.annuaire.charger({ ok: true, contacts: l, le: '12/11/2026 08h40' }); [wilson.crm.dernier, wilson.crm.last, wilson.crm.dernierChoix] = window.__d; wilson.crm.pending = null; }", ANNUAIRE)
        parle(c, "Aurélien Marteau, l'ADV de Cholet, a une adresse dans le CRM.", sec=0.6); await page.wait_for_timeout(700)

        # ---------- 9. Le compte rendu, au nom de la bonne personne ----------
        await demande(c, 'Je viens de rencontrer Yohan Moreau. Tu peux noter que le client cherche des vis de rechange.')
        outil(c, 'crm_noter', {'type': 'compte_rendu', 'client': 'Yohan Moreau', 'texte': 'Visite. Le client cherche des vis de rechange.'}, 'n1')
        ok = await attendre(lambda: resp(c, 'n1') is not None, 6)
        r = resp(c, 'n1') or ''
        check('Compte rendu dicté pour « Yohan Moreau » : préparé pour A B M (M MOREAU Yoann), pas le premier contact de la fiche (09h53)', ok and 'A B M (M MOREAU Yoann)' in r and 'ANJUBAULT' not in r, r[:260])
        check('… et la fenêtre à l\'écran porte le bon nom', 'M MOREAU Yoann' in (await cartes()) and 'ANJUBAULT' not in (await cartes()), await cartes())
        # 1.45.23 (remarque du 20/11/26, 11h58:15 : « attendre que j'aie fini ma phrase avant de noter ») : il dicte encore après
        # la demande → la note attend la fin de sa phrase, et Gemini sait ce qu'il a ajouté (11h50:40 : relue par-dessus lui)
        send(c, inputTranscription={'text': ' Et il veut aussi des paumelles,'})
        outil(c, 'crm_noter', {'type': 'compte_rendu', 'client': 'Yohan Moreau', 'texte': 'Visite. Le client cherche des vis de rechange et des paumelles.'}, 'n1b')
        await page.wait_for_timeout(500)
        send(c, inputTranscription={'text': ' et des crémones.'})
        await page.wait_for_timeout(600)
        check('Note demandée pendant qu\'il dicte encore : rien de préparé avant la fin de sa phrase', resp(c, 'n1b') is None and has('crm_noter : Timothée parle encore'))
        ok = await attendre(lambda: resp(c, 'n1b') is not None, 6)
        r = resp(c, 'n1b') or ''
        check('… préparée après, et Gemini sait ce qu\'il a ajouté (« et des crémones »)', ok and 'il a continué de parler' in r and 'et des crémones.' in r and 'A B M (M MOREAU Yoann)' in r, r[:300])
        outil(c, 'crm_noter', {'type': 'compte_rendu', 'client': 'ABM', 'texte': 'Visite. Le client cherche des vis de rechange.'}, 'n2')
        ok = await attendre(lambda: resp(c, 'n2') is not None, 6)
        r = resp(c, 'n2') or ''
        check('Société seule (« chez ABM ») : contact habituel, nommé à la relecture pour être corrigé', ok and 'A B M (M ANJUBAULT Mathieu)' in r and 'contact habituel, Mathieu Anjubault' in r, r[-300:])
        parle(c, 'Compte rendu de visite, A B M, Mathieu Anjubault : « Visite. Le client cherche des vis de rechange. » Je l\'enregistre ?', sec=1.0); await page.wait_for_timeout(1000)
        await demande(c, "Non, c'était avec Yoann Moreau.")
        outil(c, 'crm_noter', {'type': 'compte_rendu', 'client': 'ABM', 'contact': 'Yoann Moreau', 'texte': 'Visite. Le client cherche des vis de rechange.'}, 'n3')
        ok = await attendre(lambda: resp(c, 'n3') is not None, 6)
        check('« Non, c\'était avec Yoann Moreau » : corrigé (impossible le 12/11 : « c\'est nul »)', ok and 'A B M (M MOREAU Yoann)' in (resp(c, 'n3') or '') and 'M MOREAU Yoann' in (await cartes()), resp(c, 'n3'))
        outil(c, 'crm_noter', {'type': 'compte_rendu', 'client': 'ABM', 'contact': 'Sylvain Motel', 'texte': 'Visite.'}, 'n4')
        ok = await attendre(lambda: resp(c, 'n4') is not None, 6)
        check('Personne inconnue chez ce client : rien de préparé, il le dit', ok and 'Je ne trouve pas « Sylvain Motel » parmi les contacts de A B M' in (resp(c, 'n4') or ''), resp(c, 'n4'))
        outil(c, 'crm_noter', {'type': 'compte_rendu', 'client': 'ABM', 'contact': 'le magasinier', 'texte': 'Visite. Le client cherche des vis de rechange.'}, 'n5')
        ok = await attendre(lambda: resp(c, 'n5') is not None, 6)
        check('« avec le magasinier » : la personne retrouvée par sa fonction', ok and 'A B M (M MOREAU Yoann)' in (resp(c, 'n5') or ''), resp(c, 'n5'))
        parle(c, 'Compte rendu de visite, A B M, Yoann Moreau : « Visite. Le client cherche des vis de rechange. » Je l\'enregistre ?', sec=1.0); await page.wait_for_timeout(1000)
        await demande(c, "Oui, vas-y, enregistre-le.")
        outil(c, 'crm_confirmer', {}, 'n6')
        ok = await attendre(lambda: resp(c, 'n6') is not None, 8)
        br = next((x for x in st['calls'] if x.get('action') == 'crm_brouillon'), {})
        check('« Oui » : brouillon envoyé au CRM avec la clé de Yoann Moreau (et pas d\'un autre contact)', ok and br.get('cle') == '["M MOREAU Yoann","A B M"]' and br.get('confirme') is True and br.get('echange') == 'visite', json.dumps(br, ensure_ascii=False)[:260])
        parle(c, "C'est prêt dans le CRM, dans tes tâches, rubrique « Dicté à Wilson ».", sec=0.8); await page.wait_for_timeout(900)

        # ---------- 9 bis. Deux sociétés au nom proche, la personne citée les départage (journal du 19/11/26, 17h11) ----------
        # une tâche pour une personne chez un client : deux sociétés possibles, il a dû redire trois fois le nom
        # de la personne. Noms inventés ; l'annuaire du test reçoit deux sociétés de plus, puis il est remis comme avant.
        DEUX = [['ARMOR OUVERTURES', 'M GIRAUD Jean Marie', 'Gérant', 'C3000001', 'Nantes', 'Nantes', '02 40 00 00 07', '', ''],
                ['ARMOR OUVERTURES MAINTENANCE', 'M PETIT Luc', 'Technicien', 'C3000002', 'Nantes', 'Nantes', '02 40 00 00 08', '', ''],
                ['ARMOR OUVERTURES MAINTENANCE', 'M GIRARD Paul', 'Technicien', 'C3000002', 'Nantes', 'Nantes', '02 40 00 00 09', '', '']]
        await page.evaluate("(l) => { window.__d = [wilson.crm.dernier, wilson.crm.last, wilson.crm.dernierChoix]; wilson.crm.annuaire.charger({ ok: true, contacts: l, le: '19/11/2026 17h00' }); }", ANNUAIRE + DEUX)
        await demande(c, 'Crée une nouvelle tâche pour Jean-Marie Giraut chez Armor Ouverture.')
        outil(c, 'crm_noter', {'type': 'tache', 'client': 'Armor Ouverture', 'contact': 'Jean-Marie Giraut', 'texte': 'Rappeler pour le ferme-porte', 'date': "aujourd'hui"}, 'o1')
        ok = await attendre(lambda: resp(c, 'o1') is not None, 6)
        r = resp(c, 'o1') or ''
        check('Deux sociétés au nom proche, la personne citée travaille dans une seule : celle-là, préparée pour elle (19/11/26, 17h11)', ok and 'ARMOR OUVERTURES (M GIRAUD Jean Marie)' in r and 'Plusieurs clients' not in r and 'MAINTENANCE' not in r, r[:260])
        check('… et le journal dit pourquoi', has('le seul où travaille « Jean-Marie Giraut »'))
        await page.evaluate("wilson.crm.dernier = window.__d[0]")      # sinon la société dont on vient de parler est reprise (30 min)
        outil(c, 'crm_noter', {'type': 'tache', 'client': 'Armor Ouverture', 'contact': 'Sylvain Motel', 'texte': 'Rappeler', 'date': "aujourd'hui"}, 'o2')
        ok = await attendre(lambda: resp(c, 'o2') is not None, 6)
        r = resp(c, 'o2') or ''
        check('Personne citée dans aucune des deux : il demande laquelle, et sait qu\'un nom de personne peut être sa réponse', ok and 'Plusieurs clients possibles' in r and 'ARMOR OUVERTURES MAINTENANCE' in r and 'nom d\'une personne' in r, r[:400])
        await page.evaluate("wilson.crm.dernier = window.__d[0]")
        outil(c, 'crm_noter', {'type': 'tache', 'client': 'Armor Ouverture', 'contact': 'Giraud', 'texte': 'Rappeler', 'date': "aujourd'hui"}, 'o3')
        ok = await attendre(lambda: resp(c, 'o3') is not None, 6)
        r = resp(c, 'o3') or ''
        check('… un nom qui va dans les deux sociétés : il demande toujours laquelle', ok and 'Plusieurs clients possibles' in r, r[:300])
        await page.evaluate("(l) => { wilson.crm.annuaire.charger({ ok: true, contacts: l, le: '12/11/2026 08h40' }); [wilson.crm.dernier, wilson.crm.last, wilson.crm.dernierChoix] = window.__d; wilson.crm.pending = null; }", ANNUAIRE)
        parle(c, "Pour quelle société ?", sec=0.5); await page.wait_for_timeout(700)

        # ---------- 10. Une écriture n'est jamais une question ----------
        ncl = len(st['claude'])
        await demande(c, 'Oui oui oui, fais-le.')
        outil(c, 'crm_question', {'question': 'Enregistre la visite chez Yoann Moreau : le client recherche des vis de rechange.'}, 'e1')
        ok = await attendre(lambda: resp(c, 'e1') is not None, 5)
        check('crm_question « Enregistre la visite… » : refusé, renvoyé vers crm_noter, rien à Claude (09h55 : « je ne peux pas enregistrer »)', ok and 'REFUSÉ' in (resp(c, 'e1') or '') and 'crm_noter' in (resp(c, 'e1') or '') and len(st['claude']) == ncl, resp(c, 'e1'))
        parle(c, 'Pardon.', sec=0.4); await page.wait_for_timeout(600)

        # ---------- 11. Les mots exacts accompagnent la question ----------
        await demande(c, "Et je vais voir Yoann là. Est-ce qu'il y a des sujets auxquels il faut que je pense à lui parler ?")
        outil(c, 'crm_question', {'question': 'briefing Yoann Moreau ABM'}, 'q1')
        ok = await attendre(lambda: len(st['claude']) > ncl, 8)
        ctxq = (st['claude'][-1].get('contexte') or '') if ok else ''
        check('Question à Claude : ses mots exacts joints à la question résumée (« briefing … » le 12/11 : la vraie question perdue)', ok and 'Ses mots exacts' in ctxq and 'des sujets auxquels il faut que je pense à lui parler' in ctxq, ctxq[:300])
        check('… et le dernier client et la personne dont on parle', 'A B M' in ctxq and 'M MOREAU Yoann' in ctxq, ctxq[:300])
        parle(c, 'Je cherche.', sec=0.4)
        await attendre(lambda: any('Yoann parlait du nouveau magasin' in t for t in c['texts']), 15)
        parle(c, "À ta visite du 27 octobre, Yoann parlait du nouveau magasin.", sec=0.8); await page.wait_for_timeout(900)

        # ---------- 12. « Tu as besoin d'autre chose ? » ----------
        ln = len(logs); joue0 = await page.evaluate("wilson.audio.playedSec")
        await demande(c, 'Merci.')
        parle(c, "De rien. Tu as besoin d'autre chose ?", sec=4.0)
        await page.wait_for_timeout(600)
        joue = (await page.evaluate("wilson.audio.playedSec")) - joue0
        check('« Tu as besoin d\'autre chose ? » à la fin : coupé avant d\'être dit, « De rien. » dit en entier (05/11, 06/11, 12/11, 16/11)', any('Question de trop à la fin de sa réponse (« Tu as besoin d\'autre chose ? »)' in l for l in logs[ln:]) and joue < 1.3, f'{joue:.1f} s jouées {[l for l in logs[ln:] if "trop" in l]}')
        await page.wait_for_function('!wilson.audio.playing', timeout=6000)
        ln = len(logs)
        await demande(c, 'Note une tâche.')
        parle(c, 'Pour quel client ?', sec=0.6); await page.wait_for_timeout(700)
        check('… mais une vraie question (« Pour quel client ? ») est dite', not any('Question de trop' in l for l in logs[ln:]))
        # 12 bis. Journal du 19/11/26, 16h13:00 : « pas besoin de me rajouter une tâche » → « je n'ajoute rien » retenu, puis
        # crm_noter exigé par le verrou (un compte rendu en trop). Il refuse d'écrire : son « d'accord » est dit, aucun outil exigé.
        await page.wait_for_timeout(1500)
        ln = len(logs); nt = len(c['texts']); joue0 = await page.evaluate("wilson.audio.playedSec")
        await page.evaluate("wilson._sansOutil = null")
        await demande(c, "Non mais c'est bon, il y a pas besoin de valider, je t'ai dit que c'était fait déjà. T'as pas besoin de me rajouter une tâche pour dire que ça y est.")
        parle(c, "Pardon, j'avais mal compris. C'est noté que c'est déjà fait, je n'ajoute rien.", sec=2.0); await page.wait_for_timeout(1500)
        joue = (await page.evaluate("wilson.audio.playedSec")) - joue0
        check('« Pas besoin de me rajouter une tâche » : « je n\'ajoute rien » dit, aucun outil exigé (19/11/26, 16h13)',
              joue > 1.5 and not any("n'a PAS été dite" in t or 'crm_noter' in t for t in c['texts'][nt:]) and not any('JAMAIS DITE' in l for l in logs[ln:]),
              f'{joue:.1f} s {[l for l in logs[ln:] if "Verrou" in l]} {c["texts"][nt:]}')
        await page.wait_for_timeout(1500)
        ln = len(logs); nt = len(c['texts']); joue0 = await page.evaluate("wilson.audio.playedSec")
        await page.evaluate("wilson._sansOutil = null")
        await demande(c, "Pas la peine de noter, c'est déjà fait.")
        parle(c, "C'est prêt dans le CRM, dans tes tâches.", sec=2.0); await page.wait_for_timeout(1200)
        joue = (await page.evaluate("wilson.audio.playedSec")) - joue0
        ok = await attendre(lambda: any("je n'ajoute rien" in t and 'aucun outil' in t for t in c['texts'][nt:]), 4)
        check('… il refuse mais Wilson dit avoir écrit (« C\'est prêt dans le CRM ») : pas dit, et pas de crm_noter exigé', ok and joue < 0.9 and not any('crm_noter' in t for t in c['texts'][nt:]), f'{joue:.1f} s {c["texts"][nt:]}')
        parle(c, "D'accord, je n'ajoute rien.", sec=0.8); await page.wait_for_timeout(900)
        # 12 ter. Journal du 20/11/26, 12h00:02 : « J'ai préparé la tâche suivante : « … ». Je l'enregistre ? » sans crm_noter,
        # laissé passer (« réponse qui n'affirme rien ») ; ses deux « oui » → « rien à enregistrer » ; puis « Je viens de te le
        # dire. » envoyé à l'analyste comme une question (12h00:59).
        await page.wait_for_timeout(1500)
        ln = len(logs); nt = len(c['texts']); joue0 = await page.evaluate("wilson.audio.playedSec")
        await page.evaluate("wilson._sansOutil = null; wilson.crm.pending = null")
        await demande(c, "Il faut noter qu'on va lui envoyer une équerre pour le ferme-porte, à son entreprise, en TNT.")
        parle(c, "J'ai préparé la tâche suivante : « Envoyer une équerre pour le ferme-porte en TNT à son entreprise. ». Je l'enregistre ?", sec=2.5); await page.wait_for_timeout(1200)
        joue = (await page.evaluate("wilson.audio.playedSec")) - joue0
        ok = await attendre(lambda: any("n'a PAS été dite" in t and 'crm_noter' in t for t in c['texts'][nt:]), 4)
        check('« J\'ai préparé la tâche … Je l\'enregistre ? » sans crm_noter (rien de préparé) : pas dit, crm_noter exigé (20/11/26, 12h00:02)',
              ok and any('JAMAIS DITE' in l for l in logs[ln:]) and any('présentée comme prête' in l for l in logs[ln:]) and not any("n'affirme rien" in l for l in logs[ln:]) and joue < 0.9,
              f'{joue:.1f} s {[l for l in logs[ln:] if "Verrou" in l]} {c["texts"][nt:]}')
        await page.wait_for_timeout(1500)
        ln = len(logs); nt = len(c['texts'])
        await page.evaluate("wilson._sansOutil = null; wilson.crm.pending = null")
        await demande(c, 'Je viens de te le dire, envoie-lui une équerre en TNT.')
        parle(c, "Pardon, j'ai un problème pour l'enregistrer. Je vais le noter comme tâche, on est d'accord ? « Envoyer une équerre pour le ferme-porte en TNT à son entreprise, pour la porte livrée où il ne peut pas poser son ferme-porte. »", sec=2.5); await page.wait_for_timeout(1200)
        ok = await attendre(lambda: any("n'a PAS été dite" in t for t in c['texts'][nt:]), 4)
        tx = [t for t in c['texts'][nt:] if "n'a PAS été dite" in t]
        check('… « Je viens de te le dire » pendant une écriture : crm_noter exigé, pas une question à l\'analyste (12h00:59)',
              ok and 'crm_noter' in tx[-1] and 'crm_question' not in tx[-1] and not any("posée par l'appli" in l for l in logs[ln:]), f'{tx} {[l for l in logs[ln:] if "Verrou" in l or "analyste" in l]}')
        parle(c, 'Pour quel jour ?', sec=0.5); await page.wait_for_timeout(700)
        await page.evaluate("wilson.crm.pending = null; wilson.crm.dernierEnregistre = null")
        await demande(c, 'Oui.')
        outil(c, 'crm_confirmer', {}, 'cf0')
        ok = await attendre(lambda: resp(c, 'cf0') is not None, 6)
        r = resp(c, 'cf0') or ''
        check('crm_confirmer sans rien de préparé : « appelle crm_noter MAINTENANT », sans reposer la question (12h00:13)', ok and 'NON ENREGISTRÉ' in r and 'crm_noter MAINTENANT' in r and 'Ne lui repose PAS' in r, r[:200])
        parle(c, 'Pour quel client ?', sec=0.5); await page.wait_for_timeout(700)
        # 12 quater. Réponse de Timothée du 20/11/26, 11h44 (« Oui, tu peux faire ça ») : un endroit qui n'est pas un client
        # (centre commercial…) est cherché par Google Maps et le guidage est lancé (journal du 19/11/26, 16h22).
        check('Outil itineraire : paramètre « lieu » (endroit hors CRM), client plus obligatoire',
              any(f['name'] == 'itineraire' and 'lieu' in f['parameters']['properties'] and 'client' not in (f['parameters'].get('required') or []) for t in c['setup']['tools'] for f in t.get('functionDeclarations', [])))
        check('… et la consigne le dit', 'lieu = le nom de l\'endroit et sa ville' in sysp(c))
        await page.wait_for_timeout(1500)
        await page.evaluate("wilson._crmRecents && wilson._crmRecents.clear()")
        n = len(await nav())
        await demande(c, 'Emmène-moi au centre commercial Atlantis à Saint-Herblain.')
        outil(c, 'itineraire', {'lieu': 'centre commercial Atlantis Saint-Herblain'}, 'l1')
        ok = await attendre(lambda: resp(c, 'l1') is not None, 8)
        N = await nav(); r = resp(c, 'l1') or ''
        check('« Emmène-moi au centre commercial Atlantis » : guidage lancé vers l\'endroit (Google Maps le cherche), sans le CRM',
              ok and len(N) == n + 1 and N[-1][0] == 'centre commercial Atlantis Saint-Herblain' and 'est lancé' in r and 'vérifie la destination' in r, f'{N[-1:]} {r[:200]}')
        parle(c, "C'est parti, je te guide vers le centre commercial Atlantis, vérifie la destination sur l'écran.", sec=1.0); await page.wait_for_timeout(1000)
        await page.evaluate("wilson._crmRecents && wilson._crmRecents.clear()")
        n = len(await nav())
        await demande(c, 'Tiens, le centre commercial Atlantis, il ferme à quelle heure ?')
        outil(c, 'itineraire', {'lieu': 'centre commercial Atlantis'}, 'l2')
        ok = await attendre(lambda: resp(c, 'l2') is not None, 8)
        check('… mais il cite seulement l\'endroit, sans demander d\'y aller : rien n\'est lancé', ok and 'REFUSÉ' in (resp(c, 'l2') or '') and len(await nav()) == n, resp(c, 'l2'))
        parle(c, 'Pardon, je ne lance rien.', sec=0.5); await page.wait_for_timeout(700)

        # ---------- 13. Ma journée : CRM et agendas Google ----------
        await demande(c, "Qu'est-ce que j'ai aujourd'hui ?")
        outil(c, 'crm_agenda', {'jour': "aujourd'hui"}, 'j1')
        ok = await attendre(lambda: resp(c, 'j1') is not None, 10)
        r = resp(c, 'j1') or ''
        check('« Ma journée » : rendez-vous du CRM et agendas Google réunis (avec le nom de l\'agenda)', ok and '10h00 : M LEBRE Jean, LEBRE' in r and 'Dans ses agendas Google' in r and 'Réunion agence (Nantes) [agenda BOSCHAT LAVEIX]' in r and 'Médecin Louis' in r, r[:500])
        check('… le rendez-vous client déjà dans le CRM n\'est pas redit', 'RDV LEBRE' not in r, r[:500])
        check('… un événement de l\'agenda Famille : « pas forcément le sien » dit à Gemini (journal du 19/11/26, 18h25:51)', 'Médecin Louis [agenda Famille]' in r and 'pas forcément le sien' in r, r[:700])
        check('Journal : l\'outil demandé par Gemini est noté avec ce qu\'il demande (remarque du 19/11/26, 18h24)', any(l.endswith('Outil demandé : crm_agenda {"jour":"aujourd\'hui"}') for l in logs), next((l for l in logs if 'Outil demandé' in l), ''))
        check('… demandé en lecture seule, tous les agendas, pour ce jour-là', any(x.get('action') == 'agenda_lire' and x.get('tous') is True and x.get('jours') == 1 for x in st['calls']))
        # ---------- 13 bis. « Tu m'amènes à mon prochain rendez-vous » (journal du 19/11/26, 11h17:14) ----------
        # Gemini avait choisi le rendez-vous de 11h00, déjà fait (il était 11h17) : il a dû le reprendre.
        lt = time.localtime(); mn = lt.tm_hour * 60 + lt.tm_min
        if 60 <= mn <= 21 * 60:
            hm = lambda m: f'{m // 60}h{m % 60:02d}'
            st['rdv'] = [{'cle': json.dumps(['M ANJUBAULT Mathieu', 'A B M'], ensure_ascii=False), 'contact': 'M ANJUBAULT Mathieu', 'societe': 'A B M', 'heure': hm(mn - 20)},
                         {'cle': json.dumps(['M LEBRE Jean', 'LEBRE'], ensure_ascii=False), 'contact': 'M LEBRE Jean', 'societe': 'LEBRE', 'heure': hm(mn + 120)}]
            await page.evaluate("wilson.crm.journee = null")
            n = len(await nav())
            await demande(c, "Neve Wilson, tu m'amènes à mon prochain rendez-vous.")
            outil(c, 'itineraire', {'client': 'ABM'}, 'p1')
            ok = await attendre(lambda: resp(c, 'p1') is not None, 8)
            N = await nav()
            check('« Mon prochain rendez-vous » : guidé vers celui qui vient (LEBRE, dans 2 h), pas celui commencé il y a 20 min (A B M, choisi par Gemini)',
                  ok and len(N) == n + 1 and N[-1][1] == 'LEBRE' and 'LEBRE' in (resp(c, 'p1') or '') and has('son prochain rendez-vous'), f'{N[-1:]} {resp(c, "p1")}')
            parle(c, "C'est parti, je te guide vers Lebre.", sec=0.6); await page.wait_for_timeout(700)
            await demande(c, 'Wilson, amène-moi chez mon prochain client maintenant.')
            outil(c, 'itineraire', {'client': 'prochain rendez-vous'}, 'p2')
            ok = await attendre(lambda: resp(c, 'p2') is not None, 8)
            N = await nav()
            check('… client « prochain rendez-vous » donné par Gemini : LEBRE aussi', ok and N[-1][1] == 'LEBRE' and 'REFUSÉ' not in (resp(c, 'p2') or ''), f'{N[-1:]} {resp(c, "p2")}')
            parle(c, "C'est parti, je te guide vers Lebre.", sec=0.6); await page.wait_for_timeout(700)
            await demande(c, 'Non Wilson, emmène-moi à mon prochain rendez-vous chez ABM.')
            outil(c, 'itineraire', {'client': 'ABM'}, 'p3')
            ok = await attendre(lambda: resp(c, 'p3') is not None, 8)
            N = await nav()
            check('… il nomme le client (« chez ABM ») : c\'est lui qui décide, A B M', ok and N[-1][1] == 'A B M', f'{N[-1:]} {resp(c, "p3")}')
            parle(c, "C'est parti, je te guide vers ABM.", sec=0.6); await page.wait_for_timeout(700)
            await page.evaluate("wilson._crmRecents && wilson._crmRecents.clear()")   # (même demande dans les 20 s : pas relancée, autre sujet)
            await demande(c, "Non Wilson, je sors de A B M, l'autre d'après.")
            outil(c, 'itineraire', {'client': 'LEBRE'}, 'p4')
            ok = await attendre(lambda: resp(c, 'p4') is not None, 8)
            check('… « l\'autre d\'après » : le choix de Gemini est gardé', ok and (await nav())[-1][1] == 'LEBRE', resp(c, 'p4'))
            parle(c, "C'est parti, je te guide vers Lebre.", sec=0.6); await page.wait_for_timeout(700)
            st['rdv'] = [st['rdv'][0]]; await page.evaluate("wilson.crm.journee = null")
            n = len(await nav())
            await demande(c, 'Emmène-moi à mon prochain rendez-vous.')
            outil(c, 'itineraire', {'client': 'prochain rendez-vous'}, 'p5')
            ok = await attendre(lambda: resp(c, 'p5') is not None, 8)
            check('… plus de rendez-vous à venir : rien n\'est lancé, il demande chez qui aller', ok and "RIEN N'EST LANCÉ" in (resp(c, 'p5') or '') and len(await nav()) == n, resp(c, 'p5'))
            parle(c, "Je ne vois plus de rendez-vous aujourd'hui dans ton CRM : chez qui veux-tu aller ?", sec=0.6); await page.wait_for_timeout(700)
            # 13 ter. Journal du 19/11/26, 14h07:47 : relié à la voiture à 14h07:33, « amène-moi mon prochain rendez-vous » →
            # celui de 14h00, d'où il sortait. Monté dans la voiture après le début d'un rendez-vous : il en sort.
            st['rdv'] = [{'cle': json.dumps(['M ANJUBAULT Mathieu', 'A B M'], ensure_ascii=False), 'contact': 'M ANJUBAULT Mathieu', 'societe': 'A B M', 'heure': hm(mn - 7)},
                         {'cle': json.dumps(['M LEBRE Jean', 'LEBRE'], ensure_ascii=False), 'contact': 'M LEBRE Jean', 'societe': 'LEBRE', 'heure': hm(mn + 90)}]
            await page.evaluate("wilson.crm.journee = null; wilson._crmRecents && wilson._crmRecents.clear(); wilson._voitureBtDepuis = Date.now()")
            ln = len(logs); n = len(await nav())
            await demande(c, 'Amène-moi mon prochain rendez-vous.')
            outil(c, 'itineraire', {'client': 'prochain rendez-vous'}, 'p6')
            ok = await attendre(lambda: resp(c, 'p6') is not None, 8)
            N = await nav()
            check('Relié à la voiture 7 min après le début du rendez-vous d\'A B M : il en sort, guidé vers LEBRE (14h07:47)',
                  ok and len(N) == n + 1 and N[-1][1] == 'LEBRE' and any("il sort de celui de" in l and 'A B M' in l for l in logs[ln:]), f'{N[-1:]} {[l for l in logs[ln:] if "Itinéraire" in l]}')
            parle(c, "C'est parti, je te guide vers Lebre.", sec=0.6); await page.wait_for_timeout(700)
            await page.evaluate("wilson.crm.journee = null; wilson._crmRecents && wilson._crmRecents.clear(); wilson._voitureBtDepuis = Date.now() - 30 * 60000")
            await demande(c, 'Amène-moi mon prochain rendez-vous.')
            outil(c, 'itineraire', {'client': 'prochain rendez-vous'}, 'p7')
            ok = await attendre(lambda: resp(c, 'p7') is not None, 8)
            check('… relié avant le début (il roule depuis 30 min, en retard) : toujours A B M', ok and (await nav())[-1][1] == 'A B M', f'{(await nav())[-1:]} {resp(c, "p7")}')
            parle(c, "C'est parti, je te guide vers ABM.", sec=0.6); await page.wait_for_timeout(700)
            # 13 quater. Journal du 19/11/26, 14h08:29 à 14h09:14 : « C'est parti, je te guide vers … » dit sans l'outil
            # itineraire, laissé passer (« réponse qui n'affirme rien ») : rien n'était lancé.
            for k, (dit, rep) in enumerate([('Oui, amène-moi mon prochain rendez-vous.', "C'est parti, je te guide vers Lebre."),
                                             ('Hermès à Lu', "C'est parti, je te guide vers Hermit'alu.")]):
                await page.wait_for_timeout(1500)
                ln = len(logs); n = len(await nav()); nt = len(c['texts']); joue0 = await page.evaluate("wilson.audio.playedSec")
                await page.evaluate("wilson._sansOutil = null")
                await demande(c, dit)
                parle(c, rep, sec=2.0); await page.wait_for_timeout(900)
                joue = (await page.evaluate("wilson.audio.playedSec")) - joue0
                ok = await attendre(lambda: any('itineraire' in t and "n'a PAS été dite" in t for t in c['texts'][nt:]), 4)
                check(f'« {rep} » sans l\'outil (« {dit} ») : pas dit, Gemini doit lancer itineraire d\'abord',
                      ok and any('JAMAIS DITE' in l for l in logs[ln:]) and not any("n'affirme rien" in l for l in logs[ln:]) and joue < 0.9 and len(await nav()) == n,
                      f'{joue:.1f} s {[l for l in logs[ln:] if "Verrou" in l]} {c["texts"][nt:]}')
                parle(c, 'Pour quel client ?', sec=0.5); await page.wait_for_timeout(700)
            # 13 quinquies. Remarque du 23/11/26 : « mon prochain rendez-vous » → guidé au siège de la société, pas à
            # l'agence où travaille la personne du rendez-vous.
            AG = "5 rue de l'Agence 44000 Nantes"
            st['rdv'] = [{'cle': json.dumps(['M LEMERCIER Valentin', 'A B M'], ensure_ascii=False), 'contact': 'M LEMERCIER Valentin', 'societe': 'A B M', 'heure': hm(mn + 40)}]
            await page.evaluate("wilson.crm.journee = null; wilson._crmRecents && wilson._crmRecents.clear(); wilson._voitureBtDepuis = Date.now() - 30 * 60000")
            await page.wait_for_timeout(1500)
            n = len(await nav())
            await demande(c, 'Emmène-moi à mon prochain rendez-vous.')
            outil(c, 'itineraire', {'client': 'prochain rendez-vous'}, 'p8')
            ok = await attendre(lambda: resp(c, 'p8') is not None, 8)
            N = await nav()
            check('« Mon prochain rendez-vous » avec la personne de l\'agence : guidé à SON adresse, pas au siège (remarque du 23/11/26)',
                  ok and len(N) == n + 1 and N[-1][0] == AG and N[-1][1] == 'A B M' and AG in (resp(c, 'p8') or ''), f'{N[-1:]} {resp(c, "p8")}')
            parle(c, "C'est parti, je te guide vers ABM.", sec=0.6); await page.wait_for_timeout(1500)
            await page.evaluate("wilson._crmRecents && wilson._crmRecents.clear()")
            await demande(c, 'Wilson, emmène-moi chez ABM.')
            outil(c, 'itineraire', {'client': 'ABM'}, 'p9')
            ok = await attendre(lambda: resp(c, 'p9') is not None, 8)
            check('… « emmène-moi chez ABM » le jour de ce rendez-vous : à l\'agence aussi', ok and (await nav())[-1][0] == AG, f'{(await nav())[-1:]} {resp(c, "p9")}')
            parle(c, "C'est parti, je te guide vers ABM.", sec=0.6); await page.wait_for_timeout(700)
            st['rdv'] = None; await page.evaluate("wilson.crm.journee = null")
        else: print('(13 bis non lancé : entre 21h00 et 1h00, les heures du test passeraient minuit)')
        check('Aucune erreur de page (avec annuaire)', not any('PAGEERROR' in l or l.startswith('Erreur :') for l in logs), str([l for l in logs if 'PAGEERROR' in l or l.startswith('Erreur :')][:3]))
        await b.close()

        # ---------- 14. CRM pas encore à jour : pas d'annuaire ----------
        b, page, st, conns, logs = await ouvrir(p, False)
        has = lambda t: any(t in l for l in logs)
        ok = await attendre(lambda: has('annuaire : le CRM ne le donne pas encore'), 12)
        check('CRM pas à jour : pas d\'annuaire, Wilson continue par le CRM (et le dit dans le journal)', ok and not await page.evaluate("wilson.crm.annuaire.pret"))
        c = await toucher(page, conns)
        await demande(c, 'Wilson, amène-moi chez ABM.', page)
        outil(c, 'itineraire', {'client': 'ABM'}, 'z1')
        ok = await attendre(lambda: resp(c, 'z1') is not None, 8)
        r = resp(c, 'z1') or ''
        check('… le CRM rend une autre société pour « ABM » : rien n\'est lancé, il fait confirmer (parti chez elle le 12/11)', ok and "RIEN N'EST LANCÉ" in r and 'GRANDBAT' in r and "c'est bien ça ?" in r and not (await page.evaluate("window.__nav")), r[:260])
        parle(c, "Je te guide vers GRANDBAT E ET S AB FRANCE 548X à Verrières-en-Anjou, c'est bien ça ?", sec=0.8); await page.wait_for_timeout(900)
        await demande(c, 'Emmène-moi chez Lebre.', page)
        outil(c, 'itineraire', {'client': 'Lebre'}, 'z2')
        ok = await attendre(lambda: resp(c, 'z2') is not None, 8)
        N = await page.evaluate("window.__nav")
        check('… et un nom reconnu sans doute (« Lebre ») part tout de suite, comme avant', ok and N and N[-1][1] == 'LEBRE', f'{resp(c, "z2")} {N}')
        check('Aucune erreur de page (sans annuaire)', not any('PAGEERROR' in l or l.startswith('Erreur :') for l in logs), str([l for l in logs if 'PAGEERROR' in l or l.startswith('Erreur :')][:3]))
        await b.close()

    print(f"\n{sum(results)}/{len(results)}")
    raise SystemExit(0 if all(results) else 1)

asyncio.run(main())
