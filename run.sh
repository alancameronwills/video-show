#!/bin/bash
exec 2>&1 1>~/log.txt
date

cd `dirname $BASH_SOURCE`

kill -9 `ps x | grep git | awk -- 'FNR == 1 {print $1}'`
git pull &

# Start show after a delay, default 30s
sleep ${1:-30}s

kill -9 `ps x | grep vlc | awk -- 'FNR == 1 {print $1}'`
export DISPLAY=:0
vlc -I dummy --extraintf=http --http-password=vlc --fullscreen --loop --video-on-top \
  --no-osd --mouse-hide-timeout=1 --skip-frames \
  --alsa-audio-device hw:1,0 \
  /media/alan/*/*.m* >/dev/null &

kill -9 `ps x | grep server | awk -- 'FNR == 1 {print $1}'`
sudo node server.js 80 &
