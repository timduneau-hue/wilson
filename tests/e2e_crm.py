"""CRM à la voix (PLAN 2 quater) : outils du direct, fiches gardées, appel, verrou des écritures (C2), brouillons (C3),
puis le même chemin en mode économique. Gemini et le script de Timothée sont simulés."""
import asyncio, re, json, base64, os
import numpy as np
from datetime import date, timedelta
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(S, 'shots'), exist_ok=True)
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, '' if ok else detail, flush=True)

URL = 'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTESTTESTTEST/exec'
CLE = json.dumps(['Jean Gaudin', 'Menuiserie Gaudin'], ensure_ascii=False)
DOSSIER = ('Client : Menuiserie Gaudin (compte C1000001), Cholet\nContact : Jean Gaudin (Gérant), tél. 06 11 22 33 44\n'
           'Autres contacts : Marie Gaudin (Comptable) 02 41 00 00 01\nProchain rendez-vous : jeudi 29/10/26 à 14h00.\n'
           "Chiffre d'affaires (Negos) : exercice 2026/27 à ce jour 7 000 €, contre 6 600 € à la même date l'an dernier (+6 %).")
FAKE_TTS = open(os.path.join(S, 'e2e_eco.py'), encoding='utf-8').read().split('FAKE_TTS = """')[1].split('"""')[0]

def jeudi():
    d = date.today(); n = (3 - d.weekday()) % 7 or 7
    return d + timedelta(days=n)

def audio_chunks(seconds):
    sr = 24000; t = np.arange(int(sr * seconds)) / sr
    pcm = (np.sin(2 * np.pi * 180 * t) * 8000).astype(np.int16)
    return [base64.b64encode(pcm[i:i + 4800].tobytes()).decode() for i in range(0, len(pcm), 4800)]


async def main():
    conns, sc = [], {'calls': [], 'writes': []}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])

        async def script(route):              # script de Wilson → CRM, simulé
            req = route.request; H = {'access-control-allow-origin': '*'}
            if req.method != 'POST': await route.fulfill(status=200, body='ok'); return
            d = json.loads(req.post_data or '{}'); a = d.get('action', '')
            if not a.startswith('crm_'):
                if a == 'reglages_lire': await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'ok': True, 'reglages': None, 't': 0})); return
                await route.fulfill(status=200, headers=H, body=json.dumps({'ok': True})); return
            sc['calls'].append(d)
            if a == 'crm_etat': body = {'ok': True, 'contacts': 437, 'brouillons': 0}
            elif a == 'crm_client':
                if 'dupont' in (d.get('client') or '').lower(): body = {'ok': True, 'trouve': False, 'choix': [{'societe': 'Dupont'}, {'societe': 'Dupont Fermetures'}], 'texte': 'Plusieurs clients possibles pour « Dupont » : Dupont (Cholet) ; Dupont Fermetures (Saumur). Demande lequel.'}
                else: body = {'ok': True, 'cle': CLE, 'societe': 'Menuiserie Gaudin', 'contact': 'Jean Gaudin', 'ville': 'Cholet', 'rdv': '29/10/2026 14h00', 'texte': DOSSIER,
                              'contacts': [{'nom': 'Jean Gaudin', 'fonction': 'Gérant', 'tel': '06 11 22 33 44', 'cle': CLE}, {'nom': 'Marie Gaudin', 'fonction': 'Comptable', 'tel': '02 41 00 00 01'}]}
            elif a == 'crm_journee': body = {'ok': True, 'jour': '?', 'rdv': [{'cle': CLE, 'contact': 'Jean Gaudin', 'societe': 'Menuiserie Gaudin', 'heure': '14h00'}], 'texte': "Demain : 1 rendez-vous.\n- 14h00 : Jean Gaudin, Menuiserie Gaudin (Cholet)"}
            elif a == 'crm_bilan': body = {'ok': True, 'texte': 'Exercice 2026/27 à ce jour : 145 300 €.'}
            elif a == 'crm_produit': body = {'ok': True, 'texte': 'Fabricant HOPPE : 2 client(s).'}
            elif a in ('crm_tache', 'crm_brouillon'):
                sc['writes'].append(d)
                body = {'ok': True, 'date': d.get('date'), 'texte': 'ok'} if d.get('confirme') is True else {'ok': False, 'erreur': 'écriture refusée : pas de confirmation'}
            else: body = {'ok': False, 'erreur': 'action inconnue'}
            await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(body, ensure_ascii=False))

        def handler(ws):
            conn = {'ws': ws, 'tool_responses': [], 'texts': []}; conns.append(conn)
            def on_msg(m):
                d = json.loads(m)
                if 'setup' in d: conn['setup'] = d['setup']; ws.send(json.dumps({'setupComplete': {}}))
                elif 'toolResponse' in d: conn['tool_responses'].extend(d['toolResponse']['functionResponses'])
                elif 'realtimeInput' in d and 'text' in d['realtimeInput']: conn['texts'].append(d['realtimeInput']['text'])
            ws.on_message(on_msg)

        async def setup_page(settings):
            ctx = await b.new_context(viewport={'width': 412, 'height': 860}, permissions=['microphone', 'camera'], service_workers='block')
            await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify(%s));" % json.dumps(settings))
            await ctx.add_init_script(FAKE_TTS)
            page = await ctx.new_page(); logs = []
            await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
            await page.route(re.compile(r'https://script\.google\.com/.*'), script)
            page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
            return page, logs

        BASE = {'apiKey': 'AIzaTESTTESTTESTTESTTESTTESTTEST', 'listenMode': 'toujours', 'convTimeout': 60, 'logUrl': URL, 'crm': True, 'voitureAuto': False, 'v': 3}
        page, logs = await setup_page(BASE)
        await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)
        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
        await page.evaluate("wilson.startConversation('toucher')")
        await page.wait_for_function('wilson.state === "conversation" && wilson.mode === "live"', timeout=10000)
        conn = conns[-1]
        names = [f['name'] for f in conn['setup']['tools'][0]['functionDeclarations']]
        sysp = conn['setup']['systemInstruction']['parts'][0]['text']
        check('Direct : outils du CRM déclarés (client, agenda, bilan, produit, appeler, noter, confirmer)', all(n in names for n in ['crm_client', 'crm_agenda', 'crm_bilan', 'crm_produit', 'appeler', 'crm_noter', 'crm_confirmer']), str(names))
        check('Consigne : CRM, « Je regarde dans le CRM », jamais écrire sans son accord', 'Ton travail avec Timothée' in sysp and 'Je regarde dans le CRM' in sysp and "JAMAIS sans son accord" in sysp)

        async def tool(name, args, cid):
            n0 = len(conn['tool_responses'])
            conn['ws'].send(json.dumps({'toolCall': {'functionCalls': [{'id': cid, 'name': name, 'args': args}]}}))
            for _ in range(60):
                await asyncio.sleep(0.1)
                if len(conn['tool_responses']) > n0: return conn['tool_responses'][-1]['response'].get('result', '')
            return None
        def heard(t): conn['ws'].send(json.dumps({'serverContent': {'inputTranscription': {'text': t}}}))
        def fin_tour(t='…'): conn['ws'].send(json.dumps({'serverContent': {'outputTranscription': {'text': t}, 'turnComplete': True}}))

        # 1. Questions
        r = await tool('crm_client', {'client': 'Gaudin'}, 'c1')
        check('crm_client : le dossier du CRM revient à Gemini, avec la consigne d\'oral', r and 'Menuiserie Gaudin' in r and '7 000 €' in r and "n'invente rien" in r, str(r)[:200])
        check('… question transmise au script (action crm_client)', sc['calls'][-1] == {'action': 'crm_client', 'client': 'Gaudin'}, str(sc['calls'][-1:]))
        n = len(sc['calls'])
        r = await tool('crm_client', {'client': 'godin'}, 'c2')
        check('2e question sur le même client (mal prononcé) : fiche gardée, pas de nouvel appel au CRM', r and 'Menuiserie Gaudin' in r and len(sc['calls']) == n, str(len(sc['calls']) - n))
        r = await tool('crm_client', {'client': 'Dupont'}, 'c3')
        check('Deux clients possibles : Wilson doit demander lequel', r and 'Plusieurs clients possibles' in r)
        r = await tool('crm_agenda', {'jour': 'demain'}, 'c4')
        check('crm_agenda « demain »', r and '14h00' in r and sc['calls'][-1].get('jour') == 'demain', str(sc['calls'][-1]))
        r = await tool('crm_bilan', {}, 'c5'); r2 = await tool('crm_produit', {'produit': 'Hoppe', 'question': 'qui_achete'}, 'c6')
        check('crm_bilan et crm_produit', r and '145 300' in r and r2 and 'HOPPE' in r2)

        # 2. Appeler
        r = await tool('appeler', {'client': 'Gaudin', 'contact': 'Marie'}, 'c7')
        card = await page.evaluate("({ vis: !document.getElementById('cards').hidden, href: (document.querySelector('.card-go')||{}).getAttribute && document.querySelector('.card-go').getAttribute('href'), txt: document.getElementById('cards').innerText })")
        check('Appeler Marie : bouton vert avec son numéro', card['vis'] and card['href'] == 'tel:0241000001' and 'Marie Gaudin' in card['txt'], str(card))
        check('… et Gemini lui dit d\'appuyer dessus', r and 'bouton vert' in r)
        await page.screenshot(path=os.path.join(S, 'shots', 'crm_appel.png'))
        await page.evaluate("wilson.hideCard()")

        # 3. Écrire : rien sans « oui » APRÈS la relecture (C2)
        heard('Ok, note que je dois rappeler Gaudin jeudi pour le devis volets.')
        await asyncio.sleep(0.2)
        r = await tool('crm_noter', {'type': 'tache', 'client': 'Gaudin', 'texte': 'Rappeler pour le devis volets', 'date': 'jeudi'}, 'c8')
        j = jeudi().strftime('%d/%m/%y')
        check('crm_noter : rien d\'écrit, phrase exacte à relire (jour calculé)', r and 'Rien n\'est encore écrit' in r and j in r and 'Rappeler pour le devis volets' in r and not sc['writes'], str(r))
        cv = await page.evaluate("({ vis: !document.getElementById('cards').hidden, txt: document.getElementById('cards').innerText })")
        check('… carte « À enregistrer dans le CRM ? » avec Oui / Non', cv['vis'] and 'Oui, enregistre' in cv['txt'], str(cv))
        await page.screenshot(path=os.path.join(S, 'shots', 'crm_confirmer.png'))
        r = await tool('crm_confirmer', {}, 'c9')
        check('Verrou : « Ok, note que… » (la demande elle-même) ne vaut pas confirmation → refusé', r and 'NON ENREGISTRÉ' in r and not sc['writes'], str(r))
        fin_tour('Tâche pour le jeudi… Je l\'enregistre ?'); await asyncio.sleep(0.2)
        heard('Euh, attends, non.'); await asyncio.sleep(0.2)
        r = await tool('crm_confirmer', {}, 'c10')
        check('Verrou : « attends, non » → refusé', r and 'NON ENREGISTRÉ' in r and not sc['writes'], str(r))
        fin_tour(); await asyncio.sleep(0.2)
        heard('Oui, vas-y.'); await asyncio.sleep(0.2)
        r = await tool('crm_confirmer', {}, 'c11')
        w = sc['writes'][-1] if sc['writes'] else {}
        check('« Oui, vas-y » après la relecture → tâche écrite (crm_tache, confirmée, client, date)', r and 'noté dans Mes tâches' in r and w.get('action') == 'crm_tache' and w.get('confirme') is True
              and w.get('cle') == CLE and w.get('date') == jeudi().strftime('%d/%m/%Y') and w.get('texte') == 'Rappeler pour le devis volets', json.dumps(w, ensure_ascii=False))
        check('… la carte de confirmation disparaît', await page.evaluate("document.getElementById('cards').hidden"))
        r = await tool('crm_confirmer', {}, 'c12')
        check('Rien en attente : une 2e confirmation n\'écrit rien', r and 'NON ENREGISTRÉ' in r and len(sc['writes']) == 1)

        # Compte rendu → brouillon ; RDV sans heure → il demande l'heure
        fin_tour(); await asyncio.sleep(0.1)
        r = await tool('crm_noter', {'type': 'rdv', 'client': 'lui', 'date': 'mardi prochain'}, 'c13')
        check('RDV sans heure : il demande l\'heure (rien de préparé)', r and "Il manque l'heure" in r)
        r = await tool('crm_noter', {'type': 'compte_rendu', 'client': 'Gaudin', 'texte': 'Il veut 40 fenêtres, devis Hoppe à faire', 'echange': 'visite'}, 'c14')
        check('Compte rendu : relecture « Compte rendu de visite, Menuiserie Gaudin »', r and 'Compte rendu de visite, Menuiserie Gaudin (Jean Gaudin)' in r, str(r))
        fin_tour(); await asyncio.sleep(0.1)
        heard("Oui c'est bon."); await asyncio.sleep(0.2)
        r = await tool('crm_confirmer', {}, 'c15')
        w = sc['writes'][-1]
        check('… confirmé → BROUILLON (crm_brouillon), à valider dans le CRM', w.get('action') == 'crm_brouillon' and w.get('type') == 'compte_rendu' and w.get('echange') == 'visite' and w.get('confirme') is True and 'Dicté à Wilson' in (r or ''), json.dumps(w, ensure_ascii=False))

        # Confirmation par l'écran
        r = await tool('crm_noter', {'type': 'note', 'client': 'Gaudin', 'texte': 'Le fils reprend en 2027'}, 'c16')
        await page.click('.card-ok'); await asyncio.sleep(0.5)
        w = sc['writes'][-1]
        check('Appui sur « Oui, enregistre » : note enregistrée en brouillon, Gemini prévenu', w.get('type') == 'note' and any('touchant « Oui »' in t for t in conn['texts']), json.dumps(w, ensure_ascii=False))
        r = await tool('crm_noter', {'type': 'tache', 'texte': 'Acheter du papier', 'date': 'demain'}, 'c17')
        await page.click('.card-x'); await asyncio.sleep(0.3)
        n = len(sc['writes'])
        r = await tool('crm_confirmer', {}, 'c18')
        check('Appui sur « Non » : rien n\'est écrit', len(sc['writes']) == n and r and 'NON ENREGISTRÉ' in r)

        # Appel lancé puis retour : il propose le compte rendu
        await page.evaluate("wilson._calling({ nom: 'Jean Gaudin', societe: 'Menuiserie Gaudin', tel: '0611223344', aff: '06 11 22 33 44' })")
        await page.wait_for_function('wilson.state === "veille"', timeout=5000)
        await page.evaluate("wilson._callAfter.at = Date.now() - 60000; wilson._backFromCall()")
        await page.wait_for_function('wilson.state === "conversation"', timeout=8000)
        await asyncio.sleep(0.5)
        check('Retour d\'appel : Wilson propose de dicter le compte rendu', any('vient de raccrocher avec Jean Gaudin' in t for t in conns[-1]['texts']), str(conns[-1]['texts'][-2:]))
        check('Journal : écriture refusée par le verrou notée', any('Écriture REFUSÉE par le verrou' in l for l in logs))
        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript (direct)', not errs, '; '.join(errs)[:300])

        # 4. Mode économique : même chemin par le champ « crm »
        eco = {'reqs': [], 'seq': []}
        async def gen(route):
            req = route.request; H = {'access-control-allow-origin': '*'}
            if req.method == 'OPTIONS': await route.fulfill(status=204, headers={**H, 'access-control-allow-headers': '*'}); return
            body = json.loads(req.post_data); eco['reqs'].append(body)
            reply = eco['seq'].pop(0) if eco['seq'] else {'pour_moi': True, 'reponse': 'OK', 'emotion': 'neutre', 'entendu': ''}
            text = json.dumps(reply, ensure_ascii=False)
            if 'stream' in req.url:
                sse = 'data: ' + json.dumps({'candidates': [{'content': {'role': 'model', 'parts': [{'text': text}]}}]}, ensure_ascii=False) + '\r\n\r\n'
                await route.fulfill(status=200, content_type='text/event-stream', headers=H, body=sse)
            else:
                await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'candidates': [{'content': {'parts': [{'text': text}]}}]}))
        page2, logs2 = await setup_page({**BASE, 'brainMode': 'eco'})
        await page2.route(re.compile(r'.*generativelanguage\.googleapis\.com/v1beta/models/.*Content.*'), gen)
        await page2.goto('http://127.0.0.1:8765/index.html')
        await page2.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
        await page2.evaluate("wilson.startConversation('toucher')")
        await page2.wait_for_function('wilson.state === "conversation" && wilson.mode === "eco"', timeout=10000)
        await page2.wait_for_function('!wilson.voice.speaking', timeout=8000)
        eco['seq'] = [{'pour_moi': True, 'crm': {'outil': 'client', 'client': 'Gaudin'}, 'emotion': 'reflexion', 'reponse': 'Je regarde dans le CRM.', 'entendu': 'Parle-moi de Gaudin.'},
                      {'pour_moi': True, 'emotion': 'neutre', 'reponse': 'Menuiserie Gaudin à Cholet : rendez-vous jeudi à 14h00.', 'entendu': ''}]
        n0 = len(sc['calls']); r0 = len(eco['reqs'])
        await page2.evaluate("wilson._ecoSend({ text: '[test]' })")
        await page2.wait_for_function("window.__spoken.some(t => /rendez-vous jeudi/.test(t))", timeout=10000)
        sch = eco['reqs'][r0]['generationConfig'].get('responseSchema', {})
        check('Économique : schéma avec le champ « crm »', 'crm' in sch.get('properties', {}), str(list(sch.get('properties', {}))))
        check('… question au CRM puis 2e requête avec la réponse du CRM', sc['calls'][n0].get('action') == 'crm_client' and 'Réponse du CRM' in json.dumps(eco['reqs'][-1], ensure_ascii=False), str(sc['calls'][n0:]))
        await page2.wait_for_function('!wilson.voice.speaking', timeout=8000)
        eco['seq'] = [{'pour_moi': True, 'crm': {'outil': 'noter', 'type': 'tache', 'client': 'Gaudin', 'texte': 'Envoyer le catalogue', 'date': 'demain'}, 'emotion': 'neutre', 'reponse': '', 'entendu': 'Note que je dois envoyer le catalogue à Gaudin demain.'}]
        await page2.evaluate("wilson._ecoSend({ text: '[test]' })")
        await page2.wait_for_function("window.__spoken.some(t => /Je l'enregistre/.test(t))", timeout=10000)
        nw = len(sc['writes'])
        check('Économique : relecture dite par Wilson, rien d\'écrit', nw == len(sc['writes']) and any('Envoyer le catalogue' in t for t in await page2.evaluate('window.__spoken')))
        await page2.wait_for_function('!wilson.voice.speaking', timeout=8000)
        eco['seq'] = [{'pour_moi': True, 'crm': {'outil': 'confirmer'}, 'emotion': 'joie', 'reponse': '', 'entendu': 'Oui, vas-y.'}]
        await page2.evaluate("wilson._ecoSend({ text: '[test]' })")
        await page2.wait_for_function("window.__spoken.some(t => /noté dans tes tâches/.test(t))", timeout=10000)
        w = sc['writes'][-1]
        tomorrow = (date.today() + timedelta(days=1)).strftime('%d/%m/%Y')
        check('Économique : « Oui, vas-y » → tâche écrite pour demain', w.get('action') == 'crm_tache' and w.get('date') == tomorrow and w.get('confirme') is True, json.dumps(w, ensure_ascii=False))
        errs = [l for l in logs2 if 'PAGEERROR' in l]
        check('Aucune erreur JavaScript (économique)', not errs, '; '.join(errs)[:300])

        # 5. Réglages : état du CRM
        await page2.evaluate("wilson.ui.open()"); await asyncio.sleep(0.8)
        txt = await page2.inner_text('#s-crmstatus')
        check('Réglages : « CRM relié ✓ — 437 contacts »', 'CRM relié ✓' in txt and '437' in txt, txt)
        await page2.screenshot(path=os.path.join(S, 'shots', 'crm_reglages.png'), full_page=True)
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications OK")

asyncio.run(main())
