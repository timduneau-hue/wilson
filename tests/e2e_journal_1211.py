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
13. « Ma journée » : rendez-vous du CRM et agendas Google réunis, sans doublon.
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
    ['A B M', 'M LEMERCIER Valentin', 'Resp. commercial', 'C2000001', 'A B M LA ROCHE', 'A B M LA ROCHE', '06 00 00 00 02', '', ''],
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

        # ---------- 9. Le compte rendu, au nom de la bonne personne ----------
        await demande(c, 'Je viens de rencontrer Yohan Moreau. Tu peux noter que le client cherche des vis de rechange.')
        outil(c, 'crm_noter', {'type': 'compte_rendu', 'client': 'Yohan Moreau', 'texte': 'Visite. Le client cherche des vis de rechange.'}, 'n1')
        ok = await attendre(lambda: resp(c, 'n1') is not None, 6)
        r = resp(c, 'n1') or ''
        check('Compte rendu dicté pour « Yohan Moreau » : préparé pour A B M (M MOREAU Yoann), pas le premier contact de la fiche (09h53)', ok and 'A B M (M MOREAU Yoann)' in r and 'ANJUBAULT' not in r, r[:260])
        check('… et la fenêtre à l\'écran porte le bon nom', 'M MOREAU Yoann' in (await cartes()) and 'ANJUBAULT' not in (await cartes()), await cartes())
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
        check('« Tu as besoin d\'autre chose ? » à la fin : coupé avant d\'être dit (05/11, 06/11, 12/11)', any('Question de trop à la fin de sa réponse (« Tu as besoin d\'autre chose ? »)' in l for l in logs[ln:]) and joue < 1.0, f'{joue:.1f} s jouées {[l for l in logs[ln:] if "trop" in l]}')
        await page.wait_for_function('!wilson.audio.playing', timeout=6000)
        ln = len(logs)
        await demande(c, 'Note une tâche.')
        parle(c, 'Pour quel client ?', sec=0.6); await page.wait_for_timeout(700)
        check('… mais une vraie question (« Pour quel client ? ») est dite', not any('Question de trop' in l for l in logs[ln:]))

        # ---------- 13. Ma journée : CRM et agendas Google ----------
        await demande(c, "Qu'est-ce que j'ai aujourd'hui ?")
        outil(c, 'crm_agenda', {'jour': "aujourd'hui"}, 'j1')
        ok = await attendre(lambda: resp(c, 'j1') is not None, 10)
        r = resp(c, 'j1') or ''
        check('« Ma journée » : rendez-vous du CRM et agendas Google réunis (avec le nom de l\'agenda)', ok and '10h00 : M LEBRE Jean, LEBRE' in r and 'Dans ses agendas Google' in r and 'Réunion agence (Nantes) [agenda BOSCHAT LAVEIX]' in r and 'Médecin Louis' in r, r[:500])
        check('… le rendez-vous client déjà dans le CRM n\'est pas redit', 'RDV LEBRE' not in r, r[:500])
        check('… demandé en lecture seule, tous les agendas, pour ce jour-là', any(x.get('action') == 'agenda_lire' and x.get('tous') is True and x.get('jours') == 1 for x in st['calls']))
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
