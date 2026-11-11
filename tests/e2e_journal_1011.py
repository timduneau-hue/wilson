"""Journal du 06/11/26 au 10/11/26 (version 1.37.0), téléphone relié à la voiture (protocole voiture), rejoué :
 1. En veille dans la voiture, le micro est fermé ; il se rouvre quand on touche l'écran (remarque du 06/11, 08h57).
 2. 06/11, 08h43:18 et 08h45:13 : guidage vers Lebre lancé alors qu'il n'avait cité que le nom, puis relancé sur « pourquoi tu
    as activé le GPS alors que j'ai pas dit qu'on allait à Lèbre ? » → refusé ; « emmène-moi chez Lebre » → lancé.
 3. 06/11, 08h41 et 08h46 (84 s puis 80 s), 10/11, 08h47 (limite de Claude) : « combien de clients actifs ce mois-ci » →
    réponse tout de suite, depuis le bilan du CRM, sans Claude ni analyste ; objectif = N-1, ce qu'il manque calculé ;
    « même mois l'an dernier » n'est pas « le mois dernier » (09/11, 12h27).
 4. 06/11, 08h46:06 : la même réponse répétée sans outil (chiffres déjà reçus) → dite, plus jetée par le verrou.
 5. 10/11, 08h47:23 : « You've hit your weekly limit » lu comme une réponse → limite reconnue, l'analyste répond, Wilson dit
    que Claude a atteint sa limite, et ne redemande plus à Claude avant l'heure de reprise.
 6. 09/11, 17h52:33 : « (Wilson reste silencieux car…) » dit à voix haute → coupé.
 7. 06/11, 08h48-08h49 : retoucher l'écran pendant la discussion le rendort, sauf si une validation est affichée.
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
BILAN = ("Exercice 2026/27 à ce jour : 258 576 €, contre 261 190 € à la même date l'an dernier (−1 %). Ce mois-ci : 28 414 € contre 21 804 € l'an dernier. "
         "Clients actifs ce mois-ci (qui ont commandé) : 23 ; même mois l'an dernier, mois entier : 49. Clients actifs depuis le début de l'exercice : 82.")
LEBRE = {'cle': '["M LEBRE Jean","LEBRE"]', 'societe': 'LEBRE', 'contact': 'M LEBRE Jean', 'ville': 'Vigneux-de-Bretagne', 'adresse': 'LEBRE VIGNEUX DE BRETAGNE', 'contacts': [{'nom': 'M LEBRE Jean', 'tel': '06 11 22 33 44'}]}
LIMITE = "You've hit your weekly limit · resets 4am (Europe/Paris)"


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
    st = {'calls': [], 'claude': [], 'gem': 0, 'n_res': {}}
    conns = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 412, 'height': 900}, permissions=['microphone', 'camera'], service_workers='block', user_agent=PHONE_UA)
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AIzaTESTTESTTESTTESTTESTTESTTEST', listenMode:'regard', model:'gemini-3.1-flash-live-preview', logUrl:'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTEST/exec?k=0123456789abcdef0123456789abcdef', crm:true, camera:true, v:4}));")
        await ctx.add_init_script(STUB)
        page = await ctx.new_page(); logs = []

        async def script(route):
            req = route.request
            if req.method != 'POST': await route.fulfill(status=200, headers=H, body='ok'); return
            d = json.loads(req.post_data or '{}'); a = d.get('action', ''); st['calls'].append(d)
            if a == 'crm_client':
                q = (d.get('client') or '').upper()
                body = {'ok': True, **LEBRE, 'texte': f"Client : LEBRE, {LEBRE['adresse']}. Contacts : M LEBRE Jean."} if 'LEBRE' in q or 'LÈBRE' in q else {'ok': True, 'texte': 'Aucun client.'}
            elif a == 'crm_bilan': body = {'ok': True, 'texte': BILAN}
            elif a == 'crm_schema': body = {'ok': True, 'texte': 'Tables : commandes (date, client, article, quantite).'}
            elif a == 'crm_requete': body = {'ok': True, 'texte': 'Recherche 1 : AD2M, GALLAIS SARL et FMA, aucune serrure depuis mars.'}
            elif a == 'crm_journee': body = {'ok': True, 'rdv': [], 'texte': 'Aucun rendez-vous.'}
            elif a == 'claude_etat': body = {'ok': True, 'pc': {'vivant': True, 'vu': 3}}
            elif a == 'claude_demander':
                st['claude'].append(d); body = {'ok': True, 'accepte': True, 'id': d['id'], 'etat': 'attente', 'pc': {'vivant': True, 'vu': 3}}
            elif a == 'claude_resultat':
                n = st['n_res'][d['id']] = st['n_res'].get(d['id'], 0) + 1
                body = {'ok': True, 'etat': 'en_cours', 'pris': 1, 'pc': {'vivant': True, 'vu': 3}} if n == 1 else \
                    {'ok': True, 'etat': 'faite', 'dire': LIMITE, 'detail': '', 'etapes': 1, 'duree': 4, 'pc': {'vivant': True, 'vu': 3}}
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
                    st['gem'] += 1
                    o = {'action': 'repondre', 'reponse': "AD2M, Gallais et FMA n'ont pas commandé de serrures depuis mars."} if 'Recherche 1' in post else {'action': 'chercher', 'pourquoi': 'serrures depuis mars', 'recherches': [{'table': 'commandes', 'filtres': []}]}
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
        has = lambda t: any(t in l for l in logs)
        sysp = lambda c: c['setup']['systemInstruction']['parts'][0]['text']
        resp = lambda c, cid: next((r['response'].get('result', '') for r in c['tools'] if r.get('id') == cid), None)
        dit = lambda t: any(l.startswith('Wilson : ') and t in l for l in logs)

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
            parle(c, 'Oui ?', sec=0.5)
            await page.wait_for_timeout(700)
            return c

        async def demande(c, texte):                      # ce que Timothée dit (transcription), avant l'appel d'outil
            send(c, inputTranscription={'text': texte})
            await page.wait_for_timeout(300)

        # ---------- 1. Micro fermé en veille, dans la voiture ----------
        check('Téléphone relié à la voiture : protocole voiture', await page.evaluate("wilson._voitureBt"))
        ok = await attendre(lambda: page.evaluate("wilson.audio.micPaused === true"), 6)
        check('En veille dans la voiture : micro fermé (remarque du 06/11/26, 08h57)', ok and has('micro fermé (voiture, en veille'), str([l for l in logs if 'micro' in l.lower()][-4:]))
        check('… et pas d\'alerte « je ne t\'entends plus » pour autant', not has('Sourd : micro muet'))
        g0 = await page.evaluate("window.__gum")
        c = await toucher()
        ok = await attendre(lambda: page.evaluate("wilson.audio.micPaused === false && !!wilson.audio.stream"), 4)
        check('Toucher l\'écran : réveil, micro rouvert', ok and (await page.evaluate("window.__gum")) > g0 and has('réouverture du micro (réveil)'), str([l for l in logs if 'micro' in l.lower()][-4:]))
        check('Consigne : il se rendort quand on retouche l\'écran', "tu te rendors quand il retouche l'écran" in sysp(c))
        check('Consigne : un nom de client n\'est pas une demande de GPS (remarque de 08h45:47)', "ce n'est PAS une demande d'y aller" in sysp(c))

        # ---------- 2. Guidage seulement s'il le demande ----------
        await demande(c, 'Lebre ?')                        # le nom seul (« le verre » à 08h43:37 : transcription approximative)
        outil(c, 'itineraire', {'client': 'Lebre'}, 'i1')
        ok = await attendre(lambda: resp(c, 'i1') is not None, 6)
        r = resp(c, 'i1') or ''
        check('« Lebre ? » (le nom seul) puis itineraire(Lebre) : REFUSÉ, rien de lancé (06/11, 08h43:18)', ok and 'REFUSÉ' in r and 'ne propose pas' in r
              and not any(x.get('action') == 'crm_client' for x in st['calls']) and has('Itinéraire vers « Lebre » refusé'), r[:200])
        parle(c, 'Pardon, je ne lance rien.', sec=0.6); await page.wait_for_timeout(600)
        await demande(c, "Et pourquoi tu as activé le GPS alors que j'ai pas dit que on allait à Lèbre ?")
        outil(c, 'itineraire', {'client': 'Lèbre'}, 'i2')
        ok = await attendre(lambda: resp(c, 'i2') is not None, 6)
        check('« pourquoi tu as activé le GPS… » : REFUSÉ, même avec le mot « GPS » (08h45:13)', ok and 'REFUSÉ' in (resp(c, 'i2') or '') and await page.evaluate("document.getElementById('cards').innerText") == '', resp(c, 'i2'))
        parle(c, 'Pardon, je ne lance rien.', sec=0.6); await page.wait_for_timeout(600)
        await demande(c, 'Emmène-moi chez Lebre.')
        outil(c, 'itineraire', {'client': 'Lebre'}, 'i3')
        ok = await attendre(lambda: resp(c, 'i3') is not None, 8)
        check('« Emmène-moi chez Lebre » : guidage lancé tout de suite (bouton affiché)', ok and 'REFUSÉ' not in (resp(c, 'i3') or '') and 'LEBRE' in (await page.evaluate("document.getElementById('cards').innerText")).upper(), resp(c, 'i3'))
        parle(c, "J'affiche l'itinéraire vers Lebre.", sec=0.6); await page.wait_for_timeout(600)
        await page.evaluate("wilson.hideCard && wilson.hideCard()")

        # ---------- 3. Clients actifs : sans IA ----------
        n_cl = len(st['claude']); g0 = st['gem']
        await demande(c, 'Combien de clients actifs ce mois-ci ?')
        t0 = time.monotonic()
        outil(c, 'crm_question', {'question': 'OBJECTIF CLIENTS ACTIFS Combien de clients actifs ce mois-ci ?'}, 'q1')
        ok = await attendre(lambda: resp(c, 'q1') is not None, 10)
        r = resp(c, 'q1') or ''
        check('« Combien de clients actifs ce mois-ci » : réponse en quelques secondes (84 s le 06/11)', ok and time.monotonic() - t0 < 8, f'{time.monotonic() - t0:.1f} s')
        check('… chiffres du bilan : 23 ce mois-ci, 49 le même mois l\'an dernier, objectif 49, il en manque 26', ' 23' in r and '49' in r and 'Il en manque 26' in r and 'Objectif du mois : 49' in r, r[:400])
        check('… « même mois l\'an dernier » n\'est PAS « le mois dernier » (09/11, 12h27)', "ce n'est PAS le mois dernier" in r, r[:400])
        check('… sans Claude ni l\'analyste (remarque du 10/11, 08h51)', len(st['claude']) == n_cl and st['gem'] == g0 and has('Clients actifs (bilan du CRM, sans IA)'), f"claude {len(st['claude']) - n_cl}, analyste {st['gem'] - g0}")
        check('… et rien proposé après (remarque du 06/11, 08h47)', "ne propose rien d'autre" in r)
        parle(c, "Tu as 23 clients actifs ce mois-ci, pour un objectif de 49 : il t'en manque 26.", sec=0.8); await page.wait_for_timeout(700)

        # ---------- 4. La même réponse redite sans outil : dite ----------
        logs_n = len(logs)
        await demande(c, 'Redis-moi le nombre de clients actifs ce mois-ci.')
        parle(c, "Tu as 23 clients actifs ce mois-ci, pour un objectif de 49 : il t'en manque 26.", sec=1.2)
        await page.wait_for_timeout(900)
        nouv = logs[logs_n:]
        check('Réponse répétée sans outil, chiffres déjà reçus : dite (06/11, 08h46:06)', any("reprise d'un résultat déjà reçu, dite" in l for l in nouv) and not any('JAMAIS DITE' in l for l in nouv), str([l for l in nouv if 'Verrou' in l]))
        logs_n = len(logs)
        await demande(c, 'Et combien de clients actifs ce mois-ci ?')
        parle(c, "Tu as 31 clients actifs ce mois-ci.", sec=1.0)
        await page.wait_for_timeout(900)
        check('… mais un chiffre qui ne vient de nulle part : toujours jamais dit', any('JAMAIS DITE' in l for l in logs[logs_n:]), str([l for l in logs[logs_n:] if 'Verrou' in l]))
        await attendre(lambda: any(r.get('id') for r in c['tools']) and True, 1)
        # (le verrou lui fait appeler l'outil : on répond avec le bon chiffre)
        outil(c, 'crm_bilan', {}, 'b1')
        ok = await attendre(lambda: resp(c, 'b1') is not None, 8)
        check('crm_bilan : les clients actifs expliqués (N-1, objectif, il en manque 26)', ok and "ce n'est PAS le mois dernier" in (resp(c, 'b1') or '') and 'Il en manque 26' in (resp(c, 'b1') or ''), (resp(c, 'b1') or '')[-400:])
        parle(c, "Tu as 23 clients actifs, il t'en manque 26.", sec=0.6); await page.wait_for_timeout(700)

        # ---------- 5. Limite d'utilisation de Claude ----------
        n_cl = len(st['claude']); g0 = st['gem']; t_n = len(c['texts'])
        await demande(c, "Qui n'a pas commandé de serrures depuis mars ?")
        outil(c, 'crm_question', {'question': "Qui n'a pas commandé de serrures depuis mars ?"}, 'q2')
        ok = await attendre(lambda: any("AD2M, Gallais et FMA" in t for t in c['texts'][t_n:]), 20)
        fin = next((t for t in c['texts'][t_n:] if 'AD2M, Gallais et FMA' in t), '')
        check('Claude « You\'ve hit your weekly limit » : pas lu comme une réponse, l\'analyste répond (10/11, 08h47:23)', ok and LIMITE not in fin and len(st['claude']) == n_cl + 1 and st['gem'] > g0, fin[:300])
        check('… et Wilson dit que Claude a atteint sa limite d\'utilisation', "limite d'utilisation" in fin, fin[:300])
        check('… journal : « limite d\'utilisation atteinte », reprise à 4h00', has("Claude (PC) indisponible (limite : limite d'utilisation atteinte") and has('avant 4h00'), str([l for l in logs if 'Claude (PC)' in l][-2:]))
        parle(c, "Claude a atteint sa limite d'utilisation, c'est l'analyste qui a cherché : AD2M, Gallais et FMA n'ont pas commandé de serrures depuis mars.", sec=1.0); await page.wait_for_timeout(700)
        t_n = len(c['texts'])
        await demande(c, "Et qui n'a pas commandé de crémones depuis mars ?")
        outil(c, 'crm_question', {'question': "Qui n'a pas commandé de crémones depuis mars ?"}, 'q3')
        ok = await attendre(lambda: any('AD2M, Gallais et FMA' in t for t in c['texts'][t_n:]), 20)
        check('Question suivante : Claude n\'est plus interrogé avant la reprise (rien envoyé au PC)', ok and len(st['claude']) == n_cl + 1, f"{len(st['claude']) - n_cl} question(s) à Claude")
        parle(c, "AD2M, Gallais et FMA n'ont pas commandé de serrures depuis mars.", sec=0.8); await page.wait_for_timeout(700)

        # ---------- 6. Didascalie ----------
        logs_n = len(logs)
        parle(c, "(Wilson reste silencieux car la conversation ne semble pas s'adresser à lui.)", sec=2.0)
        await page.wait_for_timeout(600)
        check('« (Wilson reste silencieux car…) » : coupé, pas joué (09/11, 17h52:33)', any('Didascalie coupée' in l for l in logs[logs_n:]) and not await page.evaluate("wilson.audio.playing") and not dit('(Wilson reste silencieux'), str(logs[logs_n:])[-300:])
        check('Consigne : pour se taire, ne rien dire (pas de didascalie)', 'jamais de didascalie' in sysp(c) or 'didascalie' in sysp(c))

        # ---------- 7. Retoucher l'écran le rendort, sauf validation affichée ----------
        await page.evaluate("""(() => { const el = document.getElementById('cards'); el.hidden = false;
            el.innerHTML = '<div class="card confirm"><p>Visite chez Lebre, je l\\'enregistre ?</p><button class="card-ok">Oui</button><button class="card-x">Non</button></div>'; })()""")
        await page.evaluate("wilson.sensors._emit('tap', 0.5, 0.2)")
        await page.wait_for_timeout(400)
        check('Écran touché avec une validation (Oui / Non) affichée : il reste éveillé (08h49:33)', await page.evaluate("wilson.state") == 'conversation' and has('je reste éveillé'))
        await page.evaluate("(() => { const el = document.getElementById('cards'); el.innerHTML = ''; el.hidden = true; })()")
        await page.evaluate("wilson.sensors._emit('tap', 0.5, 0.2)")
        ok = await attendre(lambda: page.evaluate("wilson.state === 'veille'"), 4)
        check('Écran retouché pendant la discussion : il se rendort tout de suite (08h48:52)', ok and has('écran retouché pendant la discussion : je me rendors') and has('Fin de conversation (toucher)'))
        ok = await attendre(lambda: page.evaluate("wilson.audio.micPaused === true"), 4)
        check('… et son micro se referme', ok)

        # ---------- 8. Hors de la voiture : micro rouvert ----------
        await page.evaluate("window.__bt = false; wilson.audio.btIn = false; wilson._voitureGraceMs = 0")
        ok = await attendre(lambda: page.evaluate("wilson.audio.micPaused === false"), 6)
        check('Plus dans la voiture : micro rouvert en veille (l\'oreille et le regard en ont besoin)', ok and has('réouverture du micro (plus en voiture)'), str([l for l in logs if 'micro' in l.lower()][-3:]))

        errs = [l for l in logs if 'PAGEERROR' in l]
        check('Aucune erreur de page', not errs, '\n'.join(errs[:3]))
        await b.close()
    print(f"\n{sum(results)}/{len(results)}")


asyncio.run(main())
