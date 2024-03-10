#!/bin/bash
exec 2>&1 1>~/log.txt
date

cd `dirname $BASH_SOURCE`

kill -9 `ps ux | grep git | awk -- '{print $2}'`
git pull &

# Start show after a delay, default 30s
sleep ${1:-30}s

kill -9 `ps ux | grep vlc | awk -- '{print $2}'`
export DISPLAY=:0
vlc -I dummy --extraintf=http --http-password=vlc --fullscreen --loop --video-on-top \
  --no-osd --mouse-hide-timeout=1 --skip-frames \
  /media/alan/*/*.m* >/dev/null &

kill -9 `ps x | grep server | awk -- '{print $2}'`
sudo node server.js 80 &
