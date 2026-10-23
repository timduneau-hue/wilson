#!/bin/sh
# Fausses vidéos de caméra (.y4m, 27 Mo chacune, non versionnées) fabriquées à partir des photos de fixtures/.
cd "$(dirname "$0")/fixtures" || exit 1
for n in pos pos_far neg_turned neg_down empty; do
  [ -f "$n.y4m" ] || ffmpeg -loglevel error -y -loop 1 -i "$n.png" -t 2 -r 10 -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" -pix_fmt yuv420p "$n.y4m"
done
ls -la *.y4m
