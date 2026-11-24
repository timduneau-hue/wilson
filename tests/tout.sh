#!/usr/bin/env bash
# Lance les tests de Wilson en une commande (voir README.md de ce dossier).
#   tests/tout.sh                       → tous les tests (e2e_*.py puis *_unit.mjs et apps_script_unit.js)
#   tests/tout.sh e2e_crm.py qui_unit.mjs → seulement ceux-là
#   LENTS=1 tests/tout.sh               → ajoute e2e_famille_modeles.py (vrais modèles, lent)
# L'appli doit être servie : python3 -m http.server 8765 --bind 127.0.0.1 (à la racine du dépôt).
# Résumé à la fin ; code de sortie 1 si au moins un test échoue.
cd "$(dirname "$0")" || exit 1

if ! (exec 3<>/dev/tcp/127.0.0.1/8765) 2>/dev/null; then
  echo "L'appli n'est pas servie sur le port 8765 : lancer d'abord, à la racine du dépôt :"
  echo "  python3 -m http.server 8765 --bind 127.0.0.1 &"
  exit 1
fi

if [ $# -gt 0 ]; then
  tests=("$@")
else
  tests=()
  for t in e2e*.py stream_unit.py; do
    [ "$t" = e2e_famille_modeles.py ] && [ -z "$LENTS" ] && continue
    tests+=("$t")
  done
  tests+=(*_unit.mjs apps_script_unit.js)
fi

ok=(); ko=()
for t in "${tests[@]}"; do
  echo "=== $t"
  case "$t" in
    *.py) python3 "$t" ;;
    *) node "$t" ;;
  esac && ok+=("$t") || ko+=("$t")
done

echo
echo "Réussis : ${#ok[@]} / ${#tests[@]}"
if [ ${#ko[@]} -gt 0 ]; then
  echo "En échec : ${ko[*]}"
  echo "(e2e_gaze.py, e2e_vision_health.py, e2e_famille_modeles.py : sans carte graphique, comparer avec main ;"
  echo " oreille_unit.mjs : il faut d'abord python3 make_voix.py)"
  exit 1
fi
