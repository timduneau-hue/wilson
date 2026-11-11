# Wilson pour Android

Coque Android de Wilson (PLAN.md, section 9) : la page https://timduneau-hue.github.io/wilson/ en plein écran, qui garde le
micro quand Google Maps est devant, lance le guidage directement dans Android Auto et revient toute seule à l'écran.

- Installer : https://github.com/timduneau-hue/wilson/releases/latest/download/wilson.apk
- Construite et publiée par GitHub Actions (`.github/workflows/android.yml`) à chaque changement de ce dossier.
- Signée avec `wilson.keystore`, qui n'est plus dans le dépôt : il est lu depuis le secret `WILSON_KEYSTORE_B64` (fichier encodé en base64), mot de passe dans le secret `WILSON_CLE`.
