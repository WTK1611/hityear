#!/usr/bin/env bash
# Überträgt die eigene Musiksammlung (MP3/M4A/FLAC …) vom Mac auf den VPS und
# lässt Zeitstrahl neu einlesen (inkrementell, nur geänderte Dateien).
#
#   ZEITSTRAHL_SSH=root@<server> ./deploy/musik-sync.sh ~/Music/Zeitstrahl
#
# --delete: Was lokal fehlt, wird auch auf dem Server entfernt.
set -euo pipefail
ZIEL="${ZEITSTRAHL_SSH:?ZEITSTRAHL_SSH=root@<host> setzen}"
DIR="${ZEITSTRAHL_DIR:-/opt/party-music}"
QUELLE="${1:?Musikordner angeben, z. B. ~/Music/Zeitstrahl}"
[[ -d "$QUELLE" ]] || { echo "Ordner $QUELLE gibt es nicht" >&2; exit 1; }

rsync -av --delete --prune-empty-dirs \
  --include '*/' \
  --include '*.mp3' --include '*.m4a' --include '*.mp4' --include '*.aac' \
  --include '*.flac' --include '*.ogg' --include '*.opus' \
  --exclude '*' \
  "${QUELLE%/}/" "$ZIEL:$DIR/musik/"

# Neustart löst den inkrementellen Scan aus (laufende Spiele bleiben gespeichert).
ssh "$ZIEL" "docker restart party-music >/dev/null && echo 'Zeitstrahl liest die Bibliothek neu ein.'"
