# Wilson — installe le relais Claude sur le PC de la maison (PLAN.md, section 10, K9).
# À lancer dans PowerShell (pas besoin d'être administrateur), avec l'adresse du script de Wilson :
#   $env:WILSON_SCRIPT='https://script.google.com/macros/s/…/exec'; irm https://raw.githubusercontent.com/timduneau-hue/wilson/main/pc/installer.ps1 | iex
# Ce qu'il fait : Node.js si absent, Claude Code, connexion à ton compte Claude (une fois, dans le navigateur), le relais dans
# %USERPROFILE%\WilsonRelais, démarrage tout seul à l'ouverture de session (fenêtre cachée), PC jamais en veille sur secteur.
# Relancer la même ligne met le relais à jour (le secret du PC est gardé).

[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Continue'   # Windows PowerShell 5.1 : « Stop » ferait échouer les programmes qui écrivent sur stderr ; les erreurs graves sont levées à la main
$depot = 'https://raw.githubusercontent.com/timduneau-hue/wilson/main/pc'
$dir = Join-Path $env:USERPROFILE 'WilsonRelais'
function Etape($t) { Write-Host ''; Write-Host "== $t" -ForegroundColor Cyan }
function Ok($t) { Write-Host "   ✓ $t" -ForegroundColor Green }
function Ecrire($chemin, $texte) { [IO.File]::WriteAllText($chemin, $texte, (New-Object Text.UTF8Encoding $false)) }   # sans BOM (Node le refuse)
function RafraichirPath { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + (Join-Path $env:USERPROFILE '.local\bin') }

Write-Host 'Wilson : installation du relais Claude (questions difficiles)' -ForegroundColor Yellow

$script = $env:WILSON_SCRIPT
if (-not $script -or $script -notmatch '^https://script\.google\.com/macros/s/[\w-]+/exec(\?k=[\w-]{24,})?$') {
  $script = (Read-Host "Colle l'adresse du script de Wilson avec sa clé (lien donné par « lienQR » dans l'éditeur : …/exec?k=…)").Trim()
}
if ($script -notmatch '^https://script\.google\.com/macros/s/[\w-]+/exec(\?k=[\w-]{24,})?$') { throw "Adresse du script invalide : $script" }

Etape '1/7 Dossier du relais'
New-Item -ItemType Directory -Force -Path $dir, (Join-Path $dir 'travail') -ErrorAction Stop | Out-Null
Ok $dir

Etape '2/7 Node.js'
RafraichirPath
$node = Get-Command node -ErrorAction SilentlyContinue
$majeur = 0; if ($node) { $majeur = [int](& node -p "process.versions.node.split('.')[0]") }
if ($majeur -lt 18) {
  Write-Host '   Installation de Node.js (LTS)…'
  winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements | Out-Host
  RafraichirPath
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { throw "Node.js ne s'est pas installé : installe-le depuis https://nodejs.org puis relance cette ligne." }
}
$nodeExe = (Get-Command node).Source
Ok "Node $(& node -v) ($nodeExe)"

Etape '3/7 Claude Code'
$claude = Join-Path $env:USERPROFILE '.local\bin\claude.exe'
if (-not (Test-Path $claude)) {
  Write-Host '   Installation de Claude Code…'
  Invoke-RestMethod https://claude.ai/install.ps1 -ErrorAction Stop | Invoke-Expression
  RafraichirPath
}
if (-not (Test-Path $claude)) { $c = Get-Command claude -ErrorAction SilentlyContinue; if ($c) { $claude = $c.Source } else { throw "Claude Code ne s'est pas installé." } }
Ok "$(& $claude --version)"

Etape '4/7 Fichiers du relais'
foreach ($f in 'relais.mjs', 'crm-mcp.mjs', 'consigne.md') {
  Invoke-WebRequest "$depot/$f" -OutFile (Join-Path $dir $f) -UseBasicParsing -ErrorAction Stop
}
$cfgChemin = Join-Path $dir 'config.json'
$secret = $null
if (Test-Path $cfgChemin) { try { $secret = (Get-Content $cfgChemin -Raw | ConvertFrom-Json).secret } catch {} }
if (-not $secret) {
  $b = New-Object byte[] 30; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  $secret = ([Convert]::ToBase64String($b) -replace '[+/=]', '')
}
Ecrire $cfgChemin (@{ script = $script; secret = $secret; claude = $claude; modele = 'sonnet' } | ConvertTo-Json)
Ecrire (Join-Path $dir 'mcp.json') (@{ mcpServers = @{ crm = @{ type = 'stdio'; command = $nodeExe; args = @((Join-Path $dir 'crm-mcp.mjs')) } } } | ConvertTo-Json -Depth 6)
Ecrire (Join-Path $dir 'boucle.cmd') "@echo off`r`ncd /d `"%~dp0`"`r`n:debut`r`n`"$nodeExe`" relais.mjs >> relais-sortie.log 2>&1`r`nif errorlevel 3 exit /b`r`ntimeout /t 15 /nobreak >nul`r`ngoto debut`r`n"
Ecrire (Join-Path $dir 'demarrer.vbs') "Set s = CreateObject(`"WScript.Shell`")`r`ns.Run `"cmd /c `"`"$dir\boucle.cmd`"`"`", 0, False`r`n"
Ok 'relais, accès CRM en lecture seule, consigne'

Etape '5/7 Connexion à ton compte Claude'
& $claude auth status *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "   Une page va s'ouvrir dans ton navigateur : connecte-toi à ton compte Claude et clique sur « Autoriser »." -ForegroundColor Yellow
  & $claude auth login
  & $claude auth status *> $null
  if ($LASTEXITCODE -ne 0) { throw "La connexion à Claude n'a pas abouti : relance cette ligne." }
}
Ok 'connecté (abonnement Claude, aucune clé payante)'

Etape '6/7 Toujours prêt : démarrage automatique et pas de mise en veille sur secteur'
$demarrage = [Environment]::GetFolderPath('Startup')
Copy-Item (Join-Path $dir 'demarrer.vbs') (Join-Path $demarrage 'Wilson relais Claude.vbs') -Force
Ok "démarre tout seul à l'ouverture de session"
try {
  powercfg /change standby-timeout-ac 0 | Out-Null
  powercfg /change hibernate-timeout-ac 0 | Out-Null
  powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0 | Out-Null   # écran rabattu, sur secteur : ne rien faire
  powercfg /setactive SCHEME_CURRENT | Out-Null
  Ok 'sur secteur : jamais en veille (écran rabattu compris) ; sur batterie : inchangé'
} catch { Write-Host "   (réglage de la veille impossible : $($_.Exception.Message))" -ForegroundColor DarkYellow }

Etape '7/7 Démarrage et essai'
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'relais\.mjs' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Start-Process wscript.exe -ArgumentList "`"$(Join-Path $dir 'demarrer.vbs')`""
$vu = $false
for ($i = 0; $i -lt 20 -and -not $vu; $i++) {
  Start-Sleep -Seconds 3
  try { $r = Invoke-RestMethod -Method Post -Uri $script -ContentType 'text/plain;charset=utf-8' -Body (@{ action = 'claude_etat'; secret = $secret } | ConvertTo-Json -Compress); $vu = [bool]$r.pc.vivant } catch {}
}
if ($vu) { Ok 'Wilson voit le PC' } else { Write-Host "   Wilson ne voit pas encore le PC : regarde $dir\relais.log" -ForegroundColor Red }
Write-Host '   Essai de Claude (une minute environ)…'
& $nodeExe (Join-Path $dir 'relais.mjs') --essai "Quelle est la charge maximale d'une paumelle invisible Simonswerk Tectus TE 340 3D, d'après la fiche du fabricant ?"
Write-Host ''
Write-Host "C'est prêt. Pose une question difficile à Wilson (référence, comparaison de fiches techniques, question sur ton CRM)." -ForegroundColor Yellow
