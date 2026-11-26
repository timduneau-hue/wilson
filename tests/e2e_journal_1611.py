"""Journal du 16/11/26 (version 1.43.4, tablette du salon et téléphone en voiture) — corrections de la 1.43.5.
 1. « Éteins toutes les lumières et fais chauffer la voiture » (tablette, 09h51:59) : le chauffage de la voiture était refusé
    (« il a demandé d'éteindre ») et Wilson disait quand même « je lance le chauffage » ; la voiture n'a pas chauffé (09h58:43).
    → la voiture et les chauffages échappent au garde-fou allumer/éteindre ; un refus dit « RIEN n'a été fait ».
 2. Question de trop coupée (téléphone, 09h58:58 et 09h59:43) : son texte arrivait avant son son, et c'est la fin de la VRAIE
    phrase qui était effacée (« tu finis pas tes phrases, ça coupe », 10h00:09). → la phrase d'avant est dite en entier,
    la question jamais, que le texte arrive avant, pendant ou après le son.
 3. Téléphone sans Home Assistant (09h58:43 « je ne contrôle pas les équipements ») : la consigne dit que c'est la tablette.
 4. « Recherche une idée business » noté comme une idée (10h01:46) : la description d'idees le distingue.
 9. (1.45.3) Fiche du client relue après une écriture pour lui, et hors de la voiture au-delà d'une heure ; sans réseau, la gardée.
 8. (1.45.2) Seul Timothée fait corriger le programme ; fiche du client : comptes rendus, tâches, historique, « À SIGNALER ».
 7. (1.45.1) Remarque inventée (tablette, 19h23:24) : sur « j'ai une nouvelle remarque », Gemini a noté « visage trop
    statique » (« j'ai jamais dit ça », 19h23:47). → une remarque sans aucun mot de ce qu'il a dit est refusée.
"""
import asyncio, re, json, base64, os
import numpy as np
from playwright.async_api import async_playwright

S = os.path.dirname(os.path.abspath(__file__))
results = []
def check(name, ok, detail=''):
    results.append(bool(ok)); print(('✅' if ok else '❌'), name, '' if ok else detail, flush=True)

GAZE = """window.__look = false;
setInterval(() => { const v = window.wilson && wilson.vision; if (!v) return;
  v.gazeReady = true; v.modelsDone = true; v.forceLook = false; v._lastResult = performance.now();
  v.looking = !!window.__look; if (window.__look) v.lookAt = v.sureAt = performance.now(); v.faceAt = performance.now(); v.hasPerson = true; v.faces = 1; }, 30);
window.__parle = (ms) => { const A = wilson.audio; const iv = setInterval(() => { A.lastVoicedAt = performance.now(); A.speaking = true; A._offCnt = 0; }, 15); setTimeout(() => clearInterval(iv), ms); };"""


def audio_chunks(seconds):
    sr = 24000; t = np.arange(int(sr * seconds)) / sr
    pcm = (np.sin(2 * np.pi * 180 * t) * 8000).astype(np.int16)
    return [base64.b64encode(pcm[i:i + 4800].tobytes()).decode() for i in range(0, len(pcm), 4800)]


async def main():
    conns = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            f'--use-file-for-fake-audio-capture={S}/fixtures/quiet.wav', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(bypass_csp=True, viewport={'width': 1280, 'height': 800}, permissions=['microphone', 'camera'], service_workers='block')
        await ctx.add_init_script("localStorage.setItem('wilson.settings', JSON.stringify({apiKey:'AIzaTESTTESTTESTTESTTESTTESTTEST', listenMode:'regard', brainMode:'live', convTimeout: 30, subtitles: true, v:3}));")
        await ctx.add_init_script(GAZE)
        page = await ctx.new_page(); logs = []
        await page.route(re.compile(r'.*/vendor/(face_detection|models|mediapipe)/.*'), lambda r: asyncio.ensure_future(r.abort()))
        page.on('console', lambda m: logs.append(m.text)); page.on('pageerror', lambda e: logs.append('PAGEERROR ' + str(e)))

        def handler(ws):
            conn = {'ws': ws, 'setup': None, 'texts': [], 'resp': {}}; conns.append(conn)
            def on_msg(m):
                d = json.loads(m)
                if 'setup' in d: conn['setup'] = d['setup']; ws.send(json.dumps({'setupComplete': {}}))
                elif 'realtimeInput' in d and 'text' in d['realtimeInput']: conn['texts'].append(d['realtimeInput']['text'])
                elif 'toolResponse' in d:
                    for fr in d['toolResponse'].get('functionResponses', []): conn['resp'][fr.get('id')] = json.dumps(fr.get('response'), ensure_ascii=False)
            ws.on_message(on_msg)
        await page.route_web_socket(re.compile(r'.*generativelanguage\.googleapis\.com.*'), handler)

        await page.goto('http://127.0.0.1:8765/index.html')
        await page.wait_for_function('window.wilson && wilson.state === "veille"', timeout=20000)
        await page.wait_for_timeout(500)
        await page.evaluate("window.__look = true; window.__parle(900)")
        await page.wait_for_function('wilson.state === "conversation" && wilson.brain.open', timeout=8000)
        conn = conns[-1]
        await page.wait_for_timeout(600)

        def envoi_audio(pcm):
            for i in range(0, len(pcm), 4800):
                conn['ws'].send(json.dumps({'serverContent': {'modelTurn': {'parts': [{'inlineData': {'mimeType': 'audio/pcm;rate=24000', 'data': base64.b64encode(pcm[i:i + 4800].tobytes()).decode()}}]}}}))

        def voix(sec):           # « voix » : un son modulé (pas de silence dedans)
            t = np.arange(int(24000 * sec)) / 24000
            return (np.sin(2 * np.pi * 180 * t) * (6000 + 3000 * np.sin(2 * np.pi * 3 * t))).astype(np.int16)

        async def attendre(cond, s=6.0):
            for _ in range(int(s * 10)):
                if cond(): return True
                await asyncio.sleep(0.1)
            return False

        sysi = json.dumps(conn['setup'] or {}, ensure_ascii=False)

        # ---------- 1. Lumières ET chauffage de la voiture dans la même phrase ----------
        await page.evaluate("""() => { const W = wilson; W._m0 = W.maison.commande; W._s0 = W._suiviVoiture;
          W.maison.commande = async (a) => ({ ok: true, voiture: /voiture/.test(a.appareil), info: /voiture/.test(a.appareil) ? 'Chauffage de la voiture : à fond demandé. La voiture met jusqu\\'à une minute ; je te dirai si elle refuse.' : 'Lumière jaune salon : éteint' });
          W._suiviVoiture = () => {};
          W._heard.push({ t: performance.now(), text: 'Éteins toutes les lumières et fais chauffer la voiture.', n: W._turnN });
          W._maisonCmd({ id: 'v1', name: 'maison_commande', args: { appareil: 'climate.voiture_chauffage', action: 'allumer' } });
          W._maisonCmd({ id: 'l1', name: 'maison_commande', args: { appareil: 'light.lumiere_jaune_salon', action: 'eteindre' } });
          W._maisonCmd({ id: 'l2', name: 'maison_commande', args: { appareil: 'light.grande_lumiere_salon', action: 'allumer' } }); }""")
        await attendre(lambda: all(k in conn['resp'] for k in ('v1', 'l1', 'l2')))
        rv, rl1, rl2 = conn['resp'].get('v1', ''), conn['resp'].get('l1', ''), conn['resp'].get('l2', '')
        check('« Éteins les lumières et fais chauffer la voiture » : chauffage de la voiture lancé, pas refusé (09h51:59)', 'OK' in rv and 'Refusé' not in rv, rv)
        check('… les lumières s\'éteignent', 'OK' in rl1, rl1)
        check('… mais « allumer » une lumière dans cette phrase reste refusé, et le refus dit que rien n\'a été fait', 'Refusé, RIEN n' in rl2 and 'ne dis jamais que c\'est fait' in rl2, rl2)
        await page.evaluate("() => { wilson.maison.commande = wilson._m0; wilson._suiviVoiture = wilson._s0; }")

        # ---------- 2. Question de trop : la phrase d'avant dite en entier ----------
        phrase = "Pardon, depuis le téléphone je ne peux pas lancer le chauffage, c'est la tablette du salon qui le fait."
        question = " Tu as besoin d'autre chose maintenant ?"
        d1, pause, d2 = round(len(phrase) * 0.053, 2), 0.35, round(len(question) * 0.053, 2)
        pcm = np.concatenate([voix(d1), np.zeros(int(24000 * pause), np.int16), voix(d2)])
        for nom, ordre in [('texte AVANT le son (le cas du 16/11/26)', 'avant'), ('texte au milieu du son', 'milieu'), ('texte APRÈS tout le son', 'apres')]:
            await page.wait_for_function('!wilson.audio.playing', timeout=15000); await page.wait_for_timeout(1200)
            await page.evaluate("window.__parle(900)"); await page.wait_for_timeout(950)
            conn['ws'].send(json.dumps({'serverContent': {'inputTranscription': {'text': 'Pourquoi la voiture ne chauffait pas ?'}}}))
            n = len(logs); j0 = await page.evaluate('wilson.audio.playedSec')
            txt = {'serverContent': {'outputTranscription': {'text': phrase + question}}}
            if ordre == 'avant': conn['ws'].send(json.dumps(txt))
            if ordre == 'milieu':
                envoi_audio(pcm[:int(24000 * d1 * 0.6)]); conn['ws'].send(json.dumps(txt)); envoi_audio(pcm[int(24000 * d1 * 0.6):])
            else: envoi_audio(pcm)
            if ordre == 'apres': await page.wait_for_timeout(150); conn['ws'].send(json.dumps(txt))
            await page.wait_for_timeout(200)
            conn['ws'].send(json.dumps({'serverContent': {'turnComplete': True}}))
            await page.wait_for_timeout(400)
            joue = (await page.evaluate('wilson.audio.playedSec')) - j0
            coupe = [l for l in logs[n:] if 'Question de trop' in l]
            check(f'Question de trop, {nom} : phrase d\'avant jouée en entier ({d1:.1f} s), question jamais ({joue:.2f} s jouées)',
                  coupe and 'phrase d\'avant dite en entier' in coupe[0] and d1 - 0.05 <= joue <= d1 + pause + 0.1, f'{joue:.2f} s {coupe} {logs[n:][-6:]}')
        # Remarque de Timothée du 25/11/26, 17h16 (« la dernière phrase a été coupée ») : texte de la question reçu quand sa
        # voix la disait déjà → elle n'est plus coupée en plein mot (« Tu as b… »), elle est dite jusqu'au bout.
        await page.wait_for_function('!wilson.audio.playing', timeout=15000); await page.wait_for_timeout(1200)
        await page.evaluate("window.__parle(900)"); await page.wait_for_timeout(950)
        conn['ws'].send(json.dumps({'serverContent': {'inputTranscription': {'text': 'Pourquoi la voiture ne chauffait pas ?'}}}))
        n = len(logs); j0 = await page.evaluate('wilson.audio.playedSec')
        envoi_audio(pcm)
        await page.wait_for_timeout(int((d1 + pause + 0.5) * 1000))     # la question est commencée depuis 0,5 s
        conn['ws'].send(json.dumps({'serverContent': {'outputTranscription': {'text': phrase + question}}}))
        await page.wait_for_timeout(150)
        conn['ws'].send(json.dumps({'serverContent': {'turnComplete': True}}))
        await page.wait_for_timeout(400)
        joue = (await page.evaluate('wilson.audio.playedSec')) - j0
        coupe = [l for l in logs[n:] if 'Question de trop' in l]
        check(f'Question de trop déjà commencée (remarque du 25/11/26, 17h16) : dite jusqu\'au bout, jamais coupée en plein mot ({joue:.2f} s jouées sur {d1 + pause + d2:.2f} s)',
              coupe and 'trop tard pour la couper' in coupe[0] and joue >= d1 + pause + d2 - 0.05, f'{joue:.2f} s {coupe} {logs[n:][-6:]}')
        await page.wait_for_function('!wilson.audio.playing', timeout=15000)

        # Journal du 25/11/26, 20h39:50 : « Allume la grande lumière. » → « C'est allumé. » sans maison_commande (rien d'allumé)
        await page.evaluate("() => { Object.defineProperty(wilson.maison, 'on', { get: () => true, configurable: true }); wilson._toolAt = 0; wilson._maisonForceAt = 0; }")
        await page.wait_for_timeout(1200)
        await page.evaluate("window.__parle(900)"); await page.wait_for_timeout(950)
        n = len(logs); t0 = len(conn['texts'])
        conn['ws'].send(json.dumps({'serverContent': {'inputTranscription': {'text': 'Allume la grande lumière.'}}}))
        envoi_audio(voix(0.8))
        conn['ws'].send(json.dumps({'serverContent': {'outputTranscription': {'text': "C'est allumé."}}}))
        await page.wait_for_timeout(150)
        conn['ws'].send(json.dumps({'serverContent': {'turnComplete': True}}))
        await attendre(lambda: len(conn['texts']) > t0, 3.0)
        force = [x for x in conn['texts'][t0:] if "RIEN n'a été fait dans la maison" in x]
        check('« C\'est allumé » sans aucun outil (25/11/26, 20h39:50) : signalé, et il doit appeler maison_commande pour de bon',
              force and 'maison_commande' in force[0] and 'Allume la grande lumière' in force[0] and any('dit sans avoir rien commandé' in l for l in logs[n:]), f'{conn["texts"][t0:]} {logs[n:][-5:]}')
        # … mais pas quand l'outil a bien été appelé juste avant
        await page.wait_for_function('!wilson.audio.playing', timeout=15000); await page.wait_for_timeout(600)
        await page.evaluate("() => { wilson._toolAt = performance.now(); wilson._maisonForceAt = 0; }")
        await page.evaluate("window.__parle(900)"); await page.wait_for_timeout(950)
        n = len(logs); t0 = len(conn['texts'])
        conn['ws'].send(json.dumps({'serverContent': {'inputTranscription': {'text': 'Éteins la télé.'}}}))
        envoi_audio(voix(0.6))
        conn['ws'].send(json.dumps({'serverContent': {'outputTranscription': {'text': "C'est éteint."}}}))
        await page.wait_for_timeout(150)
        conn['ws'].send(json.dumps({'serverContent': {'turnComplete': True}}))
        await page.wait_for_timeout(800)
        check('… mais rien quand maison_commande vient d\'être appelé', not any("RIEN n'a été fait dans la maison" in x for x in conn['texts'][t0:]) and not any('dit sans avoir rien commandé' in l for l in logs[n:]), str(conn['texts'][t0:]))
        await page.evaluate("() => { delete wilson.maison.on; }")
        await page.wait_for_function('!wilson.audio.playing', timeout=15000)

        # ---------- 3. Sans Home Assistant sur l'appareil : il le dit, sans inventer ----------
        check('Consigne sans Home Assistant : « Depuis ici je ne peux pas, demande-le à la tablette du salon » (09h58:43)', 'Depuis ici je ne peux pas, demande-le à la tablette du salon' in sysi)
        # ---------- 4. « Cherche-moi une idée » n'est pas une idée à noter ----------
        check('Outil idees : « cherche-moi une idée » n\'est pas une idée à noter (10h01:46)', "n'est PAS une idée à noter" in sysi)

        # ---------- 5. Décisions de Timothée du 16/11/26 (12h45) : le doute, Claude pour l'information fiable ----------
        check('Consigne : au moindre doute, UNE question courte avant de répondre ; jamais pour une demande claire', 'Le doute (décision de Timothée du 16/11/26' in sysi and 'UNE seule question courte' in sysi)
        src = await page.evaluate("Promise.all([fetch('./js/app.js').then((r) => r.text()).then((t) => Promise.all([t, ...[...t.matchAll(/from '\\.\\/(app\\/[^']+)'/g)].map((m) => fetch('./js/' + m[1]).then((r) => r.text()))])).then((l) => l.join('\\n')), fetch('./js/claude.js').then((r) => r.text())])")
        check('Claude (question_difficile) pour toute information fiable, même si Gemini croit savoir', 'Toute question qui demande une information FIABLE' in src[1] and 'ne réponds pas de mémoire' in src[0])
        r = await page.evaluate("""() => ({ q: wilson._aDireTexte({ question: 'charge d\\'une paumelle Tectus', dire: 'Question : tu parles de la TE 340 ou de la TE 540 ?', s: 40 }),
          n: wilson._aDireTexte({ question: 'charge Tectus TE 340', dire: 'D\\'après la fiche Simonswerk, 80 kilos.', s: 40 }) })""")
        check('Claude demande une précision (« Question : … ») : Wilson la pose, puis rappelle question_difficile', 'Pose-lui seulement cette question' in r['q'] and 'TE 340 ou de la TE 540' in r['q'] and 'Question :' not in r['q'] and 'rappelle question_difficile' in r['q'], r['q'])
        check('… une vraie réponse reste « J\'ai la réponse à ta question »', "J'ai la réponse à ta question" in r['n'], r['n'])

        # ---------- 6. Une remarque part tout de suite au PC (atelier, relais 10 ; décision du 16/11/26, 14h01) ----------
        r = await page.evaluate("""(async () => {
          const W = wilson, C = W.claude, vus = [];
          Object.defineProperty(C, 'on', { get: () => true, configurable: true });
          const ask0 = C._ask.bind(C);
          W.log('Entendu : « allume la lumière »');
          // 1) script Google pas encore à jour : rien n'est envoyé, la tâche horaire prendra le relais
          C._ask = async (o) => { vus.push(o); return o.action === 'claude_etat' ? { ok: true, pc: { vivant: true } } : { ok: true, accepte: true }; };
          const a = await W.outils.run('remarque', { texte: 'Tu coupes la fin de tes phrases' });
          const nA = vus.filter((o) => o.action === 'claude_demander').length;
          // 2) script à jour, PC présent : envoyé tout de suite, avec le journal
          vus.length = 0;
          C._ask = async (o) => { vus.push(o); return o.action === 'claude_etat' ? { ok: true, pc: { vivant: true }, corrections: true } : { ok: true, accepte: true, pc: { vivant: true } }; };
          const b = await W.outils.run('remarque', { texte: 'Le devis à relancer de la synthèse n\\'est pas le bon' });
          const d = vus.find((o) => o.action === 'claude_demander') || {};
          // 3) PC absent : la correction l'attend
          C._ask = async (o) => o.action === 'claude_etat' ? { ok: true, pc: { vivant: false }, corrections: true } : { ok: true, accepte: true, pc: { vivant: false } };
          const c = await W.outils.run('remarque', { texte: 'Troisième remarque, PC éteint' });
          C._ask = ask0; delete C.on;
          const m = await W.outils.run('mes_remarques', {});
          return { a, nA, b, d, c, m };
        })()""")
        check('Remarque : script Google pas encore à jour → rien n\'envoyé au PC, « ce soir au plus tard » (plus de « compte une heure » sans PC, 26/11/26)', r['nA'] == 0 and 'au plus tard' in r['a'] and 'une heure' not in r['a'], str(r)[:300])
        d = r['d']
        check('Remarque : envoyée tout de suite au PC (type correction), avec le journal des 15 dernières minutes', d.get('type') == 'correction' and 'devis à relancer' in d.get('question', '') and 'Journal de l\'appareil, 15 dernières minutes' in d.get('contexte', '') and 'allume la lumière' in d.get('contexte', ''), str(d)[:300])
        check('… Wilson dit « je lance la correction tout de suite : compte une demi-heure »', 'tout de suite' in r['b'] and 'demi-heure' in r['b'], r['b'])
        check('… PC qui ne répond pas : « la correction partira dès qu\'il répondra, sinon ce soir au plus tard » (26/11/26, 09h24 : « compte une heure » promis, rien fait)', 'dès qu\'il répondra' in r['c'] and 'au plus tard' in r['c'] and 'une heure' not in r['c'], r['c'])
        check('… mes_remarques dit où en est chacune : envoyée au PC, en attente (PC éteint), ce soir au plus tard', "envoyée à l'ordinateur de la maison" in r['m'] and "en attente : l'ordinateur de la maison ne répondait pas" in r['m'] and 'au plus tard' in r['m'], r['m'][-400:])

        await page.evaluate("wilson.__aut0 = wilson._crmAutorise; wilson._crmAutorise = () => ({ ok: true, pourquoi: 'essai' })")   # Timothée reconnu
        # ---------- 7. Remarque inventée (tablette, 19h23:24 : « j'ai une nouvelle remarque » → « visage trop statique ») ----------
        await page.evaluate("""() => { const W = wilson; W._heard.length = 0;
          W._noteHeard('Petite remarque Wilson.', true); W._noteHeard("Oui, c'est ça. Non mais j'ai une nouvelle remarque.", true);
          W._permettre(95000, 'test'); W._tools([{ id: 'rem1', name: 'remarque', args: { texte: 'visage de Wilson trop statique, manque de vie dans les expressions.' } }]); }""")
        await attendre(lambda: 'rem1' in conn['resp'])
        r1 = conn['resp'].get('rem1', '')
        jr = await page.evaluate("JSON.parse(localStorage.getItem('wilson.remarques') || '[]').map((x) => x.texte)")
        check('Remarque que Timothée n\'a pas dite : refusée, Wilson lui demande « c\'est quoi ta remarque ? »', "c'est quoi ta remarque" in r1 and 'Ne note rien' in r1, r1)
        check('… rien n\'est noté (pas de « REMARQUE DE TIMOTHÉE », pas de correction lancée)', not any('statique' in x for x in jr) and not any('REMARQUE DE TIMOTHÉE : visage' in l for l in logs), str(jr)[-200:])
        await page.evaluate("""() => { const W = wilson; W._noteHeard("Tu me coupes la parole à chaque fois que je parle, c'est pénible.", true);
          W._permettre(95000, 'test'); W._tools([{ id: 'rem2', name: 'remarque', args: { texte: 'Timothée se plaint que je lui coupe la parole quand il parle.' } }]); }""")
        await attendre(lambda: 'rem2' in conn['resp'], 12)
        r2 = conn['resp'].get('rem2', '')
        check('… sa vraie remarque, mise au propre avec ses mots, est notée', "C'est noté" in r2, r2)
        v = await page.evaluate("import('./js/voiture.js').then((V) => [V.remarqueInventee('Le visage manque de vie', 'ton visage est un peu figé'), V.remarqueInventee('Phrases coupées', 'ça coupe'), V.remarqueInventee('Le devis à relancer de la synthèse est faux', '')])")
        check('… mots proches acceptés (visage, coupe), remarque trop courte ou rien entendu : pas refusée', v == [False, False, False], str(v))

        # ---------- 8. Seul Timothée fait corriger le programme ; tout l'historique du client (demandes du 16/11/26, soir) ----------
        r = await page.evaluate("""(async () => { const W = wilson, out = {};
          W._noteHeard('Pour la prochaine mise à jour, tu parles trop fort.', true);
          W._crmAutorise = () => ({ ok: false, qui: 'Louis', camera: true, appris: true });
          W._permettre(95000, 'test'); W._tools([{ id: 'rem3', name: 'remarque', args: { texte: 'Wilson parle trop fort.' } }]);
          W._crmAutorise = () => ({ ok: false, qui: '', camera: true, appris: true });
          out.oublie = W._remarqueOubliee("C'est noté pour ma prochaine mise à jour.");
          W._crmAutorise = () => ({ ok: true, pourquoi: 'essai' });
          const { pourGemini } = await import('./js/crm.js');
          out.g = pourGemini('Client : ESSAI\\nÀ SIGNALER à Timothée : à voir au prochain rendez-vous : le nouveau cylindre\\nHistorique des échanges, comptes rendus du plus récent au plus ancien (3 en tout : Visite : 3) :', false);
          out.g2 = pourGemini('Bilan : 41 clients actifs', false);
          return out; })()""")
        await attendre(lambda: 'rem3' in conn['resp'])
        r3 = conn['resp'].get('rem3', '')
        jr = await page.evaluate("JSON.parse(localStorage.getItem('wilson.remarques') || '[]').map((x) => x.texte)")
        check('Remarque de quelqu\'un d\'autre (Louis) : refusée, rien noté, « il n\'y a que Timothée qui peut me faire corriger »', 'REFUSÉ' in r3 and "que Timothée qui peut me faire corriger" in r3 and 'Louis' in r3 and not any('trop fort' in x for x in jr), r3)
        check('… et l\'appli ne la note pas non plus d\'elle-même si ce n\'est pas Timothée', r['oublie'] is False, str(r['oublie']))
        sysi2 = json.dumps(conn['setup'] or {}, ensure_ascii=False)
        check('Consigne : « pour la prochaine mise à jour », « remarque à prendre en compte » → remarque ; seul Timothée', 'seul Timothée peut faire corriger ton programme' in sysi2 and 'remarque à prendre en compte' in sysi2 and 'pour la prochaine mise à jour' in sysi2)
        check('Fiche du client : comptes rendus et historique comptent autant que les chiffres, points « À SIGNALER » dits même sans demande', 'comptent autant que les chiffres' in r['g'] and '« À SIGNALER »' in r['g'] and 'même s\'il ne l\'a pas demandé' in r['g'], r['g'][-400:])
        check('… mais rien de tout ça pour un résultat sans fiche (bilan)', 'SIGNALER' not in r['g2'] and 'comptent autant' not in r['g2'], r['g2'])
        src2 = await page.evaluate("fetch('./js/app.js').then((r) => r.text()).then((t) => Promise.all([t, ...[...t.matchAll(/from '\\.\\/(app\\/[^']+)'/g)].map((m) => fetch('./js/' + m[1]).then((r) => r.text()))])).then((l) => l.join('\\n'))")   # partie « travail » de la consigne : seulement avec le CRM relié
        check('Consigne : « qu\'est-ce qu\'on s\'est dit avec X », « où j\'en suis avec X » → crm_client ; briefing avec comptes rendus et tâches', "on s'est dit la dernière fois" in src2 and 'comptes rendus et derniers échanges, tâches, sujets à voir au rendez-vous' in src2)
        regles = await page.evaluate("import('./js/analyste.js').then(({ reglesCRM }) => reglesCRM({}))")
        check('Analyste et Claude du PC : toute question sur un client regarde aussi comptes rendus, tâches et sujets à voir au RDV', 'Toute question sur un client, pas seulement un briefing' in regles and 'à voir au prochain rendez-vous' in regles)
        crmdesc = await page.evaluate("import('./js/crm.js').then(({ CRM_TOOLS }) => CRM_TOOLS.find((t) => t.name === 'crm_client').description)")
        check('Outil crm_client : historique des visites et des échanges, sujets à signaler', "tout l'historique des visites et des échanges" in crmdesc and 'À SIGNALER' in crmdesc, crmdesc)

        # ---------- 9. Fiche du client relue : après une écriture, et hors de la voiture au-delà d'une heure (16/11/26, 22h) ----------
        r = await page.evaluate("""(async () => { const C = wilson.crm, vus = [], out = {}; let panne = false;
          const ask0 = C.ask; C.cache.clear(); C.last = null; C.dernier = null;
          C.ask = async (o) => { if (panne) { const e = new TypeError('Failed to fetch'); throw e; } vus.push(o);
            return { ok: true, cle: 'k1', societe: 'ESSAI SARL', contact: 'Jean Essai', texte: 'fiche n°' + vus.length, contacts: [{ nom: 'Jean Essai', cle: 'k1' }, { nom: 'Paul Essai', cle: 'k2' }] }; };
          await C.client({ cle: 'k1' }); await C.client({ cle: 'k1' }); out.deux = vus.length;            // relue une seule fois
          C.cache.get('k1').at = Date.now() - 2 * 3600000;
          Object.defineProperty(wilson, 'enVoiture', { get: () => true, configurable: true });
          await C.client({ cle: 'k1' }); out.voiture = vus.length;                                          // en voiture : gardée 6 h
          delete wilson.enVoiture;
          const m = await C.client({ cle: 'k1' }); out.maison = vus.length; out.texte = m.e && m.e.texte;     // à la maison : relue
          C._perimer('k2');                                                                                  // écriture pour Paul, même société
          const f = await C.client({ cle: 'k1' }); out.apres = vus.length; out.frais = vus[vus.length - 1].frais === true; out.perime = !!C.cache.get('k1').perime;
          C._perimer('k1'); panne = true;
          const z = await C.client({ cle: 'k1' }); out.panne = !!(z.ok && z.e && z.vieux);                  // sans réseau : la fiche gardée
          C.ask = ask0; C.cache.clear(); C.last = null; return out; })()""")
        check('Fiche du client : redemandée tout de suite → gardée (pas relue)', r['deux'] == 1, str(r))
        check('… en voiture, une fiche de 2 h sert encore (journée préparée)', r['voiture'] == 1, str(r))
        check('… hors de la voiture, une fiche de plus d\'une heure est relue', r['maison'] == 2 and r['texte'] == 'fiche n°2', str(r))
        check('… après une écriture pour ce client (même par un autre contact) : relue, et le CRM oublie la sienne (« frais »)', r['apres'] == 3 and r['frais'] and not r['perime'], str(r))
        check('… sans réseau : l\'ancienne fiche, avec son heure', r['panne'], str(r))
        srccrm = await page.evaluate("fetch('./js/crm.js').then((r) => r.text())")
        check('… une écriture confirmée (et une écriture envoyée au retour du réseau) rend la fiche à relire', srccrm.count('this._perimer(') >= 2)

        check('Aucune erreur JavaScript', not any(l.startswith('PAGEERROR') for l in logs), str([l for l in logs if l.startswith('PAGEERROR')]))
        await b.close()
    print(f"\n{sum(results)}/{len(results)} vérifications réussies")
    raise SystemExit(0 if all(results) else 1)

asyncio.run(main())
