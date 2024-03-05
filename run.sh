# Start show after a delay, default 5s

export DISPLAY=:0
sleep ${1:-5}s

kill -9 `ps x | grep vlc | awk -- 'FNR == 1 {print $1}'`

vlc -I dummy --extraintf=http --http-password=vlc --fullscreen --loop --video-on-top \
 --no-osd --mouse-hide-timeout=1 --skip-frames \
  /media/alan/*/*.m* >/dev/null &
date > ~/log.txt

kill -9 `ps x | grep server | awk -- 'FNR == 1 {print $1}'`

node server.js 80 &
