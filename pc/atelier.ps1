# Wilson — installe « l'atelier » sur le PC de la maison (relais 10, décision de Timothée du 16/11/26) : une remarque faite à
# Wilson est corrigée tout de suite par Claude sur ce PC, qui teste puis ouvre la demande de modification sur GitHub.
# À lancer dans PowerShell, APRÈS installer.ps1 (le relais doit déjà tourner) :
#   irm https://raw.githubusercontent.com/timduneau-hue/wilson/main/pc/atelier.ps1 | iex
# Ce qu'il fait : Git, GitHub CLI et Python si absents ; Playwright et Chromium (pour les tests de Wilson) ; connexion à TON
# compte GitHub (une fois, dans le navigateur, avec ta passkey) ; le relais 10 et sa consigne ; redémarrage du relais ; essai.
# Relancer la même ligne ne casse rien (ce qui est déjà là est gardé).

[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Continue'
$depot = 'https://raw.githubusercontent.com/timduneau-hue/wilson/main/pc'
$dir = Join-Path $env:USERPROFILE 'WilsonRelais'
function Etape($t) { Write-Host ''; Write-Host "== $t" -ForegroundColor Cyan }
function Ok($t) { Write-Host "   ✓ $t" -ForegroundColor Green }
function RafraichirPath { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + (Join-Path $env:USERPROFILE '.local\bin') }
function Present($commande) {
  # « python » peut n'être qu'un raccourci vers le Microsoft Store : on vérifie qu'il répond vraiment
  if (-not (Get-Command $commande -ErrorAction SilentlyContinue)) { return $false }
  $v = (& $commande --version 2>&1 | Out-String); return ($LASTEXITCODE -eq 0 -and $v -match '\d+\.\d+')
}
function Installer($id, $commande, $nom) {
  RafraichirPath
  if (Present $commande) { Ok "$nom déjà là"; return }
  Write-Host "   Installation de $nom…"
  winget install --id $id -e --silent --accept-package-agreements --accept-source-agreements | Out-Host
  RafraichirPath
  if (-not (Present $commande)) { throw "$nom ne s'est pas installé : redémarre le PC puis relance cette ligne." }
  Ok "$nom installé"
}

Write-Host "Wilson : installation de l'atelier (corrections automatiques)" -ForegroundColor Yellow
if (-not (Test-Path (Join-Path $dir 'config.json'))) { throw "Le relais n'est pas installé dans $dir : lance d'abord installer.ps1." }

Etape '1/6 Git, GitHub CLI et Python'
Installer 'Git.Git' 'git' 'Git'
Installer 'GitHub.cli' 'gh' 'GitHub CLI'
Installer 'Python.Python.3.12' 'python' 'Python 3.12'

Etape '2/6 Outils de test de Wilson (Playwright, Chromium, numpy)'
& python -m pip install --user --quiet --disable-pip-version-check playwright numpy | Out-Host
& python -m playwright install chromium | Out-Host
& python -c "import playwright, numpy; print('ok')" *> $null
if ($LASTEXITCODE -ne 0) { throw "Playwright ou numpy ne s'est pas installé." }
Ok 'Playwright, Chromium et numpy'

Etape '3/6 Connexion à ton compte GitHub'
& gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "   Une page va s'ouvrir : connecte-toi à GitHub (avec ta passkey, ton empreinte), puis colle le code affiché ici." -ForegroundColor Yellow
  & gh auth login --hostname github.com --git-protocol https --web --scopes repo
  & gh auth status *> $null
  if ($LASTEXITCODE -ne 0) { throw "La connexion à GitHub n'a pas abouti : relance cette ligne." }
}
& gh auth setup-git | Out-Null
Ok "connecté à GitHub ($((& gh api user --jq .login) 2>$null))"

Etape '4/6 Relais 10 et consigne de l''atelier'
foreach ($f in 'relais.mjs', 'consigne-correction.md') {
  Invoke-WebRequest "$depot/$f" -OutFile (Join-Path $dir $f) -UseBasicParsing -ErrorAction Stop
}
New-Item -ItemType Directory -Force -Path (Join-Path $dir 'atelier') | Out-Null
Ok 'relais 10, consigne-correction.md, dossier atelier'

Etape '5/6 Redémarrage du relais'
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'relais\.mjs' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Start-Process wscript.exe -ArgumentList "`"$(Join-Path $dir 'demarrer.vbs')`""
Ok 'relancé (fenêtre cachée)'

Etape '6/6 Essai : cloner Wilson et le CRM dans l''atelier'
$atelier = Join-Path $dir 'atelier'
foreach ($d in 'wilson', 'crm-boschat') {
  $c = Join-Path $atelier $d
  if (-not (Test-Path (Join-Path $c '.git'))) { & gh repo clone "timduneau-hue/$d" $c -- --depth 50 | Out-Host }
  if (Test-Path (Join-Path $c '.git')) { Ok "$d cloné" } else { Write-Host "   $d : clonage impossible" -ForegroundColor Red }
}
Write-Host ''
Write-Host "C'est prêt. Dis à Wilson : « petite remarque : … » ; il te répondra que la correction est lancée, et tu recevras un e-mail." -ForegroundColor Yellow
