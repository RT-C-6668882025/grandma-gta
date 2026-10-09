#!/bin/zsh
# Wait for every Tripo task in assets/raw/task-*.json, download its GLB, and
# write a texture-shrunk copy into assets/{chars,animals,gear,props}/.
cd "$(dirname $0)/.."
CHARS=(qipao agong son shopkeeper thug police auntie farmer)
ANIMALS=(dog cat rooster)
GEAR=(golfclub cashbag bag trophy sunglasses stick bat slipper newspaper radio)
for f in assets/raw/task-*.json; do
  name=${${f:t:r}#task-}
  if (( ${CHARS[(Ie)$name]} )); then cat=chars; size=1024
  elif (( ${ANIMALS[(Ie)$name]} )); then cat=animals; size=1024
  elif (( ${GEAR[(Ie)$name]} )); then cat=gear; size=512
  else cat=props; size=1024; fi
  [ "$name" = temple ] && size=2048
  [ -f assets/$cat/$name.glb ] && continue
  tid=$(python3 -c "import json;print(json.load(open('$f'))['data']['tasks'][0]['task_id'])" 2>/dev/null) || { echo "$name: no task"; continue; }
  (
    dir=assets/raw/$cat/$name
    for i in 1 2 3 4; do combos asset get --task $tid --wait --wait-timeout 90m --quiet --json --output $dir > assets/raw/done-$name.json 2>&1 && break; sleep 20; done
    glb=$(ls $dir/*.glb 2>/dev/null | head -1)
    if [ -n "$glb" ]; then mkdir -p assets/$cat; python3 tools/glb-shrink.py $glb assets/$cat/$name.glb $size > /dev/null; echo "$(date +%T) $name -> assets/$cat"; else echo "$(date +%T) $name FAILED: $(head -c 300 assets/raw/done-$name.json)"; fi
  ) &
done
wait
echo ALL DONE
