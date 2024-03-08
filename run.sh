#!/bin/bash
exec 2>&1 1>~/log.txt
date

cd `dirname $BASH_SOURCE`


if [ "x$1" -ne "x0" ] 
then
  # Start show after a delay, default 30s
  sleep ${1:-30}s
  
  kill -9 `ps x | grep git | awk '{print $1}'`
  git pull &

  sleep 20s
fi

kill -9 `ps x | grep vlc | awk '{print $1}'`
export DISPLAY=:0
vlc -I dummy --extraintf=http --http-password=vlc --fullscreen --loop --video-on-top \
 --no-osd --mouse-hide-timeout=1 --skip-frames \
  /media/alan/*/*.m* >/dev/null &

sudo kill -9 `ps aux | grep server | awk '{print $2}'`
sudo node server.js 80 &
