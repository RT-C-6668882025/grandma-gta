#!/bin/bash
# 批量减面：tools/decimate-all.sh 输出目录 名字:面数 ...（源文件在 assets/raw/tripo-hd/名字.glb）
B=/Applications/Blender.app/Contents/MacOS/Blender
out=$1; shift; mkdir -p "$out"
tmp=$(mktemp -d)
for spec in "$@"; do
  n=${spec%%:*}; t=${spec##*:}
  $B -b -P tools/decimate.py -- assets/raw/tripo-hd/$n.glb $tmp/$n.glb $t 2>&1 | grep DECIMATE
  python3 tools/glb-shrink.py $tmp/$n.glb "$out/$n.glb" ${SIZE:-1024}
done
rm -rf "$tmp"
