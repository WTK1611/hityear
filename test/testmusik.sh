#!/bin/sh
# Erzeugt eine kleine Test-Bibliothek aus Sinustönen (keine echte Musik):
# MP3 mit ID3-Tags, jeder dritte Song als M4A mit Cover und Liedtext-Tag.
# Aufruf: sh test/testmusik.sh [Zielordner]   (Standard: ./musik)
set -eu
ZIEL="${1:-musik}"
mkdir -p "$ZIEL"
TMP="$(mktemp -d)"
i=0
for jahr in 1962 1968 1971 1977 1979 1983 1985 1986 1989 1991 1994 1997 1999 2002 2005 2008 2011 2014 2017 2020 2023; do
  i=$((i + 1))
  if [ $((i % 3)) -eq 0 ]; then
    f="$ZIEL/testsong-$jahr.m4a"
    [ -f "$f" ] && continue
    ffmpeg -hide_banner -loglevel error -y -f lavfi -i "gradients=s=400x400:seed=$i:d=1" -frames:v 1 "$TMP/c.png"
    ffmpeg -hide_banner -loglevel error -y \
      -f lavfi -i "sine=frequency=$((200 + i * 30)):duration=75" -i "$TMP/c.png" -map 0 -map 1 \
      -metadata title="Testsong $i" -metadata artist="Testband $i" -metadata album="Probe $jahr" -metadata date="$jahr" \
      -metadata lyrics="Das ist Zeile eins von Testsong $i
Und hier kommt Zeile zwei
La la la, der Refrain" \
      -c:a aac -b:a 96k -c:v png -disposition:v attached_pic "$f"
  else
    f="$ZIEL/testsong-$jahr.mp3"
    [ -f "$f" ] && continue
    ffmpeg -hide_banner -loglevel error -y \
      -f lavfi -i "sine=frequency=$((200 + i * 30)):duration=75" \
      -metadata title="Testsong $i" -metadata artist="Testband $i" -metadata album="Probe" -metadata date="$jahr" \
      -c:a libmp3lame -b:a 96k "$f"
  fi
done
rm -rf "$TMP"
echo "Testmusik in $ZIEL: $(ls "$ZIEL" | wc -l) Dateien"
