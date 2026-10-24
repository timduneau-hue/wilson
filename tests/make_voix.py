"""Voix de synthèse pour tester l'oreille du mode voiture (fixtures/voix/*.wav, 16 kHz, non versionnées).
Il faut espeak-ng et les voix MBROLA françaises : apt-get install espeak-ng mbrola mbrola-fr1 mbrola-fr4
« fr1 » joue Timothée (empreintes + phrases), « fr4 » une autre voix (radio, passagère). Bruit de voiture ajouté à 10 et 5 dB.
python3 make_voix.py"""
import os, subprocess, tempfile
import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly, butter, lfilter

S = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(S, 'fixtures', 'voix'); os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)

def dire(texte, voix='mb-fr1', vitesse=150, hauteur=50):
    with tempfile.NamedTemporaryFile(suffix='.wav') as f:
        subprocess.run(['espeak-ng', '-v', voix, '-s', str(vitesse), '-p', str(hauteur), texte, '-w', f.name], check=True)
        sr, x = wavfile.read(f.name)
    x = x.astype(np.float64) / 32768
    if x.ndim > 1: x = x.mean(axis=1)
    from math import gcd
    g = gcd(16000, sr); x = resample_poly(x, 16000 // g, sr // g)
    return np.concatenate([np.zeros(4000), x * 0.7, np.zeros(8000)])     # 0,25 s avant, 0,5 s après

def bruit_voiture(n):
    b, a = butter(2, 250 / 8000)
    grave = lfilter(b, a, rng.standard_normal(n)) * 6
    return grave + rng.standard_normal(n) * 0.15

def avec_bruit(x, snr):
    nz = bruit_voiture(len(x))
    p = np.mean(x[np.abs(x) > 0.01] ** 2) if np.any(np.abs(x) > 0.01) else 1e-6
    nz *= np.sqrt(p / (np.mean(nz ** 2) * 10 ** (snr / 10)))
    return x + nz

def ecrire(nom, x):
    wavfile.write(os.path.join(OUT, nom + '.wav'), 16000, (np.clip(x, -1, 1) * 32767).astype(np.int16))

# Empreintes : 5 fois « Wilson », un peu différents
for i, (v, h) in enumerate([(135, 48), (150, 52), (165, 50), (145, 56), (158, 45)]):
    ecrire(f'nom_{i}', dire('Wilson', vitesse=v, hauteur=h))
ecrire('calib_sans_nom', dire('Je vais chez un client à Cholet.', vitesse=150))

POS = ['Wilson, qui je vois demain ?', 'Wilson, appelle Gaudin.', "Wilson, c'est quoi mon chiffre ce mois-ci ?", 'Wilson ?',
       'Wilson, note que je dois rappeler Dupont jeudi.']
NEG = ['Je vais chez un client à Cholet.', 'Nelson est arrivé ce matin.', "Il fait beau aujourd'hui.", 'Bonjour Vincent, ça va ?',
       'Le gilet est dans le coffre.', 'Wilfried a appelé hier.', 'Tu as pensé au devis ?', "C'est quoi ce bruit dans la voiture ?"]
for i, t in enumerate(POS):
    for v, h, snr in [(140, 50, None), (170, 47, 10), (155, 54, 5)]:
        x = dire(t, vitesse=v, hauteur=h)
        ecrire(f'pos_{i}_{v}' + (f'_snr{snr}' if snr else ''), avec_bruit(x, snr) if snr else x)
for i, t in enumerate(NEG):
    for v, snr in [(150, None), (165, 10)]:
        x = dire(t, vitesse=v)
        ecrire(f'neg_{i}_{v}' + (f'_snr{snr}' if snr else ''), avec_bruit(x, snr) if snr else x)
# Une autre voix (radio, passagère) : phrases sans le nom
for i, t in enumerate(['Les informations de midi.', 'Il fait beau sur toute la région.', 'Nelson Monfort commente la course.']):
    ecrire(f'autre_{i}', dire(t, voix='mb-fr4', vitesse=160))
# Une longue phrase avec le nom au début, pour le flux (test « en continu »)
ecrire('flux', np.concatenate([dire('Il fait beau aujourd\'hui.'), np.zeros(8000), dire('Wilson, qui je vois demain ?', vitesse=150, hauteur=51), np.zeros(8000)]))
# Micro simulé de la voiture (test de bout en bout) : « Il fait beau » puis « Wilson, qui je vois demain ? », en boucle
z = lambda s: np.zeros(int(16000 * s))
ecrire('voiture_micro', np.concatenate([z(2.5), dire("Il fait beau aujourd'hui.", vitesse=150), z(2.0), dire('Wilson, qui je vois demain ?', vitesse=150, hauteur=51), z(9)]))
print(len(os.listdir(OUT)), 'fichiers dans', OUT)
