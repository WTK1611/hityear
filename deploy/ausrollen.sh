#!/usr/bin/env bash
# Rollt den Bereich „party-music“ (HitYear) auf einen eigenen Server aus –
# eigenständig unter /opt/party-music, getrennt von anderen Diensten.
#
#   ZEITSTRAHL_SSH=root@<server> ./deploy/ausrollen.sh
#
# Legt beim ersten Mal /opt/party-music samt .env mit zufälligen Passwörtern an
# (werden NICHT angezeigt), baut das Image und startet den Container.
# Übertragen wird per `git archive | ssh` – der Server braucht keinen GitHub-Zugang.
# Fremde Bereiche fasst das Skript NICHT an. Sind 80/443 frei, startet es den
# eigenen Caddy (Profil eigener-proxy); sonst zeigt es den Block für den vorhandenen Proxy.
set -euo pipefail

ZIEL="${ZEITSTRAHL_SSH:-${1:-}}"
DIR="${ZEITSTRAHL_DIR:-/opt/party-music}"
DOMAIN="${PARTY_MUSIC_DOMAIN:-${ZEITSTRAHL_DOMAIN:-}}"
if [[ -z "$ZIEL" ]]; then
  echo "Bitte Ziel angeben: ZEITSTRAHL_SSH=root@<host> $0" >&2
  exit 1
fi
HIER="$(cd "$(dirname "$0")/.." && pwd)"

echo "→ Ziel: $ZIEL:$DIR"
ssh "$ZIEL" "mkdir -p '$DIR/musik' '$DIR/charts' && command -v docker >/dev/null || { echo 'Docker fehlt auf dem Server'; exit 1; }"

echo "→ Dateien übertragen (git archive über SSH – ohne GitHub auf dem Server)"
# Ausgeliefert wird genau der committete Stand (HEAD) dieses Ordners.
if [[ -n "$(git -C "$HIER" status --porcelain -- . 2>/dev/null)" ]]; then
  echo "  Hinweis: Es gibt nicht committete Änderungen – ausgeliefert wird HEAD." >&2
fi
PREFIX="$(git -C "$HIER" rev-parse --show-prefix)"
TOP="$(git -C "$HIER" rev-parse --show-toplevel)"
STAND="$(git -C "$HIER" rev-parse --short HEAD)"
# laufende Nummer für die Version (1.<Anzahl Commits>), steigt mit jedem Update
NUMMER="$(git -C "$HIER" rev-list --count HEAD)"
# vom Repo-Wurzelordner aus (aus einem Unterordner wäre das Archiv leer)
git -C "$TOP" archive --format=tar "HEAD${PREFIX:+:${PREFIX%/}}" \
  | gzip -c \
  | ssh "$ZIEL" "set -e; rm -rf '$DIR/app.neu'; mkdir -p '$DIR/app.neu'; tar xzf - -C '$DIR/app.neu' \
      --anchored --exclude=test --exclude=docs --exclude=musik; \
      cp '$DIR/app.neu/deploy/docker-compose.yml' '$DIR/docker-compose.yml'; \
      echo '$NUMMER $STAND' > '$DIR/app.neu/STAND'; rm -rf '$DIR/app.alt'; \
      [ -d '$DIR/app' ] && mv '$DIR/app' '$DIR/app.alt'; mv '$DIR/app.neu' '$DIR/app'"
echo "  Stand $STAND übertragen (vorheriger Stand liegt in $DIR/app.alt)."

echo "→ .env prüfen / anlegen"
ssh "$ZIEL" DIR="$DIR" DOMAIN="$DOMAIN" bash -s <<'REMOTE'
set -euo pipefail
cd "$DIR"
if [[ ! -f .env ]]; then
  umask 077
  # ohne „tr | head“: das bricht unter pipefail mit SIGPIPE ab
  pw() { local x; x="$(openssl rand -base64 64 | tr -dc 'a-km-zA-HJ-NP-Z2-9')"; printf '%s' "${x:0:$1}"; }
  SPIELER="$(pw 14)"
  ADMIN="$(pw 16)"
  {
    echo "ZEITSTRAHL_BASIS_URL=${DOMAIN:+https://$DOMAIN}"
    echo "PARTY_MUSIC_DOMAIN=$DOMAIN"
    echo "ZEITSTRAHL_PASSWORT=$SPIELER"
    echo "ZEITSTRAHL_ADMIN_PASSWORT=$ADMIN"
    echo "ZEITSTRAHL_SECRET=$(openssl rand -hex 32)"
    echo "ZEITSTRAHL_MB_KONTAKT="
    echo "ZEITSTRAHL_LOUDNORM=1"
    echo "ZEITSTRAHL_PORT=3700"
    if [[ -z "$DOMAIN" ]]; then
      # IP-Betrieb ohne Domain/Proxy: direkt auf http://<IP>:3700 erreichbar
      echo "ZEITSTRAHL_BIND=0.0.0.0"
      echo "ZEITSTRAHL_PROXY=0"
    fi
  } > .env
  echo "  .env mit zufälligen Passwörtern angelegt (nicht ausgegeben, damit sie in keinem Log landen)."
  echo "  Selbst nachsehen: ssh <host> \"grep PASSWORT $DIR/.env\""
fi
REMOTE

echo "→ Bauen und starten"
# Eigener Caddy nur, wenn eine Domain gesetzt ist und 80/443 frei sind (oder schon unserer läuft)
PROFIL=$(ssh "$ZIEL" "cd '$DIR'; D=\$(grep -E '^PARTY_MUSIC_DOMAIN=.' .env | cut -d= -f2); \
  if [ -n \"\$D\" ] && { docker ps --format '{{.Names}}' | grep -qx party-music-caddy || ! ss -ltn '( sport = :443 or sport = :80 )' | grep -q LISTEN; }; then echo '--profile eigener-proxy'; fi")
ssh "$ZIEL" "cd '$DIR' && docker compose $PROFIL up -d --build && docker image prune -f >/dev/null"
[[ -n "$PROFIL" ]] && echo "  Eigener Caddy aktiv (HTTPS für die Domain aus .env)." || echo "  Ohne eigenen Proxy gestartet (80/443 belegt oder keine Domain)."

echo "→ Gesundheitscheck"
for i in $(seq 1 20); do
  if ssh "$ZIEL" "curl -fsS http://127.0.0.1:\$(grep -E '^ZEITSTRAHL_PORT=' '$DIR/.env' | cut -d= -f2 || echo 3700)/healthz" 2>/dev/null; then
    echo
    break
  fi
  sleep 2
  [[ $i == 20 ]] && { echo "Container antwortet nicht – Logs: ssh $ZIEL 'docker logs party-music'"; exit 1; }
done

if ssh "$ZIEL" "grep -qx 'ZEITSTRAHL_BIND=0.0.0.0' '$DIR/.env'"; then
  IP=$(ssh "$ZIEL" "curl -4fsS https://ifconfig.me 2>/dev/null || hostname -I | cut -d' ' -f1")
  PORT=$(ssh "$ZIEL" "grep -E '^ZEITSTRAHL_PORT=' '$DIR/.env' | cut -d= -f2")
  echo "→ IP-Betrieb ohne Domain: http://$IP:${PORT:-3700}  (Admin: /admin.html)"
  echo "  Falls nicht erreichbar: Firewall/Paketfilter des Hosters für TCP ${PORT:-3700} prüfen."
fi

echo "→ Reverse-Proxy erkennen"
ssh "$ZIEL" 'docker ps --format "{{.Names}} {{.Image}} {{.Ports}}" | grep -Ei "caddy|nginx|traefik" || true; systemctl is-active caddy nginx 2>/dev/null | paste -sd" " - || true'
cat <<EOF

Fertig.
Für den Zugriff von außen den passenden Block aus
  deploy/proxy/  (Caddyfile.snippet oder nginx.conf)
in den vorhandenen Proxy übernehmen und einen DNS-Eintrag für die Subdomain setzen.
Musik übertragen:  ZEITSTRAHL_SSH=$ZIEL ./deploy/musik-sync.sh ~/Music/Zeitstrahl
EOF
