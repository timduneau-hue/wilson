"""La maison (PLAN 7 bis, D3 et D7) avec un faux Home Assistant :
- outils maison_etat / maison_commande proposés seulement quand l'adresse et le jeton sont réglés ;
- l'inventaire (noms, pièces, possibilités, état) est dans la consigne ; prises cachées et réglages écartés ;
- commandes : allumer, luminosité (refusée sur une prise), volume, appli de la télé (télécommande Android TV), radio
  (Radio Browser → enceinte), clignoter (remet l'état de départ), appareil introuvable (liste), jeton refusé, Tailscale éteint ;
- consigne : demande floue → une question ; mode économique : voie simple (assistant de Home Assistant) ; vérification."""
import asyncio, re, json, os
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, '' if ok else detail, flush=True)
FAKE_TTS = open(os.path.join(S, 'e2e_eco.py'), encoding='utf-8').read().split('FAKE_TTS = """')[1].split('"""')[0]
HA = 'https://homeassistant.exemple.ts.net'

def etats(st):
    L = lambda i, n, on, **a: {'entity_id': i, 'state': 'on' if on else 'off', 'attributes': {'friendly_name': n, **a}}
    return [L('light.grande_lumiere_salon', 'Grande lumière salon', st['grande'], supported_color_modes=['onoff']),
            L('light.lumiere_jaune_salon', 'Lumière jaune salon', True, supported_color_modes=['onoff']),
            L('light.plafonnier', 'Plafonnier cuisine', False, supported_color_modes=['brightness'], brightness=None),
            L('switch.grande_lumiere_salon', 'Grande lumière salon Prise 1', st['grande']),
            L('switch.prise_led', 'Éclairage balcon LED', True),
            {'entity_id': 'media_player.television', 'state': 'on', 'attributes': {'friendly_name': 'Télé', 'volume_level': st['vol'], 'supported_features': 152461}},
            {'entity_id': 'media_player.tele', 'state': 'off', 'attributes': {'friendly_name': 'Télé (Chromecast)', 'supported_features': 152463}},
            {'entity_id': 'media_player.enceinte_salon', 'state': 'off', 'attributes': {'friendly_name': 'Enceinte salon', 'supported_features': 152463}},
            {'entity_id': 'remote.tele', 'state': 'on', 'attributes': {'friendly_name': 'Télécommande télé'}},
            {'entity_id': 'script.netflix', 'state': 'off', 'attributes': {'friendly_name': 'Netflix'}}]
TPL = ('light.grande_lumiere_salon|Salon|False|False\nlight.lumiere_jaune_salon|Salon|False|False\nlight.plafonnier|Cuisine|False|False\nswitch.grande_lumiere_salon|Salon|True|False\n'
       'switch.prise_led|Balcon|False|False\nmedia_player.television|Salon|False|False\nmedia_player.tele|Salon|False|True\nmedia_player.enceinte_salon|Salon|False|True\nremote.tele|Salon|False|False\nscript.netflix||False|False\n')


async def main():
    conns, st = [], {'svc': [], 'down': False, 'grande': False, 'vol': 0.2, 'conv': []}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])

        def handler(ws):
            conn = {'setup': None, 'tool': []}; conns.append(conn)
            def on_msg(m):
                d = json.loads(m)
                if 'setup' in d: conn['setup'] = d['setup']; ws.send(json.dumps({'setupComplete': {}}))
                elif 'toolResponse' in d: conn['tool'].append(d['toolResponse'])
            ws.on_message(on_msg)

        async def ha(route):
            req = route.request
            H = {'access-control-allow-origin': 'http://127.0.0.1:8765', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST'}
            if req.method == 'OPTIONS': await route.fulfill(status=200, headers=H, body=''); return
            if st['down']: await route.abort('connectionrefused'); return
            if req.headers.get('authorization') != 'Bearer jeton-test': await route.fulfill(status=401, headers=H, body='{"message":"Unauthorized"}'); return
            u = req.url; body = {}
            if u.endswith('/api/'): body = {'message': 'API running.'}
            elif u.endswith('/api/config'): body = {'location_name': 'Maison', 'version': '2026.10.4'}
            elif u.endswith('/api/states'): body = etats(st)
            elif u.endswith('/api/template'): await route.fulfill(status=200, headers=H, content_type='text/plain', body=TPL); return
            elif '/api/services/' in u:
                d = json.loads(req.post_data or '{}'); dom, svc = u.split('/api/services/')[1].split('/')
                st['svc'].append((dom, svc, d))
                if dom == 'light' and d.get('entity_id') == 'light.grande_lumiere_salon':
                    if svc == 'turn_on' and 'brightness_pct' not in d: st['grande'] = True
                    elif svc == 'turn_off': st['grande'] = False
                    elif svc == 'toggle': st['grande'] = not st['grande']
                if svc == 'volume_set': st['vol'] = d['volume_level']
                body = []
            elif u.endswith('/api/conversation/process'):
                st['conv'].append(json.loads(req.post_data or '{}'))
                body = {'response': {'response_type': 'action_done', 'speech': {'plain': {'speech': 'Allumé'}}, 'data': {'success': []}}}
            await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(body, ensure_ascii=False))

        async def radio(route):
            await route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps([
                {'name': 'France Inter', 'url_resolved': 'https://stream.radiofrance.fr/franceinter/franceinter_hifi.m3u8?id=radiofrance', 'codec': 'UNKNOWN', 'countrycode': 'FR'},
                {'name': 'France Inter ', 'url_resolved': 'https://icecast.radiofrance.fr/franceinter-hifi.aac', 'codec': 'AAC', 'countrycode': 'FR'}]))

        async def page_with(settings):
            ctx = await b.new_context(viewport={'width': 800, 'height': 1000}, permissions=['microphone', 'camera'], service_workers='block')
            await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify(%s));" % json.dumps(settings))
            await ctx.add_init_script(FAKE_TTS)
            page = await ctx.new_page(); logs = []
            await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
            await page.route(re.compile(r'https://homeassistant\.exemple\.ts\.net/.*'), ha)
            await page.route(re.compile(r'https://all\.api\.radio-browser\.info/.*'), radio)
            await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)
            page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))
            await page.goto('http://127.0.0.1:8765/index.html')
            await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
            return ctx, page, logs

        base = {'apiKey': 'AIzaTESTTESTTESTTESTTESTTESTTEST', 'camera': False, 'listenMode': 'toujours', 'v': 3}
        ctx, page, logs = await page_with(base)
        await page.evaluate("wilson.startConversation('toucher')"); await page.wait_for_function('wilson.brain.open', timeout=8000)
        fns = [f['name'] for t in conns[-1]['setup'].get('tools', []) for f in t.get('functionDeclarations', [])]
        check('Maison non reliée : pas d\'outils maison', not any(f.startswith('maison') for f in fns), str(fns))
        await ctx.close()

        ctx, page, logs = await page_with({**base, 'haUrl': HA, 'haToken': 'jeton-test'})
        await page.wait_for_function('wilson.maison.inv && wilson.maison.inv.length', timeout=8000)
        await page.evaluate("wilson.startConversation('toucher')"); await page.wait_for_function('wilson.brain.open', timeout=8000)
        c = conns[-1]; fns = [f['name'] for t in c['setup'].get('tools', []) for f in t.get('functionDeclarations', [])]
        sysp = c['setup']['systemInstruction']['parts'][0]['text']
        check('Maison reliée : outils maison_etat et maison_commande', 'maison_etat' in fns and 'maison_commande' in fns, str(fns))
        check('Inventaire dans la consigne (nom, identifiant, pièce, état)', '- Grande lumière salon [light.grande_lumiere_salon] : lumière, Salon ; allumer, éteindre ; actuellement éteint' in sysp and 'Télé [media_player.television]' in sysp, sysp[sysp.find('Appareils'):][:600])
        check('… sans les prises cachées, les réglages (LED) ni la télécommande', 'Prise 1' not in sysp and 'LED' not in sysp and 'remote.tele' not in sysp)
        check('Consigne : comprendre, agir sans confirmation, une question si c\'est flou', 'Demande floue' in sysp and 'UNE question courte' in sysp and 'sans phrase d\'attente ni confirmation' in sysp)

        async def tool(i, name, args):
            await page.evaluate("([i, n, a]) => wilson._tools([{ id: i, name: n, args: a }])", [i, name, args])
            for _ in range(40):
                await page.wait_for_timeout(100)
                for t in c['tool']:
                    for r in t.get('functionResponses', []):
                        if r['id'] == i: return r['response']['result']
            return ''
        r = await tool('a1', 'maison_commande', {'appareil': 'light.grande_lumiere_salon', 'action': 'allumer'})
        check('Allumer : service light.turn_on, état relu (« Grande lumière salon : allumé »)', ('light', 'turn_on', {'entity_id': 'light.grande_lumiere_salon'}) in st['svc'] and r.startswith('OK') and 'Grande lumière salon : allumé' in r, r)
        r = await tool('a2', 'maison_commande', {'appareil': 'grande lumière', 'action': 'luminosite', 'valeur': '40'})
        check('Luminosité sur une lampe branchée sur prise : refus expliqué, rien envoyé', r.startswith('Échec') and 'prise' in r and not any('brightness_pct' in x[2] for x in st['svc']), r)
        r = await tool('a3', 'maison_commande', {'appareil': 'Plafonnier cuisine', 'action': 'luminosite', 'valeur': '40'})
        check('Luminosité sur une vraie lampe : brightness_pct 40', any(x[2].get('brightness_pct') == 40 for x in st['svc']) and r.startswith('OK'), r)
        r = await tool('a4', 'maison_commande', {'appareil': 'media_player.television', 'action': 'volume', 'valeur': '35'})
        check('Volume de la télé : 35 %', any(x[1] == 'volume_set' and abs(x[2]['volume_level'] - 0.35) < 1e-6 for x in st['svc']) and 'volume 35 %' in r, r)
        r = await tool('a5', 'maison_commande', {'appareil': 'Télé', 'action': 'appli', 'valeur': 'Netflix'})
        check('Appli Netflix : la télécommande Android TV ouvre com.netflix.ninja', ('remote', 'turn_on', {'entity_id': 'remote.tele', 'activity': 'com.netflix.ninja'}) in st['svc'] and 'Netflix' in r, r)
        r = await tool('a6', 'maison_commande', {'appareil': 'Enceinte salon', 'action': 'radio', 'valeur': 'France Inter'})
        pm = [x for x in st['svc'] if x[1] == 'play_media']
        check('Radio France Inter : flux AAC (pas le m3u8) joué sur l\'enceinte', pm and pm[-1][2]['entity_id'] == 'media_player.enceinte_salon' and pm[-1][2]['media_content_id'].endswith('.aac') and 'France Inter sur Enceinte salon' in r, str(pm) + r)
        r = await tool('a7', 'maison_commande', {'appareil': 'Télé', 'action': 'radio', 'valeur': 'France Inter'})
        pm = [x for x in st['svc'] if x[1] == 'play_media']
        check('Radio « sur la télé » : envoyée au Chromecast de la télé (la télé Android ne lit pas de lien)', pm[-1][2]['entity_id'] == 'media_player.tele', str(pm[-1]))
        n0 = len(st['svc']); st['grande'] = True
        r = await tool('a8', 'maison_commande', {'appareil': 'light.grande_lumiere_salon', 'action': 'clignoter', 'valeur': '2'})
        check('Clignoter : réponse tout de suite', r.startswith('OK') and 'clignote 2 fois' in r, r)
        await page.wait_for_timeout(4800)
        tg = [x for x in st['svc'][n0:] if x[2].get('entity_id') == 'light.grande_lumiere_salon']
        check('… 4 bascules puis retour à l\'état de départ (allumée)', [x[1] for x in tg] == ['toggle'] * 4 + ['turn_on'] and st['grande'], str([x[1] for x in tg]))
        r = await tool('a9', 'maison_commande', {'appareil': 'frigo', 'action': 'allumer'})
        check('Appareil introuvable : liste des appareils pour choisir ou demander', r.startswith('Échec') and 'Lumière jaune salon [light.lumiere_jaune_salon]' in r and 'demande-lui' in r, r)
        r = await tool('b1', 'maison_etat', {})
        check('maison_etat : toute la maison avec les pièces', 'Grande lumière salon (Salon) : allumé' in r and 'Télé (Salon) : allumé, volume 35 %' in r and 'Netflix' not in r, r)
        st['down'] = True
        r = await tool('b2', 'maison_commande', {'appareil': 'light.grande_lumiere_salon', 'action': 'eteindre'})
        st['down'] = False
        check('Home Assistant injoignable : « Tailscale n\'est peut-être pas allumé »', r.startswith('Échec') and 'Tailscale' in r, r)
        check('Journal : action, appareil et résultat notés', any('Maison : allumer → Grande lumière salon : ok' in l for l in logs), str([l for l in logs if 'Maison' in l][:3]))
        eco = await page.evaluate("wilson._system('eco')")
        check('Mode économique : champ « maison » (voie simple)', '"maison": "vide, sauf si' in eco and 'remplis le champ "maison"' in eco)
        r = await page.evaluate("wilson.maison.dire('lance Netflix')")
        check('Voie simple : phrase envoyée à l\'assistant de Home Assistant', st['conv'] and st['conv'][-1]['text'] == 'lance Netflix' and st['conv'][-1]['language'] == 'fr' and r['ok'], str(st['conv'][-1:]))
        r = await page.evaluate("wilson.maison.verifier()")
        check('Vérifier la maison : « Maison reliée ✓ … 6 appareils »', r['ok'] and 'Maison reliée' in r['msg'] and '6 appareils' in r['msg'], str(r))
        await page.evaluate("wilson.settings.haToken = 'faux'; wilson.maison.inv = null")
        r = await page.evaluate("wilson.maison.commande({ appareil: 'Télé', action: 'allumer' })")
        check('Jeton refusé : il faut le recréer', not r['ok'] and 'jeton' in r['info'], str(r))
        check('Aucune erreur JavaScript', not any(l.startswith('PAGEERROR') for l in logs), str([l for l in logs if l.startswith('PAGEERROR')]))
        await ctx.close(); await b.close()
    print(f'\n{sum(results)}/{len(results)} OK'); raise SystemExit(0 if all(results) else 1)

asyncio.run(main())
